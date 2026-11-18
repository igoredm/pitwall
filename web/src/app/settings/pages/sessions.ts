import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '../../i18n';
import { CrashSeriesId, GameSession, LOG_KEEP_DAYS, Level, LogKeepDays, LogStats, MetricSetting } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { formatValue, level } from '../../widget/metric-views';
import { capitalize, clock, dayTime, fmtBytes, fmtDuration, fmtMb, fmtMs } from '../format';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';

const SERIES: { id: CrashSeriesId; unit: string }[] = [
  { id: 'gpu.hotspot', unit: '°C' },
  { id: 'gpu.temp', unit: '°C' },
  { id: 'gpu.power', unit: 'W' },
  { id: 'gpu.clock', unit: 'MHz' },
  { id: 'fps.current', unit: '' },
  { id: 'cpu.temp', unit: '°C' },
];
const CAPS = [500, 1024, 2048, 5120, 10240];
const PAGE = 20;
const LOG_INTERVALS = [500, 1000, 2000, 5000];

interface Stat {
  key: string;
  label: string;
  value: string;
  unit?: string;
  level: Level;
}

/** Mudança de retenção esperando "Aplicar" (diminuir apaga arquivos: o backend limpa ~5 s depois de salvar). */
interface Pending {
  kind: 'keep' | 'cap';
  value: number;
  prev: number;
  stats: LogStats | null;
}

/**
 * Jogo › Sessões: relatório de queda, última sessão, histórico paginado com filtro por jogo e a gravação em CSV
 * (pasta, intervalo, retenção com prévia do que vai ser apagado).
 */
@Component({
  selector: 'pw-page-sessions',
  imports: [PageHead, Icon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="sessions" />

    @if (d) {
      <!-- ================================================= queda -->
      @if (d.features?.crashReport === false) {
        <section class="sec" data-anchor="crash">
          <div class="grp">
            <div class="off-line">
              <span class="grow"><b>{{ sx.crashOffLine }}</b> · {{ sx.offInFeatures }}</span>
              <button type="button" class="btn sm" (click)="ctx.go('features', 'crashReport')">{{ sx.pages.features }}</button>
            </div>
          </div>
        </section>
      } @else if (crash(); as c) {
        <div class="note n-r mid banner" role="status">
          <span class="ico"><pw-icon name="power" [size]="18" [stroke]="2" /></span>
          <div class="rl">
            <div class="b">{{ sx.crashTitle(c.exe) }}</div>
            <div class="ht m0">{{ c.rows.length ? sx.crashSub(c.when) : sx.crashSubNoData(c.when) }}</div>
          </div>
          <button type="button" class="btn qt sm" (click)="t.send({ type: 'dismissCrashReport' })">{{ sx.crashDismiss }}</button>
        </div>
        <section class="sec" data-anchor="crash">
          <div class="sh">
            <div>
              <h2>{{ sx.crashReportTitle }}</h2>
              <div class="ht">{{ c.range }}</div>
            </div>
            <span class="acts">
              @if (c.csv) {
                <span class="mono t3 csvname ell">{{ c.csv }}</span>
              }
              @if (t.inHost) {
                <button type="button" class="btn sm" (click)="t.host({ type: 'openLogFile', file: c.csv ?? undefined })"><pw-icon name="folder" [size]="14" />{{ sx.openFolder }}</button>
              }
            </span>
          </div>
          <div class="grp">
            @for (r of c.rows; track r.id) {
              <div class="tbl-r ccols" role="img" [attr.aria-label]="r.aria">
                <span class="cname">{{ sx.crashSeries[r.id] }}</span>
                <svg viewBox="0 0 100 32" preserveAspectRatio="none" class="spark" aria-hidden="true">
                  <path [attr.d]="r.area" [attr.fill]="r.color" fill-opacity=".14" />
                  <path [attr.d]="r.line" fill="none" [attr.stroke]="r.color" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
                </svg>
                <span class="cval">{{ sx.minMax(r.min, r.max) }}<br />{{ sx.lastReading }} <b>{{ r.last }}</b></span>
              </div>
            } @empty {
              <div class="empty"><div class="ht">{{ sx.crashNoSeries }}</div></div>
            }
          </div>
        </section>
      }

      <!-- ================================================= última sessão -->
      <section class="sec" data-anchor="last">
        @if (summary(); as v) {
          <div class="sh">
            <div>
              <h2>{{ v.title }}</h2>
              <div class="ht"><span class="mono">{{ v.session.exe }}</span> · {{ v.when }}</div>
            </div>
            @if (v.session.csvFile && t.inHost) {
              <button type="button" class="btn sm" (click)="t.host({ type: 'openLogFile', file: v.session.csvFile })"><pw-icon name="file" [size]="14" />{{ sx.openCsv }}</button>
            }
          </div>
          <div class="grp">
            @if (v.live) {
              <div class="row">
                <span class="pill p-g">{{ sx.inProgressShort(v.dur) }}</span>
                <div class="rl"><span class="mono">{{ v.session.exe }}</span></div>
                <span class="cap">{{ sx.fpsAtEnd2 }}</span>
              </div>
            }
            <div class="stats" [class.live]="v.live">
              @for (st of v.stats; track st.key) {
                <div class="st" [class]="'st lv-' + st.level">
                  <span class="cap">{{ st.label }}</span>
                  <span class="sv"><span class="svn">{{ st.value }}</span>@if (st.unit) {<span class="su">{{ st.unit }}</span>}</span>
                </div>
              }
              @if (!v.live) {
                <div class="st">
                  <span class="cap">{{ capital(sx.stat.yellowRed) }}</span>
                  @if (v.alert; as a) {
                    <span class="yr"><span style="color: var(--y)">{{ a.yellow }}</span> · <span style="color: var(--r)">{{ a.red }}</span></span>
                    <span class="bar"><span [style.width.%]="a.yPct" style="background: var(--y)"></span><span [style.width.%]="a.rPct" style="background: var(--r)"></span></span>
                  } @else {
                    <span class="sv"><span class="svn">—</span></span>
                  }
                </div>
              }
            </div>
          </div>
        } @else if (!t.sessions().length) {
          <div class="sh"><h2>{{ sx.lastSession }}</h2></div>
          <div class="grp">
            <div class="empty">
              <span class="ico"><pw-icon name="sessions" [size]="22" /></span>
              <div class="lb">{{ sx.noSessionsTitle }}</div>
              <div class="ht">{{ sx.noSessionsBody }}</div>
              <a class="lnk" href="#/settings/games/rules" (click)="$event.preventDefault(); ctx.go('games', 'rules')">{{ sx.notDetected }}</a>
            </div>
          </div>
        }
      </section>

      <!-- ================================================= histórico -->
      @if (t.sessions().length || hist().total) {
        <section class="sec" data-anchor="history">
          <div class="sh">
            <div>
              <h2>{{ sx.history }}</h2>
              <div class="ht">{{ sx.historyHint(d.log.keepDays ?? 30) }}</div>
            </div>
            <select class="in" [attr.aria-label]="sx.gameFilter" (change)="setFilter($any($event.target).value)">
              <option value="" [selected]="!exe()">{{ sx.allGames }}</option>
              @for (g of games(); track g) {
                <option [value]="g" [selected]="exe() === g">{{ g }}</option>
              }
            </select>
          </div>
          <div class="grp hgrp">
            <div class="tbl-r th hcols">
              <span>{{ sx.colGame }}</span><span>{{ sx.colWhen }}</span><span>{{ sx.colDur }}</span><span>{{ sx.colAvgFps }}</span><span class="c-low">{{ sx.colLow1 }}</span><span>{{ sx.colPeakHot2 }}</span><span></span>
            </div>
            @for (r of histRows(); track r.key) {
              <button type="button" class="tbl-r hcols hrow" [class.sel]="r.selected" [attr.aria-current]="r.selected ? 'true' : null" (click)="pick(r.session)">
                <span class="hexe ell"><span class="mono">{{ r.session.exe }}</span>
                  @if (r.crashed) {
                    <span class="pill p-r">{{ sx.pcShutDown }}</span>
                  } @else if (r.live) {
                    <span class="pill p-g">{{ sx.inProgress }}</span>
                  }
                </span>
                <span class="t2 sm13">{{ r.when }}</span>
                <span>{{ r.dur }}</span>
                <span>{{ r.avg }}</span>
                <span class="c-low">{{ r.low }}</span>
                <span [class]="'lv-' + r.hotLevel">{{ r.hot }}</span>
                <span class="ico"><pw-icon name="chevron" [size]="16" [stroke]="2" /></span>
              </button>
            } @empty {
              <div class="empty"><div class="ht">{{ hist().loading ? sx.loading : sx.historyEmptyGame }}</div></div>
            }
            @if (hist().total > hist().items.length) {
              <div class="row bt tight more">
                <span class="cap">{{ sx.showing(hist().items.length, hist().total) }}</span>
                <button type="button" class="btn sm" [disabled]="hist().loading" (click)="more()">{{ sx.showMore }}</button>
              </div>
            } @else if (hist().items.length > 5) {
              <div class="row bt tight more"><span class="cap">{{ sx.showing(hist().items.length, hist().total) }}</span></div>
            }
          </div>
        </section>
      }

      <!-- ================================================= CSV -->
      <section class="sec" data-anchor="csv">
        <div class="sh">
          <div>
            <h2>{{ sx.csvTitle }}</h2>
            <div class="ht">{{ sx.csvHint }}</div>
          </div>
        </div>
        <div class="grp">
          <div class="row">
            <div class="rl">
              <div class="lb" id="l-log">{{ sx.logEnable2 }}</div>
              <div class="ht">{{ sx.logEnableHint2 }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-log" [attr.aria-checked]="d.log.enabled" (click)="ctx.update(flipLog)"></button>
          </div>
          <div class="row">
            <div class="rl">
              <div class="lb">{{ sx.logFolder2 }}</div>
              @if (t.inHost) {
                <div class="mono t2 folder ell" [title]="d.log.folder">{{ d.log.folder }}</div>
              } @else {
                <input class="in mono folder-in" [attr.aria-label]="sx.logFolder2" [value]="d.log.folder" (change)="setFolder($any($event.target).value)" />
              }
            </div>
            @if (t.inHost) {
              <button type="button" class="btn sm" (click)="t.host({ type: 'pickFolder' })">{{ sx.change }}</button>
              <button type="button" class="btn sm qt" (click)="t.host({ type: 'openLogFolder' })"><pw-icon name="folder" [size]="14" />{{ sx.open }}</button>
            }
          </div>
          <div class="row">
            <div class="rl">
              <div class="lb">{{ sx.interval }}</div>
              <div class="ht">{{ sx.intervalHint }}</div>
            </div>
            <span class="seg" role="group" [attr.aria-label]="sx.interval">
              @for (i of intervals; track i) {
                <button type="button" [attr.aria-pressed]="d.log.intervalMs === i" (click)="setInterval(i)">{{ ms(i) }}</button>
              }
            </span>
          </div>
          <div class="row top" data-anchor="keep">
            <div class="rl">
              <div class="lb">{{ sx.keepFor }}</div>
              <div class="ht">{{ sx.keepForHint }}</div>
            </div>
            <span class="seg" role="group" [attr.aria-label]="sx.keepFor">
              @for (k of keepOptions; track k) {
                <button type="button" [attr.aria-pressed]="keepShown() === k" (click)="chooseKeep(k)">{{ sx.keepLabel(k) }}</button>
              }
            </span>
          </div>
          @if (pending()?.kind === 'keep') {
            <ng-container *ngTemplateOutlet="previewNote" />
          }
          <div class="row top" data-anchor="cap">
            <div class="rl">
              <div class="lb" id="l-cap">{{ sx.capTitle }}</div>
              <div class="ht">{{ sx.capHint }}</div>
            </div>
            @if (capShown()) {
              <select class="in" [attr.aria-label]="sx.capSize" (change)="chooseCap(+$any($event.target).value)">
                @for (c of caps; track c) {
                  <option [value]="c" [selected]="capShown() === c">{{ mb(c) }}</option>
                }
                @if (!caps.includes(capShown())) {
                  <option [value]="capShown()" selected>{{ mb(capShown()) }}</option>
                }
              </select>
            }
            <button type="button" class="sw" role="switch" aria-labelledby="l-cap" [attr.aria-checked]="capShown() > 0" (click)="chooseCap(capShown() ? 0 : 2048)"></button>
          </div>
          @if (pending()?.kind === 'cap') {
            <ng-container *ngTemplateOutlet="previewNote" />
          }
          <div class="row col usage">
            @if (usage(); as u) {
              <div class="ul">
                <span><b>{{ u.used }}</b><span class="t2"> {{ u.rest }}</span></span>
                @if (u.after) {
                  <span class="cap">{{ sx.usageAfter }}</span>
                }
              </div>
              <span class="bar ubar" role="img" [attr.aria-label]="u.aria">
                <span [style.width.%]="u.keepPct" style="background: var(--ac)"></span>
                <span class="hatch" [style.width.%]="u.gonePct"></span>
              </span>
            } @else {
              <span class="cap">{{ t.logStats() ? sx.usageEmpty : sx.usageLoading }}</span>
            }
            @if (t.log(); as l) {
              <span class="cap">
                {{ sx.currentFile }}
                @if (t.inHost) {
                  <button type="button" class="lnk mono" (click)="t.host({ type: 'openLogFile' })">{{ l.file }}</button>
                } @else {
                  <span class="mono">{{ l.file }}</span>
                }
                · {{ bytes(l.size) }}
              </span>
            }
          </div>
        </div>
      </section>

      <ng-template #previewNote>
        @let p = pending()!;
        <div class="pnote">
          <div class="note n-y mid" role="status" aria-live="polite">
            <span class="ico"><pw-icon name="warn" [size]="16" [stroke]="2" /></span>
            <div class="rl">
              @if (p.stats; as st) {
                {{ p.kind === 'keep' ? sx.previewKeep(sx.keepLabel(p.value).toLowerCase()) : sx.previewCap(mb(p.value)) }}<b>{{ sx.previewAmount(sx.files(st.wouldDeleteFiles), bytes(st.wouldDeleteBytes)) }}</b>{{ sx.previewWhen }}
                @if (p.kind === 'keep' && p.value) {
                  {{ sx.previewHistory(sx.lastDays(p.value)) }}
                }
              } @else {
                {{ sx.previewChecking }}
              }
            </div>
            <button type="button" class="btn sm" (click)="revert()">
              <pw-icon name="undo" [size]="14" [stroke]="2" />{{ p.kind === 'keep' ? sx.revertTo(sx.keepLabel(p.prev).toLowerCase()) : p.prev ? sx.revertTo(mb(p.prev)) : sx.revertCapOff }}
            </button>
            <button type="button" class="btn sm pri" [disabled]="!p.stats" (click)="apply()">{{ sx.applyChange }}</button>
          </div>
        </div>
      </ng-template>
    }
  `,
  styles: `
    .banner {
      margin-top: 20px;
      .b {
        font-weight: 700;
      }
      .m0 {
        margin: 0;
      }
    }
    .acts {
      display: flex;
      gap: 8px;
      align-items: center;
      min-width: 0;
    }
    .csvname {
      font-size: 12px;
      max-width: 260px;
    }
    .ccols {
      grid-template-columns: 110px minmax(0, 1fr) 150px;
      min-height: 46px;
    }
    .cname {
      font-weight: 600;
      font-size: 13px;
    }
    .spark {
      display: block;
      width: 100%;
      height: 30px;
      overflow: visible;
    }
    .cval {
      text-align: right;
      font-size: 12px;
      color: var(--tx2);
      line-height: 1.35;
      b {
        color: var(--tx);
        font-size: 13.5px;
      }
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      padding: 14px;
      &.live {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        padding-top: 0;
      }
    }
    .st {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px 14px;
      border-radius: 8px;
      background: var(--sf2);
      min-width: 0;
      &.lv-warn {
        background: var(--ys);
        .svn {
          color: var(--y);
        }
      }
      &.lv-crit {
        background: var(--rs);
        .svn {
          color: var(--r);
        }
      }
      .bar {
        margin-top: 4px;
      }
    }
    .sv {
      font-size: 22px;
      font-weight: 500;
      letter-spacing: -0.01em;
      white-space: nowrap;
    }
    .su {
      font-size: 12.5px;
      color: var(--tx3);
      margin-left: 3px;
    }
    .yr {
      font-size: 15px;
      font-weight: 600;
      white-space: nowrap;
    }
    .hcols {
      grid-template-columns: minmax(0, 1.4fr) 120px 80px 80px 70px 100px 20px;
    }
    .hrow {
      width: 100%;
      border: 0;
      background: none;
      text-align: left;
      font: inherit;
      color: inherit;
      cursor: pointer;
      &.sel {
        background: var(--acs);
      }
      &:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 2px var(--ac);
      }
    }
    @media (hover: hover) and (pointer: fine) {
      .hrow:hover:not(.sel) {
        background: var(--sf2);
      }
    }
    .hexe {
      display: flex;
      align-items: center;
      gap: 6px;
      .mono {
        font-size: 13px;
      }
    }
    .sm13 {
      font-size: 13px;
    }
    .lv-warn {
      color: var(--y);
    }
    .lv-crit {
      color: var(--r);
    }
    .more {
      justify-content: space-between;
    }
    .folder {
      margin-top: 4px;
    }
    .folder-in {
      width: 100%;
      margin-top: 6px;
    }
    .pnote {
      padding: 0 16px 14px;
    }
    .usage {
      gap: 8px;
    }
    .ul {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    .ubar {
      height: 8px;
    }
    .hgrp {
      container-type: inline-size;
    }
    @container (max-width: 700px) {
      .hcols {
        grid-template-columns: minmax(0, 1.4fr) 104px 64px 70px 90px 16px;
        gap: 10px;
      }
      .c-low {
        display: none;
      }
    }
  `,
})
export class SessionsPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  protected readonly keepOptions = LOG_KEEP_DAYS;
  protected readonly caps = CAPS;
  protected readonly intervals = LOG_INTERVALS;

  protected readonly flipLog = (c: { log: { enabled: boolean } }) => (c.log.enabled = !c.log.enabled);

  /** Sessão aberta no resumo (null = a mais recente). */
  private readonly picked = signal<GameSession | null>(null);
  protected readonly exe = signal<string>('');
  protected readonly hist = signal<{ items: GameSession[]; total: number; loading: boolean }>({ items: [], total: 0, loading: true });
  protected readonly pending = signal<Pending | null>(null);
  private reqId = 0;
  private refreshTimer?: ReturnType<typeof setTimeout>;

  private readonly settings = computed(() => new Map<string, MetricSetting>((this.ctx.draft()?.metrics ?? []).map((m) => [m.id, m])));

  // ------------------------------------------------------------------ queda
  protected readonly crash = computed(() => {
    const cr = this.t.catalog()?.crashReport;
    if (!cr) return null;
    const s = this.s();
    const end = new Date(cr.time).getTime();
    const rows = SERIES.flatMap(({ id, unit }) => {
      const data = cr.series?.[id];
      const nums = (data ?? []).filter((v): v is number => v != null);
      if (!data || nums.length < 2) return [];
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const st = this.settings().get(id);
      const lv = id === 'fps.current' ? 'fps' : level(max, st?.warn, st?.crit);
      const fmt = (v: number | null) => {
        const txt = formatValue(v, unit);
        return v == null || !unit ? txt : `${txt} ${unit}`;
      };
      const lastV = data[data.length - 1] ?? [...data].reverse().find((v) => v != null) ?? null;
      return [
        {
          id,
          color: lv === 'fps' ? 'var(--g)' : lv === 'crit' ? 'var(--r)' : lv === 'warn' ? 'var(--y)' : 'var(--ac)',
          ...paths(data, min, max),
          min: formatValue(min, unit),
          max: fmt(max),
          last: fmt(lastV),
          aria: `${s.crashSeries[id]}: ${s.minMax(fmt(min), fmt(max))}`,
        },
      ];
    });
    return {
      exe: cr.session.exe,
      when: capitalize(dayTime(cr.time, s)),
      range: s.crashRange(cr.session.exe, dayTime(end - 60_000, s, true), clock(end, s, true)),
      csv: cr.csvFile ?? cr.session.csvFile ?? null,
      rows,
    };
  });

  // ------------------------------------------------------------------ resumo
  private isLive(x: GameSession) {
    return !x.end && x.exe === this.t.game()?.exe && x.start === this.t.sessions()[0]?.start;
  }

  protected readonly summary = computed(() => {
    const session = this.picked() ?? this.t.sessions()[0];
    if (!session) return null;
    const s = this.s();
    const live = this.isLive(session);
    const start = new Date(session.start).getTime();
    const durSec = live ? (Date.now() - start) / 1000 : (session.durationSec ?? (session.end ? (new Date(session.end).getTime() - start) / 1000 : 0));
    const ext = live ? this.t.extremes() : {};
    const peak = (id: string, stored?: number) => (live ? ext[id]?.[1] : stored);
    const temp = (id: string, v: number | undefined, key: string, label: string): Stat => {
      const st = this.settings().get(id);
      return { key, label: capitalize(label), value: v == null ? '—' : String(Math.round(v)), unit: v == null ? undefined : '°C', level: level(v ?? null, st?.warn, st?.crit) };
    };
    const temps = [
      temp('gpu.temp', peak('gpu.temp', session.peakGpuTemp), 'pgpu', s.stat.peakGpu),
      temp('gpu.hotspot', peak('gpu.hotspot', session.peakHotspot), 'phot', s.stat.peakHot),
      temp('gpu.hotspotDelta', peak('gpu.hotspotDelta', session.peakHotspotDelta), 'pdelta', s.stat.peakDelta),
    ];
    const durTxt = fmtDuration(durSec);
    if (live) return { session, live, title: s.lastSession, when: dayTime(session.start, s), dur: durTxt, stats: temps, alert: null };

    const fps = (v: number | undefined, key: string, label: string): Stat => ({ key, label, value: v == null ? '—' : String(Math.round(v)), level: 'ok' });
    const [dv, du] = splitDuration(durTxt);
    const stats: Stat[] = [
      { key: 'dur', label: capitalize(s.stat.duration), value: dv, unit: du, level: 'ok' },
      fps(session.avgFps, 'avg', s.stat.avgFps),
      fps(session.low1, 'low1', s.stat.low1),
      fps(session.low01, 'low01', s.stat.low01.replace('0.1', s.decimalComma ? '0,1' : '0.1')),
      ...temps,
    ];
    let alert: { yellow: string; red: string; yPct: number; rPct: number } | null = null;
    if ((session.secondsAboveWarn || session.secondsAboveCrit) && durSec > 0) {
      const warn = session.secondsAboveWarn ?? {};
      const crit = session.secondsAboveCrit ?? {};
      let y = 0;
      let r = 0;
      for (const id of new Set([...Object.keys(warn), ...Object.keys(crit)])) {
        y = Math.max(y, (warn[id] ?? 0) - (crit[id] ?? 0));
        r = Math.max(r, crit[id] ?? 0);
      }
      alert = { yellow: fmtDuration(y, true), red: fmtDuration(r, true), yPct: (y / durSec) * 100, rPct: (r / durSec) * 100 };
    }
    const first = !this.picked() || this.picked()?.start === this.t.sessions()[0]?.start;
    return {
      session,
      live,
      title: first ? s.lastSession : capitalize(dayTime(session.start, s)),
      when: session.end ? `${dayTime(session.start, s)} → ${clock(new Date(session.end), s)}` : `${dayTime(session.start, s)} · ${s.pcShutDown}`,
      dur: durTxt,
      stats,
      alert,
    };
  });

  // ------------------------------------------------------------------ histórico
  /** Jogos para o filtro: os do histórico já carregado, as regras e os perfis. */
  protected readonly games = computed(() => {
    const d = this.ctx.draft();
    const set = new Map<string, string>();
    for (const x of [...this.t.sessions(), ...this.hist().items]) set.set(x.exe.toLowerCase(), x.exe);
    for (const x of [...(d?.games.include ?? []), ...Object.keys(d?.games.profiles ?? {})]) if (!set.has(x.toLowerCase())) set.set(x.toLowerCase(), x);
    if (this.exe()) set.set(this.exe().toLowerCase(), this.exe());
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  });

  protected readonly histRows = computed(() => {
    const s = this.s();
    const hot = this.settings().get('gpu.hotspot');
    const sel = (this.picked() ?? this.t.sessions()[0])?.start;
    return this.hist().items.map((session) => {
      const start = new Date(session.start).getTime();
      const live = this.isLive(session);
      const dur = session.durationSec ?? (session.end ? (new Date(session.end).getTime() - start) / 1000 : null);
      return {
        key: session.start + session.exe,
        session,
        live,
        crashed: !session.end && !live,
        selected: session.start === sel,
        when: dayTime(session.start, s),
        dur: live ? '—' : dur != null ? fmtDuration(dur) : '—',
        avg: session.avgFps != null ? String(Math.round(session.avgFps)) : '—',
        low: session.low1 != null ? String(Math.round(session.low1)) : '—',
        hot: session.peakHotspot != null ? `${Math.round(session.peakHotspot)} °C` : '—',
        hotLevel: level(session.peakHotspot ?? null, hot?.warn, hot?.crit),
      };
    });
  });

  // ------------------------------------------------------------------ CSV
  protected readonly keepShown = computed(() => {
    const p = this.pending();
    return p?.kind === 'keep' ? p.value : (this.ctx.draft()?.log.keepDays ?? 30);
  });
  protected readonly capShown = computed(() => {
    const p = this.pending();
    return p?.kind === 'cap' ? p.value : (this.ctx.draft()?.log.maxTotalMb ?? 0);
  });

  protected readonly usage = computed(() => {
    const st = this.t.logStats();
    const s = this.s();
    if (!st || !st.files) return null;
    const p = this.pending();
    const gone = p?.stats ? p.stats.wouldDeleteBytes : 0;
    const goneFiles = p?.stats ? p.stats.wouldDeleteFiles : 0;
    const capMb = this.capShown();
    const cap = capMb ? capMb * 1024 * 1024 : 0;
    const scale = Math.max(cap, st.totalBytes) || 1;
    const after = !!p?.stats;
    const kept = st.totalBytes - gone;
    const oldest = st.oldest ? new Date(st.oldest).toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit' }) : null;
    return {
      after,
      used: fmtBytes(after ? kept : st.totalBytes, s),
      rest: [cap ? s.usageOf(fmtMb(capMb)) : '', s.files(after ? st.files - goneFiles : st.files), !after && oldest ? s.usageOldest(oldest) : ''].filter(Boolean).join(' · '),
      keepPct: (kept / scale) * 100,
      gonePct: (gone / scale) * 100,
      aria: s.usageAria(fmtBytes(st.totalBytes, s), gone ? fmtBytes(gone, s) : ''),
    };
  });

  constructor() {
    this.t.requestLogStats();
    // Recarrega a primeira página quando uma sessão começa ou termina
    effect(() => {
      const first = this.t.sessions()[0];
      void first?.start;
      void first?.end;
      untracked(() => this.load(0));
    });
    // Recarrega o uso quando a gravação liga/desliga ou a pasta muda
    effect(() => {
      const d = this.ctx.draft();
      void d?.log.folder;
      void d?.log.enabled;
      untracked(() => this.t.requestLogStats());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.refreshTimer));
  }

  protected capital(text: string) {
    return capitalize(text);
  }

  protected ms(v: number) {
    return fmtMs(v, this.s(), true);
  }

  protected mb(v: number) {
    return fmtMb(v);
  }

  protected bytes(v: number) {
    return fmtBytes(v, this.s());
  }

  protected pick(x: GameSession) {
    this.picked.set(x);
    this.ctx.go('sessions', 'last');
  }

  protected setFilter(exe: string) {
    this.exe.set(exe);
    this.load(0);
  }

  protected more() {
    this.load(this.hist().items.length);
  }

  private load(offset: number) {
    const id = ++this.reqId;
    this.hist.update((h) => ({ ...h, loading: true, items: offset ? h.items : [] }));
    this.t.requestSessions(offset, PAGE, this.exe() || undefined).then((page) => {
      if (id !== this.reqId) return;
      this.hist.update((h) => ({ items: offset ? [...h.items, ...page.sessions] : page.sessions, total: page.total, loading: false }));
    });
  }

  protected setFolder(v: string) {
    this.ctx.update((c) => (c.log.folder = v));
  }

  protected setInterval(v: number) {
    this.ctx.update((c) => (c.log.intervalMs = v));
  }

  /** Diminuir o prazo pede confirmação com a prévia; aumentar (ou "Para sempre") vale na hora. */
  protected chooseKeep(k: LogKeepDays) {
    const cur = this.ctx.draft()?.log.keepDays ?? 30;
    this.pending.set(null);
    if (k === cur) return;
    const lowering = k !== 0 && (cur === 0 || k < cur);
    if (!lowering) {
      this.ctx.update((c) => (c.log.keepDays = k));
      this.refreshSoon();
      return;
    }
    this.preview({ kind: 'keep', value: k, prev: cur, stats: null }, { keepDays: k });
  }

  /** Ligar o teto ou baixar o valor pede confirmação; desligar ou subir vale na hora. */
  protected chooseCap(mb: number) {
    const cur = this.ctx.draft()?.log.maxTotalMb ?? 0;
    this.pending.set(null);
    if (mb === cur) return;
    const lowering = mb !== 0 && (cur === 0 || mb < cur);
    if (!lowering) {
      this.ctx.update((c) => (c.log.maxTotalMb = mb));
      this.refreshSoon();
      return;
    }
    this.preview({ kind: 'cap', value: mb, prev: cur, stats: null }, { maxTotalMb: mb });
  }

  private preview(p: Pending, q: { keepDays?: LogKeepDays; maxTotalMb?: number }) {
    this.pending.set(p);
    this.t.requestLogStats(q).then((stats) => {
      const cur = this.pending();
      if (cur?.kind !== p.kind || cur.value !== p.value) return;
      // Nada a apagar: aplica direto, sem nota
      if (!stats.wouldDeleteFiles) {
        this.pending.set({ ...cur, stats });
        this.apply();
      } else this.pending.set({ ...cur, stats });
    });
  }

  protected apply() {
    const p = this.pending();
    if (!p) return;
    this.ctx.update((c) => {
      if (p.kind === 'keep') c.log.keepDays = p.value as LogKeepDays;
      else c.log.maxTotalMb = p.value;
    });
    this.pending.set(null);
    this.refreshSoon();
  }

  protected revert() {
    this.pending.set(null);
  }

  /** O backend limpa ~5 s depois de salvar: confere o uso de novo depois disso. */
  private refreshSoon() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.t.requestLogStats(), 6500);
  }
}

/** Linha (com buracos onde não houve leitura) e área de uma série, no viewBox 100×32. */
function paths(data: (number | null)[], min: number, max: number) {
  const span = max - min || 1;
  const step = 100 / Math.max(1, data.length - 1);
  let line = '';
  let area = '';
  let seg: string[] = [];
  const close = () => {
    if (seg.length > 1) area += `M${seg[0].split(' ')[0]} 32L${seg.join('L')}L${seg[seg.length - 1].split(' ')[0]} 32Z`;
    seg = [];
  };
  data.forEach((v, i) => {
    if (v == null) {
      close();
      return;
    }
    const pt = `${(i * step).toFixed(2)} ${(30 - ((v - min) / span) * 26).toFixed(2)}`;
    line += (seg.length ? 'L' : 'M') + pt;
    seg.push(pt);
  });
  close();
  return { line, area };
}

/** "45 min" → ["45", "min"]; "1 h 05" fica inteiro. */
function splitDuration(text: string): [string, string | undefined] {
  const m = text.match(/^(\d+) (min|s)$/);
  return m ? [m[1], m[2]] : [text, undefined];
}
