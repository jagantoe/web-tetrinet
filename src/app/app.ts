import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { AudioService } from './services/audio.service';
import { SettingsService } from './services/settings.service';
import { TetrinetService } from './services/tetrinet.service';
import { DialogKind, UiStateService } from './services/ui-state.service';
import { AcceptDialog, JoinDialog } from './ui/dialogs/connect-dialogs';
import { KeyDialog } from './ui/dialogs/key-dialog';
import { OccurrenceDialog } from './ui/dialogs/occurrence-dialog';
import { FieldsWindow } from './ui/fields-window';
import { MainWindow } from './ui/main-window';
import { WinWindow } from './ui/win-window';

const MAIN_W = 591 + 6;
const MAIN_H = 440 + 25;
const FIELDS_W = 599 + 6;
const FIELDS_H = 445 + 25;

const DIALOGS: Record<Exclude<DialogKind, null>, { caption: string; w: number; h: number }> = {
  join: { caption: 'Connect to Server', w: 420, h: 260 },
  accept: { caption: 'Accept Joining Player', w: 420, h: 260 },
  occurrence: { caption: 'Block Occurancy', w: 396, h: 349 },
  key: { caption: 'Key Change', w: 271, h: 60 },
};

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WinWindow, MainWindow, FieldsWindow, OccurrenceDialog, KeyDialog, JoinDialog, AcceptDialog],
  template: `
    <div class="desktop" [style.zoom]="zoom()" (pointerdown)="audio.unlock()" (keydown)="audio.unlock()">
      <app-win-window caption="TetriNET v1.13" [clientWidth]="591" [clientHeight]="440"
                      [(x)]="mainX" [(y)]="mainY" [z]="ui.active() === 'main' ? 2 : 1"
                      [active]="ui.active() === 'main' && !ui.dialog()" (focused)="ui.active.set('main')">
        <app-main-window />
      </app-win-window>

      @if (tn.showFields()) {
        <app-win-window caption="TetriNET Playing Fields" [clientWidth]="599" [clientHeight]="463"
                        [(x)]="fieldsX" [(y)]="fieldsY" [z]="ui.active() === 'fields' ? 2 : 1" [closable]="true"
                        [active]="ui.active() === 'fields' && !ui.dialog()" (focused)="focusFields()"
                        (closed)="hideFields()" (minimize)="hideFields()">
          <app-fields-window />
        </app-win-window>
      }

      @if (dialog(); as d) {
        <div class="modal-shade"></div>
        <app-win-window [caption]="d.caption" [clientWidth]="d.w" [clientHeight]="d.h" [z]="10"
                        [x]="center(d.w, 'x')" [y]="center(d.h, 'y')" [minimizable]="false" [closable]="d.kind !== 'key'"
                        (closed)="closeDialog()">
          @switch (d.kind) {
            @case ('occurrence') { <app-occurrence-dialog (done)="closeDialog()" /> }
            @case ('key') { <app-key-dialog (done)="closeDialog()" /> }
            @case ('join') { <app-join-dialog (done)="closeDialog()" /> }
            @case ('accept') { <app-accept-dialog (done)="closeDialog()" /> }
          }
        </app-win-window>
      }

      @if (ui.messageBox(); as m) {
        <div class="modal-shade"></div>
        <app-win-window [caption]="m.title" [clientWidth]="msgWidth(m.text)" [clientHeight]="msgHeight(m.text)" [z]="20"
                        [x]="center(msgWidth(m.text), 'x')" [y]="center(msgHeight(m.text), 'y')"
                        [minimizable]="false" [closable]="true" (closed)="ui.messageBox.set(null)">
          <div class="msg">
            <div class="msgicon" [class.error]="m.icon === 'error'">{{ m.icon === 'error' ? 'X' : 'i' }}</div>
            <div class="msgtext">{{ m.text }}</div>
            <button class="btn" type="button" autofocus (click)="ui.messageBox.set(null)"
                    [style.left.px]="msgWidth(m.text) / 2 - 37" [style.top.px]="msgHeight(m.text) - 34"
                    style="width:75px; height:23px">OK</button>
          </div>
        </app-win-window>
      }
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .desktop { position: relative; width: calc(100vw / var(--zoom)); height: calc(100vh / var(--zoom)); overflow: hidden; }
    .modal-shade { position: absolute; inset: 0; z-index: 9; }
    .msg { position: absolute; inset: 0; }
    .msgicon { position: absolute; left: 14px; top: 14px; width: 32px; height: 32px; border-radius: 50%; background: #fff;
               border: 2px solid #000080; color: #000080; font: bold italic 20px Georgia, serif; display: flex;
               align-items: center; justify-content: center; }
    .msgicon.error { background: #ff0000; border-color: #800000; color: #fff; font: bold 16px Arial; }
    .msgtext { position: absolute; left: 60px; top: 14px; right: 14px; font-family: var(--ui-font); font-size: 11px;
               line-height: 14px; white-space: pre-wrap; }
  `,
  host: { '[style.--zoom]': 'zoom()' },
})
export class App {
  protected readonly tn = inject(TetrinetService);
  protected readonly ui = inject(UiStateService);
  protected readonly audio = inject(AudioService);
  private readonly settings = inject(SettingsService);

  protected readonly zoom = computed(() => this.settings.zoom());
  private readonly viewport = signal({ w: window.innerWidth, h: window.innerHeight });

  protected readonly mainX = signal(0);
  protected readonly mainY = signal(0);
  protected readonly fieldsX = signal(0);
  protected readonly fieldsY = signal(0);

  protected readonly dialog = computed(() => {
    const k = this.ui.dialog();
    return k ? { kind: k, ...DIALOGS[k] } : null;
  });

  constructor() {
    window.addEventListener('resize', () => this.viewport.set({ w: window.innerWidth, h: window.innerHeight }));
    this.layout();
    effect(() => {
      this.zoom();
      this.layout();
    });
    // Bring the playing fields to the front whenever a new game starts.
    effect(() => {
      if (this.tn.showFields() && this.tn.inGame()) {
        this.ui.active.set('fields');
        // Like the original playing-fields window taking focus: leave any text box.
        (document.activeElement as HTMLElement | null)?.blur?.();
      }
    });
    effect(() => {
      const err = this.tn.lastError();
      if (err) {
        this.ui.alert(err, 'error');
        this.tn.lastError.set('');
      }
    });
    if (this.settings.firstRun) {
      this.ui.alert(
        "Since this is your first time playing, you are STRONGLY recommended to read the included TETRINET.TXT before you play to get an understanding of TetriNET's enhancements over ordinary Tetris.",
      );
    }
  }

  private layout(): void {
    const z = this.settings.zoom();
    const vw = window.innerWidth / z;
    const vh = window.innerHeight / z;
    if (vw >= MAIN_W + FIELDS_W + 30) {
      const left = Math.max(0, (vw - MAIN_W - FIELDS_W - 20) / 2);
      this.mainX.set(Math.round(left));
      this.fieldsX.set(Math.round(left + MAIN_W + 20));
      const top = Math.max(0, Math.round((vh - Math.max(MAIN_H, FIELDS_H)) / 2));
      this.mainY.set(top);
      this.fieldsY.set(top);
    } else {
      this.mainX.set(Math.max(0, Math.round((vw - MAIN_W) / 2)));
      this.mainY.set(Math.max(0, Math.round((vh - MAIN_H) / 2)));
      this.fieldsX.set(Math.max(0, Math.round((vw - FIELDS_W) / 2) + 20));
      this.fieldsY.set(Math.max(0, Math.round((vh - FIELDS_H) / 2) + 20));
    }
  }

  protected center(size: number, axis: 'x' | 'y'): number {
    const v = this.viewport();
    const z = this.zoom();
    const total = (axis === 'x' ? v.w : v.h) / z;
    return Math.max(0, Math.round((total - size - (axis === 'x' ? 6 : 25)) / 2));
  }

  protected msgWidth(text: string): number {
    return Math.min(560, Math.max(260, 80 + Math.min(text.length, 90) * 5.6));
  }

  protected msgHeight(text: string): number {
    const perLine = Math.floor((this.msgWidth(text) - 74) / 5.6);
    const lines = Math.ceil(text.length / perLine);
    return 60 + lines * 14;
  }

  protected focusFields(): void {
    this.ui.active.set('fields');
    const el = document.activeElement as HTMLElement | null;
    if (el && el.closest('app-main-window')) el.blur();
  }

  protected hideFields(): void {
    this.tn.showFields.set(false);
    this.ui.active.set('main');
  }

  protected closeDialog(): void {
    if (this.ui.dialog() === 'join' && this.tn.state() === 'connecting') this.tn.cancelJoin();
    this.ui.dialog.set(null);
  }
}
