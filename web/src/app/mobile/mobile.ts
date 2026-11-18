import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { I18n } from '../i18n';
import { AppConfig, MetricGroup, MetricView, ThemeName } from '../models';
import { fmtDuration } from '../settings/format';
import { TelemetryService } from '../telemetry.service';
import { buildViews, groupLabel, isDarkTheme } from '../widget/metric-views';

const HEAD: Partial<Record<MetricGroup, string>> = { gpu: 'gpu.load', cpu: 'cpu.load', ram: 'ram.load' };
const SKIP = new Set(['ram.used', 'ram.total', 'fps.current', 'fps.graph', 'fps.avg', 'fps.low01']);

/**
 * Página do celular (#/mobile), servida pelo próprio Pitwall na rede local. Só leitura: mostra o que o widget
 * mostra, no tema e variante do widget, a partir do socket da rede (config e snapshot sanitizados).
 * Estados: conectando, ao vivo, sem conexão (último valor), ocioso (relógio) e sem acesso (revogado/código vencido).
 */
@Component({
  selector: 'pw-mobile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './mobile.scss',
  template: `
    @let sx = s();
    <div [class]="rootClass()" [style.--accent]="accent()">
      <div class="backdrop" aria-hidden="true"></div>
      <div class="page">
        @switch (t.remote()) {
          @case ('revoked') {
            <ng-container *ngTemplateOutlet="brandRow" />
            <div class="notice">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M4 4l16 16" /></svg>
              <p>{{ sx.mobileRevoked }}</p>
            </div>
          }
          @case ('needPair') {
            <ng-container *ngTemplateOutlet="brandRow" />
            <div class="notice">
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM18 18h3v3h-3z" /></svg>
              <p>{{ sx.mobileNeedPair }}</p>
            </div>
          }
          @default {
            @if (t.remote() === 'reconnecting') {
              <div class="banner" role="status">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><path d="M3.5 4v5h5" /></svg>
                {{ sx.mobileReconnecting }}
              </div>
            } @else {
              <ng-container *ngTemplateOutlet="brandRow" />
            }

            @if (!t.config()) {
              <div class="notice"><p>{{ sx.connectingPitwall }}</p></div>
            } @else {
              <div class="content" [class.stale]="t.remote() === 'reconnecting'">
                <section class="center">
                  @if (t.game(); as g) {
                    <span class="game"><i></i>{{ g.exe }}{{ gameFor() ? ' · ' + gameFor() : '' }}</span>
                    <span class="fps">{{ fps()?.text ?? '—' }}</span>
                    <span class="fps-label">FPS@if (t.remote() === 'reconnecting') {<span class="last"> · {{ sx.mobileLastValue(lastValue()) }}</span>}</span>
                    @if (extras().length) {
                      <div class="pills">
                        @for (m of extras(); track m.id) {
                          <span class="pill">{{ m.label }} <b>{{ m.text }}{{ m.unit ? ' ' + m.unit : '' }}</b></span>
                        }
                      </div>
                    }
                  } @else {
                    <span class="clock">{{ clock() }}</span>
                    <span class="date">{{ date() }}</span>
                    <span class="pill idle">{{ sx.noGameDetected }}</span>
                  }
                </section>

                @if (gpu(); as b) {
                  <section class="card card-gpu">
                    <div class="c-head">
                      <span class="kind">GPU</span>
                      <span class="nm">{{ b.label }}</span>
                      @if (limit(); as l) {
                        <span [class]="'lim ' + l.tone" [title]="l.title">
                          @if (l.reason !== 'idle') {
                            ↓
                          }
                          {{ l.word }}
                        </span>
                      }
                      @if (b.head; as h) {
                        <span [class]="'hv ' + h.level">{{ h.text }}<small>%</small></span>
                      }
                    </div>
                    @if (b.head; as h) {
                      <div [class]="'bar ' + h.level"><i [style.transform]="'scaleX(' + bar(h) + ')'"></i></div>
                    }
                    @if (b.tiles.length) {
                      <div class="tiles">
                        @for (m of b.tiles; track m.id) {
                          <div [class]="'tile ' + m.level">
                            <span class="tl">
                              <span class="tn">{{ m.label }}</span>
                              @if (m.peak; as pk) {
                                <i [class]="pk.level">{{ sx.peakMax }} {{ pk.text }}</i>
                              }
                            </span>
                            <span class="v">{{ m.text }}<small>{{ m.unit ? ' ' + m.unit : '' }}</small></span>
                          </div>
                        }
                      </div>
                    }
                  </section>
                }

                <div class="split">
                  @for (b of split(); track b.key) {
                    <section [class]="'card card-' + b.key">
                      <div class="c-head">
                        <span class="kind">{{ b.kind }}</span>
                        @if (b.head; as h) {
                          <span [class]="'hv ' + h.level">{{ h.text }}<small>%</small></span>
                        }
                      </div>
                      @if (b.head; as h) {
                        <div [class]="'bar ' + h.level"><i [style.transform]="'scaleX(' + bar(h) + ')'"></i></div>
                      }
                      @if (b.line; as ln) {
                        <span [class]="'line ' + ln.level">{{ ln.k }} <b>{{ ln.v }}</b></span>
                      }
                    </section>
                  }
                </div>

                @if (batteries().length) {
                  <div class="batts">
                    @for (d of batteries(); track d.key) {
                      <span class="bt" [class.low]="d.low">{{ d.kind }} <b>{{ d.text }}</b>@if (d.charging) {<span aria-hidden="true"> ⚡</span>}</span>
                    }
                  </div>
                }
              </div>
            }
            <div class="grow"></div>
            <footer>{{ sx.mobileFooter(refresh()) }}</footer>
          }
        }
      </div>
    </div>

    <ng-template #brandRow>
      <header class="top">
        <span class="brand">
          <span class="logo" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 16a7 7 0 0 1 14 0" /><path d="M12 16l3.5-4.5" /></svg></span>
          <span class="pc">{{ pcName }}</span>
        </span>
        @if (t.remote() === 'live') {
          <span class="live"><i></i>{{ s().live }}</span>
        }
      </header>
    </ng-template>
  `,
  imports: [NgTemplateOutlet],
})
export class Mobile {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  /** Nome que o celular usou para chegar ao PC (IP ou nome da máquina). */
  protected readonly pcName = location.hostname || 'Pitwall';

  private readonly systemDark = signal(matchMedia('(prefers-color-scheme: dark)').matches);
  protected readonly now = signal(new Date());
  private readonly gameSeen = signal<{ exe: string; since: number } | null>(null);

  private readonly config = computed(() => this.t.config() as AppConfig | null);
  protected readonly theme = computed<ThemeName>(() => (this.config()?.widgetTheme as ThemeName) || 'lumen');
  protected readonly dark = computed(() => isDarkTheme(this.config(), this.theme(), this.systemDark()));
  protected readonly rootClass = computed(() => `mb t-${this.theme()} ${this.dark() ? 'dark' : 'light'}`);
  protected readonly accent = computed(() => this.config()?.accent || null);

  private views(group: MetricGroup): MetricView[] {
    const ext = this.t.game() ? this.t.extremes() : null;
    return buildViews(this.config(), this.t.defs(), this.t.values(), group, ext);
  }

  protected readonly fps = computed(() => this.views('fps').find((m) => m.id === 'fps.current') ?? null);
  protected readonly extras = computed(() => this.views('fps').filter((m) => !SKIP.has(m.id)).slice(0, 3));

  protected readonly gpu = computed(() => {
    const v = this.views('gpu');
    if (!v.length) return null;
    return {
      label: groupLabel(this.config(), 'gpu', this.t.catalog(), this.s()),
      head: v.find((m) => m.id === HEAD.gpu) ?? null,
      tiles: v.filter((m) => m.id !== HEAD.gpu).slice(0, 4),
    };
  });

  protected readonly split = computed(() => {
    const s = this.s();
    const out: { key: string; kind: string; head: MetricView | null; line: { k: string; v: string; level: string } | null }[] = [];
    const cpu = this.views('cpu');
    if (cpu.length) {
      const t = cpu.find((m) => m.id !== HEAD.cpu);
      out.push({ key: 'cpu', kind: 'CPU', head: cpu.find((m) => m.id === HEAD.cpu) ?? null, line: t ? { k: t.label, v: `${t.text}${t.unit ? ' ' + t.unit : ''}`, level: t.level } : null });
    }
    const ram = this.views('ram');
    const vals = this.t.values();
    if (ram.length) {
      const used = vals['ram.used'];
      const total = vals['ram.total'];
      out.push({
        key: 'ram',
        kind: 'RAM',
        head: ram.find((m) => m.id === HEAD.ram) ?? null,
        line: used != null && total != null ? { k: s.inUse, v: `${used.toFixed(1)} / ${Math.round(total)} GB`, level: 'ok' } : null,
      });
    }
    return out;
  });

  protected readonly limit = computed(() => {
    const reason = this.t.perfcap().reason;
    if (!reason) return null;
    const s = this.s();
    return {
      reason,
      word: s.perfcapWord[reason],
      tone: reason === 'thermal' ? 'warn' : reason === 'power' || reason === 'voltage' ? 'accent' : 'neutral',
      title: reason === 'voltage' ? s.perfcapVoltageHint : s.perfcapWhy,
    };
  });

  protected readonly batteries = computed(() => {
    const cfg = this.config()?.battery;
    if (cfg && !cfg.enabled) return [];
    const kinds = this.s().battKinds;
    const low = cfg?.lowPercent ?? 15;
    return this.t
      .batteries()
      .filter((d) => d.connected && !(cfg?.hidden ?? []).includes(d.key))
      .map((d) => ({
        key: d.key,
        kind: kinds[d.kind] ?? d.kind,
        text: d.percent != null ? `${d.percent}%` : (d.levelText ?? '—'),
        low: d.percent != null && d.percent <= low,
        charging: d.charging,
      }));
  });

  protected readonly gameFor = computed(() => {
    const g = this.gameSeen();
    this.now();
    const sec = g ? (Date.now() - g.since) / 1000 : 0;
    return sec >= 60 ? fmtDuration(sec) : '';
  });

  protected readonly refresh = computed(() => {
    const ms = this.config()?.refreshMs ?? 1000;
    return ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
  });

  protected readonly lastValue = computed(() =>
    new Date(this.t.lastSnapshotAt() || Date.now()).toLocaleTimeString(this.s().locale, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }),
  );
  protected readonly clock = computed(() => this.now().toLocaleTimeString(this.s().locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
  protected readonly date = computed(() => this.now().toLocaleDateString(this.s().locale, { weekday: 'long', day: 'numeric', month: 'long' }));

  protected bar(m: MetricView) {
    return Math.max(0, Math.min(100, m.value ?? 0)) / 100;
  }

  constructor() {
    // Duração do jogo: o socket do celular não manda sessões; conta desde que a página viu o jogo
    effect(() => {
      const g = this.t.game();
      const cur = this.gameSeen();
      if (!g) {
        if (cur) this.gameSeen.set(null);
      } else if (cur?.exe !== g.exe) this.gameSeen.set({ exe: g.exe, since: Date.now() });
    });
    // Barra de status do celular na cor do fundo do tema
    effect(() => {
      this.rootClass();
      requestAnimationFrame(() => {
        const bg = getComputedStyle(document.querySelector('.mb') ?? document.body).backgroundColor;
        let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (!meta) {
          meta = document.createElement('meta');
          meta.name = 'theme-color';
          document.head.appendChild(meta);
        }
        meta.content = bg;
      });
    });
    // O relógio (ocioso) e a duração do jogo só precisam virar o minuto
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      this.now.set(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    tick();
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    mq.addEventListener('change', onScheme);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timer);
      mq.removeEventListener('change', onScheme);
    });
  }
}
