// background.js — MV3 service worker
// - Accepts chunked HTML from content
// - Builds Grok-lite HTML/CSS wrapper
// - Posts FormData to your server (with retry on 502/503/504)
// - Opens exactly one tab on success

const API_BASE = "https://jomniconvo.duckdns.org";

// per-tab "busy" lock to prevent double shares
const busyByTab = new Map();

// in-memory upload sessions: { [uploadId]: { tabId, meta, chunks: Map(index->string), total, t } }
const uploads = new Map();

// ---------------- utils ----------------
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildHtmlDoc(innerHtml, meta = {}) {
  const source = meta.source || "Grok";
  const title  = meta.title  || "Saved Conversation";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="color-scheme" content="light">
<style id="techx-grok-skin">
:root { color-scheme: light !important; }
html, body {
  margin:0; padding:0;
  background:#f7f7f7 !important;
  color:#111 !important;
  font:14px/1.45 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif;
  -webkit-font-smoothing:antialiased;
}
/* Header */
.techx-header {
  position:sticky; top:0; z-index:10;
  background:#ffffffcc; backdrop-filter:saturate(1.1) blur(6px);
  border-bottom:1px solid #e5e7eb;
}
.techx-header__inner {
  max-width: 960px; margin:0 auto; padding:10px 16px;
  display:flex; align-items:center; justify-content:space-between; gap:12px;
}
.techx-brand { display:flex; align-items:center; gap:8px; font-weight:700; color:#7f1d1d; }
.techx-brand-icon { width:18px; height:18px; color:#7f1d1d; }
.techx-chip {
  display:inline-flex; align-items:center; gap:6px;
  background:#f3e8ff; color:#6b21a8; border:1px solid rgba(107,33,168,.2);
  border-radius:999px; padding:3px 8px; font-weight:600; font-size:11px;
}
/* Layout */
.techx-wrap { max-width: 720px; margin: 16px auto; padding: 0 12px; }
/* Grok container width */
#last-reply-container { --content-max-width: 40rem !important; }
#last-reply-container .max-w-[var(--content-max-width)] { max-width: var(--content-max-width) !important; }
/* spacing between bubbles */
#last-reply-container .flex.w-full.flex-col { gap: 8px; }
/* bubble base */
.message-bubble {
  border: 1px solid #e5e7eb !important;
  border-radius: 20px !important;
  padding: 10px 12px !important;
  word-wrap: break-word !important;
  box-shadow: 0 1px 2px rgba(0,0,0,.04);
}
/* user bubble (right) */
.items-end .message-bubble {
  background: #f6f6f6 !important;
  border-bottom-right-radius: 8px !important;
  max-width: 90% !important;
}
/* model bubble (left) */
.items-start .message-bubble {
  background: #fff !important;
  border-bottom-left-radius: 8px !important;
  width: 100% !important;
}
/* hide interactive UI (belt & suspenders) */
.citation,.action-buttons,
[aria-label="Copy"],[aria-label="Edit"],[aria-label="Regenerate"],
[aria-label="Create share link"],[aria-label="Like"],[aria-label="Dislike"],
[aria-label="More actions"],.inline-media-container,.auth-notification { display:none !important; }
/* markdown */
.response-content-markdown { max-width:100% !important; }
.response-content-markdown p { margin: 0 0 10px 0 !important; white-space: pre-wrap; }
.response-content-markdown ul,.response-content-markdown ol { margin: 8px 0 10px 18px !important; }
.response-content-markdown li { margin: 4px 0 !important; }
.response-content-markdown h2,.response-content-markdown h3,.response-content-markdown h4 {
  margin: 12px 0 8px !important; font-weight: 600 !important;
}
.response-content-markdown a { color:#2563eb !important; text-decoration:underline !important; }
.response-content-markdown a:hover { color:#1d4ed8 !important; }
.response-content-markdown code {
  background: rgba(0,0,0,.06) !important; padding: 2px 5px !important; border-radius: 6px !important;
}
.response-content-markdown pre {
  background: #0b0b0b !important; color: #f3f4f6 !important; padding: 12px 14px !important;
  border-radius: 10px !important; overflow: auto !important; margin: 10px 0 !important;
}
.response-content-markdown pre code { background: transparent !important; padding: 0 !important; border-radius: 0 !important; }
/* kill sticky/opacity effects */
.group.focus-within\\:opacity-100, .group:hover\\:opacity-100, .sticky { opacity:1 !important; position:static !important; }
/* bounds */
.message-bubble .markdown, .message-bubble .response-content-markdown { max-width: 100% !important; }
</style>
</head>
<body>
  <header class="techx-header">
    <div class="techx-header__inner">
      <div class="techx-brand">
        <svg class="techx-brand-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 5 5 19h14L12 5z"></path>
        </svg>
        <span>AI Archives</span>
      </div>
      <span class="techx-chip">Source: ${escapeHtml(source)}</span>
    </div>
  </header>

  <main class="techx-wrap">
    <div id="techx-convo-root">${innerHtml || ""}</div>
  </main>
</body>
</html>`;
}

async function postForm(htmlDoc, { model, sourceUrl, title }, timeoutMs = 120000) {
  const fd = new FormData();
  fd.append("html", htmlDoc);
  fd.append("htmlDoc", htmlDoc);
  if (model) fd.append("model", model);
  if (sourceUrl) fd.append("sourceUrl", sourceUrl);
  if (title) fd.append("title", title);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  let resp;
  try {
    resp = await fetch(`${API_BASE}/api/conversation`, {
      method: "POST",
      body: fd,
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
  return resp;
}

async function parseOk(resp) {
  try {
    const data = await resp.json();
    if (data?.url) return { ok: true, url: data.url };
    if (data?.id)  return { ok: true, url: `${API_BASE}/c/${data.id}` };
    throw new Error("Upload succeeded but no URL returned");
  } catch {
    const txt = await resp.text().catch(() => "");
    if (txt && /^https?:\/\//i.test(txt.trim())) return { ok: true, url: txt.trim() };
    throw new Error("Upload succeeded but response format was unexpected");
  }
}

async function uploadConversation(innerHtml, meta) {
  // Wrap with skin **here** (keeps content→background messages small)
  const htmlDoc = buildHtmlDoc(innerHtml, meta);

  // First try
  let resp = await postForm(htmlDoc, meta);
  if (resp.ok) return parseOk(resp);

  // Retry on gateway-ish
  const retriable = [502, 503, 504, 522];
  let body = "";
  try { body = await resp.text(); } catch {}
  if (retriable.includes(resp.status) || /timeout/i.test(body)) {
    // minimal minify
    let smaller = htmlDoc
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\sstyle="[^"]*"/gi, "")
      .replace(/\s(?:data|aria)-[\w-]+="[^"]*"/gi, "")
      .replace(/<svg[\s\S]*?<\/svg>/gi, "")
      .replace(/<img[^>]+src="data:[^"]+"[^>]*>/gi, "")
      .replace(/\s{2,}/g, " ");
    resp = await postForm(smaller, meta, 120000);
    if (resp.ok) return parseOk(resp);
  }

  const errText = body || (await resp.text().catch(() => "")) || "";
  throw new Error(`Server responded ${resp.status} ${resp.statusText}: ${errText}`);
}

// ---------------- message routing ----------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // INIT: claim busy slot & open upload session
  if (msg?.type === "TECHX_UPLOAD_INIT") {
    const tabId = sender?.tab?.id ?? -1;

    if (busyByTab.get(tabId)) {
      sendResponse({ ok: false, error: "Upload already in progress" });
      return; // sync
    }
    busyByTab.set(tabId, true);

    // create session
    uploads.set(msg.uploadId, {
      tabId,
      meta: msg.meta || {},
      chunks: new Map(),
      total: null,
      // watchdog: clean up if COMMIT never arrives
      t: setTimeout(() => {
        uploads.delete(msg.uploadId);
        busyByTab.delete(tabId);
      }, 3 * 60 * 1000) // 3 minutes
    });

    sendResponse({ ok: true });
    return; // sync
  }

  // CHUNK: store pieces; no need to keep channel open
  if (msg?.type === "TECHX_UPLOAD_CHUNK") {
    const sess = uploads.get(msg.uploadId);
    if (sess) {
      sess.chunks.set(msg.index, msg.chunk || "");
      if (typeof msg.total === "number") sess.total = msg.total;
    }
    // we don't send a response (fire-and-forget)
    return; // sync
  }

  // COMMIT: assemble, upload, open tab (async)
  if (msg?.type === "TECHX_UPLOAD_COMMIT") {
    const sess = uploads.get(msg.uploadId);
    if (!sess) {
      sendResponse({ ok: false, error: "No active upload session" });
      return; // sync
    }

    // async block
    (async () => {
      try {
        clearTimeout(sess.t);

        // Rebuild the innerHtml in correct order
        const total = typeof sess.total === "number" ? sess.total : sess.chunks.size;
        const parts = [];
        for (let i = 0; i < total; i++) parts.push(sess.chunks.get(i) || "");
        const innerHtml = parts.join("");

        // Upload
        const res = await uploadConversation(innerHtml, sess.meta);

        // Open one tab if requested
        if (msg.openTab && res?.ok && res?.url) {
          try { await chrome.tabs.create({ url: res.url, active: true }); } catch {}
        }

        sendResponse(res);
      } catch (err) {
        sendResponse({ ok: false, error: String(err?.message || err) });
      } finally {
        uploads.delete(msg.uploadId);
        busyByTab.delete(sess.tabId);
      }
    })();

    return true; // keep channel open for async sendResponse
  }
});
