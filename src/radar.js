// Radar Canvas Engine: Sonar Sweep, Distance Rings & Interactive Blips
import { soundManager } from './audio.js';

export class RadarEngine {
  constructor(canvasElement, onSelectPerson) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onSelectPerson = onSelectPerson;

    this.people = [];
    this.maxRadiusMeters = 10;
    this.lang = 'hy';
    this.angle = 0; // Sweep angle in radians
    this.sweepSpeed = 0.025; // Rotation speed
    this.animId = null;
    this.hoveredPerson = null;

    this.blipPings = new Map(); // personId -> ping intensity (1.0 to 0.0)

    this.logoImg = new Image();
    this.logoImg.src = './logo.png';

    this.setupListeners();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setupListeners() {
    this.canvas.addEventListener('mousemove', (e) => this.handlePointerMove(e));
    this.canvas.addEventListener('click', (e) => this.handlePointerClick(e));
    this.canvas.addEventListener('mouseleave', () => {
      this.hoveredPerson = null;
    });

    // Touch support for mobile Telegram WebApp
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = this.canvas.getBoundingClientRect();
        const clientX = touch.clientX - rect.left;
        const clientY = touch.clientY - rect.top;
        const person = this.findPersonAtPoint(clientX, clientY);
        if (person) {
          soundManager.playTap();
          this.onSelectPerson(person);
        }
      }
    }, { passive: true });
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, 480);
    const dpr = window.devicePixelRatio || 1;

    this.width = size;
    this.height = size;

    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;

    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
    this.centerX = size / 2;
    this.centerY = size / 2;
    this.radarRadius = (size / 2) - 24;
  }

  setPeople(people, maxRadius = 500) {
    this.people = people;
    this.maxRadiusMeters = maxRadius;
  }

  setLanguage(lang) {
    this.lang = lang;
  }

  setMaxRadius(radius) {
    this.maxRadiusMeters = radius;
  }

  start() {
    if (this.animId) cancelAnimationFrame(this.animId);
    const loop = () => {
      this.draw();
      this.angle = (this.angle + this.sweepSpeed) % (Math.PI * 2);
      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
  }

  // Find person blip at cursor coordinates
  findPersonAtPoint(cx, cy) {
    for (const p of this.people) {
      if (p.distanceMeters > this.maxRadiusMeters) continue;
      const blip = this.getBlipCoordinates(p);
      const dist = Math.hypot(cx - blip.x, cy - blip.y);
      if (dist <= 18) {
        return p;
      }
    }
    return null;
  }

  handlePointerMove(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const found = this.findPersonAtPoint(x, y);
    if (found !== this.hoveredPerson) {
      this.hoveredPerson = found;
      this.canvas.style.cursor = found ? 'pointer' : 'default';
      if (found) soundManager.triggerHaptic('selection');
    }
  }

  handlePointerClick(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const found = this.findPersonAtPoint(x, y);
    if (found) {
      soundManager.playTap();
      this.onSelectPerson(found);
    }
  }

  getBlipCoordinates(person) {
    // Bearing is 0 (North), 90 (East), 180 (South), 270 (West)
    // In math angles: 0 deg North is -PI/2
    const angleRad = ((person.bearing - 90) * Math.PI) / 180;
    const distRatio = Math.min(person.distanceMeters / this.maxRadiusMeters, 1);
    const r = distRatio * this.radarRadius;

    return {
      x: this.centerX + r * Math.cos(angleRad),
      y: this.centerY + r * Math.sin(angleRad),
      angleRad
    };
  }

  draw() {
    const ctx = this.ctx;
    const { centerX, centerY, radarRadius, width, height } = this;

    ctx.clearRect(0, 0, width, height);

    // 1. Radar background glow & container
    const bgGrad = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, radarRadius);
    bgGrad.addColorStop(0, 'rgba(10, 25, 45, 0.95)');
    bgGrad.addColorStop(0.7, 'rgba(8, 20, 36, 0.85)');
    bgGrad.addColorStop(1, 'rgba(5, 12, 22, 0.9)');

    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Concentric distance rings
    const ringSteps = [0.25, 0.5, 0.75, 1.0];
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);

    ringSteps.forEach((step, idx) => {
      const r = radarRadius * step;
      ctx.strokeStyle = idx === ringSteps.length - 1 ? 'rgba(36, 161, 222, 0.45)' : 'rgba(36, 161, 222, 0.2)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();

      // Distance tag
      const val = this.maxRadiusMeters * step;
      const unit = this.lang === 'hy' ? 'մ' : this.lang === 'ru' ? 'м' : 'm';
      const distLabel = (Number.isInteger(val) ? val : val.toFixed(1)) + unit;
      ctx.fillStyle = 'rgba(36, 161, 222, 0.75)';
      ctx.font = '10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(distLabel, centerX, centerY - r + 12);
    });

    ctx.setLineDash([]);

    // 3. Crosshairs & Axis lines
    ctx.strokeStyle = 'rgba(36, 161, 222, 0.18)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(centerX - radarRadius, centerY);
    ctx.lineTo(centerX + radarRadius, centerY);
    ctx.moveTo(centerX, centerY - radarRadius);
    ctx.lineTo(centerX, centerY + radarRadius);
    ctx.stroke();

    // Compass cardinal markers
    const nLabel = this.lang === 'ru' ? 'С (N)' : this.lang === 'en' ? 'N' : 'ՀՍ (N)';
    const sLabel = this.lang === 'ru' ? 'Ю (S)' : this.lang === 'en' ? 'S' : 'ՀՎ (S)';
    const wLabel = this.lang === 'ru' ? 'З (W)' : this.lang === 'en' ? 'W' : 'ԱՐՄ (W)';
    const eLabel = this.lang === 'ru' ? 'В (E)' : this.lang === 'en' ? 'E' : 'ԱՐԼ (E)';

    ctx.font = 'bold 11px -apple-system, sans-serif';
    ctx.fillStyle = '#24a1de';
    ctx.textAlign = 'center';
    ctx.fillText(nLabel, centerX, centerY - radarRadius - 6);
    ctx.fillText(sLabel, centerX, centerY + radarRadius + 15);
    ctx.fillText(wLabel, centerX - radarRadius - 10, centerY + 4);
    ctx.fillText(eLabel, centerX + radarRadius + 12, centerY + 4);

    // 4. Sonar Rotating Sweep Beam
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radarRadius, this.angle - 0.4, this.angle);
    ctx.closePath();

    const sweepGrad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radarRadius);
    sweepGrad.addColorStop(0, 'rgba(0, 229, 255, 0.45)');
    sweepGrad.addColorStop(1, 'rgba(36, 161, 222, 0.02)');
    ctx.fillStyle = sweepGrad;
    ctx.fill();

    // Sweep leading edge bright line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + radarRadius * Math.cos(this.angle),
      centerY + radarRadius * Math.sin(this.angle)
    );
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    // 5. Draw People Blips
    for (const person of this.people) {
      if (person.distanceMeters > this.maxRadiusMeters) continue;

      const blip = this.getBlipCoordinates(person);

      // Check if sweep beam is currently scanning past this blip
      let diff = this.angle - blip.angleRad;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      if (Math.abs(diff) < 0.08) {
        if (!this.blipPings.has(person.id) || this.blipPings.get(person.id) < 0.1) {
          this.blipPings.set(person.id, 1.0);
        }
      }

      // Decay ping intensity
      let ping = this.blipPings.get(person.id) || 0;
      if (ping > 0) {
        this.blipPings.set(person.id, Math.max(0, ping - 0.02));
      }

      // Draw blip ping wave
      if (ping > 0.05) {
        ctx.beginPath();
        ctx.arc(blip.x, blip.y, 8 + (1 - ping) * 22, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 255, 170, ${ping * 0.8})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw blip circle
      const isHovered = this.hoveredPerson?.id === person.id;
      ctx.save();
      ctx.beginPath();
      ctx.arc(blip.x, blip.y, isHovered ? 9 : 6.5, 0, Math.PI * 2);
      ctx.fillStyle = person.online ? '#00e676' : '#24a1de';
      ctx.shadowColor = person.online ? '#00e676' : '#24a1de';
      ctx.shadowBlur = isHovered ? 14 : 7;
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();

      // Mini status tag or distance if hovered or very close
      if (isHovered || person.distanceMeters <= 1.2) {
        ctx.font = 'bold 9px -apple-system, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(person.name.split(' ')[0], blip.x, blip.y - 12);
        const unit = this.lang === 'hy' ? 'մ' : this.lang === 'ru' ? 'м' : 'm';
        const dText = (Number.isInteger(person.distanceMeters) ? person.distanceMeters : person.distanceMeters.toFixed(1)) + unit;
        ctx.fillText(dText, blip.x, blip.y + 17);
        ctx.shadowBlur = 0;
      }
    }

    // 6. Draw Center Dot (User Location with Peach App Logo)
    ctx.save();
    // Radiating peach & cyan neon user ripple
    const rippleRadius = 13 + (Math.sin(Date.now() / 250) + 1) * 7;
    ctx.beginPath();
    ctx.arc(centerX, centerY, rippleRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 140, 105, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center circular badge with glowing shadow
    const centerRadius = 12;
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 140, 105, 0.7)';
    ctx.shadowBlur = 12;
    ctx.fill();

    if (this.logoImg && this.logoImg.complete && this.logoImg.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(
        this.logoImg,
        centerX - centerRadius,
        centerY - centerRadius,
        centerRadius * 2,
        centerRadius * 2
      );
      ctx.restore();
    } else {
      ctx.beginPath();
      ctx.arc(centerX, centerY, centerRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#ff8a65';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }
}
