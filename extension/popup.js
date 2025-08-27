// popup.js
console.log("popup.js loaded");

function showBusy(busy) {
  const btn = document.getElementById("sharePublic");
  const loader = document.getElementById("sharePublicLoader");
  if (!btn || !loader) return;
  loader.style.display = busy ? "flex" : "none";
  btn.style.display = busy ? "none" : "flex";
}

async function sendScrape(tabId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "TECHX_SCRAPE", model: "Grok" }, (resp) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(resp || { ok: false, error: "No response" });
      }
    });
  });
}

async function sharePublic() {
  showBusy(true);
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs?.[0]?.id;
    if (!tabId) throw new Error("No active tab");

    // 1) Try talking to the content script
    let resp = await sendScrape(tabId);
    if (!resp?.ok) {
      console.warn("[popup] first try failed:", resp?.error);
      // 2) Inject content.js then retry once
      await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
      resp = await sendScrape(tabId);
    }

    if (!resp?.ok) throw new Error(resp?.error || "Scrape failed");

    // success (background already opened the share URL)
    window.close();
  } catch (e) {
    console.error(e);
    alert(`Share failed: ${e.message || e}`);
  } finally {
    showBusy(false);
  }
}

window.addEventListener("load", () => {
  document.getElementById("sharePublic")?.addEventListener("click", sharePublic);
});
