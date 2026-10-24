// Haptic Feedback Engine using Telegram WebApp SDK (Completely Silent, Zero Audio Noise)

class SoundManager {
  constructor() {
    this.hapticEnabled = true;
  }

  // Telegram Haptic Feedback trigger (Silent tactile sensation on mobile)
  triggerHaptic(type = 'light') {
    if (!this.hapticEnabled) return;
    try {
      const tg = window.Telegram?.WebApp;
      if (tg?.HapticFeedback) {
        if (type === 'selection') {
          tg.HapticFeedback.selectionChanged();
        } else if (type === 'success') {
          tg.HapticFeedback.notificationOccurred('success');
        } else if (type === 'warning') {
          tg.HapticFeedback.notificationOccurred('warning');
        } else if (type === 'error') {
          tg.HapticFeedback.notificationOccurred('error');
        } else {
          tg.HapticFeedback.impactOccurred(type);
        }
      } else if (navigator.vibrate) {
        navigator.vibrate(type === 'heavy' ? 30 : 10);
      }
    } catch {
      // Ignore vibration errors if unsupported
    }
  }

  // Silent no-op methods to prevent any sound or oscillator noise
  playSonarPing() {}
  playSent() {
    this.triggerHaptic('light');
  }
  playReceived() {
    this.triggerHaptic('medium');
  }
  playTap() {
    this.triggerHaptic('selection');
  }
}

export const soundManager = new SoundManager();
