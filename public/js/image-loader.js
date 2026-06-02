// Image loading fix — handles lazy loading, fallbacks, and optimization
(function () {
  "use strict";

  const RETRY_ATTEMPTS = 3;
  const RETRY_DELAY = 1000;
  const IMAGE_TIMEOUT = 10000;

  // Polyfill for older browsers
  if (!("loading" in HTMLImageElement.prototype)) {
    document.addEventListener("DOMContentLoaded", initLazyLoad);
  }

  function initLazyLoad() {
    const images = document.querySelectorAll("img[loading='lazy']");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          loadImage(entry.target);
          observer.unobserve(entry.target);
        }
      });
    });

    images.forEach((img) => observer.observe(img));
  }

  function loadImage(img, attempt = 0) {
    if (!img.dataset.src && !img.src) return;

    const src = img.dataset.src || img.src;
    const timeout = setTimeout(() => {
      img.classList.add("load-error");
      if (attempt < RETRY_ATTEMPTS) {
        setTimeout(() => loadImage(img, attempt + 1), RETRY_DELAY);
      }
    }, IMAGE_TIMEOUT);

    const tempImg = new Image();
    tempImg.onload = () => {
      clearTimeout(timeout);
      img.src = src;
      img.classList.add("loaded");
      img.removeAttribute("data-src");
    };

    tempImg.onerror = () => {
      clearTimeout(timeout);
      img.classList.add("load-error");
      if (attempt < RETRY_ATTEMPTS) {
        setTimeout(() => loadImage(img, attempt + 1), RETRY_DELAY);
      } else {
        // Use placeholder or proxy
        img.src = `/api/image-proxy?url=${encodeURIComponent(src)}`;
      }
    };

    tempImg.src = src;
  }

  // Fix images in results
  function fixResultImages() {
    const images = document.querySelectorAll(".result img, .answer-thumb");
    images.forEach((img) => {
      if (!img.src) return;

      // Add loading attribute if missing
      if (!img.getAttribute("loading")) {
        img.setAttribute("loading", "lazy");
      }

      // Add error handler
      img.addEventListener("error", () => {
        img.classList.add("load-error");
        // Try proxy
        const originalSrc = img.src;
        img.src = `/api/image-proxy?url=${encodeURIComponent(originalSrc)}`;
      });

      // Add load handler
      img.addEventListener("load", () => {
        img.classList.add("loaded");
      });

      // Set referrer policy
      img.setAttribute("referrerpolicy", "no-referrer");
    });
  }

  // Watch for new images added to DOM
  const observer = new MutationObserver(() => {
    fixResultImages();
  });

  document.addEventListener("DOMContentLoaded", () => {
    fixResultImages();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

  // Preload images in background
  window.preloadImages = function (urls) {
    urls.forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  };
})();

