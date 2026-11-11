/**
 * Pure field & piece operations, ported 1:1 from TETRINET.EXE v1.13.
 * A field is a string of FIELD_W * FIELD_H cell characters, row-major, row 0 = top.
 * Piece coordinates (px, py) are 1-based like the original (top-left of the bounding box).
 */
import { CELL_ORDER, EMPTY, EMPTY_FIELD, FIELD_H, FIELD_SIZE, FIELD_W, QUAKE_TABLE, SPECIALS } from './constants';
import { DelphiRandom } from './random';

const W = FIELD_W;
const H = FIELD_H;

// ---------------------------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------------------------

export function pieceW(p: string): number {
  return parseInt(p.substring(0, 2), 10);
}
export function pieceH(p: string): number {
  return parseInt(p.substring(2, 4), 10);
}
/** Cell of a piece, r/c 0-based. */
export function pieceCell(p: string, r: number, c: number): string {
  return p.charAt(4 + r * pieceW(p) + c);
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

/** One clockwise rotation (0x441b70 inner loop). */
export function rotateCW(p: string): string {
  const w = pieceW(p);
  const h = pieceH(p);
  let cells = '';
  for (let col = 0; col < w; col++) {
    for (let row = h - 1; row >= 0; row--) {
      cells += p.charAt(4 + row * w + col);
    }
  }
  return pad2(h) + pad2(w) + cells;
}

/** `Rotate(p, n)`: performs n-1 clockwise rotations. */
export function rotate(p: string, n: number): string {
  let r = p;
  for (let i = 1; i < n; i++) r = rotateCW(r);
  return r;
}

// ---------------------------------------------------------------------------------------------
// Field primitives
// ---------------------------------------------------------------------------------------------

export function idx(x: number, y: number): number {
  return y * W + x;
}

export function isSpecial(c: string): boolean {
  return SPECIALS.includes(c);
}

export function isBlock(c: string): boolean {
  return c >= '1' && c <= '5';
}

/** `Collides(x, y, piece)` 0x441a44 (x, y 1-based). */
export function collides(field: string, x: number, y: number, p: string): boolean {
  const w = pieceW(p);
  const h = pieceH(p);
  if (x + w - 1 > W || y + h - 1 > H || x < 1 || y < 1) return true;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (pieceCell(p, r, c) !== EMPTY && field.charAt((y - 1 + r) * W + (x - 1 + c)) !== EMPTY) return true;
    }
  }
  return false;
}

/** `PlacePiece` 0x441d00: overwrite field with the piece's cells. */
export function placePiece(field: string, p: string, x: number, y: number): string {
  const a = field.split('');
  const w = pieceW(p);
  const h = pieceH(p);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const ch = pieceCell(p, r, c);
      if (ch === EMPTY) continue;
      const fx = x - 1 + c;
      const fy = y - 1 + r;
      if (fx >= 0 && fx < W && fy >= 0 && fy < H) a[idx(fx, fy)] = ch;
    }
  }
  return a.join('');
}

export interface LineClearResult {
  field: string;
  lines: number;
  /** Specials found in the cleared rows, in scan order (top → bottom, left → right). */
  specials: string;
}

/** Line detection & removal part of `CheckLines` 0x44931c. */
export function clearLines(field: string): LineClearResult {
  const rows: string[] = [];
  for (let y = 0; y < H; y++) rows.push(field.substring(y * W, y * W + W));
  let lines = 0;
  let specials = '';
  for (let y = 0; y < H; y++) {
    if (!rows[y]!.includes(EMPTY)) {
      lines++;
      for (const ch of rows[y]!) if (isSpecial(ch)) specials += ch;
      rows.splice(y, 1);
      rows.unshift(EMPTY.repeat(W));
    }
  }
  return { field: rows.join(''), lines, specials };
}

/** `AddSpecials(count)` 0x44756c. */
export function addSpecials(field: string, count: number, specialFreq: string, rnd: DelphiRandom): string {
  const a = field.split('');
  const list: number[] = [];
  for (let i = 0; i < FIELD_SIZE; i++) if (isBlock(field.charAt(i))) list.push(i);
  for (let n = 0; n < count; n++) {
    if (list.length > 0) {
      const k = rnd.next(list.length);
      const pos = list[k]!;
      a[pos] = specialFromDigit(specialFreq, rnd);
      list.splice(k, 1);
    } else {
      const x = rnd.next(W);
      a[(H - 1) * W + x] = specialFromDigit(specialFreq, rnd);
    }
  }
  return a.join('');
}

function specialFromDigit(specialFreq: string, rnd: DelphiRandom): string {
  const d = parseInt(specialFreq.charAt(rnd.next(100)) || '1', 10);
  return SPECIALS.charAt(d - 1) || 'a';
}

/** `Height(F)` 0x4485b0: number of rows from the highest occupied row to the bottom. */
export function stackHeight(field: string): number {
  for (let i = 0; i < FIELD_SIZE; i++) {
    if (field.charAt(i) !== EMPTY) return H - Math.floor(i / W);
  }
  return 0;
}

/** Field lowering used by Switch Fields: never higher than 16 rows. */
export function lowerField(field: string): string {
  const h = stackHeight(field);
  if (h > 16) {
    const k = h - 16;
    return EMPTY.repeat(k * W) + field.substring(0, FIELD_SIZE - k * W);
  }
  return field;
}

/** `GenGarbage(h)` 0x442d40 — starting stack height. */
export function generateGarbage(height: number, rnd: DelphiRandom): string {
  const a = EMPTY_FIELD.split('');
  for (let y = H - height; y < H; y++) {
    for (let x = 0; x < W; x++) a[idx(x, y)] = String(rnd.next(6));
    a[idx(rnd.next(W), y)] = EMPTY;
  }
  return a.join('');
}

/** Field after losing: every cell becomes a random coloured block. */
export function lostField(rnd: DelphiRandom): string {
  let s = '';
  for (let i = 0; i < FIELD_SIZE; i++) s += String(rnd.next(5) + 1);
  return s;
}

// ---------------------------------------------------------------------------------------------
// Special effects (applied to the own field)
// ---------------------------------------------------------------------------------------------

export interface EffectResult {
  field: string;
  /** The add-line pushed blocks out of the top of the field → player loses. */
  lost?: boolean;
}

/** `a` Add Line 0x447bdc. */
export function specialAddLine(field: string, rnd: DelphiRandom): EffectResult {
  const ok = field.substring(0, W) === EMPTY.repeat(W);
  let row = '';
  for (let x = 0; x < W; x++) row += String(rnd.next(6));
  const hole = rnd.next(W);
  row = row.substring(0, hole) + EMPTY + row.substring(hole + 1);
  return { field: field.substring(W) + row, lost: !ok };
}

/** `c` Clear Line 0x447fb4: remove the bottom row. */
export function specialClearLine(field: string): EffectResult {
  return { field: EMPTY.repeat(W) + field.substring(0, FIELD_SIZE - W) };
}

/** `n` Nuke Field. */
export function specialNuke(): EffectResult {
  return { field: EMPTY_FIELD };
}

/** `r` Random Blocks Clear: 10 random cells emptied (may repeat / hit empty cells). */
export function specialRandomClear(field: string, rnd: DelphiRandom): EffectResult {
  const a = field.split('');
  for (let i = 0; i < 10; i++) a[rnd.next(FIELD_SIZE)] = EMPTY;
  return { field: a.join('') };
}

/** `b` Clear Special Blocks: specials turn into random normal blocks. */
export function specialClearSpecials(field: string, rnd: DelphiRandom): EffectResult {
  const a = field.split('');
  for (let i = 0; i < FIELD_SIZE; i++) {
    if (isSpecial(a[i]!)) a[i] = String(rnd.next(5) + 1);
  }
  return { field: a.join('') };
}

/** `g` Block Gravity — column compaction (line removal is done by the caller without credit). */
export function specialGravity(field: string): EffectResult {
  const a = field.split('');
  for (let x = 0; x < W; x++) {
    const col: string[] = [];
    for (let y = 0; y < H; y++) {
      const ch = a[idx(x, y)]!;
      if (ch !== EMPTY) col.push(ch);
    }
    for (let y = 0; y < H; y++) {
      const fromBottom = H - 1 - y;
      a[idx(x, y)] = fromBottom < col.length ? col[col.length - 1 - fromBottom]! : EMPTY;
    }
  }
  return { field: a.join('') };
}

/** `q` Blockquake 0x4488b8. */
export function specialQuake(field: string, rnd: DelphiRandom): EffectResult {
  const a = field.split('');
  for (let y = 0; y < H; y++) {
    const dir = rnd.next(2);
    const d = parseInt(QUAKE_TABLE.charAt(rnd.next(22)), 10);
    if (d === 0) continue;
    if (dir === 0) {
      // shift left by d (1-based: for x = d+1 to W: cell(x-d) = cell(x); cell(x) = 0)
      for (let x = d; x < W; x++) {
        a[idx(x - d, y)] = a[idx(x, y)]!;
        a[idx(x, y)] = EMPTY;
      }
    } else {
      for (let x = W - 1 - d; x >= 0; x--) {
        a[idx(x + d, y)] = a[idx(x, y)]!;
        a[idx(x, y)] = EMPTY;
      }
    }
  }
  return { field: a.join('') };
}

/** `o` Block Bomb 0x448b88 (chain reactions included). */
export function specialBlockBomb(field: string, rnd: DelphiRandom): EffectResult {
  const a = field.split('');
  // Safety bound: the original loops until no 'o' remains; scattering only moves existing cells,
  // so the number of 'o' cells never grows and each pass removes at least one.
  for (let guard = 0; guard < FIELD_SIZE * 4; guard++) {
    const pos = a.indexOf('o');
    if (pos < 0) break;
    const x = pos % W;
    const y = Math.floor(pos / W);
    a[pos] = EMPTY;
    let x0 = Math.max(x - 1, 0);
    if (x0 + 2 > W - 1) x0 = W - 3;
    let y0 = Math.max(y - 1, 0);
    if (y0 + 2 > H - 1) y0 = H - 3;
    for (let yy = y0; yy <= y0 + 2; yy++) {
      for (let xx = x0; xx <= x0 + 2; xx++) {
        const src = idx(xx, yy);
        const dst = rnd.next(FIELD_SIZE - 6 * W) + 6 * W;
        a[dst] = a[src]!;
        a[src] = EMPTY;
      }
    }
  }
  return { field: a.join('') };
}

/** Classic-rules lines `cs<k>` 0x447d90: full rows with exactly one hole. */
export function classicAddLines(field: string, k: number, rnd: DelphiRandom): EffectResult {
  const ok = field.substring(0, k * W) === EMPTY.repeat(k * W);
  let junk = '';
  for (let i = 0; i < k; i++) {
    let row = '';
    for (let x = 0; x < W; x++) row += String(rnd.next(5) + 1);
    const hole = rnd.next(W);
    junk += row.substring(0, hole) + EMPTY + row.substring(hole + 1);
  }
  return { field: field.substring(k * W) + junk, lost: !ok };
}

// ---------------------------------------------------------------------------------------------
// Network field encoding (FieldDiff 0x44a548 / apply 0x44a410)
// ---------------------------------------------------------------------------------------------

export function encodeFieldDiff(prev: string, next: string): string {
  const groups: string[] = new Array(CELL_ORDER.length).fill('');
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = next.charAt(idx(x, y));
      if (ch !== prev.charAt(idx(x, y))) {
        const t = CELL_ORDER.indexOf(ch);
        groups[t] += String.fromCharCode(x + 1 + 0x32) + String.fromCharCode(y + 1 + 0x32);
      }
    }
  }
  let out = '';
  groups.forEach((g, t) => {
    if (g) out += String.fromCharCode(0x21 + t) + g;
  });
  return out.length < FIELD_SIZE ? out : next;
}

export function applyFieldData(current: string, data: string): string {
  if (data.length === FIELD_SIZE) return data;
  const a = current.split('');
  let type = EMPTY;
  for (let i = 0; i < data.length; ) {
    const b = data.charCodeAt(i);
    if (b < 0x33) {
      type = CELL_ORDER.charAt(b - 0x21) || EMPTY;
      i++;
    } else {
      const x = b - 0x33;
      const y = data.charCodeAt(i + 1) - 0x33;
      if (x >= 0 && x < W && y >= 0 && y < H) a[idx(x, y)] = type;
      i += 2;
    }
  }
  return a.join('');
}
