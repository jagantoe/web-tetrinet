/**
 * New dialogs replacing "type the server's IP address": the WebRTC join/reply code exchange.
 */
import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { TetrinetService } from '../../services/tetrinet.service';
import { UiStateService } from '../../services/ui-state.service';

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* clipboard blocked — the user can still select the text */
  }
}

/** Player side: show join code, paste reply code. Client 420x260. */
@Component({
  selector: 'app-join-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lbl" style="left:10px; top:10px; font-weight:bold">1. Send this Join Code to the person running the server:</div>
    <textarea class="edit code" readonly style="left:10px; top:28px; width:330px; height:72px"
              [value]="joinCode() || 'Creating join code...'" (focus)="$any($event.target).select()"></textarea>
    <button class="btn" type="button" style="left:348px; top:28px; width:62px; height:24px" [disabled]="!joinCode()"
            (click)="copyJoin()">{{ copied() ? 'Copied!' : 'Copy' }}</button>

    <div class="lbl" style="left:10px; top:112px; font-weight:bold">2. Paste the Reply Code you get back:</div>
    <textarea class="edit code" style="left:10px; top:130px; width:400px; height:72px" [value]="reply()"
              (input)="reply.set($any($event.target).value)" aria-label="Reply code"></textarea>

    <div class="lbl status" style="left:10px; top:214px; width:260px">{{ status() }}</div>
    <button class="btn" type="button" style="left:254px; top:228px; width:75px; height:24px"
            [disabled]="!joinCode() || !reply().trim() || busy()" (click)="connect()">Connect</button>
    <button class="btn" type="button" style="left:335px; top:228px; width:75px; height:24px" (click)="cancel()">Cancel</button>
  `,
  styles: `
    :host { position: absolute; inset: 0; }
    .code { font-family: monospace; font-size: 10px; word-break: break-all; }
    .status { white-space: normal; color: #000080; }
  `,
})
export class JoinDialog implements OnInit {
  private readonly tn = inject(TetrinetService);
  private readonly ui = inject(UiStateService);
  readonly done = output();
  protected readonly joinCode = signal('');
  protected readonly reply = signal('');
  protected readonly status = signal('');
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      this.joinCode.set(await this.tn.createJoinCode());
      this.status.set('Waiting for your reply code...');
    } catch (e) {
      this.status.set((e as Error).message);
    }
  }

  protected async copyJoin(): Promise<void> {
    await copy(this.joinCode());
    this.copied.set(true);
  }

  protected async connect(): Promise<void> {
    this.busy.set(true);
    this.status.set('Connecting...');
    try {
      await this.tn.completeJoin(this.reply());
      this.ui.page.set('partyline');
      this.done.emit();
    } catch (e) {
      this.status.set((e as Error).message || 'Unable to locate/connect to address!');
      this.busy.set(false);
    }
  }

  protected cancel(): void {
    this.tn.cancelJoin();
    this.done.emit();
  }
}

/** Host side: paste join code, show reply code. Client 420x260. */
@Component({
  selector: 'app-accept-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="lbl" style="left:10px; top:10px; font-weight:bold">1. Paste the Join Code the player sent you:</div>
    <textarea class="edit code" style="left:10px; top:28px; width:330px; height:72px" [value]="join()"
              [disabled]="!!replyCode()" (input)="join.set($any($event.target).value)" aria-label="Join code"></textarea>
    <button class="btn" type="button" style="left:348px; top:28px; width:62px; height:24px"
            [disabled]="!join().trim() || busy() || !!replyCode()" (click)="create()">Reply</button>

    <div class="lbl" style="left:10px; top:112px; font-weight:bold">2. Send this Reply Code back to the player:</div>
    <textarea class="edit code" readonly style="left:10px; top:130px; width:330px; height:72px" [value]="replyCode()"
              (focus)="$any($event.target).select()"></textarea>
    <button class="btn" type="button" style="left:348px; top:130px; width:62px; height:24px" [disabled]="!replyCode()"
            (click)="copyReply()">{{ copied() ? 'Copied!' : 'Copy' }}</button>

    <div class="lbl status" style="left:10px; top:214px; width:240px">{{ status() }}</div>
    <button class="btn" type="button" style="left:254px; top:228px; width:75px; height:24px" [disabled]="!replyCode()"
            (click)="another()">Next Player</button>
    <button class="btn" type="button" style="left:335px; top:228px; width:75px; height:24px" (click)="done.emit()">Close</button>
  `,
  styles: `
    :host { position: absolute; inset: 0; }
    .code { font-family: monospace; font-size: 10px; word-break: break-all; }
    .status { white-space: normal; color: #000080; }
  `,
})
export class AcceptDialog {
  private readonly tn = inject(TetrinetService);
  readonly done = output();
  protected readonly join = signal('');
  protected readonly replyCode = signal('');
  protected readonly status = signal('');
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);

  protected async create(): Promise<void> {
    this.busy.set(true);
    this.status.set('Creating reply code...');
    try {
      const res = await this.tn.acceptJoin(this.join());
      this.replyCode.set(res.replyCode);
      this.status.set('Waiting for the player to paste the reply code...');
      res.connected.then(
        () => this.status.set('Player connected! You can accept another player.'),
        (e: Error) => this.status.set(e.message),
      );
    } catch (e) {
      this.status.set((e as Error).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async copyReply(): Promise<void> {
    await copy(this.replyCode());
    this.copied.set(true);
  }

  protected another(): void {
    this.join.set('');
    this.replyCode.set('');
    this.copied.set(false);
    this.status.set('');
  }
}
