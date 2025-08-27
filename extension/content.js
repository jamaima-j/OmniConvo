// content.js
(() => {
  const API_BASE = "https://jomniconvo.duckdns.org";

  try { console.log("TechX content script ready (frame):", location.href); } catch {}

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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
.techx-header {
  position:sticky; top:0; z-index:10;
  background:#ffffffcc;
  backdrop-filter:saturate(1.1) blur(6px);
  border-bottom:1px solid #e5e7eb;
}
.techx-header__inner { max-width:960px; margin:0 auto; padding:10px 16px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
.techx-brand { display:flex; align-items:center; gap:8px; font-weight:700; color:#7f1d1d; }
.techx-brand-icon { width:18px; height:18px; color:#7f1d1d; }
.techx-chip { display:inline-flex; align-items:center; gap:6px; background:#f3e8ff; color:#6b21a8; border:1px solid rgba(107,33,168,.2); border-radius:999px; padding:3px 8px; font-weight:600; font-size:11px; }
.techx-wrap { max-width:720px; margin:16px auto; padding:0 12px; }
#last-reply-container { --content-max-width: 40rem !important; }
#last-reply-container .max-w-[var(--content-max-width)] { max-width: var(--content-max-width) !important; }
#last-reply-container .flex.w-full.flex-col { gap: 8px; }
.message-bubble { border:1px solid #e5e7eb !important; border-radius:20px !important; padding:10px 12px !important; word-wrap:break-word !important; box-shadow:0 1px 2px rgba(0,0,0,.04); }
.items-end .message-bubble { background:#f6f6f6 !important; border-bottom-right-radius:8px !important; max-width:90% !important; }
.items-start .message-bubble { background:#fff !important; border-bottom-left-radius:8px !important; width:100% !important; }
.citation,.action-buttons,[aria-label="Copy"],[aria-label="Edit"],[aria-label="Regenerate"],[aria-label="Create share link"],[aria-label="Like"],[aria-label="Dislike"],[aria-label="More actions"],.inline-media-container,.auth-notification { display:none !important; }
.response-content-markdown { max-width:100% !important; }
.response-content-markdown p { margin:0 0 10px 0 !important; white-space:pre-wrap; }
.response-content-markdown ul,.response-content-markdown ol { margin:8px 0 10px 18px !important; }
.response-content-markdown li { margin:4px 0 !important; }
.response-content-markdown h2,.response-content-markdown h3,.response-content-markdown h4 { margin:12px 0 8px !important; font-weight:600 !important; }
.response-content-markdown a { color:#2563eb !important; text-decoration:underline !important; }
.response-content-markdown a:hover { color:#1d4ed8 !important; }
.response-content-markdown code { background:rgba(0,0,0,.06) !important; padding:2px 5px !important; border-radius:6px !important; }
.response-content-markdown pre { background:#0b0b0b !important; color:#f3f4f6 !important; padding:12px 14px !important; border-radius:10px !important; overflow:auto !important; margin:10px 0 !important; }
.response-content-markdown pre code { background:transparent !important; padding:0 !important; border-radius:0 !important; }
.group.focus-within\\:opacity-100,.group:hover\\:opacity-100,.sticky { opacity:1 !important; position:static !important; }
.message-bubble .markdown,.message-bubble .response-content-markdown { max-width:100% !important; }
</style>
</head>
<body>
  <header class="techx-header">
    <div class="techx-header__inner">
      <div class="techx-brand">
        <svg class="techx-brand-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 5 5 19h14L12 5z"></path></svg>
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

  function collectConversationHtml() {
    let node =
      document.getElementById("last-reply-container") ||
      document.querySelector("#last-reply-container") ||
      document.querySelector('[data-testid="messages"]') ||
      document.querySelector("main") ||
      document.body;

    // clone and prune heavy stuff to shrink payload
    const clone = node.cloneNode(true);
    const removeSel = [
      "img","video","source","svg","picture",".inline-media-container",
      ".auth-notification",".action-buttons",".citation","button",
      "[aria-label]","[role='button']"
    ].join(",");
    clone.querySelectorAll(removeSel).forEach(el => el.remove());
    return clone.outerHTML;
  }

  // send to background for cross-origin fetch + retries
  let __techxBusy = false;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (window !== window.top) return; // top-frame only

    try {
      const isScrape = (msg?.type === "TECHX_SCRAPE") || (msg?.action === "scrape");
      if (!isScrape) return;

      if (__techxBusy) { sendResponse({ ok:false, error:"Busy" }); return; }
      __techxBusy = true;

      const model = msg?.model || "Grok";
      const innerHtml = collectConversationHtml();
      const htmlDoc   = buildHtmlDoc(innerHtml, {
        model,
        source: "Grok",
        title: document.title || "Saved Conversation"
      });

      chrome.runtime.sendMessage(
        { type: "TECHX_UPLOAD", html: htmlDoc, model, sourceUrl: location.href },
        (resp) => {
          __techxBusy = false;
          if (!resp || !resp.ok) {
            console.error("SAVE_CONVO error:", resp?.error || "Unknown");
            sendResponse({ ok:false, error: resp?.error || "Upload failed" });
          } else {
            try { console.log("SAVE_CONVO response:", resp); } catch {}
            sendResponse({ ok:true, url: resp.url });
          }
        }
      );

      return true; // async
    } catch (err) {
      console.error("content.js fatal:", err);
      __techxBusy = false;
      sendResponse({ ok:false, error: String(err?.message || err) });
    }
  });
})();
