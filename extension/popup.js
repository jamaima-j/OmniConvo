// popup.js
console.log("popup.js loaded");

function showBusy(isBusy) {
  const btn = document.getElementById("sharePublic");
  const loader = document.getElementById("sharePublicLoader");
  if (!btn || !loader) return;
  loader.style.display = isBusy ? "flex" : "none";
  btn.style.display = isBusy ? "none" : "flex";
}

async function injectIntoActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tabId = tabs?.[0]?.id;
      if (!tabId) return resolve(false);
      try {
        await chrome.scripting.executeScript({
          target: { tabId, allFrames: true },
          files: ["content.js"]
        });
        console.log("Injected content.js into", tabs?.[0]?.url);
        resolve(true);
      } catch (e) {
        console.error("Inject failed:", e);
        resolve(false);
      }
    });
  });
}

async function sendScrape(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: "TECHX_SCRAPE", action: "scrape", model: "Grok" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.warn("sendMessage error:", chrome.runtime.lastError.message);
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve({ ok: true, response });
      }
    );
  });
}

async function sharePublic() {
  showBusy(true);

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tabId = tabs?.[0]?.id;
    const tabUrl = tabs?.[0]?.url || "";
    if (!tabId) {
      console.error("No active tab");
      showBusy(false);
      return;
    }
    console.log("Share clicked on:", tabUrl);

    // First try to message; if it fails, inject then retry.
    let res = await sendScrape(tabId);
    if (!res.ok) {
      const injected = await injectIntoActiveTab();
      if (injected) {
        console.log("Retrying after injection…");
        res = await sendScrape(tabId);
      }
    }

    if (!res.ok) {
      console.error("Could not reach content script after retry:", res.error);
    } else {
      console.log("Content script ack:", res.response);
    }

    setTimeout(() => showBusy(false), 1200);
  });
}

// Auto-inject on popup open (helps when page uses iframes/about:blank)
window.addEventListener("load", () => {
  injectIntoActiveTab();
  const btn = document.getElementById("sharePublic");
  if (btn) btn.addEventListener("click", sharePublic);
});
