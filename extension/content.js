// content.js — TechX: scrape ALL Q&A (global selectors), no page styling changes

// ===================== helpers =====================
const CHUNK_SIZE = 128 * 1024;

function log(...a){ try{ console.log('[TechX content]', ...a); }catch{} }

function delay(ms){ return new Promise(r => setTimeout(r, ms)); }

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
  return (el.innerText || el.textContent || '').replace(/\u00A0/g, ' ').trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===================== preload ALL messages =====================
// Many UIs lazy-load older messages when you reach the top.
// We scroll the *page* (not #last-reply-container) to trigger it.
async function preloadAllMessages() {
  const scroller = document.scrollingElement || document.documentElement || document.body;
  let lastHeight = -1;
  for (let i = 0; i < 40; i++) {         // up to ~20s total
    window.scrollTo(0, 0);
    await delay(500);
    const h = scroller.scrollHeight;
    if (h === lastHeight) break;         // no more loading
    lastHeight = h;
  }
  // bring back to bottom so last pair is also present
  window.scrollTo(0, scroller.scrollHeight);
  log('Preload done. scrollHeight=', lastHeight);
}

// ===================== collect messages (GLOBAL) =====================
// We query the whole document so we don't get trapped in #last-reply-container.
function collectMessages() {
  // Primary selectors seen on Grok-ish UIs
  let nodes = Array.from(document.querySelectorAll(
    '.items-end .message-bubble, .items-start .response-content-markdown'
  ));

  // Fallbacks if theme/markup changes
  if (nodes.length < 2) {
    const all = Array.from(document.querySelectorAll('.message-bubble, .response-content-markdown'));
    nodes = all.filter(n => {
      if (!(n instanceof Element)) return false;
      if (n.closest('.items-end')) return true;     // user
      if (n.closest('.items-start')) return true;   // assistant
      return false;
    });
  }

  log('Found candidate nodes:', nodes.length);

  const messages = [];
  for (const el of nodes) {
    const isUser = !!el.closest('.items-end');
    if (isUser) {
      const text = sanitizeUserText(el);
      if (text) messages.push({ role: 'user', text });
      continue;
    }
    // assistant: prefer inner .response-content-markdown if bubble matched
    const ans = el.matches('.response-content-markdown') ? el : (el.querySelector('.response-content-markdown') || el);
    const html = sanitizeAssistantHTML(ans);
    if (html && html.replace(/\s+/g,'').length) messages.push({ role: 'assistant', html });
  }

  return messages;
}

// ===================== rebuild minimal HTML (with Q/A labels) =====================
function buildMinimalConversationHTML(messages) {
  const start = `<div class="flex w-full flex-col" id="last-reply-container" style="--gutter-width: calc((100cqw - var(--content-width)) / 2);">`;
  const end   = `</div>`;
  const parts = [start];

  let q = 1, a = 1;
  for (const m of messages) {
    if (m.role === 'user') {
      parts.push(
`<div class="flex flex-col items-center" style="margin:12px 0;">
  <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] items-end">
    <div dir="auto" class="message-bubble rounded-3xl text-primary min-h-7 prose break-words bg-surface-l2 border border-border-l1 max-w-[100%] sm:max-w-[90%] px-4 py-2.5 rounded-br-lg">
      <strong style="display:block;margin-bottom:4px;">Q${q++}:</strong>
      <span class="whitespace-pre-wrap">${escapeHtml(m.text)}</span>
    </div>
  </div>
</div>`
      );
    } else {
      parts.push(
`<div class="flex flex-col items-center" style="margin:12px 0;">
  <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] items-start">
    <div dir="auto" class="message-bubble rounded-3xl text-primary min-h-7 prose break-words w-full max-w-none" style="background:#e0f2ff;border:1px solid #e5e7eb;padding:.65rem .9rem;">
      <strong style="display:block;margin-bottom:4px;">A${a++}:</strong>
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
      source: meta.source || "grok-web",
      sourceUrl: location.href,
      url: location.href,           // helps MCP (background accepts url OR sourceUrl)
      saveTo: meta.saveTo ?? "both"  // "remote" | "mcp" | "both"
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

      // ✅ make sure all older messages are mounted
      await preloadAllMessages();

      const messages = collectMessages();
      log('Collected messages:', messages.length);

       const minimalHtml = buildMinimalConversationHTML(messages);
      const resp = await uploadInChunks(minimalHtml, {
        model,
        source: "grok-web",
        title: document.title || "Saved Conversation",
        saveTo: msg?.saveTo ?? "both"  // let popup choose: "remote" | "mcp" | "both"
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

log('TechX content script ready (global Q&A):', location.href);
