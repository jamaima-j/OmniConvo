// background.js
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "SAVE_CONVO") return;

  (async () => {
    try {
      const { htmlDoc, model } = msg.payload || {};
      const body = new FormData();
      body.append("htmlDoc", new Blob([htmlDoc || ""], { type: "text/html; charset=utf-8" }));
      body.append("model", model || "Grok");

      const res = await fetch("https://jomniconvo.duckdns.org/api/conversation", { method: "POST", body });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

      const { url, id } = JSON.parse(text);
      const finalUrl = url || `https://jomniconvo.duckdns.org/c/${id}`;

      if (chrome.tabs?.create) chrome.tabs.create({ url: finalUrl });
      sendResponse({ ok: true, url: finalUrl });
    } catch (e) {
      console.error("Error saving conversation:", e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true;
});
