// In-App Messaging System with Local Storage & Realistic Bot Personas
import { soundManager } from './audio.js';
import confetti from 'canvas-confetti';

export class ChatEngine {
  constructor(containerElement, onBack) {
    this.container = containerElement;
    this.onBack = onBack;
    this.activePerson = null;
    this.messages = this.loadHistory();
    this.ws = null;
    this.typingTimeout = null;
  }

  loadHistory() {
    try {
      const data = localStorage.getItem('tma_chat_history');
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  saveHistory() {
    try {
      localStorage.setItem('tma_chat_history', JSON.stringify(this.messages));
    } catch {}
  }

  setRealtimeService(service) {
    this.realtimeService = service;
    if (this.realtimeService) {
      this.realtimeService.onChatMessage((msg) => {
        this.handleIncomingPeerMessage(msg);
      });
    }
  }

  openChat(person) {
    this.activePerson = person;
    if (!this.messages[person.id]) {
      this.messages[person.id] = [];
    }
    this.render();
  }

  sendMessage(text) {
    if (!text || !text.trim() || !this.activePerson) return;
    const cleanText = text.trim();

    const msg = {
      id: Date.now(),
      sender: 'me',
      text: cleanText,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'sent'
    };

    this.messages[this.activePerson.id].push(msg);
    this.saveHistory();
    soundManager.playSent();

    // Send real message to real peer
    if (this.realtimeService) {
      this.realtimeService.sendChatMessage(this.activePerson.id, cleanText);
    }

    this.renderMessages();

    // Celebrate first message with confetti
    if (this.messages[this.activePerson.id].length === 1) {
      confetti({
        particleCount: 35,
        spread: 60,
        origin: { y: 0.8 }
      });
    }
  }

  handleIncomingPeerMessage(msg) {
    if (!msg || !msg.fromId || !msg.text) return;
    const senderId = msg.fromId;

    if (!this.messages[senderId]) {
      this.messages[senderId] = [];
    }

    const newMsg = {
      id: msg.timestamp || Date.now(),
      sender: 'peer',
      text: msg.text,
      time: new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'delivered'
    };

    this.messages[senderId].push(newMsg);
    this.saveHistory();
    soundManager.playReceived();

    if (this.activePerson && this.activePerson.id === senderId) {
      this.renderMessages();
    }
  }

  setTypingIndicator(isTyping) {
    const indicator = this.container.querySelector('.chat-typing-indicator');
    if (indicator) {
      indicator.style.display = isTyping ? 'flex' : 'none';
      if (isTyping) {
        this.scrollToBottom();
      }
    }
  }

  scrollToBottom() {
    const list = this.container.querySelector('.chat-messages-scroll');
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }

  render() {
    const p = this.activePerson;
    if (!p) return;

    this.container.innerHTML = `
      <div class="chat-view-wrapper">
        <!-- Chat Header -->
        <div class="chat-header">
          <button class="chat-back-btn" id="chat-back-button" title="Վերադառնալ">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div class="chat-header-profile" id="chat-view-profile-btn">
            <div class="chat-header-avatar">
              <img src="${p.avatarUrl}" alt="${p.name}" />
              <span class="chat-online-dot ${p.online ? 'is-online' : ''}"></span>
            </div>
            <div class="chat-header-info">
              <div class="chat-header-name">${p.name} ${p.statusEmoji || ''}</div>
              <div class="chat-header-status">
                <span class="chat-dist-tag">📍 ${p.distanceMeters} մետր</span> • ${p.online ? 'Օնլայն' : p.lastSeen}
              </div>
            </div>
          </div>
          <a href="https://t.me/${p.username}" target="_blank" class="chat-tg-btn" title="Բացել Telegram-ում">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
            </svg>
          </a>
        </div>

        <!-- Messages Area -->
        <div class="chat-messages-scroll" id="chat-messages-container">
          <!-- Messages will be rendered here -->
        </div>

        <!-- Typing Indicator -->
        <div class="chat-typing-indicator" style="display: none;">
          <div class="typing-bubble">
            <span></span><span></span><span></span>
          </div>
          <span class="typing-text">${p.name.split(' ')[0]}-ը գրում է...</span>
        </div>

        <!-- Quick Icebreaker Chips -->
        <div class="chat-quick-replies">
          <button class="quick-chip" data-msg="👋 Ողջույն, մոտակայքում ես?">👋 Ողջույն, մոտակայքում ես?</button>
          <button class="quick-chip" data-msg="☕ Սուրճի՞ կգնանք միասին">☕ Սուրճի՞ կգնանք</button>
          <button class="quick-chip" data-msg="🚀 Հաճելի է ծանոթանալ!">🚀 Հաճելի է ծանոթանալ</button>
          <button class="quick-chip" data-msg="📍 Որտե՞ղ ես հենց հիմա">📍 Որտե՞ղ ես հիմա</button>
        </div>

        <!-- Chat Input Form -->
        <form class="chat-input-bar" id="chat-form">
          <input
            type="text"
            id="chat-input-field"
            class="chat-text-input"
            placeholder="Գրեք նամակ ${p.name.split(' ')[0]}-ին..."
            autocomplete="off"
          />
          <button type="submit" class="chat-send-btn" id="chat-submit-btn" aria-label="Ուղարկել">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
            </svg>
          </button>
        </form>
      </div>
    `;

    // Listeners
    this.container.querySelector('#chat-back-button').addEventListener('click', () => {
      soundManager.playTap();
      this.onBack();
    });

    const form = this.container.querySelector('#chat-form');
    const input = this.container.querySelector('#chat-input-field');

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.sendMessage(input.value);
      input.value = '';
      input.focus();
    });

    // Quick chips
    this.container.querySelectorAll('.quick-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        soundManager.playTap();
        this.sendMessage(btn.dataset.msg);
      });
    });

    this.renderMessages();
  }

  renderMessages() {
    const container = this.container.querySelector('#chat-messages-container');
    if (!container || !this.activePerson) return;

    const list = this.messages[this.activePerson.id] || [];

    if (list.length === 0) {
      container.innerHTML = `
        <div class="chat-empty-state">
          <div class="empty-icon">💬</div>
          <h4>Դեռ նամակներ չկան</h4>
          <p>Ուղարկեք առաջին նամակը <strong>${this.activePerson.name}</strong>-ին կամ ընտրեք պատրաստի արտահայտություն 👇</p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(m => `
      <div class="message-bubble-row ${m.sender === 'me' ? 'msg-outgoing' : 'msg-incoming'}">
        <div class="message-bubble">
          <div class="message-text">${this.escapeHtml(m.text)}</div>
          <div class="message-meta">
            <span class="message-time">${m.time}</span>
            ${m.sender === 'me' ? '<span class="msg-check">✓✓</span>' : ''}
          </div>
        </div>
      </div>
    `).join('');

    this.scrollToBottom();
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
