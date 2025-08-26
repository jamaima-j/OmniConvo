console.log("TechX content script loaded");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "scrape") {
    try {
      const convoHtml = getConversationHtml();
      sendResponse({ htmlDoc: convoHtml });
    } catch (e) {
      console.error("Scrape failed:", e);
      sendResponse({ error: String(e) });
    }
  }
  return true;
});

function getConversationHtml() {
  const bubbles = document.querySelectorAll(
    ".message-bubble, .response-content-markdown"
  );

  if (!bubbles.length) {
    console.warn("No conversation bubbles found");
    return "";
  }

  let convo = "";
  bubbles.forEach((b, i) => {
    // Add role class for styling
    if (b.classList.contains("message-bubble")) {
      convo += `<div class="bubble user">Q: ${b.innerText}</div>`;
    } else {
      convo += `<div class="bubble ai">A: ${b.innerText}</div>`;
    }
  });

  // Wrap with styled HTML template
  return `
  <html>
    <head>
      <meta charset="utf-8"/>
      <title>Conversation</title>
      <style>
        body {
          font-family: system-ui, sans-serif;
          background: #fff;
          color: #111;
          max-width: 750px;
          margin: auto;
          padding: 30px;
        }
        header {
          text-align: center;
          margin-bottom: 2rem;
        }
        header h1 {
          font-size: 1.8rem;
          margin-bottom: 0.5rem;
        }
        header small {
          color: #666;
          font-size: 0.9rem;
        }
        .bubble {
          padding: 12px 16px;
          border-radius: 16px;
          margin: 10px 0;
          line-height: 1.5;
        }
        .bubble.user {
          background: #f0f0f0;
          text-align: left;
          border: 1px solid #ddd;
        }
        .bubble.ai {
          background: #dff2ff;
          border: 1px solid #b8e1f5;
        }
      </style>
    </head>
    <body>
      <header>
        <h1>Conversation #{{CONVO_NUMBER}}</h1>
        <small>from Grok</small>
      </header>
      ${convo}
    </body>
  </html>
  `;
}
