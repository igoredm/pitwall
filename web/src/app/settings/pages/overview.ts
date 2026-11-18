import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../i18n';
import { SettingsPage, ThemeName } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { WidgetThumb } from '../../ui/widget-thumb';
import { isDarkTheme } from '../../widget/metric-views';
import { capitalize, dayTime, fmtBytes, fmtDuration, fmtMs } from '../format';
import { autoLayout, layoutName, presetName, selectedMonitor } from '../helpers';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';
import { TOUR_STEPS } from '../tour';

interface NowRow {
  key: string;
  icon: string;
  label: string;
  page: SettingsPage;
  anchor?: string;
  exe?: string;
  text: string;
  pill?: string;
}

/** Visão geral: miniatura do widget, o que está rodando agora (cada linha leva à página dela) e o tour. */
@Component({
  selector: 'pw-page-overview',
  imports: [PageHead, Icon, WidgetThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="overview" />

    @if (crash(); as c) {
      <div class="note n-r mid crash" role="status">
        <span class="ico"><pw-icon name="power" [size]="18" [stroke]="2" /></span>
        <div class="rl">
          <div class="b">{{ sx.crashTitle(c.exe) }}</div>
          <div class="ht m0">{{ sx.ovCrashSub(c.when) }}</div>
        </div>
        <button type="button" class="btn sm" (click)="ctx.go('sessions', 'crash')">{{ sx.crashView }}</button>
        <button type="button" class="btn qt sm" (click)="t.send({ type: 'dismissCrashReport' })">{{ sx.crashDismiss }}</button>
      </div>
    }

    @if (d) {
      <section class="sec" data-anchor="widget">
        <div class="sh"><h2>Widget</h2></div>
        <div class="grp wbox" data-tour="widget-thumb">
          <pw-widget-thumb [theme]="theme()" [scale]="2" class="thumb" />
          <div class="winfo">
            <div>
              <div class="lb">{{ d.widget.visible ? sx.ovWidgetOn(mon()?.index ?? '—') : sx.ovWidgetOff(mon()?.index ?? '—') }}</div>
              <div class="ht">{{ desc() }}</div>
            </div>
            <div class="facts">
              <span><pw-icon name="eye" [size]="15" />{{ d.widget.visible ? sx.ovVisible(d.widget.locked) : sx.ovHidden }}</span>
              <span><pw-icon name="refresh" [size]="15" />{{ sx.ovRefresh(rate()) }}</span>
            </div>
            <div class="acts">
              <button type="button" class="btn sm" (click)="ctx.openPreview()">{{ sx.previewBtn }}</button>
              <button type="button" class="btn sm qt" (click)="toggleVisible()">{{ d.widget.visible ? sx.hideWidget : sx.showWidgetBtn }}</button>
              <a class="lnk end" [href]="'#/settings/widget'" (click)="go($event, 'widget')">{{ sx.pages.widget }}<pw-icon name="chevron" [size]="14" [stroke]="2" /></a>
            </div>
          </div>
        </div>
      </section>

      <section class="sec">
        <div class="sh"><h2>{{ sx.ovNow }}</h2></div>
        <div class="grp">
          @for (r of rows(); track r.key) {
            <a class="row nowrow" [href]="'#/settings/' + r.page" (click)="go($event, r.page, r.anchor)">
              <span class="ico"><pw-icon [name]="r.icon" [size]="18" /></span>
              <span class="rl nl">
                <span class="lb nlb">{{ r.label }}</span>
                <span class="ntx ell">
                  @if (r.exe) {
                    <span class="mono tx">{{ r.exe }}</span>
                  }
                  {{ r.text }}
                </span>
              </span>
              @if (r.pill) {
                <span class="pill p-g">{{ r.pill }}</span>
              }
              <span class="ico"><pw-icon name="chevron" [size]="16" [stroke]="2" /></span>
            </a>
          }
        </div>
      </section>

      @if (tourCard(); as tc) {
        <section class="sec" data-anchor="tour">
          <div class="sh"><h2>{{ sx.firstSteps }}</h2></div>
          <div class="grp">
            <div class="row">
              <div class="rl">
                <div class="lb">{{ sx.tourCardTitle }}</div>
                <div class="ht">{{ tc.step ? sx.tourCardSeen(tc.step) : sx.tourCardNew }}</div>
              </div>
              @if (tc.step) {
                <span class="bar tbar" role="img" [attr.aria-label]="sx.tourOf(tc.step, 8)"><span [style.width.%]="(tc.step / 8) * 100" style="background: var(--ac)"></span></span>
              }
              <button type="button" class="btn sm pri" (click)="ctx.startTour(true)">{{ tc.step ? sx.resumeTour : sx.startTour }}</button>
              <button type="button" class="btn qt sm" (click)="dismissTour()">{{ sx.dismiss }}</button>
            </div>
          </div>
        </section>
      }
    }
  `,
  styles: `
    .crash {
      margin-top: 20px;
      .b {
        font-weight: 700;
      }
      .m0 {
        margin: 0;
      }
    }
    .wbox {
      display: flex;
      gap: 20px;
      padding: 16px;
      align-items: center;
    }
    .thumb {
      border-radius: 8px;
      overflow: hidden;
    }
    .winfo {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .facts {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      color: var(--tx2);
      span {
        display: flex;
        gap: 8px;
        align-items: center;
      }
    }
    .acts {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .end {
      margin-left: auto;
    }
    .nowrow {
      min-height: 46px;
      padding-top: 10px;
      padding-bottom: 10px;
    }
    .nl {
      display: flex;
      align-items: baseline;
      gap: 12px;
    }
    .nlb {
      width: 148px;
      flex-shrink: 0;
    }
    .ntx {
      color: var(--tx2);
      font-size: 13.5px;
      .tx {
        color: var(--tx);
      }
    }
    .tbar {
      width: 120px;
    }
    @media (hover: hover) and (pointer: fine) {
      .nowrow:hover {
        background: var(--sf2);
      }
    }
    @media (max-width: 1100px) {
      .thumb {
        --u: 1.6 !important;
      }
    }
  `,
})
export class OverviewPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);

  protected readonly theme = computed<ThemeName>(() => (this.ctx.draft()?.widgetTheme as ThemeName) || 'lumen');
  protected readonly mon = computed(() => selectedMonitor(this.t.catalog(), this.ctx.draft()));
  protected readonly rate = computed(() => fmtMs(this.ctx.draft()?.refreshMs ?? 1000, this.s()));

  protected readonly desc = computed(() => {
    const s = this.s();
    const d = this.ctx.draft();
    const m = this.mon();
    if (!d) return '';
    const pref = d.widget.layout ?? 'auto';
    const eff = pref === 'auto' ? autoLayout(d.widget.width, d.widget.height) : pref;
    const dark = isDarkTheme(d, this.theme(), !matchMedia('(prefers-color-scheme: light)').matches);
    const res = m ? `${m.width} × ${m.height}` : '—';
    return s.ovWidgetDesc(res, !!m && m.height > m.width, layoutName(s, eff), pref === 'auto', s.themeVariant(s.themeNames[this.theme()], dark));
  });

  protected readonly crash = computed(() => {
    const cr = this.t.catalog()?.crashReport;
    return cr ? { exe: cr.session.exe, when: capitalize(dayTime(cr.time, this.s())) } : null;
  });

  protected readonly rows = computed<NowRow[]>(() => {
    const s = this.s();
    const d = this.ctx.draft();
    if (!d) return [];
    const cat = this.t.catalog();
    const rows: NowRow[] = [];

    // Jogo
    const g = this.t.game();
    const live = this.t.sessions()[0];
    const fps = this.t.values()['fps.current'];
    if (g) {
      const dur = live && !live.end && live.exe === g.exe ? fmtDuration((Date.now() - new Date(live.start).getTime()) / 1000) : '';
      rows.push({
        key: 'game',
        icon: 'games',
        label: s.ovGame,
        page: 'games',
        exe: g.exe,
        text: ' · ' + [s.gameModes[g.mode] ?? g.mode, dur, fps != null ? `${Math.round(fps)} FPS` : ''].filter(Boolean).join(' · '),
        pill: s.inGame,
      });
    } else rows.push({ key: 'game', icon: 'games', label: s.ovGame, page: 'games', text: s.ovNoGame });

    // Ajuste da GPU
    const tuning = this.t.tuning();
    const supported = cat?.tuning?.supported ?? false;
    const prof = this.t.profile()?.tuningPreset;
    const preset = presetName(s, prof && prof !== 'off' ? prof : d.gpuTuning.preset);
    rows.push({
      key: 'gpu',
      icon: 'gpu',
      label: s.pages.gpu,
      page: 'gpu',
      text: !supported
        ? s.gpuNeedsNvidia.charAt(0).toUpperCase() + s.gpuNeedsNvidia.slice(1)
        : tuning?.active
          ? s.ovGpuActive(preset, tuning.powerLimitW, tuning.clockMaxMhz)
          : d.gpuTuning.enabled
            ? s.ovGpuWaiting(preset)
            : s.ovGpuOff,
    });

    // Alertas
    const reds = d.metrics.filter((m) => m.crit != null && this.t.defs().get(m.id)?.available !== false).length;
    rows.push({ key: 'alerts', icon: 'alerts', label: s.pages.alerts, page: 'alerts', text: d.alerts?.enabled ? s.ovAlertsOn(reds) : s.ovAlertsOff(reds) });

    // Celular e TV
    const devs = this.t.devices();
    const watching = devs.find((x) => x.online);
    rows.push({
      key: 'devices',
      icon: 'devices',
      label: s.pages.devices,
      page: 'devices',
      text: !d.remote?.enabled ? s.ovDevicesOff : devs.length ? s.ovDevices(devs.length, watching?.name ?? null) : s.ovDevicesNone,
    });

    // Gravação CSV
    const ls = this.t.logStats();
    rows.push({
      key: 'csv',
      icon: 'file',
      label: s.csvTitle,
      page: 'sessions',
      anchor: 'csv',
      text: !d.log.enabled ? s.ovCsvOff : ls ? s.ovCsv(fmtBytes(ls.totalBytes, s), s.files(ls.files), d.log.keepDays ?? 30) : s.usageLoading,
    });

    // Bateria
    const bats = this.t.batteries().filter((b) => !d.battery.hidden.includes(b.key));
    rows.push({
      key: 'battery',
      icon: 'battery',
      label: s.battTab,
      page: 'metrics',
      anchor: 'battery',
      text: !d.battery.enabled
        ? s.ovBatteryOff
        : bats.length
          ? bats
              .slice(0, 3)
              .map((b) => `${b.name} ${b.percent != null ? b.percent + '%' : (b.levelText ?? '—')}`)
              .join(' · ')
          : s.ovBatteryNone,
    });
    return rows;
  });

  /** "Primeiros passos" até concluir ou dispensar o tour. */
  protected readonly tourCard = computed(() => {
    const tour = this.ctx.draft()?.tour;
    if (!tour || tour.done || tour.dismissed) return null;
    return { step: Math.min(tour.step, TOUR_STEPS.length) };
  });

  constructor() {
    this.t.requestLogStats();
    // "vendo agora" só vem na mensagem devices
    this.t.send({ type: 'listDevices' });
  }

  protected go(e: Event, page: SettingsPage, anchor?: string) {
    e.preventDefault();
    this.ctx.go(page, anchor);
  }

  protected toggleVisible() {
    this.ctx.update((c) => (c.widget.visible = !c.widget.visible));
  }

  protected dismissTour() {
    this.ctx.update((c) => (c.tour = { step: c.tour?.step ?? 0, done: c.tour?.done ?? false, dismissed: true }));
  }
}
