// content.js — Q&A-only scraper for Grok with strict root + whitelist sanitization
// Flow: popup -> content (scrape) -> background (upload) -> server

// ===================== 1) Inject the bubble skin once =====================
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
html,body{background:var(--surface);color:var(--fg-primary);font:14px/1.45 var(--serif);}
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

  function inject() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();

// ===================== 2) Q&A extraction (strict Grok root) =====================
(() => {
  const CHUNK_SIZE = 128 * 1024;
  const log = (...a) => { try { console.log('[TechX content]', ...a); } catch {} };

  const ALLOWED = new Set([
    'P','UL','OL','LI','PRE','CODE','H2','H3','H4','A','STRONG','EM','BLOCKQUOTE',
    'TABLE','THEAD','TBODY','TR','TH','TD','IMG','BR'
  ]);

  function escapeHtml(s){
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Remove scripts/styles/buttons/sticky/thinkers/attrs and unwrap disallowed tags
  function sanitizeAssistantNode(sourceEl) {
    const clone = sourceEl.cloneNode(true);

    // Kill obvious junk
    clone.querySelectorAll([
      'script','style','link','iframe','object','embed','svg','button',
      '.citation','.action-buttons','.thinking-container','.think-box',
      '.sticky','[class*="sticky"]','.inline-media-container','.auth-notification'
    ].join(',')).forEach(n => n.remove());

    // Attributes & elements
    const walker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
    const toRemove = [];
    const toUnwrap = [];

    let node;
    while ((node = walker.nextNode())) {
      const tag = node.tagName;

      // Strip attrs
      [...node.attributes].forEach(a => {
        const n = a.name.toLowerCase();
        if (n === 'style' || n.startsWith('on') || n.startsWith('data-') || n.startsWith('aria-')) {
          node.removeAttribute(a.name);
        }
        if (tag === 'A' && n === 'href' && !/^https?:/i.test(a.value)) node.removeAttribute('href');
        if (tag === 'IMG') {
          if (n === 'src' && !/^https?:/i.test(a.value)) toRemove.push(node);
          if (n !== 'src' && n !== 'alt') node.removeAttribute(a.name);
        }
      });

      // Only keep allowed tags – unwrap others (keep their children)
      if (!ALLOWED.has(tag)) {
        if (tag === 'DIV' || tag === 'SPAN' || tag === 'SECTION' || tag === 'ARTICLE') {
          toUnwrap.push(node);
        } else {
          toRemove.push(node);
        }
      }
    }

    toRemove.forEach(n => n.remove());
    toUnwrap.forEach(n => n.replaceWith(...n.childNodes));

    return clone.innerHTML;
  }

  function sanitizeUserText(el) {
    const txt = (el.innerText || el.textContent || '').replace(/\u00A0/g,' ').trim();
    return txt;
  }

  // STRICT root: only Grok container. If not found, bail — prevents “whole page” grabs.
  function getRoot() {
    return document.querySelector('#last-reply-container') || null;
  }

  function collectMessages() {
    const root = getRoot();
    if (!root) return [];

    const messages = [];
    // Walk in DOM order and pick only bubbles inside the conversation container
    const userSel = '.items-end .message-bubble';
    const assistantSel = '.items-start .response-content-markdown';

    const nodes = root.querySelectorAll(`${userSel}, ${assistantSel}`);
    nodes.forEach(n => {
      if (n.matches(userSel)) {
        const t = sanitizeUserText(n);
        if (t) messages.push({ role:'user', text:t });
      } else {
        const html = sanitizeAssistantNode(n);
        if (html && html.replace(/\s+/g,'').length) messages.push({ role:'assistant', html });
      }
    });

    return messages;
  }

  function buildMinimalConversationHTML(messages) {
    const start = `<div class="flex w-full flex-col" id="last-reply-container" style="--gutter-width: calc((100cqw - var(--content-width)) / 2);">`;
    const end = `</div>`;
    const parts = [start];

    for (const m of messages) {
      if (m.role === 'user') {
        parts.push(
`<div class="flex flex-col items-center">
  <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-0.5 items-end">
    <div dir="auto" class="message-bubble rounded-3xl text-primary min-h-7 prose dark:prose-invert break-words prose-p:opacity-100 prose-strong:opacity-100 prose-li:opacity-100 prose-ul:opacity-100 prose-ol:opacity-100 prose-ul:my-1 prose-ol:my-1 prose-li:my-2 last:prose-li:mb-3 prose-li:ps-1 prose-li:ms-1 bg-surface-l2 border border-border-l1 max-w-[100%] sm:max-w-[90%] px-4 py-2.5 rounded-br-lg">
      <span class="whitespace-pre-wrap">${escapeHtml(m.text)}</span>
    </div>
  </div>
</div>`
        );
      } else {
        parts.push(
`<div class="flex flex-col items-center">
  <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-0.5 items-start">
    <div dir="auto" class="message-bubble rounded-3xl text-primary min-h-7 prose dark:prose-invert break-words prose-p:opacity-100 prose-strong:opacity-100 prose-li:opacity-100 prose-ul:opacity-100 prose-ol:opacity-100 prose-ul:my-1 prose-ol:my-1 prose-li:my-2 last:prose-li:mb-3 prose-li:ps-1 prose-li:ms-1 w-full max-w-none">
      <div class="response-content-markdown markdown">${m.html}</div>
    </div>
  </div>
</div>`
        );
      }
    }

    parts.push(end);
    return parts.join('\n');
  }

  // ---------------- chunked send to background ----------------
  function sendMessagePromise(payload) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(payload, (resp) => {
        if (chrome.runtime.lastError) resolve({ ok:false, error: chrome.runtime.lastError.message });
        else resolve(resp);
      });
    });
  }

  async function uploadInChunks(innerHtml, meta) {
    const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

    const total = Math.ceil(innerHtml.length / CHUNK_SIZE);
    for (let i = 0; i < total; i++) {
      const start = i * CHUNK_SIZE;
      chrome.runtime.sendMessage({
        type: "TECHX_UPLOAD_CHUNK",
        uploadId,
        index: i,
        total,
        chunk: innerHtml.slice(start, start + CHUNK_SIZE)
      });
    }

    return await sendMessagePromise({
      type: "TECHX_UPLOAD_COMMIT",
      uploadId,
      openTab: true
    });
  }

  // ===================== 3) Handle popup request =====================
  let busy = false;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (window !== window.top) return; // top frame only
    const isScrape = msg && (msg.type === "TECHX_SCRAPE" || msg.action === "scrape");
    if (!isScrape) return;

    if (busy) { sendResponse({ ok:false, error:"Busy" }); return; }
    busy = true;

    (async () => {
      try {
        const root = document.querySelector('#last-reply-container');
        if (!root) {
          busy = false;
          sendResponse({ ok:false, error:"Grok conversation container not found (#last-reply-container)" });
          return;
        }

        const messages = collectMessages();
        log('Found messages:', messages.length);

        if (!messages.length) {
          busy = false;
          sendResponse({ ok:false, error:"No Q&A messages found (selectors may need update)" });
          return;
        }

        const minimalHtml = buildMinimalConversationHTML(messages);
        const resp = await uploadInChunks(minimalHtml, {
          model: (msg && msg.model) || "Grok",
          source: "Grok",
          title: document.title || "Saved Conversation"
        });

        busy = false;
        if (resp?.ok) sendResponse({ ok:true, url: resp.url || null });
        else sendResponse({ ok:false, error: resp?.error || "Upload failed" });
      } catch (e) {
        busy = false;
        sendResponse({ ok:false, error: String(e?.message || e) });
      }
    })();

    return true; // keep channel open
  });

  log('TechX content script ready (Grok Q&A only):', location.href);
})();
