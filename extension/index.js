// background.js (service worker or background script)

let isRequesting = false;
let model = "ChatGPT";

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === "scrape") scrape();
  if (request.action === "model") model = request.model;
  sendResponse({ success: true });
});

async function scrape() {
  if (isRequesting) return;
  const htmlDoc = await getActiveTabHtml();
  if (!htmlDoc) return;

  isRequesting = true;
  const apiUrl = "https://jomniconvo.duckdns.org/api/conversation";

  const body = new FormData();
  body.append(
    "htmlDoc",
    new Blob([htmlDoc], { type: "text/plain; charset=utf-8" })
  );
  body.append("model", model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(apiUrl, { method: "POST", body, signal: controller.signal });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || `HTTP ${res.status}`);

    const origin = new URL(apiUrl).origin;
    const dest =
      typeof payload.url === "string" && payload.url
        ? `${origin}${payload.url}`
        : `${origin}/c/${payload.id}`;

    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url: dest });
    } else {
      window.open(dest, "_blank", "noopener,noreferrer");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error saving conversation:", msg);
  } finally {
    clearTimeout(timeoutId);
    isRequesting = false;
  }
}

// helper: grab HTML of active tab
async function getActiveTabHtml() {
  if (!chrome?.tabs?.query) {
    console.error("chrome.tabs.query is not available – extension context?");
    return '';
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return '';

  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => document.documentElement.innerHTML
    });
    return result?.result || '';
  } catch (err) {
    console.error("Failed to scrape tab HTML:", err);
    return '';
  }
}

