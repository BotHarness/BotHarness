export interface CompanionPoint {
  x: number;
  y: number;
  width: number;
  tilt: number;
  squash: number;
  phase: 'rest' | 'drag' | 'fall' | 'land';
}

export class CompanionMotion {
  point: CompanionPoint = { x: 0, y: 0, width: 0, tilt: 0, squash: 0, phase: 'rest' };
  private height = 0;
  private vx = 0;
  private vy = 0;
  private sampledAt = 0;
  private landing = 0;

  measure(width: number, height: number, position: number): CompanionPoint {
    this.height = Math.max(0, height - 120);
    this.vx = 0;
    this.vy = 0;
    this.landing = 0;
    return (this.point = {
      x: this.clampX(position * Math.max(0, width - 104), width),
      y: 0,
      width,
      tilt: 0,
      squash: 0,
      phase: 'rest',
    });
  }

  resize(width: number, height: number): CompanionPoint {
    this.height = Math.max(0, height - 120);
    const x = this.clampX(this.point.x, width);
    const y = Math.min(this.height, this.point.y);
    if (x !== this.point.x) this.vx = 0;
    if (y !== this.point.y && this.vy > 0) this.vy = 0;
    return (this.point = { ...this.point, width, x, y });
  }

  drag(x: number, y: number, now: number, reduced: boolean): CompanionPoint {
    const nextX = this.clampX(x);
    const nextY = Math.max(0, Math.min(this.height, y));
    if (this.point.phase === 'drag') {
      const seconds = Math.max(0.016, (now - this.sampledAt) / 1000);
      this.vx = Math.max(-700, Math.min(700, (nextX - this.point.x) / seconds));
      this.vy = Math.max(-900, Math.min(900, (nextY - this.point.y) / seconds));
    } else {
      this.vx = 0;
      this.vy = 0;
    }
    this.sampledAt = now;
    this.landing = 0;
    return (this.point = {
      ...this.point,
      x: nextX,
      y: nextY,
      tilt: reduced ? 0 : Math.max(-18, Math.min(18, this.vx / 35)),
      squash: reduced ? 0 : -0.055,
      phase: 'drag',
    });
  }

  grab(now: number, reduced: boolean): CompanionPoint {
    this.vx = 0;
    this.vy = 0;
    this.sampledAt = now;
    return (this.point = { ...this.point, tilt: 0, squash: reduced ? 0 : -0.055, phase: 'drag' });
  }

  release(now: number, reduced: boolean, cancelled = false): CompanionPoint {
    if (cancelled || now - this.sampledAt > 120) {
      this.vx = 0;
      this.vy = 0;
    }
    if (reduced) return this.measure(this.point.width, this.height + 120, this.position());
    if (this.point.y === 0 && this.vx === 0 && this.vy === 0) return this.move(this.point.x);
    return (this.point = { ...this.point, phase: 'fall' });
  }

  advance(
    milliseconds: number,
    reduced: boolean,
    walking: boolean,
    direction: number,
  ): CompanionPoint {
    if (this.point.phase === 'drag') {
      if (reduced && (this.point.tilt || this.point.squash))
        return (this.point = { ...this.point, tilt: 0, squash: 0 });
      return this.point;
    }
    if (reduced) {
      if (this.point.phase !== 'rest')
        return this.measure(this.point.width, this.height + 120, this.position());
      return this.point;
    }
    let remaining = Math.min(64, Math.max(0, milliseconds));
    let { x, y, tilt, squash, phase } = this.point;
    while (remaining > 0) {
      const dt = Math.min(16, remaining) / 1000;
      remaining -= dt * 1000;
      if (phase === 'fall') {
        this.vy -= 1900 * dt;
        this.vx *= Math.exp(-2.5 * dt);
        x += this.vx * dt;
        y += this.vy * dt;
        if (x < 8 || x > Math.max(8, this.point.width - 104)) {
          x = this.clampX(x);
          this.vx *= -0.25;
        }
        if (y >= this.height && this.vy > 0) {
          y = this.height;
          this.vy *= -0.2;
        }
        if (y <= 0) {
          y = 0;
          const impact = Math.abs(this.vy);
          this.vy = impact > 100 ? impact * 0.24 : 0;
          squash = Math.min(0.12, impact / 9000);
          if (!this.vy) {
            phase = 'land';
            this.landing = 220;
          }
        }
        tilt += (this.vx / 45 - tilt) * (1 - Math.exp(-9 * dt));
        squash *= Math.exp(-12 * dt);
      } else if (phase === 'land') {
        this.vx *= Math.exp(-16 * dt);
        x = this.clampX(x + this.vx * dt);
        tilt *= Math.exp(-18 * dt);
        squash *= Math.exp(-18 * dt);
        this.landing -= dt * 1000;
        if (this.landing <= 0) {
          phase = 'rest';
          tilt = 0;
          squash = 0;
          this.vx = 0;
        }
      } else if (walking) {
        x = this.clampX(x + direction * 18 * dt);
      }
    }
    if (
      x === this.point.x &&
      y === this.point.y &&
      tilt === this.point.tilt &&
      squash === this.point.squash &&
      phase === this.point.phase
    )
      return this.point;
    return (this.point = { ...this.point, x, y, tilt, squash, phase });
  }

  move(x: number): CompanionPoint {
    this.vx = 0;
    this.vy = 0;
    return (this.point = {
      ...this.point,
      x: this.clampX(x),
      y: 0,
      tilt: 0,
      squash: 0,
      phase: 'rest',
    });
  }

  position(): number {
    return this.point.x / Math.max(1, this.point.width - 104);
  }

  private clampX(x: number, width = this.point.width): number {
    return Math.max(8, Math.min(Math.max(8, width - 104), x));
  }
}
