// content.js  — Grok-focused scraper (MV3 content script)

(function () {
  const ORIGIN = 'https://jomniconvo.duckdns.org';

  // Util: simple HTML escaper for the user bubble
  const escapeHtml = (s) =>
    (s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  // Build a minimal, styled HTML page that looks close to Grok
  function buildHtmlDoc({ promptText, answerHtml }) {
    const q = promptText ? `
      <div class="bubble user">
        <div class="label">Q:</div>
        <div class="content">${escapeHtml(promptText)}</div>
      </div>` : '';

    const a = `
      <div class="bubble ai">
        <div class="label">A:</div>
        <div class="content markdown">${answerHtml || ''}</div>
      </div>`;

    // Keep CSS small; preserve code blocks exactly as Grok renders (<pre><code>)
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Conversation</title>
  <style>
    :root{
      --bg:#fff; --fg:#111; --muted:#6b7280;
      --user:#f3f4f6; --ai:#e8f0ff;
      --border:#e5e7eb; --card:#fafafa;
      --max:780px;
    }
    @media (prefers-color-scheme: dark){
      :root{ --bg:#0b0b0c; --fg:#e5e7eb; --muted:#9ca3af;
             --user:#15171a; --ai:#0f172a; --border:#1f2937; --card:#0d1117; }
    }
    html,body{background:var(--bg); color:var(--fg); margin:0; padding:0;}
    .wrap{max-width:var(--max); margin:32px auto; padding:0 16px;}
    .meta{display:flex; gap:12px; font-size:12px; color:var(--muted); margin-bottom:12px;}
    .card{background:var(--card); border:1px solid var(--border); border-radius:12px; padding:16px;}
    .stack{display:flex; flex-direction:column; gap:14px;}
    .bubble{border-radius:14px; border:1px solid var(--border); padding:12px 14px;}
    .bubble.user{background:var(--user);}
    .bubble.ai{background:var(--ai);}
    .label{font-size:12px; font-weight:600; color:var(--muted); margin-bottom:6px;}
    .content{white-space:pre-wrap; line-height:1.55;}
    /* code blocks */
    .markdown pre{overflow:auto; border:1px solid var(--border); border-radius:10px; padding:12px; margin:10px 0;}
    .markdown code{font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size:13px;}
    .markdown pre code{display:block; white-space:pre;}
    .markdown a{color:inherit; text-decoration:underline dotted;}
    .topbar{display:flex; justify-content:space-between; align-items:center; margin:0 0 12px;}
    .back{font-size:13px; text-decoration:underline; color:var(--muted);}
  </style>
</head>
<body>
  <main class="wrap">
    <div class="topbar">
      <a class="back" href="${ORIGIN}">← Back to Conversations</a>
      <a class="back" target="_blank" rel="noopener" href="${ORIGIN}">Open raw HTML</a>
    </div>
    <section class="card">
      <div class="stack">
        ${q}${a}
      </div>
    </section>
  </main>
</body>
</html>`;
  }

  function scrapeGrok() {
    // Grab the specific Grok DOM for the *last* exchange only.
    const root = document.querySelector('#last-reply-container');
    if (!root) return null;

    // The most recent user bubble (first block in the container)
    const userTextNode = root.querySelector(':scope > div:first-child .message-bubble span.whitespace-pre-wrap');
    const promptText = (userTextNode?.textContent || '').trim();

    // The most recent assistant response is in the *next* `.response-content-markdown`
    const answerNode = root.querySelector(':scope > div:nth-child(2) .response-content-markdown');
    const answerHtml = answerNode ? answerNode.innerHTML : '';

    if (!answerHtml) return null;
    return { promptText, answerHtml };
  }

  async function handleScrape() {
    const grok = scrapeGrok();
    if (!grok) {
      console.warn('Grok scrape failed: selectors not found.');
      return;
    }

    const htmlDoc = buildHtmlDoc(grok);

    // Send to background for POST -> server
    chrome.runtime.sendMessage(
      { type: 'SAVE_CONVO', payload: { htmlDoc, model: 'Grok' } },
      (resp) => {
        // (Background opens the new tab; nothing else to do)
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError.message);
        } else if (!resp?.ok) {
          console.error(resp?.error || 'Unknown error from background');
        }
      }
    );
  }

  // Listen for popup “scrape” request
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === 'scrape') handleScrape();
  });

  // Optional: auto-infer ‘Grok’ for your existing popup code
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.action === 'model') {
      // no-op; model handled in background by payload
    }
  });
})();
