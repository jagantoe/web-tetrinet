/**
 * Form2 — "TetriNET Playing Fields" (client 599x445). Coordinates from the TFORM2 resource.
 */
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { MAX_PLAYERS, SPECIAL_NAMES, SpecialLetter } from '../engine/constants';
import { GameAction } from '../engine/player-engine';
import { keyLabel, SettingsService } from '../services/settings.service';
import { TetrinetService } from '../services/tetrinet.service';
import { UiStateService } from '../services/ui-state.service';
import { FieldCanvas, InventoryCanvas, NextPieceCanvas } from './canvases';
import { insertFormatCode } from './pages/partyline-page';
import { RichBox } from './rich-text';

interface SmallSlot {
  bevelX: number;
  bevelY: number;
}

/** Small field positions for slots 2..6 (Bevel32/33/34/35/36). */
const SMALL: SmallSlot[] = [
  { bevelX: 303, bevelY: 1 },
  { bevelX: 402, bevelY: 1 },
  { bevelX: 501, bevelY: 1 },
  { bevelX: 402, bevelY: 199 },
  { bevelX: 501, bevelY: 199 },
];

@Component({
  selector: 'app-fields-window',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FieldCanvas, NextPieceCanvas, InventoryCanvas, RichBox],
  template: `
    <!-- own field -->
    <div class="bevel-lowered" style="left:0; top:1px; width:194px; height:372px"></div>
    <div class="panel hdr" style="left:1px; top:2px; width:192px; height:18px; background:#c0c0c0">{{ header(bigPlayer()) }}</div>
    <app-field-canvas style="left:1px; top:20px" [field]="bigField()" [piece]="bigPiece()" [team]="teamOf(bigPlayer())" />

    <!-- other fields -->
    @for (s of smallSlots(); track $index) {
      <div class="bevel-lowered" [style.left.px]="s.bevelX" [style.top.px]="s.bevelY" style="width:98px; height:196px"></div>
      <div class="panel hdr" [style.left.px]="s.bevelX + 1" [style.top.px]="s.bevelY + 1" style="width:96px; height:18px">
        {{ header(s.player) }}
      </div>
      <app-field-canvas [style.left.px]="s.bevelX + 1" [style.top.px]="s.bevelY + 19" [small]="true"
                        [field]="fieldOf(s.player)" [team]="teamOf(s.player)" />
    }

    <!-- next piece, lines, level -->
    <div class="lbl" style="left:213px; top:19px">Next Piece:</div>
    <div class="bevel-lowered" style="left:212px; top:33px; width:74px; height:74px"></div>
    <div class="abs" style="left:213px; top:34px; width:72px; height:72px; background:#000; border:1px solid #000"></div>
    <app-next-piece style="left:217px; top:37px" [piece]="engine.nextPiece()" />
    <div class="lbl" style="left:205px; top:121px">Lines:</div>
    <div class="lbl num" style="left:265px; top:120px; width:29px">{{ engine.lines() }}</div>
    <div class="lbl" style="left:205px; top:146px">Level:</div>
    <div class="lbl num" style="left:264px; top:145px; width:30px">{{ engine.level() }}</div>
    @if (tn.averagedLevels()) {
      <div class="abs" style="left:199px; top:160px; width:100px; height:23px">
        <div class="lbl" style="left:5px; top:-1px; font-weight:bold">Active Level:</div>
        <div class="lbl num" style="left:65px; top:-2px; width:30px">{{ tn.avgLevel() }}</div>
      </div>
    }

    <!-- attacks / defenses -->
    <div class="lbl" style="left:201px; top:191px">Attacks/Defenses:</div>
    <app-rich-box style="left:197px; top:204px" [width]="201" [height]="165" [lines]="tn.attacks()" />

    <!-- inventory -->
    <div class="lbl" style="left:1px; top:380px; width:106px; overflow:hidden; font-size:11px">{{ specialLabel() }}</div>
    <div class="abs" style="left:107px; top:375px; width:292px; height:22px"></div>
    <app-inventory style="left:110px; top:378px" [inventory]="engine.inventory()" [capacity]="engine.capacity" />
    <div class="abs sel" style="left:107px; top:375px; width:22px; height:22px"></div>

    <!-- game messages -->
    <div class="bevel-lowered" style="left:1px; top:399px; width:597px; height:45px"></div>
    <div class="abs gmsg" style="left:2px; top:400px; width:595px; height:43px">
      @for (m of messages(); track $index) {
        <div>{{ m }}&nbsp;</div>
      }
    </div>
    @if (typing()) {
      <input #msg class="abs msgbox" style="left:0; top:426px; width:599px; height:18px" maxlength="200"
             (keydown)="onMsgKey($event)" aria-label="Game message" />
    }

    <!-- key reference (not in the original; window extended by 18px to hold it) -->
    <div class="abs keys" style="left:1px; top:446px; width:597px; height:16px" aria-label="Key bindings">
      @for (k of keyHelp(); track k.label) {
        <span>{{ k.label }}: <b>{{ k.key }}</b></span>
      }
    </div>
  `,
  styles: `
    :host { position: absolute; inset: 0; outline: none; }
    .hdr { font-family: 'Small Fonts', Arial, sans-serif; font-size: 9px; color: #000; white-space: nowrap; }
    .num { text-align: right; font-weight: bold; font-size: 12px; line-height: 15px; }
    .sel { box-shadow: inset 0 0 0 3px #ff0000; pointer-events: none; }
    .gmsg { background: #000; color: #fff; font-family: var(--arial); font-size: 11px; line-height: 14px;
            padding-left: 2px; white-space: nowrap; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; }
    .keys { display: flex; justify-content: space-between; align-items: center; padding: 0 3px; box-sizing: border-box;
            font-family: var(--arial); font-size: 10px; color: #000; white-space: nowrap; overflow: hidden; }
    .msgbox { background: #fff; border: 1px solid #000; font-family: var(--arial); font-size: 11px; padding: 1px 2px; outline: none; }
  `,
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
  },
})
export class FieldsWindow {
  protected readonly tn = inject(TetrinetService);
  private readonly settings = inject(SettingsService);
  private readonly ui = inject(UiStateService);
  protected readonly engine = this.tn.engine;
  protected readonly typing = signal(false);
  private readonly msgInput = viewChild<ElementRef<HTMLInputElement>>('msg');

  constructor() {
    effect(() => {
      if (!this.tn.inGame()) this.typing.set(false);
    });
  }

  /** Slot mapping: own → big field; p < me → slot p+1; p > me → slot p. */
  private readonly me = computed(() => this.tn.myNum() || 1);

  protected readonly bigPlayer = computed(() => this.me());
  protected readonly smallSlots = computed(() => {
    const me = this.me();
    const out: { bevelX: number; bevelY: number; player: number }[] = [];
    for (let p = 1; p <= MAX_PLAYERS; p++) {
      if (p === me) continue;
      const slot = p < me ? p + 1 : p; // 2..6
      out.push({ ...SMALL[slot - 2]!, player: p });
    }
    return out;
  });

  protected readonly bigField = computed(() => {
    if (this.tn.myNum() > 0) return this.engine.field();
    return this.fieldOf(1);
  });
  protected readonly bigPiece = computed(() => (this.tn.myNum() > 0 ? this.engine.current() : null));

  protected readonly specialLabel = computed(() => {
    const inv = this.engine.inventory();
    return inv ? SPECIAL_NAMES[inv.charAt(0) as SpecialLetter] + ':' : 'No Special Blocks';
  });

  /** Current bindings plus the fixed keys handled in onKeyDown, for the reference strip. */
  protected readonly keyHelp = computed(() => {
    const k = this.settings.keys();
    return [
      { label: 'Left', key: keyLabel(k.left) },
      { label: 'Right', key: keyLabel(k.right) },
      { label: 'Rotate R', key: keyLabel(k.rotateRight) },
      { label: 'Rotate L', key: keyLabel(k.rotateLeft) },
      { label: 'Down', key: keyLabel(k.down) },
      { label: 'Drop', key: keyLabel(k.drop) },
      { label: 'Special', key: '1-6' },
      { label: 'Discard', key: 'D' },
      { label: 'Talk', key: 'T' },
    ];
  });

  protected readonly messages = computed(() => {
    const m = this.tn.gameMessages();
    return m.length ? [...new Array(Math.max(0, 3 - m.length)).fill(''), ...m] : [];
  });

  protected header(p: number): string {
    const pl = this.tn.players()[p];
    if (!pl) return 'Not Playing';
    const w = this.tn.winner();
    const won =
      w !== 0 &&
      this.tn.players().filter((x) => x).length > 1 &&
      (w === p || (pl.team !== '' && pl.team.toUpperCase() === (this.tn.players()[w]?.team ?? '').toUpperCase()));
    return `${p}. ${pl.nick}${won ? ' WON!' : ''}`;
  }

  protected fieldOf(p: number): string {
    return this.tn.players()[p]?.field ?? '0'.repeat(264);
  }

  protected teamOf(p: number): string {
    return this.tn.players()[p]?.team ?? '';
  }

  // ------------------------------------------------------------------------------------------
  // keyboard (Form2.FormKeyDown 0x4500cc)
  // ------------------------------------------------------------------------------------------

  private actionFor(code: string): GameAction | null {
    const keys = this.settings.keys();
    for (const [a, c] of Object.entries(keys)) {
      if (c === code) return a as GameAction;
      // Treat left/right modifier variants alike, like the original's virtual key codes.
      if (c.replace(/(Left|Right)$/, '') === code.replace(/(Left|Right)$/, '') && /^(Control|Shift|Alt)/.test(c)) {
        return a as GameAction;
      }
    }
    return null;
  }

  private gameKeysActive(ev: KeyboardEvent): boolean {
    if (!this.tn.showFields() || this.ui.active() !== 'fields' || this.ui.dialog() || this.ui.messageBox()) return false;
    const t = ev.target as HTMLElement | null;
    return !(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'));
  }

  protected onKeyDown(ev: KeyboardEvent): void {
    if (!this.gameKeysActive(ev)) return;
    const action = this.actionFor(ev.code);
    if (action) {
      ev.preventDefault();
      this.tn.keyDown(action);
      return;
    }
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
    const digit = /^(Digit|Numpad)([1-6])$/.exec(ev.code);
    if (digit) {
      ev.preventDefault();
      if (!ev.repeat) this.tn.useSpecial(Number(digit[2]));
      return;
    }
    if (ev.code === 'KeyD') {
      ev.preventDefault();
      if (!ev.repeat) this.tn.discardSpecial();
      return;
    }
    if (ev.code === 'KeyT' && this.tn.inGame()) {
      ev.preventDefault();
      this.typing.set(true);
      setTimeout(() => this.msgInput()?.nativeElement.focus());
    }
  }

  protected onKeyUp(ev: KeyboardEvent): void {
    const action = this.actionFor(ev.code);
    if (action) this.tn.keyUp(action);
  }

  protected onMsgKey(ev: KeyboardEvent): void {
    ev.stopPropagation();
    if (insertFormatCode(ev)) return;
    const el = ev.target as HTMLInputElement;
    if (ev.key === 'Escape') {
      this.typing.set(false);
    } else if (ev.key === 'Enter') {
      this.tn.sendGameMessage(el.value);
      el.value = '';
      this.typing.set(false);
    }
  }
}
