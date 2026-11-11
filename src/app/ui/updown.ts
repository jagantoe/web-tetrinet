/**
 * Read-only TEdit + TUpDown pair, as used on the Server Settings screen.
 * Implements a signal-forms custom control (`value` model) so it works with [formField].
 */
import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'app-updown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <input class="edit" readonly [value]="value()" [style.left.px]="0" [style.top.px]="0"
           [style.width.px]="editWidth()" [style.height.px]="22" [disabled]="disabled()"
           (keydown.arrowup)="step(1); $event.preventDefault()" (keydown.arrowdown)="step(-1); $event.preventDefault()"
           (wheel)="step($event.deltaY < 0 ? 1 : -1); $event.preventDefault()" />
    <div class="updown" [style.left.px]="editWidth()" [style.top.px]="0" [style.width.px]="10" [style.height.px]="22">
      <button class="btn up" type="button" tabindex="-1" [disabled]="disabled()" (click)="step(1)">+</button>
      <button class="btn down" type="button" tabindex="-1" [disabled]="disabled()" (click)="step(-1)">-</button>
    </div>
  `,
  styles: `:host { position: absolute; display: block; height: 22px; } .updown .btn { position: relative; }`,
})
export class UpDown {
  readonly value = model(0);
  readonly min = input<number | undefined>(undefined);
  readonly max = input<number | undefined>(undefined);
  readonly editWidth = input(47);
  readonly disabled = input(false);

  protected step(d: number): void {
    if (this.disabled()) return;
    this.value.set(Math.min(this.max() ?? 100, Math.max(this.min() ?? 0, this.value() + d)));
  }
}
