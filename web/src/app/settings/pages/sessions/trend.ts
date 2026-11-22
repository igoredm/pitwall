import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { I18n } from '../../../i18n';
import { TrendPoint } from '../../../models';
import { TelemetryService } from '../../../telemetry.service';
import { extent, num, shortDayTime, yTicks } from '../../reports';
import { driverChanges, driverShift, hotspotDelta, movingMedian, shiftSentence } from './trend-util';

/** Margem lateral dentro do SVG (o primeiro e o último ponto não encostam na borda). */
const PAD = 2;

interface Chart {
  key: string;
  ticks: string[];
  grid: number[];
  lines: { d: string; cls: string }[];
  dots: { x: number; y: number; cls: string; title: string }[];
}

/**
 * 1.3 · Relatórios de jogo › Tendência (#trend): um ponto por partida (≥ 2 min com FPS), FPS médio e 1% low, Δ médio
 * hot spot − núcleo com a mediana móvel de 5, linha vertical rotulada onde o driver muda e a frase de antes e depois
 * (só com ≥ 3 partidas de cada lado). SVG próprio, sem biblioteca; nada anima.
 */
@Component({
  selector: 'pw-session-trend',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let tr = t.trend();
    <div class="sh">
      <div class="min0">
        <h2>{{ sx.v13.trendTitle }}</h2>
        <div class="ht">{{ sx.v13.trendHint }}</div>
      </div>
      @if (tr && tr.games.length) {
        <select class="in sel" [attr.aria-label]="sx.v13.trendGame" (change)="pick($any($event.target).value)">
          @for (g of tr.games; track g.exe) {
            <option [value]="g.exe" [selected]="g.exe.toLowerCase() === exe().toLowerCase()">{{ sx.v13.trendGameOpt(g.exe, g.count) }}</option>
          }
        </select>
      }
    </div>
    <div class="grp">
      @if (!tr) {
        <div class="row"><span class="cap">{{ sx.loading }}</span></div>
      } @else if (points().length < 2) {
        <div class="row"><span class="ht m0">{{ sx.v13.trendEmpty }}</span></div>
      } @else {
        @for (c of charts(); track c.key; let first = $first) {
          <div [class.bt]="!first">
            <div class="row tight chd">
              <div class="rl">
                <div class="lb">{{ c.key === 'fps' ? sx.v13.trendFps : sx.v13.trendDelta }}</div>
                @if (c.key === 'delta') {
                  <div class="cap">{{ sx.v13.trendDeltaHint }}</div>
                }
              </div>
              <span class="lgs">
                @if (c.key === 'fps') {
                  <span class="lg"><i></i>{{ sx.v13.trendAvg }}</span>
                  <span class="lg"><i class="b"></i>{{ sx.v13.trendLow }}</span>
                } @else {
                  <span class="lg"><b class="dot"></b>{{ sx.v13.trendEach }}</span>
                  <span class="lg"><i></i>{{ sx.v13.trendMedian }}</span>
                }
              </span>
            </div>
            <div class="plot" role="img" [attr.aria-label]="c.key === 'fps' ? sx.v13.trendFpsAria(exe(), points().length) : sx.v13.trendDeltaAria(exe())">
              <div class="yax" aria-hidden="true">
                @for (v of c.ticks; track $index) {
                  <span>{{ v }}</span>
                }
              </div>
              <div class="area">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="svg">
                  @for (y of c.grid; track $index) {
                    <line x1="0" x2="100" [attr.y1]="y" [attr.y2]="y" stroke="var(--hair)" stroke-width="1" vector-effect="non-scaling-stroke" />
                  }
                  @for (d of drivers(); track d.index) {
                    <line [attr.x1]="d.x" [attr.x2]="d.x" y1="0" y2="100" stroke="var(--tx3)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
                  }
                  @for (l of c.lines; track $index) {
                    <path [attr.d]="l.d" [class]="l.cls" fill="none" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
                  }
                  @for (p of c.dots; track $index) {
                    <path [attr.d]="'M' + p.x + ' ' + p.y + 'h0'" [class]="p.cls" stroke-linecap="round" vector-effect="non-scaling-stroke"><title>{{ p.title }}</title></path>
                  }
                </svg>
                @if (first) {
                  @for (d of drivers(); track d.index) {
                    <span class="drv" [style.left.%]="d.x" [class.flip]="d.x > 70">{{ d.label }}</span>
                  }
                }
              </div>
            </div>
          </div>
        } @empty {
          <div class="row"><span class="cap">{{ sx.v13.trendEmpty }}</span></div>
        }
        @if (!hasDelta()) {
          <div class="row bt tight"><span class="cap">{{ sx.v13.trendNoDelta }}</span></div>
        }
        <div class="plot xax" aria-hidden="true">
          <span></span>
          <span class="axis">
            @for (x of xLabels(); track $index) {
              <span [style.left.%]="x.x" [class.first]="$first" [class.last]="$last">{{ x.text }}</span>
            }
          </span>
        </div>
        <div class="row bt shift">
          @if (shift(); as sh) {
            <div class="rl">
              <div class="lb">{{ sh.text }}</div>
              <div class="ht">{{ sh.note }}</div>
            </div>
          } @else {
            <span class="cap">{{ sx.v13.trendNoShift }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .min0 {
      min-width: 0;
    }
    .sel {
      max-width: 280px;
      min-width: 0;
      flex-shrink: 1;
      text-overflow: ellipsis;
    }
    .m0 {
      margin: 0;
    }
    .tight {
      min-height: 0;
    }
    .chd {
      padding: 12px 16px 0;
      align-items: flex-start;
    }
    .lgs {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .lg {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--tx2);
      font-weight: 600;
      white-space: nowrap;
      i {
        display: block;
        width: 16px;
        height: 0;
        border-top: 2px solid var(--ac);
      }
      i.b {
        border-top: 2px dashed var(--tx2);
      }
      .dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: var(--tx3);
      }
    }
    .plot {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 8px;
      padding: 12px 16px 4px;
    }
    .yax {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 11px;
      color: var(--tx3);
      font-weight: 600;
      text-align: right;
      height: 130px;
      padding: calc(130px / 11 - 7.5px) 0;
      box-sizing: border-box;
    }
    .area {
      position: relative;
      min-width: 0;
    }
    .svg {
      display: block;
      width: 100%;
      height: 130px;
      overflow: visible;
    }
    .l-avg {
      stroke: var(--ac);
      stroke-width: 1.8px;
    }
    .l-low {
      stroke: var(--tx2);
      stroke-width: 1.4px;
      stroke-dasharray: 5 4;
    }
    .l-med {
      stroke: var(--ac);
      stroke-width: 1.8px;
    }
    .p-avg {
      stroke: var(--ac);
      stroke-width: 6px;
    }
    .p-low {
      stroke: var(--tx2);
      stroke-width: 4px;
    }
    .p-delta {
      stroke: var(--tx3);
      stroke-width: 5px;
    }
    .drv {
      position: absolute;
      top: -4px;
      margin-left: 5px;
      font-size: 11px;
      font-weight: 700;
      color: var(--tx2);
      background: var(--sf);
      padding: 0 3px;
      white-space: nowrap;
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      &.flip {
        margin-left: 0;
        transform: translateX(calc(-100% - 5px));
      }
    }
    .xax {
      padding: 6px 16px 14px;
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
    }
    .shift .lb {
      font-size: 14.5px;
    }
  `,
})
export class SessionTrend {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;

  /** Jogo mostrado: o da resposta (o backend escolhe o mais jogado quando o pedido não tem exe). */
  protected readonly exe = computed(() => this.t.trend()?.exe ?? this.t.trend()?.games[0]?.exe ?? '');
  protected readonly points = computed<TrendPoint[]>(() => (this.t.trend()?.points ?? []).filter((p) => p.avgFps != null));

  constructor() {
    // Pede ao abrir e a cada reconexão (o jogo escolhido continua)
    effect(() => {
      if (this.t.connected()) untracked(() => this.t.requestTrend(this.t.trend()?.exe ?? undefined));
    });
  }

  protected pick(exe: string) {
    this.t.requestTrend(exe || undefined);
  }

  private xOf(i: number): number {
    const n = this.points().length;
    return n > 1 ? PAD + (i / (n - 1)) * (100 - 2 * PAD) : 50;
  }

  protected readonly drivers = computed(() => {
    const pts = this.points();
    const s = this.s();
    return driverChanges(pts).map((c) => ({ index: c.index, x: (this.xOf(c.index - 1) + this.xOf(c.index)) / 2, label: s.rp.driver(c.to) }));
  });

  protected readonly hasDelta = computed(() => this.points().some((p) => hotspotDelta(p) != null));

  protected readonly charts = computed<Chart[]>(() => {
    const s = this.s();
    const pts = this.points();
    if (pts.length < 2) return [];
    const when = (p: TrendPoint) => shortDayTime(p.start, s);
    const out: Chart[] = [];

    const avg = pts.map((p) => p.avgFps ?? null);
    const low = pts.map((p) => p.low1 ?? null);
    const fx = extent([...avg, ...low]);
    if (fx) {
      const { ticks, lo, hi } = yTicks(fx[0], fx[1]);
      const y = (v: number) => +(100 - ((v - lo) / (hi - lo)) * 100).toFixed(2);
      const tip = (p: TrendPoint) =>
        [when(p), `${s.v13.trendAvg} ${Math.round(p.avgFps!)}`, p.low1 != null ? `${s.v13.trendLow} ${Math.round(p.low1)}` : '', p.gpuDriver ? s.rp.driver(p.gpuDriver) : '']
          .filter(Boolean)
          .join(' · ');
      out.push({
        key: 'fps',
        ticks: [...ticks].reverse().map((v) => String(Math.round(v))),
        grid: ticks.map(y),
        lines: [
          { d: this.path(low, y), cls: 'l-low' },
          { d: this.path(avg, y), cls: 'l-avg' },
        ],
        dots: pts.flatMap((p, i) => [
          ...(p.low1 != null ? [{ x: this.xOf(i), y: y(p.low1), cls: 'p-low', title: tip(p) }] : []),
          { x: this.xOf(i), y: y(p.avgFps!), cls: 'p-avg', title: tip(p) },
        ]),
      });
    }

    const delta = pts.map(hotspotDelta);
    const med = movingMedian(delta, 5);
    const dx = extent(delta);
    if (dx) {
      const { ticks, lo, hi } = yTicks(dx[0], dx[1]);
      const y = (v: number) => +(100 - ((v - lo) / (hi - lo)) * 100).toFixed(2);
      out.push({
        key: 'delta',
        ticks: [...ticks].reverse().map((v) => `${Math.round(v)}`),
        grid: ticks.map(y),
        lines: [{ d: this.path(med, y), cls: 'l-med' }],
        dots: pts.flatMap((p, i) => {
          const d = delta[i];
          return d == null ? [] : [{ x: this.xOf(i), y: y(d), cls: 'p-delta', title: `${when(p)} · Δ ${num(d, 1, s)} °C${p.gpuDriver ? ' · ' + s.rp.driver(p.gpuDriver) : ''}` }];
        }),
      });
    }
    return out;
  });

  /** Linha que pula os pontos sem valor (sem ligar através do buraco). */
  private path(values: readonly (number | null)[], y: (v: number) => number): string {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v == null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${this.xOf(i).toFixed(2)} ${y(v)}`;
      pen = true;
    });
    return d;
  }

  protected readonly xLabels = computed(() => {
    const s = this.s();
    const pts = this.points();
    if (pts.length < 2) return [];
    const day = (p: TrendPoint) => shortDayTime(p.start, s).split(',')[0];
    const out = [{ x: this.xOf(0), text: day(pts[0]) }];
    if (pts.length >= 5) {
      const mid = Math.floor((pts.length - 1) / 2);
      out.push({ x: this.xOf(mid), text: day(pts[mid]) });
    }
    out.push({ x: this.xOf(pts.length - 1), text: day(pts[pts.length - 1]) });
    return out;
  });

  protected readonly shift = computed(() => {
    const d = driverShift(this.points());
    if (!d) return null;
    const s = this.s();
    return { text: shiftSentence(d, s), note: s.v13.trendShiftNote(d.nBefore, d.nAfter) };
  });
}
