// Scam detector — check URLs and domains for fraud indicators.
// Uses /api/check-domain (heuristic + optional ScamAdviser, no API key needed).
(function () {
  "use strict";

  var SCAM_CACHE = {};

  // Add scam warning badges to results — only for WARNING/DANGER to avoid noise.
  function initScamDetector() {
    var resultsContainer = document.getElementById("results");
    if (!resultsContainer) return;

    // Watch for new results being injected
    var observer = new MutationObserver(function () {
      checkResultsForScams();
    });
    observer.observe(resultsContainer, { childList: true, subtree: false });
    checkResultsForScams();
  }

  function checkResultsForScams() {
    var results = document.querySelectorAll(".result[data-url]");
    Array.prototype.forEach.call(results, function (result) {
      if (result.dataset.scamChecked) return;
      result.dataset.scamChecked = "true";
      var url = result.dataset.url;
      if (!url) return;
      var domain;
      try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return; }
      checkDomainSafety(domain).then(function (badge) {
        if (!badge) return;
        var hostLine = result.querySelector(".host-line");
        if (hostLine) hostLine.appendChild(badge);
      }).catch(function () {});
    });
  }

  function checkDomainSafety(domain) {
    if (SCAM_CACHE[domain] !== undefined) {
      return Promise.resolve(SCAM_CACHE[domain]);
    }
    return fetch("/api/check-domain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domain }),
    }).then(function (res) {
      if (!res.ok) { SCAM_CACHE[domain] = null; return null; }
      return res.json();
    }).then(function (data) {
      if (!data || !data.riskLevel || data.riskLevel === "SAFE") {
        SCAM_CACHE[domain] = null;
        return null;
      }
      var badge = document.createElement("span");
      badge.className = "scam-badge";
      if (data.riskLevel === "CAUTION") {
        badge.className += " scam-caution";
        badge.title = "Caution: trust score " + (data.trustScore || "?") + "/100";
        badge.textContent = "⚠ Caution";
      } else if (data.riskLevel === "WARNING") {
        badge.className += " scam-warning";
        badge.title = "Warning: suspicious domain (score " + (data.trustScore || "?") + "/100)";
        badge.textContent = "⚠ Warning";
      } else if (data.riskLevel === "DANGER") {
        badge.className += " scam-danger";
        badge.title = "High risk: possible scam (score " + (data.trustScore || "?") + "/100)";
        badge.textContent = "🚫 Danger";
      }
      SCAM_CACHE[domain] = badge.cloneNode(true);
      return badge;
    }).catch(function () {
      SCAM_CACHE[domain] = null;
      return null;
    });
  }

  // Scam check modal — opened via "Check URL Safety" button
  function initScamCheckModal() {
    var modal = document.getElementById("scam-check-modal");
    var openBtn = document.getElementById("open-scam-check");
    if (!modal || !openBtn) return;

    openBtn.addEventListener("click", function () { modal.hidden = false; });

    var closeBtn = modal.querySelector(".modal-close");
    if (closeBtn) closeBtn.addEventListener("click", function () { modal.hidden = true; });
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.hidden = true; });

    var checkBtn = document.getElementById("scam-check-btn");
    var checkInput = document.getElementById("scam-check-input");
    var checkOutput = document.getElementById("scam-check-output");
    if (!checkBtn || !checkInput || !checkOutput) return;

    checkBtn.addEventListener("click", function () {
      var input = (checkInput.value || "").trim();
      if (!input) return;
      checkOutput.innerHTML = '<span class="loading"></span> Analysing…';
      fetch("/api/check-scam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: input }),
      }).then(function (res) { return res.json(); }).then(function (data) {
        if (!data || data.error) {
          checkOutput.innerHTML = '<p class="hint" style="color:var(--danger)">' + escHtml(data && data.error || "Analysis failed.") + "</p>";
          return;
        }
        var colors = { SAFE: "var(--ok,#16a34a)", CAUTION: "var(--warn,#f59e0b)", WARNING: "var(--danger,#dc2626)", DANGER: "var(--danger,#dc2626)" };
        var color = colors[data.riskLevel] || "var(--text-mute)";
        var flagsHtml = (data.flags && data.flags.length)
          ? "<ul style='margin:8px 0 0;padding-left:18px'>" + data.flags.map(function (f) { return "<li>" + escHtml(f) + "</li>"; }).join("") + "</ul>"
          : "";
        checkOutput.innerHTML =
          '<div style="border-left:4px solid ' + color + ';padding:12px 16px;border-radius:0 8px 8px 0;background:var(--bg-elev)">' +
          '<div style="font-size:18px;font-weight:700;color:' + color + '">' + escHtml(data.riskLevel || "UNKNOWN") + "</div>" +
          '<div style="margin:4px 0;font-size:13px;color:var(--text-mute)">Domain: <strong>' + escHtml(data.domain || input) + "</strong></div>" +
          '<div style="margin:4px 0">Trust score: <strong style="color:' + color + '">' + (data.trustScore != null ? data.trustScore + "/100" : "N/A") + "</strong></div>" +
          (data.isBlacklisted ? '<div style="color:var(--danger);margin-top:6px">⚠ Domain is blacklisted</div>' : "") +
          (data.source === "heuristic" ? '<div style="font-size:11px;color:var(--text-mute);margin-top:6px">Analysis: local heuristics (no external API)</div>' : "") +
          flagsHtml +
          '<div style="margin-top:10px"><a href="' + escHtml(data.url || "#") + '" target="_blank" rel="noopener noreferrer" style="font-size:13px;color:var(--accent)">View on ScamAdviser →</a></div>' +
          "</div>";
      }).catch(function (err) {
        checkOutput.innerHTML = '<p class="hint" style="color:var(--danger)">Network error: ' + escHtml(err.message) + "</p>";
      });
    });

    // Allow pressing Enter in the input
    checkInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") checkBtn.click();
    });
  }

  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initScamDetector();
      initScamCheckModal();
    });
  } else {
    initScamDetector();
    initScamCheckModal();
  }
})();

