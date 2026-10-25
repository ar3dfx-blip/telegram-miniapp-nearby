// Radar Canvas Engine: Sonar Sweep, Distance Rings & Interactive Blips
import { soundManager } from './audio.js';

export class RadarEngine {
  constructor(canvasElement, onSelectPerson) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.onSelectPerson = onSelectPerson;

    this.people = [];
    this.maxRadiusMeters = 50;
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
    if (window.ResizeObserver && this.canvas.parentElement) {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas.parentElement);
    }
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
    const parent = this.canvas.parentElement;
    if (!parent) return;

    const rect = parent.getBoundingClientRect();
    // Strictly take the MINIMUM of width and height so the radar is ALWAYS an exact 1:1 circle
    const availableW = rect.width > 0 ? rect.width : 300;
    const availableH = rect.height > 0 ? rect.height : availableW;
    const squareSize = Math.max(160, Math.floor(Math.min(availableW, availableH)));

    const dpr = window.devicePixelRatio || 1;

    this.width = squareSize;
    this.height = squareSize;

    this.canvas.width = Math.round(squareSize * dpr);
    this.canvas.height = Math.round(squareSize * dpr);
    this.canvas.style.width = `${squareSize}px`;
    this.canvas.style.height = `${squareSize}px`;

    this.ctx.resetTransform?.();
    this.ctx.scale(dpr, dpr);
    this.centerX = squareSize / 2;
    this.centerY = squareSize / 2;
    this.radarRadius = (squareSize / 2) - 22;
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
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
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

    // 1. Radar background: Soft tactile neumorphic surface
    const bgGrad = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, radarRadius);
    bgGrad.addColorStop(0, '#f2f3f7');
    bgGrad.addColorStop(0.7, '#eaecf2');
    bgGrad.addColorStop(1, '#dfe2e8');

    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
    ctx.fill();

    // Outer subtle dial bevel stroke
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 2. Concentric distance rings
    const ringSteps = [0.25, 0.5, 0.75, 1.0];
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);

    ringSteps.forEach((step, idx) => {
      const r = radarRadius * step;
      ctx.strokeStyle = idx === ringSteps.length - 1 ? 'rgba(210, 213, 219, 0.95)' : 'rgba(210, 213, 219, 0.65)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
      ctx.stroke();

      // Distance tag
      const val = this.maxRadiusMeters * step;
      const unit = this.lang === 'hy' ? 'մ' : 'm';
      const distLabel = (Number.isInteger(val) ? val : val.toFixed(1)) + unit;
      ctx.fillStyle = '#8c8f94';
      ctx.font = '500 10px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(distLabel, centerX, centerY - r + 12);
    });

    ctx.setLineDash([]);

    // 3. Crosshairs & Axis lines
    ctx.strokeStyle = 'rgba(210, 213, 219, 0.5)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(centerX - radarRadius, centerY);
    ctx.lineTo(centerX + radarRadius, centerY);
    ctx.moveTo(centerX, centerY - radarRadius);
    ctx.lineTo(centerX, centerY + radarRadius);
    ctx.stroke();

    // Compass cardinal markers (Clean N, S, W, E without Armenian abbreviations)
    ctx.font = '600 11px Inter, -apple-system, sans-serif';
    ctx.fillStyle = '#945eff'; // Accent purple for North
    ctx.textAlign = 'center';
    ctx.fillText('N', centerX, centerY - radarRadius - 6);

    ctx.fillStyle = '#8c8f94';
    ctx.fillText('S', centerX, centerY + radarRadius + 15);
    ctx.fillText('W', centerX - radarRadius - 10, centerY + 4);
    ctx.fillText('E', centerX + radarRadius + 10, centerY + 4);

    // 4. Sonar Rotating Sweep Beam (120° Wide Trail with Animated Visual Noise)
    const sweepAngle = (120 * Math.PI) / 180; // Exactly 120 degrees (~2.094 rad)
    const startAngle = this.angle - sweepAngle;
    const endAngle = this.angle;

    ctx.save();
    // Clip strictly to the 120-degree sector
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radarRadius, startAngle, endAngle);
    ctx.closePath();
    ctx.clip();

    // Conic gradient for smooth 120° exponential fade behind the leading edge
    const conic = ctx.createConicGradient(startAngle, centerX, centerY);
    conic.addColorStop(0, 'rgba(148, 94, 255, 0.0)');
    conic.addColorStop(0.08, 'rgba(148, 94, 255, 0.03)');
    conic.addColorStop(0.18, 'rgba(148, 94, 255, 0.09)');
    conic.addColorStop(0.26, 'rgba(165, 120, 255, 0.20)');
    conic.addColorStop(0.31, 'rgba(175, 135, 255, 0.32)');
    conic.addColorStop(0.3333, 'rgba(195, 155, 255, 0.46)');
    conic.addColorStop(0.3334, 'rgba(148, 94, 255, 0.0)');
    conic.addColorStop(1.0, 'rgba(148, 94, 255, 0.0)');

    ctx.fillStyle = conic;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
    ctx.fill();

    // Radial glow overlay near center
    const radialGlow = ctx.createRadialGradient(centerX, centerY, 5, centerX, centerY, radarRadius);
    radialGlow.addColorStop(0, 'rgba(180, 140, 255, 0.25)');
    radialGlow.addColorStop(0.6, 'rgba(148, 94, 255, 0.08)');
    radialGlow.addColorStop(1, 'rgba(148, 94, 255, 0.01)');
    ctx.fillStyle = radialGlow;
    ctx.fill();

    // --- ANIMATED VISUAL NOISE & GRAIN INSIDE SWEEP ---
    // A. Dynamic Phosphor Noise Particles
    const noiseCount = 220;
    for (let i = 0; i < noiseCount; i++) {
      const randAngle = startAngle + Math.random() * sweepAngle;
      const r = 8 + Math.sqrt(Math.random()) * (radarRadius - 10);
      const px = centerX + r * Math.cos(randAngle);
      const py = centerY + r * Math.sin(randAngle);

      const proximity = (randAngle - startAngle) / sweepAngle; // 0 at tail, 1 at leading edge
      const intensity = Math.pow(proximity, 1.3);

      const alpha = (0.12 + Math.random() * 0.75) * intensity * 0.9;
      const size = Math.random() > 0.88 ? 1.8 : (Math.random() > 0.5 ? 1.2 : 0.8);

      ctx.fillStyle = Math.random() > 0.3
        ? `rgba(185, 150, 255, ${alpha})`
        : `rgba(245, 240, 255, ${alpha * 1.3})`;

      ctx.fillRect(px - size / 2, py - size / 2, size, size);
    }

    // B. Flickering Interference Waves & Radar Noise Arcs
    const time = Date.now() * 0.0035;
    for (let i = 0; i < 4; i++) {
      const phase = (time + i * 0.25) % 1;
      const waveR = 15 + phase * (radarRadius - 18);
      const waveAlpha = Math.sin(phase * Math.PI) * 0.24;
      ctx.beginPath();
      ctx.arc(centerX, centerY, waveR, startAngle, endAngle);
      ctx.strokeStyle = `rgba(205, 175, 255, ${waveAlpha})`;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3 + Math.random() * 4, 4 + Math.random() * 6]);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // C. Micro-radial Static Streaks
    for (let i = 0; i < 3; i++) {
      const streakAngle = endAngle - Math.random() * (sweepAngle * 0.7);
      const streakLen = (0.2 + Math.random() * 0.75) * radarRadius;
      const prox = (streakAngle - startAngle) / sweepAngle;
      const streakAlpha = (0.06 + Math.random() * 0.18) * Math.pow(prox, 1.5);
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + streakLen * Math.cos(streakAngle),
        centerY + streakLen * Math.sin(streakAngle)
      );
      ctx.strokeStyle = `rgba(220, 195, 255, ${streakAlpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore(); // End clipping

    // Leading edge glowing sweep line
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(
      centerX + radarRadius * Math.cos(this.angle),
      centerY + radarRadius * Math.sin(this.angle)
    );
    ctx.strokeStyle = 'rgba(165, 120, 255, 0.95)';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = 'rgba(148, 94, 255, 0.75)';
    ctx.shadowBlur = 10;
    ctx.stroke();

    // Center core bright highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#ffffff';
    ctx.stroke();
    ctx.restore();

    // 5. Draw People Blips (Neumorphic coral/purple glowing nodes)
    for (const person of this.people) {
      if (person.distanceMeters > this.maxRadiusMeters) continue;

      const blip = this.getBlipCoordinates(person);

      // Check if sweep beam is currently scanning past this blip
      let diff = this.angle - blip.angleRad;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;

      // When leading edge passes the blip
      if (Math.abs(diff) < 0.12) {
        if (!this.blipPings.has(person.id) || this.blipPings.get(person.id) < 0.2) {
          this.blipPings.set(person.id, 1.0);
        }
      }

      // If blip is within the 120° trailing beam, keep it glowing with the beam
      if (diff >= 0 && diff <= sweepAngle) {
        const trailIntensity = Math.pow(1 - diff / sweepAngle, 1.2);
        const currentPing = this.blipPings.get(person.id) || 0;
        if (trailIntensity > currentPing) {
          this.blipPings.set(person.id, trailIntensity);
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
        ctx.strokeStyle = person.online ? `rgba(255, 94, 94, ${ping * 0.7})` : `rgba(148, 94, 255, ${ping * 0.7})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw 3D blip circle
      const isHovered = this.hoveredPerson?.id === person.id;
      ctx.save();
      ctx.beginPath();
      ctx.arc(blip.x, blip.y, isHovered ? 9.5 : 7, 0, Math.PI * 2);
      ctx.fillStyle = person.online ? '#ff5e5e' : '#945eff';
      ctx.shadowColor = person.online ? 'rgba(255, 94, 94, 0.45)' : 'rgba(148, 94, 255, 0.45)';
      ctx.shadowBlur = isHovered ? 12 : 6;
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();

      // Mini status tag if hovered or very close
      if (isHovered || person.distanceMeters <= 1.2) {
        const nameStr = person.name.split(' ')[0];
        const unit = this.lang === 'hy' ? 'մ' : 'm';
        const dText = (Number.isInteger(person.distanceMeters) ? person.distanceMeters : person.distanceMeters.toFixed(1)) + unit;
        
        ctx.save();
        ctx.font = '600 10px Inter, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        
        // Card pill background
        const textWidth = Math.max(ctx.measureText(nameStr).width, ctx.measureText(dText).width) + 12;
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(210, 213, 219, 0.8)';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.roundRect(blip.x - textWidth / 2, blip.y - 28, textWidth, 18, 6);
        ctx.fill();
        
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#2a2e37';
        ctx.fillText(`${nameStr} • ${dText}`, blip.x, blip.y - 15);
        ctx.restore();
      }
    }

    // 6. Center Knob Dial: 3D circular dial with multi-layer soft concentric shadows
    ctx.save();
    // Radiating user ripple
    const rippleRadius = 13 + (Math.sin(Date.now() / 250) + 1) * 7;
    ctx.beginPath();
    ctx.arc(centerX, centerY, rippleRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148, 94, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Concentric base outer ring (inset shadow illusion)
    ctx.beginPath();
    ctx.arc(centerX, centerY, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(210, 213, 219, 0.35)';
    ctx.fill();

    // Center circular dial badge
    const centerRadius = 14;
    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(210, 213, 219, 0.9)';
    ctx.shadowBlur = 10;
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
      ctx.fillStyle = '#ff5e5e';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(centerX, centerY, centerRadius + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.restore();
  }
}
