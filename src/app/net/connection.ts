/**
 * A bidirectional text-message link between a client and the host.
 * Messages use the original TetriNET text protocol (one message per send, no 0xFF terminator needed).
 */
export abstract class Connection {
  onMessage: (msg: string) => void = () => {};
  onClose: () => void = () => {};
  private closed = false;
  private readonly disposers: (() => void)[] = [];

  constructor(readonly label: string) {}

  abstract send(msg: string): void;

  protected abstract doClose(): void;

  get isClosed(): boolean {
    return this.closed;
  }

  /** Registers transport cleanup that runs once when the link closes (either side). */
  addDisposer(fn: () => void): void {
    this.disposers.push(fn);
  }

  private dispose(): void {
    for (const d of this.disposers.splice(0)) d();
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.doClose();
    this.dispose();
    this.onClose();
  }

  /** For subclasses: the remote side went away. */
  protected remoteClosed(): void {
    if (this.closed) return;
    this.closed = true;
    this.dispose();
    this.onClose();
  }

  protected deliver(msg: string): void {
    if (!this.closed) this.onMessage(msg);
  }
}

/** In-memory link used by the host's own client. */
class LoopbackConnection extends Connection {
  peer!: LoopbackConnection;

  send(msg: string): void {
    const peer = this.peer;
    queueMicrotask(() => peer.receive(msg));
  }

  receive(msg: string): void {
    this.deliver(msg);
  }

  hangup(): void {
    this.remoteClosed();
  }

  protected doClose(): void {
    const peer = this.peer;
    queueMicrotask(() => peer.hangup());
  }
}

export function createLoopbackPair(): [Connection, Connection] {
  const a = new LoopbackConnection('local');
  const b = new LoopbackConnection('local');
  a.peer = b;
  b.peer = a;
  return [a, b];
}

/** Splits a protocol message into words (1-based semantics like the original parser). */
export function words(msg: string): string[] {
  return msg.split(' ');
}

/** Everything after the first `n` words (keeps inner spaces intact). */
export function restAfter(msg: string, n: number): string {
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const sp = msg.indexOf(' ', pos);
    if (sp < 0) return '';
    pos = sp + 1;
  }
  return msg.substring(pos);
}
