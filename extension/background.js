// background.js — MV3 service worker
// - Accepts chunked HTML from content
// - If it's already the minimal #last-reply-container, don't add extra UI
// - Injects bubble CSS only (no header/sidebars)
// - Posts FormData to your server (with retry on 502/503/504/522)
// - Opens exactly one tab on success

const API_BASE = "https://jomniconvo.duckdns.org";

// per-tab "busy" lock to prevent double shares
const busyByTab = new Map();

// in-memory upload sessions: { [uploadId]: { tabId, meta, chunks: Map(index->string), total, t } }
const uploads = new Map();

// ---------------- utils ----------------
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The exact bubble skin you want (same as content.js)
const BUBBLE_CSS = `
:root{
  --content-width:1100px; --content-max-width:740px;
  --fg-primary:#0b0f18; --fg-secondary:#6b7280;
  --surface:#fff; --surface-l1:#f7f8fa; --surface-l2:#f3f4f6; --surface-l3:#e5e7eb;
  --border-l1:#e5e7eb; --link:#2563eb; --ghost-hover:rgba(0,0,0,.06);
  --shadow-soft:0 2px 8px rgba(0,0,0,.06);
  --radius-lg:1rem; --radius-3xl:1.5rem;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  --serif:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}
@media (prefers-color-scheme: dark){
  :root{
    --fg-primary:#e5e7eb; --fg-secondary:#9ca3af;
    --surface:#0b0f18; --surface-l1:#101521; --surface-l2:#111827; --surface-l3:#1f2937;
    --border-l1:#1f2a3a; --link:#60a5fa; --ghost-hover:rgba(255,255,255,.08);
    --shadow-soft:0 2px 10px rgba(0,0,0,.35);
  }
}
html,body{margin:0;padding:0;background:var(--surface);color:var(--fg-primary);font:14px/1.45 var(--serif);}
.text-primary{color:var(--fg-primary)} .text-secondary{color:var(--fg-secondary)}
.bg-surface-l1{background:var(--surface-l1)} .bg-surface-l2{background:var(--surface-l2)}
.border{border:1px solid var(--border-l1)} .border-border-l1{border-color:var(--border-l1)}
.rounded-3xl{border-radius:var(--radius-3xl)} .rounded-br-lg{border-bottom-right-radius:var(--radius-lg)}
.min-h-7{min-height:1.75rem} .h-8{height:2rem}.w-8{width:2rem} .size-4{width:1rem;height:1rem}
#last-reply-container{--gutter-width:calc((100cqw - var(--content-width))/2);font-family:var(--serif);color:var(--fg-primary)}
.max-w-\\[var\\(--content-max-width\\)\\]{max-width:var(--content-max-width)} .w-full{width:100%}
.message-bubble{background:var(--surface-l2);border:1px solid var(--border-l1);color:var(--fg-primary);
  padding:.65rem .9rem;border-radius:var(--radius-3xl);box-shadow:var(--shadow-soft);word-break:break-word}
.message-bubble.rounded-br-lg{border-bottom-right-radius:var(--radius-lg)}
.prose{max-width:100%;line-height:1.65}
.prose p,.prose ul,.prose ol{margin:.5rem 0} .prose strong{font-weight:600}
.prose li{margin:.35rem 0;padding-inline-start:.25rem} .prose ul{list-style:disc;padding-left:1.25rem}
.prose ol{list-style:decimal;padding-left:1.25rem}
.break-words{overflow-wrap:break-word;word-break:break-word} .whitespace-pre-wrap{white-space:pre-wrap}
.response-content-markdown{color:var(--fg-primary)}
.response-content-markdown a{color:var(--link);text-decoration:underline;text-underline-offset:2px}
.response-content-markdown pre{margin:.5rem 0 0;background:var(--surface-l1);border:1px solid var(--border-l1);
  border-radius:12px;overflow:auto;font-family:var(--mono);font-size:.9em;line-height:1.5}
.response-content-markdown code{white-space:pre}
.inline-media-container,.auth-notification{margin-top:.35rem}
`;

// Build the final HTML document we upload.
// If the content already contains #last-reply-container, just embed it with BUBBLE_CSS.
function buildHtmlDoc(innerHtml, meta = {}) {
  const title  = meta.title  || "Saved Conversation";
  const looksMinimal = /id=["']last-reply-container["']/.test(innerHtml);

  const bodyContent = looksMinimal
    ? innerHtml
    : `<div class="flex w-full flex-col" id="last-reply-container">${innerHtml || ""}</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style id="techx-conversation-css">${BUBBLE_CSS}</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

async function postForm(htmlDoc, { model, sourceUrl, title }, timeoutMs = 120000) {
  const fd = new FormData();
  // server accepts either "htmlDoc" or "html" — send both for compatibility
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
      signal: controller.signal,
      // keepalive helps if the SW is about to idle
      keepalive: true,
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
  // Wrap with (or pass through) bubble skin
  const htmlDoc = buildHtmlDoc(innerHtml, meta);

  // First try
  let resp = await postForm(htmlDoc, meta);
  if (resp.ok) return parseOk(resp);

  // Retry on gateway-ish
  const retriable = [502, 503, 504, 522];
  let body = "";
  try { body = await resp.text(); } catch {}
  if (retriable.includes(resp.status) || /timeout/i.test(body)) {
    // minimal minify to shrink payload
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
    return; // sync
  }

  // COMMIT: assemble, upload, open tab (async)
  if (msg?.type === "TECHX_UPLOAD_COMMIT") {
    const sess = uploads.get(msg.uploadId);
    if (!sess) {
      sendResponse({ ok: false, error: "No active upload session" });
      return; // sync
    }

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
