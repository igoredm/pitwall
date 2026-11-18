import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../i18n';
import { PerfCapReason } from '../models';
import { TelemetryService } from '../telemetry.service';

/** Cor da barra por motivo (design: power accent, térmico amarelo, voltagem #8FB5FF, sincronia text3, sem limite track). */
const ORDER: PerfCapReason[] = ['power', 'thermal', 'voltage', 'sync', 'idle', 'none'];

/** GPU → card "Agora" → linha "Por que o clock caiu": motivo atual + tempo por motivo nesta sessão. */
@Component({
  selector: 'pw-perfcap-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './perfcap-row.scss',
  template: `
    @let sx = s();
    <div class="why">
      <div class="lead">
        <span class="f-label">{{ sx.whyTitle }}</span>
        <span class="hint">{{ sx.whyHint }}</span>
      </div>
      <div class="body">
        @switch (state()) {
          @case ('loading') {
            <span class="hint loading">{{ sx.whyLoading }}</span>
          }
          @case ('unsupported') {
            <div class="na">
              <span class="strong">{{ sx.whyUnavailable }}</span>
              <span class="hint">{{ sx.whyUnavailableHint }}</span>
            </div>
          }
          @default {
            <div class="now">
              <span class="hint">{{ sx.whyNow }}</span>
              @if (current(); as c) {
                <span [class]="'lim ' + c.tone" [title]="c.title">
                  @if (c.arrow) {
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
                  }
                  {{ c.label }}
                </span>
                <span class="hint">{{ c.detail }}</span>
              } @else {
                <span class="lim neutral">{{ sx.whyNoLimit }}</span>
              }
            </div>
            @if (bar(); as b) {
              <div class="bar" role="img" [attr.aria-label]="b.aria">
                @for (p of b.parts; track p.reason) {
                  <span [class]="'r-' + p.reason" [style.flex-grow]="p.pct"></span>
                }
              </div>
              <div class="legend">
                @for (p of b.parts; track p.reason) {
                  <span class="lg"><i [class]="'r-' + p.reason"></i>{{ sx.perfcapWord[p.reason] }} <b>{{ p.pct }}%</b></span>
                }
              </div>
            } @else {
              <div class="bar empty"></div>
              <span class="hint">{{ sx.whyBarEmpty }}</span>
            }
          }
        }
      </div>
    </div>
  `,
})
export class PerfcapRow {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;

  protected readonly state = computed(() => {
    const def = this.t.defs().get('gpu.perfcap');
    if (!def) return this.t.catalog() ? 'unsupported' : 'loading';
    if (!def.available) return 'unsupported';
    if (!this.t.lastSnapshotAt()) return 'loading';
    return 'ok';
  });

  protected readonly current = computed(() => {
    const p = this.t.perfcap();
    if (!p.reason) return null;
    const s = this.s();
    const v = this.t.values();
    const since = s.ago(Date.now() - p.since);
    let extra = '';
    if (p.reason === 'power' && v['gpu.power'] != null) {
      const limit = this.t.tuning()?.powerLimitW ?? this.t.catalog()?.tuning?.powerDefaultW;
      extra = limit ? s.powerOf(Math.round(v['gpu.power']!), limit) : `${Math.round(v['gpu.power']!)} W`;
    } else if (p.reason === 'thermal' && v['gpu.hotspot'] != null) extra = `hot spot ${Math.round(v['gpu.hotspot']!)} °C`;
    return {
      label: s.perfcapLabel[p.reason],
      tone: p.reason === 'thermal' ? 'warn' : p.reason === 'power' || p.reason === 'voltage' ? 'accent' : 'neutral',
      arrow: p.reason !== 'idle',
      title: p.reason === 'voltage' ? s.perfcapVoltageHint : '',
      detail: extra ? `${since} · ${extra}` : since,
    };
  });

  /** Barra empilhada com o % da sessão; vazia até 10 s de jogo. */
  protected readonly bar = computed(() => {
    const st = this.t.perfcapStats();
    const total = ORDER.reduce((a, r) => a + (st[r] ?? 0), 0);
    if (total < 10_000) return null;
    const s = this.s();
    const parts = ORDER.filter((r) => (st[r] ?? 0) > 0).map((reason) => ({ reason, pct: Math.max(1, Math.round(((st[reason] ?? 0) / total) * 100)) }));
    return { parts, aria: s.whyBarAria(parts.map((p) => `${s.perfcapWord[p.reason]} ${p.pct}%`).join(', ')) };
  });
}
