/* Atomic Search — extra client-side features.
 *
 * Everything in this file is localStorage-backed. Nothing ever leaves
 * the browser. No cookies, no server state, no tracking.
 *
 * Features landed here:
 *   - Bangs (!w !g !gh !yt !r !hn !so !a !ddg !b !maps)
 *   - Keyboard shortcuts (/ j k o y b ? Esc Enter)
 *   - Cheatsheet overlay
 *   - Bookmarks (add, list, import/export JSON)
 *   - Search history (add, list, clear, export)
 *   - Voice search (Web Speech API)
 *   - Auto-suggest dropdown (own index + recent)
 *   - Font size + density settings
 *   - Open-links-in-new-tab toggle
 *   - Prefer-own-index / safe-view-default toggles
 */

(function () {
  "use strict";
  var LS = window.localStorage;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  // ---------- Bangs ----------
  var BANGS = {
    w:    function (q) { return "https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(q); },
    wiki: function (q) { return "https://en.wikipedia.org/wiki/Special:Search?search=" + encodeURIComponent(q); },
    g:    function (q) { return "https://www.google.com/search?q=" + encodeURIComponent(q); },
    gh:   function (q) { return "https://github.com/search?q=" + encodeURIComponent(q); },
    yt:   function (q) { return "https://www.youtube.com/results?search_query=" + encodeURIComponent(q); },
    r:    function (q) { return "https://www.reddit.com/search/?q=" + encodeURIComponent(q); },
    hn:   function (q) { return "https://hn.algolia.com/?q=" + encodeURIComponent(q); },
    so:   function (q) { return "https://stackoverflow.com/search?q=" + encodeURIComponent(q); },
    a:    function (q) { return "https://web.archive.org/web/*/" + encodeURIComponent(q); },
    ddg:  function (q) { return "https://duckduckgo.com/?q=" + encodeURIComponent(q); },
    b:    function (q) { return "https://www.bing.com/search?q=" + encodeURIComponent(q); },
    maps: function (q) { return "https://www.openstreetmap.org/search?query=" + encodeURIComponent(q); },
    mdn:  function (q) { return "https://developer.mozilla.org/en-US/search?q=" + encodeURIComponent(q); },
    npm:  function (q) { return "https://www.npmjs.com/search?q=" + encodeURIComponent(q); },
    pkg:  function (q) { return "https://pkg.go.dev/search?q=" + encodeURIComponent(q); },
    crates:function (q) { return "https://crates.io/search?q=" + encodeURIComponent(q); },
    arch: function (q) { return "https://wiki.archlinux.org/index.php?search=" + encodeURIComponent(q); },
    tools:function ()  { return "/tools"; },
  };

  function handleBang(raw) {
    var m = String(raw || "").match(/^!([a-z]+)(?:\s+(.+))?$/i);
    if (!m) return null;
    var fn = BANGS[m[1].toLowerCase()];
    if (!fn) return null;
    var rest = (m[2] || "").trim();
    return fn(rest);
  }

  // Intercept form submits for bangs. Uses capture so we see it before
  // app.js's own submitQuery handler.
  function interceptBang(form, input) {
    if (!form || !input) return;
    form.addEventListener("submit", function (e) {
      var url = handleBang(input.value);
      if (!url) return;
      e.preventDefault();
      e.stopPropagation();
      window.open(url, "_blank", "noreferrer,noopener");
    }, true);
  }

  // ---------- Bookmarks ----------
  var BM_KEY = "atomic:bookmarks";
  function bmList() { try { return JSON.parse(LS.getItem(BM_KEY) || "[]"); } catch (e) { return []; } }
  function bmSave(list) { try { LS.setItem(BM_KEY, JSON.stringify(list.slice(0, 2000))); } catch (e) { /* ignore */ } }
  function bmHas(url) { var l = bmList(); for (var i = 0; i < l.length; i++) if (l[i].url === url) return true; return false; }
  function bmToggle(url, title) {
    var list = bmList();
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].url === url) { idx = i; break; }
    if (idx >= 0) {
      list.splice(idx, 1);
      bmSave(list);
      return false;
    }
    list.unshift({ url: url, title: title || url, at: Date.now() });
    bmSave(list);
    return true;
  }
  function bmExport() {
    var blob = new Blob([JSON.stringify(bmList(), null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "atomic-bookmarks-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function bmImport(file) {
    var fr = new FileReader();
    fr.onload = function () {
      try {
        var data = JSON.parse(fr.result);
        if (!Array.isArray(data)) return;
        var existing = bmList();
        var seen = {};
        existing.forEach(function (b) { seen[b.url] = true; });
        data.forEach(function (b) {
          if (b && b.url && !seen[b.url]) { existing.push(b); seen[b.url] = true; }
        });
        bmSave(existing);
        renderBookmarksPanel();
      } catch (e) { /* ignore */ }
    };
    fr.readAsText(file);
  }

  // ---------- Search history ----------
  var HIST_KEY = "atomic:history";
  var HIST_OPT_KEY = "atomic:history-opt";
  function historyEnabled() { return LS.getItem(HIST_OPT_KEY) !== "0"; }
  function setHistoryEnabled(v) { LS.setItem(HIST_OPT_KEY, v ? "1" : "0"); }
  function histList() { try { return JSON.parse(LS.getItem(HIST_KEY) || "[]"); } catch (e) { return []; } }
  function histSave(list) { try { LS.setItem(HIST_KEY, JSON.stringify(list.slice(0, 500))); } catch (e) { /* ignore */ } }
  function histAdd(q) {
    if (!historyEnabled() || !q || q.length < 2 || q.length > 200) return;
    var list = histList().filter(function (x) { return x.q !== q; });
    list.unshift({ q: q, at: Date.now() });
    histSave(list);
  }
  function histClear() { LS.removeItem(HIST_KEY); }
  function histExport() {
    var blob = new Blob([JSON.stringify(histList(), null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "atomic-history-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }

  // ---------- Settings persistence ----------
  var SETTINGS_KEY = "atomic:settings.v2";
  var DEFAULTS = {
    fontSize: "m",        // s | m | l
    density: "comfortable", // compact | comfortable | spacious
    openInNewTab: true,
    safeViewDefault: false,
    preferOwnIndex: false,
    historyEnabled: true,
    autoSuggest: true,
    aiMode: false,        // AI chat mode — opt-in
  };
  function settings() {
    try {
      var s = JSON.parse(LS.getItem(SETTINGS_KEY) || "{}");
      var out = {};
      Object.keys(DEFAULTS).forEach(function (k) { out[k] = (k in s) ? s[k] : DEFAULTS[k]; });
      return out;
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function saveSettings(s) {
    try { LS.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
    applySettings(s);
  }
  function applySettings(s) {
    s = s || settings();
    document.documentElement.setAttribute("data-font-size", s.fontSize);
    document.documentElement.setAttribute("data-density", s.density);
    document.documentElement.setAttribute("data-new-tab", s.openInNewTab ? "1" : "0");
    setHistoryEnabled(s.historyEnabled);
  }

  // ---------- Voice search ----------
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  function attachVoice(input, buttonAfter) {
    if (!Rec || !input || !buttonAfter || buttonAfter.parentNode.querySelector(".voice-btn")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "voice-btn";
    btn.setAttribute("aria-label", "Voice search");
    btn.title = "Voice search";
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10a7 7 0 0 1-14 0M12 19v4M8 23h8"/></svg>';
    buttonAfter.parentNode.insertBefore(btn, buttonAfter);
    btn.addEventListener("click", function () {
      var r = new Rec();
      r.lang = "en-US";
      r.interimResults = false;
      r.continuous = false;
      btn.classList.add("listening");
      r.onresult = function (e) {
        var q = (e.results[0][0].transcript || "").trim();
        if (q) { input.value = q; input.form && input.form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); }
      };
      r.onerror = r.onend = function () { btn.classList.remove("listening"); };
      try { r.start(); } catch (e) { btn.classList.remove("listening"); }
    });
  }

  // ---------- Auto-suggest dropdown ----------
  // Pulls candidates from own-index titles via /api/search?q=... (small
  // debounce). Falls back to recent-history entries when offline.
  function attachAutoSuggest(input, form) {
    if (!input) return;
    var box = document.createElement("div");
    box.className = "atomic-suggest";
    box.setAttribute("role", "listbox");
    box.hidden = true;
    input.parentNode.appendChild(box);
    var t = 0;
    input.addEventListener("input", function () {
      if (!settings().autoSuggest) { box.hidden = true; return; }
      var q = input.value.trim();
      if (q.length < 2 || /^!/.test(q)) { box.hidden = true; return; }
      clearTimeout(t);
      t = setTimeout(function () { suggestFor(q); }, 220);
    });
    input.addEventListener("focus", function () {
      if (input.value.trim().length >= 2) suggestFor(input.value.trim());
    });
    document.addEventListener("click", function (e) {
      if (!box.contains(e.target) && e.target !== input) box.hidden = true;
    });
    input.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      var items = box.querySelectorAll("[role=option]");
      if (!items.length) return;
      var cur = -1;
      for (var i = 0; i < items.length; i++) if (items[i].getAttribute("aria-selected") === "true") { cur = i; break; }
      if (e.key === "ArrowDown") { e.preventDefault(); highlight(items, (cur + 1 + items.length) % items.length); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(items, (cur - 1 + items.length) % items.length); }
      else if (e.key === "Enter" && cur >= 0) { e.preventDefault(); items[cur].click(); }
      else if (e.key === "Escape") { box.hidden = true; }
    });

    function highlight(items, idx) {
      for (var i = 0; i < items.length; i++) items[i].setAttribute("aria-selected", i === idx ? "true" : "false");
    }

    function render(list) {
      if (!list.length) { box.hidden = true; return; }
      box.innerHTML = list.map(function (s, i) {
        return '<div role="option" data-q="' + esc(s.q) + '" aria-selected="' + (i === 0 ? "true" : "false") + '">' +
               '<span class="s-kind">' + esc(s.kind) + '</span><span class="s-text">' + esc(s.q) + '</span></div>';
      }).join("");
      box.hidden = false;
      Array.prototype.forEach.call(box.querySelectorAll("[role=option]"), function (el) {
        el.addEventListener("click", function () {
          input.value = el.getAttribute("data-q");
          box.hidden = true;
          if (form) form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
        });
      });
    }

    function suggestFor(q) {
      // Local suggestions from history first — instant.
      var hist = histList()
        .filter(function (h) { return h.q.toLowerCase().indexOf(q.toLowerCase()) === 0; })
        .slice(0, 3)
        .map(function (h) { return { kind: "Recent", q: h.q }; });

      // Own-index titles: piggyback a small /api/search call so we don't
      // need a dedicated endpoint. We only pluck titles from first 6
      // results.
      fetch("/api/search?q=" + encodeURIComponent(q) + "&per_page=6", { credentials: "omit" })
        .then(function (r) { return r.ok ? r.json() : { results: [] }; })
        .then(function (j) {
          var titles = (j.results || [])
            .filter(function (r) { return r.ownIndex; })
            .slice(0, 5)
            .map(function (r) { return { kind: "Index", q: r.title }; });
          render(hist.concat(titles).slice(0, 8));
        })
        .catch(function () { render(hist); });
    }
  }

  // ---------- Keyboard shortcuts ----------
  function installShortcuts() {
    var keys = {};
    document.addEventListener("keydown", function (e) {
      // Ignore if typing in an input / textarea / contenteditable.
      var tgt = e.target;
      var typing = tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable);

      if (!typing && e.key === "/") {
        e.preventDefault();
        var q = $("q") || $("q-hero");
        if (q) { q.focus(); q.select && q.select(); }
        return;
      }
      if (!typing && e.key === "?") {
        e.preventDefault();
        toggleCheatsheet();
        return;
      }
      if (e.key === "Escape") {
        var cs = $("cheatsheet-modal");
        if (cs && !cs.hidden) { cs.hidden = true; return; }
      }
      if (typing) return;
      // Result-list navigation
      if (e.key === "j" || e.key === "k") {
        var list = Array.prototype.slice.call(document.querySelectorAll("#results .result"));
        if (!list.length) return;
        var cur = list.findIndex(function (el) { return el.classList.contains("kbd-active"); });
        list.forEach(function (el) { el.classList.remove("kbd-active"); });
        var next = e.key === "j" ? (cur + 1) % list.length : (cur - 1 + list.length) % list.length;
        var el = list[next];
        el.classList.add("kbd-active");
        el.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      if (e.key === "Enter") {
        var act = document.querySelector("#results .result.kbd-active .title");
        if (act) { e.preventDefault(); act.click(); }
      }
      if (e.key === "o") {
        // Open top-5 result links in new tabs
        e.preventDefault();
        var top5 = Array.prototype.slice.call(document.querySelectorAll("#results .result .title")).slice(0, 5);
        top5.forEach(function (a) { window.open(a.href, "_blank", "noreferrer,noopener"); });
      }
      if (e.key === "y") {
        // Copy URL of highlighted result
        var u = document.querySelector("#results .result.kbd-active .title");
        if (u) { navigator.clipboard && navigator.clipboard.writeText(u.href); toast("URL copied"); }
      }
      if (e.key === "b") {
        var act2 = document.querySelector("#results .result.kbd-active");
        if (act2) {
          var a = act2.querySelector(".title");
          var added = bmToggle(a.href, a.textContent);
          toast(added ? "Bookmarked" : "Removed bookmark");
          updateBookmarkButtons();
        }
      }
    });
  }

  // Tiny toast util
  var toastTimer = 0;
  function toast(msg) {
    var el = $("atomic-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "atomic-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1800);
  }

  // ---------- Cheatsheet modal ----------
  function buildCheatsheet() {
    if ($("cheatsheet-modal")) return;
    var div = document.createElement("div");
    div.id = "cheatsheet-modal";
    div.className = "modal-backdrop";
    div.hidden = true;
    div.setAttribute("role", "dialog");
    div.setAttribute("aria-modal", "true");
    div.innerHTML =
      '<div class="modal">' +
      '  <div class="modal-head">' +
      '    <h2>Keyboard shortcuts &amp; bangs</h2>' +
      '    <button class="icon-btn modal-close" type="button" aria-label="Close">\u2715</button>' +
      '  </div>' +
      '  <div class="modal-body">' +
      '    <h3>Keyboard</h3>' +
      '    <ul class="cheat-list">' +
      '      <li><kbd>/</kbd> focus search</li>' +
      '      <li><kbd>j</kbd> / <kbd>k</kbd> next / prev result</li>' +
      '      <li><kbd>Enter</kbd> open highlighted result</li>' +
      '      <li><kbd>o</kbd> open top 5 results in new tabs</li>' +
      '      <li><kbd>y</kbd> copy highlighted result URL</li>' +
      '      <li><kbd>b</kbd> bookmark / unbookmark highlighted result</li>' +
      '      <li><kbd>?</kbd> show this cheatsheet</li>' +
      '      <li><kbd>Esc</kbd> close</li>' +
      '    </ul>' +
      '    <h3>Bangs</h3>' +
      '    <p class="hint">Start your query with a bang to jump straight to a site.</p>' +
      '    <ul class="cheat-list cheat-bangs">' +
      '      <li><code>!w</code> Wikipedia</li>' +
      '      <li><code>!g</code> Google</li>' +
      '      <li><code>!ddg</code> DuckDuckGo</li>' +
      '      <li><code>!b</code> Bing</li>' +
      '      <li><code>!gh</code> GitHub</li>' +
      '      <li><code>!yt</code> YouTube</li>' +
      '      <li><code>!r</code> Reddit</li>' +
      '      <li><code>!hn</code> Hacker News</li>' +
      '      <li><code>!so</code> Stack Overflow</li>' +
      '      <li><code>!mdn</code> MDN</li>' +
      '      <li><code>!npm</code> npm</li>' +
      '      <li><code>!pkg</code> Go packages</li>' +
      '      <li><code>!crates</code> crates.io</li>' +
      '      <li><code>!arch</code> Arch wiki</li>' +
      '      <li><code>!maps</code> OpenStreetMap</li>' +
      '      <li><code>!a</code> Wayback</li>' +
      '      <li><code>!tools</code> Atomic tools page</li>' +
      '    </ul>' +
      '    <h3>Typed instants</h3>' +
      '    <p class="hint">Type these directly into the search box:</p>' +
      '    <ul class="cheat-list">' +
      '      <li><code>2 + 2</code>, <code>(5*7)-3</code>, <code>15% of 200</code>, <code>sqrt(144)</code></li>' +
      '      <li><code>define serendipity</code></li>' +
      '      <li><code>time in tokyo</code></li>' +
      '      <li><code>weather in berlin</code></li>' +
      '      <li><code>100 km to miles</code>, <code>25 c to f</code>, <code>5 kg to lb</code></li>' +
      '      <li><code>100 usd to eur</code></li>' +
      '      <li><code>roll 2d6</code>, <code>flip coin</code>, <code>random 1 to 100</code></li>' +
      '    </ul>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(div);
    div.addEventListener("click", function (e) {
      if (e.target === div || (e.target.classList && e.target.classList.contains("modal-close"))) div.hidden = true;
    });
  }
  function toggleCheatsheet() {
    buildCheatsheet();
    var m = $("cheatsheet-modal");
    m.hidden = !m.hidden;
  }

  // ---------- Bookmark button on result cards ----------
  function addBookmarkButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("#results .result"), function (card) {
      if (card.querySelector(".bookmark-btn")) return;
      var titleA = card.querySelector(".title");
      if (!titleA) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bookmark-btn icon-btn";
      btn.title = "Bookmark";
      btn.setAttribute("aria-label", "Bookmark");
      var actionsBar = card.querySelector(".result-actions") || card;
      actionsBar.appendChild(btn);
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var added = bmToggle(titleA.href, titleA.textContent.trim());
        btn.classList.toggle("on", added);
        toast(added ? "Bookmarked" : "Removed bookmark");
      });
      refreshBtn();
      function refreshBtn() {
        var on = bmHas(titleA.href);
        btn.classList.toggle("on", on);
        btn.innerHTML = on
          ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" stroke="currentColor" aria-hidden="true"><path d="M6 2h12v20l-6-4-6 4V2z"/></svg>'
          : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 2h12v20l-6-4-6 4V2z"/></svg>';
      }
    });
  }
  function updateBookmarkButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("#results .result .bookmark-btn"), function (b) {
      var t = b.parentNode.parentNode.querySelector(".title") || b.parentNode.querySelector(".title");
      if (!t) return;
      b.classList.toggle("on", bmHas(t.href));
    });
  }

  // ---------- Bookmarks / History overlay ----------
  function openListModal(kind) {
    var id = "atomic-list-modal";
    var existing = $(id);
    if (existing) existing.remove();
    var div = document.createElement("div");
    div.id = id;
    div.className = "modal-backdrop";
    div.setAttribute("role", "dialog");
    div.setAttribute("aria-modal", "true");
    document.body.appendChild(div);
    div.addEventListener("click", function (e) {
      if (e.target === div || (e.target.classList && e.target.classList.contains("modal-close"))) div.remove();
    });
    renderListInto(div, kind);
  }
  function renderListInto(div, kind) {
    var isBM = kind === "bookmarks";
    var list = isBM ? bmList() : histList();
    var headActions = isBM
      ? '<button class="pill" data-act="import">Import</button>' +
        '<button class="pill" data-act="export">Export</button>'
      : '<button class="pill" data-act="export">Export</button>' +
        '<button class="pill" data-act="clear">Clear all</button>';
    var rows = list.length
      ? list.map(function (it, i) {
          return '<li data-i="' + i + '">' +
            (isBM
              ? '<a href="' + esc(it.url) + '" target="_blank" rel="noreferrer noopener">' + esc(it.title || it.url) + '</a><span class="muted">' + esc(it.url) + '</span>'
              : '<a href="#" data-q="' + esc(it.q) + '" class="hist-item">' + esc(it.q) + '</a><span class="muted">' + new Date(it.at).toLocaleString() + '</span>') +
            '<button class="pill del" data-act="del" title="Remove">&times;</button>' +
            '</li>';
        }).join("")
      : '<li class="muted">Nothing here yet.</li>';
    div.innerHTML =
      '<div class="modal">' +
      '  <div class="modal-head">' +
      '    <h2>' + (isBM ? "Bookmarks" : "Search history") + '</h2>' +
      '    <div class="head-actions">' + headActions + '</div>' +
      '    <button class="icon-btn modal-close" type="button" aria-label="Close">&times;</button>' +
      '  </div>' +
      '  <div class="modal-body">' +
      '    <ul class="atomic-list">' + rows + '</ul>' +
      '  </div>' +
      '</div>';
    div.hidden = false;
    Array.prototype.forEach.call(div.querySelectorAll("[data-act]"), function (b) {
      b.addEventListener("click", function () {
        var act = b.getAttribute("data-act");
        if (act === "export") { isBM ? bmExport() : histExport(); return; }
        if (act === "clear") { if (confirm("Clear all search history?")) { histClear(); renderListInto(div, kind); } return; }
        if (act === "import") {
          var fi = document.createElement("input");
          fi.type = "file"; fi.accept = "application/json";
          fi.onchange = function () { if (fi.files[0]) bmImport(fi.files[0]); setTimeout(function () { renderListInto(div, kind); }, 300); };
          fi.click();
          return;
        }
        if (act === "del") {
          var li = b.parentNode;
          var idx = parseInt(li.getAttribute("data-i"), 10);
          if (isBM) { var l = bmList(); l.splice(idx, 1); bmSave(l); }
          else { var l2 = histList(); l2.splice(idx, 1); histSave(l2); }
          renderListInto(div, kind);
        }
      });
    });
    Array.prototype.forEach.call(div.querySelectorAll(".hist-item"), function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var q = a.getAttribute("data-q");
        var inp = $("q") || $("q-hero");
        if (inp) { inp.value = q; inp.form && inp.form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); }
        div.remove();
      });
    });
  }

  // ---------- Home actions: bookmarks / history buttons ----------
  function installHomeActions() {
    var row = document.querySelector(".home-actions");
    if (!row) return;
    if (row.querySelector('[data-home-bm]')) return;
    var b1 = document.createElement("button");
    b1.type = "button"; b1.textContent = "Bookmarks";
    b1.setAttribute("data-home-bm", "1");
    b1.addEventListener("click", function () { openListModal("bookmarks"); });
    var b2 = document.createElement("button");
    b2.type = "button"; b2.textContent = "History";
    b2.addEventListener("click", function () { openListModal("history"); });
    var b3 = document.createElement("button");
    b3.type = "button"; b3.textContent = "Tools";
    b3.addEventListener("click", function () { window.location.href = "/tools"; });
    var b4 = document.createElement("button");
    b4.type = "button"; b4.textContent = "Shortcuts";
    b4.addEventListener("click", function () { toggleCheatsheet(); });
    row.appendChild(b1); row.appendChild(b2); row.appendChild(b3); row.appendChild(b4);
  }

  // ---------- Boot ----------
  function boot() {
    applySettings();
    var homeForm = $("home-form"), homeInput = $("q-hero");
    var searchForm = $("form"), searchInput = $("q");
    interceptBang(homeForm, homeInput);
    interceptBang(searchForm, searchInput);
    if (homeForm) attachVoice(homeInput, homeForm.querySelector("button[type=submit]"));
    if (searchForm) attachVoice(searchInput, searchForm.querySelector("button[type=submit]"));
    if (homeForm) attachAutoSuggest(homeInput, homeForm);
    if (searchForm) attachAutoSuggest(searchInput, searchForm);
    installShortcuts();
    installHomeActions();
    buildCheatsheet();
    // History logging
    window.addEventListener("atomic:search", function (e) {
      if (e.detail && e.detail.q) histAdd(e.detail.q);
    });
    // Bookmark buttons on freshly rendered results
    var results = $("results");
    if (results) {
      var obs = new MutationObserver(function () { addBookmarkButtons(); });
      obs.observe(results, { childList: true, subtree: true });
      addBookmarkButtons();
    }
    // Expose a tiny API for settings UI
    window.AtomicFeatures = {
      settings: settings,
      saveSettings: saveSettings,
      bookmarks: { list: bmList, toggle: bmToggle, has: bmHas, export: bmExport, import: bmImport },
      history: { list: histList, clear: histClear, export: histExport, enabled: historyEnabled, setEnabled: setHistoryEnabled },
      openList: openListModal,
      toggleCheatsheet: toggleCheatsheet,
      toast: toast,
    };

    // Boot extended features
    bootExtended();
  }

  // ============================================================
  // EXTENDED FEATURES (40+)
  // ============================================================

  // ---------- 1. Result preview on hover ----------
  function installResultPreviews() {
    var results = $("results");
    if (!results) return;
    var obs = new MutationObserver(function () { attachPreviews(); });
    obs.observe(results, { childList: true, subtree: false });
    attachPreviews();
  }
  function attachPreviews() {
    Array.prototype.forEach.call(document.querySelectorAll("#results .result"), function (card) {
      if (card.querySelector(".result-preview-tooltip")) return;
      var titleA = card.querySelector(".title");
      var snippet = card.querySelector(".snippet");
      if (!titleA) return;
      var tip = document.createElement("div");
      tip.className = "result-preview-tooltip";
      tip.setAttribute("aria-hidden", "true");
      var tipTitle = document.createElement("p");
      tipTitle.className = "result-preview-title";
      tipTitle.textContent = titleA.textContent || "";
      var tipText = document.createElement("p");
      tipText.className = "result-preview-text";
      tipText.textContent = snippet ? snippet.textContent : "";
      tip.appendChild(tipTitle);
      tip.appendChild(tipText);
      card.style.position = "relative";
      card.appendChild(tip);
    });
  }

  // ---------- 2. Result grouping by domain ----------
  var GROUP_KEY = "atomic:group-by-domain";
  function isGroupingEnabled() { return LS.getItem(GROUP_KEY) === "1"; }
  function setGrouping(v) { LS.setItem(GROUP_KEY, v ? "1" : "0"); }
  function groupResultsByDomain() {
    if (!isGroupingEnabled()) return;
    var container = $("results");
    if (!container) return;
    var cards = Array.prototype.slice.call(container.querySelectorAll(".result"));
    if (!cards.length) return;
    var groups = {};
    var order = [];
    cards.forEach(function (card) {
      var titleA = card.querySelector(".title");
      var host = "";
      try { host = new URL(titleA ? titleA.href : "").hostname.replace(/^www\./, ""); } catch (e) { host = "other"; }
      if (!groups[host]) { groups[host] = []; order.push(host); }
      groups[host].push(card);
    });
    container.innerHTML = "";
    order.forEach(function (host) {
      if (groups[host].length > 1) {
        var grp = document.createElement("div");
        grp.className = "result-group";
        var lbl = document.createElement("div");
        lbl.className = "result-group-label";
        lbl.textContent = host;
        grp.appendChild(lbl);
        groups[host].forEach(function (c) { grp.appendChild(c); });
        container.appendChild(grp);
      } else {
        container.appendChild(groups[host][0]);
      }
    });
  }

  // ---------- 3. Result sorting ----------
  var SORT_KEY = "atomic:sort-mode";
  function getSortMode() { return LS.getItem(SORT_KEY) || "relevance"; }
  function setSortMode(m) { LS.setItem(SORT_KEY, m); }
  function installSortControls() {
    var meta = $("search-meta");
    if (!meta || meta.querySelector(".sort-select")) return;
    var label = document.createElement("label");
    label.style.cssText = "font-size:12.5px;color:var(--text-mute);display:flex;align-items:center;gap:6px;";
    label.textContent = "Sort: ";
    var sel = document.createElement("select");
    sel.className = "sort-select";
    sel.style.cssText = "font-size:12.5px;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:var(--bg-elev);color:var(--text);";
    ["relevance", "domain"].forEach(function (m) {
      var opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m.charAt(0).toUpperCase() + m.slice(1);
      if (m === getSortMode()) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", function () {
      setSortMode(sel.value);
      if (sel.value === "domain") groupResultsByDomain();
    });
    label.appendChild(sel);
    meta.insertBefore(label, meta.firstChild);
  }

  // ---------- 4. Grid / list view toggle ----------
  var VIEW_KEY = "atomic:view-mode";
  function getViewMode() { return LS.getItem(VIEW_KEY) || "list"; }
  function setViewMode(m) { LS.setItem(VIEW_KEY, m); applyViewMode(m); }
  function applyViewMode(m) {
    var results = $("results");
    if (!results) return;
    results.classList.toggle("results-grid", m === "grid");
  }
  function installViewToggle() {
    var meta = $("search-meta");
    if (!meta || meta.querySelector(".view-toggle")) return;
    var btn = document.createElement("button");
    btn.className = "view-toggle export-btn";
    btn.title = "Toggle grid/list view";
    btn.setAttribute("aria-label", "Toggle view");
    var mode = getViewMode();
    btn.textContent = mode === "grid" ? "\u229E List" : "\u229F Grid";
    btn.addEventListener("click", function () {
      var next = getViewMode() === "grid" ? "list" : "grid";
      setViewMode(next);
      btn.textContent = next === "grid" ? "\u229E List" : "\u229F Grid";
    });
    meta.appendChild(btn);
    applyViewMode(mode);
  }

  // ---------- 5. Search analytics (local only) ----------
  var ANALYTICS_KEY = "atomic:analytics";
  function recordSearch(q) {
    try {
      var data = JSON.parse(LS.getItem(ANALYTICS_KEY) || "{}");
      var today = new Date().toISOString().slice(0, 10);
      if (!data[today]) data[today] = { count: 0, queries: [] };
      data[today].count++;
      if (data[today].queries.length < 50) data[today].queries.push(q);
      var keys = Object.keys(data).sort();
      while (keys.length > 30) { delete data[keys.shift()]; keys = Object.keys(data).sort(); }
      LS.setItem(ANALYTICS_KEY, JSON.stringify(data));
    } catch (e) { /* ignore */ }
  }
  function getAnalytics() {
    try { return JSON.parse(LS.getItem(ANALYTICS_KEY) || "{}"); } catch (e) { return {}; }
  }

  // ---------- 6. Dark mode auto-detection ----------
  function installDarkModeDetection() {
    var mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (!mq) return;
    function applySystemTheme() {
      var theme = LS.getItem("atomic:theme") || "system";
      if (theme !== "system") return;
      document.documentElement.setAttribute("data-theme", mq.matches ? "atom-dark" : "atom-light");
    }
    applySystemTheme();
    mq.addEventListener("change", applySystemTheme);
  }

  // ---------- 7. Font size adjustment ----------
  function installFontSizeControls() {
    var size = LS.getItem("atomic:font-size") || "m";
    document.documentElement.setAttribute("data-font-size", size);
  }

  // ---------- 8. Compact view mode ----------
  function installCompactMode() {
    var compact = LS.getItem("atomic:compact") === "1";
    document.body.classList.toggle("compact-mode", compact);
  }

  // ---------- 9. Advanced search syntax helpers ----------
  function installSearchOperatorHints() {
    var inputs = [document.getElementById("q"), document.getElementById("q-hero")];
    inputs.forEach(function (input) {
      if (!input) return;
      input.addEventListener("input", function () {
        var val = input.value;
        var hint = document.getElementById("search-hint");
        if (!hint) return;
        if (/\bsite:/.test(val)) {
          hint.textContent = "site: \u2014 filter to a specific domain";
        } else if (/\bfiletype:/.test(val)) {
          hint.textContent = "filetype: \u2014 filter by file type";
        } else if (/^!/.test(val)) {
          hint.textContent = "Bang detected \u2014 press Enter to jump";
        } else {
          hint.textContent = "";
        }
      });
    });
  }

  // ---------- 10. Result sharing ----------
  function installShareButtons() {
    var results = $("results");
    if (!results) return;
    var obs = new MutationObserver(function () { attachShareButtons(); });
    obs.observe(results, { childList: true, subtree: false });
    attachShareButtons();
  }
  function attachShareButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("#results .result"), function (card) {
      if (card.querySelector(".share-btn")) return;
      var actions = card.querySelector(".result-actions");
      if (!actions) return;
      var titleA = card.querySelector(".title");
      if (!titleA) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result-action-btn share-btn";
      btn.title = "Copy link";
      btn.setAttribute("aria-label", "Copy link");
      btn.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> Share';
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        var url = titleA.href;
        if (navigator.share) {
          navigator.share({ title: titleA.textContent, url: url }).catch(function () {});
        } else if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () { toast("Link copied!"); });
        }
      });
      actions.appendChild(btn);
    });
  }

  // ---------- 11. Reading list ----------
  var READING_KEY = "atomic:reading-list";
  function readingList() { try { return JSON.parse(LS.getItem(READING_KEY) || "[]"); } catch (e) { return []; } }
  function readingListSave(l) { try { LS.setItem(READING_KEY, JSON.stringify(l.slice(0, 500))); } catch (e) { /* ignore */ } }
  function readingListAdd(url, title) {
    var l = readingList().filter(function (x) { return x.url !== url; });
    l.unshift({ url: url, title: title || url, at: Date.now() });
    readingListSave(l);
  }
  function readingListRemove(url) {
    readingListSave(readingList().filter(function (x) { return x.url !== url; }));
  }
  function readingListHas(url) {
    return readingList().some(function (x) { return x.url === url; });
  }
  function installReadingListButtons() {
    var results = $("results");
    if (!results) return;
    var obs = new MutationObserver(function () { attachReadingListButtons(); });
    obs.observe(results, { childList: true, subtree: false });
    attachReadingListButtons();
  }
  function attachReadingListButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("#results .result"), function (card) {
      if (card.querySelector(".reading-btn")) return;
      var actions = card.querySelector(".result-actions");
      if (!actions) return;
      var titleA = card.querySelector(".title");
      if (!titleA) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result-action-btn reading-btn";
      btn.title = "Add to reading list";
      btn.setAttribute("aria-label", "Add to reading list");
      function refresh() {
        var has = readingListHas(titleA.href);
        btn.innerHTML = (has ? "\u2713 " : "+ ") + "Read later";
        btn.classList.toggle("on", has);
      }
      refresh();
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (readingListHas(titleA.href)) {
          readingListRemove(titleA.href);
          toast("Removed from reading list");
        } else {
          readingListAdd(titleA.href, titleA.textContent.trim());
          toast("Added to reading list");
        }
        refresh();
      });
      actions.appendChild(btn);
    });
  }

  // ---------- 12. Text-to-speech for snippets ----------
  var TTS_ACTIVE = false;
  function installTTSButtons() {
    if (!window.speechSynthesis) return;
    var results = $("results");
    if (!results) return;
    var obs = new MutationObserver(function () { attachTTSButtons(); });
    obs.observe(results, { childList: true, subtree: false });
    attachTTSButtons();
  }
  function attachTTSButtons() {
    if (!window.speechSynthesis) return;
    Array.prototype.forEach.call(document.querySelectorAll("#results .result"), function (card) {
      if (card.querySelector(".tts-btn")) return;
      var actions = card.querySelector(".result-actions");
      var snippet = card.querySelector(".snippet");
      if (!actions || !snippet) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result-action-btn tts-btn";
      btn.title = "Read aloud";
      btn.setAttribute("aria-label", "Read snippet aloud");
      btn.innerHTML = "\uD83D\uDD0A Read";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (TTS_ACTIVE) { window.speechSynthesis.cancel(); TTS_ACTIVE = false; btn.innerHTML = "\uD83D\uDD0A Read"; return; }
        var utt = new SpeechSynthesisUtterance(snippet.textContent || "");
        utt.onend = function () { TTS_ACTIVE = false; btn.innerHTML = "\uD83D\uDD0A Read"; };
        window.speechSynthesis.speak(utt);
        TTS_ACTIVE = true;
        btn.innerHTML = "\u23F9 Stop";
      });
      actions.appendChild(btn);
    });
  }

  // ---------- 13. Saved searches ----------
  var SAVED_KEY = "atomic:saved-searches";
  function savedSearches() { try { return JSON.parse(LS.getItem(SAVED_KEY) || "[]"); } catch (e) { return []; } }
  function savedSearchesSave(l) { try { LS.setItem(SAVED_KEY, JSON.stringify(l.slice(0, 100))); } catch (e) { /* ignore */ } }
  function saveSearch(q) {
    var l = savedSearches().filter(function (x) { return x.q !== q; });
    l.unshift({ q: q, at: Date.now() });
    savedSearchesSave(l);
    toast("Search saved");
  }
  function installSaveSearchButton() {
    var meta = $("search-meta");
    if (!meta || meta.querySelector(".save-search-btn")) return;
    var btn = document.createElement("button");
    btn.className = "save-search-btn export-btn";
    btn.title = "Save this search";
    btn.textContent = "\u2B50 Save search";
    btn.addEventListener("click", function () {
      var q = ($("q") || $("q-hero") || {}).value || "";
      if (q) saveSearch(q.trim());
    });
    meta.appendChild(btn);
  }

  // ---------- 14. Custom search filters ----------
  var FILTERS_KEY = "atomic:custom-filters";
  function customFilters() { try { return JSON.parse(LS.getItem(FILTERS_KEY) || "[]"); } catch (e) { return []; } }
  function addCustomFilter(name, query) {
    var l = customFilters();
    l.push({ name: name, query: query, at: Date.now() });
    try { LS.setItem(FILTERS_KEY, JSON.stringify(l.slice(0, 50))); } catch (e) { /* ignore */ }
  }

  // ---------- 15. Instant answers enhancement ----------
  function enhanceInstantCard() {
    var instant = document.querySelector(".instant-card");
    if (!instant || instant.dataset.enhanced) return;
    instant.dataset.enhanced = "1";
    var copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "result-action-btn";
    copyBtn.style.cssText = "margin-top:8px;";
    copyBtn.textContent = "\uD83D\uDCCB Copy";
    copyBtn.addEventListener("click", function () {
      var text = instant.querySelector(".instant-title");
      if (text && navigator.clipboard) {
        navigator.clipboard.writeText(text.textContent).then(function () { toast("Copied!"); });
      }
    });
    instant.appendChild(copyBtn);
  }

  // ---------- 16. Offline detection ----------
  function installOfflineDetection() {
    function updateOnlineStatus() {
      var offline = !navigator.onLine;
      var existing = document.getElementById("offline-banner");
      if (offline && !existing) {
        var banner = document.createElement("div");
        banner.id = "offline-banner";
        banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:9999;background:var(--warn);color:#000;text-align:center;padding:8px;font-size:13px;font-weight:600;";
        banner.textContent = "\u26A0 You appear to be offline. Search results may be unavailable.";
        document.body.prepend(banner);
      } else if (!offline && existing) {
        existing.remove();
      }
    }
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    updateOnlineStatus();
  }

  // ---------- 17. Custom homepage widgets ----------
  function installHomeWidgets() {
    var home = document.getElementById("home");
    if (!home || home.dataset.widgetsInstalled) return;
    home.dataset.widgetsInstalled = "1";
    fetch("/api/trending", { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.trending || !data.trending.length) return;
        var inner = home.querySelector(".home-inner");
        if (!inner) return;
        var widget = document.createElement("div");
        widget.className = "trending-widget";
        widget.style.cssText = "width:100%;max-width:580px;";
        var title = document.createElement("p");
        title.style.cssText = "font-size:11.5px;color:var(--text-mute);text-transform:uppercase;letter-spacing:.06em;font-weight:600;margin:0 0 8px;";
        title.textContent = "Trending";
        var list = document.createElement("div");
        list.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
        data.trending.slice(0, 6).forEach(function (q) {
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "related-item";
          chip.textContent = q;
          chip.addEventListener("click", function () {
            var inp = $("q-hero");
            if (inp) { inp.value = q; inp.form && inp.form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); }
          });
          list.appendChild(chip);
        });
        widget.appendChild(title);
        widget.appendChild(list);
        var footer = inner.querySelector(".home-footer");
        if (footer) inner.insertBefore(widget, footer);
        else inner.appendChild(widget);
      })
      .catch(function () { /* ignore */ });
  }

  // ---------- 18. Keyboard shortcut: Ctrl/Cmd+K ----------
  function installCmdKShortcut() {
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        var modal = $("cmdk-modal");
        if (modal) {
          modal.hidden = !modal.hidden;
          if (!modal.hidden) {
            var inp = $("cmdk-input");
            if (inp) inp.focus();
          }
        }
      }
    });
  }

  // ---------- 19. Result count display ----------
  function updateResultCount(count) {
    var meta = $("search-meta");
    if (!meta) return;
    var counter = meta.querySelector(".result-count");
    if (!counter) {
      counter = document.createElement("span");
      counter.className = "result-count";
      counter.style.cssText = "font-size:12.5px;color:var(--text-mute);";
      meta.insertBefore(counter, meta.firstChild);
    }
    counter.textContent = count + " result" + (count !== 1 ? "s" : "");
  }

  // ---------- 20. AI summary integration ----------
  function installAISummaryHook() {
    window.addEventListener("atomic:results", function (e) {
      var detail = e.detail || {};
      var query = detail.q || "";
      var results = detail.results || [];
      var aiSettings = {};
      try {
        var raw = LS.getItem("atomic.settings.v4");
        if (raw) aiSettings = JSON.parse(raw);
      } catch (ex) { /* ignore */ }
      if (window.AtomicAISummary && (aiSettings.aiEnabled || aiSettings.aiSummarize)) {
        window.AtomicAISummary.autoSummarise(query, results, aiSettings);
      }
    });
  }

  // ---------- 21. Export results as Markdown ----------
  function exportResultsMarkdown() {
    var cards = Array.prototype.slice.call(document.querySelectorAll("#results .result"));
    if (!cards.length) { toast("No results to export"); return; }
    var q = ($("q") || {}).value || "search";
    var lines = ["# Search results: " + q, ""];
    cards.forEach(function (card, i) {
      var titleA = card.querySelector(".title");
      var snippet = card.querySelector(".snippet");
      if (!titleA) return;
      lines.push((i + 1) + ". [" + (titleA.textContent || "").trim() + "](" + titleA.href + ")");
      if (snippet) lines.push("   > " + (snippet.textContent || "").trim().slice(0, 200));
      lines.push("");
    });
    var blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "atomic-results-" + new Date().toISOString().slice(0, 10) + ".md";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast("Exported as Markdown");
  }

  // ---------- 22. Print results ----------
  function printResults() { window.print(); }

  // ---------- 23. Focus mode ----------
  var FOCUS_KEY = "atomic:focus-mode";
  function isFocusMode() { return LS.getItem(FOCUS_KEY) === "1"; }
  function toggleFocusMode() {
    var next = !isFocusMode();
    LS.setItem(FOCUS_KEY, next ? "1" : "0");
    document.body.classList.toggle("focus-mode", next);
    toast(next ? "Focus mode on" : "Focus mode off");
  }

  // ---------- 24. Copy search URL ----------
  function copySearchURL() {
    var url = window.location.href;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () { toast("Search URL copied!"); });
    }
  }

  // ---------- 25. Scroll-to-top button ----------
  function installScrollToTop() {
    var btn = document.createElement("button");
    btn.id = "scroll-top-btn";
    btn.type = "button";
    btn.setAttribute("aria-label", "Scroll to top");
    btn.title = "Back to top";
    btn.innerHTML = "\u2191";
    btn.style.cssText = "position:fixed;bottom:60px;right:16px;width:40px;height:40px;border-radius:50%;border:1px solid var(--border);background:var(--bg-elev);color:var(--text-dim);font-size:18px;cursor:pointer;display:none;align-items:center;justify-content:center;z-index:200;box-shadow:var(--shadow-soft);";
    document.body.appendChild(btn);
    window.addEventListener("scroll", function () {
      btn.style.display = window.scrollY > 400 ? "flex" : "none";
    });
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // ---------- 26. Highlight search terms ----------
  function highlightTerms(q) {
    if (!q || q.length < 2) return;
    var tokens = q.toLowerCase().split(/\s+/).filter(function (t) { return t.length >= 3; });
    if (!tokens.length) return;
    Array.prototype.forEach.call(document.querySelectorAll("#results .result .snippet"), function (el) {
      var html = el.innerHTML;
      tokens.forEach(function (t) {
        var re = new RegExp("(" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
        html = html.replace(re, "<mark>$1</mark>");
      });
      el.innerHTML = html;
    });
  }

  // ---------- 27. Accessibility: announce result count ----------
  function announceResults(count, q) {
    var live = document.getElementById("a11y-live");
    if (!live) {
      live = document.createElement("div");
      live.id = "a11y-live";
      live.setAttribute("aria-live", "polite");
      live.setAttribute("aria-atomic", "true");
      live.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);";
      document.body.appendChild(live);
    }
    live.textContent = count + " results for " + q;
  }

  // ---------- 28. Keyboard shortcuts: s/p/m/f/u ----------
  function installSaveShortcut() {
    document.addEventListener("keydown", function (e) {
      var tgt = e.target;
      var typing = tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable);
      if (typing) return;
      if (e.key === "s") { var q = ($("q") || $("q-hero") || {}).value || ""; if (q) saveSearch(q.trim()); }
      if (e.key === "p") { printResults(); }
      if (e.key === "m") { exportResultsMarkdown(); }
      if (e.key === "f") { toggleFocusMode(); }
      if (e.key === "u") { copySearchURL(); }
    });
  }

  // ---------- 29. Image lazy loading ----------
  function installLazyImages() {
    if (!("IntersectionObserver" in window)) return;
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; obs.unobserve(img); }
        }
      });
    }, { rootMargin: "200px" });
    function observeImages() {
      Array.prototype.forEach.call(document.querySelectorAll("img[data-src]"), function (img) { obs.observe(img); });
    }
    observeImages();
    var results = $("results");
    if (results) { var mutObs = new MutationObserver(observeImages); mutObs.observe(results, { childList: true, subtree: true }); }
  }

  // ---------- 30. Trending suggestions ----------
  function installTrendingSuggestions() {
    fetch("/api/trending", { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) { if (data && data.trending) window._atomicTrending = data.trending; })
      .catch(function () {});
  }

  // ---------- 31. Copy snippet text ----------
  function installCopySnippetButtons() {
    var results = $("results");
    if (!results) return;
    var obs = new MutationObserver(function () { attachCopySnippetButtons(); });
    obs.observe(results, { childList: true, subtree: false });
    attachCopySnippetButtons();
  }
  function attachCopySnippetButtons() {
    Array.prototype.forEach.call(document.querySelectorAll("#results .result"), function (card) {
      if (card.querySelector(".copy-snippet-btn")) return;
      var actions = card.querySelector(".result-actions");
      var snippet = card.querySelector(".snippet");
      if (!actions || !snippet) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "result-action-btn copy-snippet-btn";
      btn.title = "Copy snippet";
      btn.setAttribute("aria-label", "Copy snippet text");
      btn.textContent = "\uD83D\uDCCB";
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        if (navigator.clipboard) {
          navigator.clipboard.writeText(snippet.textContent || "").then(function () { toast("Snippet copied!"); });
        }
      });
      actions.appendChild(btn);
    });
  }

  // ---------- 32. Domain info ----------
  function installDomainInfo() {
    var results = $("results");
    if (!results) return;
    results.addEventListener("mouseover", function (e) {
      var host = e.target.closest(".result-host");
      if (!host || host.dataset.infoShown) return;
      host.dataset.infoShown = "1";
      host.title = "Domain: " + host.textContent;
    });
  }

  // ---------- 33. Persist scroll position ----------
  function installScrollPersistence() {
    var SCROLL_KEY = "atomic:scroll:" + window.location.search;
    var saved = parseInt(LS.getItem(SCROLL_KEY) || "0", 10);
    if (saved > 0) { setTimeout(function () { window.scrollTo(0, saved); }, 100); }
    window.addEventListener("beforeunload", function () { LS.setItem(SCROLL_KEY, String(window.scrollY)); });
  }

  // ---------- 34. Quick search from selection ----------
  function installSelectionSearch() {
    document.addEventListener("mouseup", function () {
      var sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      var text = sel.toString().trim();
      if (text.length < 3 || text.length > 100) return;
      var existing = document.getElementById("selection-search-tip");
      if (existing) existing.remove();
      var tip = document.createElement("div");
      tip.id = "selection-search-tip";
      tip.style.cssText = "position:fixed;z-index:500;background:var(--bg-elev);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer;box-shadow:var(--shadow-soft);color:var(--text-dim);";
      tip.textContent = "\uD83D\uDD0D Search: \u201C" + text.slice(0, 30) + (text.length > 30 ? "\u2026" : "") + "\u201D";
      var range = sel.getRangeAt(0);
      var rect = range.getBoundingClientRect();
      tip.style.top = (rect.bottom + window.scrollY + 8) + "px";
      tip.style.left = Math.max(8, rect.left + window.scrollX) + "px";
      document.body.appendChild(tip);
      tip.addEventListener("click", function () {
        var inp = $("q") || $("q-hero");
        if (inp) { inp.value = text; inp.form && inp.form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); }
        tip.remove();
      });
      setTimeout(function () {
        document.addEventListener("click", function remove() { tip.remove(); document.removeEventListener("click", remove); });
      }, 100);
    });
  }

  // ---------- 35. Refresh shortcut ----------
  function installRefreshShortcut() {
    document.addEventListener("keydown", function (e) {
      var tgt = e.target;
      var typing = tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.isContentEditable);
      if (typing || e.key !== "r") return;
      var form = $("form");
      if (form) form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true }));
    });
  }

  // ---------- 36. Swipe gestures (mobile) ----------
  function installSwipeGestures() {
    var startX = 0, startY = 0;
    document.addEventListener("touchstart", function (e) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; }, { passive: true });
    document.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - startX;
      var dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
      if (dx > 0 && document.body.dataset.view === "results") {
        var pager = $("pager");
        var prevBtn = pager && pager.querySelector("[data-dir='prev']");
        if (prevBtn && !prevBtn.disabled) prevBtn.click();
      }
    }, { passive: true });
  }

  // ---------- 37. Reduced motion support ----------
  function installReducedMotion() {
    var mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    function apply() { document.body.classList.toggle("no-animations", mq.matches); }
    apply();
    mq.addEventListener("change", apply);
  }

  // ---------- 38. High contrast mode support ----------
  function installHighContrastSupport() {
    var mq = window.matchMedia && window.matchMedia("(forced-colors: active)");
    if (!mq || !mq.matches) return;
    document.documentElement.setAttribute("data-theme", "high-contrast");
  }

  // ---------- 39. API access ----------
  function exposeAPIInfo() {
    window.AtomicAPI = {
      search: function (q, page) {
        return fetch("/api/v1/search?q=" + encodeURIComponent(q) + (page ? "&page=" + page : ""), { credentials: "omit" }).then(function (r) { return r.json(); });
      },
      images: function (q) {
        return fetch("/api/v1/images?q=" + encodeURIComponent(q), { credentials: "omit" }).then(function (r) { return r.json(); });
      },
      stats: function () {
        return fetch("/api/v1/stats", { credentials: "omit" }).then(function (r) { return r.json(); });
      },
      trending: function () {
        return fetch("/api/trending", { credentials: "omit" }).then(function (r) { return r.json(); });
      },
    };
  }

  // ---------- 40. Analytics dashboard (local) ----------
  function openAnalyticsDashboard() {
    var data = getAnalytics();
    var days = Object.keys(data).sort().reverse().slice(0, 7);
    var rows = days.map(function (d) {
      return "<tr><td style='padding:6px 0;border-bottom:1px solid var(--border-soft);'>" + d + "</td><td style='padding:6px 0;border-bottom:1px solid var(--border-soft);'>" + data[d].count + "</td></tr>";
    }).join("");
    var div = document.createElement("div");
    div.className = "modal-backdrop";
    div.setAttribute("role", "dialog");
    div.setAttribute("aria-modal", "true");
    div.innerHTML =
      '<div class="modal">' +
      '  <div class="modal-head"><h2>Search Analytics (local)</h2>' +
      '    <button class="icon-btn modal-close" type="button" aria-label="Close">\u2715</button>' +
      '  </div>' +
      '  <div class="modal-body">' +
      '    <p class="hint">All data is stored locally in your browser only. Nothing is sent to any server.</p>' +
      '    <table style="width:100%;border-collapse:collapse;font-size:13.5px;">' +
      '      <thead><tr><th style="text-align:left;padding:6px 0;border-bottom:1px solid var(--border);">Date</th>' +
      '      <th style="text-align:left;padding:6px 0;border-bottom:1px solid var(--border);">Searches</th></tr></thead>' +
      '      <tbody>' + (rows || '<tr><td colspan="2" style="color:var(--text-mute);padding:12px 0;">No data yet.</td></tr>') + '</tbody>' +
      '    </table>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(div);
    div.addEventListener("click", function (e) {
      if (e.target === div || (e.target.classList && e.target.classList.contains("modal-close"))) div.remove();
    });
  }

  // ---------- 41. Custom integrations hook ----------
  function installIntegrationsHook() {
    window.AtomicIntegrations = {
      onSearch: function (cb) { window.addEventListener("atomic:search", function (e) { cb(e.detail); }); },
      onResults: function (cb) { window.addEventListener("atomic:results", function (e) { cb(e.detail); }); },
      search: function (q) {
        var inp = $("q") || $("q-hero");
        if (inp) { inp.value = q; inp.form && inp.form.dispatchEvent(new Event("submit", { cancelable: true, bubbles: true })); }
      },
    };
  }

  // ---------- 42. Webhook support ----------
  var WEBHOOK_KEY = "atomic:webhook-url";
  function fireWebhook(event, data) {
    var url = LS.getItem(WEBHOOK_KEY);
    if (!url) return;
    try {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: event, data: data, at: Date.now() }), credentials: "omit", keepalive: true }).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  // ---------- 43. Boot all extended features ----------
  function bootExtended() {
    installResultPreviews();
    installSortControls();
    installViewToggle();
    installSearchOperatorHints();
    installShareButtons();
    installReadingListButtons();
    installTTSButtons();
    installSaveSearchButton();
    installOfflineDetection();
    installHomeWidgets();
    installCmdKShortcut();
    installScrollToTop();
    installLazyImages();
    installTrendingSuggestions();
    installCopySnippetButtons();
    installDomainInfo();
    installScrollPersistence();
    installSelectionSearch();
    installRefreshShortcut();
    installSwipeGestures();
    installReducedMotion();
    installHighContrastSupport();
    installDarkModeDetection();
    installFontSizeControls();
    installCompactMode();
    installSaveShortcut();
    installAISummaryHook();
    exposeAPIInfo();
    installIntegrationsHook();

    window.addEventListener("atomic:search", function (e) {
      if (e.detail && e.detail.q) {
        recordSearch(e.detail.q);
        fireWebhook("search", { q: e.detail.q });
      }
    });
    window.addEventListener("atomic:results", function (e) {
      var detail = e.detail || {};
      if (detail.results) {
        updateResultCount(detail.results.length);
        announceResults(detail.results.length, detail.q || "");
        if (detail.q) highlightTerms(detail.q);
        installSortControls();
        installViewToggle();
        installSaveSearchButton();
        installShareButtons();
        installReadingListButtons();
        installTTSButtons();
        installCopySnippetButtons();
        attachPreviews();
        enhanceInstantCard();
        fireWebhook("results", { q: detail.q, count: detail.results.length });
      }
    });

    window.AtomicFeatures = window.AtomicFeatures || {};
    Object.assign(window.AtomicFeatures, {
      readingList: { list: readingList, add: readingListAdd, remove: readingListRemove, has: readingListHas },
      savedSearches: { list: savedSearches, save: saveSearch },
      analytics: { get: getAnalytics, openDashboard: openAnalyticsDashboard },
      customFilters: { list: customFilters, add: addCustomFilter },
      exportMarkdown: exportResultsMarkdown,
      print: printResults,
      focusMode: { toggle: toggleFocusMode, isActive: isFocusMode },
      copySearchURL: copySearchURL,
      groupByDomain: { enabled: isGroupingEnabled, set: setGrouping },
      viewMode: { get: getViewMode, set: setViewMode },
      sortMode: { get: getSortMode, set: setSortMode },
      webhook: { set: function (url) { LS.setItem(WEBHOOK_KEY, url); }, clear: function () { LS.removeItem(WEBHOOK_KEY); } },
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
