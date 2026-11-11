import { describe, expect, it } from 'vitest';
import { EMPTY_FIELD, FIELD_SIZE, FIELD_W, PIECES } from './constants';
import {
  addSpecials,
  applyFieldData,
  classicAddLines,
  clearLines,
  collides,
  encodeFieldDiff,
  lowerField,
  placePiece,
  rotate,
  rotateCW,
  specialAddLine,
  specialBlockBomb,
  specialClearLine,
  specialGravity,
  specialQuake,
  stackHeight,
} from './field';
import { DelphiRandom } from './random';

const row = (s: string) => s.padEnd(FIELD_W, '0');
function fieldFromBottom(...rows: string[]): string {
  const filled = rows.map(row).join('');
  return EMPTY_FIELD.substring(0, FIELD_SIZE - filled.length) + filled;
}

describe('pieces', () => {
  it('rotates T clockwise like the original', () => {
    expect(rotateCW(PIECES[7]!)).toBe('0203202220');
    expect(rotate(PIECES[7]!, 5)).toBe(PIECES[7]);
  });
  it('I piece rotates to vertical', () => {
    expect(rotate(PIECES[1]!, 2)).toBe('01041111');
  });
});

describe('field', () => {
  it('collides with walls and blocks', () => {
    expect(collides(EMPTY_FIELD, 0, 1, PIECES[2]!)).toBe(true);
    expect(collides(EMPTY_FIELD, 11, 1, PIECES[2]!)).toBe(false);
    expect(collides(EMPTY_FIELD, 12, 1, PIECES[2]!)).toBe(true);
    expect(collides(EMPTY_FIELD, 1, 21, PIECES[2]!)).toBe(false);
    expect(collides(EMPTY_FIELD, 1, 22, PIECES[2]!)).toBe(true);
  });

  it('clears full lines and collects specials', () => {
    const f = fieldFromBottom('111111111111', '1111a1111111', '100000000000');
    // rows listed top→bottom: third from bottom is partial
    const res = clearLines(f);
    expect(res.lines).toBe(2);
    expect(res.specials).toBe('a');
    expect(res.field.substring(FIELD_SIZE - FIELD_W)).toBe(row('100000000000'));
  });

  it('places pieces', () => {
    const f = placePiece(EMPTY_FIELD, PIECES[2]!, 1, 21);
    expect(stackHeight(f)).toBe(2);
  });

  it('field diff round-trips', () => {
    const rnd = new DelphiRandom(42);
    let a = EMPTY_FIELD;
    for (let i = 0; i < 20; i++) {
      const b = addSpecials(specialAddLine(a, rnd).field, 2, '1'.repeat(50) + '9'.repeat(50), rnd);
      const enc = encodeFieldDiff(a, b);
      expect(applyFieldData(a, enc)).toBe(b);
      a = b;
    }
  });

  it('switch lowers stacks above 16', () => {
    const f = fieldFromBottom(...Array.from({ length: 20 }, () => '111111111110'));
    expect(stackHeight(f)).toBe(20);
    expect(stackHeight(lowerField(f))).toBe(16);
  });

  it('add line / classic lines report losing when the top is occupied', () => {
    const rnd = new DelphiRandom(1);
    const top = '1' + EMPTY_FIELD.substring(1);
    expect(specialAddLine(top, rnd).lost).toBe(true);
    expect(specialAddLine(EMPTY_FIELD, rnd).lost).toBe(false);
    const c = classicAddLines(EMPTY_FIELD, 4, rnd);
    expect(c.lost).toBe(false);
    for (let r = 18; r < 22; r++) {
      const line = c.field.substring(r * FIELD_W, r * FIELD_W + FIELD_W);
      expect(line.split('0').length - 1).toBe(1);
    }
  });

  it('clear line removes the bottom row', () => {
    const f = fieldFromBottom('222222222220', '111111111110');
    expect(specialClearLine(f).field).toBe(fieldFromBottom('222222222220'));
  });

  it('gravity compacts columns', () => {
    const f = fieldFromBottom('100000000000', '000000000000', '010000000000');
    const g = specialGravity(f).field;
    expect(g).toBe(fieldFromBottom('110000000000'));
  });

  it('quake preserves or loses blocks but never adds', () => {
    const rnd = new DelphiRandom(7);
    const f = fieldFromBottom('123451234512', '111111111110');
    const q = specialQuake(f, rnd).field;
    const count = (s: string) => s.split('').filter((c) => c !== '0').length;
    expect(count(q)).toBeLessThanOrEqual(count(f));
  });

  it('block bomb removes every o', () => {
    const rnd = new DelphiRandom(3);
    const f = fieldFromBottom('11o111111111', '1111111o1111', 'o00000000000');
    expect(specialBlockBomb(f, rnd).field.includes('o')).toBe(false);
  });
});

describe('DelphiRandom', () => {
  it('matches the Delphi LCG', () => {
    const r = new DelphiRandom(0);
    // RandSeed: 0 → 1 → 0x08088406 ...
    expect(r.next(1 << 30)).toBe(0);
    expect(r.next(0x10000)).toBe(Math.floor((0x08088406 / 2 ** 32) * 0x10000));
  });
});
