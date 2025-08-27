// background.js (type: "module")
const API_BASE = "https://jomniconvo.duckdns.org";

async function postWithRetry(formData, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(`${API_BASE}/api/conversation`, {
        method: "POST",
        body: formData,        // multipart/form-data
        cache: "no-store",
        credentials: "omit",
      });

      if (res.ok) return res.json();

      // Retry on 5xx; otherwise throw with body for debugging
      if (res.status >= 500) {
        lastErr = new Error(`${res.status} ${res.statusText}`);
      } else {
        const txt = await res.text().catch(() => "");
        throw new Error(`Server responded ${res.status} ${res.statusText}: ${txt}`);
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise(r => setTimeout(r, 1000 * (i + 1))); // simple backoff
  }
  throw lastErr || new Error("Upload failed");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type !== "TECHX_UPLOAD") return;

      const fd = new FormData();
      // IMPORTANT: server expects this exact key:
      fd.append("htmlDoc", msg.html || "");
      // Optional compatibility field:
      fd.append("html", msg.html || "");
      fd.append("model", msg.model || "Grok");
      fd.append("sourceUrl", msg.sourceUrl || "");
      if (msg.title) fd.append("title", msg.title);

      const data = await postWithRetry(fd);
      sendResponse({ ok: true, url: data?.url });
    } catch (err) {
      console.error("TECHX_UPLOAD error:", err);
      sendResponse({ ok: false, error: String(err?.message || err) });
    }
  })();

  // keep channel open for async reply
  return true;
});
