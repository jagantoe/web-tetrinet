/** Panel6 — Server Settings (GroupBox1). The IP ban list area hosts the "accept player" controls. */
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal } from '@angular/core';
import { applyEach, form, FormField, max, min } from '@angular/forms/signals';
import { SettingsService } from '../../services/settings.service';
import { TetrinetService } from '../../services/tetrinet.service';
import { UiStateService } from '../../services/ui-state.service';
import { UpDown } from '../updown';

@Component({
  selector: 'app-server-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, UpDown],
  template: `
    <div class="abs" style="left:-2px; top:-1px; width:592px; height:410px">
      <fieldset class="group" style="left:4px; top:9px; width:587px; height:389px">
        <span class="caption">Server Settings</span>
        <div class="lbl" style="left:6px; top:20px">Your Nickname:</div>
        <input class="edit" style="left:167px; top:14px; width:121px; height:22px" maxlength="15"
               [value]="nick()" (input)="nick.set($any($event.target).value)" [disabled]="running()" />

        <div class="lbl" style="left:6px; top:44px">Classic Style Multiplayer Rules:</div>
        <label class="check" style="left:252px; top:42px; height:17px"><input type="checkbox" [formField]="f.classicRules" aria-label="Classic rules" /></label>
        <div class="lbl" style="left:6px; top:70px">Starting Level:</div>
        <app-updown style="left:233px; top:64px" [formField]="f.startingLevel" />
        <div class="lbl" style="left:6px; top:95px">Lines to Make Before Level Increase:</div>
        <app-updown style="left:233px; top:89px" [formField]="f.linesPerLevel" />
        <div class="lbl" style="left:6px; top:120px">Number of Levels to Increase Each Time:</div>
        <app-updown style="left:233px; top:114px" [formField]="f.levelIncrease" />
        <div class="lbl" style="left:6px; top:144px">All Have Players' Averaged Levels:</div>
        <label class="check" style="left:252px; top:141px; height:17px"><input type="checkbox" [formField]="f.averagedLevels" aria-label="Averaged levels" /></label>
        <div class="lbl" style="left:6px; top:168px">Lines to Make For Special Block:</div>
        <app-updown style="left:233px; top:162px" [formField]="f.linesPerSpecial" />
        <div class="lbl" style="left:6px; top:193px">Number of Special Blocks Added Each Time:</div>
        <app-updown style="left:233px; top:187px" [formField]="f.specialsAdded" />
        <div class="lbl" style="left:6px; top:218px">Capacity of Special Block Inventory:</div>
        <app-updown style="left:233px; top:212px" [formField]="f.specialCapacity" />

        <div class="lbl" style="left:297px; top:18px">Stack Height at Start:</div>
        @for (p of stackSlots; track p.i) {
          <div class="lbl" [style.left.px]="p.lx" [style.top.px]="p.y + 6">Player {{ p.i + 1 }}:</div>
          <app-updown [style.left.px]="p.ex" [style.top.px]="p.y" [formField]="f.stackHeights[p.i]!" />
        }
        <div class="lbl" style="left:297px; top:144px">Minutes Before Lines Start Being Added:</div>
        <app-updown style="left:524px; top:138px" [formField]="f.suddenDeathMinutes" />
        <div class="lbl" style="left:297px; top:169px">Seconds Between Lines Being Added:</div>
        <app-updown style="left:524px; top:163px" [formField]="f.suddenDeathSeconds" />

        <div class="lbl" style="left:11px; top:250px">Players Joining From Other Computers:</div>
        <div class="sunken joinbox" style="left:6px; top:265px; width:283px; height:118px">
          @if (!running()) {
            <p>Start the server first. Players then send you a <b>Join Code</b> and you answer with a
              <b>Reply Code</b> &mdash; no game server needed.</p>
          } @else {
            <button class="btn" type="button" style="left:8px; top:8px; width:150px; height:24px" (click)="accept()">
              Accept Joining Player...
            </button>
            <p style="position:absolute; top:36px; left:8px; right:8px; margin:0">
              Same computer (other tabs): Room <b class="room">{{ tn.roomId() }}</b><br />
              Players: {{ playerCount() }} / 6
            </p>
          }
        </div>

        <label class="check" style="left:334px; top:335px; height:17px">
          <input type="checkbox" [checked]="settings.serverPlaying()" [disabled]="running()"
                 (change)="tn.setServerPlaying($any($event.target).checked)" />
          Server Playing
        </label>
        <button class="btn" type="button" style="left:321px; top:359px; width:120px; height:25px" (click)="toggleServer()"
                [disabled]="!running() && tn.state() !== 'offline'">
          {{ running() ? 'Stop Server' : 'Start Server' }}
        </button>
        <button class="btn" type="button" style="left:455px; top:330px; width:120px; height:25px"
                (click)="ui.dialog.set('occurrence')">Block Occurancy</button>
        <button class="btn" type="button" style="left:455px; top:359px; width:120px; height:25px"
                [disabled]="!running()" (click)="tn.resetWinlist()">Reset Winlist</button>
      </fieldset>
    </div>
  `,
  styles: `
    :host { position: absolute; inset: 0; }
    .joinbox { padding: 6px 8px; font-size: 11px; line-height: 14px; }
    .joinbox p { margin: 0; }
    .room { font-family: monospace; font-size: 13px; letter-spacing: 1px; }
  `,
})
export class ServerPage {
  protected readonly tn = inject(TetrinetService);
  protected readonly settings = inject(SettingsService);
  protected readonly ui = inject(UiStateService);

  protected readonly f = form(this.settings.server, (p) => {
    min(p.startingLevel, 1);
    max(p.startingLevel, 100);
    min(p.linesPerLevel, 1);
    max(p.linesPerLevel, 100);
    min(p.levelIncrease, 0);
    max(p.levelIncrease, 50);
    min(p.linesPerSpecial, 1);
    max(p.linesPerSpecial, 50);
    min(p.specialsAdded, 0);
    max(p.specialsAdded, 50);
    min(p.specialCapacity, 0);
    max(p.specialCapacity, 18);
    min(p.suddenDeathMinutes, 0);
    max(p.suddenDeathMinutes, 60);
    min(p.suddenDeathSeconds, 1);
    max(p.suddenDeathSeconds, 300);
    applyEach(p.stackHeights, (h) => {
      min(h, 0);
      max(h, 22);
    });
  });

  protected readonly nick = linkedSignal(() => this.settings.nickname());
  protected readonly running = computed(() => this.tn.isHost());
  protected readonly playerCount = computed(() => this.tn.hostPlayers().length);

  protected readonly stackSlots = [
    { i: 0, lx: 303, ex: 372, y: 39 },
    { i: 1, lx: 303, ex: 372, y: 64 },
    { i: 2, lx: 303, ex: 372, y: 89 },
    { i: 3, lx: 455, ex: 524, y: 39 },
    { i: 4, lx: 455, ex: 524, y: 64 },
    { i: 5, lx: 455, ex: 524, y: 89 },
  ];

  protected toggleServer(): void {
    if (this.running()) {
      this.tn.stopServer();
      return;
    }
    const nick = this.nick().trim();
    if (!nick) {
      this.ui.alert('Please enter a nickname!', 'error');
      return;
    }
    this.settings.nickname.set(nick);
    this.tn.startServer();
    this.ui.page.set('partyline');
  }

  protected accept(): void {
    this.ui.dialog.set('accept');
  }
}
