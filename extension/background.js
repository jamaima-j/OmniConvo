// background.js — MV3 service worker
// - Accepts chunked HTML from content
// - Wraps with a SCOPED bubble CSS (only under #techx-convo)
// - Posts FormData to your server (with retry on 502/503/504/522)
// - Opens exactly one tab on success

const API_BASE = "https://jomniconvo.duckdns.org";
console.log("[TechX SW] loaded v", chrome.runtime.getManifest().version);

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

// All rules are scoped under #techx-convo so they never leak
const BUBBLE_CSS = `
#techx-convo{
  /* font + sizing */
  --font-sans: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif;
  --content-width:1100px; --content-max-width:780px; --bubble-max:780px; --gap-y:16px;

  /* colors */
  --fg-primary:#0b0f18; --fg-secondary:#6b7280;
  --surface:#fff; --surface-l1:#f7f8fa; --surface-l2:#f3f4f6; --surface-l3:#e5e7eb;
  --border-l1:#e5e7eb; --link:#2563eb;
  --assistant-bg:#eaf3ff;
  --assistant-badge-bg:#dbeafe;
  --assistant-badge-fg:#1e3a8a;
  --user-badge-bg:#e5e7eb;
  --user-badge-fg:#111827;

  --ghost-hover:rgba(0,0,0,.06); --shadow-soft:0 2px 8px rgba(0,0,0,.06);
  --radius-lg:12px; --radius-3xl:20px;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;

  margin:0; padding:0 12px 64px;
  background:var(--surface);
  color:var(--fg-primary);
  font:15px/1.6 var(--font-sans);
  letter-spacing:.01em;
}
@media (prefers-color-scheme: dark){
  #techx-convo{
    --fg-primary:#e5e7eb; --fg-secondary:#9ca3af;
    --surface:#0b0f18; --surface-l1:#101521; --surface-l2:#111827; --surface-l3:#1f2937;
    --border-l1:#1f2a3a; --link:#60a5fa;
    --assistant-bg:#0f1b2e;
    --assistant-badge-bg:#1e3a8a;
    --assistant-badge-fg:#dbeafe;
    --user-badge-bg:#374151;
    --user-badge-fg:#e5e7eb;
    --shadow-soft:0 2px 10px rgba(0,0,0,.35);
  }
}

#techx-convo * { box-sizing: border-box; }

#techx-convo #last-reply-container{
  --gutter-width:calc((100cqw - var(--content-width))/2);
  font-family:var(--font-sans);
  color:var(--fg-primary);
}
#techx-convo #last-reply-container > .flex.flex-col.items-center{ margin: var(--gap-y) 0; }

/* bubble base */
#techx-convo .message-bubble{
  position:relative;
  background:var(--surface-l2);
  border:1px solid var(--border-l1);
  color:var(--fg-primary);
  padding:.8rem 1rem;
  border-radius:var(--radius-3xl);
  box-shadow:var(--shadow-soft);
  word-break:break-word;
  max-width:var(--bubble-max);
  margin: 0 auto; /* center */
}
#techx-convo .message-bubble.rounded-br-lg{ border-bottom-right-radius: var(--radius-lg); }

/* center both rows */
#techx-convo .items-start .message-bubble,
#techx-convo .items-end   .message-bubble{
  margin: 0 auto;
}

/* Q / A labels */
#techx-convo .message-bubble::before{
  content:"";
  display:inline-block;
  font-size:12px;
  font-weight:700;
  line-height:1;
  padding:4px 8px;
  border-radius:9999px;
  margin-bottom:6px;
  margin-right:6px;
  vertical-align:top;
}
#techx-convo .items-end .message-bubble::before{ /* user = Q */
  content:"Q";
  background:var(--user-badge-bg);
  color:var(--user-badge-fg);
}
#techx-convo .items-start .message-bubble::before{ /* assistant = A */
  content:"A";
  background:var(--assistant-badge-bg);
  color:var(--assistant-badge-fg);
}

/* assistant bubble gets light-blue background */
#techx-convo .items-start .message-bubble{
  background:var(--assistant-bg) !important;
}

/* spacing between entries */
#techx-convo .relative.group{ margin: var(--gap-y) 0; }

/* typography in bubbles */
#techx-convo .prose{max-width:100%;line-height:1.65}
#techx-convo .prose p,#techx-convo .prose ul,#techx-convo .prose ol{margin:.5rem 0}
#techx-convo .prose strong{font-weight:600}
#techx-convo .prose li{margin:.35rem 0;padding-inline-start:.25rem}
#techx-convo .prose ul{list-style:disc;padding-left:1.25rem}
#techx-convo .prose ol{list-style:decimal;padding-left:1.25rem}
#techx-convo .break-words{overflow-wrap:break-word;word-break:break-word}
#techx-convo .whitespace-pre-wrap{white-space:pre-wrap}

/* markdown */
#techx-convo .response-content-markdown{color:var(--fg-primary)}
#techx-convo .response-content-markdown a{color:var(--link);text-decoration:underline;text-underline-offset:2px}
#techx-convo .response-content-markdown pre{
  margin:.6rem 0 0;
  background:var(--surface-l1);
  border:1px solid var(--border-l1);
  border-radius:12px;
  overflow:auto;
  font-family:var(--mono);
  font-size:.9em;
  line-height:1.5;
}
#techx-convo .response-content-markdown code{white-space:pre}

/* safety if any of these sneak in */
#techx-convo .inline-media-container,
#techx-convo .auth-notification,
#techx-convo .citation,
#techx-convo [aria-label]{display:none !important}
`;

// Build the final HTML document we upload (scoped under #techx-convo)
function buildHtmlDoc(innerHtml, meta = {}) {
  const title  = meta.title  || "Saved Conversation";
  const bodyContent = `<div id="techx-convo">${innerHtml || ""}</div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>${BUBBLE_CSS}</style>
</head>
<body>
${bodyContent}
</body>
</html>`;
}

async function postForm(htmlDoc, { model, sourceUrl, title }, timeoutMs = 120000) {
  const fd = new FormData();

  // Send as file fields so multer-style servers pick them up
  const htmlBlob = new Blob([htmlDoc], { type: "text/html; charset=utf-8" });
  fd.append("htmlDoc", htmlBlob, "conversation.html");
  fd.append("html",    htmlBlob, "conversation.html");

  if (model)    fd.append("model", model);
  if (sourceUrl) fd.append("sourceUrl", sourceUrl);
  if (title)     fd.append("title", title);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);

  let resp;
  try {
    resp = await fetch("https://jomniconvo.duckdns.org/api/conversation", {
      method: "POST",
      body: fd,
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
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
  const htmlDoc = buildHtmlDoc(innerHtml, meta);

  let resp = await postForm(htmlDoc, meta);
  if (resp.ok) return parseOk(resp);

  const retriable = [502, 503, 504, 522];
  let body = "";
  try { body = await resp.text(); } catch {}
  if (retriable.includes(resp.status) || /timeout/i.test(body)) {
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
  if (msg?.type === "TECHX_UPLOAD_INIT") {
    const tabId = sender?.tab?.id ?? -1;
    if (busyByTab.get(tabId)) {
      sendResponse({ ok: false, error: "Upload already in progress" });
      return;
    }
    busyByTab.set(tabId, true);

    uploads.set(msg.uploadId, {
      tabId,
      meta: msg.meta || {},
      chunks: new Map(),
      total: null,
      t: setTimeout(() => {
        uploads.delete(msg.uploadId);
        busyByTab.delete(tabId);
      }, 3 * 60 * 1000)
    });

    sendResponse({ ok: true });
    return;
  }

  if (msg?.type === "TECHX_UPLOAD_CHUNK") {
    const sess = uploads.get(msg.uploadId);
    if (sess) {
      sess.chunks.set(msg.index, msg.chunk || "");
      if (typeof msg.total === "number") sess.total = msg.total;
    }
    return;
  }

  if (msg?.type === "TECHX_UPLOAD_COMMIT") {
    const sess = uploads.get(msg.uploadId);
    if (!sess) { sendResponse({ ok: false, error: "No active upload session" }); return; }

    (async () => {
      try {
        clearTimeout(sess.t);
        const total = typeof sess.total === "number" ? sess.total : sess.chunks.size;
        const parts = [];
        for (let i = 0; i < total; i++) parts.push(sess.chunks.get(i) || "");
        const innerHtml = parts.join("");

        const res = await uploadConversation(innerHtml, sess.meta);

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

    return true;
  }
});
