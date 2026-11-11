/**
 * Theme = the web version of a TetriNET ".tnp" project file: where the graphics, sounds and
 * music live. To make a new theme, copy public/assets/default to a new folder, replace files
 * (keeping the same bitmap layout, see TETRINET.TXT "Explanations of Graphics"), and add it here.
 */
import { Injectable, signal } from '@angular/core';
import { TILE_ORDER } from '../engine/constants';

export interface Theme {
  name: string;
  /** 288x376 bitmap with the original block layout. */
  bitmap: string;
  music: string;
  /** Sound id (1..10) → url */
  sounds: Record<number, string>;
}

const base = 'assets/default/';
export const DEFAULT_THEME: Theme = {
  name: 'TetriNET (original)',
  bitmap: base + 'tnetblks.png',
  music: base + 'music.mp3',
  sounds: {
    1: base + 'sounds/1.wav', // immediate_piece_drop
    2: base + 'sounds/2.wav', // piece_hits_bottom
    3: base + 'sounds/3.wav', // line_cleared
    4: base + 'sounds/4.wav', // four_lines_cleared
    5: base + 'sounds/5.wav', // rotate_piece
    6: base + 'sounds/6.wav', // line_with_specialblock_cleared
    7: base + 'sounds/7.wav', // you_won
    8: base + 'sounds/8.wav', // you_lost
    9: base + 'sounds/9.wav', // message_arrives
    10: base + 'sounds/10.wav', // game_start
  },
};

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = DEFAULT_THEME;
  /** Loaded sprite sheet (null until ready). */
  readonly sheet = signal<HTMLImageElement | null>(null);

  constructor() {
    const img = new Image();
    img.onload = () => this.sheet.set(img);
    img.src = this.theme.bitmap;
  }

  /** Tile source rectangle for a cell char on the big (16px) or small (8px) field. */
  static tile(ch: string, small: boolean): { sx: number; sy: number; s: number } | null {
    const i = TILE_ORDER.indexOf(ch);
    if (i < 0) return null;
    return small ? { sx: i * 8, sy: 16, s: 8 } : { sx: i * 16, sy: 0, s: 16 };
  }

  /** Background image areas (big field at (0,24) 192x352, small at (192,24) 96x176). */
  static background(small: boolean): { sx: number; sy: number; w: number; h: number } {
    return small ? { sx: 192, sy: 24, w: 96, h: 176 } : { sx: 0, sy: 24, w: 192, h: 352 };
  }
}
