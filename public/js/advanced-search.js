// Advanced search syntax helpers — client-side only, no server calls.
// Parses and explains special operators like site:, filetype:, etc.
// Integrates with the main search form to show hints and validate syntax.

(function () {
  "use strict";

  // Supported operators and their descriptions.
  var OPERATORS = [
    { op: "site:",      example: "site:github.com",       desc: "Limit results to a specific domain" },
    { op: "filetype:",  example: "filetype:pdf",           desc: "Filter by file type" },
    { op: "-",          example: "-word",                  desc: "Exclude a word from results" },
    { op: "\"\"",       example: "\"exact phrase\"",       desc: "Search for an exact phrase" },
    { op: "OR",         example: "cats OR dogs",           desc: "Match either term" },
    { op: "intitle:",   example: "intitle:privacy",        desc: "Word must appear in the title" },
    { op: "inurl:",     example: "inurl:blog",             desc: "Word must appear in the URL" },
  ];

  // Parse a query string and extract any operators present.
  function parseOperators(q) {
    if (!q) return { clean: "", operators: [] };
    var found = [];
    var clean = q;

    // site: operator
    var siteMatches = q.match(/\bsite:([\w.-]+)/gi) || [];
    siteMatches.forEach(function (m) { found.push({ type: "site", value: m }); });

    // filetype: operator
    var ftMatches = q.match(/\bfiletype:(\w+)/gi) || [];
    ftMatches.forEach(function (m) { found.push({ type: "filetype", value: m }); });

    // intitle: operator
    var titleMatches = q.match(/\bintitle:(\S+)/gi) || [];
    titleMatches.forEach(function (m) { found.push({ type: "intitle", value: m }); });

    // inurl: operator
    var urlMatches = q.match(/\binurl:(\S+)/gi) || [];
    urlMatches.forEach(function (m) { found.push({ type: "inurl", value: m }); });

    // Quoted phrases
    var quoteMatches = q.match(/"[^"]+"/g) || [];
    quoteMatches.forEach(function (m) { found.push({ type: "phrase", value: m }); });

    // Exclusions
    var exclMatches = q.match(/\B-\w+/g) || [];
    exclMatches.forEach(function (m) { found.push({ type: "exclude", value: m }); });

    return { clean: clean, operators: found };
  }

  // Build a hint string for the current query.
  function buildHint(q) {
    if (!q || q.length < 3) return null;
    var parsed = parseOperators(q);
    if (parsed.operators.length > 0) {
      var labels = parsed.operators.map(function (o) {
        if (o.type === "site") return "Filtering to domain: " + o.value.replace("site:", "");
        if (o.type === "filetype") return "File type: " + o.value.replace("filetype:", "");
        if (o.type === "phrase") return "Exact phrase: " + o.value;
        if (o.type === "exclude") return "Excluding: " + o.value.slice(1);
        if (o.type === "intitle") return "Title must contain: " + o.value.replace("intitle:", "");
        if (o.type === "inurl") return "URL must contain: " + o.value.replace("inurl:", "");
        return o.value;
      });
      return labels.join(" · ");
    }
    return null;
  }

  // Show the operator cheat-sheet in a small popover.
  function showCheatSheet(anchor) {
    var existing = document.getElementById("adv-cheatsheet");
    if (existing) { existing.remove(); return; }
    var box = document.createElement("div");
    box.id = "adv-cheatsheet";
    box.style.cssText = [
      "position:absolute",
      "z-index:2000",
      "background:var(--bg-elev)",
      "border:1px solid var(--border)",
      "border-radius:10px",
      "padding:12px 16px",
      "box-shadow:var(--shadow)",
      "font-size:13px",
      "min-width:280px",
      "max-width:360px",
    ].join(";");
    var html = "<strong style='display:block;margin-bottom:8px;color:var(--text)'>Search operators</strong>";
    OPERATORS.forEach(function (o) {
      html += "<div style='margin-bottom:6px'>" +
        "<code style='background:var(--bg-elev-1);padding:1px 5px;border-radius:3px;font-size:12px;color:var(--accent)'>" +
        o.example + "</code>" +
        " <span style='color:var(--text-dim)'>" + o.desc + "</span></div>";
    });
    box.innerHTML = html;
    // Position below the anchor.
    var rect = anchor.getBoundingClientRect();
    box.style.top = (rect.bottom + window.scrollY + 6) + "px";
    box.style.left = (rect.left + window.scrollX) + "px";
    document.body.appendChild(box);
    // Close on outside click.
    setTimeout(function () {
      document.addEventListener("click", function handler(e) {
        if (!box.contains(e.target) && e.target !== anchor) {
          box.remove();
          document.removeEventListener("click", handler);
        }
      });
    }, 10);
  }

  // Export result set as JSON or CSV.
  function exportResults(format) {
    var cards = document.querySelectorAll(".result[data-url]");
    if (!cards.length) { alert("No results to export."); return; }
    var rows = [];
    cards.forEach(function (card) {
      var url = card.getAttribute("data-url") || "";
      var titleEl = card.querySelector(".title");
      var snippetEl = card.querySelector(".snippet, .preview-text");
      rows.push({
        url: url,
        title: titleEl ? titleEl.textContent.trim() : "",
        snippet: snippetEl ? snippetEl.textContent.trim().slice(0, 200) : "",
      });
    });
    var q = (document.getElementById("q") || {}).value || "results";
    var filename = "atomic-" + q.replace(/[^a-z0-9]/gi, "-").slice(0, 30);
    if (format === "json") {
      var blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
      downloadBlob(blob, filename + ".json");
    } else if (format === "csv") {
      var csv = "url,title,snippet\n" + rows.map(function (r) {
        return [r.url, r.title, r.snippet].map(function (v) {
          return '"' + String(v).replace(/"/g, '""') + '"';
        }).join(",");
      }).join("\n");
      var blob2 = new Blob([csv], { type: "text/csv" });
      downloadBlob(blob2, filename + ".csv");
    }
  }

  function downloadBlob(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  // Bind to the DOM once it's ready.
  document.addEventListener("DOMContentLoaded", function () {
    var qInput = document.getElementById("q");
    var qHero = document.getElementById("q-hero");
    var hintEl = document.getElementById("search-hint");

    function onInput(e) {
      if (!hintEl) return;
      var hint = buildHint(e.target.value || "");
      if (hint) {
        hintEl.textContent = hint;
        hintEl.classList.add("visible");
      } else {
        hintEl.classList.remove("visible");
      }
    }

    if (qInput) qInput.addEventListener("input", onInput);
    if (qHero) qHero.addEventListener("input", onInput);

    // Wire up the "?" help button if present.
    var helpBtn = document.getElementById("adv-help-btn");
    if (helpBtn) {
      helpBtn.addEventListener("click", function (e) {
        e.preventDefault();
        showCheatSheet(helpBtn);
      });
    }

    // Wire up export buttons.
    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-export]");
      if (!btn) return;
      e.preventDefault();
      exportResults(btn.getAttribute("data-export"));
    });
  });

  // Expose for use by app.js.
  window.atomicAdvSearch = { parseOperators: parseOperators, exportResults: exportResults };
})();
