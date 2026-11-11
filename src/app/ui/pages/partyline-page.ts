/** Panel9 — Partyline: chat, player list, kick/ban, pause and start game. */
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { MAX_PLAYERS } from '../../engine/constants';
import { SettingsService } from '../../services/settings.service';
import { TetrinetService } from '../../services/tetrinet.service';
import { UiStateService } from '../../services/ui-state.service';
import { RichBox } from '../rich-text';

/** Ctrl+B / Ctrl+I / Ctrl+U insert the original formatting codes (0x44f100). */
export function insertFormatCode(ev: KeyboardEvent): boolean {
  if (!ev.ctrlKey || ev.altKey) return false;
  const code = { b: '\x02', i: '\x16', u: '\x1f' }[ev.key.toLowerCase()];
  if (!code) return false;
  const el = ev.target as HTMLInputElement;
  const s = el.selectionStart ?? el.value.length;
  const e = el.selectionEnd ?? s;
  el.setRangeText(code, s, e, 'end');
  el.dispatchEvent(new Event('input'));
  ev.preventDefault();
  return true;
}

@Component({
  selector: 'app-partyline-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichBox],
  template: `
    <div class="abs" style="left:0; top:-1px; width:591px; height:407px">
      <div class="lbl" style="left:5px; top:11px">Team You Are Playing On:&nbsp; (Blank For None)</div>
      <input class="edit" style="left:293px; top:5px; width:121px; height:22px" maxlength="20"
             [value]="team()" (input)="team.set($any($event.target).value)" (keydown.enter)="updateTeam()" />
      <button class="btn" style="left:423px; top:4px; width:165px; height:24px" type="button"
              [disabled]="!online()" (click)="updateTeam()">Update Team</button>
      @if (selectedLabel()) {
        <div class="lbl" style="left:422px; top:32px">{{ selectedLabel() }}</div>
      }
      <app-rich-box style="left:4px; top:36px" [width]="411" [height]="336" [lines]="tn.partyline()" />
      <input class="edit" style="left:4px; top:379px; width:412px; height:22px" maxlength="400"
             [disabled]="!online()" [value]="draft()" (input)="draft.set($any($event.target).value)"
             (keydown)="onKey($event)" aria-label="Partyline message" />
      <div class="listbox" style="left:422px; top:53px; width:165px; height:191px" role="listbox">
        @for (p of list(); track p.num) {
          <div class="item" [class.selected]="selected() === p.num" (click)="selected.set(p.num)">{{ p.text }}</div>
        }
      </div>
      <button class="btn" style="left:423px; top:250px; width:165px; height:25px" type="button"
              [disabled]="!canKick()" (click)="kick(false)">Kick</button>
      <button class="btn" style="left:423px; top:279px; width:165px; height:25px" type="button"
              [disabled]="!canKick()" (click)="kick(true)">Ban</button>
      <button class="btn" style="left:423px; top:348px; width:165px; height:24px" type="button"
              [disabled]="!tn.canControl() || !tn.inGame()" (click)="tn.togglePause()">
        {{ tn.paused() ? 'Unpause Game' : 'Pause Game' }}
      </button>
      <button class="btn" style="left:423px; top:377px; width:165px; height:24px" type="button"
              [disabled]="!tn.canControl()" (click)="startStop()">
        {{ tn.inGame() ? 'Stop Current Game' : 'Start New Game' }}
      </button>
    </div>
  `,
  styles: `:host { position: absolute; inset: 0; }`,
})
export class PartylinePage {
  protected readonly tn = inject(TetrinetService);
  private readonly settings = inject(SettingsService);
  private readonly ui = inject(UiStateService);

  protected readonly team = linkedSignal(() => this.settings.team());
  protected readonly draft = signal('');
  protected readonly selected = signal(0);
  protected readonly online = computed(() => this.tn.state() === 'online');

  /** `[*]<n>. <nick>[ - <team>]` (0x4421ec). */
  protected readonly list = computed(() => {
    const ps = this.tn.players();
    const out: { num: number; text: string }[] = [];
    let first = true;
    for (let i = 1; i <= MAX_PLAYERS; i++) {
      const p = ps[i];
      if (!p) continue;
      out.push({ num: i, text: `${first ? '*' : ''}${i}. ${p.nick}${p.team ? ' - ' + p.team : ''}` });
      first = false;
    }
    return out;
  });

  protected readonly selectedLabel = computed(() => {
    if (!this.tn.isHost()) return '';
    const n = this.selected();
    const p = this.tn.hostPlayers().find((x) => x.num === n);
    return p ? `Link: ${p.label}` : '';
  });

  protected readonly canKick = computed(
    () => this.tn.isHost() && this.selected() > 0 && this.selected() !== this.tn.myNum() && !!this.tn.players()[this.selected()],
  );

  protected updateTeam(): void {
    this.tn.setTeam(this.team().trim());
  }

  protected onKey(ev: KeyboardEvent): void {
    if (insertFormatCode(ev)) return;
    if (ev.key === 'Enter') {
      this.tn.sendPartyline(this.draft());
      this.draft.set('');
      (ev.target as HTMLInputElement).value = '';
    }
  }

  protected kick(ban: boolean): void {
    this.tn.kick(this.selected(), ban);
  }

  protected startStop(): void {
    if (this.tn.inGame()) {
      this.tn.stopGame();
      return;
    }
    const err = this.tn.startGame(this.settings.server());
    if (err) this.ui.alert(err, 'error');
  }
}
