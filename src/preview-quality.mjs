export const PREVIEW_WIDTHS = [1920, 1600, 1280, 960, 640];

// Time-based hysteresis; measurements are reset whenever preview work is interrupted.
export class PreviewQuality {
  tier = 0;
  average = 1000 / 60;
  slow = 0;
  fast = 0;
  cooldown = 0;
  reset() { this.average = 1000 / 60; this.slow = this.fast = 0; this.cooldown = 5000; }
  sample(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return false;
    const delta = Math.min(milliseconds, 100);
    this.average += (milliseconds - this.average) * .05;
    this.cooldown = Math.max(0, this.cooldown - delta);
    this.slow = this.average > 20 ? this.slow + delta : 0;
    this.fast = this.average < 17.5 ? this.fast + delta : 0;
    if (this.cooldown) return false;
    const next = this.slow >= 2000 ? Math.min(4, this.tier + 1) : this.fast >= 5000 ? Math.max(0, this.tier - 1) : this.tier;
    if (next === this.tier) return false;
    this.tier = next;
    this.reset();
    return true;
  }
  get width() { return PREVIEW_WIDTHS[this.tier]; }
}
