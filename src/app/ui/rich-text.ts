/**
 * Renders lines containing the original TSRichEdit control codes (0x43a688):
 * 0x02 bold, 0x16 italic, 0x1F underline, colour codes with push/pop semantics.
 */
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, input, viewChild } from '@angular/core';

const COLOURS: Record<number, string> = {
  0x03: '#00ffff',
  0x04: '#000000',
  0x05: '#0000ff',
  0x06: '#808080',
  0x08: '#ff00ff',
  0x0b: '#808080',
  0x0c: '#008000',
  0x0e: '#00ff00',
  0x0f: '#c0c0c0',
  0x10: '#800000',
  0x11: '#000080',
  0x12: '#808000',
  0x13: '#800080',
  0x14: '#ff0000',
  0x15: '#c0c0c0',
  0x17: '#008080',
  0x18: '#ffffff',
  0x19: '#ffff00',
};

export interface Segment {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
}

export function parseRich(line: string, defaultColor = '#000000', defaultBold = false): Segment[] {
  const out: Segment[] = [];
  let bold = defaultBold;
  let italic = false;
  let underline = false;
  let color = defaultColor;
  const stack: string[] = [];
  let buf = '';
  const flush = () => {
    if (buf) out.push({ text: buf, bold, italic, underline, color });
    buf = '';
  };
  for (const ch of line) {
    const c = ch.charCodeAt(0);
    if (c === 0x02) {
      flush();
      bold = !bold;
    } else if (c === 0x16) {
      flush();
      italic = !italic;
    } else if (c === 0x1f) {
      flush();
      underline = !underline;
    } else if (COLOURS[c]) {
      flush();
      const col = COLOURS[c]!;
      if (col === color && stack.length) color = stack.pop()!;
      else {
        stack.push(color);
        color = col;
      }
    } else if (c === 0x1a || c === 0x1b) {
      flush();
    } else buf += ch;
  }
  flush();
  return out;
}

/** Strips all control codes (for plain labels). */
export function plainText(line: string): string {
  return parseRich(line)
    .map((s) => s.text)
    .join('');
}

@Component({
  selector: 'app-rich-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #box class="richbox" [style.left.px]="0" [style.top.px]="0" [style.width.px]="width()" [style.height.px]="height()"
         [style.text-align]="center() ? 'center' : null" [style.font-size.px]="fontSize()">
      @for (line of parsed(); track $index) {
        <div class="line">
          @for (s of line; track $index) {
            <span [style.font-weight]="s.bold ? 'bold' : null" [style.font-style]="s.italic ? 'italic' : null"
                  [style.text-decoration]="s.underline ? 'underline' : null" [style.color]="s.color">{{ s.text }}</span>
          }
          @if (line.length === 0) { &nbsp; }
        </div>
      }
    </div>
  `,
  styles: `
    :host { position: absolute; display: block; }
    .line { min-height: 14px; white-space: pre-wrap; }
  `,
})
export class RichBox {
  readonly lines = input.required<string[]>();
  readonly width = input(100);
  readonly height = input(100);
  readonly bold = input(false);
  readonly center = input(false);
  readonly fontSize = input(11);
  private readonly box = viewChild.required<ElementRef<HTMLDivElement>>('box');

  protected readonly parsed = computed(() => this.lines().map((l) => parseRich(l, '#000000', this.bold())));

  constructor() {
    effect(() => {
      this.parsed();
      const el = this.box().nativeElement;
      queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    });
  }
}
