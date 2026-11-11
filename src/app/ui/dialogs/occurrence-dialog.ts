/** Form3 — "Block Occurancy" (client 396x349). */
import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { form, FormField, max, min } from '@angular/forms/signals';
import { PieceFrequencies, SpecialFrequencies, sumValues } from '../../engine/constants';
import { SettingsService } from '../../services/settings.service';

interface OccurrenceModel {
  specials: SpecialFrequencies;
  pieces: PieceFrequencies;
}

/** Raised 10x10 bevels that draw the piece pictures (Bevel1..Bevel28). */
const PIECE_BEVELS: [number, number][] = [
  [237, 22], [237, 32], [247, 32], [257, 32], // J
  [237, 47], [247, 47], [247, 57], [257, 57], // Z
  [237, 72], [237, 82], [247, 82], [247, 72], // O
  [257, 97], [237, 107], [247, 107], [257, 107], // L
  [257, 122], [237, 132], [247, 132], [247, 122], // S
  [247, 147], [237, 157], [247, 157], [257, 157], // T
  [267, 178], [237, 178], [247, 178], [257, 178], // I
];

@Component({
  selector: 'app-occurrence-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField],
  template: `
    <div class="lbl" style="left:4px; top:5px">Occurancy of Special Blocks: (in Percent)</div>
    @for (s of specialRows; track s.key) {
      <div class="lbl" [style.left.px]="s.lx" [style.top.px]="s.y + 5">{{ s.label }}</div>
      <input class="edit" type="number" [style.left.px]="127" [style.top.px]="s.y" style="width:47px; height:22px"
             [formField]="$any(f.specials)[s.key]" [attr.aria-label]="s.label" />
    }
    <div class="lbl" style="left:4px; top:284px">Total Percent:</div>
    <div class="lbl" style="left:102px; top:284px; width:71px; text-align:right" [style.color]="specialTotal() === 100 ? null : 'red'">{{ specialTotal() }}</div>

    <div class="lbl" style="left:220px; top:5px">Occurancy of Pieces: (in Percent)</div>
    @for (b of bevels; track $index) {
      <div class="bevel-raised" [style.left.px]="b[0]" [style.top.px]="b[1]" style="width:10px; height:10px"></div>
    }
    @for (p of pieceRows; track p.key) {
      <input class="edit" type="number" [style.left.px]="337" [style.top.px]="p.y" style="width:47px; height:22px"
             [formField]="$any(f.pieces)[p.key]" [attr.aria-label]="p.key + ' piece'" />
    }
    <div class="lbl" style="left:225px; top:283px">Total Percent:</div>
    <div class="lbl" style="left:313px; top:283px; width:71px; text-align:right" [style.color]="pieceTotal() === 100 ? null : 'red'">{{ pieceTotal() }}</div>

    <button class="btn" type="button" style="left:144px; top:318px; width:108px; height:25px" (click)="ok()">OK</button>
  `,
  styles: `
    :host { position: absolute; inset: 0; }
    input[type=number]::-webkit-inner-spin-button { display: none; }
    input[type=number] { -moz-appearance: textfield; }
  `,
})
export class OccurrenceDialog {
  private readonly settings = inject(SettingsService);
  readonly done = output();

  private readonly model = signal<OccurrenceModel>({
    specials: { ...this.settings.server().specials },
    pieces: { ...this.settings.server().pieces },
  });
  protected readonly f = form(this.model, (p) => {
    for (const k of Object.keys(this.model().specials) as (keyof SpecialFrequencies)[]) {
      min(p.specials[k], 0);
      max(p.specials[k], 100);
    }
    for (const k of Object.keys(this.model().pieces) as (keyof PieceFrequencies)[]) {
      min(p.pieces[k], 0);
      max(p.pieces[k], 100);
    }
  });

  protected readonly specialTotal = computed(() => sumValues(this.model().specials));
  protected readonly pieceTotal = computed(() => sumValues(this.model().pieces));
  protected readonly bevels = PIECE_BEVELS;

  protected readonly specialRows: { key: keyof SpecialFrequencies; label: string; lx: number; y: number }[] = [
    { key: 'a', label: 'Add Lines:', lx: 16, y: 21 },
    { key: 'c', label: 'Clear Lines:', lx: 15, y: 46 },
    { key: 'n', label: 'Nuke Field:', lx: 15, y: 71 },
    { key: 'r', label: 'Random Blocks Clr:', lx: 15, y: 96 },
    { key: 's', label: 'Switch Fields:', lx: 14, y: 121 },
    { key: 'b', label: 'Clear Special Blks:', lx: 14, y: 146 },
    { key: 'g', label: 'Block Gravity:', lx: 14, y: 171 },
    { key: 'q', label: 'Blockquake:', lx: 14, y: 196 },
    { key: 'o', label: 'Block Bomb:', lx: 14, y: 221 },
  ];
  protected readonly pieceRows: { key: keyof PieceFrequencies; y: number }[] = [
    { key: 'J', y: 21 },
    { key: 'Z', y: 46 },
    { key: 'O', y: 71 },
    { key: 'L', y: 96 },
    { key: 'S', y: 121 },
    { key: 'T', y: 146 },
    { key: 'I', y: 171 },
  ];

  protected ok(): void {
    const m = this.model();
    const clean = <T extends object>(o: T): T =>
      Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.max(0, Math.min(100, Math.round(Number(v) || 0)))])) as T;
    this.settings.server.update((s) => ({ ...s, specials: clean(m.specials), pieces: clean(m.pieces) }));
    this.done.emit();
  }
}
