/* Atomic Search — AI Summary Feature
 *
 * Fetches AI-powered summaries for search results using the server-side
 * OpenRouter integration. All requests go through /api/ai/synthesise so
 * the API key never touches the browser. Summaries are cached in
 * sessionStorage to avoid redundant round-trips within a session.
 *
 * Public API (attached to window.AtomicAISummary):
 *   .summarise(query, results)  → Promise<string|null>
 *   .renderCard(text, sources)  → HTMLElement
 *   .injectAboveResults(el)     → void
 *   .clearCache()               → void
 */

(function () {
  "use strict";

  var CACHE_KEY_PREFIX = "atomic:ai-summary:";
  var CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  /* ── Session cache ─────────────────────────────────────────── */
  function cacheGet(key) {
    try {
      var raw = sessionStorage.getItem(CACHE_KEY_PREFIX + key);
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (Date.now() - entry.at > CACHE_TTL_MS) {
        sessionStorage.removeItem(CACHE_KEY_PREFIX + key);
        return null;
      }
      return entry.text;
    } catch (e) {
      return null;
    }
  }

  function cacheSet(key, text) {
    try {
      sessionStorage.setItem(
        CACHE_KEY_PREFIX + key,
        JSON.stringify({ text: text, at: Date.now() })
      );
    } catch (e) {
      /* ignore quota errors */
    }
  }

  /* ── Fetch summary from server ─────────────────────────────── */
  function fetchSummary(query, results) {
    var cached = cacheGet(query);
    if (cached) return Promise.resolve(cached);

    var snippets = (results || []).slice(0, 6).map(function (r) {
      return { title: r.title || "", snippet: r.snippet || r.text || "" };
    });

    return fetch("/api/ai/synthesise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ query: query, results: snippets }),
    })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.text) return null;
        cacheSet(query, data.text);
        return data.text;
      })
      .catch(function () {
        return null;
      });
  }

  /* ── Build the summary card DOM element ────────────────────── */
  function buildCard(text, sources) {
    var card = document.createElement("div");
    card.className = "ai-summary-card";
    card.setAttribute("role", "region");
    card.setAttribute("aria-label", "AI summary");

    var header = document.createElement("div");
    header.className = "ai-summary-header";

    var icon = document.createElement("div");
    icon.className = "ai-summary-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✦";

    var label = document.createElement("span");
    label.className = "ai-summary-label";
    label.textContent = "AI Summary";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "icon-btn";
    closeBtn.setAttribute("aria-label", "Dismiss AI summary");
    closeBtn.style.cssText = "margin-left:auto;width:28px;height:28px;";
    closeBtn.innerHTML =
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    closeBtn.addEventListener("click", function () {
      card.style.opacity = "0";
      card.style.transform = "translateY(-8px)";
      card.style.transition = "opacity 0.2s, transform 0.2s";
      setTimeout(function () { card.remove(); }, 220);
    });

    header.appendChild(icon);
    header.appendChild(label);
    header.appendChild(closeBtn);

    var body = document.createElement("p");
    body.className = "ai-summary-text";
    body.textContent = text;

    card.appendChild(header);
    card.appendChild(body);

    if (sources && sources.length) {
      var sourcesRow = document.createElement("div");
      sourcesRow.className = "ai-summary-sources";
      sources.slice(0, 4).forEach(function (s) {
        var a = document.createElement("a");
        a.className = "ai-summary-source";
        a.href = s.url || "#";
        a.target = "_blank";
        a.rel = "noreferrer noopener";
        a.textContent = s.host || s.title || s.url || "Source";
        sourcesRow.appendChild(a);
      });
      card.appendChild(sourcesRow);
    }

    return card;
  }

  /* ── Loading skeleton ──────────────────────────────────────── */
  function buildSkeleton() {
    var card = document.createElement("div");
    card.className = "ai-summary-card";
    card.id = "ai-summary-loading";

    var header = document.createElement("div");
    header.className = "ai-summary-header";
    var icon = document.createElement("div");
    icon.className = "ai-summary-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "✦";
    var label = document.createElement("span");
    label.className = "ai-summary-label";
    label.textContent = "AI Summary";
    header.appendChild(icon);
    header.appendChild(label);

    var skeleton = document.createElement("div");
    skeleton.className = "ai-summary-skeleton";
    skeleton.setAttribute("aria-label", "Loading AI summary…");
    [100, 85, 70].forEach(function (w) {
      var line = document.createElement("div");
      line.className = "skeleton-line";
      line.style.width = w + "%";
      skeleton.appendChild(line);
    });

    card.appendChild(header);
    card.appendChild(skeleton);
    return card;
  }

  /* ── Inject card above results ─────────────────────────────── */
  function injectAboveResults(cardEl) {
    var resultsEl = document.getElementById("results");
    if (!resultsEl) return;
    var existing = document.getElementById("ai-summary-card");
    if (existing) existing.remove();
    cardEl.id = "ai-summary-card";
    resultsEl.parentNode.insertBefore(cardEl, resultsEl);
  }

  /* ── Main public API ───────────────────────────────────────── */
  function summarise(query, results) {
    if (!query || !results || !results.length) return Promise.resolve(null);

    // Show skeleton immediately
    var skeleton = buildSkeleton();
    injectAboveResults(skeleton);

    return fetchSummary(query, results).then(function (text) {
      var loading = document.getElementById("ai-summary-loading");
      if (loading) loading.remove();

      if (!text) return null;

      var sources = (results || []).slice(0, 4).map(function (r) {
        return { url: r.url, host: r.host, title: r.title };
      });
      var card = buildCard(text, sources);
      injectAboveResults(card);
      return text;
    });
  }

  /* ── Check if AI is available ──────────────────────────────── */
  function checkAvailability() {
    return fetch("/api/ai/health", { credentials: "omit" })
      .then(function (r) { return r.ok ? r.json() : { available: false }; })
      .then(function (d) { return !!d.available; })
      .catch(function () { return false; });
  }

  /* ── Auto-run on search results ────────────────────────────── */
  function autoSummarise(query, results, settings) {
    // Only run if AI summarisation is enabled in settings
    var aiEnabled = settings && (settings.aiEnabled || settings.aiSummarize);
    if (!aiEnabled) return;
    if (!query || !results || results.length < 2) return;

    // Don't summarise very short queries
    if (query.trim().length < 4) return;

    summarise(query, results).catch(function () {
      var loading = document.getElementById("ai-summary-loading");
      if (loading) loading.remove();
    });
  }

  /* ── Clear cache ───────────────────────────────────────────── */
  function clearCache() {
    try {
      var keys = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(CACHE_KEY_PREFIX) === 0) keys.push(k);
      }
      keys.forEach(function (k) { sessionStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  /* ── Expose public API ─────────────────────────────────────── */
  window.AtomicAISummary = {
    summarise: summarise,
    autoSummarise: autoSummarise,
    renderCard: buildCard,
    injectAboveResults: injectAboveResults,
    checkAvailability: checkAvailability,
    clearCache: clearCache,
  };
})();
