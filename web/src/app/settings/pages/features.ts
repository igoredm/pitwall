import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../i18n';
import { AppConfig, FeaturesConfig, SettingsPage } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';

/** Chave do recurso em i18n (feat) → onde fica no config, página do link e grupo. */
interface Feature {
  key: string;
  group: 'game' | 'record' | 'notify';
  get: (c: AppConfig) => boolean;
  set: (c: AppConfig, v: boolean) => void;
  page: SettingsPage;
  anchor?: string;
}

const f = (k: keyof FeaturesConfig): Pick<Feature, 'get' | 'set'> => ({
  get: (c) => c.features?.[k] !== false,
  set: (c, v) => {
    c.features = { crashReport: true, gameSuggestions: true, sessionPeaks: true, clockReason: true, ...c.features, [k]: v };
  },
});

/** Os 11 interruptores (nomes de config exatos do backend, docs/protocol.md › 7.2). */
const FEATURES: Feature[] = [
  { key: 'autoDetect', group: 'game', get: (c) => c.games.autoDetect, set: (c, v) => (c.games.autoDetect = v), page: 'games', anchor: 'detection' },
  { key: 'gameSuggestions', group: 'game', ...f('gameSuggestions'), page: 'games', anchor: 'detection' },
  { key: 'sessionPeaks', group: 'game', ...f('sessionPeaks'), page: 'metrics' },
  // 1.2: engasgos na sessão → Relatórios de jogo
  { key: 'stutters', group: 'game', ...f('stutters'), page: 'sessions', anchor: 'last' },
  { key: 'clockReason', group: 'game', ...f('clockReason'), page: 'gpu', anchor: 'now' },
  { key: 'crashReport', group: 'game', ...f('crashReport'), page: 'sessions', anchor: 'crash' },
  {
    key: 'openSummaryOnGameEnd',
    group: 'game',
    get: (c) => !!c.features?.openSummaryOnGameEnd,
    set: (c, v) => (c.features = { crashReport: true, gameSuggestions: true, sessionPeaks: true, clockReason: true, ...c.features, openSummaryOnGameEnd: v }),
    page: 'sessions',
    anchor: 'last',
  },
  // 1.2: atalhos globais (RegisterHotKey) → App › Atalhos
  {
    key: 'hotkeys',
    group: 'game',
    get: (c) => c.hotkeys?.enabled ?? true,
    set: (c, v) => (c.hotkeys = { toggleWidget: 'Ctrl+Alt+P', marker: 'Ctrl+Alt+M', ...c.hotkeys, enabled: v }),
    page: 'app',
    anchor: 'hotkeys',
  },
  { key: 'log', group: 'record', get: (c) => c.log.enabled, set: (c, v) => (c.log.enabled = v), page: 'sessions', anchor: 'csv' },
  { key: 'gpuTuning', group: 'record', get: (c) => c.gpuTuning.enabled, set: (c, v) => (c.gpuTuning.enabled = v), page: 'gpu', anchor: 'tuning' },
  { key: 'battery', group: 'record', get: (c) => c.battery.enabled, set: (c, v) => (c.battery.enabled = v), page: 'metrics', anchor: 'battery' },
  {
    key: 'alerts',
    group: 'notify',
    get: (c) => !!c.alerts?.enabled,
    set: (c, v) => (c.alerts = { sound: false, minIntervalMin: 5, ...c.alerts, enabled: v }),
    page: 'alerts',
    anchor: 'windows',
  },
  {
    key: 'remote',
    group: 'notify',
    get: (c) => !!c.remote?.enabled,
    set: (c, v) => (c.remote = { port: 48124, pairedDevices: [], ...c.remote, enabled: v }),
    page: 'devices',
  },
  {
    key: 'autoUpdate',
    group: 'notify',
    get: (c) => c.update?.autoCheck ?? true,
    set: (c, v) => (c.update = { channel: 'stable', ...c.update, autoCheck: v }),
    page: 'app',
    anchor: 'updates',
  },
];
const GROUPS: Feature['group'][] = ['game', 'record', 'notify'];

/** Pitwall › Recursos: um switch por recurso, com uma linha de explicação e o link para o ajuste dele. */
@Component({
  selector: 'pw-page-features',
  imports: [PageHead, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    <pw-page-head page="features" />

    @for (g of groups(); track g.id) {
      <section class="sec">
        <div class="sh"><h2>{{ sx.featGroups[g.id] }}</h2></div>
        <div class="grp">
          @for (r of g.rows; track r.key) {
            <div class="row frow" [attr.data-anchor]="r.key">
              <button type="button" class="sw" role="switch" [attr.aria-labelledby]="'f-' + r.key" [attr.aria-describedby]="'fd-' + r.key" [attr.aria-checked]="r.on" [disabled]="r.disabled" (click)="toggle(r.key)"></button>
              <div class="rl" [class.dimmed]="r.dim">
                <div class="lb fl">
                  <span [id]="'f-' + r.key">{{ r.name }}</span>
                  @if (r.pill; as p) {
                    <span class="pill" [class]="'pill ' + p.tone">{{ p.text }}</span>
                  }
                </div>
                <div class="ht" [id]="'fd-' + r.key">{{ r.note ?? r.line }}</div>
              </div>
              <a class="lnk" [href]="'#/settings/' + r.page + (r.anchor ? '/' + r.anchor : '')" [attr.aria-label]="sx.goTo(r.link)" (click)="$event.preventDefault(); ctx.go(r.page, r.anchor)">
                {{ r.link }}<pw-icon name="chevron" [size]="14" [stroke]="2" />
              </a>
            </div>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .frow {
      gap: 16px;
    }
    .fl {
      display: flex;
      align-items: center;
      gap: 8px;
    }
  `,
})
export class FeaturesPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);

  protected readonly groups = computed(() => {
    const d = this.ctx.draft();
    const s = this.s();
    const cat = this.t.catalog();
    if (!d) return [];
    const nvidia = cat?.tuning?.supported ?? true;
    const reader = cat?.battery ?? true;
    return GROUPS.map((id) => ({
      id,
      rows: FEATURES.filter((x) => x.group === id).map((x) => {
        const [name, line, link] = s.feat[x.key] ?? s.featV12[x.key];
        const on = x.get(d);
        // Sem suporte: switch desligado e travado, com o motivo numa pílula amarela
        const unsupported = (x.key === 'gpuTuning' || x.key === 'clockReason') && !nvidia ? s.needsNvidia : x.key === 'battery' && !reader ? s.readerNotFound : null;
        // Dependência: a sugestão só existe com a detecção ligada
        const needs = x.key === 'gameSuggestions' && !d.games.autoDetect;
        return {
          key: x.key,
          name,
          line,
          link,
          page: x.page,
          anchor: x.anchor,
          on: on && !unsupported,
          disabled: !!unsupported || needs,
          dim: !!unsupported || needs,
          note: needs ? s.needsDetection : null,
          pill: unsupported ? { text: unsupported, tone: 'p-y' } : x.key === 'clockReason' ? { text: 'NVIDIA', tone: 'p-n' } : null,
        };
      }),
    }));
  });

  protected toggle(key: string) {
    const x = FEATURES.find((y) => y.key === key);
    if (!x) return;
    this.ctx.update((c) => x.set(c, !x.get(c)));
  }
}
