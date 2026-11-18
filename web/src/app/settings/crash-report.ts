import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChild } from '@angular/core';
import { I18n } from '../i18n';
import { CrashSeriesId, MetricSetting } from '../models';
import { TelemetryService } from '../telemetry.service';
import { formatValue, level } from '../widget/metric-views';
import { capitalize, clock, dayTime } from './format';

const SERIES: { id: CrashSeriesId; unit: string }[] = [
  { id: 'gpu.temp', unit: '°C' },
  { id: 'gpu.hotspot', unit: '°C' },
  { id: 'gpu.power', unit: 'W' },
  { id: 'gpu.clock', unit: 'MHz' },
  { id: 'fps.current', unit: '' },
  { id: 'cpu.temp', unit: '°C' },
];

/**
 * Jogos → "O PC desligou durante …": banner (dispensável) e o card com os últimos 60 s antes da queda.
 * Só dados, nenhum diagnóstico. Some quando o usuário dispensa (dismissCrashReport, lembrado pelo backend).
 */
@Component({
  selector: 'pw-crash-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './crash-report.scss',
  template: `
    @if (report(); as r) {
      @let sx = s();
      <div class="banner" role="status">
        <span class="ico" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M12 3v9" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></svg>
        </span>
        <span class="grow">
          <span class="b-title">{{ sx.crashTitle(r.exe) }}</span>
          <span class="hint">{{ r.rows.length ? sx.crashSub(r.when) : sx.crashSubNoData(r.when) }}</span>
        </span>
        <button class="btn" (click)="scrollToReport()">{{ sx.crashView }}</button>
        <button class="btn quiet" (click)="t.send({ type: 'dismissCrashReport' })">{{ sx.crashDismiss }}</button>
      </div>

      <section class="panel report" #reportCard tabindex="-1">
        <div class="r-head">
          <div>
            <h2>{{ sx.crashReportTitle }}</h2>
            <p class="hint">{{ r.range }}</p>
          </div>
          <div class="r-actions">
            @if (r.csv) {
              <span class="mono file">{{ r.csv }}</span>
            }
            @if (t.inHost) {
              <button class="btn" (click)="t.host({ type: 'openLogFolder' })">{{ sx.openFolder }}</button>
            }
          </div>
        </div>
        @for (row of r.rows; track row.id) {
          <div class="sp">
            <span class="n">{{ sx.crashSeries[row.id] }}</span>
            <svg viewBox="0 0 100 32" preserveAspectRatio="none" role="img" [attr.aria-label]="row.aria" [class]="'lvl-' + row.level">
              <path class="area" [attr.d]="row.area" />
              <path class="line" [attr.d]="row.line" vector-effect="non-scaling-stroke" />
              <line x1="100" y1="0" x2="100" y2="32" class="now" vector-effect="non-scaling-stroke" />
            </svg>
            <span class="r">{{ sx.minMax(row.min, row.max) }}<br />{{ sx.lastReading }} <b>{{ row.last }}</b></span>
          </div>
        } @empty {
          <p class="hint">{{ sx.crashNoSeries }}</p>
        }
        @if (r.rows.length) {
          <div class="axis"><span></span><span class="ticks"><span>−60 s</span><span>−30 s</span><span>{{ sx.axisLast }}</span></span><span></span></div>
        }
      </section>
    }
  `,
})
export class CrashReport {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  private readonly card = viewChild<ElementRef<HTMLElement>>('reportCard');

  protected readonly report = computed(() => {
    const cr = this.t.catalog()?.crashReport;
    if (!cr) return null;
    const s = this.s();
    const settings = new Map<string, MetricSetting>((this.t.config()?.metrics ?? []).map((m) => [m.id, m]));
    const end = new Date(cr.time).getTime();
    const rows = SERIES.flatMap(({ id, unit }) => {
      const data = cr.series?.[id];
      const nums = (data ?? []).filter((v): v is number => v != null);
      if (!data || nums.length < 2) return [];
      const min = Math.min(...nums);
      const max = Math.max(...nums);
      const lastV = [...data].reverse().find((v) => v != null) ?? null;
      const st = settings.get(id);
      const fmt = (v: number | null) => {
        const txt = formatValue(v, unit === '°C' ? '°C' : unit);
        return v == null ? txt : unit ? `${txt} ${unit}` : txt;
      };
      return [
        {
          id,
          // Regra normal de alerta: a cor é a do nível que a série alcançou (FPS fica verde)
          level: id === 'fps.current' ? 'fps' : level(max, st?.warn, st?.crit),
          ...paths(data, min, max),
          min: fmt(min),
          max: fmt(max),
          last: fmt(data[data.length - 1] ?? lastV),
          aria: `${s.crashSeries[id]}: ${s.minMax(fmt(min), fmt(max))}`,
        },
      ];
    });
    const startT = end - 60_000;
    return {
      exe: cr.session.exe,
      when: capitalize(dayTime(cr.time, s)),
      range: `${cr.session.exe} · ${dayTime(startT, s, true)} → ${clock(end, s, true)}`,
      csv: cr.csvFile ?? cr.session.csvFile ?? null,
      rows,
    };
  });

  protected scrollToReport() {
    const el = this.card()?.nativeElement;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el?.focus({ preventScroll: true });
  }
}

/** Linha (com buracos onde não houve leitura) e área de 16% de uma série, no viewBox 100×32. */
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
