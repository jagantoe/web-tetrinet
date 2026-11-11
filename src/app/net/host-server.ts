/**
 * The "TetriNET server": runs inside the hosting player's browser. Authoritative relay exactly like
 * the original Form1 server code (see docs/ORIGINAL_SPEC.md §6–§7), minus TCP/IP specifics.
 */
import {
  EMPTY_FIELD,
  MAX_PLAYERS,
  pieceFreqString,
  ServerSettings,
  specialFreqString,
  sumValues,
  VERSION,
} from '../engine/constants';
import { applyFieldData } from '../engine/field';
import { Connection, restAfter, words } from './connection';

interface Slot {
  conn: Connection;
  nick: string;
  team: string;
  field: string;
  dead: boolean;
}

export interface WinEntry {
  key: string; // 'p' + nick or 't' + team
  points: number;
}

export interface HostCallbacks {
  /** Persist the win list (the original kept it in tetrinet.ini). */
  saveWinlist(list: WinEntry[]): void;
  /** Something changed that the host UI may want to re-read (players, game state). */
  changed(): void;
}

export function serializeWinlist(list: WinEntry[]): string {
  return list.map((e) => `${e.key};${e.points}`).join(' ');
}

export function parseWinlist(s: string): WinEntry[] {
  return s
    .split(' ')
    .filter((t) => t.includes(';'))
    .map((t) => {
      const i = t.lastIndexOf(';');
      return { key: t.substring(0, i), points: parseInt(t.substring(i + 1), 10) || 0 };
    });
}

export class HostServer {
  private readonly slots: (Slot | null)[] = new Array(MAX_PLAYERS + 1).fill(null);
  /** Connections that are not players (the host's own client when "Server Playing" is off). */
  private readonly spectators = new Set<Connection>();
  private readonly pending = new Set<Connection>();
  private hostConn: Connection | null = null;
  private readonly bannedNicks = new Set<string>();

  inGame = false;
  paused = false;
  private lossOrder: number[] = [];
  private sdTimer: ReturnType<typeof setInterval> | null = null;
  private sdSeconds = 0;
  private settings: ServerSettings | null = null;

  constructor(
    public serverPlays: boolean,
    private winlist: WinEntry[],
    private readonly cb: HostCallbacks,
  ) {}

  // =============================================================================================
  // connections
  // =============================================================================================

  /** The host's own client (loopback). */
  attachHostClient(conn: Connection): void {
    this.hostConn = conn;
    this.accept(conn);
  }

  /** A new remote link (WebRTC or local tab). It must log in with `tetrisstart`. */
  accept(conn: Connection): void {
    this.pending.add(conn);
    conn.onMessage = (m) => this.onMessage(conn, m);
    conn.onClose = () => this.onClosed(conn);
  }

  shutdown(): void {
    this.stopSuddenDeath();
    for (const c of this.allConnections()) c.close();
  }

  players(): { num: number; nick: string; team: string; label: string }[] {
    const out: { num: number; nick: string; team: string; label: string }[] = [];
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const s = this.slots[i];
      if (s) out.push({ num: i, nick: s.nick, team: s.team, label: s.conn.label });
    }
    return out;
  }

  getWinlist(): WinEntry[] {
    return this.winlist;
  }

  private allConnections(): Connection[] {
    const list: Connection[] = [...this.pending, ...this.spectators];
    for (const s of this.slots) if (s) list.push(s.conn);
    return list;
  }

  private numOf(conn: Connection): number {
    for (let i = 1; i <= MAX_PLAYERS; i++) if (this.slots[i]?.conn === conn) return i;
    return 0;
  }

  private broadcast(msg: string, except?: Connection): void {
    for (const s of this.slots) if (s && s.conn !== except) s.conn.send(msg);
    for (const c of this.spectators) if (c !== except) c.send(msg);
  }

  private moderator(): number {
    for (let i = 1; i <= MAX_PLAYERS; i++) if (this.slots[i]) return i;
    return 0;
  }

  private mayControl(conn: Connection, n: number): boolean {
    if (conn === this.hostConn) return true;
    const num = this.numOf(conn);
    return num !== 0 && num === n && num === this.moderator();
  }

  private onClosed(conn: Connection): void {
    this.pending.delete(conn);
    this.spectators.delete(conn);
    const n = this.numOf(conn);
    if (!n) return;
    const slot = this.slots[n]!;
    this.slots[n] = null;
    this.broadcast(`playerleave ${n}`);
    if (this.inGame && !slot.dead) {
      this.lossOrder.push(n);
      this.checkWinner(slot);
    }
    if (this.inGame && !this.slots.some((s) => s)) this.endGame(false);
    this.cb.changed();
  }

  // =============================================================================================
  // protocol
  // =============================================================================================

  private onMessage(conn: Connection, msg: string): void {
    const w = words(msg);
    const cmd = w[0];
    if (this.pending.has(conn)) {
      if (cmd === 'tetrisstart') this.login(conn, w[1] ?? '', w[2] ?? '');
      return;
    }
    const sender = this.numOf(conn);
    switch (cmd) {
      case 'team': {
        if (!sender) return;
        const team = restAfter(msg, 2).trim();
        this.slots[sender]!.team = team;
        this.broadcast(`team ${sender} ${team}`, conn);
        this.cb.changed();
        break;
      }
      case 'pline':
      case 'plineact':
        this.broadcast(`${cmd} ${sender} ${restAfter(msg, 2)}`, conn);
        break;
      case 'gmsg':
        this.broadcast(msg);
        break;
      case 'startgame': {
        const n = parseInt(w[2] ?? '0', 10);
        if (!this.mayControl(conn, n)) return;
        if (w[1] === '1') this.startGame();
        else this.endGame(false);
        break;
      }
      case 'pause': {
        const n = parseInt(w[2] ?? '0', 10);
        if (!this.mayControl(conn, n)) return;
        this.setPaused(w[1] === '1');
        break;
      }
      case 'f': {
        const n = parseInt(w[1] ?? '0', 10);
        if (!sender || n !== sender) return;
        const slot = this.slots[n]!;
        slot.field = applyFieldData(slot.field, w[2] ?? '');
        this.broadcast(msg, conn);
        break;
      }
      case 'sb':
      case 'lvl':
        if (!sender) return;
        this.broadcast(msg, conn);
        break;
      case 'playerlost': {
        if (!sender || !this.inGame) return;
        const slot = this.slots[sender]!;
        if (slot.dead) return;
        slot.dead = true;
        this.lossOrder.push(sender);
        this.broadcast(`playerlost ${sender}`, conn);
        this.checkWinner(null);
        break;
      }
    }
  }

  private login(conn: Connection, nick: string, version: string): void {
    const refuse = (text: string) => {
      conn.send(`noconnecting ${text}`);
      setTimeout(() => conn.close(), 200);
    };
    if (version !== VERSION) return refuse(`TetriNET version (${version}) does not match Server's (${VERSION})!`);
    if (!nick) return refuse('Nickname already exists on server!');
    if (this.bannedNicks.has(nick.toUpperCase())) return refuse('You are banned from server!');
    for (const s of this.slots) {
      if (s && s.nick.toUpperCase() === nick.toUpperCase()) return refuse('Nickname already exists on server!');
    }

    const isHost = conn === this.hostConn;
    this.pending.delete(conn);

    if (isHost && !this.serverPlays) {
      // Non-playing server: watches everything as player 0.
      this.spectators.add(conn);
      conn.send(`winlist ${serializeWinlist(this.winlist)}`);
      conn.send('playernum 0');
      this.sendRoster(conn, 0);
      this.cb.changed();
      return;
    }

    let n = 0;
    if (isHost) n = 1;
    else for (let i = this.serverPlays ? 2 : 1; i <= MAX_PLAYERS && !n; i++) if (!this.slots[i]) n = i;
    if (!n || this.slots[n]) return refuse('Server is full!');

    this.slots[n] = { conn, nick, team: '', field: EMPTY_FIELD, dead: this.inGame };
    conn.send(`winlist ${serializeWinlist(this.winlist)}`);
    conn.send(`playernum ${n}`);
    this.sendRoster(conn, n);
    this.broadcast(`playerjoin ${n} ${nick}`, conn);
    if (this.inGame) {
      // The original immediately counts a late joiner as having lost.
      this.lossOrder = this.lossOrder.filter((p) => p !== n);
    }
    this.cb.changed();
  }

  private sendRoster(conn: Connection, me: number): void {
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const s = this.slots[i];
      if (!s || i === me) continue;
      conn.send(`playerjoin ${i} ${s.nick}`);
      conn.send(`team ${i} ${s.team}`);
      conn.send(`f ${i} ${s.field}`);
    }
    if (this.inGame) {
      conn.send('ingame');
      conn.send(`pause ${this.paused ? 1 : 0}`);
      for (let i = 1; i <= MAX_PLAYERS; i++) {
        if (this.slots[i]?.dead && i !== me) conn.send(`playerlost ${i}`);
      }
    }
  }

  // =============================================================================================
  // host UI actions
  // =============================================================================================

  kick(n: number, ban = false): void {
    const s = this.slots[n];
    if (!s || s.conn === this.hostConn) return;
    if (ban) this.bannedNicks.add(s.nick.toUpperCase());
    this.broadcast(`kick ${n}`);
    s.nick = ' kicked';
    setTimeout(() => s.conn.close(), 100);
  }

  resetWinlist(): void {
    this.winlist = [];
    this.cb.saveWinlist(this.winlist);
    this.broadcast('winlist ');
  }

  /** Returns an error text if the game cannot be started. */
  canStart(settings: ServerSettings): string | null {
    if (this.inGame) return 'A game is already in progress.';
    if (sumValues(settings.pieces) !== 100 || sumValues(settings.specials) !== 100) {
      return 'All the percents of the pieces and special blocks must add up to 100.';
    }
    const count = this.slots.filter((s) => s).length;
    if (count === 0) return 'There are no players on the server.';
    if (!this.serverPlays && count < 2) return 'At least 2 players are needed.';
    return null;
  }

  setSettings(settings: ServerSettings): void {
    this.settings = settings;
  }

  startGame(): void {
    const s = this.settings;
    if (!s || this.canStart(s)) return;
    this.inGame = true;
    this.paused = false;
    this.lossOrder = [];
    const pf = pieceFreqString(s.pieces);
    const sf = specialFreqString(s.specials);
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const slot = this.slots[i];
      if (!slot) continue;
      slot.dead = false;
      slot.field = EMPTY_FIELD;
    }
    const msgFor = (i: number) =>
      `newgame ${s.stackHeights[i - 1] ?? 0} ${s.startingLevel} ${s.linesPerLevel} ${s.levelIncrease} ` +
      `${s.linesPerSpecial} ${s.specialsAdded} ${s.specialCapacity} ${pf} ${sf} ` +
      `${s.averagedLevels ? 1 : 0} ${s.classicRules ? 1 : 0}`;
    for (let i = 1; i <= MAX_PLAYERS; i++) this.slots[i]?.conn.send(msgFor(i));
    for (const c of this.spectators) c.send(msgFor(1));
    this.sdSeconds = 0;
    if (s.suddenDeathMinutes > 0) this.startSuddenDeath();
    this.cb.changed();
  }

  setPaused(p: boolean): void {
    if (!this.inGame) return;
    this.paused = p;
    if (p) this.stopSuddenDeath();
    else if (this.settings && this.settings.suddenDeathMinutes > 0) this.startSuddenDeath();
    this.broadcast(`pause ${p ? 1 : 0}`);
    this.cb.changed();
  }

  stopGame(): void {
    this.endGame(false);
  }

  private startSuddenDeath(): void {
    this.stopSuddenDeath();
    this.sdTimer = setInterval(() => {
      const s = this.settings;
      if (!s || !this.inGame || this.paused) return;
      this.sdSeconds++;
      if (this.sdSeconds >= s.suddenDeathMinutes * 60 && this.sdSeconds % Math.max(1, s.suddenDeathSeconds) === 0) {
        for (let i = 1; i <= MAX_PLAYERS; i++) {
          const slot = this.slots[i];
          if (slot && !slot.dead) slot.conn.send('sb 0 a 0');
        }
      }
    }, 1000);
  }

  private stopSuddenDeath(): void {
    if (this.sdTimer) clearInterval(this.sdTimer);
    this.sdTimer = null;
  }

  // =============================================================================================
  // winner / end of game
  // =============================================================================================

  /** 0x442074 + CheckWinner 0x44703c. `left` = a slot that just disconnected. */
  private checkWinner(left: Slot | null): void {
    const present: number[] = [];
    const alive: number[] = [];
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const s = this.slots[i];
      if (!s) continue;
      present.push(i);
      if (!s.dead) alive.push(i);
    }
    const total = present.length + (left ? 1 : 0);
    const first = alive[0] ?? 0;
    const teamOf = (n: number) => this.slots[n]?.team ?? '';
    const mixed = alive.some(
      (p) =>
        p !== first &&
        (teamOf(p) === '' || teamOf(first) === '' || teamOf(p).toUpperCase() !== teamOf(first).toUpperCase()),
    );
    const winner = !mixed && first !== 0 && alive.length !== total ? first : 0;
    if (winner) {
      this.broadcast(`playerwon ${winner}`);
      this.lossOrder.push(winner);
      this.incWins();
      this.endGame(true);
    } else if (alive.length === 0) {
      this.lossOrder = [];
      this.endGame(false);
    }
  }

  /** `incwins` 0x441456. */
  private incWins(): void {
    const seen = new Set<string>();
    let award = 3;
    for (let k = this.lossOrder.length - 1; k >= 0 && award > 0; k--) {
      const s = this.slots[this.lossOrder[k]!];
      if (!s) continue;
      const key = s.team ? 't' + s.team : 'p' + s.nick;
      if (key === 'p' || seen.has(key.toUpperCase())) continue;
      seen.add(key.toUpperCase());
      const existing = this.winlist.find((e) => e.key.toUpperCase() === key.toUpperCase());
      const points = (existing?.points ?? 0) + award;
      this.winlist = this.winlist.filter((e) => e !== existing);
      const at = this.winlist.findIndex((e) => e.points < points);
      if (at >= 0) this.winlist.splice(at, 0, { key, points });
      else if (this.winlist.length < 10) this.winlist.push({ key, points });
      award--;
    }
    this.lossOrder = [];
    this.cb.saveWinlist(this.winlist);
    this.broadcast(`winlist ${serializeWinlist(this.winlist)}`);
  }

  private endGame(_hadWinner: boolean): void {
    if (!this.inGame) return;
    this.inGame = false;
    this.paused = false;
    this.stopSuddenDeath();
    this.broadcast('endgame');
    this.cb.changed();
  }
}
