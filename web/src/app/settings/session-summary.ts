import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from '../i18n';
import { GameSession, Level, MetricSetting } from '../models';
import { TelemetryService } from '../telemetry.service';
import { level } from '../widget/metric-views';
import { capitalize, clock, dayTime, fmtDuration } from './format';

interface Stat {
  key: string;
  label: string;
  value: string;
  unit?: string;
  level: Level;
  note?: string;
}

/**
 * Jogos → "Última sessão" (resumo pós-jogo, com as estatísticas do GameSession) e "Sessões anteriores".
 * Em andamento: picos até agora (vêm do mín/máx ao vivo) e FPS médio/lows só no fim.
 */
@Component({
  selector: 'pw-session-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './session-summary.scss',
  template: `
    @let sx = s();
    <section class="panel">
      @if (view(); as v) {
        <div class="head">
          <div class="min0">
            <h2>{{ v.title }}</h2>
            <p class="hint"><span class="mono">{{ v.session.exe }}</span> · {{ v.when }}</p>
          </div>
          @if (v.session.csvFile; as csv) {
            @if (t.inHost) {
              <button class="btn csv" (click)="t.host({ type: 'openLogFile', file: csv })"><span class="mono">{{ csv }}</span></button>
            } @else {
              <span class="mono csv-text">{{ csv }}</span>
            }
          }
        </div>
        <div class="grid">
          @for (st of v.stats; track st.key) {
            <div [class]="'st ' + st.level">
              <span class="k">{{ st.label }}</span>
              <b>{{ st.value }}@if (st.unit) {<small> {{ st.unit }}</small>}</b>
              @if (st.note) {
                <span class="note">{{ st.note }}</span>
              }
            </div>
          }
          <div class="st yr">
            <span class="k">{{ sx.stat.yellowRed }}</span>
            @if (v.alert; as a) {
              <span class="yr-vals"><span class="y">{{ a.yellow }}</span><span class="r">{{ a.red }}</span></span>
              <span class="yr-bar"><i class="y" [style.width.%]="a.yPct"></i><i class="r" [style.width.%]="a.rPct"></i></span>
            } @else {
              <b>—</b>
            }
          </div>
        </div>

        @if (rows().length) {
          <div class="ses th"><span>{{ sx.previousSessions }}</span><span>{{ sx.colDuration }}</span><span>{{ sx.colAvgFps }}</span><span>{{ sx.colPeakHot }}</span><span></span></div>
          @for (r of rows(); track r.session.start) {
            <div class="ses" [class.sel]="r.index === selected()">
              <span class="min0 ell">
                <span class="mono">{{ r.session.exe }}</span>
                <span class="hint"> · {{ r.when }}</span>
                @if (r.crashed) {
                  <span class="crash">{{ sx.pcShutDown }}</span>
                }
              </span>
              <span>{{ r.duration }}</span>
              <span>{{ r.avg }}</span>
              <span [class]="'lv-' + r.hotLevel">{{ r.hot }}</span>
              <button class="link right" (click)="selected.set(r.index)">{{ sx.view }}</button>
            </div>
          }
        }
      } @else {
        <h2>{{ sx.lastSession }}</h2>
        <p class="hint">{{ sx.noSessionsLong }}</p>
      }
    </section>
  `,
})
export class SessionSummary {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly selected = signal(0);

  private readonly settings = computed(() => new Map<string, MetricSetting>((this.t.config()?.metrics ?? []).map((m) => [m.id, m])));

  /** Sessão ainda aberta: a mais recente, sem "end", do jogo atual. As outras sem "end" terminaram em queda. */
  private isLive(x: GameSession) {
    return x === this.t.sessions()[0] && !x.end && x.exe === this.t.game()?.exe;
  }

  private crashed(x: GameSession) {
    return !x.end && !this.isLive(x);
  }

  protected readonly view = computed(() => {
    const list = this.t.sessions();
    const session = list[Math.min(this.selected(), list.length - 1)];
    if (!session) return null;
    const s = this.s();
    const live = this.isLive(session);
    const start = new Date(session.start).getTime();
    const durSec = live ? (Date.now() - start) / 1000 : (session.durationSec ?? (session.end ? (new Date(session.end).getTime() - start) / 1000 : 0));
    const ext = live ? this.t.extremes() : {};
    const peak = (id: string, stored?: number) => (live ? ext[id]?.[1] : stored);
    const noFps = this.t.catalog()?.presentMon === false;

    const fps = (v: number | undefined, key: string, label: string): Stat =>
      live
        ? { key, label, value: '—', level: 'ok', note: s.fpsAtEnd }
        : v == null
          ? { key, label, value: '—', level: 'ok', note: noFps || key === 'avg' ? s.fpsUnavailable : undefined }
          : { key, label, value: String(Math.round(v)), level: 'ok' };
    const temp = (id: string, v: number | undefined, key: string, label: string): Stat => {
      const st = this.settings().get(id);
      return { key, label, value: v == null ? '—' : String(Math.round(v)), unit: v == null ? undefined : '°C', level: level(v ?? null, st?.warn, st?.crit) };
    };
    const [dv, du] = splitDuration(fmtDuration(durSec));

    const stats: Stat[] = [
      { key: 'dur', label: s.stat.duration, value: dv, unit: du, level: 'ok' },
      fps(session.avgFps, 'avg', s.stat.avgFps),
      fps(session.low1, 'low1', s.stat.low1),
      fps(session.low01, 'low01', s.stat.low01),
      temp('gpu.temp', peak('gpu.temp', session.peakGpuTemp), 'pgpu', s.stat.peakGpu),
      temp('gpu.hotspot', peak('gpu.hotspot', session.peakHotspot), 'phot', s.stat.peakHot),
      temp('gpu.hotspotDelta', peak('gpu.hotspotDelta', session.peakHotspotDelta), 'pdelta', s.stat.peakDelta),
    ];

    // Tempo no amarelo/vermelho: o pior caso entre as métricas (secondsAboveWarn inclui o tempo no vermelho)
    let alert: { yellow: string; red: string; yPct: number; rPct: number } | null = null;
    if (!live && (session.secondsAboveWarn || session.secondsAboveCrit) && durSec > 0) {
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

    const first = this.selected() === 0;
    return {
      session,
      title: first ? s.lastSession : capitalize(dayTime(session.start, s)),
      when: live
        ? s.inProgressFor(fmtDuration(durSec))
        : session.end
          ? `${dayTime(session.start, s)} → ${clock(new Date(session.end), s)}`
          : `${dayTime(session.start, s)} · ${s.pcShutDown}`,
      stats,
      alert,
    };
  });

  protected readonly rows = computed(() => {
    const s = this.s();
    const hotSt = this.settings().get('gpu.hotspot');
    return this.t
      .sessions()
      .map((session, index) => ({ session, index }))
      .filter((r) => r.index !== Math.min(this.selected(), this.t.sessions().length - 1))
      .map(({ session, index }) => {
        const start = new Date(session.start).getTime();
        const dur = session.durationSec ?? (session.end ? (new Date(session.end).getTime() - start) / 1000 : null);
        return {
          index,
          session,
          when: dayTime(session.start, s),
          crashed: this.crashed(session),
          duration: this.isLive(session) ? s.inProgress : dur != null ? fmtDuration(dur) : '—',
          avg: session.avgFps != null ? String(Math.round(session.avgFps)) : '—',
          hot: session.peakHotspot != null ? `${Math.round(session.peakHotspot)} °C` : '—',
          hotLevel: level(session.peakHotspot ?? null, hotSt?.warn, hotSt?.crit),
        };
      });
  });
}

/** "45 min" → ["45", "min"]; "1 h 05" fica inteiro. */
function splitDuration(text: string): [string, string | undefined] {
  const m = text.match(/^(\d+) (min|s)$/);
  return m ? [m[1], m[2]] : [text, undefined];
}
