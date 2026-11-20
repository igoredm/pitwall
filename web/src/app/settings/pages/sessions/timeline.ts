import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n } from '../../../i18n';
import { SessionMarker, SessionSeries } from '../../../models';
import { extent, minuteTicks, seriesPaths, yTicks } from '../../reports';
import { SeriesKey } from './session-util';

const KEYS: SeriesKey[] = ['fps.current', 'gpu.hotspot', 'gpu.temp', 'gpu.power', 'cpu.temp'];

/**
 * "A partida inteira" (pw-timeline): segmentado FPS / Hot spot / Núcleo / Consumo / CPU, gráfico de 140 px com 4
 * valores no eixo Y, marcadores numerados, trilho de engasgos e a queda no fim. Nada anima: trocar a linha só troca
 * o desenho.
 */
@Component({
  selector: 'pw-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let sr = series();
    <div class="row tight hd">
      <div class="rl"><div class="lb">{{ sx.rp.wholeMatch }}</div></div>
      @if (keys().length > 1) {
        <span class="seg" role="group" [attr.aria-label]="sx.rp.chartLine">
          @for (k of keys(); track k) {
            <button type="button" [attr.aria-pressed]="key() === k" (click)="pick.set(k)">{{ sx.rp.segs[k] }}</button>
          }
        </span>
      }
    </div>
    @if (sr === undefined) {
      <div class="plot"><span></span><span class="skel" style="height: 140px"></span></div>
      <div class="pad"></div>
    } @else if (!sr || !sr.available || !chart()) {
      <div class="row gone"><span class="ht m0">{{ sx.rp.seriesGone }}</span></div>
    } @else {
      @let c = chart()!;
      <div class="plot" aria-hidden="true">
        <div class="yax">
          @for (v of c.ticks; track $index) {
            <span>{{ v }}</span>
          }
        </div>
        <div class="area">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="svg">
            @for (y of c.grid; track $index) {
              <line x1="0" x2="100" [attr.y1]="y" [attr.y2]="y" stroke="var(--hair)" stroke-width="1" vector-effect="non-scaling-stroke" />
            }
            <path [attr.d]="c.area" [attr.fill]="c.color" fill-opacity=".13" />
            <path [attr.d]="c.line" fill="none" [attr.stroke]="c.color" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          </svg>
          @for (m of marks(); track m.n) {
            <span class="mk" [style.left.%]="m.x"><b>{{ m.n }}</b></span>
          }
          @if (crashed()) {
            <span class="crash"></span>
          }
        </div>
      </div>
      @if (stutterTicks(); as st) {
        <div class="plot rail" aria-hidden="true">
          <span class="rl-l">{{ sx.rp.stuttersRail }}</span>
          <svg viewBox="0 0 100 16" preserveAspectRatio="none" class="rsvg">
            <line x1="0" x2="100" y1="8" y2="8" stroke="var(--hair)" stroke-width="1" vector-effect="non-scaling-stroke" />
            @for (x of st; track $index) {
              <line [attr.x1]="x" [attr.x2]="x" y1="2" y2="14" stroke="var(--y)" stroke-width="2" vector-effect="non-scaling-stroke" />
            }
          </svg>
        </div>
      }
      <div class="plot xax" aria-hidden="true">
        <span></span>
        <span class="axis">
          @for (a of xLabels(); track $index) {
            <span [style.left.%]="a.x" [class.first]="$first" [class.last]="$last" [class.red]="$last && crashed()">{{ a.text }}</span>
          }
        </span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .hd {
      padding: 12px 16px 0;
    }
    .tight {
      min-height: 0;
    }
    .m0 {
      margin: 0;
    }
    .gone {
      padding-bottom: 16px;
    }
    .pad {
      height: 14px;
    }
    .plot {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 8px;
      padding: 22px 16px 0;
    }
    .yax {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 11px;
      color: var(--tx3);
      font-weight: 600;
      text-align: right;
      height: 140px;
      // os rótulos ficam nas linhas da grade (1/3 de passo de folga em cima e embaixo)
      padding: calc(140px / 11 - 7.5px) 0;
      box-sizing: border-box;
    }
    .area {
      position: relative;
    }
    .svg {
      display: block;
      width: 100%;
      height: 140px;
      overflow: visible;
    }
    .mk {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 0;
      border-left: 1px dashed var(--tx3);
      b {
        position: absolute;
        top: -9px;
        left: -9px;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--sf);
        border: 1px solid var(--bd);
        font-size: 10.5px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--tx);
        box-sizing: border-box;
      }
    }
    .crash {
      position: absolute;
      top: 0;
      bottom: 0;
      right: 0;
      border-left: 2px solid var(--r);
    }
    .rail {
      padding-top: 8px;
      align-items: center;
    }
    .rl-l {
      font-size: 11px;
      color: var(--tx3);
      font-weight: 700;
      text-align: right;
    }
    .rsvg {
      display: block;
      width: 100%;
      height: 14px;
    }
    .xax {
      padding: 6px 16px 12px;
    }
    .axis {
      position: relative;
      height: 15px;
      font-size: 11px;
      color: var(--tx3);
      font-weight: 600;
      span {
        position: absolute;
        top: 0;
        transform: translateX(-50%);
        white-space: nowrap;
      }
      .first {
        transform: none;
      }
      .last {
        left: auto !important;
        right: 0;
        transform: none;
      }
      .red {
        color: var(--r);
      }
    }
  `,
})
export class Timeline {
  protected readonly s = inject(I18n).s;
  /** undefined = carregando; null = sem resposta. */
  readonly series = input<SessionSeries | null | undefined>(undefined);
  readonly durationSec = input.required<number>();
  readonly markers = input<SessionMarker[]>([]);
  readonly crashed = input(false);

  protected readonly pick = signal<SeriesKey>('fps.current');
  protected readonly keys = computed(() => {
    const sr = this.series()?.series ?? {};
    return KEYS.filter((k) => sr[k]?.some((v) => v != null));
  });
  protected readonly key = computed(() => (this.keys().includes(this.pick()) ? this.pick() : (this.keys()[0] ?? 'fps.current')));

  protected readonly chart = computed(() => {
    const data = this.series()?.series[this.key()];
    const ext = data ? extent(data) : null;
    if (!data || !ext) return null;
    const { ticks, lo, hi } = yTicks(ext[0], ext[1]);
    const yOf = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
    return {
      ticks: [...ticks].reverse(),
      grid: ticks.map(yOf),
      color: this.key() === 'fps.current' ? 'var(--g)' : 'var(--ac)',
      ...seriesPaths(data, lo, hi, { h: 100, yTop: 0, yBottom: 100 }),
    };
  });

  protected readonly marks = computed(() => {
    const d = this.durationSec() || 1;
    return this.markers().map((m, i) => ({ n: i + 1, x: Math.min(100, Math.max(0, (m.t / d) * 100)) }));
  });

  /** Engasgos no trilho: só quando a série traz a contagem acumulada (fps.stutters); um tique onde ela sobe. */
  protected readonly stutterTicks = computed(() => {
    const raw = (this.series()?.series as Record<string, (number | null)[]> | undefined)?.['fps.stutters'];
    if (!raw?.length) return null;
    const out: number[] = [];
    let prev = 0;
    raw.forEach((v, i) => {
      if (v == null) return;
      for (let k = 0; k < Math.min(5, v - prev); k++) out.push(((i + 0.5 - k * 0.15) / raw.length) * 100);
      prev = Math.max(prev, v);
    });
    return out;
  });

  protected readonly xLabels = computed(() => {
    const s = this.s();
    const d = this.durationSec();
    const end = Math.max(1, Math.round(d / 60));
    const ticks = minuteTicks(d).map((m) => ({ x: (m * 60 * 100) / d, text: m ? s.rp.minutes(m) : '0' }));
    return [...ticks, { x: 100, text: this.crashed() ? `${s.rp.minutes(end)} · ${s.rp.pcWentOff}` : s.rp.minutes(end) }];
  });
}
