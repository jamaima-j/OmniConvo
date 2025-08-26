// background.js (MV3 service worker)

const API_URL = "https://jomniconvo.duckdns.org/api/conversation";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "SAVE_CONVO") return;

  (async () => {
    try {
      const { htmlDoc, model = "Grok" } = msg.payload || {};
      if (!htmlDoc || typeof htmlDoc !== "string") {
        throw new Error("Missing htmlDoc payload");
      }

      const body = new FormData();
      body.append("htmlDoc", new Blob([htmlDoc], { type: "text/html; charset=utf-8" }));
      body.append("model", model);

      const res = await fetch(API_URL, { method: "POST", body });
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      }

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(`Expected JSON, got ${ct}`);
      }

      const data = JSON.parse(text);
      const finalUrl =
        (typeof data.url === "string" && data.url) ||
        `https://jomniconvo.duckdns.org/c/${data.id}`;

      if (chrome.tabs?.create) {
        await chrome.tabs.create({ url: finalUrl });
      }

      sendResponse({ ok: true, url: finalUrl });
    } catch (e) {
      console.error("Error saving conversation:", e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  // keep channel open for the async sendResponse
  return true;
});
