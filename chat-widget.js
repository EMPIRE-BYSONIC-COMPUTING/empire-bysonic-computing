const chatToggle = document.querySelector('[data-chat-toggle]');
const chatPanel = document.querySelector('[data-chat-panel]');
const chatForm = document.querySelector('[data-chat-form]');
const chatInput = document.querySelector('[data-chat-input]');
const chatMessages = document.querySelector('[data-chat-messages]');
const chatEndpoint = window.BYSONIC_AGENT_API_URL || '/api/chat';

function addMessage(text, sender) {
  const message = document.createElement('p');
  message.className = `chat-message chat-message-${sender}`;
  message.textContent = text;
  chatMessages.append(message);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

chatToggle?.addEventListener('click', () => {
  const isOpen = chatPanel.hidden;
  chatPanel.hidden = !isOpen;
  chatToggle.setAttribute('aria-expanded', String(isOpen));
  if (isOpen) chatInput?.focus();
});

chatForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  addMessage(message, 'user');
  chatInput.value = '';
  chatInput.disabled = true;

  try {
    const response = await fetch(chatEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });
    const result = await response.json();
    addMessage(result.reply || result.error, 'assistant');
  } catch {
    addMessage('I cannot connect right now. Please call +27 81 827 2643.', 'assistant');
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});
