// TriviaGo — random trivia questions from The Trivia API (free, no key needed).
// Adds a "Trivia" button to the home page and a modal with multiple-choice Q&A.
// https://the-trivia-api.com/docs/
(function () {
  "use strict";

  var TRIVIA_API = "https://the-trivia-api.com/v2/questions?limit=1";
  var state = { question: null, answered: false, score: 0, total: 0 };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Shuffle an array in-place (Fisher-Yates)
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function openModal() {
    var modal = document.getElementById("trivia-modal");
    if (!modal) return;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    loadQuestion();
  }

  function closeModal() {
    var modal = document.getElementById("trivia-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  function loadQuestion() {
    var body = document.getElementById("trivia-body");
    if (!body) return;
    state.answered = false;
    body.innerHTML =
      '<div class="trivia-loading">' +
      '<span class="loading"></span> Loading question…' +
      "</div>";

    fetch(TRIVIA_API)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var q = Array.isArray(data) ? data[0] : data;
        if (!q || !q.question) throw new Error("No question returned");
        state.question = q;
        renderQuestion(q);
      })
      .catch(function (err) {
        body.innerHTML =
          '<p class="trivia-error">Could not load question. Check your connection and try again.</p>' +
          '<button class="trivia-next-btn" id="trivia-retry">Try again</button>';
        var retryBtn = document.getElementById("trivia-retry");
        if (retryBtn) retryBtn.addEventListener("click", loadQuestion);
      });
  }

  function renderQuestion(q) {
    var body = document.getElementById("trivia-body");
    if (!body) return;

    var questionText = q.question && q.question.text ? q.question.text : String(q.question);
    var correct = q.correctAnswer || "";
    var incorrect = Array.isArray(q.incorrectAnswers) ? q.incorrectAnswers : [];
    var answers = shuffle([correct].concat(incorrect));
    var category = q.category || "";
    var difficulty = q.difficulty || "";

    var answersHtml = answers.map(function (a, i) {
      return (
        '<button class="trivia-answer" data-answer="' + esc(a) + '" data-correct="' + esc(correct) + '">' +
        '<span class="trivia-answer-letter">' + String.fromCharCode(65 + i) + "</span>" +
        "<span>" + esc(a) + "</span>" +
        "</button>"
      );
    }).join("");

    body.innerHTML =
      '<div class="trivia-meta">' +
      (category ? '<span class="trivia-category">' + esc(category) + "</span>" : "") +
      (difficulty ? '<span class="trivia-difficulty trivia-diff-' + esc(difficulty) + '">' + esc(difficulty) + "</span>" : "") +
      "</div>" +
      '<p class="trivia-question">' + esc(questionText) + "</p>" +
      '<div class="trivia-answers">' + answersHtml + "</div>" +
      '<div id="trivia-feedback" class="trivia-feedback" hidden></div>' +
      '<div class="trivia-score">Score: <strong id="trivia-score-val">' + state.score + "</strong> / " + state.total + "</div>";

    // Bind answer buttons
    var btns = body.querySelectorAll(".trivia-answer");
    Array.prototype.forEach.call(btns, function (btn) {
      btn.addEventListener("click", function () {
        if (state.answered) return;
        handleAnswer(btn.getAttribute("data-answer"), btn.getAttribute("data-correct"), btns);
      });
    });
  }

  function handleAnswer(chosen, correct, btns) {
    state.answered = true;
    state.total++;
    var isCorrect = chosen === correct;
    if (isCorrect) state.score++;

    // Colour all buttons
    Array.prototype.forEach.call(btns, function (btn) {
      var a = btn.getAttribute("data-answer");
      if (a === correct) {
        btn.classList.add("trivia-correct");
      } else if (a === chosen && !isCorrect) {
        btn.classList.add("trivia-wrong");
      }
      btn.disabled = true;
    });

    // Show feedback
    var feedback = document.getElementById("trivia-feedback");
    if (feedback) {
      feedback.hidden = false;
      feedback.className = "trivia-feedback " + (isCorrect ? "trivia-fb-correct" : "trivia-fb-wrong");
      feedback.innerHTML =
        (isCorrect ? "✓ Correct!" : "✗ Wrong — the answer was <strong>" + esc(correct) + "</strong>") +
        '<button class="trivia-next-btn" id="trivia-next">Next question →</button>';
      var nextBtn = document.getElementById("trivia-next");
      if (nextBtn) nextBtn.addEventListener("click", loadQuestion);
    }

    // Update score display
    var scoreEl = document.getElementById("trivia-score-val");
    if (scoreEl) scoreEl.textContent = String(state.score);
  }

  function injectTriviaButton() {
    // Add "Trivia" button to the home-actions row
    var homeActions = document.querySelector(".home-actions");
    if (!homeActions || document.getElementById("open-trivia")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = "open-trivia";
    btn.textContent = "🎯 Trivia";
    btn.title = "Play random trivia — free, no account needed";
    homeActions.appendChild(btn);
    btn.addEventListener("click", openModal);
  }

  function injectTriviaModal() {
    if (document.getElementById("trivia-modal")) return;
    var modal = document.createElement("div");
    modal.id = "trivia-modal";
    modal.className = "modal-backdrop";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "trivia-title");
    modal.innerHTML =
      '<div class="modal">' +
      '<div class="modal-head">' +
      '<h2 id="trivia-title">🎯 TriviaGo</h2>' +
      '<button class="icon-btn modal-close trivia-close" type="button" aria-label="Close">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"></path></svg>' +
      "</button>" +
      "</div>" +
      '<div class="modal-body" id="trivia-body"></div>' +
      "</div>";
    document.body.appendChild(modal);

    // Close on backdrop click or close button
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
    var closeBtn = modal.querySelector(".trivia-close");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
  }

  function init() {
    injectTriviaModal();
    injectTriviaButton();

    // Also wire up any pre-existing #open-trivia button (e.g. in results view)
    var existingBtn = document.getElementById("open-trivia");
    if (existingBtn && !existingBtn._triviaWired) {
      existingBtn._triviaWired = true;
      existingBtn.addEventListener("click", openModal);
    }

    // Close on Escape
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        var modal = document.getElementById("trivia-modal");
        if (modal && !modal.hidden) closeModal();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
