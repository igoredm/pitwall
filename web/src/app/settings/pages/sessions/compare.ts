import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../../i18n';
import { GameSession, SessionSeries } from '../../../models';
import { Icon } from '../../../ui/icon';
import { extent, minuteTicks, seriesPaths, shortDayTime, yTicks } from '../../reports';
import { SeriesKey, compareRows, crashed, durationSec, optionLabel } from './session-util';

const CHARTS: SeriesKey[] = ['fps.current', 'gpu.hotspot'];

/**
 * Comparar (#compare): seletores A e B (sincronizados com o histórico e a URL), tabela A × B com a diferença colorida
 * (verde = A melhor, vermelho = A pior, cinza = < 2% ou sem lado melhor) e duas linhas sobrepostas (FPS, hot spot).
 */
@Component({
  selector: 'pw-session-compare',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    <div class="sh">
      <div class="min0">
        <h2>{{ sx.rp.cmpTitle }}</h2>
        <div class="ht">{{ hint() }}</div>
      </div>
      @if (b()) {
        <button type="button" class="btn qt sm" (click)="clear.emit()">{{ sx.rp.cmpClear }}</button>
      }
    </div>
    <div class="grp">
      <div class="row pick">
        <span class="pill p-ac">A</span>
        <select class="in sel" [attr.aria-label]="'A'" (change)="setA.emit($any($event.target).value || null)">
          @if (!a()) {
            <option value="" selected>{{ sx.rp.cmpPickOther }}</option>
          }
          @for (o of opts(); track o.start) {
            <option [value]="o.start" [selected]="o.start === a()?.start">{{ o.label }}</option>
          }
        </select>
        <button type="button" class="btn qt sm ib" [attr.aria-label]="sx.rp.cmpSwap" [title]="sx.rp.cmpSwap" [disabled]="!a() || !b()" (click)="swap.emit()"><pw-icon name="swap" [size]="15" /></button>
        <span class="pill p-n">B</span>
        <select class="in sel" [class.ph]="!b()" [attr.aria-label]="'B'" (change)="setB.emit($any($event.target).value || null)">
          <option value="" [selected]="!b()">{{ sx.rp.cmpPickOther }}</option>
          @for (o of opts(); track o.start) {
            <option [value]="o.start" [selected]="o.start === b()?.start" [disabled]="o.start === a()?.start">{{ o.label }}</option>
          }
        </select>
        <button type="button" class="btn sm pri" [disabled]="!a() || !b()" (click)="go.emit()">{{ sx.rp.cmpGo }}</button>
      </div>
      @if (table(); as tb) {
        <div class="bt">
          <div class="tbl-r th ccols hd">
            <span>{{ sx.rp.colSensor }}</span>
            <span class="r"><span class="pill p-ac">A</span><br /><span class="b6">{{ tb.aWhen }}</span></span>
            <span class="r"><span class="pill p-n">B</span><br /><span class="b6">{{ tb.bWhen }}</span></span>
            <span class="r">{{ sx.rp.cmpVs }}</span>
          </div>
          @for (r of tb.rows; track r.key) {
            <div class="tbl-r ccols crow">
              <span class="b6 ell">{{ r.name }}</span>
              <span class="r">{{ r.a }}</span>
              <span class="r t2">{{ r.b }}</span>
              <span class="r" [class]="'r d-' + r.tone">{{ r.delta }}</span>
            </div>
          }
          <div class="row bt tight"><span class="cap">{{ sx.rp.cmpRule }}</span></div>
        </div>
      }
    </div>
    @if (table()) {
      @if (charts().length) {
        <div class="grp charts">
          @for (c of charts(); track c.key; let first = $first) {
            <div [class.bt]="!first">
              <div class="row tight chd">
                <div class="rl"><div class="lb">{{ c.label }}</div></div>
                <span class="lgs">
                  <span class="lg"><i></i>{{ legendA() }}</span>
                  <span class="lg"><i class="b"></i>{{ legendB() }}</span>
                </span>
              </div>
              <div class="plot" aria-hidden="true">
                <div class="yax">
                  @for (v of c.ticks; track $index) {
                    <span>{{ v }}</span>
                  }
                </div>
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" class="svg">
                  @for (y of c.grid; track $index) {
                    <line x1="0" x2="100" [attr.y1]="y" [attr.y2]="y" stroke="var(--hair)" stroke-width="1" vector-effect="non-scaling-stroke" />
                  }
                  @if (c.a) {
                    <path [attr.d]="c.a.area" fill="var(--ac)" fill-opacity=".1" />
                    <path [attr.d]="c.a.line" fill="none" stroke="var(--ac)" stroke-width="1.8" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
                  }
                  @if (c.b) {
                    <path [attr.d]="c.b.line" fill="none" stroke="var(--tx2)" stroke-width="1.6" stroke-dasharray="5 4" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
                  }
                </svg>
              </div>
              <div class="plot xax" aria-hidden="true">
                <span></span>
                <span class="axis">
                  @for (x of xLabels(); track $index) {
                    <span [style.left.%]="x.x" [class.first]="$first" [class.last]="$last">{{ x.text }}</span>
                  }
                </span>
              </div>
            </div>
          }
        </div>
      } @else if (seriesA() !== undefined && seriesB() !== undefined) {
        <div class="grp charts"><div class="row"><span class="cap">{{ sx.rp.seriesGone }}</span></div></div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .min0 {
      min-width: 0;
    }
    .pick {
      gap: 10px;
      .pill {
        flex-shrink: 0;
      }
    }
    .sel {
      flex: 1;
      min-width: 0;
      text-overflow: ellipsis;
      &.ph {
        color: var(--tx3);
      }
    }
    .ib {
      padding: 0 8px;
    }
    .ccols {
      grid-template-columns: minmax(0, 1fr) 110px 110px 120px;
    }
    .hd {
      min-height: 52px;
      align-items: end;
      padding-bottom: 8px;
      line-height: 1.6;
    }
    .crow {
      min-height: 38px;
      font-size: 13.5px;
    }
    .r {
      text-align: right;
      white-space: nowrap;
    }
    .b6 {
      font-weight: 600;
    }
    .d-g {
      color: var(--g);
      font-weight: 700;
    }
    .d-r {
      color: var(--r);
      font-weight: 700;
    }
    .d-n {
      color: var(--tx3);
      font-weight: 600;
    }
    .tight {
      min-height: 0;
    }
    .charts {
      margin-top: 12px;
    }
    .chd {
      padding: 12px 16px 0;
    }
    .lgs {
      display: flex;
      gap: 14px;
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
    }
    .plot {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 8px;
      padding: 12px 16px 0;
    }
    .yax {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 11px;
      color: var(--tx3);
      font-weight: 600;
      text-align: right;
      height: 110px;
      padding: calc(110px / 11 - 7.5px) 0;
      box-sizing: border-box;
    }
    .svg {
      display: block;
      width: 100%;
      height: 110px;
      overflow: visible;
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
    .grp {
      container-type: inline-size;
    }
    @container (max-width: 640px) {
      .ccols {
        grid-template-columns: minmax(0, 1fr) 84px 84px 96px;
        gap: 8px;
      }
    }
  `,
})
export class SessionCompare {
  protected readonly s = inject(I18n).s;
  readonly a = input<GameSession | null>(null);
  readonly b = input<GameSession | null>(null);
  readonly options = input<GameSession[]>([]);
  /** undefined = carregando. */
  readonly seriesA = input<SessionSeries | null | undefined>(undefined);
  readonly seriesB = input<SessionSeries | null | undefined>(undefined);
  readonly setA = output<string | null>();
  readonly setB = output<string | null>();
  readonly swap = output<void>();
  readonly clear = output<void>();
  readonly go = output<void>();

  protected readonly opts = computed(() => {
    const s = this.s();
    const seen = new Set<string>();
    const list = [this.a(), this.b(), ...this.options()].filter((x): x is GameSession => !!x && !seen.has(x.start) && !!seen.add(x.start));
    return list.sort((x, y) => y.start.localeCompare(x.start)).map((x) => ({ start: x.start, label: optionLabel(x, s) }));
  });

  protected readonly hint = computed(() => {
    const s = this.s();
    const a = this.a();
    const b = this.b();
    if (!a || !b) return s.rp.cmpHint;
    const game = a.exe.toLowerCase() === b.exe.toLowerCase() ? s.rp.cmpSameGame : s.rp.cmpDiffGame;
    const pcA = `${a.gpu ?? ''}|${a.cpu ?? ''}`;
    const pcB = `${b.gpu ?? ''}|${b.cpu ?? ''}`;
    const pc = !a.gpu || !b.gpu || pcA === pcB ? s.rp.cmpSamePc : s.rp.cmpDiffPc;
    const crash = crashed(a, false) ? ' ' + s.rp.cmpCrashed('A') : crashed(b, false) ? ' ' + s.rp.cmpCrashed('B') : '';
    return `${game}, ${pc}.${crash}`;
  });

  private day(x: GameSession) {
    return shortDayTime(x.start, this.s()).split(',')[0];
  }
  protected readonly legendA = computed(() => (this.a() ? this.s().rp.cmpLegend('A', this.day(this.a()!)) : ''));
  protected readonly legendB = computed(() => (this.b() ? this.s().rp.cmpLegend('B', this.day(this.b()!)) : ''));

  protected readonly table = computed(() => {
    const s = this.s();
    const a = this.a();
    const b = this.b();
    if (!a || !b) return null;
    const rows = compareRows(a, b, s);
    return { aWhen: shortDayTime(a.start, s), bWhen: shortDayTime(b.start, s), rows };
  });

  private readonly maxDur = computed(() => Math.max(1, ...[this.a(), this.b()].map((x) => (x ? durationSec(x) : 0))));

  protected readonly charts = computed(() => {
    const a = this.a();
    const b = this.b();
    if (!a || !b) return [];
    const sa = this.seriesA();
    const sb = this.seriesB();
    const max = this.maxDur();
    return CHARTS.flatMap((key) => {
      const da = sa?.available ? sa.series[key] : undefined;
      const db = sb?.available ? sb.series[key] : undefined;
      const ext = extent([...(da ?? []), ...(db ?? [])]);
      if (!ext) return [];
      const { ticks, lo, hi } = yTicks(ext[0], ext[1]);
      const o = (x: GameSession) => ({ h: 100, yTop: 0, yBottom: 100, xEnd: (durationSec(x) / max) * 100 });
      return [
        {
          key,
          label: key === 'fps.current' ? 'FPS' : this.s().rp.cardHot,
          ticks: [...ticks].reverse(),
          grid: ticks.map((v) => 100 - ((v - lo) / (hi - lo)) * 100),
          a: da ? seriesPaths(da, lo, hi, o(a)) : null,
          b: db ? seriesPaths(db, lo, hi, o(b)) : null,
        },
      ];
    });
  });

  protected readonly xLabels = computed(() => {
    const s = this.s();
    const d = this.maxDur();
    return [...minuteTicks(d).map((m) => ({ x: (m * 60 * 100) / d, text: m ? s.rp.minutes(m) : '0' })), { x: 100, text: s.rp.minutes(Math.round(d / 60)) }];
  });
}
