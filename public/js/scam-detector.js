// Scam detector — check URLs and domains for fraud indicators
(function () {
  "use strict";

  // Add scam warning badges to results
  function initScamDetector() {
    const resultsContainer = document.getElementById("results");
    if (!resultsContainer) return;

    // Watch for new results
    const observer = new MutationObserver(() => {
      checkResultsForScams();
    });

    observer.observe(resultsContainer, {
      childList: true,
      subtree: true,
    });

    checkResultsForScams();
  }

  async function checkResultsForScams() {
    const results = document.querySelectorAll(".result");
    for (const result of results) {
      if (result.dataset.scamChecked) continue;
      result.dataset.scamChecked = "true";

      const link = result.querySelector("a[href]");
      if (!link) continue;

      const url = link.href;
      try {
        const domain = new URL(url).hostname;
        const badge = await checkDomainSafety(domain);
        if (badge) {
          const hostLine = result.querySelector(".host-line");
          if (hostLine) {
            hostLine.appendChild(badge);
          }
        }
      } catch (err) {
        // Ignore errors
      }
    }
  }

  async function checkDomainSafety(domain) {
    try {
      const res = await fetch("/api/check-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });

      if (!res.ok) return null;
      const data = await res.json();

      if (!data.trustScore) return null;

      const badge = document.createElement("span");
      badge.className = "scam-badge";

      if (data.riskLevel === "SAFE") {
        badge.className += " safe";
        badge.title = `Trust score: ${data.trustScore}/100`;
        badge.innerHTML = '✓ Safe';
      } else if (data.riskLevel === "CAUTION") {
        badge.className += " caution";
        badge.title = `Trust score: ${data.trustScore}/100 - Exercise caution`;
        badge.innerHTML = '⚠ Caution';
      } else if (data.riskLevel === "WARNING") {
        badge.className += " warning";
        badge.title = `Trust score: ${data.trustScore}/100 - Suspicious`;
        badge.innerHTML = '⚠ Warning';
      } else if (data.riskLevel === "DANGER") {
        badge.className += " danger";
        badge.title = `Trust score: ${data.trustScore}/100 - High risk`;
        badge.innerHTML = '🚫 Danger';
      }

      return badge;
    } catch (err) {
      return null;
    }
  }

  // Scam check modal
  function initScamCheckModal() {
    const modal = document.getElementById("scam-check-modal");
    const openBtn = document.getElementById("open-scam-check");
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

    // Bind check button
    const checkBtn = document.getElementById("scam-check-btn");
    const checkInput = document.getElementById("scam-check-input");
    const checkOutput = document.getElementById("scam-check-output");

    checkBtn?.addEventListener("click", async () => {
      const domain = checkInput?.value?.trim();
      if (!domain) return;

      checkOutput.innerHTML = '<span class="loading"></span> Checking...';

      try {
        const res = await fetch("/api/check-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain }),
        });

        const data = await res.json();
        if (data.error) {
          checkOutput.innerHTML = `<div class="error">${escapeHtml(data.error)}</div>`;
          return;
        }

        const riskColor = {
          SAFE: "green",
          CAUTION: "orange",
          WARNING: "red",
          DANGER: "darkred",
        }[data.riskLevel] || "gray";

        checkOutput.innerHTML = `
          <div class="scam-check-result" style="border-left: 4px solid ${riskColor}; padding: 16px;">
            <h4>${escapeHtml(domain)}</h4>
            <div class="scam-score">
              <span class="score-label">Trust Score:</span>
              <span class="score-value" style="color: ${riskColor};">${data.trustScore}/100</span>
            </div>
            <div class="scam-level">
              <span class="level-label">Risk Level:</span>
              <span class="level-value" style="color: ${riskColor}; font-weight: bold;">${data.riskLevel}</span>
            </div>
            ${data.isBlacklisted ? '<div class="blacklist-warning">⚠ This domain is blacklisted</div>' : ""}
            ${data.reports ? `<div class="reports-count">Reports: ${data.reports}</div>` : ""}
            <a href="${escapeHtml(data.url)}" target="_blank" rel="noopener" class="scam-link">View full report →</a>
          </div>
        `;
      } catch (err) {
        checkOutput.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initScamDetector();
      initScamCheckModal();
    });
  } else {
    initScamDetector();
    initScamCheckModal();
  }
})();

