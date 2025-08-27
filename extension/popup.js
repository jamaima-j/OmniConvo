console.log("popup.js loaded");

function showBusy(busy) {
  const btn = document.getElementById("sharePublic");
  const loader = document.getElementById("sharePublicLoader");
  if (!btn || !loader) return;
  loader.style.display = busy ? "flex" : "none";
  btn.style.display = busy ? "none" : "flex";
}

async function postToServer(html, model = "Grok") {
  const form = new FormData();
  form.append("htmlDoc", new Blob([html], { type: "text/plain; charset=utf-8" }));
  form.append("model", model);

  const res = await fetch("https://jomniconvo.duckdns.org/api/conversation", { method: "POST", body: form });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0,300)}`);
  return data;
}

function sharePublic() {
  showBusy(true);
  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tabId = tabs?.[0]?.id;
    if (!tabId) {
      console.error("No active tab");
      alert("No active tab.");
      showBusy(false);
      return;
    }

    // 1) Try talking to the content script (event name 'SCRAPE_PAGE')
    chrome.tabs.sendMessage(tabId, { type: "SCRAPE_PAGE", model: "Grok" }, async (resp) => {
      const lastErr = chrome.runtime.lastError?.message;
      if (lastErr || !resp) {
        console.warn("[popup] No content script response → fallback inject", lastErr);

        try {
          // 2) Fallback: inject a tiny function to read HTML, then POST from the popup
          const [{ result: html }] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => document.documentElement?.innerHTML || ""
          });

            const MAX = 2_000_000;
            const payload = html.length > MAX ? html.slice(0, MAX) : html;

            const data = await postToServer(payload, "Grok");
            showBusy(false);
            if (data?.url) chrome.tabs.create({ url: data.url });
            else window.close();
            return;
        } catch (e) {
          console.error("[popup] Fallback failed:", e);
          alert("Share failed: " + (e?.message || e));
          showBusy(false);
          return;
        }
      }

      // 3) Content script path: handle its response
      if (!resp?.ok) {
        console.error("[popup] Scrape failed:", resp?.error || resp);
        alert("Share failed: " + (resp?.error || "Unknown error"));
        showBusy(false);
        return;
      }
      showBusy(false);
      if (resp.data?.url) chrome.tabs.create({ url: resp.data.url });
      else window.close();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("sharePublic")?.addEventListener("click", sharePublic);
});
