// background.js (type: "module")
const API_BASE = "https://jomniconvo.duckdns.org";

// Retry helper for transient network/5xx (incl. 504)
async function postWithRetry(formData, attempts = 3, timeoutMs = 20000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${API_BASE}/api/conversation`, {
        method: "POST",
        body: formData,                 // multipart/form-data
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });

      clearTimeout(t);

      if (res.ok) return res.json();

      // Retry on 5xx, otherwise throw with body for debugging
      if (res.status >= 500) {
        lastErr = new Error(`${res.status} ${res.statusText}`);
      } else {
        const txt = await res.text().catch(() => "");
        throw new Error(`Server responded ${res.status} ${res.statusText}: ${txt}`);
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 800 * (i + 1))); // backoff
  }
  throw lastErr || new Error("Upload failed");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type !== "TECHX_UPLOAD") return;

      const fd = new FormData();

      // IMPORTANT: server expects `htmlDoc`
      fd.append("htmlDoc", msg.html || "");          // primary field
      fd.append("html", msg.html || "");             // optional back-compat
      fd.append("model", msg.model || "Grok");
      fd.append("sourceUrl", msg.sourceUrl || "");
      // Optional: send a title if you want (server can ignore it)
      if (msg.title) fd.append("title", msg.title);

      const data = await postWithRetry(fd);
      sendResponse({ ok: true, url: data?.url });
    } catch (err) {
      console.error("TECHX_UPLOAD error:", err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true; // keep the message channel open
});
