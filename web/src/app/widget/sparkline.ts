import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Mini-gráfico SVG: linha + área com 16% de opacidade, na cor corrente (currentColor). */
@Component({
  selector: 'pw-sparkline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      @if (paths(); as p) {
        <path class="area" [attr.d]="p.area" />
        <path class="line" [attr.d]="p.line" vector-effect="non-scaling-stroke" />
      }
    </svg>
  `,
  styles: `
    :host { display: block; color: inherit; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .line { fill: none; stroke: currentColor; stroke-width: var(--spark-width, 1.6px); stroke-linejoin: round; stroke-linecap: round; transition: stroke 600ms ease; }
    .area { fill: currentColor; opacity: 0.16; stroke: none; transition: fill 600ms ease; }
  `,
})
export class Sparkline {
  readonly data = input.required<readonly number[]>();
  readonly tick = input(0);
  /** Degraus (tema Terminal) em vez de linha contínua. */
  readonly step = input(false);

  protected readonly paths = computed(() => {
    this.tick();
    const d = this.data();
    if (d.length < 2) return null;
    let min = Infinity;
    let max = -Infinity;
    for (const v of d) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // Faixa mínima de 6 °C para não amplificar ruído de ±1 grau
    const span = Math.max(max - min, 6);
    const mid = (max + min) / 2;
    const lo = mid - span / 2;
    const step = 100 / (d.length - 1);
    const stairs = this.step();
    let line = '';
    let prevY = '';
    for (let i = 0; i < d.length; i++) {
      const x = (i * step).toFixed(2);
      const y = (28 - ((d[i] - lo) / span) * 26).toFixed(2);
      if (stairs && i) line += 'L' + x + ' ' + prevY;
      line += (i ? 'L' : 'M') + x + ' ' + y;
      prevY = y;
    }
    return { line, area: `${line}L100 30L0 30Z` };
  });
}
