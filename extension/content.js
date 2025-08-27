// content.js — scrape ONLY Q&A, rebuild minimal conversation, chunked upload via background
// No CSS injection here (to avoid breaking Grok). All styling happens in background.js.

// ===================== helpers =====================
const CHUNK_SIZE = 128 * 1024;

function log(...a){ try{ console.log('[TechX content]', ...a); }catch{} }

function stripDangerousAndAttrs(root) {
  root.querySelectorAll('script,style,link,iframe,object,embed,svg,button').forEach(n => n.remove());
  root.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      const n = attr.name.toLowerCase();
      if (n === 'style' || n.startsWith('on') || n.startsWith('data-') || n.startsWith('aria-')) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return root;
}

function sanitizeAssistantHTML(sourceEl) {
  const clone = sourceEl.cloneNode(true);
  stripDangerousAndAttrs(clone);
  return clone.innerHTML;
}

function sanitizeUserText(el) {
  const txt = (el.innerText || el.textContent || '').replace(/\u00A0/g, ' ').trim();
  return txt;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===================== collect messages =====================
// Heuristics for Grok-like pages:
// - USER:    .items-end .message-bubble  (right bubble)
// - ASSIST:  .items-start .response-content-markdown (answer area)
function collectMessages() {
  const root =
    document.getElementById('last-reply-container') ||
    document.querySelector('#last-reply-container') ||
    document.querySelector('[data-testid="messages"]') ||
    document.querySelector('main') || document.body;

  if (!root) return [];

  const messages = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node) {
        try {
          if (!(node instanceof Element)) return NodeFilter.FILTER_SKIP;
          if (node.matches('.items-end .message-bubble')) return NodeFilter.FILTER_ACCEPT;        // user
          if (node.matches('.items-start .response-content-markdown')) return NodeFilter.FILTER_ACCEPT; // assistant
          return NodeFilter.FILTER_SKIP;
        } catch { return NodeFilter.FILTER_SKIP; }
      }
    }
  );

  let n;
  while ((n = walker.nextNode())) {
    if (n.matches('.items-end .message-bubble')) {
      messages.push({ role: 'user', text: sanitizeUserText(n) });
    } else {
      messages.push({ role: 'assistant', html: sanitizeAssistantHTML(n) });
    }
  }

  return messages.filter(m => (m.role === 'user' ? m.text : m.html)?.length);
}

// ===================== rebuild minimal HTML (no chrome around it) =====================
function buildMinimalConversationHTML(messages) {
  const start = `<div class="flex w-full flex-col" id="last-reply-container" style="--gutter-width: calc((100cqw - var(--content-width)) / 2);">`;
  const end   = `</div>`;
  const parts = [start];

  for (const m of messages) {
    if (m.role === 'user') {
      parts.push(
`<div class="flex flex-col items-center">
  <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-0.5 items-end">
    <div dir="auto" class="message-bubble rounded-3xl text-primary min-h-7 prose break-words bg-surface-l2 border border-border-l1 max-w-[100%] sm:max-w-[90%] px-4 py-2.5 rounded-br-lg">
      <span class="whitespace-pre-wrap">${escapeHtml(m.text)}</span>
      <section class="inline-media-container flex flex-col gap-1"></section>
      <section class="auth-notification flex flex-col gap-1"></section>
    </div>
  </div>
</div>`
      );
    } else {
      parts.push(
`<div class="flex flex-col items-center">
  <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-0.5 items-start">
    <div dir="auto" class="message-bubble rounded-3xl text-primary min-h-7 prose break-words w-full max-w-none">
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

// ===================== chunked upload to SW =====================
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

// ===================== entry point from popup =====================
let busy = false;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (window !== window.top) return; // top frame only
  const isScrape = msg && (msg.type === "TECHX_SCRAPE" || msg.action === "scrape");
  if (!isScrape) return;

  if (busy) { sendResponse({ ok:false, error:"Busy" }); return; }

  busy = true;
  (async () => {
    try {
      const model = (msg && msg.model) || "Grok";
      const messages = collectMessages();
      const minimalHtml = buildMinimalConversationHTML(messages.length ? messages : []);
      const resp = await uploadInChunks(minimalHtml, {
        model,
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

log('TechX content script ready (Q&A only):', location.href);
