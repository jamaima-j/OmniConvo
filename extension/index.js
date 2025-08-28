// index.js 

console.log("TechX content script loaded");

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "SCRAPE_PAGE") return;

  try {
    const htmlDoc = document.documentElement.innerHTML;
    const model = msg.model || "ChatGPT";

    // Forward HTML + model to background
    chrome.runtime.sendMessage(
      { type: "SAVE_CONVO", payload: { htmlDoc, model } },
      (res) => sendResponse(res)
    );
  } catch (e) {
    console.error("Content script scrape error:", e);
    sendResponse({ ok: false, error: String(e) });
  }

  return true; // async response
});
