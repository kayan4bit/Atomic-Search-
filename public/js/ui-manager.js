/**
 * UI Manager — Atomic Search v2
 * Manages all UI elements: visibility, interactions, animations,
 * responsive design, dark mode, accessibility, and performance.
 */
(function () {
  "use strict";

  // ── Helpers ──────────────────────────────────────────────────────────────
  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return [...(root || document).querySelectorAll(sel)]; }
  function show(el) { if (el) el.hidden = false; }
  function hide(el) { if (el) el.hidden = true; }
  function toggle(el, force) {
    if (el) el.hidden = force !== undefined ? !force : !el.hidden;
  }

  // ── View management ───────────────────────────────────────────────────────
  var views = {
    home:    $("home"),
    results: $("results-shell"),
  };

  function showView(name) {
    for (var k in views) {
      if (views[k]) views[k].hidden = (k !== name);
    }
    document.body.dataset.view = name;
    // Ensure the active view is visible.
    if (views[name]) {
      views[name].style.display = "";
      views[name].removeAttribute("hidden");
    }
  }

  // Expose globally so app.js can call it.
  window.UIManager = window.UIManager || {};
  window.UIManager.showView = showView;
  window.UIManager.show = show;
  window.UIManager.hide = hide;
  window.UIManager.toggle = toggle;

  // ── Modal management ──────────────────────────────────────────────────────
  var openModals = [];

  function openModal(id) {
    var el = $(id);
    if (!el) return;
    show(el);
    el.setAttribute("aria-hidden", "false");
    openModals.push(id);
    document.body.style.overflow = "hidden";
    // Focus first focusable element.
    var focusable = el.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) setTimeout(function () { focusable.focus(); }, 50);
    // Trap focus inside modal.
    el._trapFocus = function (e) { trapFocus(el, e); };
    el.addEventListener("keydown", el._trapFocus);
  }

  function closeModal(id) {
    var el = $(id);
    if (!el) return;
    hide(el);
    el.setAttribute("aria-hidden", "true");
    openModals = openModals.filter(function (m) { return m !== id; });
    if (!openModals.length) document.body.style.overflow = "";
    if (el._trapFocus) { el.removeEventListener("keydown", el._trapFocus); delete el._trapFocus; }
  }

  function closeTopModal() {
    if (openModals.length) closeModal(openModals[openModals.length - 1]);
  }

  function trapFocus(modal, e) {
    if (e.key !== "Tab") return;
    var focusable = $$('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])', modal)
      .filter(function (el) { return !el.closest("[hidden]"); });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  window.UIManager.openModal  = openModal;
  window.UIManager.closeModal = closeModal;

  // ── Close modals on backdrop click ────────────────────────────────────────
  document.addEventListener("click", function (e) {
    if (e.target.classList.contains("modal-backdrop")) closeTopModal();
  });

  // ── Close modals on Escape ────────────────────────────────────────────────
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeTopModal();
  });

  // ── Modal close buttons ───────────────────────────────────────────────────
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".modal-close");
    if (!btn) return;
    var modal = btn.closest(".modal-backdrop");
    if (modal) closeModal(modal.id);
  });

  // ── Settings modal triggers ───────────────────────────────────────────────
  var settingsBtn     = $("open-settings");
  var settingsBtnHome = $("open-settings-home");
  if (settingsBtn)     settingsBtn.addEventListener("click",     function () { openModal("settings-modal"); });
  if (settingsBtnHome) settingsBtnHome.addEventListener("click", function () { openModal("settings-modal"); });

  // ── Submit URL modal triggers ─────────────────────────────────────────────
  var submitBtnHome = $("open-submit-home");
  if (submitBtnHome) submitBtnHome.addEventListener("click", function () { openModal("settings-modal"); });

  // ── Dark mode detection & toggle ──────────────────────────────────────────
  var darkModeQuery = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");

  function applySystemTheme() {
    var theme = localStorage.getItem("atomic.theme") || "system";
    if (theme === "system") {
      document.documentElement.dataset.theme = darkModeQuery && darkModeQuery.matches ? "dark" : "light";
    }
  }

  if (darkModeQuery) {
    darkModeQuery.addEventListener("change", applySystemTheme);
  }
  applySystemTheme();

  // ── Responsive: mobile nav ────────────────────────────────────────────────
  function handleResize() {
    var w = window.innerWidth;
    document.body.dataset.mobile = w < 640 ? "1" : "0";
    document.body.dataset.tablet = (w >= 640 && w < 1024) ? "1" : "0";
  }
  window.addEventListener("resize", debounce(handleResize, 100));
  handleResize();

  // ── Smooth scroll to top on home logo click ───────────────────────────────
  var brand = document.querySelector(".brand");
  if (brand) {
    brand.addEventListener("click", function (e) {
      if (e.currentTarget.getAttribute("href") === "/") {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  // ── Loading state management ──────────────────────────────────────────────
  var loadingEl = null;

  function showLoading(container) {
    if (!container) return;
    if (loadingEl) loadingEl.remove();
    loadingEl = document.createElement("div");
    loadingEl.className = "loading-spinner";
    loadingEl.innerHTML = '<div class="spinner"></div><span>Searching…</span>';
    container.appendChild(loadingEl);
  }

  function hideLoading() {
    if (loadingEl) { loadingEl.remove(); loadingEl = null; }
  }

  window.UIManager.showLoading = showLoading;
  window.UIManager.hideLoading = hideLoading;

  // ── Autocomplete dropdown ─────────────────────────────────────────────────
  var autocompleteDropdown = null;
  var autocompleteSelected = -1;

  function showAutocomplete(input, suggestions) {
    hideAutocomplete();
    if (!suggestions || !suggestions.length) return;
    var form = input.closest("form");
    if (!form) return;
    form.style.position = "relative";
    autocompleteDropdown = document.createElement("div");
    autocompleteDropdown.className = "autocomplete-dropdown";
    autocompleteDropdown.setAttribute("role", "listbox");
    suggestions.forEach(function (s, i) {
      var item = document.createElement("div");
      item.className = "autocomplete-item";
      item.setAttribute("role", "option");
      item.setAttribute("data-idx", i);
      item.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>' +
        '<span>' + escHtml(s) + '</span>';
      item.addEventListener("mousedown", function (e) {
        e.preventDefault();
        input.value = s;
        hideAutocomplete();
        input.closest("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      });
      autocompleteDropdown.appendChild(item);
    });
    form.appendChild(autocompleteDropdown);
    autocompleteSelected = -1;
  }

  function hideAutocomplete() {
    if (autocompleteDropdown) { autocompleteDropdown.remove(); autocompleteDropdown = null; }
    autocompleteSelected = -1;
  }

  function navigateAutocomplete(dir) {
    if (!autocompleteDropdown) return false;
    var items = $$(".autocomplete-item", autocompleteDropdown);
    if (!items.length) return false;
    items.forEach(function (el) { el.classList.remove("selected"); });
    autocompleteSelected = Math.max(-1, Math.min(items.length - 1, autocompleteSelected + dir));
    if (autocompleteSelected >= 0) items[autocompleteSelected].classList.add("selected");
    return true;
  }

  function selectAutocomplete(input) {
    if (!autocompleteDropdown || autocompleteSelected < 0) return false;
    var items = $$(".autocomplete-item", autocompleteDropdown);
    if (items[autocompleteSelected]) {
      input.value = items[autocompleteSelected].querySelector("span").textContent;
      hideAutocomplete();
      return true;
    }
    return false;
  }

  // Wire up autocomplete keyboard navigation on all search inputs.
  $$("input[type='search']").forEach(function (input) {
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); navigateAutocomplete(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); navigateAutocomplete(-1); }
      else if (e.key === "Enter" && selectAutocomplete(input)) { e.preventDefault(); }
      else if (e.key === "Escape") hideAutocomplete();
    });
    input.addEventListener("blur", function () {
      setTimeout(hideAutocomplete, 150);
    });
  });

  window.UIManager.showAutocomplete = showAutocomplete;
  window.UIManager.hideAutocomplete = hideAutocomplete;

  // ── Notification / toast system ───────────────────────────────────────────
  var toastContainer = null;

  function showToast(message, type, durationMs) {
    type = type || "info";
    durationMs = durationMs || 3000;
    if (!toastContainer) {
      toastContainer = document.createElement("div");
      toastContainer.style.cssText =
        "position:fixed;bottom:20px;left:50%;transform:translateX(-50%);" +
        "z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;";
      document.body.appendChild(toastContainer);
    }
    var toast = document.createElement("div");
    var colors = { info: "#3b82f6", success: "#22c55e", warning: "#f59e0b", error: "#ef4444" };
    toast.style.cssText =
      "background:" + (colors[type] || colors.info) + ";color:#fff;" +
      "padding:10px 20px;border-radius:999px;font-size:13.5px;font-weight:500;" +
      "box-shadow:0 4px 16px rgba(0,0,0,0.2);pointer-events:auto;" +
      "animation:toast-in 0.2s ease;max-width:320px;text-align:center;";
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(function () {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s";
      setTimeout(function () { toast.remove(); }, 300);
    }, durationMs);
  }

  // Inject toast animation.
  var toastStyle = document.createElement("style");
  toastStyle.textContent = "@keyframes toast-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}";
  document.head.appendChild(toastStyle);

  window.UIManager.showToast = showToast;

  // ── Scroll-to-top button ──────────────────────────────────────────────────
  var scrollBtn = document.createElement("button");
  scrollBtn.setAttribute("aria-label", "Scroll to top");
  scrollBtn.style.cssText =
    "position:fixed;bottom:60px;right:16px;width:36px;height:36px;" +
    "background:var(--bg-elev);border:1px solid var(--border);border-radius:50%;" +
    "display:none;align-items:center;justify-content:center;cursor:pointer;" +
    "z-index:40;transition:opacity 0.2s;box-shadow:0 2px 8px rgba(0,0,0,0.1);";
  scrollBtn.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 15l-6-6-6 6"/></svg>';
  document.body.appendChild(scrollBtn);

  window.addEventListener("scroll", debounce(function () {
    scrollBtn.style.display = window.scrollY > 300 ? "flex" : "none";
  }, 100));
  scrollBtn.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ── Keyboard shortcut: / to focus search ─────────────────────────────────
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) {
      e.preventDefault();
      var input = $("q") || $("q-hero");
      if (input) { input.focus(); input.select(); }
    }
  });

  // ── Accessibility: announce dynamic content ───────────────────────────────
  var liveRegion = document.createElement("div");
  liveRegion.setAttribute("aria-live", "polite");
  liveRegion.setAttribute("aria-atomic", "true");
  liveRegion.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);";
  document.body.appendChild(liveRegion);

  function announce(message) {
    liveRegion.textContent = "";
    setTimeout(function () { liveRegion.textContent = message; }, 50);
  }

  window.UIManager.announce = announce;

  // ── Performance: lazy-load images ────────────────────────────────────────
  if ("IntersectionObserver" in window) {
    var imgObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            delete img.dataset.src;
            imgObserver.unobserve(img);
          }
        }
      });
    }, { rootMargin: "200px" });

    window.UIManager.observeLazyImg = function (img) { imgObserver.observe(img); };
  } else {
    window.UIManager.observeLazyImg = function (img) {
      if (img.dataset.src) { img.src = img.dataset.src; delete img.dataset.src; }
    };
  }

  // ── Utility: debounce ─────────────────────────────────────────────────────
  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  // ── Utility: escape HTML ──────────────────────────────────────────────────
  function escHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ── Export result actions ─────────────────────────────────────────────────
  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".export-btn");
    if (!btn) return;
    var fmt = btn.dataset.export;
    var results = window._lastResults || [];
    var query   = window._lastQuery   || "";
    if (!results.length) { showToast("No results to export", "warning"); return; }
    var content, mime, ext;
    if (fmt === "json") {
      content = JSON.stringify({ query: query, results: results.map(function (r) {
        return { title: r.title, url: r.url, snippet: r.snippet || (r.text || "").slice(0, 200) };
      })}, null, 2);
      mime = "application/json"; ext = "json";
    } else {
      var rows = ['"title","url","snippet"'].concat(results.map(function (r) {
        var esc = function (s) { return '"' + String(s || "").replace(/"/g, '""') + '"'; };
        return [r.title, r.url, r.snippet || (r.text || "").slice(0, 200)].map(esc).join(",");
      }));
      content = rows.join("\n");
      mime = "text/csv"; ext = "csv";
    }
    var blob = new Blob([content], { type: mime });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "atomic-results-" + Date.now() + "." + ext;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("Exported " + results.length + " results", "success");
  });

  // ── Page visibility: pause/resume animations ──────────────────────────────
  document.addEventListener("visibilitychange", function () {
    document.body.dataset.hidden = document.hidden ? "1" : "0";
  });

  // ── Init complete ─────────────────────────────────────────────────────────
  window.UIManager.ready = true;
  document.dispatchEvent(new CustomEvent("ui-manager-ready"));

})();
