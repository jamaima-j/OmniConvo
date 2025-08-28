import type { Conversation } from '@/types/conversation';

/** ===== Minimal,  CSS for archived pages ===== */
const ARCHIVE_CSS = `
:root{--fg:#111827;--muted:#6b7280;--line:#e5e7eb;--bg:#fff;--blue:#3b82f6;--green:#10b981;}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg);font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial}
.container{max-width:920px;margin:40px auto;padding:0 20px}
.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
.topbar a{color:#2563eb;text-decoration:underline}
.header{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.badge{font-size:12px;background:#111827;color:#fff;border-radius:999px;padding:2px 8px}
.card{border:1px solid var(--line);border-radius:14px;padding:16px;background:#fff}
.meta{display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-size:12px;margin-bottom:10px}
.human{background:#e8f2ff;border-left:3px solid var(--blue);padding:10px;border-radius:8px;margin:10px 0}
.assistant{background:#ecfdf5;border-left:3px solid var(--green);padding:10px;border-radius:8px;margin:10px 0}
pre{white-space:pre-wrap;word-break:break-word}
pre.code{background:#0b1220;color:#e5e7eb;border-radius:10px;padding:12px;overflow:auto}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace}
blockquote{border-left:3px solid var(--line);margin:8px 0;padding:6px 12px;color:var(--muted)}
hr{border:none;border-top:1px solid var(--line);margin:20px 0}
small{color:var(--muted)}
`;

/**safe helper: return null */
function firstGroup(html: string, re: RegExp): string | null {
  const m = re.exec(html);
  return (m && typeof m[1] === 'string') ? m[1] : null;
}

/** Try to grab just the conversation container from Grok pages; fallback sensibly. */
function extractConversationHtml(fullHtml: string): string {
  // 1) <main>...</main>
  const main = firstGroup(fullHtml, /<main[\s\S]*?>([\s\S]*?)<\/main>/i);
  if (main && main.trim().length > 200) return main;

  // 2) a div whose class includes conversation/messages/chat/thread
  const conv = firstGroup(
    fullHtml,
    /<div[^>]+class="[^"]*(?:conversation|messages|chat|thread)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  );
  if (conv && conv.trim().length > 200) return conv;

  
  const article = firstGroup(fullHtml, /<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (article && article.trim().length > 200) return article;

  
  const body = firstGroup(fullHtml, /<body[\s\S]*?>([\s\S]*?)<\/body>/i);
  return body ?? fullHtml;
}


function normalizeConversationHtml(html: string): string {
  let out = html;

  // Code blocks
  out = out.replace(/<pre(?![^>]*class=)/gi, '<pre class="code"');
  out = out.replace(/<pre\s+class="([^"]*)"/gi, (_m, cls) =>
    `<pre class="${cls.includes('code') ? cls : `${cls} code`}"`,
  );

  
  out = out.replace(
    /<p[^>]*>\s*(?:<strong>)?\s*Human:\s*(?:<\/strong>)?\s*([\s\S]*?)<\/p>/gi,
    '<div class="human">$1</div>'
  );
  out = out.replace(
    /<p[^>]*>\s*(?:<strong>)?\s*(Assistant|Grok):\s*(?:<\/strong>)?\s*([\s\S]*?)<\/p>/gi,
    '<div class="assistant">$2</div>'
  );

  
  out = out.replace(/<blockquote(?![^>]*class=)/gi, '<blockquote class="quote"');

  return out;
}


function renderArchiveHtml(bodyHtml: string, model = 'Grok') {
  const base = process.env.NEXT_PUBLIC_BASE_URL || '/';
  const when = new Date().toISOString();
  const title = `AI Archives • ${model}`;

  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>${ARCHIVE_CSS}</style>
<body>
  <div class="container">
    <div class="topbar">
      <a href="${base}">← Back to Conversations</a>
      <small>Saved ${when}</small>
    </div>
    <div class="header">
      <span class="badge">${model}</span>
      <strong>Conversation</strong>
    </div>
    <div class="card">
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}

/** extract a Grok share page into a structured, Conversation. */
export async function parseGrok(html: string): Promise<Conversation> {
  const raw = extractConversationHtml(html);
  const normalized = normalizeConversationHtml(raw);
  const pretty = renderArchiveHtml(normalized, 'Grok');

  return {
    model: 'Grok',
    content: pretty,                                    // store pretty HTML
    scrapedAt: new Date().toISOString(),
    sourceHtmlBytes: Buffer.byteLength(pretty, 'utf8'), // accurate byte count
  };
}
