/*
 * Atomic Search - Retention Modal Feature
 * Shows "Are you sure?" dialog when users click external links
 * with 3 compelling reasons to stay
 */
(function () {
  "use strict";

  // Store pending redirect URL
  var pendingRedirect = null;

  // Initialize when DOM is ready
  document.addEventListener("DOMContentLoaded", function () {
    initLeavingModal();
    initResultLinkInterception();
  });

  function initLeavingModal() {
    var modal = document.getElementById("leaving-modal");
    if (!modal) return;

    var closeBtn = document.getElementById("leaving-close");
    var stayBtn = document.getElementById("leaving-stay");
    var goBtn = document.getElementById("leaving-go");

    // Close modal and stay
    function stay() {
      modal.hidden = true;
      pendingRedirect = null;
      // Remove overlay
      document.body.style.overflow = "";
    }

    // Actually navigate to the URL
    function goNow() {
      if (pendingRedirect) {
        var url = pendingRedirect;
        pendingRedirect = null;
        modal.hidden = true;
        document.body.style.overflow = "";
        // Navigate directly without proxy
        window.location.href = url;
      }
    }

    if (closeBtn) {
      closeBtn.addEventListener("click", stay);
    }
    if (stayBtn) {
      stayBtn.addEventListener("click", stay);
    }
    if (goBtn) {
      goBtn.addEventListener("click", goNow);
    }

    // Close on backdrop click
    modal.addEventListener("click", function (e) {
      if (e.target === modal) {
        stay();
      }
    });

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !modal.hidden) {
        stay();
      }
    });
  }

  // Intercept result link clicks and show retention modal
  function initResultLinkInterception() {
    document.addEventListener("click", function (e) {
      var link = e.target.closest("a[data-leave]");
      if (!link) return;

      e.preventDefault();
      e.stopPropagation();

      var href = link.getAttribute("href");
      if (!href) return;

      // Store the pending redirect
      pendingRedirect = href;

      // Show the modal
      var modal = document.getElementById("leaving-modal");
      if (modal) {
        modal.hidden = false;
        document.body.style.overflow = "hidden";

        // Focus the stay button for better UX
        var stayBtn = document.getElementById("leaving-stay");
        if (stayBtn) {
          setTimeout(function () { stayBtn.focus(); }, 100);
        }
      }
    });

    // Also handle direct link clicks on result titles
    document.addEventListener("mousedown", function (e) {
      var link = e.target.closest(".result .title a, .result a[data-result-link]");
      if (!link) return;

      // Only intercept middle clicks or ctrl/cmd clicks
      if (e.button === 1 || e.ctrlKey || e.metaKey) {
        e.preventDefault();
        var href = link.getAttribute("href");
        if (href) {
          pendingRedirect = href;
          var modal = document.getElementById("leaving-modal");
          if (modal) {
            modal.hidden = false;
            document.body.style.overflow = "hidden";
          }
        }
      }
    });
  }

  // Expose for external use
  window.AtomicRetention = {
    showModal: function (url) {
      pendingRedirect = url;
      var modal = document.getElementById("leaving-modal");
      if (modal) {
        modal.hidden = false;
        document.body.style.overflow = "hidden";
      }
    },
    hideModal: function () {
      pendingRedirect = null;
      var modal = document.getElementById("leaving-modal");
      if (modal) {
        modal.hidden = true;
        document.body.style.overflow = "";
      }
    }
  };
})();