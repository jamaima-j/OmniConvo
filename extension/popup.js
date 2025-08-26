// popup.js
console.log("popup.js loaded");

function showBusy(isBusy) {
  const btn = document.getElementById("sharePublic");
  const loader = document.getElementById("sharePublicLoader");
  if (!btn || !loader) return;
  loader.style.display = isBusy ? "flex" : "none";
  btn.style.display = isBusy ? "none" : "flex";
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

    // Send BOTH fields so old/new listeners are happy
    chrome.tabs.sendMessage(
      tabId,
      { type: "TECHX_SCRAPE", action: "scrape", model: "Grok" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("sendMessage error:", chrome.runtime.lastError.message);
          showBusy(false);
          return;
        }
        console.log("Content script ack:", response);

        // We don't wait for the server; background will open the tab.
        setTimeout(() => showBusy(false), 2000);
      }
    );
  });
}

window.addEventListener("load", () => {
  const btn = document.getElementById("sharePublic");
  if (btn) btn.addEventListener("click", sharePublic);
});
