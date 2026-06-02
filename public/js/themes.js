(function () {
  "use strict";
  var KEY = "atomic.theme";
  var SYSTEM_KEY = "atomic.theme.followSystem";
  var DEFAULT_DARK = "atom-dark";
  var DEFAULT_LIGHT = "atom-light";

  // Detect system preference.
  function systemPrefersDark() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch (e) { return true; }
  }

  // Resolve the effective theme: if the user has chosen "system", pick the
  // appropriate default based on OS preference.
  function resolveTheme(saved) {
    if (saved === "system") {
      return systemPrefersDark() ? DEFAULT_DARK : DEFAULT_LIGHT;
    }
    return saved || (systemPrefersDark() ? DEFAULT_DARK : DEFAULT_LIGHT);
  }

  function apply(t, opts) {
    if (!t) return;
    var effective = resolveTheme(t);
    // Add a brief transition class so theme switches feel smooth instead of
    // jarring. We remove it after the transition completes so it doesn't
    // interfere with other animations.
    if (opts && opts.animate !== false && document.body) {
      document.body.classList.add("theme-transition");
      setTimeout(function () {
        document.body.classList.remove("theme-transition");
      }, 300);
    }
    document.body.dataset.theme = effective;
    try { localStorage.setItem(KEY, t); } catch (e) { /* ignore */ }
    var sel = document.getElementById("theme");
    if (sel) sel.value = t;
  }

  // Boot: apply saved theme (or system default) immediately so there's no flash.
  var saved = DEFAULT_DARK;
  try { saved = localStorage.getItem(KEY) || "system"; } catch (e) { /* ignore */ }
  // Apply without animation on boot to avoid flash.
  apply(saved, { animate: false });

  // Listen for OS dark/light mode changes and update if the user is on "system".
  try {
    var mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (mq && mq.addEventListener) {
      mq.addEventListener("change", function () {
        var current;
        try { current = localStorage.getItem(KEY) || "system"; } catch (e) { current = "system"; }
        if (current === "system") apply("system");
      });
    }
  } catch (e) { /* ignore */ }

  // Late-bind the <select> so the settings modal can mutate it.
  document.addEventListener("DOMContentLoaded", function () {
    var sel = document.getElementById("theme");
    if (!sel) return;
    var stored;
    try { stored = localStorage.getItem(KEY) || "system"; } catch (e) { stored = "system"; }
    sel.value = stored;
    sel.addEventListener("change", function (e) { apply(e.target.value); });

    // Theme preview: show a small colour swatch when hovering over options.
    sel.addEventListener("mouseover", function (e) {
      if (e.target.tagName === "OPTION") {
        var preview = document.getElementById("theme-preview");
        if (preview) preview.setAttribute("data-preview", e.target.value);
      }
    });
  });

  // Expose apply() globally so other scripts can switch themes programmatically.
  window.__atomicApplyTheme = apply;
})();
