/**
 * Sound effects (the original 10 WAVs) and background music, mapped like DEFAULT.TNP.
 */
import { effect, inject, Injectable } from '@angular/core';
import { Sound } from '../engine/constants';
import { SettingsService } from './settings.service';
import { ThemeService } from './theme.service';

@Injectable({ providedIn: 'root' })
export class AudioService {
  private readonly settings = inject(SettingsService);
  private readonly theme = inject(ThemeService);
  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<number, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private music: HTMLAudioElement | null = null;
  private musicWanted = false;

  constructor() {
    effect(() => {
      const on = this.settings.music();
      if (!on) this.music?.pause();
      else if (this.musicWanted) void this.music?.play().catch(() => {});
    });
  }

  /** Must be called from a user gesture at least once (browser autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.loading = this.loadAll();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private async loadAll(): Promise<void> {
    const ctx = this.ctx!;
    const t = this.theme.theme;
    await Promise.all(
      Object.entries(t.sounds).map(async ([id, url]) => {
        try {
          const data = await (await fetch(url)).arrayBuffer();
          this.buffers.set(Number(id), await ctx.decodeAudioData(data));
        } catch {
          /* missing sound — ignore like the original */
        }
      }),
    );
  }

  play(s: Sound): void {
    if (!this.settings.sound()) return;
    this.unlock();
    const buf = this.buffers.get(s);
    const ctx = this.ctx;
    if (!ctx) return;
    if (!buf) {
      void this.loading?.then(() => {
        const b = this.buffers.get(s);
        if (b) this.start(ctx, b);
      });
      return;
    }
    this.start(ctx, buf);
  }

  private start(ctx: AudioContext, buf: AudioBuffer): void {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  }

  startMusic(): void {
    this.musicWanted = true;
    if (!this.music) {
      this.music = new Audio(this.theme.theme.music);
      this.music.loop = true;
      this.music.volume = 0.6;
    }
    this.music.currentTime = 0;
    if (this.settings.music()) void this.music.play().catch(() => {});
  }

  stopMusic(): void {
    this.musicWanted = false;
    this.music?.pause();
  }
}
