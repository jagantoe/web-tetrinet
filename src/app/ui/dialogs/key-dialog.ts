/** Form4 — "Key Change" (client 271x60). */
import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { SettingsService } from '../../services/settings.service';
import { UiStateService } from '../../services/ui-state.service';

@Component({
  selector: 'app-key-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="lbl" style="left:40px; top:22px; font-size:13px; line-height:16px">Press a Key to Change Setting...</div>`,
  styles: `:host { position: absolute; inset: 0; }`,
  host: { '(document:keydown)': 'onKey($event)' },
})
export class KeyDialog {
  private readonly settings = inject(SettingsService);
  private readonly ui = inject(UiStateService);
  readonly done = output();

  protected onKey(ev: KeyboardEvent): void {
    ev.preventDefault();
    ev.stopPropagation();
    const action = this.ui.keyToChange();
    if (action && ev.code !== 'Escape') {
      this.settings.keys.update((k) => ({ ...k, [action]: ev.code }));
    }
    this.done.emit();
  }
}
