/**
 * Persistent client settings — the web equivalent of tetrinet.ini.
 * Stored in localStorage (per browser); every value is a signal and saved automatically.
 */
import { effect, Injectable, signal, WritableSignal } from '@angular/core';
import { DEFAULT_SERVER_SETTINGS, ServerSettings } from '../engine/constants';
import { GameAction } from '../engine/player-engine';
import { WinEntry } from '../net/host-server';
import { DEFAULT_ICE_SERVERS } from '../net/webrtc-transport';

export type KeyBindings = Record<GameAction, string>;

/** Default keys from the original Key Configuration (KeyboardEvent.code values). */
export const DEFAULT_KEYS: KeyBindings = {
  rotateRight: 'ArrowUp',
  rotateLeft: 'ControlLeft',
  down: 'ArrowDown',
  drop: 'Space',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

const STORAGE_KEY = 'web-tetrinet.ini';

interface Stored {
  nickname: string;
  team: string;
  keys: KeyBindings;
  sound: boolean;
  music: boolean;
  server: ServerSettings;
  serverPlaying: boolean;
  winlist: WinEntry[];
  iceServers: string;
  zoom: number;
}

function load(): Partial<Stored> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Stored>;
  } catch {
    return {};
  }
}

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly stored = load();
  readonly firstRun = Object.keys(this.stored).length === 0;

  readonly nickname = this.make('nickname', '');
  readonly team = this.make('team', '');
  readonly keys = this.make('keys', { ...DEFAULT_KEYS, ...(this.stored.keys ?? {}) });
  readonly sound = this.make('sound', true);
  readonly music = this.make('music', true);
  readonly server = this.make('server', {
    ...structuredClone(DEFAULT_SERVER_SETTINGS),
    ...(this.stored.server ?? {}),
  });
  readonly serverPlaying = this.make('serverPlaying', true);
  readonly winlist = this.make('winlist', []);
  readonly iceServers = this.make('iceServers', DEFAULT_ICE_SERVERS);
  readonly zoom = this.make('zoom', 1);

  constructor() {
    effect(() => {
      const data: Stored = {
        nickname: this.nickname(),
        team: this.team(),
        keys: this.keys(),
        sound: this.sound(),
        music: this.music(),
        server: this.server(),
        serverPlaying: this.serverPlaying(),
        winlist: this.winlist(),
        iceServers: this.iceServers(),
        zoom: this.zoom(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch {
        /* storage unavailable (private mode) — settings just won't persist */
      }
    });
  }

  private make<K extends keyof Stored>(key: K, fallback: Stored[K]): WritableSignal<Stored[K]> {
    const v = this.stored[key];
    return signal((v === undefined ? fallback : key === 'keys' || key === 'server' ? fallback : v) as Stored[K]);
  }
}

/** Human readable key name in the style of the original ("UP", "CONTROL", "SPACE"). */
export function keyLabel(code: string): string {
  const map: Record<string, string> = {
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    ControlLeft: 'CONTROL',
    ControlRight: 'CONTROL',
    ShiftLeft: 'SHIFT',
    ShiftRight: 'SHIFT',
    AltLeft: 'ALT',
    AltRight: 'ALT',
    Space: 'SPACE',
    Enter: 'RETURN',
    Tab: 'TAB',
    Insert: 'INSERT',
    Delete: 'DELETE',
    Home: 'HOME',
    End: 'END',
    PageUp: 'PAGE UP',
    PageDown: 'PAGE DOWN',
  };
  if (map[code]) return map[code]!;
  if (code.startsWith('Key')) return code.substring(3);
  if (code.startsWith('Digit')) return code.substring(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.substring(6).toUpperCase();
  return code.toUpperCase();
}
