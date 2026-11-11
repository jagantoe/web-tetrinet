/**
 * Serverless browser-to-browser transport using WebRTC data channels with manual
 * ("copy & paste") signalling:
 *
 *   1. The joining player creates a JOIN code (SDP offer + ICE candidates) and sends it to the host
 *      by any means (chat, e-mail, …).
 *   2. The host pastes it and gets a REPLY code (SDP answer) to send back.
 *   3. The joining player pastes the reply → the data channel opens.
 *
 * No game server is involved. Public STUN servers are only used to discover each browser's public
 * address so peers on different networks can reach each other; on a LAN none is needed.
 */
import { Connection } from './connection';

export const DEFAULT_ICE_SERVERS = 'stun:stun.l.google.com:19302';

const JOIN_PREFIX = 'TNJ1.';
const REPLY_PREFIX = 'TNR1.';

class RtcConnection extends Connection {
  constructor(
    private readonly pc: RTCPeerConnection,
    private readonly dc: RTCDataChannel,
  ) {
    super('peer');
    dc.onmessage = (ev) => this.deliver(String(ev.data));
    dc.onclose = () => this.remoteClosed();
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') this.remoteClosed();
    };
    this.addDisposer(() => {
      try {
        dc.close();
      } catch {
        /* ignore */
      }
      pc.close();
    });
  }

  send(msg: string): void {
    if (this.dc.readyState === 'open') this.dc.send(msg);
  }

  protected doClose(): void {
    /* disposer closes the channel */
  }
}

export function parseIceServers(spec: string): RTCIceServer[] {
  return spec
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((u) => {
      // turn:user:pass@host:port
      const m = /^(turns?):([^:@]+):([^@]+)@(.+)$/.exec(u);
      if (m) return { urls: `${m[1]}:${m[4]}`, username: m[2], credential: m[3] };
      return { urls: u };
    });
}

// ---------------------------------------------------------------------------------------------
// code encoding: deflate + base64url
// ---------------------------------------------------------------------------------------------

async function pack(prefix: string, sdp: string): Promise<string> {
  const minimal = sdp
    .split('\r\n')
    .filter((l) => l && !l.startsWith('a=extmap') && !l.startsWith('a=rtcp-fb'))
    .join('\n');
  const stream = new Blob([minimal]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const buf = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  return prefix + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function unpack(prefix: string, code: string): Promise<string> {
  const clean = code.replace(/\s+/g, '');
  if (!clean.startsWith(prefix)) {
    throw new Error(prefix === JOIN_PREFIX ? 'That is not a join code.' : 'That is not a reply code.');
  }
  const b64 = clean.substring(prefix.length).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const text = await new Response(stream).text();
  return text.split('\n').join('\r\n') + '\r\n';
}

function waitForIce(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, timeoutMs);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(t);
        resolve();
      }
    });
  });
}

function waitOpen(dc: RTCDataChannel, timeoutMs: number): Promise<void> {
  if (dc.readyState === 'open') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Unable to locate/connect to address!')), timeoutMs);
    dc.addEventListener('open', () => {
      clearTimeout(t);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------------------------
// joining side
// ---------------------------------------------------------------------------------------------

export class RtcJoinAttempt {
  private constructor(
    private readonly pc: RTCPeerConnection,
    private readonly dc: RTCDataChannel,
    readonly joinCode: string,
  ) {}

  static async create(iceServers: string): Promise<RtcJoinAttempt> {
    const pc = new RTCPeerConnection({ iceServers: parseIceServers(iceServers) });
    const dc = pc.createDataChannel('tetrinet', { ordered: true });
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc);
    const code = await pack(JOIN_PREFIX, pc.localDescription!.sdp);
    return new RtcJoinAttempt(pc, dc, code);
  }

  /** Paste the host's reply; resolves once the channel is open. */
  async complete(replyCode: string, timeoutMs = 20000): Promise<Connection> {
    const sdp = await unpack(REPLY_PREFIX, replyCode);
    await this.pc.setRemoteDescription({ type: 'answer', sdp });
    await waitOpen(this.dc, timeoutMs);
    return new RtcConnection(this.pc, this.dc);
  }

  cancel(): void {
    this.pc.close();
  }
}

// ---------------------------------------------------------------------------------------------
// host side
// ---------------------------------------------------------------------------------------------

/**
 * Host: turns a pasted join code into a reply code. `connected` resolves with the connection
 * once the joining player has pasted the reply.
 */
export async function acceptJoinCode(
  joinCode: string,
  iceServers: string,
  timeoutMs = 120000,
): Promise<{ replyCode: string; connected: Promise<Connection>; cancel: () => void }> {
  const sdp = await unpack(JOIN_PREFIX, joinCode);
  const pc = new RTCPeerConnection({ iceServers: parseIceServers(iceServers) });
  const channel = new Promise<RTCDataChannel>((resolve) => {
    pc.ondatachannel = (ev) => resolve(ev.channel);
  });
  await pc.setRemoteDescription({ type: 'offer', sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await waitForIce(pc);
  const replyCode = await pack(REPLY_PREFIX, pc.localDescription!.sdp);
  const connected = (async () => {
    const dc = await Promise.race([
      channel,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('The player did not connect in time.')), timeoutMs)),
    ]);
    await waitOpen(dc, timeoutMs);
    return new RtcConnection(pc, dc) as Connection;
  })();
  connected.catch(() => pc.close());
  return { replyCode, connected, cancel: () => pc.close() };
}
