// background.js or service worker

let isRequesting = false;
let model = 'ChatGPT';

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'scrape') scrape();
  if (request.action === 'model') model = request.model;
  sendResponse({ success: true });
});

async function scrape() {
  if (isRequesting) return;
  const htmlDoc = await getActiveTabHtml();
  if (!htmlDoc) return;

  isRequesting = true;
  const apiUrl = 'https://jomniconvo.duckdns.org/api/conversation';

  const body = new FormData();
  body.append('htmlDoc', new Blob([htmlDoc], { type: 'text/plain; charset=utf-8' }));
  body.append('model', model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(apiUrl, { method: 'POST', body, signal: controller.signal });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);

    // Use the canonical URL from the server; fall back to /c/:id
    const origin = new URL(apiUrl).origin;
    const dest = (typeof payload.url === 'string' && payload.url)
      ? payload.url
      : `${origin}/c/${payload.id}`;

    if (chrome?.tabs?.create) chrome.tabs.create({ url: dest });
    else window.open(dest, '_blank', 'noopener,noreferrer');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Error saving conversation:', msg);
    // optional: alert(msg);
  } finally {
    clearTimeout(timeoutId);
    isRequesting = false;
  }
}

// helper: grab HTML of active tab
async function getActiveTabHtml() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return '';
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.documentElement.innerHTML
  });
  return result || '';
}
