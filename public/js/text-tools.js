// Text tools — summarization, analysis, translation, etc.
(function () {
  "use strict";

  // Initialize text tools modal
  function initTextTools() {
    const modal = document.getElementById("text-tools-modal");
    const openBtn = document.getElementById("open-text-tools");
    const closeBtn = modal?.querySelector(".modal-close");

    if (!modal || !openBtn) return;

    openBtn.addEventListener("click", () => {
      modal.hidden = false;
    });

    closeBtn?.addEventListener("click", () => {
      modal.hidden = true;
    });

    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.hidden = true;
    });

    bindTextToolsHandlers();
  }

  function bindTextToolsHandlers() {
    // Summarize text
    const summarizeBtn = document.getElementById("summarize-text-btn");
    const summarizeInput = document.getElementById("summarize-input");
    const summarizeOutput = document.getElementById("summarize-output");

    summarizeBtn?.addEventListener("click", async () => {
      const text = summarizeInput?.value;
      if (!text) return;

      summarizeOutput.innerHTML = '<span class="loading"></span> Summarizing...';

      try {
        const res = await fetch("/api/ai/summarize-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, maxLength: 500 }),
        });

        const data = await res.json();
        summarizeOutput.innerHTML = data.summary
          ? `<div class="result-text">${escapeHtml(data.summary)}</div>`
          : `<div class="error">Failed to summarize</div>`;
      } catch (err) {
        summarizeOutput.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });

    // Analyze sentiment
    const sentimentBtn = document.getElementById("sentiment-btn");
    const sentimentInput = document.getElementById("sentiment-input");
    const sentimentOutput = document.getElementById("sentiment-output");

    sentimentBtn?.addEventListener("click", async () => {
      const text = sentimentInput?.value;
      if (!text) return;

      sentimentOutput.innerHTML = '<span class="loading"></span> Analyzing...';

      try {
        const res = await fetch("/api/ai/sentiment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        const data = await res.json();
        sentimentOutput.innerHTML = `
          <div class="sentiment-result">
            <div class="sentiment-badge ${data.sentiment.toLowerCase()}">${data.sentiment}</div>
            <p>${escapeHtml(data.analysis)}</p>
          </div>
        `;
      } catch (err) {
        sentimentOutput.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });

    // Extract entities
    const entitiesBtn = document.getElementById("entities-btn");
    const entitiesInput = document.getElementById("entities-input");
    const entitiesOutput = document.getElementById("entities-output");

    entitiesBtn?.addEventListener("click", async () => {
      const text = entitiesInput?.value;
      if (!text) return;

      entitiesOutput.innerHTML = '<span class="loading"></span> Extracting...';

      try {
        const res = await fetch("/api/ai/extract-entities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        const data = await res.json();
        const entities = data.entities || {};
        let html = '<div class="entities-result">';
        for (const [type, items] of Object.entries(entities)) {
          if (Array.isArray(items) && items.length) {
            html += `<div class="entity-group">
              <h4>${type}</h4>
              <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
            </div>`;
          }
        }
        html += "</div>";
        entitiesOutput.innerHTML = html;
      } catch (err) {
        entitiesOutput.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });

    // Translate text
    const translateBtn = document.getElementById("translate-btn");
    const translateInput = document.getElementById("translate-input");
    const translateLang = document.getElementById("translate-lang");
    const translateOutput = document.getElementById("translate-output");

    translateBtn?.addEventListener("click", async () => {
      const text = translateInput?.value;
      const lang = translateLang?.value;
      if (!text || !lang) return;

      translateOutput.innerHTML = '<span class="loading"></span> Translating...';

      try {
        const res = await fetch("/api/ai/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, targetLang: lang }),
        });

        const data = await res.json();
        translateOutput.innerHTML = data.translation
          ? `<div class="result-text">${escapeHtml(data.translation)}</div>`
          : `<div class="error">Failed to translate</div>`;
      } catch (err) {
        translateOutput.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });

    // Generate code
    const codeBtn = document.getElementById("code-btn");
    const codeInput = document.getElementById("code-input");
    const codeLang = document.getElementById("code-lang");
    const codeOutput = document.getElementById("code-output");

    codeBtn?.addEventListener("click", async () => {
      const desc = codeInput?.value;
      const lang = codeLang?.value;
      if (!desc || !lang) return;

      codeOutput.innerHTML = '<span class="loading"></span> Generating...';

      try {
        const res = await fetch("/api/ai/generate-code", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: desc, language: lang }),
        });

        const data = await res.json();
        codeOutput.innerHTML = data.code
          ? `<pre><code>${escapeHtml(data.code)}</code></pre>`
          : `<div class="error">Failed to generate code</div>`;
      } catch (err) {
        codeOutput.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });

    // Explain concept
    const explainBtn = document.getElementById("explain-btn");
    const explainInput = document.getElementById("explain-input");
    const explainOutput = document.getElementById("explain-output");

    explainBtn?.addEventListener("click", async () => {
      const concept = explainInput?.value;
      if (!concept) return;

      explainOutput.innerHTML = '<span class="loading"></span> Explaining...';

      try {
        const res = await fetch("/api/ai/explain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ concept }),
        });

        const data = await res.json();
        explainOutput.innerHTML = data.explanation
          ? `<div class="result-text">${escapeHtml(data.explanation)}</div>`
          : `<div class="error">Failed to explain</div>`;
      } catch (err) {
        explainOutput.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTextTools);
  } else {
    initTextTools();
  }
})();

