// content.js
(() => {
  try {
    document.documentElement.setAttribute("data-techx", "1");
    console.log("TechX content script ready (frame):", window.location.href);
  } catch (e) {
    console.warn("TechX: failed to mark document:", e);
  }
})();

function stripNoise(root) {
  const selectors = [
    "button",
    ".citation",
    ".action-buttons",
    ".search-results",
    "script",
    "style",
    "form",
    "svg"
  ];
  for (const sel of selectors) {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  }
  return root;
}

function extractLatestGrokQA() {
  const scope = document.querySelector("#last-reply-container") || document;

  const answers = scope.querySelectorAll(".response-content-markdown");
  const answerEl = answers.length ? answers[answers.length - 1] : null;

  const userTexts = scope.querySelectorAll(".message-bubble .whitespace-pre-wrap");
  const userEl = userTexts.length ? userTexts[userTexts.length - 1] : null;

  const questionText = userEl ? userEl.textContent || "" : "";
  let answerHTML = "";

  if (answerEl) {
    const clone = answerEl.cloneNode(true);
    stripNoise(clone);
    answerHTML = clone.innerHTML || "";
  }

  return { questionText, answerHTML };
}

function buildHtmlDoc({ questionText, answerHTML }) {
  const safeQ = (questionText || "").trim();
  const safeA = (answerHTML || "").trim();
  const title = safeQ ? `Grok: ${safeQ.slice(0, 80)}` : "Grok Conversation";

  const css = `
    :root { color-scheme: light dark; }
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; background: #0b0c10; color: #e6e6e6; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 24px 16px 48px; }
    .top { display:flex; align-items:center; gap:8px; padding:8px 0 20px; color:#9ca3af; font-size:12px; letter-spacing:.04em; text-transform:uppercase }
    .pill { border:1px solid #374151; padding:4px 10px; border-radius:999px; background:#0f1115; }
    .bubble { border: 1px solid #1f2937; border-radius: 18px; padding: 12px 14px; margin: 8px 0; }
    .me { background: #0f1115; color:#e5e7eb; max-width: 80%; margin-left:auto; border-bottom-right-radius: 6px; }
    .bot { background: #0b0c10; color:#e5e7eb; max-width: 100%; border-left: 2px solid #7c3aed; }
    .markdown :is(p,li) { line-height: 1.6; }
    pre { background:#0f1115; border:1px solid #1f2937; border-radius:12px; padding:12px; overflow:auto; }
    code:not(pre code) { background:#0f1115; border:1px solid #1f2937; border-radius:6px; padding:2px 6px; }
    a { color:#93c5fd; }
  `;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
  <div class="wrap">
    <div class="top"><span class="pill">Grok</span></div>
    ${safeQ ? `<div class="bubble me"><div class="markdown">${safeQ.replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\n/g,"<br>")}</div></div>` : ""}
    ${safeA ? `<div class="bubble bot"><div class="markdown">${safeA}</div></div>` : ""}
  </div>
</body>
</html>`;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const wantsScrape = msg?.type === "TECHX_SCRAPE" || msg?.action === "scrape";
  if (!wantsScrape) return;

  // Immediate ack
  sendResponse({ ok: true, acknowledged: true });

  try {
    const model = typeof msg?.model === "string" ? msg.model : "Grok";
    const { questionText, answerHTML } = extractLatestGrokQA();
    const htmlDoc = buildHtmlDoc({ questionText, answerHTML });

    chrome.runtime.sendMessage(
      { type: "SAVE_CONVO", payload: { htmlDoc, model } },
      (resp) => {
        if (chrome.runtime.lastError) {
          console.error("Background message error:", chrome.runtime.lastError.message);
          return;
        }
        console.log("SAVE_CONVO response:", resp);
      }
    );
  } catch (e) {
    console.error("Scrape failed:", e);
  }
});
