import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../i18n';
import { PerfCapReason } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { level } from '../../widget/metric-views';
import { presetName } from '../helpers';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';

/** Ordem e cor de cada motivo (power accent, térmico amarelo, voltagem azul claro, sincronia tx3, sem limite hair). */
const REASONS: { r: PerfCapReason; color: string }[] = [
  { r: 'power', color: 'var(--ac)' },
  { r: 'thermal', color: 'var(--y)' },
  { r: 'voltage', color: '#8FB5FF' },
  { r: 'sync', color: 'var(--tx3)' },
  { r: 'idle', color: 'var(--bd)' },
  { r: 'none', color: 'var(--hair)' },
];
const LIVE: [string, string][] = [
  ['gpu.hotspot', '°C'],
  ['gpu.hotspotDelta', '°C'],
  ['gpu.temp', '°C'],
  ['gpu.power', 'W'],
  ['gpu.clock', 'MHz'],
  ['gpu.fan', '%'],
];

/** Jogo › Ajuste da GPU: ajuste, quando, perfil e limites; "Agora" com 6 valores e por que o clock caiu. */
@Component({
  selector: 'pw-page-gpu',
  imports: [PageHead, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="gpu" />

    @if (d) {
      @if (caps(); as c) {
        @if (!c.supported) {
          <div class="note n-y na">
            <span class="ico"><pw-icon name="warn" [size]="16" [stroke]="2" /></span>
            <span>{{ sx.gpuUnavailable(c.error || sx.gpuNeedsNvidia) }}</span>
          </div>
        } @else {
          <section class="sec" data-anchor="tuning">
            <div class="sh"><h2>{{ sx.tuningSec }}</h2></div>
            <div class="grp">
              <div class="row" data-tour="gpu-switch">
                <div class="rl">
                  <div class="lb" id="l-gpu">{{ sx.gpuEnable2 }}</div>
                  <div class="ht">{{ sx.gpuCaps2(c.gpu ?? 'GPU', c.powerDefaultW, c.maxClockMhz) }}</div>
                </div>
                <button type="button" class="sw" role="switch" aria-labelledby="l-gpu" [attr.aria-checked]="d.gpuTuning.enabled" (click)="ctx.update(flip)"></button>
              </div>
              <div class="row" [class.dimmed]="!d.gpuTuning.enabled">
                <div class="rl">
                  <div class="lb">{{ sx.gpuWhen }}</div>
                  <div class="ht">{{ sx.gpuWhenHint2 }}</div>
                </div>
                <span class="seg" role="group" [attr.aria-label]="sx.gpuWhen">
                  <button type="button" [attr.aria-pressed]="d.gpuTuning.onlyInGames" (click)="setOnly(true)">{{ sx.gpuOnlyGames }}</button>
                  <button type="button" [attr.aria-pressed]="!d.gpuTuning.onlyInGames" (click)="setOnly(false)">{{ sx.gpuAlways }}</button>
                </span>
              </div>
              <div class="row" [class.dimmed]="!d.gpuTuning.enabled">
                <div class="rl">
                  <div class="lb">{{ sx.gpuProfile }}</div>
                  <div class="ht">{{ sx.presetHint[d.gpuTuning.preset] }}</div>
                </div>
                <span class="seg" role="group" [attr.aria-label]="sx.gpuProfile">
                  <button type="button" [attr.aria-pressed]="d.gpuTuning.preset === 'balanced'" (click)="setPreset('balanced')">{{ sx.presetBtn(sx.gpuBalanced, presets()['balanced']?.powerW) }}</button>
                  <button type="button" [attr.aria-pressed]="d.gpuTuning.preset === 'cool'" (click)="setPreset('cool')">{{ sx.presetBtn(sx.gpuCool, presets()['cool']?.powerW) }}</button>
                  <button type="button" [attr.aria-pressed]="d.gpuTuning.preset === 'custom'" (click)="setPreset('custom')">{{ sx.gpuCustom }}</button>
                </span>
              </div>
              @if (target(); as tg) {
                @let soft = d.gpuTuning.preset !== 'custom' || !d.gpuTuning.enabled;
                <div class="row" [class.soft]="soft">
                  <div class="rl">
                    <div class="lb" id="l-pw">{{ sx.powerLimitRow }}</div>
                    <div class="ht">{{ sx.powerLimitVal(tg.powerW, pct(tg.powerW)) }}{{ soft ? ' · ' + sx.slidersHint : '' }}</div>
                  </div>
                  <input
                    type="range"
                    class="rng"
                    aria-labelledby="l-pw"
                    [attr.aria-valuetext]="tg.powerW + ' W'"
                    [min]="c.powerMinW"
                    [max]="c.powerMaxW"
                    step="1"
                    [value]="tg.powerW"
                    [style.--fill]="fill(tg.powerW, c.powerMinW, c.powerMaxW)"
                    (change)="setCustom({ powerLimitW: +$any($event.target).value })"
                  />
                </div>
                <div class="row" [class.soft]="soft">
                  <div class="rl">
                    <div class="lb" id="l-clk">{{ sx.maxClockRow }}</div>
                    <div class="ht">{{ sx.maxClockVal(tg.clockMhz) }}</div>
                  </div>
                  <input
                    type="range"
                    class="rng"
                    aria-labelledby="l-clk"
                    [attr.aria-valuetext]="tg.clockMhz ? tg.clockMhz + ' MHz' : sx.maxClockVal(0)"
                    min="1200"
                    [max]="c.maxClockMhz"
                    step="15"
                    [value]="tg.clockMhz || c.maxClockMhz"
                    [style.--fill]="fill(tg.clockMhz || c.maxClockMhz, 1200, c.maxClockMhz)"
                    (change)="setCustom({ maxClockMhz: +$any($event.target).value >= c.maxClockMhz ? 0 : +$any($event.target).value })"
                  />
                </div>
              }
            </div>
          </section>
        }

        <section class="sec" data-anchor="now">
          <div class="sh">
            <div>
              <h2>{{ sx.gpuNow }}</h2>
              <div class="ht">{{ nowHint() }}</div>
            </div>
          </div>
          <div class="grp">
            <div class="live">
              @for (v of live(); track v.id) {
                <div class="lv">
                  <span class="cap">{{ sx.gpuLive[v.id] }}</span>
                  <span class="lvv" [class]="'lvv lv-' + v.level">{{ v.text }}<span class="su">{{ v.unit }}</span></span>
                </div>
              }
            </div>
            @if (d.features?.clockReason === false) {
              <div class="off-line bt">
                <span class="grow"><b>{{ sx.clockReasonOffLine }}</b> · {{ sx.offInFeatures }}</span>
                <button type="button" class="btn sm" (click)="ctx.go('features', 'clockReason')">{{ sx.pages.features }}</button>
              </div>
            } @else {
              <div class="row top bt why">
                <div class="rl">
                  <div class="lb">{{ sx.whyTitle }}</div>
                  <div class="ht">{{ sx.whyHint }}</div>
                  @if (!perfcapSupported()) {
                    <div class="ht wna">{{ sx.whyUnavailableHint }}</div>
                  } @else if (bar(); as b) {
                    <div class="bar wbar" role="img" [attr.aria-label]="b.aria">
                      @for (p of b.parts; track p.r) {
                        <span [style.width.%]="p.pct" [style.background]="p.color"></span>
                      }
                    </div>
                    <div class="legend">
                      @for (p of b.parts; track p.r) {
                        <span><i [style.background]="p.color"></i>{{ sx.perfcapWord[p.r] }} {{ p.pct }}%</span>
                      }
                    </div>
                  } @else {
                    <div class="bar wbar"></div>
                    <div class="ht">{{ sx.whyBarEmpty }}</div>
                  }
                </div>
                @if (perfcapSupported()) {
                  <div class="wnow">
                    @if (current(); as cur) {
                      <span class="pill" [class]="'pill ' + cur.tone" [title]="cur.title">{{ cur.label }}</span>
                      <span class="cap">{{ cur.detail }}</span>
                    } @else {
                      <span class="pill p-n">{{ sx.whyNoLimit }}</span>
                    }
                  </div>
                }
              </div>
            }
          </div>
        </section>
      } @else {
        <div class="grp loading">
          <div class="row"><span class="skel" style="width: 40%; height: 14px"></span></div>
          <div class="row"><span class="skel" style="width: 56%; height: 14px"></span></div>
        </div>
      }
    }
  `,
  styles: `
    .na,
    .loading {
      margin-top: 22px;
    }
    .soft {
      .rl {
        opacity: 0.7;
      }
    }
    .live {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
    .lv {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 12px 14px;
      min-width: 0;
    }
    .lvv {
      // quando o rótulo quebra em 2 linhas (Δ hot spot − núcleo a 960 px), o valor fica na mesma base dos outros
      margin-top: auto;
      font-size: 20px;
      font-weight: 500;
      letter-spacing: -0.01em;
      white-space: nowrap;
      &.lv-warn {
        color: var(--y);
      }
      &.lv-crit {
        color: var(--r);
      }
    }
    .su {
      font-size: 12.5px;
      color: var(--tx3);
      margin-left: 3px;
    }
    .wbar {
      height: 10px;
      margin-top: 12px;
    }
    .wna {
      margin-top: 8px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 14px;
      margin-top: 8px;
      font-size: 12px;
      color: var(--tx2);
      span {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      i {
        width: 8px;
        height: 8px;
        border-radius: 2px;
      }
    }
    .wnow {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      flex-shrink: 0;
    }
  `,
})
export class GpuPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);

  protected readonly flip = (c: { gpuTuning: { enabled: boolean } }) => (c.gpuTuning.enabled = !c.gpuTuning.enabled);
  protected readonly caps = computed(() => this.t.catalog()?.tuning ?? null);
  protected readonly presets = computed(() => this.t.catalog()?.tuningPresets ?? {});
  protected readonly perfcapSupported = computed(() => this.t.defs().get('gpu.perfcap')?.available ?? false);

  /** Valores efetivos do preset escolhido (para os controles). */
  protected readonly target = computed(() => {
    const g = this.ctx.draft()?.gpuTuning;
    if (!g || !this.caps()) return null;
    if (g.preset === 'custom') return { powerW: g.powerLimitW, clockMhz: g.maxClockMhz };
    return this.presets()[g.preset] ?? null;
  });

  protected readonly nowHint = computed(() => {
    const s = this.s();
    const g = this.t.game();
    if (!g) return s.gpuNowIdle;
    const p = this.t.profile()?.tuningPreset;
    return s.gpuNowGame(g.exe, p ? presetName(s, p) : null);
  });

  protected readonly live = computed(() => {
    const v = this.t.values();
    const st = new Map((this.ctx.draft()?.metrics ?? []).map((m) => [m.id, m]));
    return LIVE.map(([id, unit]) => {
      const x = v[id];
      return { id, unit, text: x != null ? String(Math.round(x)) : '—', level: level(x ?? null, st.get(id)?.warn, st.get(id)?.crit) };
    });
  });

  /** Motivo atual (chip filtrado: 2 s para aparecer, 3 s mínimo). */
  protected readonly current = computed(() => {
    const p = this.t.perfcap();
    if (!p.reason) return null;
    const s = this.s();
    const v = this.t.values();
    let extra = '';
    if (p.reason === 'power' && v['gpu.power'] != null) {
      const lim = this.t.tuning()?.powerLimitW ?? this.caps()?.powerDefaultW;
      extra = lim ? s.powerOf(Math.round(v['gpu.power']!), lim) : `${Math.round(v['gpu.power']!)} W`;
    } else if (p.reason === 'thermal' && v['gpu.hotspot'] != null) extra = `hot spot ${Math.round(v['gpu.hotspot']!)} °C`;
    return {
      label: s.perfcapLabel[p.reason],
      tone: p.reason === 'thermal' ? 'p-y' : p.reason === 'power' || p.reason === 'voltage' ? 'p-ac' : 'p-n',
      title: p.reason === 'voltage' ? s.perfcapVoltageHint : '',
      detail: s.whyNowShort(s.ago(Date.now() - p.since), extra),
    };
  });

  /** Tempo por motivo: do backend (clockReasons) e, sem ele, o que esta página viu. Vazia até 10 s. */
  protected readonly bar = computed(() => {
    const s = this.s();
    const sec = this.t.snapshotClockReasons()?.sec;
    const local = this.t.perfcapStats();
    const get = (r: PerfCapReason) => (sec ? (sec[r] ?? 0) : (local[r] ?? 0) / 1000);
    const total = REASONS.reduce((a, x) => a + get(x.r), 0);
    if (total < 10) return null;
    const parts = REASONS.filter((x) => get(x.r) > 0).map((x) => ({ r: x.r, color: x.color, pct: Math.max(1, Math.round((get(x.r) / total) * 100)) }));
    return { parts, aria: s.whyBarAria(parts.map((p) => `${s.perfcapWord[p.r]} ${p.pct}%`).join(', ')) };
  });

  protected pct(w: number) {
    return Math.round((w / (this.caps()?.powerDefaultW || 1)) * 100);
  }

  protected fill(v: number, min: number, max: number) {
    return `${Math.max(0, Math.min(100, ((v - min) / (max - min || 1)) * 100))}%`;
  }

  protected setOnly(v: boolean) {
    this.ctx.update((c) => (c.gpuTuning.onlyInGames = v));
  }

  protected setPreset(p: 'balanced' | 'cool' | 'custom') {
    this.ctx.update((c) => {
      // Ao escolher Personalizado, parte dos valores do preset atual
      if (p === 'custom' && c.gpuTuning.preset !== 'custom') {
        const cur = this.target();
        if (cur) {
          c.gpuTuning.powerLimitW = cur.powerW;
          c.gpuTuning.maxClockMhz = cur.clockMhz;
        }
      }
      c.gpuTuning.preset = p;
    });
  }

  protected setCustom(patch: { powerLimitW?: number; maxClockMhz?: number }) {
    this.ctx.update((c) => {
      if (c.gpuTuning.preset !== 'custom') {
        const cur = this.target();
        if (cur) {
          c.gpuTuning.powerLimitW = cur.powerW;
          c.gpuTuning.maxClockMhz = cur.clockMhz;
        }
        c.gpuTuning.preset = 'custom';
      }
      Object.assign(c.gpuTuning, patch);
    });
  }
}
