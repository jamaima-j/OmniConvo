// background.js (type: "module")
const API_BASE = "https://jomniconvo.duckdns.org";

// small helper: retry on transient network/5xx (incl. 504)
async function postWithRetry(formData, attempts = 3, timeoutMs = 20000) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(`${API_BASE}/api/conversation`, {
        method: "POST",
        body: formData, // let browser set multipart boundary
        cache: "no-store",
        credentials: "omit",
        signal: controller.signal,
      });

      clearTimeout(t);

      if (res.ok) return res.json();

      // retry on 502/503/504 or other 5xx
      if (res.status >= 500) {
        lastErr = new Error(`${res.status} ${res.statusText}`);
      } else {
        const txt = await res.text().catch(() => "");
        throw new Error(`Server responded ${res.status} ${res.statusText}: ${txt}`);
      }
    } catch (e) {
      lastErr = e;
      // if aborted or network failed, backoff and retry
    }
    // simple backoff
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
  }
  throw lastErr || new Error("Upload failed");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type !== "TECHX_UPLOAD") return;

      const fd = new FormData();
      fd.append("html", msg.html || "");
      fd.append("model", msg.model || "Grok");
      fd.append("sourceUrl", msg.sourceUrl || "");

      const data = await postWithRetry(fd);
      sendResponse({ ok: true, url: data?.url });
    } catch (err) {
      console.error("TECHX_UPLOAD error:", err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  return true; // keep the message channel open
});
