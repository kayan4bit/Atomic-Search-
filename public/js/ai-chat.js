// AI Chat interface — client-side chat with OpenRouter backend
(function () {
  "use strict";

  const CHAT_KEY = "atomic.chat-history";
  const MAX_HISTORY = 50;

  // Load chat history from localStorage
  function loadChatHistory() {
    try {
      return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    } catch {
      return [];
    }
  }

  // Save chat history
  function saveChatHistory(history) {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(history.slice(-MAX_HISTORY)));
    } catch {
      /* ignore */
    }
  }

  // Initialize chat modal
  function initChat() {
    const chatBtn = document.getElementById("open-ai-chat");
    const chatModal = document.getElementById("ai-chat-modal");
    const chatClose = document.getElementById("ai-chat-close");
    const chatForm = document.getElementById("ai-chat-form");
    const chatInput = document.getElementById("ai-chat-input");
    const chatMessages = document.getElementById("ai-chat-messages");

    if (!chatBtn || !chatModal) return;

    let history = loadChatHistory();

    // Open chat
    chatBtn.addEventListener("click", () => {
      chatModal.hidden = false;
      chatInput.focus();
      renderChatHistory();
    });

    // Close chat
    chatClose?.addEventListener("click", () => {
      chatModal.hidden = true;
    });

    // Send message
    chatForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const message = chatInput.value.trim();
      if (!message) return;

      // Add user message
      history.push({ role: "user", content: message });
      chatInput.value = "";
      renderChatHistory();

      // Show loading
      const loadingEl = document.createElement("div");
      loadingEl.className = "chat-message loading";
      loadingEl.textContent = "Thinking...";
      chatMessages.appendChild(loadingEl);
      chatMessages.scrollTop = chatMessages.scrollHeight;

      try {
        const response = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: history }),
        });

        const data = await response.json();
        loadingEl.remove();

        if (data.error) {
          const errEl = document.createElement("div");
          errEl.className = "chat-message error";
          errEl.textContent = "Error: " + (data.error || "Unknown error");
          chatMessages.appendChild(errEl);
        } else {
          history.push({ role: "assistant", content: data.response });
          renderChatHistory();
        }
      } catch (err) {
        loadingEl.remove();
        const errEl = document.createElement("div");
        errEl.className = "chat-message error";
        errEl.textContent = "Network error";
        chatMessages.appendChild(errEl);
      }

      saveChatHistory(history);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });

    function renderChatHistory() {
      chatMessages.innerHTML = history
        .map(
          (msg) =>
            `<div class="chat-message ${msg.role}">
              <div class="chat-content">${escapeHtml(msg.content)}</div>
            </div>`
        )
        .join("");
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initChat);
  } else {
    initChat();
  }
})();

