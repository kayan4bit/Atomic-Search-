// Enhanced Settings Panel v4 — 15+ new settings with organized tabs
(function () {
  "use strict";

  const SETTINGS_KEY = "atomic.settings.v4";
  const defaultSettings = {
    // Appearance
    theme: "system",
    fontSize: 14,
    compactMode: false,
    animationsEnabled: true,
    
    // Search behavior
    safeSearch: true,
    proxyLinks: true,
    perPage: 50,
    autoFocus: true,
    instantAnswers: true,
    
    // Privacy & Security
    blockTrackers: true,
    blockAds: true,
    stripReferrer: true,
    nsfwFilter: false,
    
    // AI Features
    aiEnabled: false,
    aiSummarize: false,
    aiChat: false,
    aiFactCheck: false,
    
    // Performance
    lazyLoadImages: true,
    cacheResults: true,
    maxCacheSize: 50,
    indexingSpeed: "normal", // fast, normal, slow
    
    // Notifications
    showNotifications: true,
    soundEnabled: false,
    
    // Advanced
    debugMode: false,
    customCSS: "",
    exportData: false,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return Object.assign({}, defaultSettings);
      const parsed = JSON.parse(raw);
      return Object.assign({}, defaultSettings, parsed);
    } catch (e) {
      return Object.assign({}, defaultSettings);
    }
  }

  function saveSettings(s) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch (e) {
      /* ignore */
    }
  }

  let settings = loadSettings();

  function initSettingsPanel() {
    const modal = document.getElementById("settings-modal");
    const openBtn = document.getElementById("open-settings");
    const openBtnHome = document.getElementById("open-settings-home");
    const closeBtn = modal?.querySelector(".modal-close");

    if (!modal) return;

    // Open settings
    [openBtn, openBtnHome].forEach((btn) => {
      if (btn) {
        btn.addEventListener("click", () => {
          modal.hidden = false;
          renderSettingsPanel();
        });
      }
    });

    // Close settings
    closeBtn?.addEventListener("click", () => {
      modal.hidden = true;
    });

    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.hidden = true;
    });
  }

  function renderSettingsPanel() {
    const modal = document.getElementById("settings-modal");
    const body = modal?.querySelector(".modal-body");
    if (!body) return;

    body.innerHTML = `
      <div class="settings-panel">
        <div class="settings-sidebar">
          <button class="settings-tab active" data-tab="appearance">Appearance</button>
          <button class="settings-tab" data-tab="search">Search</button>
          <button class="settings-tab" data-tab="privacy">Privacy</button>
          <button class="settings-tab" data-tab="ai">AI Features</button>
          <button class="settings-tab" data-tab="performance">Performance</button>
          <button class="settings-tab" data-tab="advanced">Advanced</button>
        </div>
        <div class="settings-content">
          ${renderAppearanceTab()}
          ${renderSearchTab()}
          ${renderPrivacyTab()}
          ${renderAITab()}
          ${renderPerformanceTab()}
          ${renderAdvancedTab()}
        </div>
      </div>
    `;

    // Bind tab switching
    body.querySelectorAll(".settings-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const tabName = tab.getAttribute("data-tab");
        body.querySelectorAll(".settings-tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        body.querySelectorAll(".settings-section").forEach((s) => {
          s.classList.toggle("active", s.getAttribute("data-section") === tabName);
        });
      });
    });

    // Bind setting changes
    bindSettingControls(body);
  }

  function renderAppearanceTab() {
    return `
      <div class="settings-section active" data-section="appearance">
        <div class="settings-section-title">Theme</div>
        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Color Scheme</span>
            <span class="setting-hint">Choose your preferred theme — stored locally only</span>
          </div>
          <select class="setting-control" data-setting="theme" id="settings-theme-select">
            <option value="system">System (auto dark/light)</option>
            <optgroup label="UCX">
              <option value="ucx">UCX Industry</option>
            </optgroup>
            <optgroup label="Futuristic">
              <option value="quantum">Quantum (neon grid)</option>
              <option value="cyberpunk">Cyberpunk</option>
              <option value="synthwave">Synthwave</option>
              <option value="vaporwave">Vaporwave</option>
              <option value="plasma">Plasma</option>
              <option value="matrix">Matrix</option>
              <option value="hacker">Hacker</option>
              <option value="carbon">Carbon Pro</option>
              <option value="obsidian">Obsidian</option>
              <option value="amoled">AMOLED Black</option>
            </optgroup>
            <optgroup label="Dark">
              <option value="atom-dark">Atom Dark</option>
              <option value="tokyo-night">Tokyo Night</option>
              <option value="catppuccin-mocha">Catppuccin Mocha</option>
              <option value="rose-pine">Rosé Pine</option>
              <option value="midnight">Midnight</option>
              <option value="neon">Neon</option>
              <option value="dracula">Dracula</option>
              <option value="nord">Nord</option>
              <option value="gruvbox">Gruvbox</option>
              <option value="sunset">Sunset</option>
              <option value="ocean">Ocean</option>
              <option value="monokai">Monokai</option>
              <option value="nightfall">Nightfall</option>
              <option value="solarized-dark">Solarized Dark</option>
              <option value="one-dark">One Dark</option>
              <option value="github-dark">GitHub Dark</option>
              <option value="everforest">Everforest</option>
              <option value="ayu-mirage">Ayu Mirage</option>
            </optgroup>
            <optgroup label="Light">
              <option value="atom-light">Atom Light</option>
              <option value="catppuccin-latte">Catppuccin Latte</option>
              <option value="google">Google Classic</option>
              <option value="solar">Solar</option>
              <option value="pastel">Pastel</option>
              <option value="arctic">Arctic</option>
              <option value="sunrise">Sunrise</option>
              <option value="paper">Paper</option>
              <option value="mint">Mint</option>
              <option value="lavender">Lavender</option>
              <option value="solarized-light">Solarized Light</option>
              <option value="github-light">GitHub Light</option>
              <option value="candy">Candy</option>
            </optgroup>
            <optgroup label="New — Professional Dark">
              <option value="slate">Slate</option>
              <option value="indigo">Indigo</option>
              <option value="emerald">Emerald</option>
              <option value="rose">Rose</option>
              <option value="amber">Amber</option>
              <option value="teal">Teal</option>
              <option value="violet">Violet</option>
              <option value="crimson">Crimson</option>
              <option value="sapphire">Sapphire</option>
              <option value="copper">Copper</option>
              <option value="moonlight">Moonlight</option>
              <option value="dusk">Dusk</option>
              <option value="graphite">Graphite</option>
              <option value="midnight-blue">Midnight Blue</option>
              <option value="warm-dark">Warm Dark</option>
            </optgroup>
            <optgroup label="New — Professional Light">
              <option value="ivory">Ivory</option>
              <option value="chalk">Chalk</option>
              <option value="sky">Sky</option>
              <option value="sage">Sage</option>
              <option value="blush">Blush</option>
              <option value="lemon">Lemon</option>
            </optgroup>
            <optgroup label="Retro">
              <option value="commodore64">Commodore 64</option>
              <option value="atari">Atari</option>
              <option value="apple2">Apple II</option>
              <option value="dos">DOS</option>
              <option value="win95">Windows 95</option>
            </optgroup>
            <optgroup label="Anime">
              <option value="steinsgate">Steins;Gate</option>
              <option value="evangelion">Evangelion</option>
              <option value="akira">Akira</option>
              <option value="ghost-in-shell">Ghost in the Shell</option>
            </optgroup>
            <optgroup label="Gaming">
              <option value="minecraft">Minecraft</option>
              <option value="terraria">Terraria</option>
              <option value="stardew">Stardew Valley</option>
              <option value="hollow-knight">Hollow Knight</option>
            </optgroup>
            <optgroup label="Brand-inspired">
              <option value="github">GitHub</option>
              <option value="stripe">Stripe</option>
              <option value="notion">Notion</option>
              <option value="discord">Discord</option>
            </optgroup>
            <optgroup label="Seasonal">
              <option value="halloween">Halloween</option>
              <option value="christmas">Christmas</option>
              <option value="valentine">Valentine</option>
            </optgroup>
            <optgroup label="Accessibility">
              <option value="high-contrast">High Contrast (A11y)</option>
              <option value="high-contrast-plus">High Contrast Plus</option>
              <option value="dyslexia">Dyslexia-friendly</option>
              <option value="deuteranopia">Colorblind (Deuteranopia)</option>
              <option value="protanopia">Colorblind (Protanopia)</option>
              <option value="tritanopia">Colorblind (Tritanopia)</option>
            </optgroup>
            <optgroup label="Mood">
              <option value="aurora">Aurora</option>
              <option value="blood-moon">Blood Moon</option>
              <option value="forest">Forest</option>
              <option value="deep-sea">Deep Sea</option>
              <option value="cozy">Cozy</option>
              <option value="energetic">Energetic</option>
              <option value="calm">Calm</option>
              <option value="focused">Focused</option>
            </optgroup>
          </select>
        </div>

        <div class="settings-section-title" style="margin-top: 24px;">Display</div>
        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Font Size</span>
            <span class="setting-hint">Adjust text size (12-18px)</span>
          </div>
          <div class="setting-control">
            <input type="range" class="slider" data-setting="fontSize" min="12" max="18" value="${settings.fontSize}">
            <span>${settings.fontSize}px</span>
          </div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Compact Mode</span>
            <span class="setting-hint">Reduce spacing and padding</span>
          </div>
          <div class="toggle-switch ${settings.compactMode ? "active" : ""}" data-setting="compactMode"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Animations</span>
            <span class="setting-hint">Enable smooth transitions</span>
          </div>
          <div class="toggle-switch ${settings.animationsEnabled ? "active" : ""}" data-setting="animationsEnabled"></div>
        </div>
      </div>
    `;
  }

  function renderSearchTab() {
    return `
      <div class="settings-section" data-section="search">
        <div class="settings-section-title">Search Behavior</div>
        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Results Per Page</span>
            <span class="setting-hint">How many results to show</span>
          </div>
          <select class="setting-control" data-setting="perPage">
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50" selected>50</option>
            <option value="100">100</option>
          </select>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Auto-focus Search</span>
            <span class="setting-hint">Focus search box on page load</span>
          </div>
          <div class="toggle-switch ${settings.autoFocus ? "active" : ""}" data-setting="autoFocus"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Instant Answers</span>
            <span class="setting-hint">Show math, time, unit conversions</span>
          </div>
          <div class="toggle-switch ${settings.instantAnswers ? "active" : ""}" data-setting="instantAnswers"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Proxy Links</span>
            <span class="setting-hint">Route clicks through privacy proxy</span>
          </div>
          <div class="toggle-switch ${settings.proxyLinks ? "active" : ""}" data-setting="proxyLinks"></div>
        </div>
      </div>
    `;
  }

  function renderPrivacyTab() {
    return `
      <div class="settings-section" data-section="privacy">
        <div class="settings-section-title">Safety & Filtering</div>
        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Safe Search</span>
            <span class="setting-hint">Filter explicit content</span>
          </div>
          <div class="toggle-switch ${settings.safeSearch ? "active" : ""}" data-setting="safeSearch"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Block Trackers</span>
            <span class="setting-hint">Remove tracking pixels and beacons</span>
          </div>
          <div class="toggle-switch ${settings.blockTrackers ? "active" : ""}" data-setting="blockTrackers"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Block Ads</span>
            <span class="setting-hint">Remove advertisements from pages</span>
          </div>
          <div class="toggle-switch ${settings.blockAds ? "active" : ""}" data-setting="blockAds"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Strip Referrer</span>
            <span class="setting-hint">Don't send referrer to clicked sites</span>
          </div>
          <div class="toggle-switch ${settings.stripReferrer ? "active" : ""}" data-setting="stripReferrer"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">NSFW Filter</span>
            <span class="setting-hint">Hide adult content</span>
          </div>
          <div class="toggle-switch ${settings.nsfwFilter ? "active" : ""}" data-setting="nsfwFilter"></div>
        </div>
      </div>
    `;
  }

  function renderAITab() {
    return `
      <div class="settings-section" data-section="ai">
        <div class="settings-section-title">AI Enhancements</div>
        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Enable AI Features</span>
            <span class="setting-hint">Requires OpenRouter API key</span>
          </div>
          <div class="toggle-switch ${settings.aiEnabled ? "active" : ""}" data-setting="aiEnabled"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">AI Summarization</span>
            <span class="setting-hint">Summarize search results</span>
          </div>
          <div class="toggle-switch ${settings.aiSummarize ? "active" : ""}" data-setting="aiSummarize"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">AI Chat</span>
            <span class="setting-hint">Chat with AI assistant</span>
          </div>
          <div class="toggle-switch ${settings.aiChat ? "active" : ""}" data-setting="aiChat"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Fact Checking</span>
            <span class="setting-hint">Verify claims against sources</span>
          </div>
          <div class="toggle-switch ${settings.aiFactCheck ? "active" : ""}" data-setting="aiFactCheck"></div>
        </div>
      </div>
    `;
  }

  function renderPerformanceTab() {
    return `
      <div class="settings-section" data-section="performance">
        <div class="settings-section-title">Optimization</div>
        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Lazy Load Images</span>
            <span class="setting-hint">Load images on demand</span>
          </div>
          <div class="toggle-switch ${settings.lazyLoadImages ? "active" : ""}" data-setting="lazyLoadImages"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Cache Results</span>
            <span class="setting-hint">Store search results locally</span>
          </div>
          <div class="toggle-switch ${settings.cacheResults ? "active" : ""}" data-setting="cacheResults"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Indexing Speed</span>
            <span class="setting-hint">Balance speed vs. thoroughness</span>
          </div>
          <select class="setting-control" data-setting="indexingSpeed">
            <option value="slow">Slow (thorough)</option>
            <option value="normal" selected>Normal</option>
            <option value="fast">Fast (quick)</option>
          </select>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Max Cache Size</span>
            <span class="setting-hint">Maximum cached results (MB)</span>
          </div>
          <div class="setting-control">
            <input type="range" class="slider" data-setting="maxCacheSize" min="10" max="200" value="${settings.maxCacheSize}">
            <span>${settings.maxCacheSize}MB</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderAdvancedTab() {
    return `
      <div class="settings-section" data-section="advanced">
        <div class="settings-section-title">Advanced Options</div>
        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Debug Mode</span>
            <span class="setting-hint">Show technical information</span>
          </div>
          <div class="toggle-switch ${settings.debugMode ? "active" : ""}" data-setting="debugMode"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Notifications</span>
            <span class="setting-hint">Show browser notifications</span>
          </div>
          <div class="toggle-switch ${settings.showNotifications ? "active" : ""}" data-setting="showNotifications"></div>
        </div>

        <div class="setting-item">
          <div class="setting-label">
            <span class="setting-label-text">Sound Effects</span>
            <span class="setting-hint">Play sounds on events</span>
          </div>
          <div class="toggle-switch ${settings.soundEnabled ? "active" : ""}" data-setting="soundEnabled"></div>
        </div>

        <div class="setting-item">
          <button class="btn" onclick="clearAllData()">Clear All Data</button>
          <span class="setting-hint">Delete history, cache, and settings</span>
        </div>

        <div class="setting-item">
          <button class="btn" onclick="exportSettings()">Export Settings</button>
          <span class="setting-hint">Download your configuration</span>
        </div>
      </div>
    `;
  }

  function bindSettingControls(container) {
    container.querySelectorAll("[data-setting]").forEach((el) => {
      const key = el.getAttribute("data-setting");
      if (!key) return;

      if (el.classList.contains("toggle-switch")) {
        el.addEventListener("click", () => {
          el.classList.toggle("active");
          settings[key] = el.classList.contains("active");
          saveSettings(settings);
          applySettings();
        });
      } else if (el.tagName === "SELECT") {
        el.value = settings[key];
        el.addEventListener("change", () => {
          settings[key] = el.value;
          saveSettings(settings);
          applySettings();
        });
      } else if (el.tagName === "INPUT" && el.type === "range") {
        el.value = settings[key];
        el.addEventListener("input", () => {
          settings[key] = parseInt(el.value);
          el.parentElement.querySelector("span").textContent = el.value + (key === "fontSize" ? "px" : key === "maxCacheSize" ? "MB" : "");
          saveSettings(settings);
          applySettings();
        });
      }
    });
  }

  function applySettings() {
    // Apply theme
    document.documentElement.setAttribute("data-theme", settings.theme);

    // Apply font size
    document.documentElement.style.fontSize = settings.fontSize + "px";

    // Apply compact mode
    document.body.classList.toggle("compact-mode", settings.compactMode);

    // Apply animations
    document.body.classList.toggle("no-animations", !settings.animationsEnabled);

    // Apply other settings as needed
    if (settings.debugMode) {
      console.log("Settings:", settings);
    }
  }

  window.clearAllData = function () {
    if (confirm("Delete all data? This cannot be undone.")) {
      localStorage.clear();
      location.reload();
    }
  };

  window.exportSettings = function () {
    const data = JSON.stringify(settings, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "atomic-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSettingsPanel);
  } else {
    initSettingsPanel();
  }

  // Apply settings on load
  applySettings();
})();

