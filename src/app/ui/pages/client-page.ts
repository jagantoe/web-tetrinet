/**
 * Panel8 — Client Settings. The original asked for a "Server IP"; in the browser you connect with
 * a join code (WebRTC), or by room id to a server running in another tab on this computer.
 */
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { form, FormField, maxLength, required } from '@angular/forms/signals';
import { SettingsService } from '../../services/settings.service';
import { TetrinetService } from '../../services/tetrinet.service';
import { UiStateService } from '../../services/ui-state.service';

interface ClientModel {
  room: string;
  nickname: string;
  iceServers: string;
}

@Component({
  selector: 'app-client-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField],
  template: `
    <div class="abs" style="left:-1px; top:-1px; width:592px; height:411px">
      <fieldset class="group" style="left:88px; top:134px; width:413px; height:135px">
        <span class="caption">Client Settings</span>
        <div class="lbl" style="left:6px; top:19px">Same-Computer Room (blank = Join Code):</div>
        <input class="edit" style="left:285px; top:14px; width:121px; height:22px" [formField]="f.room"
               [class.disabled]="busy()" />
        <div class="lbl" style="left:6px; top:42px">Your Nickname:</div>
        <input class="edit" style="left:285px; top:38px; width:121px; height:22px" [formField]="f.nickname"
               (keydown.enter)="connect()" />
        <div class="lbl" style="left:6px; top:66px">STUN/TURN Servers:</div>
        <input class="edit" style="left:150px; top:62px; width:256px; height:22px" [formField]="f.iceServers"
               title="Space separated. turn:user:pass@host:port is accepted for TURN relays." />
        <button class="btn" type="button" style="left:273px; top:104px; width:134px; height:25px" (click)="connect()"
                [disabled]="tn.isHost()">
          {{ tn.state() === 'offline' ? 'Connect' : 'Disconnect' }}
        </button>
      </fieldset>
    </div>
  `,
  styles: `:host { position: absolute; inset: 0; }`,
})
export class ClientPage {
  protected readonly tn = inject(TetrinetService);
  private readonly settings = inject(SettingsService);
  private readonly ui = inject(UiStateService);

  private readonly model = signal<ClientModel>({
    room: '',
    nickname: this.settings.nickname(),
    iceServers: this.settings.iceServers(),
  });
  protected readonly f = form(this.model, (p) => {
    required(p.nickname);
    maxLength(p.nickname, 15);
  });
  protected readonly busy = computed(() => this.tn.state() !== 'offline');

  protected async connect(): Promise<void> {
    if (this.tn.state() !== 'offline') {
      this.tn.disconnect();
      return;
    }
    const m = this.model();
    if (!m.nickname.trim()) {
      this.ui.alert('Please enter a nickname!', 'error');
      return;
    }
    this.settings.nickname.set(m.nickname.trim());
    this.settings.iceServers.set(m.iceServers.trim());
    if (m.room.trim()) {
      try {
        await this.tn.joinLocal(m.room);
        this.ui.page.set('partyline');
      } catch (e) {
        this.ui.alert((e as Error).message, 'error');
      }
    } else {
      this.ui.dialog.set('join');
    }
  }
}
