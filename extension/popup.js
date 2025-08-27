// popup.js
console.log("popup.js loaded");

function showBusy(busy) {
  const btn = document.getElementById("sharePublic");
  const loader = document.getElementById("sharePublicLoader");
  if (!btn || !loader) return;
  loader.style.display = busy ? "flex" : "none";
  btn.style.display = busy ? "none" : "flex";
}

function sharePublic() {
  showBusy(true);

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) {
      console.error("No active tab");
      showBusy(false);
      return;
    }

    chrome.tabs.sendMessage(
      tabId,
      { type: "TECHX_SCRAPE", model: "Grok" },
      (resp) => {
        if (chrome.runtime.lastError) {
          console.error("sendMessage error:", chrome.runtime.lastError.message);
          showBusy(false);
          return;
        }
        if (!resp?.ok) {
          console.error("Scrape failed:", resp?.error || resp);
          showBusy(false);
          return;
        }
        // success – background opens the tab
        showBusy(false);
        window.close();
      }
    );
  });
}

window.addEventListener("load", () => {
  document.getElementById("sharePublic")?.addEventListener("click", sharePublic);
});
