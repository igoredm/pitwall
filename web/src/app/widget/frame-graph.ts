import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../i18n';

/** Gráfico de frametime por frame (dados reais do PresentMon), com linha de referência na mediana. */
@Component({
  selector: 'pw-frame-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 200 40" preserveAspectRatio="none" [attr.aria-label]="s().frameGraph">
      @if (model(); as m) {
        <line class="median" x1="0" x2="200" [attr.y1]="m.median" [attr.y2]="m.median" vector-effect="non-scaling-stroke" />
        <path class="line" [attr.d]="m.path" vector-effect="non-scaling-stroke" />
      }
    </svg>
    @if (model(); as m) {
      <span class="max">{{ m.maxMs }} ms</span>
    }
  `,
  styles: `
    :host { position: relative; display: block; }
    svg { width: 100%; height: 100%; display: block; overflow: visible; }
    .line { fill: none; stroke: var(--accent); stroke-width: 1.4px; stroke-linejoin: round; }
    .median { stroke: var(--text3); stroke-width: 1px; stroke-dasharray: 3 3; }
    .max { position: absolute; right: 0; top: -1.3em; font-size: 0.7em; color: var(--text3); }
  `,
})
export class FrameGraph {
  protected readonly s = inject(I18n).s;
  readonly frames = input.required<readonly number[]>();
  readonly tick = input(0);

  protected readonly model = computed(() => {
    this.tick();
    const f = this.frames();
    if (f.length < 4) return null;
    const sorted = [...f].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    // Escala: 3× a mediana (picos acima disso encostam no topo, como no Afterburner)
    const max = sorted[sorted.length - 1];
    const top = Math.max(med * 1.5, Math.min(max * 1.1, med * 3));
    const step = 200 / (f.length - 1);
    let path = '';
    for (let i = 0; i < f.length; i++) {
      const y = 40 - Math.min(1, f[i] / top) * 38;
      path += (i ? 'L' : 'M') + (i * step).toFixed(1) + ' ' + y.toFixed(1);
    }
    return { path, median: 40 - (med / top) * 38, maxMs: Math.round(max) };
  });
}
