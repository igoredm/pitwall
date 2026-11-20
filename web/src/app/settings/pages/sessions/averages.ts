import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../../i18n';
import { GameSession, Level } from '../../../models';
import { TelemetryService } from '../../../telemetry.service';
import { level } from '../../../widget/metric-views';
import { fmtDuration } from '../../format';

interface Row {
  id: string;
  avg?: number;
  peak?: number;
  unit: string;
}

/**
 * "Médias e picos": Sensor | Média | Pico | No amarelo | No vermelho, pico com a cor do limite, "—" quando não houve.
 * Embaixo, o que limitou o clock numa barra empilhada de 8 px com a legenda em texto.
 */
@Component({
  selector: 'pw-session-averages',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    <div class="sh">
      <div>
        <h2>{{ sx.rp.avgTitle }}</h2>
        <div class="ht">{{ sx.rp.avgHint }}</div>
      </div>
    </div>
    <div class="grp">
      @if (rows().length) {
        <div class="tbl-r th acols hd">
          <span>{{ sx.rp.colSensor }}</span><span class="r">{{ sx.rp.colAvg }}</span><span class="r">{{ sx.rp.colPeak }}</span><span class="r">{{ sx.rp.colYellow }}</span><span class="r wrap">{{ sx.rp.colRed }}</span>
        </div>
        @for (r of rows(); track r.id) {
          <div class="tbl-r acols arow">
            <span class="b6 ell">{{ r.name }}</span>
            <span class="r">{{ r.avg }}</span>
            <span class="r b6" [class]="'r b6 lv-' + r.peakLevel">{{ r.peak }}</span>
            <span class="r t2">{{ r.yellow }}</span>
            <span class="r t2" [class.red]="r.redOn">{{ r.red }}</span>
          </div>
        }
      } @else {
        <div class="row"><span class="cap">{{ sx.rp.avgEmpty }}</span></div>
      }
      @if (clockBar(); as cb) {
        <div class="row bt col">
          <div class="cbh">
            <span class="lb">{{ sx.rp.clockLimit }}</span>
            <span class="cap">
              @for (p of cb; track p.key; let last = $last) {
                <span [style.color]="p.text">{{ p.label }} {{ p.pct }}%</span>@if (!last) {
                  ·
                }
              }
            </span>
          </div>
          <span class="bar cbar" role="img" [attr.aria-label]="sx.rp.clockLimit">
            @for (p of cb; track p.key) {
              <span [style.width.%]="p.pct" [style.background]="p.color"></span>
            }
          </span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .grp {
      container-type: inline-size;
    }
    .acols {
      grid-template-columns: minmax(0, 1fr) 90px 90px 110px 128px;
    }
    .hd {
      min-height: 34px;
      padding-block: 6px;
    }
    /* "Acima do limite crítico definido" quebra em 2 linhas */
    .r.wrap {
      white-space: normal;
      line-height: 1.3;
    }
    .arow {
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
    .lv-warn {
      color: var(--y);
    }
    .lv-crit,
    .red {
      color: var(--r);
    }
    .col {
      flex-direction: column;
      align-items: stretch;
      gap: 8px;
    }
    .cbh {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      .lb {
        font-size: 13.5px;
      }
    }
    .cbar {
      height: 8px;
    }
    @container (max-width: 600px) {
      .acols {
        grid-template-columns: minmax(0, 1fr) 70px 70px 84px 108px;
        gap: 8px;
      }
    }
  `,
})
export class SessionAverages {
  private readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  readonly session = input.required<GameSession>();

  protected readonly rows = computed(() => {
    const s = this.s();
    const x = this.session();
    const delta = x.avgHotspot != null && x.avgGpuTemp != null ? x.avgHotspot - x.avgGpuTemp : undefined;
    const list: Row[] = [
      { id: 'gpu.temp', avg: x.avgGpuTemp, peak: x.peakGpuTemp, unit: '°C' },
      { id: 'gpu.hotspot', avg: x.avgHotspot, peak: x.peakHotspot, unit: '°C' },
      { id: 'gpu.hotspotDelta', avg: delta, peak: x.peakHotspotDelta, unit: '°C' },
      { id: 'gpu.power', avg: x.avgGpuPower, peak: x.peakGpuPower, unit: 'W' },
      { id: 'gpu.clock', avg: x.avgGpuClock, unit: 'MHz' },
      { id: 'gpu.load', avg: x.avgGpuLoad, unit: '%' },
      { id: 'cpu.temp', avg: x.avgCpuTemp, peak: x.peakCpuTemp, unit: '°C' },
      { id: 'cpu.load', avg: x.avgCpuLoad, unit: '%' },
    ];
    const fmt = (v: number | undefined, unit: string) => (v == null ? '—' : `${Math.round(v)} ${unit}`);
    const settings = this.t.settings();
    return list
      .filter((r) => r.avg != null || r.peak != null)
      .map((r) => {
        const st = settings.get(r.id);
        const y = x.secondsAboveWarn?.[r.id];
        const red = x.secondsAboveCrit?.[r.id];
        return {
          id: r.id,
          name: s.rp.rows[r.id],
          avg: fmt(r.avg, r.unit),
          peak: fmt(r.peak, r.unit),
          peakLevel: (r.peak != null ? level(r.peak, st?.warn, st?.crit) : 'ok') as Level,
          yellow: y ? fmtDuration(y, true) : '—',
          red: red ? fmtDuration(red, true) : '—',
          redOn: !!red,
        };
      });
  });

  /** temperatura (--y), consumo (--ac), voltagem (tx3) e livre (--bd: sem limite, ocioso ou sincronia). */
  protected readonly clockBar = computed(() => {
    const sec = this.session().clockReasonSec;
    if (!sec) return null;
    const s = this.s();
    const free = (sec.none ?? 0) + (sec.idle ?? 0) + (sec.sync ?? 0);
    const parts = [
      { key: 'thermal', v: sec.thermal ?? 0, color: 'var(--y)', text: 'var(--y)' },
      { key: 'power', v: sec.power ?? 0, color: 'var(--ac)', text: 'var(--act)' },
      { key: 'voltage', v: sec.voltage ?? 0, color: 'var(--tx3)', text: 'var(--tx2)' },
      { key: 'free', v: free, color: 'var(--bd)', text: '' },
    ];
    const total = parts.reduce((a, p) => a + p.v, 0);
    if (total <= 0) return null;
    return parts.filter((p) => p.v > 0).map((p) => ({ ...p, label: s.rp.reasons[p.key], pct: Math.round((p.v / total) * 100) }));
  });
}
