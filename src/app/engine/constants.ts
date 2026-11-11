/**
 * Constants recovered from TETRINET.EXE v1.13 (see docs/ORIGINAL_SPEC.md).
 */

export const FIELD_W = 12;
export const FIELD_H = 22;
export const FIELD_SIZE = FIELD_W * FIELD_H;
export const MAX_PLAYERS = 6;
export const VERSION = '1.13';

/** Empty cell. Normal blocks are '1'..'5', specials are the letters below. */
export const EMPTY = '0';
export const EMPTY_FIELD = EMPTY.repeat(FIELD_SIZE);

/** Order used by the graphics bitmap (tile index = position in this string). */
export const TILE_ORDER = '12345acnrsbgqo';
/** Order used by the field diff encoding (index 0 = empty). */
export const CELL_ORDER = '012345acnrsbgqo';
/** Special letters in frequency-digit order ('1' → a … '9' → o). */
export const SPECIALS = 'acnrsbgqo';

export type SpecialLetter = 'a' | 'c' | 'n' | 'r' | 's' | 'b' | 'g' | 'q' | 'o';

export const SPECIAL_NAMES: Record<SpecialLetter, string> = {
  a: 'Add Line',
  c: 'Clear Line',
  n: 'Nuke Field',
  r: 'Random Blocks Clear',
  s: 'Switch Fields',
  b: 'Clear Special Blocks',
  g: 'Block Gravity',
  q: 'Blockquake',
  o: 'Block Bomb',
};

/**
 * Piece definitions exactly as stored in the original: "WWHH" + cells (row-major, top row first).
 * Index 1..7 = digit used in the piece frequency string.
 */
export const PIECES: readonly string[] = [
  '',
  '04011111', // 1 I
  '02022222', // 2 O
  '0302300333', // 3 J
  '0302004444', // 4 L
  '0302550055', // 5 Z
  '0302011110', // 6 S
  '0302020222', // 7 T
];

/** Blockquake shift-distance table. */
export const QUAKE_TABLE = '3222111111100000000000';

/** Sound ids (index into DEFAULT.TNP [Sounds]). */
export enum Sound {
  HardDrop = 1,
  PieceHitsBottom = 2,
  LineCleared = 3,
  FourLines = 4,
  Rotate = 5,
  SpecialLineCleared = 6,
  YouWon = 7,
  YouLost = 8,
  MessageArrives = 9,
  GameStart = 10,
}

export interface PieceFrequencies {
  I: number;
  O: number;
  J: number;
  L: number;
  Z: number;
  S: number;
  T: number;
}

export interface SpecialFrequencies {
  a: number;
  c: number;
  n: number;
  r: number;
  s: number;
  b: number;
  g: number;
  q: number;
  o: number;
}

export interface ServerSettings {
  stackHeights: [number, number, number, number, number, number];
  startingLevel: number;
  linesPerLevel: number;
  levelIncrease: number;
  linesPerSpecial: number;
  specialsAdded: number;
  specialCapacity: number;
  averagedLevels: boolean;
  classicRules: boolean;
  suddenDeathMinutes: number;
  suddenDeathSeconds: number;
  pieces: PieceFrequencies;
  specials: SpecialFrequencies;
}

/** Defaults from the Delphi form resources (TFORM1 / TFORM3). */
export const DEFAULT_SERVER_SETTINGS: ServerSettings = {
  stackHeights: [0, 0, 0, 0, 0, 0],
  startingLevel: 1,
  linesPerLevel: 2,
  levelIncrease: 1,
  linesPerSpecial: 1,
  specialsAdded: 1,
  specialCapacity: 18,
  averagedLevels: true,
  classicRules: false,
  suddenDeathMinutes: 10,
  suddenDeathSeconds: 10,
  pieces: { I: 15, O: 15, J: 14, L: 14, Z: 14, S: 14, T: 14 },
  specials: { a: 19, c: 16, n: 3, r: 14, s: 3, b: 14, g: 6, q: 11, o: 14 },
};

/** Builds the 100-char piece frequency string in the original's concatenation order. */
export function pieceFreqString(p: PieceFrequencies): string {
  return (
    '3'.repeat(p.J) +
    '5'.repeat(p.Z) +
    '2'.repeat(p.O) +
    '4'.repeat(p.L) +
    '6'.repeat(p.S) +
    '7'.repeat(p.T) +
    '1'.repeat(p.I)
  );
}

export function specialFreqString(s: SpecialFrequencies): string {
  return (
    '1'.repeat(s.a) +
    '2'.repeat(s.c) +
    '3'.repeat(s.n) +
    '4'.repeat(s.r) +
    '5'.repeat(s.s) +
    '6'.repeat(s.b) +
    '7'.repeat(s.g) +
    '8'.repeat(s.q) +
    '9'.repeat(s.o)
  );
}

export function sumValues(o: object): number {
  return Object.values(o).reduce((a: number, b) => a + Number(b), 0);
}
