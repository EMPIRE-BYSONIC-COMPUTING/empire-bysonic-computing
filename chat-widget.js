const chatToggle = document.querySelector('[data-chat-toggle]');
const chatPanel = document.querySelector('[data-chat-panel]');
const chatForm = document.querySelector('[data-chat-form]');
const chatInput = document.querySelector('[data-chat-input]');
const chatMessages = document.querySelector('[data-chat-messages]');

function getLocalReply(message) {
  const normalizedMessage = message.toLowerCase();

  if (/hello|hi|hey|good morning|good afternoon/.test(normalizedMessage)) {
    return 'Hello. I can help with repairs, diagnostics, upgrades, quotations, and bookings.';
  }
  if (/price|cost|quote|quotation/.test(normalizedMessage)) {
    return 'Prices depend on the device and fault. Please use the Quotation or Intake Form page, or call +27 81 827 2643 for an assessment.';
  }
  if (/screen|display|lcd/.test(normalizedMessage)) {
    return 'We provide laptop screen and display replacement services. Please use the Screen Repairs page or contact us for an assessment.';
  }
  if (/slow|diagnos|virus|problem|fault|not working|repair/.test(normalizedMessage)) {
    return 'We help with laptop and desktop repairs, hardware diagnostics, software problems, and performance issues. Please complete the Intake Form.';
  }
  if (/ram|memory|ssd|hard drive|upgrade|storage/.test(normalizedMessage)) {
    return 'We provide RAM, SSD, hard-drive, and other component upgrades. Please use the Upgrades page to see the available services.';
  }
  if (/port|charger|charging|power/.test(normalizedMessage)) {
    return 'We provide charging-port and power-related repair services. Please contact us for an assessment before ordering parts.';
  }
  if (/book|booking|appointment|intake/.test(normalizedMessage)) {
    return 'Please complete the Intake Form with your device details, or call +27 81 827 2643 to arrange assistance.';
  }
  if (/contact|phone|number|whatsapp|call/.test(normalizedMessage)) {
    return 'You can reach Empire Bysonic Computing on +27 81 827 2643.';
  }
  if (/where|location|area|cape town|southern suburbs/.test(normalizedMessage)) {
    return 'Empire Bysonic Computing serves the Southern Suburbs, Cape Town, Western Cape.';
  }

  return 'I can help with repairs, diagnostics, screens, charging ports, RAM, SSD upgrades, quotations, and bookings. What do you need help with?';
}

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

chatForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  addMessage(message, 'user');
  chatInput.value = '';
  chatInput.disabled = true;

  window.setTimeout(() => {
    addMessage(getLocalReply(message), 'assistant');
    chatInput.disabled = false;
    chatInput.focus();
  }, 250);
});
