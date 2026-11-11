/** Panel17 — Game Winlist (0x44102e). */
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TetrinetService } from '../../services/tetrinet.service';
import { RichBox } from '../rich-text';

@Component({
  selector: 'app-winlist-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RichBox],
  template: `
    <div class="abs" style="left:-2px; top:-1px; width:592px; height:408px">
      <fieldset class="group" style="left:139px; top:1px; width:310px; height:399px">
        <span class="caption">Game Winlist</span>
        <app-rich-box class="winlist" style="left:34px; top:29px" [width]="242" [height]="341" [bold]="true" [center]="true"
                      [fontSize]="13" [lines]="lines()" />
      </fieldset>
    </div>
  `,
  styles: `
    :host { position: absolute; inset: 0; }
    .winlist { font-family: var(--ui-font); }
  `,
})
export class WinlistPage {
  private readonly tn = inject(TetrinetService);

  protected readonly lines = computed(() => {
    const out: string[] = [];
    this.tn
      .winlist()
      .slice(0, 10)
      .forEach((e, i) => {
        const colour = i === 0 ? '\x14' : i < 3 ? '\x10' : '';
        const team = e.key.startsWith('t') ? '<T> ' : '';
        out.push('');
        out.push(`${colour}${team}\x1f${e.key.substring(1)}\x1f with ${e.points} point${e.points === 1 ? '' : 's'}`);
      });
    return out;
  });
}
