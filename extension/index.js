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
    const res = await fetch('https://jomniconvo.duckdns.org/api/conversation', { method: 'POST', body });
    const contentType = res.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await res.json() : { raw: await res.text() };

    if (!res.ok) {
      const msg = typeof payload === 'object' ? JSON.stringify(payload).slice(0, 300) : String(payload).slice(0, 300);
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }

    // Prefer the canonical URL from the server
    const base = new URL(apiUrl).origin;
    const dest =
      payload.url
        ?? `${base}/c/${payload.slug ?? payload.id}`;

    // If this runs in the background/service worker:
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url: dest });
    } else {
      // Fallback if you're running this in a content script
      window.open(dest, '_blank', 'noopener,noreferrer');
    }
  } catch (err) {
    console.error('Error saving conversation:', err);
    alert(`Failed to save conversation: ${err.message}`);
  } finally {
    isRequesting = false;
  }
}