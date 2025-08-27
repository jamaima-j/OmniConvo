// background.js (MV3 service worker)
//
// - Receives TECHX_UPLOAD from content.js
// - Posts FormData to your server (no manual Content-Type header)
// - Returns { ok, url } or { ok:false, error }

const API_BASE = "https://jomniconvo.duckdns.org";

// avoid double-saves per tab while a request is in flight
const busyByTab = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "TECHX_UPLOAD") return;

  // throttle per-tab
  const tabId = sender?.tab?.id ?? -1;
  if (busyByTab.get(tabId)) {
    sendResponse({ ok: false, error: "Upload already in progress" });
    return;
  }
  busyByTab.set(tabId, true);

  // do async work
  (async () => {
    try {
      const res = await uploadConversation(msg);
      sendResponse(res);
    } catch (err) {
      const message = err?.message || String(err);
      console.error("[TECHX_UPLOAD] error:", message);
      sendResponse({ ok: false, error: message });
    } finally {
      busyByTab.delete(tabId);
    }
  })();

  // keep the message channel open for async response
  return true;
});

async function uploadConversation(payload) {
  const { html, model, sourceUrl, title } = payload || {};

  if (!html || typeof html !== "string") {
    throw new Error("Missing html content");
  }

  // Build FormData (server may expect 'html' OR 'htmlDoc')
  const fd = new FormData();
  fd.append("html", html);
  fd.append("htmlDoc", html); // be compatible with either field name
  if (model) fd.append("model", model);
  if (sourceUrl) fd.append("sourceUrl", sourceUrl);
  if (title) fd.append("title", title);

  // Abort if it hangs too long
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort("timeout"), 45000);

  let resp;
  try {
    resp = await fetch(`${API_BASE}/api/conversation`, {
      method: "POST",
      body: fd,           // IMPORTANT: no Content-Type header; the browser sets multipart boundary
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(t);
  }

  // handle non-2xx
  if (!resp.ok) {
    let bodyText = "";
    try { bodyText = await resp.text(); } catch {}
    throw new Error(`Server responded ${resp.status} ${resp.statusText}: ${bodyText}`);
  }

  // parse success payload
  let data;
  try {
    data = await resp.json();
  } catch {
    // if server returns plain text URL, still try to pass something useful back
    const txt = await resp.text().catch(() => "");
    if (txt && /^https?:\/\//i.test(txt.trim())) {
      return { ok: true, url: txt.trim() };
    }
    throw new Error("Upload succeeded but response was not valid JSON");
  }

  if (!data?.url) {
    // some servers return {ok:true, id:..., url:...}; others might use 'id'
    if (data?.id) return { ok: true, url: `${API_BASE}/c/${data.id}` };
    throw new Error("Upload succeeded but no URL returned");
  }

  return { ok: true, url: data.url };
}
