(function () {
  "use strict";

  /* ---------------- Settings (localStorage) ---------------- */
  var SETTINGS_KEY = "atomic.settings";
  var defaultSettings = {
    safety: true,
    proxyLinks: true,
    perPage: 50,
    safeSearch: true,
    theme: null, // managed by themes.js; mirrored here for export
  };
  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return Object.assign({}, defaultSettings);
      var parsed = JSON.parse(raw);
      return Object.assign({}, defaultSettings, parsed);
    } catch (e) { return Object.assign({}, defaultSettings); }
  }
  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  }
  var settings = loadSettings();

  /* Auth was removed in v2 — Atomic is fully anonymous, no cookies. */

  /* ---------------- State ---------------- */
  var state = { q: "", tab: "all", page: 1, sort: "relevance", filterDomain: "", filterType: "" };

  // All results from the last API response — used for client-side filter/sort.
  var _lastResults = [];
  var _lastData = null;


  /* ---------------- Helpers ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function faviconUrl(host) {
    if (!host) return "";
    return "https://www.google.com/s2/favicons?sz=32&domain=" + encodeURIComponent(host);
  }
  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch (e) { return ""; }
  }
  function pathOf(url) {
    try {
      var u = new URL(url);
      var p = (u.pathname || "/").replace(/\/+$/, "");
      return (u.hostname.replace(/^www\./, "") + (p ? " › " + p.split("/").filter(Boolean).slice(0, 3).join(" › ") : "")).trim();
    } catch (e) { return url; }
  }
  function linkFor(url) {
    if (settings.proxyLinks) return "/go?url=" + encodeURIComponent(url);
    return url;
  }

  /* ---------------- Views ---------------- */
  function showHome() {
    $("home").hidden = false;
    $("results-shell").hidden = true;
    document.body.dataset.view = "home";
  }
  function showResults() {
    $("home").hidden = true;
    $("results-shell").hidden = false;
    document.body.dataset.view = "results";
  }

  /* ---------------- Index counter chip ---------------- */
  function refreshIndexChip() {
    fetch("/api/stats")
      .then(function (r) { return r.json(); })
      .then(function (s) {
        if (!s) return;
        var chip = $("index-chip");
        var txt = $("index-chip-text");
        if (!chip || !txt) return;
        var pages = s.pages || 0;
        var added = s.added || 0;
        var queue = s.queue || 0;
        var answers = s.answers || 0;
        txt.innerHTML =
          "<strong>" + pages.toLocaleString() + "</strong> indexed" +
          " \u00b7 <strong>" + added.toLocaleString() + "</strong> added" +
          " \u00b7 <strong>" + queue.toLocaleString() + "</strong> queued" +
          (answers ? " \u00b7 <strong>" + answers.toLocaleString() + "</strong> answers" : "");
        chip.title =
          (s.persistent ? "Persistent index" : "Ephemeral index (no SQLite)") +
          " \u2014 live counters refresh after every search";
        chip.hidden = false;
      })
      .catch(function () {});
  }

  /* ---------------- Scan tab ---------------- */
  // Shared verdict renderer: draws a colour-coded card summarising a VT
  // response. Works for URL scans, file-URL scans, and direct uploads.
  function renderVerdict(target, data) {
    if (!target) return;
    target.hidden = false;
    if (!data || data.ok === false) {
      target.className = "scan-result scan-err";
      target.textContent = (data && data.error) || "Scan failed.";
      return;
    }
    var verdict = (data.verdict || data.status || "unknown").toLowerCase();
    var cls = "scan-unknown";
    if (verdict === "clean" || verdict === "harmless") cls = "scan-ok";
    else if (verdict === "suspicious") cls = "scan-warn";
    else if (verdict === "malicious") cls = "scan-bad";
    else if (verdict === "pending" || verdict === "queued") cls = "scan-pending";
    target.className = "scan-result " + cls;

    var lines = [];
    lines.push('<div class="scan-verdict">' + esc(verdict.toUpperCase()) + "</div>");
    if (data.malicious != null) {
      lines.push(
        '<div class="scan-stats">' +
          '<span>' + (data.malicious | 0) + " malicious</span>" +
          '<span>' + (data.suspicious | 0) + " suspicious</span>" +
          '<span>' + (data.harmless | 0) + " harmless</span>" +
          '<span>' + (data.undetected | 0) + " undetected</span>" +
        "</div>"
      );
    }
    if (data.name) lines.push('<div class="scan-meta">' + esc(data.name) + (data.size ? " \u00b7 " + humanSize(data.size) : "") + "</div>");
    else if (data.url) lines.push('<div class="scan-meta">' + esc(data.url) + "</div>");
    if (data.hashes && data.hashes.sha256) {
      lines.push('<div class="scan-hash">sha256: ' + esc(data.hashes.sha256) + "</div>");
    }
    if (data.permalink) {
      lines.push('<div class="scan-link"><a href="' + esc(data.permalink) + '" target="_blank" rel="noreferrer noopener">View full VirusTotal report \u2197</a></div>');
    }
    if (data.note) lines.push('<div class="hint" style="margin-top:8px">' + esc(data.note) + "</div>");
    target.innerHTML = lines.join("");
  }

  function humanSize(n) {
    if (!n) return "";
    var units = ["B", "KB", "MB", "GB"];
    var i = 0; var v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return v.toFixed(v < 10 && i > 0 ? 1 : 0) + " " + units[i];
  }

  function bindScan() {
    var urlForm = $("scan-url-form");
    if (urlForm) {
      urlForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var url = ($("scan-url-input").value || "").trim();
        if (!url) return;
        var out = $("scan-url-result");
        out.hidden = false;
        out.className = "scan-result scan-pending";
        out.textContent = "Checking \u2026";
        try {
          var res = await fetch("/api/scan/url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url }),
          });
          renderVerdict(out, await res.json());
        } catch (err) {
          renderVerdict(out, { ok: false, error: "Network error." });
        }
      });
    }

    var fileLinkForm = $("scan-filelink-form");
    if (fileLinkForm) {
      fileLinkForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var url = ($("scan-filelink-input").value || "").trim();
        if (!url) return;
        var out = $("scan-filelink-result");
        out.hidden = false;
        out.className = "scan-result scan-pending";
        out.textContent = "Downloading & scanning \u2026 (this can take up to 25s)";
        try {
          var res = await fetch("/api/scan/file", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: url }),
          });
          renderVerdict(out, await res.json());
        } catch (err) {
          renderVerdict(out, { ok: false, error: "Network error." });
        }
      });
    }

    var uploadForm = $("scan-upload-form");
    var uploadInput = $("scan-upload-input");
    var dropLabel = $("scan-drop-label");
    if (dropLabel && uploadInput) {
      ["dragenter", "dragover"].forEach(function (ev) {
        dropLabel.addEventListener(ev, function (e) {
          e.preventDefault(); e.stopPropagation();
          dropLabel.classList.add("drag");
        });
      });
      ["dragleave", "drop"].forEach(function (ev) {
        dropLabel.addEventListener(ev, function (e) {
          e.preventDefault(); e.stopPropagation();
          dropLabel.classList.remove("drag");
        });
      });
      dropLabel.addEventListener("drop", function (e) {
        var dt = e.dataTransfer;
        if (dt && dt.files && dt.files[0]) uploadInput.files = dt.files;
      });
    }
    if (uploadForm) {
      uploadForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        var out = $("scan-upload-result");
        var file = uploadInput && uploadInput.files && uploadInput.files[0];
        if (!file) { renderVerdict(out, { ok: false, error: "Pick a file first." }); return; }
        out.hidden = false;
        out.className = "scan-result scan-pending";
        out.textContent = "Uploading & scanning \u2026";
        try {
          var form = new FormData();
          form.append("file", file);
          var res = await fetch("/api/scan/upload", { method: "POST", body: form });
          renderVerdict(out, await res.json());
        } catch (err) {
          renderVerdict(out, { ok: false, error: "Network error." });
        }
      });
    }
  }

  /* ---------------- Search ---------------- */
  function setTab(t) {
    state.tab = t || "all";
    Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-tab") === state.tab);
    });
    var isSearchTab = state.tab === "all" || state.tab === "news";
    $("results").hidden = !isSearchTab;
    $("pager").hidden = !isSearchTab;
    $("images-grid").hidden = state.tab !== "images";
    var scanEl = $("scan-panel");
    if (scanEl) scanEl.hidden = state.tab !== "scan";
    // Results-chip + meta only make sense on search tabs. Hide them on scan/images.
    var chip = $("index-chip"); if (chip && !isSearchTab && state.tab !== "scan") chip.hidden = true;
    // Hide filter bar on non-search tabs
    var filterBar = $("filter-sort-bar");
    if (filterBar && !isSearchTab) filterBar.hidden = true;
    $("empty").hidden = true;
    if (state.tab === "scan") return; // scan tab doesn't use the query
    if (!state.q) return;
    if (state.tab === "images") doImages(state.q);
    else doSearch(state.q);
  }
  /* ---------------- Instant answers (math, time, units) ----------------
     Run entirely in the browser — no server call, no external API.
     If the query maps to a deterministic local answer, we prepend a
     highlighted card above results so users get the answer immediately
     (like a calculator or unit-conversion widget). */
  var UNIT_FACTORS = {
    // length → meters
    mm: 0.001, cm: 0.01, m: 1, km: 1000, inch: 0.0254, in: 0.0254,
    ft: 0.3048, foot: 0.3048, feet: 0.3048, yd: 0.9144, yard: 0.9144,
    mi: 1609.344, mile: 1609.344, miles: 1609.344,
    // weight → grams
    mg: 0.001, g: 1, kg: 1000, lb: 453.592, lbs: 453.592, oz: 28.3495,
    ton: 1e6, tonne: 1e6,
    // volume → litres
    ml: 0.001, l: 1, litre: 1, liter: 1, gal: 3.78541, gallon: 3.78541,
    cup: 0.2365882, cups: 0.2365882, pt: 0.473176, pint: 0.473176,
  };
  var UNIT_CATEGORY = {
    mm: "length", cm: "length", m: "length", km: "length", inch: "length",
    in: "length", ft: "length", foot: "length", feet: "length", yd: "length",
    yard: "length", mi: "length", mile: "length", miles: "length",
    mg: "weight", g: "weight", kg: "weight", lb: "weight", lbs: "weight",
    oz: "weight", ton: "weight", tonne: "weight",
    ml: "volume", l: "volume", litre: "volume", liter: "volume",
    gal: "volume", gallon: "volume", cup: "volume", cups: "volume",
    pt: "volume", pint: "volume",
  };

  function tryMath(q) {
    // Only evaluate if the string is clearly a math expression (digits,
    // operators, parens, dots, spaces). No variables, no function calls.
    var s = (q || "").replace(/\s+/g, "").replace(/×/g, "*").replace(/÷/g, "/");
    if (!s) return null;
    if (!/^[-+*/().\d%^]+$/.test(s.replace(/\*\*/g, ""))) return null;
    if (!/[+\-*/^%]/.test(s)) return null; // require at least one operator
    if (s.length > 80) return null;
    try {
      var expr = s.replace(/\^/g, "**");
      // eslint-disable-next-line no-new-func
      var val = Function('"use strict";return (' + expr + ")")();
      if (typeof val !== "number" || !isFinite(val)) return null;
      var rounded = Math.round(val * 1e10) / 1e10;
      return { kind: "math", text: q + " = " + rounded };
    } catch (e) { return null; }
  }

  function tryPercent(q) {
    var m = (q || "").match(/^(-?[\d.]+)\s*%\s*of\s*(-?[\d.]+)$/i);
    if (!m) return null;
    var pct = parseFloat(m[1]);
    var of = parseFloat(m[2]);
    if (!isFinite(pct) || !isFinite(of)) return null;
    var v = (pct / 100) * of;
    return { kind: "percent", text: pct + "% of " + of + " = " + (Math.round(v * 1e6) / 1e6) };
  }


  function tryUnitConvert(q) {
    var m = (q || "").trim().toLowerCase().match(/^(-?[\d.]+)\s*([a-z]+)\s*(?:to|in|->)\s*([a-z]+)$/i);
    if (!m) return null;
    var val = parseFloat(m[1]);
    var from = m[2]; var to = m[3];
    if (!isFinite(val)) return null;
    if (!(from in UNIT_FACTORS) || !(to in UNIT_FACTORS)) return null;
    if (UNIT_CATEGORY[from] !== UNIT_CATEGORY[to]) return null;
    var base = val * UNIT_FACTORS[from];
    var out = base / UNIT_FACTORS[to];
    var rounded = Math.round(out * 1e6) / 1e6;
    return { kind: "unit", text: val + " " + from + " = " + rounded + " " + to };
  }

  function tryTimeDate(q) {
    var s = (q || "").trim().toLowerCase();
    if (s === "time" || s === "current time" || s === "time now" || s === "what time is it") {
      return { kind: "time", text: "Local time: " + new Date().toLocaleTimeString() };
    }
    if (s === "date" || s === "today" || s === "what day is it" || s === "current date") {
      return { kind: "time", text: "Today: " + new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) };
    }
    if (s === "now" || s === "datetime") {
      return { kind: "time", text: "Now: " + new Date().toLocaleString() };
    }
    return null;
  }

  function instantAnswer(q) {
    if (!q) return null;
    return tryMath(q) || tryPercent(q) || tryUnitConvert(q) || tryTimeDate(q);
  }

  function renderInstantCard(ans) {
    if (!ans) return "";
    return (
      '<article class="result instant-card" data-kind="' + esc(ans.kind) + '">' +
      '  <div class="host-line"><span class="badge atomic">Instant</span><span class="host">Calculated locally</span></div>' +
      '  <div class="instant-text">' + esc(ans.text) + "</div>" +
      "</article>"
    );
  }

  /* ---------------- Search history (localStorage) ---------------- */
  var HIST_KEY = "atomic.history";
  function pushHistory(q) {
    if (!q) return;
    try {
      var list = JSON.parse(localStorage.getItem(HIST_KEY) || "[]");
      list = list.filter(function (x) { return x !== q; });
      list.unshift(q);
      list = list.slice(0, 20);
      localStorage.setItem(HIST_KEY, JSON.stringify(list));
    } catch (e) { /* ignore */ }
  }
  function getHistory() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); } catch (e) { return []; }
  }
  function clearHistory() {
    try { localStorage.removeItem(HIST_KEY); } catch (e) { /* ignore */ }
  }

  /* ---------------- Filter / Sort / Pagination helpers ---------------- */

  // Apply client-side filter and sort to the full result set, then re-render.
  function applyFilterSort() {
    if (!_lastResults.length || !_lastData) return;
    var filtered = _lastResults.slice();

    // Domain filter
    if (state.filterDomain) {
      var fd = state.filterDomain.toLowerCase();
      filtered = filtered.filter(function (r) {
        var h = (r.host || hostOf(r.url) || "").toLowerCase();
        return h === fd || h.endsWith("." + fd);
      });
    }

    // Type filter (news = has date-like snippet, articles = general)
    if (state.filterType === "news") {
      filtered = filtered.filter(function (r) {
        var s = (r.snippet || r.title || "").toLowerCase();
        return /\b(news|today|yesterday|hours? ago|minutes? ago|\d{4})\b/.test(s);
      });
    } else if (state.filterType === "articles") {
      filtered = filtered.filter(function (r) {
        var s = (r.snippet || r.title || "").toLowerCase();
        return !/\b(news|today|yesterday|hours? ago|minutes? ago)\b/.test(s);
      });
    }

    // Sort
    if (state.sort === "domain") {
      filtered.sort(function (a, b) {
        var ha = (a.host || hostOf(a.url) || "").toLowerCase();
        var hb = (b.host || hostOf(b.url) || "").toLowerCase();
        return ha < hb ? -1 : ha > hb ? 1 : 0;
      });
    } else if (state.sort === "date") {
      // Heuristic: prefer results with date-like snippets first
      filtered.sort(function (a, b) {
        var sa = (a.snippet || "").toLowerCase();
        var sb = (b.snippet || "").toLowerCase();
        var da = /\b(today|yesterday|\d+ hours? ago|\d+ minutes? ago)\b/.test(sa) ? 1 : 0;
        var db = /\b(today|yesterday|\d+ hours? ago|\d+ minutes? ago)\b/.test(sb) ? 1 : 0;
        return db - da;
      });
    }
    // "relevance" = keep original order

    var highlightTerms = buildHighlightTerms(state.q);
    var instant = instantAnswer(state.q);
    var instantHtml = instant ? renderInstantCard(instant) : "";
    var serverAnswerHtml = _lastData.instant ? renderServerAnswerBox(_lastData.instant) : "";
    var dymHtml = renderDidYouMean(_lastData.didYouMean);
    var hotelHtml = _lastData.hotelCard ? renderHotelCard(_lastData.hotelCard) : "";

    if (!filtered.length) {
      $("results").innerHTML = instantHtml + serverAnswerHtml + dymHtml + hotelHtml +
        '<p class="empty-filter">No results match the current filters. <a href="#" id="clear-filters-link">Clear filters</a></p>';
      var clf = $("clear-filters-link");
      if (clf) clf.addEventListener("click", function (e) { e.preventDefault(); clearFilters(); });
    } else {
      var html = instantHtml + serverAnswerHtml + dymHtml + hotelHtml +
        filtered.map(function (r, i) { return renderResult(r, i, highlightTerms); }).join("");
      html += renderRelated(_lastData.related);
      $("results").innerHTML = html;
    }

    // Update filter bar to reflect active state
    renderFilterBar(_lastResults);
  }

  function clearFilters() {
    state.filterDomain = "";
    state.filterType = "";
    state.sort = "relevance";
    applyFilterSort();
    renderFilterBar(_lastResults);
  }

  // Render the filter/sort toolbar below the tabs.
  function renderFilterBar(results) {
    var bar = $("filter-sort-bar");
    if (!bar) return;
    if (!results || !results.length) { bar.hidden = true; return; }

    // Collect unique domains from results for the domain filter dropdown
    var domainCounts = {};
    results.forEach(function (r) {
      var h = (r.host || hostOf(r.url) || "").toLowerCase();
      if (h) domainCounts[h] = (domainCounts[h] || 0) + 1;
    });
    var topDomains = Object.keys(domainCounts)
      .sort(function (a, b) { return domainCounts[b] - domainCounts[a]; })
      .slice(0, 8);

    var domainOptions = '<option value="">All domains</option>' +
      topDomains.map(function (d) {
        return '<option value="' + esc(d) + '"' + (state.filterDomain === d ? " selected" : "") + ">" + esc(d) + " (" + domainCounts[d] + ")</option>";
      }).join("");

    bar.hidden = false;
    bar.innerHTML =
      '<div class="filter-bar-inner">' +
      '<label class="filter-label">Filter by domain:' +
      '<select id="filter-domain-sel" class="filter-select">' + domainOptions + "</select>" +
      "</label>" +
      '<label class="filter-label">Type:' +
      '<select id="filter-type-sel" class="filter-select">' +
      '<option value=""' + (!state.filterType ? " selected" : "") + ">All</option>" +
      '<option value="news"' + (state.filterType === "news" ? " selected" : "") + ">News</option>" +
      '<option value="articles"' + (state.filterType === "articles" ? " selected" : "") + ">Articles</option>" +
      "</select>" +
      "</label>" +
      '<label class="filter-label">Sort:' +
      '<select id="sort-sel" class="filter-select">' +
      '<option value="relevance"' + (state.sort === "relevance" ? " selected" : "") + ">Relevance</option>" +
      '<option value="date"' + (state.sort === "date" ? " selected" : "") + ">Date (newest)</option>" +
      '<option value="domain"' + (state.sort === "domain" ? " selected" : "") + ">Domain A–Z</option>" +
      "</select>" +
      "</label>" +
      (state.filterDomain || state.filterType || state.sort !== "relevance"
        ? '<button type="button" id="clear-filters-btn" class="filter-clear-btn">✕ Clear</button>'
        : "") +
      "</div>";

    var domSel = $("filter-domain-sel");
    var typeSel = $("filter-type-sel");
    var sortSel = $("sort-sel");
    var clearBtn = $("clear-filters-btn");

    if (domSel) domSel.addEventListener("change", function () {
      state.filterDomain = domSel.value;
      applyFilterSort();
    });
    if (typeSel) typeSel.addEventListener("change", function () {
      state.filterType = typeSel.value;
      applyFilterSort();
    });
    if (sortSel) sortSel.addEventListener("change", function () {
      state.sort = sortSel.value;
      applyFilterSort();
    });
    if (clearBtn) clearBtn.addEventListener("click", clearFilters);
  }

  async function doSearch(q) {
    pushHistory(q);
    state.q = q;
    $("search-meta").hidden = false;
    $("search-meta").innerHTML = '<span><span class="loading"></span>Searching our index…</span>';
    $("empty").hidden = true;
    $("results").innerHTML = "";
    $("pager").hidden = true;
    // Hide filter bar while loading
    var filterBarEl = $("filter-sort-bar");
    if (filterBarEl) filterBarEl.hidden = true;
    // Show loading skeleton while fetching
    var skeletonEl = $("results-skeleton");
    if (skeletonEl) skeletonEl.hidden = false;
    // Hide AI summary while loading
    var aiSummarySection = $("ai-summary-section");
    if (aiSummarySection) aiSummarySection.hidden = true;
    var instant = instantAnswer(q);
    if (instant) $("results").innerHTML = renderInstantCard(instant);

    var safeParam = settings.safeSearch !== false ? "" : "&safe=0";
    var u = "/api/search?q=" + encodeURIComponent(q) + "&page=" + state.page + "&per_page=" + settings.perPage + safeParam;
    var t0 = performance.now();
    var data;

    try {
      var res = await fetch(u);
      // Always try to parse JSON, but tolerate a non-JSON body (e.g. a
      // reverse proxy 502) so we can still show a clean message instead
      // of a generic banner.
      var body = await res.text();
      try {
        data = JSON.parse(body);
      } catch (parseErr) {
        data = { error: "bad_response", message: "Server returned " + res.status };
      }
    } catch (e) {
      if (skeletonEl) skeletonEl.hidden = true;
      $("search-meta").innerHTML = '<span style="color:var(--danger)">Network error — check your connection and try again.</span>';
      return;
    }

    if (data && data.error === \"rate_limited\") {
      $(\"search-meta\").innerHTML = '<span style=\"color:var(--text-dim)\">Slow down — rate limited. Try again in 30 seconds.</span>';
      return;
    }
    if (data && data.error) {
      $(\"search-meta\").innerHTML = '<span style=\"color:var(--text-dim)\">Search temporarily unavailable: ' + esc(data.message || data.error) + '. Try again.</span>';
      return;
    }
    var elapsed = ((performance.now() - t0) / 1000).toFixed(2);
    var results = (data && data.results) || [];

    if (!results.length) {
      $(\"search-meta\").hidden = true;
      $(\"empty\").hidden = false;
      return;
    }

    var ownCount = data.ownIndexCount || results.filter(function (r) { return r.ownIndex; }).length;
    var ownHtml = ownCount > 0
      ? '<span class=\"own-idx-chip\" title=\"Matches from our growing private index\">'
        + '<svg viewBox=\"0 0 24 24\" width=\"12\" height=\"12\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" aria-hidden=\"true\">'
        + '<circle cx=\"12\" cy=\"12\" r=\"9\"/><circle cx=\"12\" cy=\"12\" r=\"3\"/></svg>'
        + ownCount + ' from our own index</span>'
      : '<span>0 from our own index</span>';
    $(\"search-meta\").hidden = false;
    $(\"search-meta\").innerHTML =
      \"<span>About \" + (data.total || results.length) + \" results (\" + elapsed + \"s)</span>\" +
      '<span class=\"dot\"></span>' +
      ownHtml +
      '<span style=\"margin-left:auto;display:flex;gap:4px\">' +
      '<button class=\"export-btn\" data-export=\"json\" title=\"Export results as JSON\">Export JSON</button>' +
      '<button class=\"export-btn\" data-export=\"csv\" title=\"Export results as CSV\">Export CSV</button>' +
      '</span>';

    // Show AI summary if available
    if (data.aiSummary && aiSummarySection) {
      var aiTextEl = $(\"ai-summary-text\");
      if (aiTextEl) aiTextEl.textContent = data.aiSummary;
      aiSummarySection.hidden = false;
    }

    var instantHtml = instant ? renderInstantCard(instant) : \"\";
    var serverAnswerHtml = data.instant ? renderServerAnswerBox(data.instant) : \"\";
    var dymHtml = renderDidYouMean(data.didYouMean);
    var hotelHtml = data.hotelCard ? renderHotelCard(data.hotelCard) : \"\";
    var highlightTerms = buildHighlightTerms(q);
    // Store results for client-side filter/sort
    _lastResults = results;
    _lastData = data;
    // Reset filters on new search
    state.filterDomain = "";
    state.filterType = "";
    state.sort = "relevance";

    var html = instantHtml + serverAnswerHtml + dymHtml + hotelHtml + results.map(function (r, i) {
      return renderResult(r, i, highlightTerms);
    }).join("");
    html += renderRelated(data.related);
    $("results").innerHTML = html;
    renderPager(data);
    renderFilterBar(results);

    // Lazy-fetch safety verdicts in batches of 10.
    if (settings.safety) lazyLoadSafety(results);

    // Refresh the index counter — the eager crawler has usually added a few
    // pages by the time the response comes back.
    refreshIndexChip();
    setTimeout(refreshIndexChip, 2500);
    setTimeout(refreshIndexChip, 7000);
  }


  // Build the set of terms we should visually highlight in result titles
  // and snippets (Google-style bold / underline). We drop stopwords and
  // tiny tokens so we don't highlight every "the" and "of".
  var HL_STOPWORDS = { "the":1,"a":1,"an":1,"of":1,"is":1,"are":1,"to":1,"in":1,"on":1,"for":1,"and":1,"or":1,"it":1,"be":1,"was":1,"were":1,"by":1,"at":1,"as":1,"this":1,"that":1,"with":1,"from":1,"what":1,"who":1,"why":1,"how":1,"do":1,"does":1,"did":1 };
  function buildHighlightTerms(q) {
    if (!q) return [];
    var out = [];
    var seen = Object.create(null);
    var toks = String(q).toLowerCase()
      .replace(/\bsite:[\w.-]+/g, " ")
      .split(/[^a-z0-9]+/)
      .filter(function (t) { return t && t.length >= 2 && !HL_STOPWORDS[t]; });
    for (var i = 0; i < toks.length; i++) {
      if (!seen[toks[i]]) { seen[toks[i]] = 1; out.push(toks[i]); }
    }
    // Longest terms first so "javascript" wins over "java" when both match.
    out.sort(function (a, b) { return b.length - a.length; });
    return out;
  }
  function highlight(text, terms) {
    if (!text) return "";
    var escaped = esc(text);
    if (!terms || !terms.length) return escaped;
    // Build one alternation regex, case-insensitive, so we make a single
    // pass over the string. Escape regex metacharacters in each term.
    var pattern = terms.map(function (t) {
      return t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("|");
    try {
      var re = new RegExp("(" + pattern + ")", "gi");
      return escaped.replace(re, "<mark>$1</mark>");
    } catch (e) {
      return escaped;
    }
  }

  // Render a hotel results card returned by the /api/search hotelCard field.
  // The server already HTML-escaped all values inside the card HTML, so we
  // just wrap it in a labelled section element.
  function renderHotelCard(card) {
    if (!card || !card.html) return "";
    return (
      '<section class="hotel-results-section" aria-label="Hotel results from ' + esc(card.source || "Booking.com") + '">' +
      '<div class="hotel-results-header">' +
      '<span class="hotel-results-label">Hotels</span>' +
      '<span class="hotel-results-source">via ' + esc(card.source || "Booking.com") + '</span>' +
      '</div>' +
      card.html +
      '</section>'
    );
  }

  function renderServerAnswerBox(ans) {
    if (!ans || !ans.text) return "";
    var host = (function () { try { return new URL(ans.url).hostname.replace(/^www\./, ""); } catch (e) { return ""; } })();
    var thumb = ans.thumbnail
      ? '<img class="answer-thumb" src="' + esc(ans.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
      : "";
    var link = ans.url
      ? '<a class="answer-link" href="' + esc(linkFor(ans.url)) + '" target="_top" rel="noreferrer noopener">Read more on ' + esc(host || ans.source) + " →</a>"
      : "";
    // If the synth summariser stitched multiple pages, render them as
    // little pill links so the reader can jump to any contributing source.
    var sourcesHtml = "";
    if (ans.sources && ans.sources.length) {
      var pills = ans.sources.slice(0, 6).map(function (s) {
        var h = s.host || (function () { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch (e) { return ""; } })();
        return '<li><a href="' + esc(linkFor(s.url)) + '" target="_top" rel="noreferrer noopener" title="' + esc(s.title || "") + '">' + esc(h) + "</a></li>";
      }).join("");
      sourcesHtml = '<ul class="answer-sources" aria-label="Sources">' + pills + "</ul>";
    }
    return (
      '<article class="answer-box" data-source="' + esc(ans.source) + '">' +
      '  <div class="answer-head">' +
      '    <span class="answer-badge">Answer</span>' +
      '    <span class="answer-source">From ' + esc(ans.source) + "</span>" +
      "  </div>" +
      '  <div class="answer-body">' + thumb +
      '    <div class="answer-text-wrap">' +
      (ans.title ? '<h3 class="answer-title">' + esc(ans.title) + "</h3>" : "") +
      '      <p class="answer-text">' + esc(ans.text) + "</p>" +
      "      " + link +
      sourcesHtml +
      "    </div>" +
      "  </div>" +
      "</article>"
    );
  }

  function renderWhyPanel(r) {
    var s = r.signals || {};
    var rows = [];
    if (s.ownIndex) rows.push('<li><b>From our own index</b> — we crawled and stored this page in the Atomic index.</li>');
    if (s.titleExact) rows.push("<li><b>Exact title match</b> — this page's title matches your query.</li>");
    else if (s.titlePrefix) rows.push("<li><b>Title starts with your query</b> — strong on-topic signal.</li>");
    if (s.homepage) rows.push("<li><b>Root page of a matching site</b> — this is the site's homepage.</li>");
    if (s.popularHostTier && s.popularHostTier >= 3) rows.push("<li><b>Authoritative source</b> (tier 3) — reference-grade domain.</li>");
    else if (s.popularHostTier && s.popularHostTier >= 2) rows.push("<li><b>Reliable source</b> (tier 2) — established technical / news domain.</li>");
    else if (s.popularHostTier && s.popularHostTier >= 1) rows.push("<li><b>Community source</b> (tier 1) — forum / discussion.</li>");
    if (s.agreement && s.agreement >= 2) rows.push("<li><b>" + s.agreement + " engines agreed</b> — multiple upstream sources returned this result.</li>");
    if (typeof s.keywordCoverage === "number") {
      rows.push("<li><b>Keyword match</b>: " + Math.round((s.keywordCoverage || 0) * 100) + "% of your query terms in the title.</li>");
    }
    if (typeof r.score === "number") rows.push('<li class="why-score">Final relevance score: <code>' + r.score.toFixed(3) + "</code></li>");
    if (!rows.length) rows.push("<li>General web result.</li>");
    return (
      '<div class="why-panel" hidden>' +
      "  <p class=\"why-title\">Why this result?</p>" +
      "  <ul>" + rows.join("") + "</ul>" +
      '  <p class="why-foot">Upstream engine identity is never shown — only Atomic signals.</p>' +
      "</div>"
    );
  }

  function renderPreview(r, terms) {
    var p = r.preview;
    if (!p || !p.text) return "";
    var thumb = p.thumbnail
      ? '<img class="preview-thumb" src="' + esc(p.thumbnail) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />'
      : "";
    var textHtml = highlight(p.text, terms);
    var sourceLabel = p.source === "Wikipedia"
      ? "Wikipedia summary"
      : p.source === "Atomic index"
        ? "From our own index"
        : "Snippet";
    return (
      '<div class="result-preview" data-source="' + esc(p.source) + '">' +
      '  <span class="preview-source">' + esc(sourceLabel) + "</span>" +
      "  " + thumb +
      '  <p class="preview-text">' + textHtml + "</p>" +
      "</div>"
    );
  }

  function renderResult(r, i, terms) {
    var host = r.host || hostOf(r.url);
    var pathLabel = pathOf(r.url);
    var fav = faviconUrl(host);
    var badges = [];
    if (r.ownIndex) badges.push('<span class="badge atomic" title="Matched in the Atomic index">Atomic</span>');
    if (r.agreement && r.agreement >= 2) {
      badges.push('<span class="badge agree" title="Confirmed by ' + r.agreement + ' sources">' + r.agreement + ' sources</span>');
    }
    var titleHtml = highlight(r.title || r.url, terms);
    var previewHtml = renderPreview(r, terms);
    // Only show the raw snippet paragraph if we have no richer preview.
    var snippetHtml = (!r.preview && r.snippet) ? highlight(r.snippet, terms) : "";
    var cls = "result" + (r.ownIndex ? " atomic-hit" : "");
    var whyPanel = renderWhyPanel(r);
    return (
      '<article class="' + cls + '" data-url="' + esc(r.url) + '">' +
      '  <div class="host-line">' +
      '    <span class="fav" style="background-image:url(' + esc(fav) + ')"></span>' +
      '    <div style="display:flex;flex-direction:column;min-width:0;flex:1">' +
      '      <span class="host">' + esc(host) + "</span>" +
      '      <span class="host-url" title="' + esc(r.url) + '">' + esc(pathLabel) + "</span>" +
      "    </div>" +
      "    " + badges.join("") +
      '    <button class="result-copy icon-btn" type="button" title="Copy URL" aria-label="Copy URL" data-copy="' + esc(r.url) + '">' +
      '      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>' +
      '    </button>' +
      '    <button type="button" class="why-toggle icon-btn" title="Why this result?" aria-label="Why this result?" data-why>' +
      '      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 5 0c0 1.5-2.5 2-2.5 3.5"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>' +
      '    </button>' +
      '    <button type="button" class="safe-view" title="Open via anonymising proxy in an isolated sandbox" data-safe-view="' + esc(r.url) + '">Safe view</button>' +
      '    <span class="safety-dot" data-verdict="pending" title="Scanning for safety…"></span>' +
      "  </div>" +
      '  <a class="title" href="' + esc(linkFor(r.url)) + '" rel="noreferrer noopener" target="_top">' + titleHtml + "</a>" +
      previewHtml +
      (snippetHtml ? '<p class="snippet">' + snippetHtml + "</p>" : "") +
      whyPanel +
      "</article>"
    );
  }

  function renderDidYouMean(dym) {
    if (!dym || !dym.suggested) return "";
    return (
      '<p class="did-you-mean">Did you mean ' +
      '<a href="#" data-dym="' + esc(dym.suggested) + '">' + esc(dym.suggested) + "</a>?" +
      "</p>"
    );
  }

  function renderRelated(list) {
    if (!list || !list.length) return "";
    var pills = list.map(function (q) {
      return '<a class="related-pill" href="#" data-related="' + esc(q) + '">' + esc(q) + "</a>";
    }).join("");
    return (
      '<aside class="related-searches" aria-label="Related searches">' +
      '<span class="related-searches-label">Related</span>' + pills + "</aside>"
    );
  }

  function renderPager(data) {
    var pager = $("pager");
    var page = data.page || 1;
    var hasMore = !!data.hasMore;
    pager.hidden = false;
    pager.innerHTML =
      '<button id="prev-page" ' + (page <= 1 ? "disabled" : "") + ">← Previous</button>" +
      '<span class="pager-info">Page ' + page + "</span>" +
      '<button id="next-page" ' + (hasMore ? "" : "disabled") + ">Next →</button>";
    var prev = $("prev-page"), next = $("next-page");
    if (prev) prev.addEventListener("click", function () {
      if (state.page > 1) { state.page--; pushUrl(); doSearch(state.q); }
    });
    if (next) next.addEventListener("click", function () {
      state.page++; pushUrl(); doSearch(state.q);
    });
  }

  async function lazyLoadSafety(results) {
    var urls = results.map(function (r) { return r.url; });
    var chunks = [];
    for (var i = 0; i < urls.length; i += 10) chunks.push(urls.slice(i, i + 10));
    for (var c = 0; c < chunks.length; c++) {
      try {
        var res = await fetch("/api/safety/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: chunks[c] }),
        });
        var data = await res.json();
        (data.results || []).forEach(function (x) {
          var cards = document.querySelectorAll('.result[data-url="' + cssEscape(x.url) + '"] .safety-dot');
          cards.forEach(function (dot) {
            dot.setAttribute("data-verdict", x.verdict || "unknown");
            dot.title = verdictLabel(x);
          });
        });
      } catch (e) { /* ignore */ }
    }
  }

  function verdictLabel(x) {
    if (!x) return "Not scanned";
    if (x.verdict === "clean") return "Safe: no antivirus engine flagged this.";
    if (x.verdict === "suspicious") return (x.suspicious || 0) + " engine(s) flagged this as suspicious.";
    if (x.verdict === "malicious") return (x.malicious || 0) + " engine(s) flagged this as malicious.";
    if (x.verdict === "unscanned") return "Safety scanning isn't configured on this server.";
    return "Not yet analysed.";
  }

  function cssEscape(s) {
    if (window.CSS && window.CSS.escape) return CSS.escape(s);
    return String(s).replace(/["\\]/g, "\\$&");
  }

  async function doImages(q) {
    $("images-grid").hidden = false;
    $("images-grid").innerHTML = '<p class="empty"><span class="loading"></span>Loading images…</p>';
    $("results").hidden = true;
    $("pager").hidden = true;
    try {
      var res = await fetch("/api/images?q=" + encodeURIComponent(q));
      var data = await res.json();
      var items = (data && data.results) || [];
      if (!items.length) { $("images-grid").innerHTML = '<p class="empty">No images.</p>'; return; }
      $("images-grid").innerHTML = items.map(function (img) {
        // Use the proxied thumbnail URL (served via /api/image-proxy) so the
        // browser never contacts upstream CDNs directly. Fall back to a
        // proxied version of the full image if thumbnail is missing.
        var thumbSrc = img.thumbnail || ("/api/image-proxy?url=" + encodeURIComponent(img.image || ""));
        // Link to the source page for context.
        var viewUrl = "/go?url=" + encodeURIComponent(img.source || img.originalImage || img.image || "");
        return (
          '<a href="' + esc(viewUrl) + '" target="_top" rel="noreferrer noopener" title="' + esc(img.title || "") + '">' +
          '  <img loading="lazy" src="' + esc(thumbSrc) + '" alt="' + esc(img.title || "") + '"' +
          '    onerror="this.style.display=\'none\'">' +
          (img.title ? '<span class="caption">' + esc(img.title) + "</span>" : "") +
          "</a>"
        );
      }).join("");
    } catch (e) {
      $("images-grid").innerHTML = '<p class="empty">Could not load images.</p>';
    }
  }


  /* ---------------- URL state ---------------- */
  function pushUrl() {
    var url = new URL(location.href);
    url.searchParams.set("q", state.q);
    url.searchParams.set("tab", state.tab);
    if (state.page > 1) url.searchParams.set("page", String(state.page));
    else url.searchParams.delete("page");
    history.replaceState(null, "", url.toString());
  }

  /* ---------------- Settings modal ---------------- */
  function openModal(id) { $(id).hidden = false; document.body.style.overflow = "hidden"; }
  function closeModal(el) { el.hidden = true; document.body.style.overflow = ""; }

  function refreshSettingsUI() {
    var safetyEl = $("setting-safety");
    var proxyEl = $("setting-proxylinks");
    var perPageEl = $("setting-perpage");
    var safeSearchEl = $("setting-safesearch");
    if (safetyEl) safetyEl.checked = !!settings.safety;
    if (proxyEl) proxyEl.checked = !!settings.proxyLinks;
    if (perPageEl) perPageEl.value = String(settings.perPage);
    if (safeSearchEl) safeSearchEl.checked = settings.safeSearch !== false;
    // Sync theme select with themes.js state
    var themeEl = $("theme");
    if (themeEl) {
      try { themeEl.value = localStorage.getItem("atomic.theme") || "system"; } catch (e) { /* ignore */ }
    }
    // Sync AI toggle with ai.js state
    var aiEl = $("setting-ai");
    if (aiEl && window.AtomicAI) {
      aiEl.checked = window.AtomicAI.isEnabled();
    }
    updateSafeSearchIndicator();
  }

  // Show/hide a "Safe Search ON" chip in the topbar when safe search is active.
  function updateSafeSearchIndicator() {
    var indicator = $("safe-search-indicator");
    if (!indicator) return;
    var on = settings.safeSearch !== false;
    indicator.hidden = !on;
    indicator.title = on
      ? "Safe Search is ON — adult content is filtered"
      : "Safe Search is OFF";
  }

  function bindSettings() {
    var safetyEl = $("setting-safety");
    var proxyEl = $("setting-proxylinks");
    var perPageEl = $("setting-perpage");
    var safeSearchEl = $("setting-safesearch");
    if (safetyEl) safetyEl.addEventListener("change", function (e) { settings.safety = e.target.checked; saveSettings(settings); });
    if (proxyEl) proxyEl.addEventListener("change", function (e) { settings.proxyLinks = e.target.checked; saveSettings(settings); });
    if (perPageEl) perPageEl.addEventListener("change", function (e) {
      settings.perPage = Math.max(10, Math.min(100, Number(e.target.value) || 50));
      saveSettings(settings);
    });
    if (safeSearchEl) safeSearchEl.addEventListener("change", function (e) {
      settings.safeSearch = e.target.checked;
      saveSettings(settings);
      updateSafeSearchIndicator();
    });
    var submitFormEl = $("submit-form");
    if (submitFormEl) submitFormEl.addEventListener("submit", async function (e) {
      e.preventDefault();
      var url = $("submit-url").value.trim();
      if (!url) return;
      try {
        var res = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url }),
        });
        var data = await res.json();
        $("submit-url").value = "";
        alert(data.ok ? "Thanks — we'll crawl and index this." : (data.error || "Could not queue."));
      } catch (err) {
        alert("Could not queue.");
      }
    });
  }

  /* ---------------- Boot ---------------- */
  document.addEventListener("DOMContentLoaded", function () {
    // Initialise safe-search indicator on boot.
    updateSafeSearchIndicator();

    // Modal open/close wiring.
    var openSettings = function () { refreshSettingsUI(); openModal("settings-modal"); };
    $("open-settings").addEventListener("click", openSettings);
    $("open-settings-home").addEventListener("click", openSettings);
    $("open-submit-home").addEventListener("click", function () {
      refreshSettingsUI();
      openModal("settings-modal");
      setTimeout(function () { $("submit-url").focus(); }, 80);
    });
    // Safe-view sandbox: any "Safe view" button on a result card opens the
    // URL through /proxy inside a locked-down iframe (no top-frame nav,
    // no cookies, no storage, script-only sandbox). Event-delegated so new
    // result lists keep working.
    // "Why this result?" toggle — shows the ranking signals panel.
    document.body.addEventListener("click", function (ev) {
      var why = ev.target.closest && ev.target.closest("[data-why]");
      if (!why) return;
      ev.preventDefault();
      var card = why.closest(".result");
      if (!card) return;
      var panel = card.querySelector(".why-panel");
      if (!panel) return;
      panel.hidden = !panel.hidden;
      why.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
    });

    document.body.addEventListener("click", function (ev) {
      var btn = ev.target.closest && ev.target.closest("[data-safe-view]");
      if (!btn) return;
      ev.preventDefault();
      var target = btn.getAttribute("data-safe-view");
      if (!target) return;
      var body = $("safeview-body");
      if (!body) return;
      body.innerHTML = "";

      var toolbar = document.createElement("div");
      toolbar.className = "safeview-toolbar";
      var hostname = "";
      try { hostname = new URL(target).hostname.replace(/^www\./, ""); } catch (e) { /* ignore */ }
      toolbar.innerHTML =
        '<span class="sv-badge">Anonymised</span>' +
        '<span class="sv-host">' + esc(hostname) + '</span>' +
        '<span class="sv-status" data-ads="0">Ads blocked: <b>0</b></span>' +
        '<span class="sv-note">Cookies off \u2022 Trackers off \u2022 Login/verification will not work</span>' +
        '<a class="sv-open" href="' + esc(target) + '" target="_blank" rel="noreferrer noopener">Open real link \u2192</a>';
      body.appendChild(toolbar);

      var frame = document.createElement("iframe");
      frame.src = "/proxy?sv=1&url=" + encodeURIComponent(target);
      frame.setAttribute("sandbox", "allow-scripts allow-forms");
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.setAttribute("loading", "lazy");
      frame.title = "Safe view: " + target;
      frame.className = "vm-frame";
      body.appendChild(frame);
      openModal("safeview-modal");
    });

    // Listen for ad-blocked counters posted by the runtime shim inside the
    // proxied page, and surface the count in the toolbar.
    window.addEventListener("message", function (ev) {
      var d = ev.data;
      if (!d || !d._atomicProxy) return;
      var status = document.querySelector(".safeview-toolbar .sv-status");
      if (!status) return;
      var n = Math.max(0, parseInt(d.adsBlocked, 10) || 0);
      var cur = parseInt(status.getAttribute("data-ads"), 10) || 0;
      if (n > cur) {
        status.setAttribute("data-ads", String(n));
        var b = status.querySelector("b");
        if (b) b.textContent = String(n);
      }
    });
    Array.prototype.forEach.call(document.querySelectorAll(".modal-close"), function (b) {
      b.addEventListener("click", function (e) {
        var m = e.target.closest(".modal-backdrop");
        if (m) closeModal(m);
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll(".modal-backdrop"), function (bd) {
      bd.addEventListener("click", function (e) { if (e.target === bd) closeModal(bd); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var open = document.querySelector(".modal-backdrop:not([hidden])");
      if (open) closeModal(open);
    });

    bindSettings();

    // Tab wiring.
    Array.prototype.forEach.call(document.querySelectorAll(".tabs button"), function (b) {
      b.addEventListener("click", function () { setTab(b.getAttribute("data-tab")); });
    });

    bindScan();

    // Forms.
    function submitQuery(q) {
      q = (q || "").trim();
      if (!q) return;
      state.q = q;
      state.page = 1;
      showResults();
      $("q").value = q;
      pushUrl();
      setTab(state.tab);
      try { window.dispatchEvent(new CustomEvent("atomic:search", { detail: { q: q } })); } catch (e) { /* ignore */ }
    }
    $("home-form").addEventListener("submit", function (e) {
      e.preventDefault();
      submitQuery($("q-hero").value);
    });
    $("form").addEventListener("submit", function (e) {
      e.preventDefault();
      submitQuery($("q").value);
    });

    // Delegated handlers for related-search pills and "did you mean"
    // suggestions. Anchors live inside #results, so one handler covers
    // every re-render.
    document.addEventListener("click", function (ev) {
      var rel = ev.target.closest && ev.target.closest("[data-related]");
      var dym = ev.target.closest && ev.target.closest("[data-dym]");
      if (rel) {
        ev.preventDefault();
        var q1 = rel.getAttribute("data-related") || "";
        $("q").value = q1;
        submitQuery(q1);
        return;
      }
      if (dym) {
        ev.preventDefault();
        var q2 = dym.getAttribute("data-dym") || "";
        $("q").value = q2;
        submitQuery(q2);
      }
    });

    // Stats on home + floating index chip.
    fetch("/api/stats").then(function (r) { return r.json(); }).then(function (s) {
      if (!s) return;
      $("stats").textContent =
        (s.persistent
          ? "Atomic index: " + (s.pages || 0) + " pages indexed \u00b7 " + (s.queue || 0) + " in queue"
          : "Atomic is running. Submit sites to grow the index.") +
        " \u00b7 " + (s.cacheEntries || 0) + " cached queries" +
        ((s.answers || 0) ? " \u00b7 " + s.answers + " remembered answers" : "");
    }).catch(function () {});
    refreshIndexChip();
    // Slow background refresh so the chip stays fresh while the crawler
    // works through the queue.
    setInterval(refreshIndexChip, 30000);

    // Boot: honour ?q=… on first load.
    try {
      var url = new URL(location.href);
      var q = url.searchParams.get("q");
      var tab = url.searchParams.get("tab");
      var pageParam = parseInt(url.searchParams.get("page") || "1", 10);
      if (pageParam && pageParam > 0) state.page = pageParam;
      if (q) {
        state.q = q;
        state.tab = tab || "all";
        $("q").value = q;
        showResults();
        setTab(state.tab);
      } else {
        showHome();
      }
    } catch (e) { showHome(); }

    // Keyboard shortcuts:
    //   /  — focus search input
    //   ?  — show advanced search cheat sheet
    //   Escape — close any open dropdown/modal
    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      var inInput = /input|textarea|select/.test(tag);
      if (e.key === "/" && !inInput) {
        e.preventDefault();
        var el = $("q") || $("q-hero");
        if (el) { el.focus(); el.select(); }
        return;
      }
      if (e.key === "?" && !inInput) {
        e.preventDefault();
        var helpBtn = document.getElementById("adv-help-btn");
        if (helpBtn) helpBtn.click();
        return;
      }
      // Ctrl+K / Cmd+K — focus search (standard browser-search shortcut)
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        var searchEl = $("q") || $("q-hero");
        if (searchEl) { searchEl.focus(); searchEl.select(); }
        return;
      }
    });

    // Search history dropdown: show when the search input is focused and
    // there's history to show. Dismiss on blur or outside click.
    function bindHistoryDropdown(inputId) {
      var input = $(inputId);
      if (!input) return;
      var dropdown = null;

      function showDropdown() {
        var hist = getHistory();
        if (!hist.length) return;
        if (dropdown) dropdown.remove();
        dropdown = document.createElement("div");
        dropdown.className = "history-dropdown";
        dropdown.setAttribute("role", "listbox");
        dropdown.setAttribute("aria-label", "Recent searches");
        hist.slice(0, 8).forEach(function (q) {
          var item = document.createElement("div");
          item.className = "history-item";
          item.setAttribute("role", "option");
          item.innerHTML =
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><polyline points="12 6 12 12 16 14"/></svg>' +
            '<span>' + esc(q) + '</span>' +
            '<button class="hist-del" type="button" aria-label="Remove from history" title="Remove">✕</button>';
          item.querySelector("span").addEventListener("click", function () {
            input.value = q;
            dropdown.remove(); dropdown = null;
            submitQuery(q);
          });
          item.querySelector(".hist-del").addEventListener("click", function (e) {
            e.stopPropagation();
            try {
              var list = JSON.parse(localStorage.getItem("atomic.history") || "[]");
              list = list.filter(function (x) { return x !== q; });
              localStorage.setItem("atomic.history", JSON.stringify(list));
            } catch (err) { /* ignore */ }
            item.remove();
            if (!dropdown.querySelectorAll(".history-item").length) {
              dropdown.remove(); dropdown = null;
            }
          });
          dropdown.appendChild(item);
        });
        var clearRow = document.createElement("div");
        clearRow.className = "history-clear";
        clearRow.textContent = "Clear history";
        clearRow.addEventListener("click", function () {
          clearHistory();
          if (dropdown) { dropdown.remove(); dropdown = null; }
        });
        dropdown.appendChild(clearRow);
        // Position relative to the input's parent form.
        var form = input.closest("form");
        if (form) {
          form.style.position = "relative";
          form.appendChild(dropdown);
        } else {
          input.parentNode.appendChild(dropdown);
        }
      }

      function hideDropdown() {
        setTimeout(function () {
          if (dropdown) { dropdown.remove(); dropdown = null; }
        }, 150);
      }

      input.addEventListener("focus", showDropdown);
      input.addEventListener("blur", hideDropdown);
      input.addEventListener("input", function () {
        if (dropdown) { dropdown.remove(); dropdown = null; }
      });
    }

    bindHistoryDropdown("q");
    bindHistoryDropdown("q-hero");

    // "?" help button — add dynamically next to the results search form.
    var topbarForm = $("form");
    if (topbarForm) {
      var helpBtn = document.createElement("button");
      helpBtn.id = "adv-help-btn";
      helpBtn.type = "button";
      helpBtn.title = "Search operators (?)";
      helpBtn.setAttribute("aria-label", "Search operators help");
      helpBtn.style.cssText = "background:none;border:none;cursor:pointer;padding:4px 6px;color:var(--text-mute);font-size:13px;border-radius:4px;";
      helpBtn.textContent = "?";
      helpBtn.addEventListener("mouseenter", function () { helpBtn.style.color = "var(--accent)"; });
      helpBtn.addEventListener("mouseleave", function () { helpBtn.style.color = "var(--text-mute)"; });
      topbarForm.parentNode.insertBefore(helpBtn, topbarForm.nextSibling);
    }
  });
})();
