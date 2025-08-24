'use strict';
let isRequesting = false;
let model = 'ChatGPT';

chrome.runtime.onMessage.addListener(function (request, _, sendResponse) {
  if (request.action === 'scrape') {
    scrape()
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
    return true; // keep channel open for async sendResponse
  }
 if (request.action === 'model' && typeof request.model === 'string') {
    model = request.model;
    sendResponse({ ok: true });
    return; // sync response is fine
  }
});

async function scrape() {
  const htmlDoc = document.documentElement.innerHTML;
  if (!htmlDoc || isRequesting) return;

  isRequesting = true;

  const apiUrl = `https://jomniconvo.duckdns.org/api/conversation`;
  
  const body = new FormData();

  // raw HTML
  body.append('htmlDoc', new Blob([htmlDoc], { type: 'text/plain; charset=utf-8' }));
  // model
  body.append('model', model);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(apiUrl, { method: 'POST', body, signal: controller.signal });
    const text = await res.text();

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`Expected JSON, got: ${text.slice(0, 200)}`);
    }

    const { url } = data || {};
    if (!url) throw new Error('Server did not return a URL');

    // Copy permalink (best-effort)
    try { await navigator.clipboard.writeText(url); } catch {}

    // Little success toast
    try {
      const toast = document.createElement('div');
      toast.textContent = 'Saved! URL copied to clipboard';
      Object.assign(toast.style, {
        position: 'fixed', bottom: '20px', right: '20px',
        background: '#111827', color: '#fff', padding: '10px 12px',
        borderRadius: '10px', zIndex: 999999, fontSize: '13px'
      });
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 2200);
    } catch {}

    window.open(url, '_blank');
  } catch (err) {
    alert(`Error saving conversation: ${err?.message || err}`);
  } finally {
    clearTimeout(timer);
    isRequesting = false; // <- important so you can save again
  }
}