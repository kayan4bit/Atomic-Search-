/**
 * Atomic Search v5 — Settings Page
 * All settings are stored in localStorage only. No server-side tracking.
 */
(function () {
  "use strict";

  var SETTINGS_KEY = "atomic.settings";
  var HISTORY_KEY = "atomic.history";

  var THEMES = [
    // Futuristic
    { value: "quantum", label: "Quantum", group: "Futuristic" },
    { value: "cyberpunk", label: "Cyberpunk", group: "Futuristic" },
    { value: "synthwave", label: "Synthwave", group: "Futuristic" },
    { value: "vaporwave", label: "Vaporwave", group: "Futuristic" },
    { value: "plasma", label: "Plasma", group: "Futuristic" },
    { value: "matrix", label: "Matrix", group: "Futuristic" },
    { value: "hacker", label: "Hacker", group: "Futuristic" },
    { value: "carbon", label: "Carbon Pro", group: "Futuristic" },
    { value: "obsidian", label: "Obsidian", group: "Futuristic" },
    { value: "amoled", label: "AMOLED Black", group: "Futuristic" },
    // Dark
    { value: "atom-dark", label: "Atom Dark", group: "Dark" },
    { value: "tokyo-night", label: "Tokyo Night", group: "Dark" },
    { value: "catppuccin-mocha", label: "Catppuccin Mocha", group: "Dark" },
    { value: "rose-pine", label: "Rosé Pine", group: "Dark" },
    { value: "midnight", label: "Midnight", group: "Dark" },
    { value: "neon", label: "Neon", group: "Dark" },
    { value: "dracula", label: "Dracula", group: "Dark" },
    { value: "nord", label: "Nord", group: "Dark" },
    { value: "gruvbox", label: "Gruvbox", group: "Dark" },
    { value: "monokai", label: "Monokai", group: "Dark" },
    { value: "one-dark", label: "One Dark", group: "Dark" },
    { value: "github-dark", label: "GitHub Dark", group: "Dark" },
    { value: "everforest", label: "Everforest", group: "Dark" },
    { value: "ayu-mirage", label: "Ayu Mirage", group: "Dark" },
    // Light
    { value: "atom-light", label: "Atom Light", group: "Light" },
    { value: "catppuccin-latte", label: "Catppuccin Latte", group: "Light" },
    { value: "google", label: "Google Classic", group: "Light" },
    { value: "solar", label: "Solar", group: "Light" },
    { value: "pastel", label: "Pastel", group: "Light" },
    { value: "arctic", label: "Arctic", group: "Light" },
    { value: "paper", label: "Paper", group: "Light" },
    { value: "mint", label: "Mint", group: "Light" },
    { value: "lavender", label: "Lavender", group: "Light" },
    { value: "solarized-light", label: "Solarized Light", group: "Light" },
    { value: "github-light", label: "GitHub Light", group: "Light" },
    // Retro
    { value: "commodore64", label: "Commodore 64", group: "Retro" },
    { value: "dos", label: "DOS", group: "Retro" },
    { value: "win95", label: "Windows 95", group: "Retro" },
    { value: "atari", label: "Atari", group: "Retro" },
    { value: "apple2", label: "Apple II", group: "Retro" },
    // Specialty
    { value: "high-contrast", label: "High Contrast (A11y)", group: "Accessibility" },
    { value: "dyslexia", label: "Dyslexia-friendly", group: "Accessibility" },
    { value: "deuteranopia", label: "Colorblind (Deuteranopia)", group: "Accessibility" },
    { value: "protanopia", label: "Colorblind (Protanopia)", group: "Accessibility" },
    // Gaming
    { value: "minecraft", label: "Minecraft", group: "Gaming" },
    { value: "hollow-knight", label: "Hollow Knight", group: "Gaming" },
    { value: "terraria", label: "Terraria", group: "Gaming" },
    { value: "stardew", label: "Stardew Valley", group: "Gaming" },
    // Anime
    { value: "steinsgate", label: "Steins;Gate", group: "Anime" },
    { value: "evangelion", label: "Evangelion", group: "Anime" },
    { value: "akira", label: "Akira", group: "Anime" },
    { value: "ghost-in-shell", label: "Ghost in the Shell", group: "Anime" },
    // Seasonal
    { value: "halloween", label: "Halloween", group: "Seasonal" },
    { value: "christmas", label: "Christmas", group: "Seasonal" },
    { value: "valentine", label: "Valentine", group: "Seasonal" },
    // Mood
    { value: "aurora", label: "Aurora", group: "Mood" },
    { value: "ocean", label: "Ocean", group: "Mood" },
    { value: "sunset", label: "Sunset", group: "Mood" },
    { value: "blood-moon", label: "Blood Moon", group: "Mood" },
    { value: "forest", label: "Forest", group: "Mood" },
    // Neon
    { value: "neon-blue", label: "Neon Blue", group: "Neon" },
    { value: "neon-green", label: "Neon Green", group: "Neon" },
    { value: "neon-purple", label: "Neon Purple", group: "Neon" },
    { value: "neon-orange", label: "Neon Orange", group: "Neon" },
    // System
    { value: "system", label: "System (auto)", group: "System" },
  ];

  function loadSettings() {
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) { return {}; }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function getTheme() {
    try { return localStorage.getItem("atomic.theme") || "system"; } catch (e) { return "system"; }
  }

  function setTheme(t) {
    try { localStorage.setItem("atomic.theme", t); } catch (e) {}
    if (window.AtomicThemes && window.AtomicThemes.apply) {
      window.AtomicThemes.apply(t);
    } else {
      document.body.dataset.theme = t === "system" ? "" : t;
    }
  }

  function $ (id) { return document.getElementById(id); }

  function buildThemeSelect() {
    var sel = $("theme-select");
    if (!sel) return;
    var groups = {};
    THEMES.forEach(function (t) {
      if (!groups[t.group]) groups[t.group] = [];
      groups[t.group].push(t);
    });
    Object.keys(groups).forEach(function (g) {
      var og = document.createElement("optgroup");
      og.label = g;
      groups[g].forEach(function (t) {
        var opt = document.createElement("option");
        opt.value = t.value;
        opt.textContent = t.label;
        og.appendChild(opt);
      });
      sel.appendChild(og);
    });
    sel.value = getTheme();
    sel.addEventListener("change", function () {
      setTheme(sel.value);
    });
  }

  function bindSettings() {
    var s = loadSettings();

    // Safe search
    var safeEl = $("safe-search");
    if (safeEl) {
      safeEl.checked = s.safeSearch !== false;
      safeEl.addEventListener("change", function () {
        s.safeSearch = safeEl.checked;
        saveSettings(s);
      });
    }

    // Safety badges
    var badgesEl = $("safety-badges");
    if (badgesEl) {
      badgesEl.checked = s.safety !== false;
      badgesEl.addEventListener("change", function () {
        s.safety = badgesEl.checked;
        saveSettings(s);
      });
    }

    // Proxy links
    var proxyEl = $("proxy-links");
    if (proxyEl) {
      proxyEl.checked = s.proxyLinks !== false;
      proxyEl.addEventListener("change", function () {
        s.proxyLinks = proxyEl.checked;
        saveSettings(s);
      });
    }

    // Per page
    var perPageEl = $("per-page");
    if (perPageEl) {
      perPageEl.value = String(s.perPage || 50);
      perPageEl.addEventListener("change", function () {
        s.perPage = Math.max(10, Math.min(100, Number(perPageEl.value) || 50));
        saveSettings(s);
      });
    }

    // AI summaries
    var aiEl = $("ai-summaries");
    if (aiEl) {
      aiEl.checked = s.aiSummaries !== false;
      aiEl.addEventListener("change", function () {
        s.aiSummaries = aiEl.checked;
        saveSettings(s);
      });
    }
  }

  function bindPrivacy() {
    // Clear history
    var clearHistBtn = $("clear-history");
    if (clearHistBtn) {
      clearHistBtn.addEventListener("click", function () {
        if (confirm("Clear your local search history?")) {
          try { localStorage.removeItem(HISTORY_KEY); } catch (e) {}
          alert("Search history cleared.");
        }
      });
    }

    // Export history
    var exportBtn = $("export-history");
    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        try {
          var hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
          var blob = new Blob([JSON.stringify(hist, null, 2)], { type: "application/json" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = "atomic-search-history.json";
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          alert("Could not export history.");
        }
      });
    }

    // Clear all
    var clearAllBtn = $("clear-all");
    if (clearAllBtn) {
      clearAllBtn.addEventListener("click", function () {
        if (confirm("This will wipe ALL locally stored Atomic Search data (settings, history, theme). Continue?")) {
          try {
            var keys = [];
            for (var i = 0; i < localStorage.length; i++) {
              var k = localStorage.key(i);
              if (k && k.startsWith("atomic")) keys.push(k);
            }
            keys.forEach(function (k) { localStorage.removeItem(k); });
          } catch (e) {}
          alert("All data cleared. Reloading…");
          location.reload();
        }
      });
    }
  }

  function bindSubmit() {
    var form = $("submit-form");
    var status = $("submit-status");
    if (!form) return;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var url = ($("submit-url").value || "").trim();
      if (!url) return;
      try {
        var res = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url }),
        });
        var data = await res.json();
        if (status) {
          status.style.display = "block";
          status.style.color = data.ok ? "var(--ok)" : "var(--danger)";
          status.textContent = data.ok
            ? "✓ Submitted! We'll crawl and index this URL."
            : (data.error || "Could not submit URL.");
          $("submit-url").value = "";
          setTimeout(function () { status.style.display = "none"; }, 4000);
        }
      } catch (err) {
        if (status) {
          status.style.display = "block";
          status.style.color = "var(--danger)";
          status.textContent = "Network error. Please try again.";
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    buildThemeSelect();
    bindSettings();
    bindPrivacy();
    bindSubmit();
  });
})();
