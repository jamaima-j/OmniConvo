// content.js — inject skin + sanitize + chunked upload via background
// Flow: popup -> content (collect/sanitize) -> background (wrap + upload) -> background opens tab

// ========== 1) Conversation CSS skin (injected once) ==========
(() => {
  const STYLE_ID = 'techx-conversation-css';
  const CSS = `
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
.action-buttons{opacity:0;transition:opacity .15s ease}
.group:hover .action-buttons,.group:focus-within .action-buttons,.last-response .action-buttons{opacity:1}
.action-buttons button{background:transparent;border:0;color:var(--fg-secondary);width:2rem;height:2rem;border-radius:9999px;
  display:inline-flex;align-items:center;justify-content:center;transition:background .12s,color .12s,opacity .12s}
.action-buttons button:hover{background:var(--ghost-hover);color:var(--fg-primary)}
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
.group .opacity-0{opacity:0;transition:opacity .15s ease}
.group:hover .opacity-0,.group:focus-within .opacity-0,.last-response .opacity-0{opacity:1}
.hover\\:bg-button-ghost-hover:hover{background:var(--ghost-hover)}
`;

  function inject() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function waitForContainerAndInject() {
    if (document.querySelector('#last-reply-container')) { inject(); return; }
    const mo = new MutationObserver(() => {
      if (document.querySelector('#last-reply-container')) { inject(); mo.disconnect(); }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForContainerAndInject);
  } else {
    waitForContainerAndInject();
  }
})();

// ========== 2) Collect + sanitize + chunked upload to background ==========
(() => {
  const CHUNK_SIZE = 128 * 1024; // 128KB per message (string length)

  function log(...args){ try{ console.log('[TechX content]', ...args); }catch{} }

  // Remove heavy/interactive bits; keep semantic text & classes
  function sanitizeNodeForSave(node) {
    const clone = node.cloneNode(true);

    // strip interactive UI
    clone.querySelectorAll(
      ".action-buttons,.inline-media-container,.auth-notification," +
      "[aria-label='Copy'],[aria-label='Edit'],[aria-label='Regenerate']," +
      "[aria-label='Create share link'],[aria-label='Like'],[aria-label='Dislike']," +
      "[aria-label='More actions'],.citation"
    ).forEach(el => el.remove());

    // remove inline styles (we’ll re-skin later)
    clone.querySelectorAll("[style]").forEach(el => el.removeAttribute("style"));

    // remove base64 images and inline SVGs
    clone.querySelectorAll("img[src^='data:']").forEach(el => el.remove());
    clone.querySelectorAll("svg").forEach(el => el.remove());

    // remove giant data-/aria- attributes
    clone.querySelectorAll("*").forEach(el => {
      for (const a of [...el.attributes]) {
        const n = a.name;
        if (n.startsWith("data-") || n.startsWith("aria-")) el.removeAttribute(n);
      }
    });

    return clone.outerHTML;
  }

  function collectConversationHtml() {
    const node =
      document.getElementById("last-reply-container") ||
      document.querySelector("#last-reply-container") ||
      document.querySelector('[data-testid="messages"]') ||
      document.querySelector("main") ||
      document.body;

    return node ? sanitizeNodeForSave(node) : "<div>No conversation found</div>";
  }

  function sendMessagePromise(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (resp) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(resp);
        }
      });
    });
  }

  async function uploadInChunks(innerHtml, meta) {
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // INIT
    const init = await sendMessagePromise({
      type: "TECHX_UPLOAD_INIT",
      uploadId,
      meta: {
        title: meta.title || document.title || "Saved Conversation",
        model: meta.model || "Grok",
        source: meta.source || "Grok",
        sourceUrl: location.href
      }
    });
    if (!init?.ok) return init;

    // CHUNKS (fire-and-forget; background reassembles by index)
    const total = Math.ceil(innerHtml.length / CHUNK_SIZE);
    for (let i = 0; i < total; i++) {
      const start = i * CHUNK_SIZE;
      const end = start + CHUNK_SIZE;
      chrome.runtime.sendMessage({
        type: "TECHX_UPLOAD_CHUNK",
        uploadId,
        index: i,
        total,
        chunk: innerHtml.slice(start, end)
      });
    }

    // COMMIT (background will wrap + upload + open tab)
    return await sendMessagePromise({
      type: "TECHX_UPLOAD_COMMIT",
      uploadId,
      openTab: true // background opens exactly one tab on success
    });
  }

  // ========== 3) Message entrypoint from popup ==========
  let busy = false;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    // top-frame only
    if (window !== window.top) return;

    const isScrape = msg && (msg.type === "TECHX_SCRAPE" || msg.action === "scrape");
    if (!isScrape) return;

    if (busy) {
      sendResponse({ ok: false, error: "Busy" });
      return; // sync path
    }
    busy = true;

    (async () => {
      try {
        const model = (msg && msg.model) || "Grok";
        const innerHtml = collectConversationHtml();

        log('Collected conversation HTML length:', innerHtml.length);

        const resp = await uploadInChunks(innerHtml, {
          model,
          source: "Grok",
          title: document.title || "Saved Conversation"
        });

        busy = false;

        if (resp?.ok) {
          // background already opened the URL if openTab:true
          sendResponse({ ok: true, url: resp.url || null });
        } else {
          sendResponse({ ok: false, error: resp?.error || "Unknown error" });
        }
      } catch (err) {
        busy = false;
        sendResponse({ ok: false, error: String(err?.message || err) });
      }
    })();

    return true; // keep channel open while we async work
  });

  log('TechX content script ready:', location.href);
})();
