/** Panel15 — Misc. Settings: key configuration, music, sounds, theme. */
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameAction } from '../../engine/player-engine';
import { keyLabel, SettingsService } from '../../services/settings.service';
import { ThemeService } from '../../services/theme.service';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-misc-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="abs" style="left:-1px; top:-1px; width:592px; height:409px">
      <fieldset class="group" style="left:139px; top:29px; width:310px; height:188px">
        <span class="caption">Key Configuration</span>
        @for (k of keyRows; track k.action) {
          <div class="lbl" [style.left.px]="9" [style.top.px]="k.labelTop">{{ k.label }}</div>
          <input class="edit keyedit" readonly [style.left.px]="183" [style.top.px]="k.editTop" style="width:121px; height:22px"
                 [value]="label(settings.keys()[k.action])" (mousedown)="change(k.action)" (keydown.enter)="change(k.action)"
                 [attr.aria-label]="k.label" />
        }
      </fieldset>

      <div class="lbl" style="left:146px; top:239px">MIDI File to Play During Game:</div>
      <select class="edit" style="left:139px; top:255px; width:287px; height:22px; padding:1px"
              [value]="settings.music() ? 'on' : 'off'" (change)="settings.music.set($any($event.target).value === 'on')">
        <option value="on">data\\tetrinet.mid</option>
        <option value="off">(none)</option>
      </select>
      <button class="btn" type="button" style="left:429px; top:256px; width:19px; height:19px" disabled>...</button>

      <label class="check" style="left:227px; top:291px; height:17px">
        <input type="checkbox" [checked]="settings.sound()" (change)="settings.sound.set($any($event.target).checked)" />
        Sound Effects Activated
      </label>

      <div class="lbl" style="left:146px; top:327px">TetriNET Graphic/Sound/Music Theme:</div>
      <input class="edit" readonly style="left:139px; top:343px; width:287px; height:22px" [value]="theme.theme.name" />
      <button class="btn" type="button" style="left:429px; top:344px; width:19px; height:19px" disabled>...</button>

      <div class="lbl" style="left:146px; top:380px">Window Size:</div>
      <select class="edit" style="left:230px; top:376px; width:80px; height:22px; padding:1px"
              [value]="'' + settings.zoom()" (change)="settings.zoom.set(+$any($event.target).value)">
        <option value="1">100%</option>
        <option value="1.5">150%</option>
        <option value="2">200%</option>
      </select>
    </div>
  `,
  styles: `:host { position: absolute; inset: 0; } .keyedit { cursor: pointer; }`,
})
export class MiscPage {
  protected readonly settings = inject(SettingsService);
  protected readonly theme = inject(ThemeService);
  private readonly ui = inject(UiStateService);

  protected readonly keyRows: { action: GameAction; label: string; labelTop: number; editTop: number }[] = [
    { action: 'rotateRight', label: 'Rotate Piece Right:', labelTop: 20, editTop: 13 },
    { action: 'rotateLeft', label: 'Rotate Piece Left:', labelTop: 43, editTop: 36 },
    { action: 'down', label: 'Speed up Piece Falling:', labelTop: 66, editTop: 59 },
    { action: 'drop', label: 'Drop Pieces:', labelTop: 89, editTop: 82 },
    { action: 'left', label: 'Move Piece Left:', labelTop: 113, editTop: 106 },
    { action: 'right', label: 'Move Piece Right:', labelTop: 137, editTop: 130 },
  ];

  protected label(code: string): string {
    return keyLabel(code);
  }

  protected change(action: GameAction): void {
    this.ui.keyToChange.set(action);
    this.ui.dialog.set('key');
  }
}
