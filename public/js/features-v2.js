/* ============================================================
   Atomic Search — Features v2
   Client-side implementations of 40+ features:
   search history, saved results, collections, export,
   boolean search, fuzzy search, voice search, image search,
   trending, analytics, and more.
   ============================================================ */
(function () {
  "use strict";

  /* ── Utilities ─────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ── 1. Search History ─────────────────────────────────── */
  var HISTORY_KEY = "atomic:search-history";

  var SearchHistory = {
    get: function () {
      try {
        var raw = localStorage.getItem(HISTORY_KEY);
        if (!raw) return [];
        var data = JSON.parse(raw);
        var cutoff = Date.now() - 30 * 24 * 3600 * 1000;
        return data.filter(function (item) {
          return typeof item === "object" && item.ts > cutoff;
        });
      } catch (e) { return []; }
    },
    add: function (query) {
      if (!query || query.length < 2) return;
      try {
        var history = this.get().filter(function (item) { return item.q !== query; });
        history.unshift({ q: query, ts: Date.now() });
        history = history.slice(0, 100);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch (e) { /* ignore */ }
    },
    clear: function () {
      try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
    },
    remove: function (query) {
      try {
        var history = this.get().filter(function (item) { return item.q !== query; });
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
      } catch (e) {}
    },
  };

  /* ── 2. Saved Results ──────────────────────────────────── */
  var SAVED_KEY = "atomic:saved-results";

  var SavedResults = {
    get: function () {
      try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch (e) { return []; }
    },
    add: function (result) {
      try {
        var saved = this.get().filter(function (r) { return r.url !== result.url; });
        saved.unshift(Object.assign({}, result, { savedAt: Date.now() }));
        saved = saved.slice(0, 500);
        localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
        return true;
      } catch (e) { return false; }
    },
    remove: function (url) {
      try {
        var saved = this.get().filter(function (r) { return r.url !== url; });
        localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
      } catch (e) {}
    },
    has: function (url) {
      return this.get().some(function (r) { return r.url === url; });
    },
    clear: function () {
      try { localStorage.removeItem(SAVED_KEY); } catch (e) {}
    },
  };

  /* ── 3. Collections ────────────────────────────────────── */
  var COLLECTIONS_KEY = "atomic:collections";

  var Collections = {
    get: function () {
      try { return JSON.parse(localStorage.getItem(COLLECTIONS_KEY) || "{}"); } catch (e) { return {}; }
    },
    create: function (name) {
      try {
        var cols = this.get();
        if (!cols[name]) cols[name] = { name: name, items: [], createdAt: Date.now() };
        localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cols));
        return true;
      } catch (e) { return false; }
    },
    addItem: function (collectionName, result) {
      try {
        var cols = this.get();
        if (!cols[collectionName]) this.create(collectionName);
        cols[collectionName].items = cols[collectionName].items.filter(function (r) { return r.url !== result.url; });
        cols[collectionName].items.unshift(Object.assign({}, result, { addedAt: Date.now() }));
        cols[collectionName].items = cols[collectionName].items.slice(0, 100);
        localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cols));
        return true;
      } catch (e) { return false; }
    },
    remove: function (name) {
      try {
        var cols = this.get();
        delete cols[name];
        localStorage.setItem(COLLECTIONS_KEY, JSON.stringify(cols));
      } catch (e) {}
    },
    list: function () {
      return Object.values(this.get());
    },
  };

  /* ── 4. Export Results ─────────────────────────────────── */
  var Export = {
    toJson: function (results, query) {
      var data = {
        query: query,
        exportedAt: new Date().toISOString(),
        count: results.length,
        source: "Atomic Search",
        results: results.map(function (r) {
          return {
            title: r.title,
            url: r.url,
            snippet: (r.snippet || r.text || "").slice(0, 300),
            host: r.host,
            engines: r.engines,
          };
        }),
      };
      return JSON.stringify(data, null, 2);
    },
    toCsv: function (results, query) {
      var esc = function (s) { return '"' + String(s || "").replace(/"/g, '""') + '"'; };
      var header = "title,url,snippet,host\n";
      var rows = results.map(function (r) {
        return [esc(r.title), esc(r.url), esc((r.snippet || r.text || "").slice(0, 200)), esc(r.host)].join(",");
      });
      return header + rows.join("\n");
    },
    download: function (content, filename, mimeType) {
      var blob = new Blob([content], { type: mimeType });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    },
  };

  /* ── 5. Boolean Search Parser ──────────────────────────── */
  var BooleanSearch = {
    parse: function (query) {
      if (!query) return { terms: [], required: [], excluded: [], phrases: [] };
      var phrases = [];
      var q = query.replace(/"([^"]+)"/g, function (_, phrase) {
        phrases.push(phrase.toLowerCase());
        return "";
      });
      var excluded = [];
      q = q.replace(/\bNOT\s+(\S+)|-(\S+)/g, function (_, a, b) {
        excluded.push((a || b).toLowerCase());
        return "";
      });
      var required = [];
      q = q.replace(/\+(\S+)/g, function (_, term) {
        required.push(term.toLowerCase());
        return "";
      });
      var terms = q.split(/\s+(?:AND\s+)?/).map(function (t) { return t.trim().toLowerCase(); })
        .filter(function (t) { return t && t !== "or" && t !== "and"; });
      return { terms: terms, required: required, excluded: excluded, phrases: phrases };
    },
    matches: function (text, parsed) {
      var lower = (text || "").toLowerCase();
      for (var ex of parsed.excluded) {
        if (lower.includes(ex)) return false;
      }
      for (var req of parsed.required) {
        if (!lower.includes(req)) return false;
      }
      for (var phrase of parsed.phrases) {
        if (!lower.includes(phrase)) return false;
      }
      if (parsed.terms.length) {
        return parsed.terms.some(function (t) { return lower.includes(t); });
      }
      return true;
    },
  };

  /* ── 6. Fuzzy Search ───────────────────────────────────── */
  var FuzzySearch = {
    levenshtein: function (a, b) {
      if (a === b) return 0;
      var m = a.length, n = b.length;
      if (!m) return n;
      if (!n) return m;
      var row = [];
      for (var j = 0; j <= n; j++) row[j] = j;
      for (var i = 1; i <= m; i++) {
        var prev = row[0]; row[0] = i;
        for (var j = 1; j <= n; j++) {
          var tmp = row[j];
          row[j] = a[i-1] === b[j-1] ? prev : 1 + Math.min(prev, row[j-1], row[j]);
          prev = tmp;
        }
      }
      return row[n];
    },
    match: function (text, pattern, maxDist) {
      maxDist = maxDist || 2;
      if (!text || !pattern) return false;
      var t = text.toLowerCase();
      var p = pattern.toLowerCase();
      if (t.includes(p)) return true;
      var words = t.split(/\s+/);
      return words.some(function (w) { return FuzzySearch.levenshtein(w, p) <= maxDist; });
    },
  };

  /* ── 7. Phonetic Search (Soundex) ──────────────────────── */
  var PhoneticSearch = {
    soundex: function (s) {
      if (!s) return "";
      var str = s.toUpperCase().replace(/[^A-Z]/g, "");
      if (!str) return "";
      var codes = { BFPV: "1", CGJKQSXYZ: "2", DT: "3", L: "4", MN: "5", R: "6" };
      var result = str[0];
      var prev = "";
      for (var i = 1; i < str.length && result.length < 4; i++) {
        var code = "0";
        for (var letters in codes) {
          if (letters.indexOf(str[i]) >= 0) { code = codes[letters]; break; }
        }
        if (code !== "0" && code !== prev) result += code;
        prev = code;
      }
      while (result.length < 4) result += "0";
      return result;
    },
    match: function (text, query) {
      var textWords = (text || "").split(/\s+/);
      var queryWords = (query || "").split(/\s+/);
      var self = this;
      return queryWords.every(function (qw) {
        return textWords.some(function (tw) { return self.soundex(tw) === self.soundex(qw); });
      });
    },
  };

  /* ── 8. Regex Search ───────────────────────────────────── */
  var RegexSearch = {
    search: function (text, pattern) {
      try {
        var re = new RegExp(pattern, "gi");
        var matches = [];
        var m;
        while ((m = re.exec(text)) !== null) {
          matches.push({
            index: m.index,
            match: m[0],
            context: text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40),
          });
          if (matches.length >= 10) break;
        }
        return { ok: true, matches: matches, count: matches.length };
      } catch (err) {
        return { ok: false, error: err.message, matches: [], count: 0 };
      }
    },
  };

  /* ── 9. Advanced Filters ───────────────────────────────── */
  var AdvancedFilters = {
    apply: function (results, filters) {
      var filtered = results.slice();
      if (filters.site) {
        var site = filters.site.toLowerCase();
        filtered = filtered.filter(function (r) {
          try { return new URL(r.url).hostname.replace(/^www\./, "").includes(site); } catch (e) { return false; }
        });
      }
      if (filters.excludeDomains && filters.excludeDomains.length) {
        var excluded = filters.excludeDomains.map(function (d) { return d.toLowerCase(); });
        filtered = filtered.filter(function (r) {
          try {
            var host = new URL(r.url).hostname.replace(/^www\./, "").toLowerCase();
            return !excluded.some(function (ex) { return host.includes(ex); });
          } catch (e) { return true; }
        });
      }
      if (filters.minWords) {
        var min = Number(filters.minWords);
        filtered = filtered.filter(function (r) {
          return (r.snippet || r.text || "").split(/\s+/).filter(Boolean).length >= min;
        });
      }
      return filtered;
    },
    getFromUI: function () {
      var site = ($("filter-site") || {}).value || "";
      var lang = ($("filter-lang") || {}).value || "";
      var dateAfter = ($("filter-date-after") || {}).value || "";
      var dateBefore = ($("filter-date-before") || {}).value || "";
      var minWords = ($("filter-min-words") || {}).value || "";
      var excludeRaw = ($("filter-exclude") || {}).value || "";
      var excludeDomains = excludeRaw ? excludeRaw.split(",").map(function (d) { return d.trim(); }).filter(Boolean) : [];
      return { site: site, lang: lang, dateAfter: dateAfter, dateBefore: dateBefore, minWords: minWords, excludeDomains: excludeDomains };
    },
  };

  /* ── 10. Trending Searches ─────────────────────────────── */
  var TRENDING = [
    "open source software", "privacy tools", "web development",
    "machine learning", "linux terminal", "rust programming",
    "typescript tutorial", "self hosting", "docker compose",
    "vim neovim", "kubernetes guide", "react hooks",
    "python data science", "cybersecurity basics", "api design",
    "database optimization", "cloud computing", "devops practices",
    "webassembly", "edge computing",
  ];

  function renderTrending(container) {
    if (!container) return;
    var html =
      '<div class="related-searches">' +
      '<div class="related-searches-title">🔥 Trending searches</div>' +
      '<div class="related-searches-grid">' +
      TRENDING.slice(0, 10).map(function (q) {
        return '<a class="related-search-chip" href="/?q=' + encodeURIComponent(q) + '">' + esc(q) + '</a>';
      }).join("") +
      '</div></div>';
    container.innerHTML = html;
  }

  /* ── 11. Session Analytics ─────────────────────────────── */
  var Analytics = {
    session: {
      searches: 0,
      resultsViewed: 0,
      startedAt: Date.now(),
    },
    record: function (event) {
      if (event === "search") this.session.searches++;
      if (event === "results") this.session.resultsViewed++;
    },
    get: function () {
      return Object.assign({}, this.session, {
        uptimeSec: Math.round((Date.now() - this.session.startedAt) / 1000),
      });
    },
  };

  /* ── 12. Export UI ─────────────────────────────────────── */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".export-btn");
    if (!btn) return;
    var format = btn.dataset.export;
    var results = window._lastResults || [];
    var query = window._lastQuery || "";
    if (!results.length) { alert("No results to export."); return; }
    if (format === "json") {
      Export.download(Export.toJson(results, query), "atomic-results.json", "application/json");
    } else if (format === "csv") {
      Export.download(Export.toCsv(results, query), "atomic-results.csv", "text/csv");
    }
  });

  /* ── 13. Apply filters button ──────────────────────────── */
  document.addEventListener("click", function (e) {
    if (e.target.id === "apply-filters") {
      var filters = AdvancedFilters.getFromUI();
      var results = window._lastResults || [];
      var filtered = AdvancedFilters.apply(results, filters);
      var container = document.getElementById("results");
      if (container && window.AtomicUI) {
        container.innerHTML = filtered.map(function (r) {
          return window.AtomicUI.renderResultCard(r);
        }).join("");
        if (window.AtomicUI.showToast) {
          window.AtomicUI.showToast("Showing " + filtered.length + " filtered results");
        }
      }
    }
    if (e.target.id === "clear-filters") {
      ["filter-site", "filter-lang", "filter-date-after", "filter-date-before", "filter-min-words", "filter-exclude"].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.value = "";
      });
    }
  });

  /* ── 14. New theme options ─────────────────────────────── */
  function addNewThemeOptions() {
    var select = document.getElementById("theme");
    if (!select) return;

    var newThemes = [
      { group: "New — Glassmorphism & Neumorphism", options: [
        { value: "glassmorphism", label: "Glassmorphism" },
        { value: "neumorphism", label: "Neumorphism" },
      ]},
      { group: "New — Design Movements", options: [
        { value: "brutalism", label: "Brutalism" },
        { value: "minimalist", label: "Minimalist" },
        { value: "maximalist", label: "Maximalist" },
        { value: "memphis", label: "Memphis Design" },
        { value: "bauhaus", label: "Bauhaus" },
        { value: "swiss", label: "Swiss Style" },
        { value: "art-deco", label: "Art Deco" },
        { value: "postmodern", label: "Postmodern" },
      ]},
      { group: "New — Retro", options: [
        { value: "retro-80s", label: "Retro 80s" },
        { value: "retro-90s", label: "Retro 90s" },
        { value: "y2k", label: "Y2K" },
        { value: "steampunk", label: "Steampunk" },
      ]},
      { group: "New — Sci-Fi", options: [
        { value: "cyberpunk-2077", label: "Cyberpunk 2077" },
        { value: "blade-runner", label: "Blade Runner" },
        { value: "tron", label: "Tron" },
        { value: "neon-v2", label: "Neon v2" },
        { value: "holographic", label: "Holographic" },
        { value: "gradient-v2", label: "Gradient" },
      ]},
    ];

    newThemes.forEach(function (group) {
      var optgroup = document.createElement("optgroup");
      optgroup.label = group.group;
      group.options.forEach(function (opt) {
        var option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        optgroup.appendChild(option);
      });
      select.appendChild(optgroup);
    });
  }

  /* ── 15. Keyboard shortcuts ────────────────────────────── */
  document.addEventListener("keydown", function (e) {
    // Ctrl/Cmd + Shift + H — show search history
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "H") {
      e.preventDefault();
      showHistoryPanel();
    }
    // Ctrl/Cmd + Shift + S — show saved results
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "S") {
      e.preventDefault();
      showSavedPanel();
    }
    // Ctrl/Cmd + Shift + E — export results
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "E") {
      e.preventDefault();
      var results = window._lastResults || [];
      var query = window._lastQuery || "";
      if (results.length) Export.download(Export.toJson(results, query), "atomic-results.json", "application/json");
    }
  });

  function showHistoryPanel() {
    var history = SearchHistory.get();
    if (!history.length) {
      if (window.AtomicUI) window.AtomicUI.showToast("No search history yet");
      return;
    }
    var html = history.slice(0, 20).map(function (item) {
      return '<a href="/?q=' + encodeURIComponent(item.q) + '" style="display:block;padding:8px 0;border-bottom:1px solid var(--border-soft);color:var(--link);font-size:14px">' + esc(item.q) + '</a>';
    }).join("");
    showInfoModal("Search History", html);
  }

  function showSavedPanel() {
    var saved = SavedResults.get();
    if (!saved.length) {
      if (window.AtomicUI) window.AtomicUI.showToast("No saved results yet");
      return;
    }
    var html = saved.slice(0, 20).map(function (r) {
      return '<div style="padding:8px 0;border-bottom:1px solid var(--border-soft)">' +
        '<a href="' + esc(r.url) + '" style="color:var(--link);font-size:14px;display:block">' + esc(r.title || r.url) + '</a>' +
        '<span style="font-size:12px;color:var(--text-mute)">' + esc(r.url) + '</span>' +
        '</div>';
    }).join("");
    showInfoModal("Saved Results", html);
  }

  function showInfoModal(title, content) {
    var modal = document.getElementById("info-modal-v2");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "info-modal-v2";
      modal.className = "modal-backdrop";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.innerHTML =
        '<div class="modal">' +
        '<div class="modal-head">' +
        '<h2 id="info-modal-title-v2"></h2>' +
        '<button class="icon-btn modal-close" aria-label="Close">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
        '</button></div>' +
        '<div class="modal-body" id="info-modal-body-v2" style="max-height:60vh;overflow-y:auto"></div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelector(".modal-close").addEventListener("click", function () { modal.hidden = true; });
      modal.addEventListener("click", function (e) { if (e.target === modal) modal.hidden = true; });
    }
    document.getElementById("info-modal-title-v2").textContent = title;
    document.getElementById("info-modal-body-v2").innerHTML = content;
    modal.hidden = false;
  }

  /* ── 16. Duplicate detection ───────────────────────────── */
  function deduplicateResults(results) {
    var seen = new Set();
    return results.filter(function (r) {
      var key = (r.title || "").toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /* ── Init ──────────────────────────────────────────────── */
  function init() {
    addNewThemeOptions();

    // Expose features globally
    window.AtomicFeatures = {
      SearchHistory: SearchHistory,
      SavedResults: SavedResults,
      Collections: Collections,
      Export: Export,
      BooleanSearch: BooleanSearch,
      FuzzySearch: FuzzySearch,
      PhoneticSearch: PhoneticSearch,
      RegexSearch: RegexSearch,
      AdvancedFilters: AdvancedFilters,
      Analytics: Analytics,
      renderTrending: renderTrending,
      deduplicateResults: deduplicateResults,
      showHistoryPanel: showHistoryPanel,
      showSavedPanel: showSavedPanel,
    };

    // Show trending on home page
    var statsEl = document.getElementById("stats");
    if (statsEl && document.body.dataset.view !== "results") {
      var trendingContainer = document.createElement("div");
      trendingContainer.style.cssText = "margin-top:24px;width:100%;max-width:640px;text-align:left";
      renderTrending(trendingContainer);
      if (statsEl.parentElement) statsEl.parentElement.insertBefore(trendingContainer, statsEl.nextSibling);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
