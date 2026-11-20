import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Primitivas de um ícone de traço (viewBox 24, traço 1.7, pontas redondas). */
type Prim = { d: string } | { c: [number, number, number]; fill?: 'solid' | 'knock' } | { r: [number, number, number, number, number] };

/**
 * Conjunto de ícones autoral do app 1.0 (design-notes › Espaço e tipo › Ícones). Nunca emoji nem glifo unicode como
 * ícone. Os caminhos são os do canvas.
 */
const ICONS: Record<string, Prim[]> = {
  overview: [{ d: 'M4 16a8 8 0 0 1 16 0' }, { d: 'M12 16l4.5-4.5' }],
  widget: [{ r: [3, 6, 18, 12, 2] }, { d: 'M9.5 6v12' }],
  metrics: [{ d: 'M5 19v-8' }, { d: 'M12 19V5' }, { d: 'M19 19v-5' }],
  alerts: [{ d: 'M6.5 16v-5a5.5 5.5 0 0 1 11 0v5l1.5 2h-14z' }, { d: 'M10 20.5a2.2 2.2 0 0 0 4 0' }],
  games: [
    { d: 'M7.5 8.5h9a4.5 4.5 0 0 1 4.4 5.4l-.5 2.4a2.6 2.6 0 0 1-4.5 1.2L14.5 15h-5l-1.4 2.5a2.6 2.6 0 0 1-4.5-1.2l-.5-2.4a4.5 4.5 0 0 1 4.4-5.4z' },
    { d: 'M8.5 10.5v3' },
    { d: 'M7 12h3' },
  ],
  sessions: [{ c: [12, 12, 8.5] }, { d: 'M12 7.5V12l3 2' }],
  // 1.2: monitor (linha de pulso numa tela) e relatório do PC (torre com ponto de estado)
  monitor: [{ r: [3, 4.5, 18, 12.5, 2] }, { d: 'M6.5 11h2.5l1.5-3 3 6 1.5-3h2.5' }, { d: 'M9 20.5h6' }],
  health: [{ r: [6.5, 3, 11, 18, 2] }, { d: 'M9.5 7h5' }, { d: 'M9.5 10.5h5' }, { c: [12, 16.5, 1.3], fill: 'solid' }],
  gpu: [{ r: [6, 6, 12, 12, 2] }, { d: 'M10 3v3M14 3v3M10 18v3M14 18v3M3 10h3M3 14h3M18 10h3M18 14h3' }],
  devices: [{ r: [2.5, 5, 13, 10, 1.5] }, { d: 'M6.5 19h5' }, { r: [17, 9, 5, 10, 1.2] }],
  features: [{ d: 'M4 8h16M4 16h16' }, { c: [9, 8, 2.4], fill: 'knock' }, { c: [15, 16, 2.4], fill: 'knock' }],
  app: [{ c: [12, 12, 8.5] }, { d: 'M12 11v5.5' }, { d: 'M12 7.6v.1' }],
  search: [{ c: [11, 11, 6] }, { d: 'M20 20l-4.5-4.5' }],
  check: [{ d: 'M5 12.5l4.2 4L19 7' }],
  chevron: [{ d: 'M9.5 6l6 6-6 6' }],
  chevronDown: [{ d: 'M6 9.5l6 6 6-6' }],
  x: [{ d: 'M6 6l12 12M18 6L6 18' }],
  plus: [{ d: 'M12 5v14M5 12h14' }],
  download: [{ d: 'M12 4v11' }, { d: 'M7 10.5l5 5 5-5' }, { d: 'M5 20h14' }],
  grip: [
    { c: [9, 6, 1.2], fill: 'solid' },
    { c: [15, 6, 1.2], fill: 'solid' },
    { c: [9, 12, 1.2], fill: 'solid' },
    { c: [15, 12, 1.2], fill: 'solid' },
    { c: [9, 18, 1.2], fill: 'solid' },
    { c: [15, 18, 1.2], fill: 'solid' },
  ],
  file: [{ d: 'M6 3.5h8l4 4v13H6z' }, { d: 'M14 3.5v4h4' }, { d: 'M9 13h6M9 16.5h6' }],
  refresh: [{ d: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3' }, { d: 'M19.5 4.5v4h-4' }],
  eye: [{ d: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z' }, { c: [12, 12, 2.8] }],
  battery: [{ r: [3, 7.5, 16, 9, 2] }, { d: 'M21 10.5v3' }, { d: 'M6 10.5v3M9 10.5v3' }],
  warn: [{ d: 'M12 4l9 16H3z' }, { d: 'M12 10v4.5' }, { d: 'M12 17.4v.1' }],
  play: [{ d: 'M8 5.5v13l10.5-6.5z' }],
  folder: [{ d: 'M3.5 7a1.5 1.5 0 0 1 1.5-1.5h4l2 2h8A1.5 1.5 0 0 1 20.5 9v8.5A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z' }],
  phone: [{ r: [7, 3, 10, 18, 2] }, { d: 'M11 18h2' }],
  tv: [{ r: [2.5, 5, 19, 12, 1.5] }, { d: 'M8 20h8' }],
  desktop: [{ r: [3, 4.5, 18, 12, 1.5] }, { d: 'M9 20h6' }, { d: 'M12 16.5V20' }],
  power: [{ d: 'M12 3.5V12' }, { d: 'M6.6 7a7.5 7.5 0 1 0 10.8 0' }],
  // 1.2: marcar momento (bandeira), token de integração (chave) e integração (tomada)
  flag: [{ d: 'M6 21V4' }, { d: 'M6 4.5h11l-2.5 4 2.5 4H6' }],
  key: [{ c: [8, 15, 4] }, { d: 'M11 12l8.5-8.5' }, { d: 'M16 7l2.5 2.5' }, { d: 'M14 9l2 2' }],
  plug: [{ d: 'M9 3.5V8M15 3.5V8' }, { d: 'M6.5 8h11v3a5.5 5.5 0 0 1-11 0z' }, { d: 'M12 16.5v4' }],
  external: [{ d: 'M14 5h5v5' }, { d: 'M19 5l-8 8' }, { d: 'M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4' }],
  dpad: [{ d: 'M9.5 3h5v6.5H21v5h-6.5V21h-5v-6.5H3v-5h6.5z' }],
  undo: [{ d: 'M9 7L4.5 11.5 9 16' }, { d: 'M5 11.5h9.5a5 5 0 0 1 0 10H12' }],
  tray: [{ d: 'M4 14l2.5-8h11L20 14' }, { d: 'M4 14v5h16v-5h-5a3 3 0 0 1-6 0z' }],
  lock: [{ r: [5.5, 10.5, 13, 9.5, 2] }, { d: 'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5' }],
  copy: [{ r: [8.5, 8.5, 11, 11, 2] }, { d: 'M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5' }],
  // 1.2: relatórios (copiar para fórum, compartilhar, trocar A e B, relatório de jogo na navegação)
  chat: [{ d: 'M4.5 5.5h15v10h-9l-4 3.5v-3.5h-2z' }, { d: 'M8 9.5h8M8 12.5h5' }],
  share: [{ d: 'M12 15V4' }, { d: 'M7.5 8.5L12 4l4.5 4.5' }, { d: 'M5 13v6h14v-6' }],
  swap: [{ d: 'M7 4.5L4 7.5l3 3' }, { d: 'M4 7.5h16' }, { d: 'M17 13.5l3 3-3 3' }, { d: 'M20 16.5H4' }],
  backspace: [{ d: 'M9 5.5h10.5a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9L3 12z' }, { d: 'M12 9.5l5 5M17 9.5l-5 5' }],
};

/** <pw-icon name="sessions" [size]="17" />: herda a cor do texto (currentColor). Sempre decorativo (aria-hidden). */
@Component({
  selector: 'pw-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:inline-flex;flex-shrink:0' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      [attr.stroke-width]="stroke()"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      @for (p of prims(); track $index) {
        @if (p.kind === 'd') {
          <path [attr.d]="p.d" />
        } @else if (p.kind === 'c') {
          <circle [attr.cx]="p.c[0]" [attr.cy]="p.c[1]" [attr.r]="p.c[2]" [attr.fill]="p.fill === 'solid' ? 'currentColor' : p.fill === 'knock' ? 'var(--icon-bg, var(--bg))' : null" [attr.stroke]="p.fill === 'solid' ? 'none' : null" />
        } @else {
          <rect [attr.x]="p.r[0]" [attr.y]="p.r[1]" [attr.width]="p.r[2]" [attr.height]="p.r[3]" [attr.rx]="p.r[4]" />
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<string>();
  readonly size = input(17);
  readonly stroke = input(1.7);

  protected readonly prims = computed(() =>
    (ICONS[this.name()] ?? []).map((p) =>
      'd' in p
        ? { kind: 'd' as const, d: p.d, c: [0, 0, 0], r: [0, 0, 0, 0, 0], fill: '' }
        : 'c' in p
          ? { kind: 'c' as const, d: '', c: p.c, r: [0, 0, 0, 0, 0], fill: p.fill ?? '' }
          : { kind: 'r' as const, d: '', c: [0, 0, 0], r: p.r, fill: '' },
    ),
  );
}
