/**
 * Re-implementation of the Delphi RTL random generator used by the original
 * (RandSeed := RandSeed * $08088405 + 1; Random(n) = (RandSeed * n) shr 32).
 * Each client owns its own generator, exactly like the original; nothing is synchronised.
 */
export class DelphiRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = (seed ?? DelphiRandom.timeSeed()) >>> 0;
  }

  /** Delphi `Randomize`: seeds from the local time of day in milliseconds. */
  static timeSeed(): number {
    const d = new Date();
    const base = ((d.getHours() * 60 + d.getMinutes()) * 60 + d.getSeconds()) * 1000 + d.getMilliseconds();
    // Mix in extra entropy so two browsers started in the same millisecond still differ.
    const extra = (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) & 0xffff0000;
    return (base ^ extra) >>> 0;
  }

  /** Returns an integer 0 <= r < n (Delphi `Random(n)`). */
  next(n: number): number {
    this.seed = (Math.imul(this.seed, 0x08088405) + 1) >>> 0;
    if (n <= 0) return 0;
    // (seed * n) >> 32 without precision loss
    return Math.floor((this.seed / 4294967296) * n);
  }
}
