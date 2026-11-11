/**
 * The TetriNET client (and, when hosting, the embedded server).
 * Mirrors the client half of Form1 in TETRINET.EXE: connection, player list, partyline,
 * win list, other players' fields, and the local PlayerEngine.
 */
import { computed, effect, inject, Injectable, isDevMode, signal } from '@angular/core';
import { EMPTY_FIELD, MAX_PLAYERS, ServerSettings, Sound, SPECIAL_NAMES, SpecialLetter, VERSION } from '../engine/constants';
import { applyFieldData } from '../engine/field';
import { GameAction, GameSettings, PlayerEngine } from '../engine/player-engine';
import { DelphiRandom } from '../engine/random';
import { TimerScheduler } from '../engine/timer';
import { Connection, createLoopbackPair, restAfter, words } from '../net/connection';
import { HostServer, parseWinlist, WinEntry } from '../net/host-server';
import { joinLocalRoom, LocalRoomHost } from '../net/local-transport';
import { acceptJoinCode, RtcJoinAttempt } from '../net/webrtc-transport';
import { AudioService } from './audio.service';
import { SettingsService } from './settings.service';

export interface PlayerState {
  nick: string;
  team: string;
  field: string;
  level: number;
  dead: boolean;
}

export type ConnState = 'offline' | 'connecting' | 'online';

@Injectable({ providedIn: 'root' })
export class TetrinetService {
  private readonly settings = inject(SettingsService);
  private readonly audio = inject(AudioService);
  private readonly scheduler = new TimerScheduler();

  // ---- connection -----------------------------------------------------------------------------
  readonly state = signal<ConnState>('offline');
  readonly isHost = signal(false);
  readonly myNum = signal(0);
  private conn: Connection | null = null;
  private server: HostServer | null = null;
  private localRoom: LocalRoomHost | null = null;
  readonly roomId = signal('');
  /** Bumped when the embedded server's player list changes (host UI). */
  readonly hostTick = signal(0);

  // ---- game state -----------------------------------------------------------------------------
  readonly players = signal<(PlayerState | null)[]>(new Array(MAX_PLAYERS + 1).fill(null));
  readonly inGame = signal(false);
  readonly paused = signal(false);
  readonly winner = signal(0);
  readonly avgLevel = signal(0);
  readonly averagedLevels = signal(false);
  readonly winlist = signal<WinEntry[]>([]);

  // ---- text boxes -----------------------------------------------------------------------------
  readonly partyline = signal<string[]>([]);
  readonly attacks = signal<string[]>([]);
  readonly gameMessages = signal<string[]>([]);
  readonly partylineUnread = signal(false);
  readonly partylineVisible = signal(false);
  private attackNo = 0;

  readonly engine: PlayerEngine;
  private readonly rnd = new DelphiRandom();

  readonly myNick = computed(() => {
    const n = this.myNum();
    return n === 0 ? 'Server' : (this.players()[n]?.nick ?? this.settings.nickname());
  });

  /** Lowest-numbered present player. */
  readonly moderator = computed(() => {
    const p = this.players();
    for (let i = 1; i <= MAX_PLAYERS; i++) if (p[i]) return i;
    return 0;
  });

  readonly canControl = computed(
    () => this.state() === 'online' && (this.isHost() || (this.myNum() !== 0 && this.myNum() === this.moderator())),
  );

  constructor() {
    this.engine = new PlayerEngine(this.scheduler, {
      myNum: () => this.myNum(),
      myNick: () => this.myNick(),
      isAlive: (n) => {
        const p = this.players()[n];
        return !!p && !p.dead;
      },
      nickOf: (n) => this.players()[n]?.nick ?? '',
      fieldOf: (n) => this.players()[n]?.field ?? EMPTY_FIELD,
      setRemoteField: (n, f) => this.patchPlayer(n, { field: f }),
      avgLevel: () => this.avgLevel(),
      send: (m) => this.send(m),
      sound: (s) => this.audio.play(s),
      logAttack: (t) => this.logAttack(t),
      onOwnLevel: (l) => {
        this.patchPlayer(this.myNum(), { level: l });
        this.recalcAvg();
      },
      onLost: () => this.patchPlayer(this.myNum(), { dead: true }),
    });
    this.scheduler.start();
    this.winlist.set(this.settings.winlist());
    // The embedded server always uses the host's current Server Settings (moderators may start games).
    effect(() => {
      const s = this.settings.server();
      this.hostTick();
      this.server?.setSettings(s);
    });
    if (isDevMode()) (window as unknown as { __tetrinet: TetrinetService }).__tetrinet = this;
  }

  // =============================================================================================
  // Hosting
  // =============================================================================================

  /** "Start Server": run the embedded server and connect our own client to it. */
  startServer(): void {
    if (this.state() !== 'offline') return;
    this.isHost.set(true);
    this.server = new HostServer(this.settings.serverPlaying(), this.settings.winlist(), {
      saveWinlist: (l) => this.settings.winlist.set([...l]),
      changed: () => this.hostTick.update((t) => t + 1),
    });
    const [serverSide, clientSide] = createLoopbackPair();
    this.server.attachHostClient(serverSide);
    this.addPartyline('\x0c*** Server has Started');
    this.useConnection(clientSide);
    // Same-computer tabs can join this room id.
    const room = Math.random().toString(36).slice(2, 7).toUpperCase();
    this.roomId.set(room);
    this.localRoom = new LocalRoomHost(room, (c) => this.server?.accept(c));
  }

  stopServer(): void {
    if (!this.isHost()) return;
    this.server?.shutdown();
    this.localRoom?.close();
    this.server = null;
    this.localRoom = null;
    this.roomId.set('');
    this.isHost.set(false);
    this.addPartyline('\x0c*** Server has Shut Down');
    this.resetConnection();
  }

  /** Host: turn a player's join code into a reply code. */
  async acceptJoin(joinCode: string): Promise<{ replyCode: string; connected: Promise<void> }> {
    const server = this.server;
    if (!server) throw new Error('Start the server first.');
    const res = await acceptJoinCode(joinCode, this.settings.iceServers());
    return {
      replyCode: res.replyCode,
      connected: res.connected.then((c) => server.accept(c)),
    };
  }

  hostPlayers() {
    this.hostTick();
    return this.server?.players() ?? [];
  }

  kick(n: number, ban = false): void {
    this.server?.kick(n, ban);
  }

  resetWinlist(): void {
    this.server?.resetWinlist();
  }

  setServerPlaying(on: boolean): void {
    this.settings.serverPlaying.set(on);
    if (this.server) this.server.serverPlays = on;
  }

  /** Returns an error message, or null when the game was started. */
  startGame(settings: ServerSettings): string | null {
    if (this.server) {
      this.server.setSettings(settings);
      const err = this.server.canStart(settings);
      if (err) return err;
    }
    this.send(`startgame 1 ${this.myNum()}`);
    return null;
  }

  stopGame(): void {
    this.send(`startgame 0 ${this.myNum()}`);
  }

  togglePause(): void {
    this.send(`pause ${this.paused() ? 0 : 1} ${this.myNum()}`);
  }

  // =============================================================================================
  // Joining
  // =============================================================================================

  private pendingJoin: RtcJoinAttempt | null = null;

  /** Client: create the join code to send to the host. */
  async createJoinCode(): Promise<string> {
    this.pendingJoin?.cancel();
    this.state.set('connecting');
    try {
      this.pendingJoin = await RtcJoinAttempt.create(this.settings.iceServers());
      return this.pendingJoin.joinCode;
    } catch (e) {
      this.state.set('offline');
      throw e;
    }
  }

  async completeJoin(replyCode: string): Promise<void> {
    const attempt = this.pendingJoin;
    if (!attempt) throw new Error('Create a join code first.');
    const c = await attempt.complete(replyCode);
    this.pendingJoin = null;
    this.useConnection(c);
  }

  cancelJoin(): void {
    this.pendingJoin?.cancel();
    this.pendingJoin = null;
    if (this.state() === 'connecting') this.state.set('offline');
  }

  async joinLocal(room: string): Promise<void> {
    this.state.set('connecting');
    try {
      this.useConnection(await joinLocalRoom(room.trim().toUpperCase()));
    } catch (e) {
      this.state.set('offline');
      throw e;
    }
  }

  disconnect(): void {
    if (this.isHost()) this.stopServer();
    else {
      this.conn?.close();
      this.resetConnection();
    }
  }

  private useConnection(c: Connection): void {
    this.conn = c;
    this.state.set('online');
    c.onMessage = (m) => this.onMessage(m);
    c.onClose = () => {
      if (this.conn !== c) return;
      this.addPartyline('\x0c*** Server has Shut Down');
      this.resetConnection();
    };
    c.send(`tetrisstart ${this.loginNick()} ${VERSION}`);
  }

  private resetConnection(): void {
    const c = this.conn;
    this.conn = null;
    c?.close();
    this.engine.end();
    this.state.set('offline');
    this.myNum.set(0);
    this.inGame.set(false);
    this.paused.set(false);
    this.players.set(new Array(MAX_PLAYERS + 1).fill(null));
    this.audio.stopMusic();
  }

  private send(m: string): void {
    this.conn?.send(m);
  }

  // =============================================================================================
  // Incoming protocol (Sockets1DataAvailable 0x44d1d8 client part)
  // =============================================================================================

  private onMessage(msg: string): void {
    const w = words(msg);
    const n = parseInt(w[1] ?? '0', 10);
    switch (w[0]) {
      case 'noconnecting':
        this.lastError.set(restAfter(msg, 1));
        this.resetConnection();
        break;
      case 'winlist':
        this.winlist.set(parseWinlist(restAfter(msg, 1)));
        break;
      case 'playernum': {
        this.myNum.set(n);
        if (n > 0) {
          this.setPlayer(n, { nick: this.loginNick(), team: '', field: EMPTY_FIELD, level: 1, dead: false });
          const team = this.settings.team();
          this.send(`team ${n} ${team}`);
          if (team) this.patchPlayer(n, { team });
        }
        break;
      }
      case 'playerjoin': {
        const nick = restAfter(msg, 2);
        this.setPlayer(n, { nick, team: '', field: EMPTY_FIELD, level: 1, dead: this.inGame() });
        this.addPartyline(`\x0c*** \x02${nick}\x02 is Now Playing`);
        break;
      }
      case 'playerleave': {
        const p = this.players()[n];
        if (p && p.nick !== ' kicked') this.addPartyline(`\x0c*** \x02${p.nick}\x02 has Left`);
        this.setPlayer(n, null);
        this.recalcAvg();
        break;
      }
      case 'kick': {
        if (n === this.myNum()) {
          this.addPartyline('\x0c*** \x02You\x02 Have Been Kicked');
          this.resetConnection();
        } else {
          const p = this.players()[n];
          if (p) this.addPartyline(`\x0c*** \x02${p.nick}\x02 Has Been Kicked`);
          this.patchPlayer(n, { nick: ' kicked' });
        }
        break;
      }
      case 'team': {
        const team = restAfter(msg, 2).trim();
        const p = this.players()[n];
        if (!p || p.team === team) break;
        this.patchPlayer(n, { team });
        this.addPartyline(
          team ? `\x10*** \x02${p.nick}\x02 is Now on Team \x02${team}\x02` : `\x10*** \x02${p.nick}\x02 is Now Alone`,
        );
        break;
      }
      case 'pline':
        this.addPartyline(`\x02<\x1f${this.nameOf(n)}\x1f>\x02 ${restAfter(msg, 2)}`);
        break;
      case 'plineact':
        this.addPartyline(`\x13* \x02${this.nameOf(n)}\x02 ${restAfter(msg, 2)}`);
        break;
      case 'gmsg':
        this.addGameMessage(restAfter(msg, 1));
        this.audio.play(Sound.MessageArrives);
        break;
      case 'newgame':
        this.onNewGame(w);
        break;
      case 'ingame':
        this.inGame.set(true);
        this.addPartyline('\x14*** The Game is in \x02Progress\x02');
        if (this.myNum() > 0) {
          this.patchPlayer(this.myNum(), { dead: true });
          this.engine.spectate();
        }
        break;
      case 'pause':
        this.paused.set(w[1] === '1');
        this.engine.setPaused(this.paused());
        break;
      case 'endgame':
        this.onEndGame();
        break;
      case 'f': {
        if (n === this.myNum()) break;
        const p = this.players()[n];
        if (p) this.patchPlayer(n, { field: applyFieldData(p.field, w[2] ?? '') });
        break;
      }
      case 'sb':
        this.onSpecial(n, w[2] ?? '', parseInt(w[3] ?? '0', 10));
        break;
      case 'lvl': {
        this.patchPlayer(n, { level: parseInt(w[2] ?? '1', 10) });
        this.recalcAvg();
        break;
      }
      case 'playerlost':
        this.patchPlayer(n, { dead: true });
        this.recalcAvg();
        break;
      case 'playerwon': {
        this.winner.set(n);
        const me = this.players()[this.myNum()];
        const w2 = this.players()[n];
        if (
          n === this.myNum() ||
          (me && w2 && me.team !== '' && me.team.toUpperCase() === w2.team.toUpperCase())
        ) {
          this.audio.play(Sound.YouWon);
        }
        break;
      }
    }
  }

  readonly lastError = signal('');

  private onNewGame(w: string[]): void {
    const num = (i: number) => parseInt(w[i] ?? '0', 10);
    const settings: GameSettings = {
      stackHeight: num(1),
      startLevel: num(2),
      linesPerLevel: Math.max(1, num(3)),
      levelInc: num(4),
      linesPerSpecial: Math.max(1, num(5)),
      specialsAdded: num(6),
      specialCapacity: num(7),
      pieceFreq: w[8] ?? '',
      specialFreq: w[9] ?? '',
      averagedLevels: w[10] === '1',
      classic: w[11] === '1',
    };
    this.attackNo = 0;
    this.attacks.set([]);
    this.gameMessages.set([]);
    this.winner.set(0);
    this.paused.set(false);
    this.averagedLevels.set(settings.averagedLevels);
    this.players.update((ps) =>
      ps.map((p) => (p ? { ...p, field: EMPTY_FIELD, dead: false, level: settings.startLevel } : null)),
    );
    this.recalcAvg();
    this.inGame.set(true);
    this.addPartyline('\x14*** The Game Has \x02Started\x02');
    this.audio.startMusic();
    if (this.myNum() > 0) this.engine.start(settings);
    else this.audio.play(Sound.GameStart);
    this.showFields.set(true);
  }

  private onEndGame(): void {
    this.inGame.set(false);
    this.paused.set(false);
    this.engine.end();
    this.audio.stopMusic();
    this.addPartyline('\x14*** The Game Has \x02Ended\x02');
    if (!this.winner()) {
      this.players.update((ps) => ps.map((p) => (p ? { ...p, field: EMPTY_FIELD } : null)));
      this.engine.field.set(EMPTY_FIELD);
    }
  }

  /** `sb` receive (0x44c4b1). */
  private onSpecial(target: number, special: string, sender: number): void {
    const me = this.myNum();
    const senderNick = this.nameOf(sender);
    if (special.startsWith('cs')) {
      const k = parseInt(special.substring(2), 10);
      this.logAttack(`\x02\x13${k} Line${k !== 1 ? 's' : ''} Added to All\x13\x02 from \x11${senderNick}`);
      const p = this.players()[sender];
      const mine = this.players()[me];
      const sameTeam = p && mine && p.team !== '' && mine.team !== '' && p.team.toUpperCase() === mine.team.toUpperCase();
      if (me > 0 && sender !== me && !sameTeam) this.engine.applySpecial(special);
      return;
    }
    if (target === 0) {
      if (me > 0) this.engine.applySpecial(special);
      return;
    }
    const name = SPECIAL_NAMES[special as SpecialLetter] ?? special;
    if (target === me && me > 0) {
      if (this.engine.alive()) {
        this.engine.applySpecial(special === 's' ? 's' + sender : special);
      }
      this.logAttack(`\x02\x13${name}\x13\x02 on \x02\x11${this.myNick()}\x11\x02 from \x11${senderNick}`);
    } else {
      this.logAttack(`\x02\x13${name}\x13\x02 on \x11${this.nameOf(target)}\x11 from \x11${senderNick}`);
      if (special === 's' && sender !== target) {
        // Show the switch between two other players right away (their `f` updates follow).
        const a = this.players()[target]?.field;
        const b = this.players()[sender]?.field;
        if (a !== undefined && b !== undefined && sender !== me) {
          this.patchPlayer(target, { field: b });
          this.patchPlayer(sender, { field: a });
        }
      }
    }
  }

  // =============================================================================================
  // Local actions
  // =============================================================================================

  /** Partyline input (Edit9). Handles /ME. */
  sendPartyline(text: string): void {
    if (!text || this.state() !== 'online') return;
    const me = this.myNum();
    const m = /^\/me\s+(.*)$/i.exec(text);
    if (m) {
      this.send(`plineact ${me} ${m[1]}`);
      this.addPartyline(`\x13* \x02${this.myNick()}\x02 ${m[1]}`);
    } else {
      this.send(`pline ${me} ${text}`);
      this.addPartyline(`\x02<\x1f${this.myNick()}\x1f>\x02 ${text}`);
    }
  }

  /** In-game message box (T). */
  sendGameMessage(text: string): void {
    if (!text || !this.inGame()) return;
    const m = /^\/me\s+(.*)$/i.exec(text);
    this.send(m ? `gmsg * ${this.myNick()} ${m[1]}` : `gmsg <${this.myNick()}> ${text}`);
  }

  setTeam(team: string): void {
    this.settings.team.set(team);
    const me = this.myNum();
    if (this.state() === 'online' && me > 0) {
      this.send(`team ${me} ${team}`);
      const p = this.players()[me];
      if (p) {
        this.patchPlayer(me, { team });
        this.addPartyline(
          team ? `\x10*** \x02${p.nick}\x02 is Now on Team \x02${team}\x02` : `\x10*** \x02${p.nick}\x02 is Now Alone`,
        );
      }
    }
  }

  keyDown(a: GameAction): void {
    this.engine.keyDown(a);
  }

  keyUp(a: GameAction): void {
    this.engine.keyUp(a);
  }

  useSpecial(target: number): void {
    this.engine.useSpecial(target);
  }

  discardSpecial(): void {
    this.engine.discard();
  }

  readonly showFields = signal(false);

  // =============================================================================================
  // helpers
  // =============================================================================================

  /** Nicknames are single words in the protocol. */
  loginNick(): string {
    return this.settings.nickname().trim().replace(/\s+/g, '_').substring(0, 15) || 'Player';
  }

  private nameOf(n: number): string {
    if (n === 0) return 'Server';
    return this.players()[n]?.nick ?? '?';
  }

  private setPlayer(n: number, p: PlayerState | null): void {
    if (n < 1 || n > MAX_PLAYERS) return;
    this.players.update((ps) => {
      const copy = [...ps];
      copy[n] = p;
      return copy;
    });
  }

  private patchPlayer(n: number, patch: Partial<PlayerState>): void {
    const p = this.players()[n];
    if (!p) return;
    this.setPlayer(n, { ...p, ...patch });
  }

  /** `AvgLevelCalc` 0x4459ac. */
  private recalcAvg(): void {
    let sum = 0;
    let cnt = 0;
    for (const p of this.players()) {
      if (p && !p.dead) {
        sum += p.level;
        cnt++;
      }
    }
    this.avgLevel.set(cnt ? Math.floor(sum / cnt) : 0);
  }

  private logAttack(text: string): void {
    this.attackNo++;
    this.attacks.update((a) => [...a.slice(-199), `${this.attackNo}. ${text}`]);
  }

  addPartyline(text: string): void {
    this.partyline.update((a) => [...a.slice(-499), text]);
    if (!this.partylineVisible()) this.partylineUnread.set(true);
  }

  private addGameMessage(text: string): void {
    this.gameMessages.update((a) => [...a, text].slice(-3));
  }

  /** Random number for UI needs that should not disturb the game RNG. */
  random(n: number): number {
    return this.rnd.next(n);
  }
}
