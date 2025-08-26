// content.js
console.log("TechX content script loaded");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === "scrape") {
    console.log("Scraping conversation HTML...");
    const htmlDoc = document.documentElement.outerHTML;

    chrome.runtime.sendMessage({
      type: "SAVE_CONVO",
      payload: { htmlDoc, model: "ChatGPT" }
    });

    sendResponse({ ok: true });
  }
});
