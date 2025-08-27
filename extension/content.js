// content.js
(() => {
  // Only in top frame, and bind once.
  if (window.top !== window) return;
  if (window.__TECHX_BOUND__) return;
  window.__TECHX_BOUND__ = true;
  console.log("TechX content script bound:", location.href);

  let isSaving = false;
  let lastHead = "";

  // Build a compact, Grok-like HTML of the whole thread
  function extractTranscriptHtml() {
    const userSel = '.message-bubble .whitespace-pre-wrap';
    const aiSel   = '.response-content-markdown';

    const items = [];
    const seen = new Set();

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!(el instanceof HTMLElement)) continue;

      if (el.matches(userSel) && !seen.has(el)) {
        seen.add(el);
        const txt = (el.textContent || "").trim();
        if (txt) items.push({ role: "user", html: `<p>${txt}</p>` });
      } else if (el.matches(aiSel) && !seen.has(el)) {
        seen.add(el);
        const html = el.innerHTML || "";
        if (html.trim()) items.push({ role: "assistant", html });
      }
    }

    if (!items.length) return "";

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Grok Conversation</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{--bg:#f7f7fb;--fg:#111;--muted:#6b7280;--ring:#e5e7eb;--user:#eef4ff;--ai:#f0f9ff;}
  html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);font:14px/1.55 system-ui,-apple-system,Segoe UI,Roboto,Arial;}
  .wrap{max-width:860px;margin:24px auto;padding:16px}
  .meta{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;color:var(--muted);font-size:12px}
  .chip{display:inline-flex;align-items:center;font-size:11px;border:1px solid #e9d5ff;background:#faf5ff;color:#6d28d9;border-radius:999px;padding:2px 8px}
  .bubble{border-radius:14px;padding:12px 14px;border:1px solid var(--ring);margin:8px 0}
  .user{background:var(--user)}
  .assistant{background:var(--ai)}
  .assistant pre{white-space:pre;overflow:auto;border:1px solid var(--ring);border-radius:8px;padding:10px;margin:8px 0}
  .assistant code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
</style>
</head>
<body>
  <div class="wrap">
    <div class="meta"><div>Model: Grok</div><div class="chip">Source: Grok</div></div>
    ${items.map(m => `<div class="bubble ${m.role}">${m.html}</div>`).join("")}
  </div>
</body>
</html>`;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "TECHX_SCRAPE" && msg?.action !== "scrape") return;

    if (isSaving) {
      sendResponse({ ok: false, error: "busy" });
      return true;
    }

    try {
      const htmlDoc = extractTranscriptHtml();
      if (!htmlDoc) {
        sendResponse({ ok: false, error: "Nothing to scrape" });
        return true;
      }

      const head = htmlDoc.slice(0, 4096);
      if (head === lastHead) {
        sendResponse({ ok: true, dedup: true }); // already sent this exact content
        return true;
      }

      isSaving = true;
      chrome.runtime.sendMessage(
        { type: "SAVE_CONVO", payload: { htmlDoc, model: "Grok" } },
        (resp) => {
          isSaving = false;
          if (resp?.ok) lastHead = head;
          sendResponse(resp);
        }
      );
    } catch (e) {
      isSaving = false;
      sendResponse({ ok: false, error: String(e) });
    }
    return true; // async
  });
})();
