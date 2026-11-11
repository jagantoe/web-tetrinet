/**
 * Same-computer transport over BroadcastChannel: lets several browser tabs play together
 * without any network. Useful for testing and for "hot-seat" style LAN parties on one machine.
 */
import { Connection } from './connection';

interface Packet {
  t: 'hello' | 'welcome' | 'msg' | 'bye' | 'ping';
  from: string;
  to?: string;
  data?: string;
}

const PREFIX = 'web-tetrinet-room-';
const HEARTBEAT_MS = 1000;
const TIMEOUT_MS = 5000;

class ChannelConnection extends Connection {
  lastSeen = Date.now();

  constructor(
    private readonly channel: BroadcastChannel,
    private readonly selfId: string,
    readonly remoteId: string,
  ) {
    super('this computer');
  }

  send(msg: string): void {
    this.channel.postMessage({ t: 'msg', from: this.selfId, to: this.remoteId, data: msg } satisfies Packet);
  }

  receive(msg: string): void {
    this.lastSeen = Date.now();
    this.deliver(msg);
  }

  gone(): void {
    this.remoteClosed();
  }

  protected doClose(): void {
    this.channel.postMessage({ t: 'bye', from: this.selfId, to: this.remoteId } satisfies Packet);
  }
}

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Host side: accepts any tab that joins the room. */
export class LocalRoomHost {
  private readonly channel: BroadcastChannel;
  private readonly id = 'host';
  private readonly peers = new Map<string, ChannelConnection>();
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    readonly room: string,
    onConnection: (c: Connection) => void,
  ) {
    this.channel = new BroadcastChannel(PREFIX + room);
    this.channel.onmessage = (ev: MessageEvent<Packet>) => {
      const p = ev.data;
      if (p.to && p.to !== this.id) return;
      if (p.t === 'hello' && !this.peers.has(p.from)) {
        const c = new ChannelConnection(this.channel, this.id, p.from);
        this.peers.set(p.from, c);
        c.addDisposer(() => this.peers.delete(p.from));
        this.channel.postMessage({ t: 'welcome', from: this.id, to: p.from } satisfies Packet);
        onConnection(c);
      } else {
        const c = this.peers.get(p.from);
        if (!c) return;
        if (p.t === 'msg') c.receive(p.data ?? '');
        else if (p.t === 'ping') c.lastSeen = Date.now();
        else if (p.t === 'bye') c.gone();
      }
    };
    this.timer = setInterval(() => {
      this.channel.postMessage({ t: 'ping', from: this.id } satisfies Packet);
      const now = Date.now();
      for (const c of [...this.peers.values()]) if (now - c.lastSeen > TIMEOUT_MS) c.gone();
    }, HEARTBEAT_MS);
  }

  close(): void {
    clearInterval(this.timer);
    for (const c of [...this.peers.values()]) c.close();
    this.channel.close();
  }
}

/** Client side: joins a room on this computer. Resolves when the host answers. */
export function joinLocalRoom(room: string, timeoutMs = 3000): Promise<Connection> {
  return new Promise((resolve, reject) => {
    const channel = new BroadcastChannel(PREFIX + room);
    const id = newId();
    let conn: ChannelConnection | null = null;
    let hostSeen = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;
    const fail = setTimeout(() => {
      channel.close();
      reject(new Error('Unable to locate/connect to address!'));
    }, timeoutMs);
    channel.onmessage = (ev: MessageEvent<Packet>) => {
      const p = ev.data;
      if (p.from !== 'host') return;
      hostSeen = Date.now();
      if (p.to && p.to !== id) return;
      if (p.t === 'welcome' && !conn) {
        clearTimeout(fail);
        conn = new ChannelConnection(channel, id, 'host');
        const c = conn;
        timer = setInterval(() => {
          channel.postMessage({ t: 'ping', from: id, to: 'host' } satisfies Packet);
          if (Date.now() - hostSeen > TIMEOUT_MS) c.gone();
        }, HEARTBEAT_MS);
        c.addDisposer(() => {
          if (timer) clearInterval(timer);
          setTimeout(() => channel.close(), 50);
        });
        resolve(c);
      } else if (conn && p.t === 'msg') conn.receive(p.data ?? '');
      else if (conn && p.t === 'bye') conn.gone();
    };
    channel.postMessage({ t: 'hello', from: id, to: 'host' } satisfies Packet);
    window.addEventListener('pagehide', () => conn?.close());
  });
}
