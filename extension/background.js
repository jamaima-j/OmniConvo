// background.js 

const API_BASE = "https://jomniconvo.duckdns.org";
console.log("[TechX SW] loaded v", chrome.runtime.getManifest().version);

// per-tab "busy" lock to prevent double shares
const busyByTab = new Map();

// in-memory upload sessions
const uploads = new Map();

// ---------------- utils ----------------
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}


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
     resp = await fetch(`${API_BASE}/api/conversation`, {
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
// === MCP archiving helpers ===
const MCP_ENDPOINT = 'http://127.0.0.1:8000/api/save';
// If you added auth middleware, keep this. If not, it's harmless to send.
const OMNI_KEY = 'dev-secret';

function stripHtmlToText(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function archiveToMCP(innerHtml, meta = {}) {
  try {
    const title = meta.title || 'Grok Chat';
    const model = meta.model || 'grok-4';
    const source = meta.source || 'grok-web';
    const link = meta.url || meta.sourceUrl; // accept either
    // keep payload small; server limit is 5MB; trim to ~100k chars
    const text = stripHtmlToText(innerHtml);
    const max = 100_000;
    const safeText = text.length > max ? text.slice(0, max) + '\n...[truncated]...' : text;

    const payload = {
      title,
      model,
      source,
      messages: [
        link ? { role: 'system', content: `URL: ${link}` } : null,
        { role: 'assistant', content: safeText }
      ].filter(Boolean)
    };

    const res = await fetch(MCP_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-omni-key': OMNI_KEY
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const msg = await res.text().catch(() => '');
      throw new Error(`MCP save failed (${res.status}): ${msg}`);
    }
    return await res.json(); // { ok: true, path: "C:\\..." }
  } catch (e) {
    // don't break your flow if archiving fails
    console.debug('[MCP] archive error:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}


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

      // NEW: choose where to save
      const mode = (sess.meta?.saveTo || "remote"); // "remote" | "mcp" | "both"

      let remoteRes = null, mcpRes = null;

      if (mode === "remote" || mode === "both") {
        remoteRes = await uploadConversation(innerHtml, sess.meta);
      }
      if (mode === "mcp" || mode === "both") {
        mcpRes = await archiveToMCP(innerHtml, sess.meta);
        console.debug("[MCP] archive result:", mcpRes);
      }

      // Prefer remote result if present, otherwise MCP result
      const finalRes = remoteRes ?? mcpRes ?? { ok: false, error: "No upload performed" };

      if (msg.openTab && finalRes?.ok && finalRes?.url) {
        try { await chrome.tabs.create({ url: finalRes.url, active: true }); } catch {}
      }

      // Include MCP status for debugging (doesn't break your existing consumers)
      sendResponse({ ...finalRes, mcp: mcpRes || undefined });
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
