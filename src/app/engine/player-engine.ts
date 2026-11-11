/**
 * The local player's game: falling piece, timers, line clears, inventory and specials.
 * Ported from Form1/Form2 of TETRINET.EXE v1.13 (see docs/ORIGINAL_SPEC.md §1–§6).
 */
import { signal } from '@angular/core';
import { EMPTY_FIELD, FIELD_H, FIELD_W, PIECES, SPECIAL_NAMES, Sound, SpecialLetter } from './constants';
import {
  addSpecials,
  classicAddLines,
  clearLines,
  collides,
  EffectResult,
  encodeFieldDiff,
  generateGarbage,
  lostField,
  lowerField,
  pieceH,
  pieceW,
  placePiece,
  rotate,
  specialAddLine,
  specialBlockBomb,
  specialClearLine,
  specialClearSpecials,
  specialGravity,
  specialNuke,
  specialQuake,
  specialRandomClear,
} from './field';
import { DelphiRandom } from './random';
import { SuperTimer, TimerScheduler } from './timer';

export interface GameSettings {
  stackHeight: number;
  startLevel: number;
  linesPerLevel: number;
  levelInc: number;
  linesPerSpecial: number;
  specialsAdded: number;
  specialCapacity: number;
  pieceFreq: string;
  specialFreq: string;
  averagedLevels: boolean;
  classic: boolean;
}

export type GameAction = 'rotateRight' | 'rotateLeft' | 'down' | 'drop' | 'left' | 'right';

/** Everything the engine needs from the surrounding client. */
export interface EngineHost {
  myNum(): number;
  myNick(): string;
  /** Player has a nick and has not lost this round. */
  isAlive(n: number): boolean;
  nickOf(n: number): string;
  /** Field the client currently shows for player n (used by Switch Fields). */
  fieldOf(n: number): string;
  setRemoteField(n: number, field: string): void;
  avgLevel(): number;
  send(msg: string): void;
  sound(s: Sound): void;
  logAttack(text: string): void;
  onOwnLevel(level: number): void;
  onLost(): void;
}

export interface FallingPiece {
  piece: string;
  x: number;
  y: number;
}

export class PlayerEngine {
  // ---- observable state -----------------------------------------------------------------------
  readonly field = signal(EMPTY_FIELD);
  readonly current = signal<FallingPiece | null>(null);
  readonly nextPiece = signal('');
  readonly lines = signal(0);
  readonly level = signal(1);
  readonly inventory = signal('');
  readonly inGame = signal(false);
  readonly alive = signal(false);
  readonly paused = signal(false);

  // ---- internal state -------------------------------------------------------------------------
  private rnd = new DelphiRandom();
  private settings: GameSettings | null = null;
  private px = 1;
  private py = 1;
  private cur = '';
  private lockCnt = 0;
  private fastDropping = false;
  private lastSent = EMPTY_FIELD;

  private readonly dropTimer: SuperTimer;
  private readonly fastDropTimer: SuperTimer;
  private readonly newPieceWait: SuperTimer;

  constructor(
    scheduler: TimerScheduler,
    private readonly host: EngineHost,
  ) {
    this.dropTimer = new SuperTimer(scheduler, 1010, () => this.onDropTimer());
    this.fastDropTimer = new SuperTimer(scheduler, 100, () => this.onFastDropTimer());
    this.newPieceWait = new SuperTimer(scheduler, 1000, () => this.onNewPieceWait());
  }

  get capacity(): number {
    return this.settings?.specialCapacity ?? 18;
  }

  // =============================================================================================
  // Game lifecycle
  // =============================================================================================

  /** Starts a round (`newgame`, 0x445a10). */
  start(settings: GameSettings): void {
    this.settings = settings;
    this.cur = '';
    this.nextPiece.set('');
    this.current.set(null);
    this.lines.set(0);
    this.level.set(settings.startLevel);
    this.inventory.set('');
    this.paused.set(false);
    this.lockCnt = 0;
    this.fastDropping = false;
    this.host.sound(Sound.GameStart);
    this.field.set(generateGarbage(settings.stackHeight, this.rnd));
    // Fix of an original quirk: always send the full field at the start of a round.
    this.lastSent = '';
    this.sendField(true);
    this.inGame.set(true);
    this.alive.set(true);
    this.dropTimer.interval = this.gravityInterval();
    this.dropTimer.enabled = true;
    this.newPiece();
  }

  /** `endgame`: stop everything. */
  end(): void {
    this.inGame.set(false);
    this.stopTimers();
    this.cur = '';
    this.current.set(null);
    this.nextPiece.set('');
  }

  /** Joined while a game is running (`ingame`) — spectate. */
  spectate(): void {
    this.inGame.set(true);
    this.alive.set(false);
    this.stopTimers();
  }

  setPaused(p: boolean): void {
    this.paused.set(p);
  }

  private stopTimers(): void {
    this.dropTimer.enabled = false;
    this.fastDropTimer.enabled = false;
    this.newPieceWait.enabled = false;
    this.fastDropping = false;
  }

  private canAct(): boolean {
    return this.inGame() && this.alive() && !this.paused();
  }

  private gravityInterval(): number {
    const s = this.settings;
    const lvl = s && s.averagedLevels ? this.host.avgLevel() : this.level();
    return lvl * 10 < 1010 ? 1010 - lvl * 10 : 1;
  }

  // =============================================================================================
  // Pieces
  // =============================================================================================

  private randomPiece(): string {
    const freq = this.settings!.pieceFreq;
    const d = parseInt(freq.charAt(this.rnd.next(100)) || '1', 10);
    return rotate(PIECES[d] ?? PIECES[1]!, this.rnd.next(4) + 1);
  }

  /** `NewPiece` 0x449a3c. */
  private newPiece(): void {
    this.fastDropping = false;
    this.fastDropTimer.enabled = false;
    this.dropTimer.interval = this.gravityInterval();
    if (this.nextPiece() === '') {
      this.cur = this.randomPiece();
      this.nextPiece.set(this.randomPiece());
    } else {
      this.cur = this.nextPiece();
      this.nextPiece.set(this.randomPiece());
    }
    this.px = Math.floor((FIELD_W + 2) / 2) - Math.floor(pieceW(this.cur) / 2);
    this.py = 1;
    this.publishPiece();
    if (collides(this.field(), this.px, this.py, this.cur)) this.playerLost();
  }

  private publishPiece(): void {
    this.current.set(this.cur ? { piece: this.cur, x: this.px, y: this.py } : null);
  }

  private onNewPieceWait(): void {
    if (!this.inGame()) return;
    this.newPieceWait.enabled = false;
    if (!this.alive()) return;
    this.newPiece();
  }

  private onDropTimer(): void {
    if (!this.canAct() || this.fastDropping) return;
    if (!this.cur) {
      this.fastDropping = false;
      this.fastDropTimer.enabled = false;
      return;
    }
    if (!collides(this.field(), this.px, this.py + 1, this.cur)) {
      this.py++;
      this.lockCnt = 0;
      this.publishPiece();
      return;
    }
    if (this.lockCnt <= 0) {
      this.lockCnt++;
      return;
    }
    this.lockPiece();
  }

  private onFastDropTimer(): void {
    if (!this.canAct()) return;
    if (!this.cur) {
      this.fastDropping = false;
      this.fastDropTimer.enabled = false;
      return;
    }
    if (!collides(this.field(), this.px, this.py + 1, this.cur)) {
      this.py++;
      this.publishPiece();
    } else {
      this.lockPiece();
    }
  }

  /** LockPiece (inline in 0x44a7dc / 0x44aa3b). */
  private lockPiece(): void {
    let atTop = false;
    for (let y = this.py; y >= 0; y--) {
      if (y === 0) {
        atTop = true;
        break;
      }
      if (!collides(this.field(), this.px, y, this.cur)) {
        this.py = y;
        break;
      }
    }
    if (atTop) {
      this.playerLost();
      return;
    }
    this.host.sound(Sound.PieceHitsBottom);
    this.settle();
  }

  private settle(): void {
    this.field.set(placePiece(this.field(), this.cur, this.px, this.py));
    this.cur = '';
    this.publishPiece();
    this.checkLines(false);
    this.sendField();
    this.newPieceWait.enabled = true;
    this.fastDropping = false;
    this.fastDropTimer.enabled = false;
  }

  // =============================================================================================
  // Input
  // =============================================================================================

  keyDown(action: GameAction): void {
    if (!this.canAct() || !this.cur) return;
    const f = this.field();
    switch (action) {
      case 'left':
        if (!collides(f, this.px - 1, this.py, this.cur)) this.px--;
        break;
      case 'right':
        if (!collides(f, this.px + 1, this.py, this.cur)) this.px++;
        break;
      case 'rotateRight':
        this.tryRotate(rotate(this.cur, 2));
        break;
      case 'rotateLeft':
        this.tryRotate(rotate(this.cur, 4));
        break;
      case 'down':
        if (!this.fastDropTimer.enabled) {
          this.fastDropping = true;
          if (!collides(f, this.px, this.py + 1, this.cur)) this.py++;
          this.fastDropTimer.enabled = true;
        }
        break;
      case 'drop':
        this.hardDrop();
        return;
    }
    this.publishPiece();
  }

  keyUp(action: GameAction): void {
    if (action === 'down') {
      this.fastDropTimer.enabled = false;
      this.fastDropping = false;
    }
  }

  private tryRotate(r: string): void {
    const f = this.field();
    let nx = this.px + Math.floor(pieceW(this.cur) / 2) - Math.floor(pieceW(r) / 2);
    const accept = () => {
      this.px = nx;
      this.cur = r;
      this.host.sound(Sound.Rotate);
    };
    if (!collides(f, nx, this.py, r)) return accept();
    if (nx > FIELD_W - pieceW(r) + 1) {
      nx = FIELD_W - pieceW(r) + 1;
      if (!collides(f, nx, this.py, r)) accept();
    } else if (nx < 1) {
      nx = 1;
      if (!collides(f, nx, this.py, r)) accept();
    }
  }

  private hardDrop(): void {
    const f = this.field();
    let lost = true;
    for (let y = this.py; y <= FIELD_H; y++) {
      if (collides(f, this.px, y, this.cur)) {
        if (y <= 1) break;
        lost = false;
        this.py = y - 1;
        break;
      } else if (y === FIELD_H) {
        lost = false;
        this.py = FIELD_H;
      }
    }
    if (lost) {
      this.playerLost();
      return;
    }
    this.host.sound(Sound.HardDrop);
    this.settle();
  }

  // =============================================================================================
  // Lines, levels, specials
  // =============================================================================================

  /** `CheckLines(noCredit)` 0x44931c. */
  private checkLines(noCredit: boolean): void {
    const s = this.settings!;
    const res = clearLines(this.field());
    if (res.lines === 0) return;
    this.field.set(res.field);
    const specials = noCredit ? '' : res.specials;
    this.host.sound(res.lines >= 4 ? Sound.FourLines : specials ? Sound.SpecialLineCleared : Sound.LineCleared);
    const lines = noCredit ? 0 : res.lines;

    let inv = this.inventory();
    for (const c of specials) {
      for (let i = 0; i < lines; i++) {
        if (inv.length !== s.specialCapacity) {
          const pos = this.rnd.next(inv.length + 1);
          inv = inv.substring(0, pos) + c + inv.substring(pos);
        }
      }
    }
    this.inventory.set(inv);

    let total = this.lines();
    let level = this.level();
    let field = this.field();
    for (let i = 0; i < lines; i++) {
      total++;
      if (total % s.linesPerLevel === 0) level += s.levelInc;
      if (total % s.linesPerSpecial === 0) field = addSpecials(field, s.specialsAdded, s.specialFreq, this.rnd);
    }
    this.lines.set(total);
    this.level.set(level);
    this.field.set(field);

    if (s.classic && lines > 0) {
      const send = lines <= 1 ? 0 : lines === 2 ? 1 : lines === 3 ? 2 : 4;
      if (send > 0) {
        this.host.send(`sb 0 cs${send} ${this.host.myNum()}`);
        this.host.logAttack(
          `\x02\x13${send} Line${send !== 1 ? 's' : ''} Added to All\x13\x02 from \x02\x11${this.host.myNick()}`,
        );
      }
    }
    if (lines > 0) {
      this.host.onOwnLevel(level);
      if (s.averagedLevels) this.host.send(`lvl ${this.host.myNum()} ${level}`);
    }
  }

  /** Keys 1..6 (0x4506e2). */
  useSpecial(target: number): void {
    if (!this.canAct()) return;
    const inv = this.inventory();
    if (!inv || !this.host.isAlive(target)) return;
    const me = this.host.myNum();
    const c = inv.charAt(0) as SpecialLetter;
    const name = SPECIAL_NAMES[c];
    if (target === me) {
      if (c !== 's') this.applySpecial(c);
      this.host.logAttack(`\x02\x13${name}\x13\x02 on \x02\x11${this.host.myNick()}\x11\x02 from \x02\x11${this.host.myNick()}`);
      this.host.send(`sb ${me} ${c} ${me}`);
      this.sendField();
    } else {
      this.host.send(`sb ${target} ${c} ${me}`);
      if (c === 's') this.switchWith(target);
      this.host.logAttack(
        `\x02\x13${name}\x13\x02 on \x11${this.host.nickOf(target)}\x11 from \x02\x11${this.host.myNick()}`,
      );
    }
    this.inventory.set(inv.substring(1));
  }

  /** `D` key. */
  discard(): void {
    if (!this.inGame() || !this.alive() || this.paused()) return;
    this.inventory.update((i) => i.substring(1));
  }

  /** A special (or classic lines `cs<k>`, or `s<sender>`) hits our field — `ApplySpecial` 0x448e40. */
  applySpecial(s: string): void {
    if (!this.alive() || !this.inGame()) return;
    const f = this.field();
    let res: EffectResult | null = null;
    if (s.startsWith('cs')) {
      res = classicAddLines(f, parseInt(s.substring(2), 10) || 1, this.rnd);
    } else {
      switch (s.charAt(0)) {
        case 'a':
          res = specialAddLine(f, this.rnd);
          break;
        case 'c':
          res = specialClearLine(f);
          break;
        case 'n':
          res = specialNuke();
          break;
        case 'r':
          res = specialRandomClear(f, this.rnd);
          break;
        case 's':
          this.switchWith(parseInt(s.substring(1), 10));
          return;
        case 'b':
          res = specialClearSpecials(f, this.rnd);
          break;
        case 'g':
          res = specialGravity(f);
          this.field.set(res.field);
          this.checkLines(true);
          this.sendField();
          return;
        case 'q':
          res = specialQuake(f, this.rnd);
          break;
        case 'o':
          res = specialBlockBomb(f, this.rnd);
          break;
      }
    }
    if (!res) return;
    this.field.set(res.field);
    if (res.lost) {
      this.playerLost();
      return;
    }
    this.sendField();
  }

  /** `SwitchWith(other)` 0x448644 — each side performs its own half. */
  private switchWith(other: number): void {
    if (!other || other === this.host.myNum()) return;
    const mine = this.field();
    this.field.set(lowerField(this.host.fieldOf(other)));
    // Full field (not a diff): other clients may already show the swapped fields.
    this.sendField(true);
    // Display the other player's new field (fixes the original's display quirk).
    this.host.setRemoteField(other, lowerField(mine));
  }

  // =============================================================================================
  // Losing & networking
  // =============================================================================================

  /** `PlayerLost` 0x447148. */
  playerLost(): void {
    if (!this.alive()) return;
    this.alive.set(false);
    this.host.sound(Sound.YouLost);
    this.stopTimers();
    this.cur = '';
    this.publishPiece();
    this.nextPiece.set('');
    this.field.set(lostField(this.rnd));
    this.sendField();
    this.host.send(`playerlost ${this.host.myNum()}`);
    this.host.onLost();
  }

  private sendField(full = false): void {
    const f = this.field();
    const data = full || !this.lastSent ? f : encodeFieldDiff(this.lastSent, f);
    this.lastSent = f;
    this.host.send(`f ${this.host.myNum()} ${data}`);
  }

  /** Field with the falling piece drawn in, for rendering. */
  static withPiece(field: string, p: FallingPiece | null): string {
    if (!p) return field;
    return placePiece(field, p.piece, p.x, p.y);
  }

  static pieceSize(p: string): { w: number; h: number } {
    return { w: pieceW(p), h: pieceH(p) };
  }
}
