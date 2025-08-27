// background.js

let lastHash = null;
let lastAt = 0;
let lastUrl = null;

function hashHead(s) {
  // djb2 xor hash for first 4KB
  let h = 5381;
  const n = Math.min(s.length, 4096);
  for (let i = 0; i < n; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "SAVE_CONVO") return;

  (async () => {
    try {
      const { htmlDoc, model } = msg.payload || {};
      const hash = hashHead(htmlDoc || "");
      const now = Date.now();

      // If we just saved identical content, don't POST again.
      if (lastHash === hash && now - lastAt < 8000 && lastUrl) {
        sendResponse({ ok: true, url: lastUrl, dedup: true });
        return;
      }

      const body = new FormData();
      body.append("htmlDoc", new Blob([htmlDoc || ""], { type: "text/html; charset=utf-8" }));
      body.append("model", model || "Grok");

      const res = await fetch("https://jomniconvo.duckdns.org/api/conversation", {
        method: "POST",
        body
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

      const parsed = JSON.parse(text);
      const finalUrl = parsed.url || `https://jomniconvo.duckdns.org/c/${parsed.id}`;

      // remember for dedupe
      lastHash = hash;
      lastAt = now;
      lastUrl = finalUrl;

      if (chrome.tabs?.create) chrome.tabs.create({ url: finalUrl });
      sendResponse({ ok: true, url: finalUrl });
    } catch (e) {
      console.error("Error saving conversation:", e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true; // keep message channel for async sendResponse
});
