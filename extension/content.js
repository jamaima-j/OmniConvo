// content.js
(() => {
  if (window.top !== window) return; // prevent iframes double-firing
  console.log("TechX content script ready (top frame):", location.href);

  // Build a minimal transcript as our own HTML, so site CSS cannot black out the page.
  function extractTranscriptHtml() {
    // 1) Collect user messages (the small bubble text spans)
    const userNodes = Array.from(document.querySelectorAll(
      '.message-bubble .whitespace-pre-wrap'
    ));

    // 2) Collect assistant replies (markdown container)
    const aiNodes = Array.from(document.querySelectorAll(
      '.response-content-markdown'
    ));

    // Fallback: if we find nothing, return empty to avoid saving junk
    if (userNodes.length === 0 && aiNodes.length === 0) return "";

    // Pair them in order of appearance in the DOM — we’ll flatten by position
    // Use a list of {role, html, key} and dedupe by key(content hash)
    const items = [];
    const push = (role, el) => {
      const html = role === 'user'
        ? `<p>${(el.textContent || "").trim()}</p>`
        : (el.innerHTML || "");
      const key = (html || "").replace(/\s+/g, " ").trim();
      if (!key) return;
      if (items.length === 0 || items[items.length - 1].key !== key) {
        items.push({ role, html, key });
      }
    };

    // Traverse page order: find containers that hold bubbles to keep chronology
    const container = document.body;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, null);
    const seen = new Set();
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!(el instanceof HTMLElement)) continue;
      if (el.matches('.message-bubble .whitespace-pre-wrap') && !seen.has(el)) {
        seen.add(el);
        push('user', el);
      }
      if (el.matches('.response-content-markdown') && !seen.has(el)) {
        seen.add(el);
        push('assistant', el);
      }
    }

    // Build our own HTML doc with neutral CSS
    const doc = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Grok Conversation</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root{
      --bg:#f7f7fb; --fg:#111; --muted:#6b7280;
      --user:#e8f0ff; --ai:#edf7ff; --ring:#e5e7eb;
      --card:#fff;
    }
    html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,Segoe UI,Roboto,Arial;}
    .wrap{max-width:860px;margin:24px auto;padding:16px;}
    .header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
    .hdr-meta{font-size:12px;color:var(--muted)}
    .chip{display:inline-flex;align-items:center;font-size:11px;border:1px solid #e9d5ff;background:#faf5ff;color:#6d28d9;border-radius:999px;padding:2px 8px}
    .bubble{border-radius:14px;padding:12px 14px;border:1px solid var(--ring);margin:8px 0;max-width:100%}
    .user{background:var(--user)}
    .ai{background:var(--ai)}
    .ai pre{white-space:pre;overflow:auto;border:1px solid var(--ring);border-radius:8px;padding:10px;margin:8px 0}
    .ai code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <div class="hdr-meta">Model: Grok</div>
      <div class="hdr-meta"><span class="chip">Source: Grok</span></div>
    </div>
    ${items.map(it => `<div class="bubble ${it.role === 'user' ? 'user' : 'ai'}">${it.html}</div>`).join("")}
  </div>
</body>
</html>`;
    return doc;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type !== "TECHX_SCRAPE" && msg?.action !== "scrape") return;
    try {
      const htmlDoc = extractTranscriptHtml();
      if (!htmlDoc) {
        sendResponse({ ok: false, error: "Nothing to scrape" });
        return true;
      }
      chrome.runtime.sendMessage(
        { type: "SAVE_CONVO", payload: { htmlDoc, model: "Grok" } },
        (resp) => sendResponse(resp)
      );
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  });
})();
