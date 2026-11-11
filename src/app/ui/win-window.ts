/**
 * A draggable Windows 95 style window frame. Client area size matches the Delphi ClientWidth/Height.
 */
import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';

@Component({
  selector: 'app-win-window',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="frame" [class.inactive]="!active()" (pointerdown)="focused.emit()">
      <div class="titlebar" (pointerdown)="startDrag($event)">
        <img class="icon" src="assets/ui/icon.png" alt="" width="16" height="16" />
        <span class="title">{{ caption() }}</span>
        @if (minimizable()) {
          <button class="tbtn min" aria-label="Minimize" (click)="minimize.emit()" (pointerdown)="$event.stopPropagation()"></button>
        }
        @if (closable()) {
          <button class="tbtn close" aria-label="Close" (click)="closed.emit()" (pointerdown)="$event.stopPropagation()"></button>
        }
      </div>
      <div class="client" [style.width.px]="clientWidth()" [style.height.px]="clientHeight()">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host { position: absolute; left: var(--x); top: var(--y); }
    .frame {
      background: var(--face);
      padding: 3px;
      box-shadow: inset -1px -1px #000, inset 1px 1px var(--light), inset -2px -2px var(--shadow), inset 2px 2px #fff;
    }
    .titlebar {
      height: 18px;
      background: linear-gradient(90deg, #000080, #1084d0);
      color: #fff;
      display: flex;
      align-items: center;
      padding: 0 2px;
      gap: 3px;
      margin-bottom: 1px;
      user-select: none;
      cursor: default;
      touch-action: none;
    }
    .inactive .titlebar { background: linear-gradient(90deg, #808080, #b5b5b5); color: #c0c0c0; }
    .icon { width: 16px; height: 16px; image-rendering: pixelated; }
    .title { flex: 1; font-family: var(--ui-font); font-weight: bold; font-size: 11px; white-space: nowrap; overflow: hidden; }
    .tbtn {
      width: 16px; height: 14px; padding: 0; border: none; background: var(--face); position: relative;
      box-shadow: inset -1px -1px #000, inset 1px 1px #fff, inset -2px -2px var(--shadow), inset 2px 2px var(--light);
    }
    .tbtn:active { box-shadow: inset 1px 1px #000, inset -1px -1px #fff, inset 2px 2px var(--shadow); }
    .tbtn.close { margin-left: 2px; }
    .tbtn.close::before, .tbtn.close::after {
      content: ''; position: absolute; left: 4px; top: 6px; width: 8px; height: 2px; background: #000;
    }
    .tbtn.close::before { transform: rotate(45deg); }
    .tbtn.close::after { transform: rotate(-45deg); }
    .tbtn.min::before { content: ''; position: absolute; left: 4px; top: 9px; width: 6px; height: 2px; background: #000; }
    .client { position: relative; overflow: hidden; }
  `,
  host: {
    '[style.--x.px]': 'x()',
    '[style.--y.px]': 'y()',
    '[style.z-index]': 'z()',
  },
})
export class WinWindow {
  readonly caption = input('');
  readonly clientWidth = input(300);
  readonly clientHeight = input(200);
  readonly closable = input(false);
  readonly minimizable = input(true);
  readonly active = input(true);
  readonly z = input(1);
  readonly x = model(0);
  readonly y = model(0);
  readonly closed = output();
  readonly minimize = output();
  readonly focused = output();

  protected startDrag(ev: PointerEvent): void {
    const el = ev.currentTarget as HTMLElement;
    el.setPointerCapture(ev.pointerId);
    const sx = ev.clientX;
    const sy = ev.clientY;
    const ox = this.x();
    const oy = this.y();
    const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--zoom') || '1') || 1;
    const move = (e: PointerEvent) => {
      this.x.set(Math.round(ox + (e.clientX - sx) / zoom));
      this.y.set(Math.max(0, Math.round(oy + (e.clientY - sy) / zoom)));
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  }
}
