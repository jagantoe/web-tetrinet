/**
 * Canvas renderers using the original tile bitmap (tnetblks).
 */
import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, input, viewChild } from '@angular/core';
import { FIELD_H, FIELD_W } from '../engine/constants';
import { pieceCell, pieceH, pieceW } from '../engine/field';
import { FallingPiece, PlayerEngine } from '../engine/player-engine';
import { ThemeService } from '../services/theme.service';

/** A playing field: big (16px tiles, 192x352) or small (8px, 96x176). */
@Component({
  selector: 'app-field-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c></canvas>`,
  styles: `:host { position: absolute; display: block; background: #000; }`,
})
export class FieldCanvas {
  private readonly theme = inject(ThemeService);
  readonly field = input.required<string>();
  readonly piece = input<FallingPiece | null>(null);
  readonly small = input(false);
  readonly team = input('');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');

  constructor() {
    effect(() => {
      const sheet = this.theme.sheet();
      const small = this.small();
      const el = this.canvas().nativeElement;
      // Size imperatively: a template [width] binding applied after drawing would clear the canvas.
      if (el.width !== (small ? 96 : 192)) el.width = small ? 96 : 192;
      if (el.height !== (small ? 176 : 352)) el.height = small ? 176 : 352;
      const ctx = el.getContext('2d')!;
      const field = PlayerEngine.withPiece(this.field(), this.piece());
      const team = this.team();
      const s = small ? 8 : 16;
      ctx.imageSmoothingEnabled = false;
      const bg = ThemeService.background(small);
      if (sheet) ctx.drawImage(sheet, bg.sx, bg.sy, bg.w, bg.h, 0, 0, bg.w, bg.h);
      else {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, s * FIELD_W, s * FIELD_H);
      }
      for (let y = 0; y < FIELD_H; y++) {
        for (let x = 0; x < FIELD_W; x++) {
          const t = ThemeService.tile(field.charAt(y * FIELD_W + x), small);
          if (!t) continue;
          if (sheet) ctx.drawImage(sheet, t.sx, t.sy, t.s, t.s, x * s, y * s, s, s);
        }
      }
      if (team) {
        // Team name at (1,1), Arial 7pt, white.
        ctx.font = '9px Arial';
        ctx.textBaseline = 'top';
        const w = ctx.measureText(team).width;
        ctx.fillStyle = '#000';
        ctx.fillRect(1, 1, w + 2, 11);
        ctx.fillStyle = '#fff';
        ctx.fillText(team, 2, 2);
      }
    });
  }
}

/** Next Piece box (cnextpiece 64x66): drawn at the top-left of a grid of 16px tiles. */
@Component({
  selector: 'app-next-piece',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c width="64" height="66"></canvas>`,
  styles: `:host { position: absolute; display: block; }`,
})
export class NextPieceCanvas {
  private readonly theme = inject(ThemeService);
  readonly piece = input('');
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');

  constructor() {
    effect(() => {
      const sheet = this.theme.sheet();
      const p = this.piece();
      const ctx = this.canvas().nativeElement.getContext('2d')!;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 64, 66);
      if (!p || !sheet) return;
      for (let r = 0; r < pieceH(p); r++) {
        for (let c = 0; c < pieceW(p); c++) {
          const t = ThemeService.tile(pieceCell(p, r, c), false);
          if (t) ctx.drawImage(sheet, t.sx, t.sy, 16, 16, c * 16, r * 16, 16, 16);
        }
      }
    });
  }
}

/** Special-block inventory bar (sbpb 288x16 = 18 slots). */
@Component({
  selector: 'app-inventory',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas #c width="288" height="16"></canvas>`,
  styles: `:host { position: absolute; display: block; }`,
})
export class InventoryCanvas {
  private readonly theme = inject(ThemeService);
  readonly inventory = input('');
  readonly capacity = input(18);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('c');

  constructor() {
    effect(() => {
      const sheet = this.theme.sheet();
      const inv = this.inventory();
      const cap = this.capacity();
      const ctx = this.canvas().nativeElement.getContext('2d')!;
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(0, 0, 288, 16);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, cap * 16, 16);
      if (!sheet) return;
      for (let i = 0; i < inv.length && i < 18; i++) {
        const t = ThemeService.tile(inv.charAt(i), false);
        if (t) ctx.drawImage(sheet, t.sx, t.sy, 16, 16, i * 16, 0, 16, 16);
      }
    });
  }
}

