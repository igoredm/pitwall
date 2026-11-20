import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../../i18n';
import { GameSession, SessionSeries } from '../../../models';
import { TelemetryService } from '../../../telemetry.service';
import { Icon } from '../../../ui/icon';
import { clock, dayTime, fmtDuration } from '../../format';
import { extent, num } from '../../reports';
import { SettingsCtx } from '../../settings-ctx';
import { crashed, durationSec, endTime, fmtPm, perMinute } from './session-util';
import { Timeline } from './timeline';

interface Cell {
  key: string;
  label: string;
  value: string | null;
  unit?: string;
  missing?: string;
  sub?: string;
  subLink?: boolean;
}

/**
 * "Última partida" (#last): cabeçalho com [Compartilhar] [Abrir CSV], a nota de queda, a faixa de 6 números (sem fundo
 * de tile), a linha do tempo e a lista de marcadores.
 */
@Component({
  selector: 'pw-last-session',
  imports: [Icon, Timeline],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let x = session();
    <div class="sh">
      <div class="min0">
        <h2>{{ title() }}</h2>
        <div class="ht ell"><span class="mono">{{ x.exe }}</span> · {{ when() }}</div>
      </div>
      <span class="acts">
        @if (live()) {
          <span class="pill p-g">{{ sx.inProgress }}</span>
        } @else {
          <button type="button" class="btn sm" (click)="share.emit()"><pw-icon name="share" [size]="14" />{{ sx.rp.share }}</button>
        }
        @if (x.csvFile && t.inHost) {
          <button type="button" class="btn sm" (click)="t.host({ type: 'openLogFile', file: x.csvFile })"><pw-icon name="file" [size]="14" />{{ sx.openCsv }}</button>
        }
      </span>
    </div>
    @if (crashAt(); as at) {
      <div class="note n-r crash" role="note">
        <span class="pw-r"><pw-icon name="power" [size]="16" [stroke]="2" /></span>
        <span class="rl b6">{{ sx.rp.endedCrash(at) }}</span>
        <a class="lnk" href="#/settings/health/latest" (click)="$event.preventDefault(); seePc.emit(x.incidentId ?? null)">{{ sx.rp.seePcReport }} <pw-icon name="chevron" [size]="14" [stroke]="2" /></a>
      </div>
    }
    <div class="grp">
      <div class="strip">
        @for (c of cells(); track c.key) {
          <div class="cell">
            <div class="sl">{{ c.label }}</div>
            @if (c.value != null) {
              <div class="sv">{{ c.value }}@if (c.unit) {<small> {{ c.unit }}</small>}</div>
            } @else {
              <div class="sv"><span class="miss">{{ c.missing }}</span></div>
            }
            @if (c.subLink) {
              <a class="ss lnk" href="#/settings/features" (click)="$event.preventDefault(); ctx.go('features', 'stutters')">{{ sx.pages.features }}</a>
            } @else {
              <div class="ss">{{ c.sub }}</div>
            }
          </div>
        }
      </div>
      <div class="bt">
        <pw-timeline [series]="series()" [durationSec]="dur()" [markers]="x.markers ?? []" [crashed]="isCrash()" />
      </div>
      @if (markerRows().length) {
        <div class="bt">
          @for (m of markerRows(); track m.n) {
            <div class="tbl-r mrow">
              <span class="mnum"><b>{{ m.n }}</b></span>
              <span class="b6">{{ m.at }}</span>
              <span class="t2">{{ m.min }}</span>
              <span class="ell" [class.t3]="!m.note">{{ m.note ?? sx.rp.noNote }}</span>
              <span class="cap via">{{ m.via }}</span>
            </div>
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
    .acts {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-shrink: 0;
    }
    .crash {
      margin-bottom: 8px;
      align-items: center;
    }
    .pw-r {
      color: var(--r);
      display: flex;
    }
    .b6 {
      font-weight: 600;
    }
    .grp {
      container-type: inline-size;
    }
    .strip {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .cell {
      padding: 14px 16px;
      min-width: 0;
    }
    .cell + .cell {
      border-left: 1px solid var(--hair);
    }
    .sl {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--tx3);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .sv {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.015em;
      margin-top: 2px;
      white-space: nowrap;
      small {
        font-size: 12.5px;
        color: var(--tx3);
        font-weight: 600;
        letter-spacing: 0;
      }
    }
    .miss {
      color: var(--tx3);
      font-size: 15px;
      font-weight: 600;
      letter-spacing: 0;
    }
    .ss {
      font-size: 12px;
      color: var(--tx2);
      margin-top: 1px;
      /* quebra em vez de cortar: em inglês "the game doesn't send it" não cabe na célula de 1/6 */
      line-height: 1.35;
      overflow-wrap: anywhere;
      display: block;
      min-height: 17px;
    }
    a.ss {
      color: var(--act);
      font-size: 12px;
    }
    .mrow {
      grid-template-columns: 22px 80px 90px minmax(0, 1fr) 150px;
      min-height: 38px;
      font-size: 13px;
    }
    .mnum b {
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
      box-sizing: border-box;
    }
    .via {
      text-align: right;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    @container (max-width: 700px) {
      .strip {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .cell:nth-child(n + 4) {
        border-top: 1px solid var(--hair);
      }
      .cell:nth-child(4) {
        border-left: 0;
      }
      .mrow {
        grid-template-columns: 22px 68px 76px minmax(0, 1fr) minmax(0, 140px);
      }
    }
  `,
})
export class LastSession {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  readonly session = input.required<GameSession>();
  readonly live = input(false);
  /** É a mais recente (título "Última partida"); senão o título é a data. */
  readonly latest = input(true);
  readonly series = input<SessionSeries | null | undefined>(undefined);
  readonly share = output<void>();
  readonly seePc = output<string | null>();

  protected readonly dur = computed(() => durationSec(this.session(), this.live()));
  protected readonly isCrash = computed(() => crashed(this.session(), this.live()));

  protected readonly title = computed(() => {
    const s = this.s();
    if (this.latest()) return s.rp.lastMatch;
    const t = dayTime(this.session().start, s);
    return t.charAt(0).toUpperCase() + t.slice(1);
  });

  protected readonly when = computed(() => {
    const s = this.s();
    const x = this.session();
    const end = endTime(x);
    const start = dayTime(x.start, s);
    const d = fmtDuration(this.dur());
    return end && !this.live() ? `${start} → ${clock(end, s)} · ${d}` : `${start} · ${d}`;
  });

  protected readonly crashAt = computed(() => {
    const x = this.session();
    if (!this.isCrash()) return null;
    const end = endTime(x);
    return end ? clock(end, this.s()) : '—';
  });

  protected readonly cells = computed<Cell[]>(() => {
    const s = this.s();
    // Partida aberta: os números ainda não estão na sessão; vêm do snapshot (FPS médio e lows da sessão atual)
    const live = this.live() ? this.t.values() : null;
    const lv = (id: string) => live?.[id] ?? undefined;
    const x0 = this.session();
    const x: GameSession = live
      ? { ...x0, avgFps: x0.avgFps ?? lv('fps.avg'), low1: x0.low1 ?? lv('fps.low1'), low01: x0.low01 ?? lv('fps.low01'), stutters: x0.stutters ?? lv('fps.stutters'), animErrorMs: x0.animErrorMs ?? lv('fps.animError'), pcLatencyMs: x0.pcLatencyMs ?? lv('fps.pcLatency') }
      : x0;
    const fps = this.series()?.series['fps.current'];
    const ext = fps ? extent(fps) : null;
    const r = (v?: number) => (v == null ? null : String(Math.round(v)));
    const pm = perMinute(x);
    return [
      { key: 'avg', label: s.rp.avgFps, value: r(x.avgFps), missing: '—', sub: ext ? s.minMax(String(Math.round(ext[0])), String(Math.round(ext[1]))) : '' },
      { key: 'low1', label: s.rp.low1, value: r(x.low1), missing: '—' },
      { key: 'low01', label: s.rp.low01, value: r(x.low01), missing: '—' },
      x.stutters != null
        ? { key: 'st', label: s.rp.stutters, value: String(x.stutters), sub: pm != null ? s.rp.perMin(fmtPm(pm, s)) : '' }
        : { key: 'st', label: s.rp.stutters, value: null, missing: s.rp.notCounted, subLink: true },
      x.animErrorMs != null
        ? { key: 'anim', label: s.rp.animError, value: num(x.animErrorMs, 1, s), unit: 'ms', sub: s.rp.average }
        : { key: 'anim', label: s.rp.animError, value: null, missing: s.rp.noReading },
      x.pcLatencyMs != null
        ? { key: 'lat', label: s.rp.pcLatency, value: num(x.pcLatencyMs, 1, s), unit: 'ms', sub: s.rp.average }
        : { key: 'lat', label: s.rp.pcLatency, value: null, missing: s.rp.noReading, sub: s.rp.gameNoSend },
    ];
  });

  protected readonly markerRows = computed(() => {
    const s = this.s();
    const hk = (this.ctx.draft()?.hotkeys?.marker ?? 'Ctrl+Alt+M').split('+').join(' ');
    return (this.session().markers ?? []).map((m, i) => {
      const via = m.via;
      return {
        n: i + 1,
        at: clock(new Date(m.at), s, true),
        min: s.rp.atMin(Math.round(m.t / 60)),
        note: m.note || null,
        via: via === 'hotkey' ? hk : via === 'button' ? s.rp.viaButton : '',
      };
    });
  });
}
