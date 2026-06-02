// Advanced features — fact checking, query expansion, synthesis, etc.
(function () {
  "use strict";

  // Fact check modal
  function initFactCheck() {
    const modal = document.getElementById("fact-check-modal");
    const openBtn = document.getElementById("open-fact-check");
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

    // Bind fact check
    const checkBtn = document.getElementById("fact-check-btn");
    const claimInput = document.getElementById("fact-check-input");
    const output = document.getElementById("fact-check-output");

    checkBtn?.addEventListener("click", async () => {
      const claim = claimInput?.value?.trim();
      if (!claim) return;

      output.innerHTML = '<span class="loading"></span> Fact-checking...';

      try {
        // Get current search results
        const results = window.lastSearchResults || [];
        const res = await fetch("/api/ai/fact-check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claim, results }),
        });

        const data = await res.json();
        const verdictColor = {
          TRUE: "green",
          FALSE: "red",
          UNCLEAR: "orange",
        }[data.verdict] || "gray";

        output.innerHTML = `
          <div class="fact-check-result" style="border-left: 4px solid ${verdictColor}; padding: 16px;">
            <div class="verdict" style="color: ${verdictColor}; font-weight: bold; font-size: 18px;">
              ${escapeHtml(data.verdict)}
            </div>
            <p class="explanation">${escapeHtml(data.explanation)}</p>
          </div>
        `;
      } catch (err) {
        output.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });
  }

  // Query expansion
  function initQueryExpansion() {
    const expandBtn = document.getElementById("expand-query-btn");
    if (!expandBtn) return;

    expandBtn.addEventListener("click", async () => {
      const query = document.getElementById("q")?.value;
      if (!query) return;

      try {
        const res = await fetch("/api/ai/expand-query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        const data = await res.json();
        if (data.suggestions && Array.isArray(data.suggestions)) {
          showQuerySuggestions(data.suggestions);
        }
      } catch (err) {
        console.error("Query expansion failed:", err);
      }
    });
  }

  function showQuerySuggestions(suggestions) {
    const container = document.getElementById("query-suggestions");
    if (!container) return;

    container.innerHTML = suggestions
      .map(
        (s) =>
          `<button class="suggestion-btn" onclick="document.getElementById('q').value = '${escapeHtml(s)}'; document.getElementById('form').submit();">
            ${escapeHtml(s)}
          </button>`
      )
      .join("");
  }

  // Result synthesis
  function initSynthesis() {
    const synthesizeBtn = document.getElementById("synthesize-btn");
    if (!synthesizeBtn) return;

    synthesizeBtn.addEventListener("click", async () => {
      const query = document.getElementById("q")?.value;
      const results = window.lastSearchResults || [];

      if (!query || !results.length) return;

      const output = document.getElementById("synthesis-output");
      if (!output) return;

      output.innerHTML = '<span class="loading"></span> Synthesizing...';

      try {
        const res = await fetch("/api/ai/synthesize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, results }),
        });

        const data = await res.json();
        output.innerHTML = data.synthesis
          ? `<div class="synthesis-result">${escapeHtml(data.synthesis)}</div>`
          : `<div class="error">Failed to synthesize</div>`;
      } catch (err) {
        output.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });
  }

  // Summarize results
  function initResultSummarization() {
    const summarizeBtn = document.getElementById("summarize-results-btn");
    if (!summarizeBtn) return;

    summarizeBtn.addEventListener("click", async () => {
      const query = document.getElementById("q")?.value;
      const results = window.lastSearchResults || [];

      if (!query || !results.length) return;

      const output = document.getElementById("summary-output");
      if (!output) return;

      output.innerHTML = '<span class="loading"></span> Summarizing...';

      try {
        const res = await fetch("/api/ai/summarize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, results }),
        });

        const data = await res.json();
        output.innerHTML = data.summary
          ? `<div class="summary-result">${escapeHtml(data.summary)}</div>`
          : `<div class="error">Failed to summarize</div>`;
      } catch (err) {
        output.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });
  }

  // Hotel search integration
  function initHotelSearch() {
    const searchBtn = document.getElementById("search-hotels-btn");
    if (!searchBtn) return;

    searchBtn.addEventListener("click", async () => {
      const query = document.getElementById("q")?.value;
      if (!query) return;

      const output = document.getElementById("hotels-output");
      if (!output) return;

      output.innerHTML = '<span class="loading"></span> Searching hotels...';

      try {
        const res = await fetch("/api/search-hotels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });

        const data = await res.json();
        if (data.error) {
          output.innerHTML = `<div class="error">${escapeHtml(data.error)}</div>`;
          return;
        }

        if (data.formatted?.html) {
          output.innerHTML = data.formatted.html;
        } else {
          output.innerHTML = `<div class="error">No hotels found</div>`;
        }
      } catch (err) {
        output.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });
  }

  // Performance monitoring
  function initPerformanceMonitor() {
    const perfBtn = document.getElementById("show-perf-btn");
    if (!perfBtn) return;

    perfBtn.addEventListener("click", async () => {
      try {
        const res = await fetch("/api/performance");
        const data = await res.json();

        const modal = document.getElementById("perf-modal");
        if (modal) {
          const content = modal.querySelector(".modal-body");
          if (content) {
            content.innerHTML = `
              <div class="perf-stats">
                <h3>Performance Metrics</h3>
                <div class="stat">
                  <span class="label">Uptime:</span>
                  <span class="value">${formatUptime(data.uptime)}</span>
                </div>
                <div class="stat">
                  <span class="label">Heap Used:</span>
                  <span class="value">${data.memory.heapUsed}MB / ${data.memory.heapTotal}MB</span>
                </div>
                <div class="stat">
                  <span class="label">External Memory:</span>
                  <span class="value">${data.memory.external}MB</span>
                </div>
                <div class="stat">
                  <span class="label">Timestamp:</span>
                  <span class="value">${new Date(data.timestamp).toLocaleString()}</span>
                </div>
              </div>
            `;
            modal.hidden = false;
          }
        }
      } catch (err) {
        console.error("Performance fetch failed:", err);
      }
    });
  }

  function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${days}d ${hours}h ${mins}m`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize all features
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initFactCheck();
      initQueryExpansion();
      initSynthesis();
      initResultSummarization();
      initHotelSearch();
      initPerformanceMonitor();
    });
  } else {
    initFactCheck();
    initQueryExpansion();
    initSynthesis();
    initResultSummarization();
    initHotelSearch();
    initPerformanceMonitor();
  }
})();

