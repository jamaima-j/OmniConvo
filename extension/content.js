// content.js 

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
// Collect *all* user + assistant messages in page order
function collectMessages() {
  const root =
    document.getElementById('last-reply-container') ||
    document.querySelector('#last-reply-container') ||
    document.querySelector('[data-testid="messages"]') ||
    document.querySelector('main') || document.body;

  if (!root) return [];

  const messages = [];
  const userNodes = root.querySelectorAll(".items-end .message-bubble");
  const assistantNodes = root.querySelectorAll(".items-start .response-content-markdown");

  const allNodes = [];
  userNodes.forEach(n => allNodes.push({ el: n, role: "user" }));
  assistantNodes.forEach(n => allNodes.push({ el: n, role: "assistant" }));

  // Preserve DOM order
  allNodes.sort((a, b) => {
    return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
  });

  for (const n of allNodes) {
    if (n.role === "user") {
      const txt = sanitizeUserText(n.el);
      if (txt) messages.push({ role: "user", text: txt });
    } else {
      const html = sanitizeAssistantHTML(n.el);
      if (html) messages.push({ role: "assistant", html });
    }
  }

  return messages;
}

// ===================== rebuild minimal HTML =====================
// Now label Q and A for clarity, keep your bubble CSS
function buildMinimalConversationHTML(messages) {
  const start = `<div class="flex w-full flex-col" id="last-reply-container" style="--gutter-width: calc((100cqw - var(--content-width)) / 2);">`;
  const end   = `</div>`;
  const parts = [start];

  let qCount = 1, aCount = 1;

  for (const m of messages) {
    if (m.role === 'user') {
      parts.push(
`<div class="flex flex-col items-center">
  <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-1 items-end">
    <div dir="auto" class="message-bubble rounded-3xl text-primary min-h-7 prose break-words bg-surface-l2 border border-border-l1 px-4 py-2.5 rounded-br-lg">
      <strong>Q${qCount++}:</strong> <span class="whitespace-pre-wrap">${escapeHtml(m.text)}</span>
    </div>
  </div>
</div>`
      );
    } else {
      parts.push(
`<div class="flex flex-col items-center">
  <div class="relative group flex flex-col justify-center w-full max-w-[var(--content-max-width)] pb-1 items-start">
    <div dir="auto" class="message-bubble rounded-3xl text-primary min-h-7 prose break-words w-full max-w-none">
      <strong>A${aCount++}:</strong>
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

log('TechX content script ready (Q&A full):', location.href);
