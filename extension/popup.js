console.log("popup.js loaded");

function initApp() {
  document.getElementById("sharePublic").addEventListener("click", sharePublic);
  console.log("TechX popup ready");
}

function sharePublic() {
  console.log("SharePublic clicked");
  document.querySelector("#sharePublicLoader").style.display = "flex";
  document.querySelector("#sharePublic").style.display = "none";

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0]?.id, { action: "scrape" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError.message);
        resetLoader();
        return;
      }

      if (!response?.htmlDoc) {
        console.error("No HTML returned from content script");
        resetLoader();
        return;
      }

      // Forward to background
      chrome.runtime.sendMessage(
        { type: "SAVE_CONVO", payload: { htmlDoc: response.htmlDoc, model: "ChatGPT" } },
        (res) => {
          if (res?.ok && res.url) {
            console.log("Opening new tab:", res.url);
            chrome.tabs.create({ url: res.url });
          } else {
            console.error("Error saving conversation:", res?.error);
          }
          resetLoader();
        }
      );
    });
  });
}

function resetLoader() {
  document.querySelector("#sharePublicLoader").style.display = "none";
  document.querySelector("#sharePublic").style.display = "flex";
}

window.onload = initApp;
