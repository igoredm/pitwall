import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface Blob {
  path: string;
  from: string;
  to: string;
  drops: { x: number; y: number; r: number }[];
}

/** Manchas de tinta do tema Splash: formas irregulares suaves + gotas. Estático (zero custo por frame). */
@Component({
  selector: 'pw-splash-blobs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="vertical() ? '0 0 400 1100' : '0 0 1280 400'" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        @for (b of blobs(); track $index) {
          <linearGradient [attr.id]="'sb' + $index" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" [attr.stop-color]="b.from" />
            <stop offset="1" [attr.stop-color]="b.to" />
          </linearGradient>
        }
      </defs>
      @for (b of blobs(); track $index) {
        <g [attr.fill]="'url(#sb' + $index + ')'">
          <path [attr.d]="b.path" />
          @for (d of b.drops; track $index) {
            <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="d.r" />
          }
        </g>
      }
    </svg>
  `,
  styles: `
    :host { position: absolute; inset: 0; pointer-events: none; opacity: var(--glow-opacity); }
    svg { width: 100%; height: 100%; display: block; }
  `,
})
export class SplashBlobs {
  readonly vertical = input(false);
  readonly dark = input(true);

  protected readonly blobs = computed<Blob[]>(() => {
    const d = this.dark();
    const center = d ? ['#7B5CFF', '#FF2E88'] : ['#FFD23F', '#FF7A1A'];
    const spots: [number, number, number, string, string][] = this.vertical()
      ? [
          [200, 560, 190, center[0], center[1]],
          [20, 90, 150, '#00D4FF', '#7B5CFF'],
          [390, 380, 120, '#FF2E88', '#FF7A1A'],
          [30, 900, 140, '#9BE22E', '#00C9A7'],
          [380, 1060, 130, '#FFD23F', '#9BE22E'],
        ]
      : [
          [640, 200, 190, center[0], center[1]],
          [60, 40, 150, '#00D4FF', '#7B5CFF'],
          [1230, 60, 140, '#FF2E88', '#FF7A1A'],
          [120, 380, 120, '#9BE22E', '#00C9A7'],
          [1180, 390, 130, '#FFD23F', '#9BE22E'],
        ];
    return spots.map(([cx, cy, r, from, to], i) => blob(cx, cy, r, from, to, i + 1));
  });
}

/** Forma de 10 pontos com raio variável, suavizada com Catmull-Rom → Bézier; gotas ao redor. */
function blob(cx: number, cy: number, r: number, from: string, to: string, seed: number): Blob {
  const rnd = mulberry32(seed * 7919);
  const n = 10;
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.72 + rnd() * 0.45);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  let path = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    path += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  path += 'Z';
  const drops = Array.from({ length: 9 }, () => {
    const a = rnd() * Math.PI * 2;
    const dist = r * (1.05 + rnd() * 0.55);
    return { x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: 3 + rnd() * 11 };
  });
  return { path, from, to, drops };
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
