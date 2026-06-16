/* ============================================================
   Atomic Search — UI v2
   Enhanced UI logic: animated search bar, real-time suggestions,
   result cards with summaries, image previews, quick actions,
   settings sidebar, dark/light mode toggle, accessibility.
   ============================================================ */
(function () {
  "use strict";

  /* ── Utilities ─────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  /* ── Search suggestions ────────────────────────────────── */
  var suggestionCache = new Map();
  var suggestionTimer = null;
  var activeSuggestionIdx = -1;

  function buildSuggestions(query) {
    if (!query || query.length < 2) return [];
    var history = getSearchHistory().slice(0, 5);
    var trending = [
      "open source software", "privacy tools", "web development",
      "machine learning", "linux terminal", "rust programming",
      "typescript tutorial", "self hosting", "docker compose",
    ];
    var suggestions = [];

    // History matches
    for (var h of history) {
      if (h.toLowerCase().startsWith(query.toLowerCase()) && h !== query) {
        suggestions.push({ text: h, type: "history", icon: "🕐" });
      }
    }

    // Trending matches
    for (var t of trending) {
      if (t.toLowerCase().includes(query.toLowerCase()) && suggestions.length < 8) {
        suggestions.push({ text: t, type: "trending", icon: "🔥" });
      }
    }

    // Query completions
    var completions = [
      query + " tutorial", query + " documentation", query + " examples",
      query + " vs", query + " github", query + " explained",
    ];
    for (var c of completions) {
      if (suggestions.length >= 8) break;
      suggestions.push({ text: c, type: "suggestion", icon: "🔍" });
    }

    return suggestions.slice(0, 8);
  }

  function showSuggestions(input, container) {
    var query = input.value.trim();
    if (!query) { hideSuggestions(container); return; }

    var suggestions = buildSuggestions(query);
    if (!suggestions.length) { hideSuggestions(container); return; }

    var html = suggestions.map(function (s, i) {
      return '<div class="suggestion-item" data-idx="' + i + '" data-text="' + esc(s.text) + '" role="option" tabindex="-1">' +
        '<span class="suggestion-icon">' + s.icon + '</span>' +
        '<span class="suggestion-text">' + esc(s.text) + '</span>' +
        '<span class="suggestion-type">' + s.type + '</span>' +
        '</div>';
    }).join("");

    container.innerHTML = html;
    container.hidden = false;
    activeSuggestionIdx = -1;

    qsa(".suggestion-item", container).forEach(function (item) {
      item.addEventListener("mousedown", function (e) {
        e.preventDefault();
        input.value = item.dataset.text;
        hideSuggestions(container);
        input.form && input.form.dispatchEvent(new Event("submit", { bubbles: true }));
      });
    });
  }

  function hideSuggestions(container) {
    if (container) { container.hidden = true; container.innerHTML = ""; }
    activeSuggestionIdx = -1;
  }

  function navigateSuggestions(container, direction) {
    var items = qsa(".suggestion-item", container);
    if (!items.length) return null;
    activeSuggestionIdx = (activeSuggestionIdx + direction + items.length) % items.length;
    items.forEach(function (item, i) {
      item.classList.toggle("active", i === activeSuggestionIdx);
    });
    return items[activeSuggestionIdx] ? items[activeSuggestionIdx].dataset.text : null;
  }

  function initSearchSuggestions(inputId, formId) {
    var input = $(inputId);
    if (!input) return;

    var container = document.createElement("div");
    container.className = "search-suggestions";
    container.setAttribute("role", "listbox");
    container.hidden = true;
    input.parentElement.style.position = "relative";
    input.parentElement.appendChild(container);

    input.addEventListener("input", function () {
      clearTimeout(suggestionTimer);
      suggestionTimer = setTimeout(function () {
        showSuggestions(input, container);
      }, 150);
    });

    input.addEventListener("keydown", function (e) {
      if (!container.hidden) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          var text = navigateSuggestions(container, 1);
          if (text) input.value = text;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          var text = navigateSuggestions(container, -1);
          if (text) input.value = text;
        } else if (e.key === "Escape") {
          hideSuggestions(container);
        }
      }
    });

    input.addEventListener("blur", function () {
      setTimeout(function () { hideSuggestions(container); }, 200);
    });

    input.addEventListener("focus", function () {
      if (input.value.trim()) showSuggestions(input, container);
    });
  }

  /* ── Search history ────────────────────────────────────── */
  var HISTORY_KEY = "atomic:search-history";
  var MAX_HISTORY = 50;

  function getSearchHistory() {
    try {
      var raw = localStorage.getItem(HISTORY_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      var cutoff = Date.now() - 30 * 24 * 3600 * 1000;
      return data.filter(function (item) {
        return typeof item === "string" ? true : item.ts > cutoff;
      }).map(function (item) {
        return typeof item === "string" ? item : item.q;
      });
    } catch (e) { return []; }
  }

  function addToHistory(query) {
    if (!query || query.length < 2) return;
    try {
      var history = getSearchHistory().filter(function (q) { return q !== query; });
      history.unshift(query);
      history = history.slice(0, MAX_HISTORY);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.map(function (q) {
        return { q: q, ts: Date.now() };
      })));
    } catch (e) { /* ignore */ }
  }

  /* ── Result card rendering ─────────────────────────────── */
  function renderResultCard(result, opts) {
    opts = opts || {};
    var url = result.url || "";
    var title = result.title || url;
    var snippet = result.snippet || result.text || "";
    var host = result.host || "";
    var isOwn = result.ownIndex || false;
    var engines = result.engines || [];
    var indexedAt = result.indexed_at || 0;

    // Freshness
    var freshnessHtml = "";
    if (indexedAt) {
      var ageDays = (Date.now() - indexedAt) / (24 * 3600 * 1000);
      var freshnessLabel = ageDays < 1 ? "today" : ageDays < 7 ? "this week" : ageDays < 30 ? "this month" : "";
      var freshnessColor = ageDays < 7 ? "fresh" : ageDays < 30 ? "" : "stale";
      if (freshnessLabel) {
        freshnessHtml = '<span class="result-badge ' + freshnessColor + '">📅 ' + esc(freshnessLabel) + '</span>';
      }
    }

    // Own index badge
    var ownBadge = isOwn ? '<span class="result-badge own">⚛ Atomic index</span>' : "";

    // Reading time estimate
    var wordCount = snippet.split(/\s+/).filter(Boolean).length;
    var readingMin = Math.max(1, Math.ceil(wordCount / 200));
    var readingBadge = wordCount > 50 ? '<span class="result-badge reading">📖 ' + readingMin + ' min</span>' : "";

    // Favicon
    var faviconUrl = host ? "https://www.google.com/s2/favicons?sz=32&domain=" + encodeURIComponent(host) : "";
    var faviconHtml = faviconUrl
      ? '<img class="result-favicon" src="' + esc(faviconUrl) + '" alt="" loading="lazy" onerror="this.style.display=\'none\'">'
      : "";

    // Path display
    var pathDisplay = "";
    try {
      var u = new URL(url);
      var path = (u.pathname || "/").replace(/\/+$/, "");
      pathDisplay = u.hostname.replace(/^www\./, "") + (path && path !== "/" ? " › " + path.split("/").filter(Boolean).slice(0, 3).join(" › ") : "");
    } catch (e) { pathDisplay = url; }

    // Quick actions
    var proxyUrl = "/go?url=" + encodeURIComponent(url);
    var actionsHtml =
      '<div class="result-actions">' +
      '<button class="result-action-btn" data-action="summarize" data-url="' + esc(url) + '" title="AI Summary">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 8v4l3 3"/></svg>' +
      'Summarize</button>' +
      '<button class="result-action-btn" data-action="save" data-url="' + esc(url) + '" data-title="' + esc(title) + '" title="Save result">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>' +
      'Save</button>' +
      '<a class="result-action-btn" href="' + esc(proxyUrl) + '" title="View via Atomic proxy">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
      'Safe view</a>' +
      '<button class="result-action-btn" data-action="share" data-url="' + esc(url) + '" title="Share">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>' +
      'Share</button>' +
      '</div>';

    var html =
      '<article class="result-card" data-url="' + esc(url) + '">' +
      '<div class="result-card-body">' +
      '<div class="result-url-row">' + faviconHtml +
      '<span class="result-host">' + esc(pathDisplay) + '</span>' +
      '</div>' +
      '<a class="result-title" href="' + esc(proxyUrl) + '" rel="noopener">' + esc(title) + '</a>' +
      '<p class="result-snippet">' + esc(snippet.slice(0, 280)) + '</p>' +
      '<div class="result-badges">' + ownBadge + freshnessHtml + readingBadge + '</div>' +
      actionsHtml +
      '</div>' +
      '</article>';

    return html;
  }

  /* ── Skeleton loading ──────────────────────────────────── */
  function renderSkeletons(count) {
    var html = "";
    for (var i = 0; i < count; i++) {
      html +=
        '<div class="skeleton-card">' +
        '<div class="skeleton skeleton-line url"></div>' +
        '<div class="skeleton skeleton-line title"></div>' +
        '<div class="skeleton skeleton-line text"></div>' +
        '<div class="skeleton skeleton-line text short"></div>' +
        '</div>';
    }
    return html;
  }

  /* ── AI Summary modal ──────────────────────────────────── */
  function showAiSummaryModal(url, title) {
    var modal = $("ai-summary-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "ai-summary-modal";
      modal.className = "modal-backdrop";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.innerHTML =
        '<div class="modal modal-lg">' +
        '<div class="modal-head">' +
        '<h2 id="ai-summary-title">AI Summary</h2>' +
        '<button class="icon-btn modal-close" aria-label="Close">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
        '</button></div>' +
        '<div class="modal-body" id="ai-summary-body"></div>' +
        '</div>';
      document.body.appendChild(modal);
      modal.querySelector(".modal-close").addEventListener("click", function () {
        modal.hidden = true;
      });
    }

    var titleEl = $("ai-summary-title");
    var body = $("ai-summary-body");
    if (titleEl) titleEl.textContent = "AI Summary — " + (title || url);
    if (body) {
      body.innerHTML =
        '<div class="ai-synthesis-panel">' +
        '<div class="ai-synthesis-header">' +
        '<div class="ai-synthesis-icon">✦</div>' +
        '<span class="ai-synthesis-title">Generating summary…</span>' +
        '</div>' +
        '<div class="ai-synthesis-text ai-streaming" id="ai-summary-text">Reading page content…</div>' +
        '</div>' +
        '<div id="ai-summary-meta" style="margin-top:16px;font-size:13px;color:var(--text-mute)"></div>';
    }
    modal.hidden = false;

    // Fetch summary from API
    fetch("/api/summarize?url=" + encodeURIComponent(url))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var textEl = $("ai-summary-text");
        var metaEl = $("ai-summary-meta");
        if (textEl) {
          textEl.classList.remove("ai-streaming");
          textEl.textContent = data.summary || "Could not generate summary.";
        }
        if (metaEl && data) {
          var meta = [];
          if (data.readingTimeMin) meta.push("📖 " + data.readingTimeMin + " min read");
          if (data.wordCount) meta.push("📝 " + data.wordCount + " words");
          if (data.lang) meta.push("🌐 " + data.lang.toUpperCase());
          if (data.author) meta.push("✍ " + data.author);
          metaEl.textContent = meta.join(" · ");

          if (data.keyPoints && data.keyPoints.length) {
            var kpHtml = '<div style="margin-top:16px"><strong style="font-size:13px;color:var(--text-mute)">KEY POINTS</strong><ul style="margin:8px 0 0;padding-left:20px;font-size:14px;line-height:1.7;color:var(--text-dim)">';
            data.keyPoints.forEach(function (kp) {
              kpHtml += "<li>" + esc(kp) + "</li>";
            });
            kpHtml += "</ul></div>";
            metaEl.insertAdjacentHTML("beforeend", kpHtml);
          }
        }
      })
      .catch(function () {
        var textEl = $("ai-summary-text");
        if (textEl) {
          textEl.classList.remove("ai-streaming");
          textEl.textContent = "Could not generate summary. Make sure OPENROUTER_API_KEY is configured.";
        }
      });
  }

  /* ── Save result ───────────────────────────────────────── */
  var SAVED_KEY = "atomic:saved-results";

  function getSavedResults() {
    try { return JSON.parse(localStorage.getItem(SAVED_KEY) || "[]"); } catch (e) { return []; }
  }

  function saveResult(url, title) {
    try {
      var saved = getSavedResults().filter(function (r) { return r.url !== url; });
      saved.unshift({ url: url, title: title, savedAt: Date.now() });
      saved = saved.slice(0, 500);
      localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
      showToast("Result saved! ✓");
    } catch (e) { /* ignore */ }
  }

  /* ── Toast notifications ───────────────────────────────── */
  function showToast(message, duration) {
    duration = duration || 2500;
    var toast = document.createElement("div");
    toast.style.cssText =
      "position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);" +
      "background:var(--bg-elev);border:1px solid var(--border);border-radius:99px;" +
      "padding:10px 20px;font-size:14px;color:var(--text);z-index:9999;" +
      "box-shadow:var(--shadow);opacity:0;transition:all 0.2s ease;white-space:nowrap;";
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(function () {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(0)";
    });
    setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(20px)";
      setTimeout(function () { toast.remove(); }, 300);
    }, duration);
  }

  /* ── Share ─────────────────────────────────────────────── */
  function shareUrl(url) {
    if (navigator.share) {
      navigator.share({ url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        showToast("URL copied to clipboard! ✓");
      }).catch(function () {
        showToast("Could not copy URL");
      });
    }
  }

  /* ── Quick action handler ──────────────────────────────── */
  function handleResultAction(btn) {
    var action = btn.dataset.action;
    var url = btn.dataset.url;
    var title = btn.dataset.title;

    if (action === "summarize") {
      showAiSummaryModal(url, title);
    } else if (action === "save") {
      saveResult(url, title || url);
    } else if (action === "share") {
      shareUrl(url);
    }
  }

  /* ── Dark/light mode toggle ────────────────────────────── */
  function initThemeToggle() {
    var btn = document.createElement("button");
    btn.className = "theme-toggle";
    btn.setAttribute("aria-label", "Toggle dark/light mode");
    btn.innerHTML = '<span class="theme-toggle-icon">🌙</span><span>Dark</span>';

    var isDark = !document.body.dataset.theme || document.body.dataset.theme.includes("dark") ||
      ["atom-dark", "midnight", "cyberpunk", "synthwave", "matrix", "hacker", "carbon", "obsidian", "amoled",
       "aurora", "blood-moon", "forest", "deep-sea", "terminal-amber", "tokyo-night", "catppuccin-mocha",
       "rose-pine", "neon", "dracula", "nord", "gruvbox", "sunset", "ocean", "monokai", "nightfall",
       "glassmorphism", "retro-80s", "cyberpunk-2077", "blade-runner", "tron", "neon-v2", "holographic",
       "gradient-v2", "steampunk", "art-deco", "maximalist"].includes(document.body.dataset.theme);

    function updateBtn() {
      btn.innerHTML = isDark
        ? '<span class="theme-toggle-icon">☀️</span><span>Light</span>'
        : '<span class="theme-toggle-icon">🌙</span><span>Dark</span>';
    }
    updateBtn();

    btn.addEventListener("click", function () {
      isDark = !isDark;
      var newTheme = isDark ? "atom-dark" : "atom-light";
      document.body.dataset.theme = newTheme;
      try { localStorage.setItem("atomic.theme", newTheme); } catch (e) {}
      updateBtn();
    });

    var topbarRight = qs(".topbar-right");
    if (topbarRight) topbarRight.prepend(btn);
  }

  /* ── Filters panel ─────────────────────────────────────── */
  function initFiltersPanel() {
    var toggleBtn = document.createElement("button");
    toggleBtn.className = "result-action-btn";
    toggleBtn.style.cssText = "margin-bottom:12px;";
    toggleBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>' +
      ' Filters';

    var panel = document.createElement("div");
    panel.className = "filters-panel";
    panel.innerHTML =
      '<div class="filters-grid">' +
      '<div class="filter-group"><label>Site</label><input type="text" id="filter-site" placeholder="e.g. github.com"></div>' +
      '<div class="filter-group"><label>Language</label><select id="filter-lang"><option value="">Any</option><option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="de">German</option><option value="pt">Portuguese</option><option value="it">Italian</option><option value="zh">Chinese</option><option value="ja">Japanese</option></select></div>' +
      '<div class="filter-group"><label>Date after</label><input type="date" id="filter-date-after"></div>' +
      '<div class="filter-group"><label>Date before</label><input type="date" id="filter-date-before"></div>' +
      '<div class="filter-group"><label>Min words</label><input type="number" id="filter-min-words" placeholder="e.g. 300" min="0"></div>' +
      '<div class="filter-group"><label>Exclude domains</label><input type="text" id="filter-exclude" placeholder="e.g. spam.com"></div>' +
      '</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px">' +
      '<button class="result-action-btn" id="apply-filters">Apply filters</button>' +
      '<button class="result-action-btn" id="clear-filters">Clear</button>' +
      '</div>';

    toggleBtn.addEventListener("click", function () {
      panel.classList.toggle("open");
      toggleBtn.style.background = panel.classList.contains("open") ? "var(--accent)" : "";
      toggleBtn.style.color = panel.classList.contains("open") ? "#fff" : "";
    });

    var resultsSection = $("results");
    if (resultsSection && resultsSection.parentElement) {
      resultsSection.parentElement.insertBefore(toggleBtn, resultsSection);
      resultsSection.parentElement.insertBefore(panel, resultsSection);
    }
  }

  /* ── Related searches rendering ────────────────────────── */
  function renderRelatedSearches(related, container) {
    if (!related || !related.length || !container) return;
    var html =
      '<div class="related-searches">' +
      '<div class="related-searches-title">Related searches</div>' +
      '<div class="related-searches-grid">' +
      related.map(function (q) {
        return '<a class="related-search-chip" href="/?q=' + encodeURIComponent(q) + '">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>' +
          esc(q) + '</a>';
      }).join("") +
      '</div></div>';
    container.insertAdjacentHTML("beforeend", html);
  }

  /* ── Skeleton → results transition ────────────────────── */
  function showLoadingState(container, count) {
    if (container) container.innerHTML = renderSkeletons(count || 5);
  }

  /* ── Event delegation for result actions ───────────────── */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-action]");
    if (btn) {
      e.preventDefault();
      handleResultAction(btn);
    }
  });

  /* ── Init ──────────────────────────────────────────────── */
  function init() {
    // Search suggestions on both search bars
    initSearchSuggestions("q-hero", "home-form");
    initSearchSuggestions("q", "form");

    // Theme toggle in topbar
    initThemeToggle();

    // Filters panel
    initFiltersPanel();

    // Track searches in history
    document.addEventListener("search-performed", function (e) {
      if (e.detail && e.detail.query) addToHistory(e.detail.query);
    });

    // Expose utilities globally for other scripts
    window.AtomicUI = {
      renderResultCard: renderResultCard,
      renderSkeletons: renderSkeletons,
      showLoadingState: showLoadingState,
      renderRelatedSearches: renderRelatedSearches,
      showAiSummaryModal: showAiSummaryModal,
      showToast: showToast,
      addToHistory: addToHistory,
      getSearchHistory: getSearchHistory,
      getSavedResults: getSavedResults,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
