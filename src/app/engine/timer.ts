/**
 * Emulation of the original `TSuperTimer` component: on enable the first fire is at
 * now + Interval, afterwards next = previousFireTime + Interval. Changing Interval does not
 * restart the timer.
 */
export class SuperTimer {
  private _enabled = false;
  private next = 0;

  constructor(
    private readonly scheduler: TimerScheduler,
    public interval: number,
    private readonly onTimer: () => void,
  ) {
    scheduler.register(this);
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(v: boolean) {
    if (v === this._enabled) return;
    this._enabled = v;
    if (v) this.next = this.scheduler.now() + this.interval;
  }

  /** @internal called by the scheduler. Returns true if it fired. */
  poll(now: number): boolean {
    if (!this._enabled || now < this.next) return false;
    this.next += Math.max(1, this.interval);
    // Do not try to catch up more than a second (e.g. after a background tab was throttled).
    if (now - this.next > 1000) this.next = now + this.interval;
    this.onTimer();
    return true;
  }
}

export class TimerScheduler {
  private timers: SuperTimer[] = [];
  private handle: ReturnType<typeof setInterval> | null = null;

  now(): number {
    return performance.now();
  }

  register(t: SuperTimer): void {
    this.timers.push(t);
  }

  start(): void {
    if (this.handle !== null) return;
    this.handle = setInterval(() => this.tick(), 4);
  }

  stop(): void {
    if (this.handle !== null) clearInterval(this.handle);
    this.handle = null;
  }

  tick(): void {
    const now = this.now();
    // Process due timers; fast timers (1–10 ms at high levels) may fire several times per tick.
    for (let guard = 0; guard < 64; guard++) {
      let fired = false;
      for (const t of this.timers) fired = t.poll(now) || fired;
      if (!fired) break;
    }
  }
}
