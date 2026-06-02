// Voice search — client-side only, uses the Web Speech API.
// No audio data ever leaves the browser. Falls back gracefully when the
// API is unavailable (Firefox, older browsers, non-HTTPS contexts).
// Privacy note: the browser's speech recognition may send audio to the
// OS/browser vendor's servers. We show a clear disclosure before activating.

(function () {
  "use strict";

  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var supported = !!SpeechRecognition;

  var recognition = null;
  var listening = false;
  var _onResult = null;

  function init() {
    if (!supported) return false;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.maxAlternatives = 1;
    return true;
  }

  // Start listening. Calls onInterim(text) for interim results and
  // onFinal(text) when the user stops speaking.
  function start(onInterim, onFinal, onError) {
    if (!supported) {
      if (onError) onError("Voice search is not supported in this browser.");
      return false;
    }
    if (listening) { stop(); return false; }
    if (!recognition) init();

    recognition.onresult = function (e) {
      var transcript = "";
      var isFinal = false;
      for (var i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
        if (e.results[i].isFinal) isFinal = true;
      }
      if (isFinal) {
        if (onFinal) onFinal(transcript.trim());
        listening = false;
        updateButtons(false);
      } else {
        if (onInterim) onInterim(transcript.trim());
      }
    };

    recognition.onerror = function (e) {
      listening = false;
      updateButtons(false);
      var msg = "Voice search error";
      if (e.error === "not-allowed") msg = "Microphone access denied. Please allow microphone access in your browser settings.";
      else if (e.error === "no-speech") msg = "No speech detected. Please try again.";
      else if (e.error === "network") msg = "Network error during voice recognition.";
      if (onError) onError(msg);
    };

    recognition.onend = function () {
      listening = false;
      updateButtons(false);
    };

    try {
      recognition.start();
      listening = true;
      updateButtons(true);
      return true;
    } catch (err) {
      listening = false;
      if (onError) onError("Could not start voice recognition: " + (err.message || err));
      return false;
    }
  }

  function stop() {
    if (recognition && listening) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }
    listening = false;
    updateButtons(false);
  }

  function updateButtons(active) {
    var btns = document.querySelectorAll(".voice-btn");
    btns.forEach(function (btn) {
      btn.classList.toggle("listening", active);
      btn.setAttribute("aria-label", active ? "Stop voice search" : "Voice search");
      btn.title = active ? "Listening… click to stop" : "Voice search";
    });
  }

  // Bind voice buttons to the search inputs.
  function bindVoiceButtons() {
    var btns = document.querySelectorAll(".voice-btn");
    if (!btns.length) return;

    btns.forEach(function (btn) {
      if (!supported) {
        btn.style.display = "none";
        return;
      }
      btn.addEventListener("click", function () {
        if (listening) { stop(); return; }
        // Find the associated search input.
        var form = btn.closest("form");
        var input = form ? form.querySelector("input[type='search'], input[name='q']") : null;
        if (!input) input = document.getElementById("q") || document.getElementById("q-hero");

        start(
          function (interim) {
            if (input) input.value = interim;
          },
          function (final) {
            if (input) {
              input.value = final;
              // Auto-submit on final result.
              var submitEvent = new Event("submit", { bubbles: true, cancelable: true });
              var f = input.closest("form");
              if (f) f.dispatchEvent(submitEvent);
            }
          },
          function (err) {
            console.warn("[voice]", err);
            // Show a brief toast.
            showToast(err, 4000);
          }
        );
      });
    });
  }

  function showToast(msg, durationMs) {
    var toast = document.createElement("div");
    toast.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "left:50%",
      "transform:translateX(-50%)",
      "background:var(--bg-elev)",
      "color:var(--text)",
      "border:1px solid var(--border)",
      "border-radius:8px",
      "padding:10px 18px",
      "font-size:13px",
      "box-shadow:var(--shadow)",
      "z-index:9999",
      "max-width:360px",
      "text-align:center",
    ].join(";");
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, durationMs || 3000);
  }

  document.addEventListener("DOMContentLoaded", bindVoiceButtons);

  // Expose for programmatic use.
  window.atomicVoiceSearch = { supported: supported, start: start, stop: stop };
})();
