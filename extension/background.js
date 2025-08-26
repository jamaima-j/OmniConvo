// background.js (MV3 service worker)

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "SAVE_CONVO") return;

  (async () => {
    try {
      const { htmlDoc, model } = msg.payload || {};

      const body = new FormData();
      body.append(
        "htmlDoc",
        new Blob([htmlDoc || ""], { type: "text/plain; charset=utf-8" })
      );
      body.append("model", model || "ChatGPT");

      const res = await fetch(
        "https://jomniconvo.duckdns.org/api/conversation",
        {
          method: "POST",
          body,
        }
      );

      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        throw new Error(`Expected JSON, got ${ct}: ${text.slice(0, 200)}`);
      }

      const { url, id } = JSON.parse(text);
      const finalUrl = url || `https://jomniconvo.duckdns.org/c/${id}`;
      console.log("Conversation saved, opening:", finalUrl);

      if (chrome.tabs?.create) chrome.tabs.create({ url: finalUrl });

      sendResponse({ ok: true, url: finalUrl });
    } catch (e) {
      console.error("Error saving conversation:", e);
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true; // keep channel open for async
});
