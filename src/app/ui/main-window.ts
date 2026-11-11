/**
 * Form1 — "TetriNET v1.13" main window (client 591x440) with its six screens and the
 * bottom navigation panels. Coordinates come from the TFORM1 resource.
 */
import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { MainPage, UiStateService } from '../services/ui-state.service';
import { TetrinetService } from '../services/tetrinet.service';
import { TitlePage } from './pages/title-page';
import { PartylinePage } from './pages/partyline-page';
import { WinlistPage } from './pages/winlist-page';
import { MiscPage } from './pages/misc-page';
import { ClientPage } from './pages/client-page';
import { ServerPage } from './pages/server-page';

interface NavButton {
  page: MainPage | 'fields';
  caption: string;
  icon: string;
  left: number;
  width: number;
  iconTop: number;
}

@Component({
  selector: 'app-main-window',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TitlePage, PartylinePage, WinlistPage, MiscPage, ClientPage, ServerPage],
  template: `
    @switch (ui.page()) {
      @case ('title') { <app-title-page /> }
      @case ('partyline') { <app-partyline-page /> }
      @case ('winlist') { <app-winlist-page /> }
      @case ('misc') { <app-misc-page /> }
      @case ('client') { <app-client-page /> }
      @case ('server') { <app-server-page /> }
    }
    @for (b of buttons; track b.page) {
      <button type="button" class="nav" [style.left.px]="b.left" [style.width.px]="b.width"
              [class.pressed]="b.page !== 'fields' && ui.page() === b.page"
              [class.unread]="b.page === 'partyline' && tn.partylineUnread()"
              (click)="go(b.page)">
        <img [src]="'assets/ui/' + b.icon + '.png'" alt="" [style.top.px]="b.iconTop" />
        <span>{{ b.caption }}</span>
      </button>
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; display: block; }
    .nav {
      position: absolute; top: 414px; height: 24px; padding: 0 4px 0 0;
      font-family: var(--arial); font-size: 11px; text-align: right; color: #000;
      background: var(--face); border: 1px solid #000;
      box-shadow: inset -1px -1px var(--shadow), inset 1px 1px #fff;
    }
    .nav.pressed { box-shadow: inset 1px 1px var(--shadow), inset -1px -1px #fff; }
    .nav:active { box-shadow: inset 1px 1px var(--shadow), inset -1px -1px #fff; }
    .nav.unread { color: #008000; }
    .nav img { position: absolute; left: 2px; image-rendering: pixelated; }
  `,
})
export class MainWindow {
  protected readonly ui = inject(UiStateService);
  protected readonly tn = inject(TetrinetService);

  protected readonly buttons: NavButton[] = [
    { page: 'fields', caption: 'Show Fields', icon: 'tab-fields', left: 3, width: 97, iconTop: 3 },
    { page: 'partyline', caption: 'Partyline', icon: 'tab-partyline', left: 101, width: 96, iconTop: 2 },
    { page: 'winlist', caption: 'Win List', icon: 'tab-winlist', left: 198, width: 92, iconTop: 2 },
    { page: 'misc', caption: 'Misc. Settings', icon: 'tab-misc', left: 291, width: 96, iconTop: 2 },
    { page: 'client', caption: 'Client Settings', icon: 'tab-client', left: 388, width: 97, iconTop: 2 },
    { page: 'server', caption: 'Server Settings', icon: 'tab-server', left: 486, width: 102, iconTop: 4 },
  ];

  protected readonly partylineShown = computed(() => this.ui.page() === 'partyline');

  constructor() {
    effect(() => {
      const shown = this.partylineShown();
      this.tn.partylineVisible.set(shown);
      if (shown) this.tn.partylineUnread.set(false);
    });
  }

  protected go(page: MainPage | 'fields'): void {
    if (page === 'fields') {
      this.tn.showFields.set(true);
      this.ui.active.set('fields');
      return;
    }
    this.ui.page.set(page);
  }
}
