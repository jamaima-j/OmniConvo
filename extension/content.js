// content.js — TechX (Grok)
// Runs only in the top window, collects full chat, and sends a white, scoped HTML fragment.
// No page-wide dark mode. No duplicate saves.

(() => {
  if (window !== window.top) {
    console.debug("TechX: skip iframe", location.href);
    return;
  }
  if (window.__TECHX_ACTIVE__) return;
  window.__TECHX_ACTIVE__ = true;
  console.log("TechX content script ready (top):", location.href);
})();

function escapeHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Trim buttons/badges/etc. from assistant HTML
function stripNoise(root) {
  const selectors = [
    "button",
    ".citation",
    ".action-buttons",
    ".search-results",
    "form",
    "script",
    "style",
    "[contenteditable]",
  ];
  selectors.forEach((sel) => root.querySelectorAll(sel).forEach((n) => n.remove()));
  return root;
}

// Grab ALL turns in DOM order (user + assistant)
function collectConversation() {
  const nodes = document.querySelectorAll(
    ".message-bubble .whitespace-pre-wrap, .response-content-markdown"
  );

  /** @type {Array<{role:'user'|'assistant', text?:string, html?:string}>} */
  const turns = [];

  nodes.forEach((el) => {
    if (el.classList.contains("whitespace-pre-wrap")) {
      const text = (el.textContent || "").trim();
      if (!text) return;
      const last = turns[turns.length - 1];
      if (!(last && last.role === "user" && last.text === text)) {
        turns.push({ role: "user", text });
      }
    } else {
      const clone = el.cloneNode(true);
      stripNoise(clone);
      const html = (clone.innerHTML || "").trim();
      if (!html) return;
      const last = turns[turns.length - 1];
      if (!(last && last.role === "assistant" && last.html === html)) {
        turns.push({ role: "assistant", html });
      }
    }
  });

  return turns;
}

// Build a SAFE, SCOPED, WHITE-BG fragment (not a full <html> doc)
function buildHtmlFragment(turns) {
  const css = `
    .techx-doc{ background:#ffffff; color:#111827; font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial; }
    .techx-doc .wrap{ max-width:900px; margin:0 auto; padding:24px 16px 48px; }
    .techx-doc .bubble{ border:1px solid #e5e7eb; border-radius:18px; padding:12px 14px; margin:10px 0; background:#fff; color:#111827; }
    .techx-doc .bubble.me{ background:#f3f4f6; max-width:80%; margin-left:auto; border-bottom-right-radius:6px; }
    .techx-doc .bubble.bot{ background:#ffffff; max-width:100%; border-left:3px solid #7c3aed; }
    .techx-doc .markdown :is(p,li){ line-height:1.6; }
    .techx-doc pre{ background:#0f1115; color:#e5e7eb; border:1px solid #1f2937; border-radius:12px; padding:12px; overflow:auto; }
    .techx-doc code:not(pre code){ background:#f3f4f6; border:1px solid #e5e7eb; border-radius:6px; padding:2px 6px; }
    .techx-doc a{ color:#2563eb; }
  `;

  const body = turns
    .map((t) =>
      t.role === "user"
        ? `<div class="bubble me"><div>${escapeHtml(t.text).replace(/\n/g, "<br>")}</div></div>`
        : `<div class="bubble bot"><div class="markdown">${t.html}</div></div>`
    )
    .join("\n");

  return `<style>${css}</style><div class="techx-doc"><div class="wrap">${body}</div></div>`;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const wants = msg?.type === "TECHX_SCRAPE" || msg?.action === "scrape";
  if (!wants) return;

  // immediate ack so popup doesn't think content script is missing
  sendResponse({ ok: true, acknowledged: true });

  try {
    const model = typeof msg?.model === "string" ? msg.model : "Grok";
    const turns = collectConversation();

    if (!turns.length) {
      console.warn("TechX: no turns found");
      return;
    }

    const htmlDoc = buildHtmlFragment(turns);

    // Send exactly once (top window only)
    chrome.runtime.sendMessage(
      { type: "SAVE_CONVO", payload: { htmlDoc, model } },
      (resp) => {
        if (chrome.runtime.lastError) {
          console.error("TechX background error:", chrome.runtime.lastError.message);
          return;
        }
        console.log("SAVE_CONVO response:", resp);
      }
    );
  } catch (e) {
    console.error("TechX scrape failed:", e);
  }
});
