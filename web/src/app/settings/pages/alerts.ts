import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../i18n';
import { AlertsConfig } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { groupLabel, unitLabel } from '../../widget/metric-views';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';

const SUSTAIN = [1, 10, 30];
const INTERVALS = [1, 5, 15, 30];

/** Widget › Alertas: aviso do Windows, prévia do aviso e as métricas com limite vermelho (link para a linha em Métricas). */
@Component({
  selector: 'pw-page-alerts',
  imports: [PageHead, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="alerts" />

    @if (d) {
      @let on = !!d.alerts?.enabled;
      <section class="sec" data-anchor="windows">
        <div class="sh"><h2>{{ sx.winNotice }}</h2></div>
        <div class="grp">
          <div class="row" data-tour="alerts-switch">
            <div class="rl">
              <div class="lb" id="l-al">{{ sx.alertsEnable2 }}</div>
              <div class="ht">{{ sx.alertsEnableHint2 }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-al" [attr.aria-checked]="on" (click)="patch({ enabled: !on })"></button>
          </div>
          <div class="row" [class.dimmed]="!on">
            <div class="rl">
              <div class="lb" id="l-snd">{{ sx.alertsSound }}</div>
              <div class="ht">{{ sx.alertsSoundHint2 }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-snd" [attr.aria-checked]="!!d.alerts?.sound" [disabled]="!on" (click)="patch({ sound: !d.alerts?.sound })"></button>
          </div>
          <div class="row" [class.dimmed]="!on">
            <div class="rl">
              <div class="lb">{{ sx.alertsSustain }}</div>
              <div class="ht">{{ sx.alertsSustainHint2 }}</div>
            </div>
            <span class="seg" role="group" [attr.aria-label]="sx.alertsSustain">
              @for (v of sustain; track v) {
                <button type="button" [attr.aria-pressed]="sustainNow() === v" [disabled]="!on" (click)="patch({ sustainSec: v })">{{ v === 1 ? sx.alertsNow : v + ' s' }}</button>
              }
            </span>
          </div>
          <div class="row" [class.dimmed]="!on">
            <div class="rl">
              <div class="lb">{{ sx.alertsInterval }}</div>
              <div class="ht">{{ sx.alertsIntervalHint2 }}</div>
            </div>
            <span class="seg" role="group" [attr.aria-label]="sx.alertsInterval">
              @for (v of intervals; track v) {
                <button type="button" [attr.aria-pressed]="(d.alerts?.minIntervalMin ?? 5) === v" [disabled]="!on" (click)="patch({ minIntervalMin: v })">{{ v }} min</button>
              }
            </span>
          </div>
          <div class="row" [class.dimmed]="!on">
            <div class="rl">
              <div class="lb">{{ sx.alertsTestRow }}</div>
              <div class="ht">{{ sx.alertsTestHint }}</div>
            </div>
            <button type="button" class="btn sm" [disabled]="!on" (click)="t.send({ type: 'testAlert' })">{{ sx.alertsTestBtn }}</button>
          </div>
        </div>
      </section>

      <section class="sec">
        <div class="sh"><h2>{{ sx.howItLooks }}</h2></div>
        <div class="toastrow">
          <div class="wtoast" role="img" [attr.aria-label]="sx.toastAria">
            <div class="tt"><img src="pitwall-logo.png" alt="" width="16" height="16" />Pitwall</div>
            <div class="wt1">{{ sample().title }}</div>
            <div class="wt2">{{ sample().body }}</div>
          </div>
          <p class="ht tnote">{{ sx.toastNote }}</p>
        </div>
      </section>

      <section class="sec" data-anchor="metrics">
        <div class="sh">
          <div>
            <h2>{{ sx.alertMetrics }}</h2>
            <div class="ht">{{ sx.alertMetricsHint }}</div>
          </div>
          <a class="lnk" href="#/settings/metrics" (click)="$event.preventDefault(); ctx.go('metrics')">{{ sx.limitsInMetrics }}<pw-icon name="chevron" [size]="14" [stroke]="2" /></a>
        </div>
        <div class="grp">
          @if (reds().length) {
            <div class="tbl-r th cols">
              <span>{{ sx.colMetric }}</span><span>{{ sx.colWarn }}</span><span>{{ sx.colCrit }}</span><span></span>
            </div>
            @for (m of reds(); track m.id) {
              <div class="tbl-r cols">
                <span class="mname ell">{{ m.name }}</span>
                <span class="lim"><i class="dot" style="background: var(--y)"></i>{{ m.warn }}</span>
                <span class="lim"><i class="dot" style="background: var(--r)"></i>{{ m.crit }}</span>
                <a class="lnk end" [href]="'#/settings/metrics/' + m.id" (click)="$event.preventDefault(); ctx.go('metrics', m.id, true)" [attr.aria-label]="sx.edit + ' · ' + m.name">{{ sx.edit }}</a>
              </div>
            }
          } @else {
            <div class="empty"><div class="ht">{{ sx.alertMetricsNone }}</div></div>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .toastrow {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }
    /* Réplica do aviso do Windows 11 (sempre escuro, como no sistema) */
    .wtoast {
      width: 360px;
      flex-shrink: 0;
      padding: 14px 16px;
      border-radius: 8px;
      background: #2c2c2c;
      border: 1px solid #3a3a3a;
      color: #fff;
      font-family: 'Segoe UI', system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
    }
    .tt {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.75);
      img {
        border-radius: 4px;
      }
    }
    .wt1 {
      font-weight: 600;
      font-size: 14px;
      margin-top: 10px;
    }
    .wt2 {
      font-size: 13px;
      color: rgba(255, 255, 255, 0.78);
      margin-top: 2px;
    }
    .tnote {
      margin: 0;
      max-width: 40ch;
    }
    .cols {
      grid-template-columns: minmax(0, 1fr) 110px 110px 80px;
    }
    .mname {
      font-weight: 600;
    }
    .lim {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .end {
      justify-self: end;
    }
  `,
})
export class AlertsPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  protected readonly sustain = SUSTAIN;
  protected readonly intervals = INTERVALS;

  /** Backend aceita 1–120 s; valores antigos (5) contam como o mais próximo da lista. */
  protected readonly sustainNow = computed(() => {
    const v = this.ctx.draft()?.alerts?.sustainSec ?? 10;
    return SUSTAIN.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  });

  protected readonly reds = computed(() => {
    const d = this.ctx.draft();
    const defs = this.t.defs();
    const s = this.s();
    if (!d) return [];
    return [...d.metrics]
      .sort((a, b) => a.order - b.order)
      .filter((m) => m.crit != null && defs.get(m.id)?.available !== false && defs.has(m.id))
      .map((m) => {
        const def = defs.get(m.id)!;
        const unit = unitLabel(def, m.unit === 'F');
        const fmt = (v?: number) => (v == null ? '—' : `${v}${unit ? ' ' + unit : ''}`);
        return { id: m.id, name: `${groupLabel(d, def.group, null, s)} · ${m.label || def.name}`, warn: fmt(m.warn), crit: fmt(m.crit) };
      });
  });

  /** Prévia com a primeira métrica que tem limite vermelho (o hot spot, na config padrão). */
  protected readonly sample = computed(() => {
    const s = this.s();
    const d = this.ctx.draft();
    const first = d?.metrics.find((m) => m.id === 'gpu.hotspot' && m.crit != null) ?? d?.metrics.find((m) => m.crit != null);
    const def = first ? this.t.defs().get(first.id) : undefined;
    const name = def ? `${first?.label || def.name}${def.group === 'gpu' ? s.ofGpu : ''}` : 'Hot spot';
    const unit = def ? unitLabel(def, first?.unit === 'F') : '°C';
    const crit = first?.crit ?? 95;
    return {
      title: s.toastTitle(name, `${Math.round(crit + 2)} ${unit}`),
      body: s.toastBody(`${crit} ${unit}`, d?.alerts?.sustainSec ?? 10, this.t.game()?.exe ?? 'FC25.exe'),
    };
  });

  protected patch(p: Partial<AlertsConfig>) {
    this.ctx.update((c) => {
      c.alerts = { enabled: false, sound: false, minIntervalMin: 5, ...c.alerts, ...p };
    });
  }
}
