import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { I18n } from '../../i18n';
import { AppConfig, MonitorInfo, THEMES, ThemeName, WidgetLayout } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { WidgetThumb } from '../../ui/widget-thumb';
import { layoutName, monitorWhere, selectedMonitor } from '../helpers';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';

/** Cores de destaque; os nomes ficam em i18n.ts (accents). "" = padrão do tema. */
export const ACCENTS = ['', '#4C8DFF', '#8B5CF6', '#FF2E88', '#FF7A1A', '#FFC53D', '#3DDC84', '#00E5FF'];
/** Ordem do canvas: Lumen (padrão) primeiro. */
export const THEME_ORDER: ThemeName[] = ['lumen', 'minimo', 'neon', 'terminal', 'splash'];
/** Destaque padrão de cada tema no escuro / claro (espelha --accent-default em styles.scss). */
const THEME_ACCENT: Record<ThemeName, [string, string]> = {
  lumen: ['#4C8DFF', '#2F6FEB'],
  minimo: ['#EDEDEE', '#111112'],
  neon: ['#00E5FF', '#00E5FF'],
  terminal: ['#4AF626', '#4AF626'],
  splash: ['#FF2E88', '#FF2E88'],
};
const LAYOUTS: WidgetLayout[] = ['auto', 'full', 'mid', 'compact'];

/** Widget › Aparência e posição: tema (prévias), variante, destaque, layout, monitor e janela. */
@Component({
  selector: 'pw-page-appearance',
  imports: [PageHead, Icon, WidgetThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="widget">
      <button type="button" class="btn sm" (click)="ctx.openPreview()">{{ sx.previewBtn }}</button>
    </pw-page-head>

    @if (d) {
      <section class="sec" data-anchor="theme">
        <div class="sh">
          <div>
            <h2 id="h-theme">{{ sx.widgetTheme }}</h2>
            <div class="ht">{{ sx.widgetThemeHint2 }}</div>
          </div>
        </div>
        <div class="grp">
          <div class="themes" role="radiogroup" aria-labelledby="h-theme">
            @for (th of themes; track th.id) {
              @let on = (d.widgetTheme || 'lumen') === th.id;
              <button type="button" class="thm" role="radio" [attr.aria-checked]="on" (click)="setTheme(th.id)">
                <span class="frame" [class.on]="on"><pw-widget-thumb [theme]="th.id" /></span>
                <span class="tname" [class.on]="on">
                  {{ sx.themeNames[th.id] }}
                  @if (on) {
                    <span class="tck"><pw-icon name="check" [size]="15" [stroke]="2" /></span>
                  } @else if (th.darkOnly) {
                    <span class="t3 donly">{{ sx.darkOnlyShort }}</span>
                  }
                </span>
              </button>
            }
          </div>
          <div class="row bt" data-anchor="variant">
            <div class="rl">
              <div class="lb">{{ sx.variant }}</div>
              <div class="ht">{{ sx.darkOnlyHint }}</div>
            </div>
            <span class="seg" role="group" [attr.aria-label]="sx.variant">
              <button type="button" [attr.aria-pressed]="d.themeMode === 'light'" [disabled]="darkOnly()" (click)="patch({ themeMode: 'light' })">{{ sx.light }}</button>
              <button type="button" [attr.aria-pressed]="d.themeMode === 'dark' || darkOnly()" (click)="patch({ themeMode: 'dark' })">{{ sx.dark }}</button>
              <button type="button" [attr.aria-pressed]="d.themeMode === 'system' && !darkOnly()" [disabled]="darkOnly()" (click)="patch({ themeMode: 'system' })">{{ sx.system }}</button>
            </span>
          </div>
          <div class="row" data-anchor="accent">
            <div class="rl">
              <div class="lb" id="l-accent">{{ sx.accent }}</div>
              <div class="ht">{{ d.accent ? sx.accentUsing(d.accent) : sx.accentDefaultHint(themeAccent()) }}</div>
            </div>
            <span class="sws" role="radiogroup" aria-labelledby="l-accent">
              @for (a of accents; track a) {
                <button
                  type="button"
                  role="radio"
                  class="swatch"
                  [class.def]="!a"
                  [attr.aria-checked]="(d.accent || '') === a"
                  [attr.aria-label]="sx.accents[a]"
                  [title]="sx.accents[a]"
                  [style.background]="a || null"
                  (click)="patch({ accent: a })"
                ></button>
              }
              <label class="btn sm icon custom" [class.sel]="isCustom(d.accent)" [title]="sx.accentOther">
                <pw-icon name="plus" [size]="14" [stroke]="2" />
                <input type="color" [attr.aria-label]="sx.accentOther" [value]="d.accent || '#4c8dff'" (change)="patch({ accent: $any($event.target).value.toUpperCase() })" />
              </label>
            </span>
          </div>
        </div>
      </section>

      <section class="sec" data-anchor="layout">
        <div class="sh">
          <div>
            <h2 id="h-layout">{{ sx.layout }}</h2>
            <div class="ht">{{ layoutNow() }}</div>
          </div>
        </div>
        <div class="grp" data-tour="layout">
          <div class="layouts" role="radiogroup" aria-labelledby="h-layout">
            @for (l of layouts; track l) {
              @let on = (d.widget.layout ?? 'auto') === l;
              <button type="button" role="radio" class="lay" [class.on]="on" [attr.aria-checked]="on" (click)="setLayout(l)">
                <span class="shape-box"><span [class]="'shape s-' + l"></span></span>
                <span>
                  <span class="lname">{{ name(l) }}</span>
                  <span class="ldesc">{{ sx.layoutDesc[l] }}</span>
                </span>
              </button>
            }
          </div>
          <div class="row bt">
            <div class="rl">
              <div class="lb">{{ sx.perGame }}</div>
              <div class="ht">{{ perGame() }}</div>
            </div>
            <a class="lnk" href="#/settings/games/profiles" (click)="$event.preventDefault(); ctx.go('games', 'profiles')">{{ sx.perGameLink }}<pw-icon name="chevron" [size]="14" [stroke]="2" /></a>
          </div>
        </div>
      </section>

      <section class="sec" data-anchor="monitor">
        <div class="sh"><h2 id="h-mon">{{ sx.monitor }}</h2></div>
        <div class="grp">
          <div class="monbox">
            <div class="mons" role="radiogroup" aria-labelledby="h-mon" [style.width.px]="monBox().w" [style.height.px]="monBox().h">
              @for (m of monBox().list; track m.info.device) {
                <button
                  type="button"
                  class="mon"
                  role="radio"
                  [attr.aria-checked]="m.info.device === mon()?.device"
                  [attr.aria-pressed]="m.info.device === mon()?.device"
                  [style.left.px]="m.x"
                  [style.top.px]="m.y"
                  [style.width.px]="m.w"
                  [style.height.px]="m.h"
                  (click)="setMonitor(m.info)"
                >
                  {{ m.info.index }}
                  @if (m.w > 90) {
                    <span class="mon-sub">{{ m.info.width }} × {{ m.info.height }}{{ m.info.primary ? ' · ' + sx.primary : '' }}</span>
                  }
                </button>
              } @empty {
                <span class="ht">{{ sx.connectingPitwall }}</span>
              }
            </div>
            @if (mon(); as m) {
              <div class="rl">
                <div class="lb">{{ sx.monitorN(m.index) }}</div>
                <div class="ht">{{ m.width }} × {{ m.height }} · {{ sx.monitorWhere[where(m)] }} · {{ sx.widgetAt(d.widget.x, d.widget.y) }}</div>
                @if (t.inHost) {
                  <button type="button" class="btn sm idm" (click)="t.host({ type: 'identifyMonitors' })">{{ sx.identifyMonitors }}</button>
                }
              </div>
            }
          </div>
        </div>
      </section>

      <section class="sec" data-anchor="window">
        <div class="sh"><h2>{{ sx.windowSec }}</h2></div>
        <div class="grp">
          <div class="row">
            <div class="rl">
              <div class="lb" id="l-vis">{{ sx.showWidgetRow }}</div>
              <div class="ht">{{ sx.showWidgetHint }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-vis" [attr.aria-checked]="d.widget.visible" (click)="patchWidget({ visible: !d.widget.visible })"></button>
          </div>
          <div class="row" data-anchor="lock">
            <div class="rl">
              <div class="lb" id="l-lock">{{ sx.lockRow }}</div>
              <div class="ht">{{ sx.lockHint }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-lock" [attr.aria-checked]="d.widget.locked" (click)="patchWidget({ locked: !d.widget.locked })"></button>
          </div>
          <div class="row">
            <div class="rl">
              <div class="lb" id="l-top">{{ sx.onTopRow }}</div>
              <div class="ht">{{ sx.onTopHint }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-top" [attr.aria-checked]="d.widget.alwaysOnTop" (click)="patchWidget({ alwaysOnTop: !d.widget.alwaysOnTop })"></button>
          </div>
          <div class="row">
            <div class="rl">
              <div class="lb" id="l-auto">{{ sx.autoOpenRow }}</div>
              <div class="ht">{{ sx.autoOpenHint2 }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-auto" [attr.aria-checked]="d.autoOpenWidgetOnGame" (click)="patch({ autoOpenWidgetOnGame: !d.autoOpenWidgetOnGame })"></button>
          </div>
          <div class="row" data-anchor="corner">
            <div class="rl">
              <div class="lb">{{ sx.cornerRow }}</div>
              <div class="ht">{{ sx.cornerHint2(mon()?.index ?? '—') }}</div>
            </div>
            <span class="pair">
              <button type="button" class="btn sm" (click)="t.send({ type: 'placeTopRight', layout: 'compact' })">{{ sx.layoutCompactBtn }}</button>
              <button type="button" class="btn sm" (click)="t.send({ type: 'placeTopRight', layout: 'mid' })">{{ sx.layoutMidBtn }}</button>
            </span>
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .themes {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      // 8 px colava o ✓ / "só escuro" de uma miniatura no nome da seguinte ("só escuro Terminal")
      gap: 8px 16px;
      padding: 16px;
      container-type: inline-size;
    }
    /* Janela estreita: a miniatura encolhe junto com a coluna */
    @container (max-width: 760px) {
      .frame pw-widget-thumb {
        --u: 0.8;
      }
    }
    @container (max-width: 620px) {
      .frame pw-widget-thumb {
        --u: 0.68;
      }
    }
    .thm {
      all: unset;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 0;
      cursor: pointer;
      border-radius: 8px;
      &:focus-visible .frame {
        box-shadow: 0 0 0 2px var(--ac), 0 0 0 5px var(--acs);
      }
    }
    .frame {
      display: block;
      width: fit-content;
      padding: 2px;
      border-radius: 8px;
      box-shadow: 0 0 0 1px var(--hair);
      transition: transform 100ms var(--ease-out);
      &.on {
        box-shadow: 0 0 0 2px var(--ac);
      }
      pw-widget-thumb {
        width: 100%;
        border-radius: 6px;
        overflow: hidden;
      }
    }
    .thm:active .frame {
      transform: scale(0.98);
    }
    .tname {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: var(--tx2);
      &.on {
        font-weight: 700;
        color: var(--tx);
      }
    }
    .tck {
      display: flex;
      margin-left: auto;
      color: var(--ac);
    }
    .donly {
      margin-left: auto;
      font-size: 11.5px;
      font-weight: 500;
    }
    .sws {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .swatch {
      width: 22px;
      height: 22px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      cursor: pointer;
      flex-shrink: 0;
      transition: transform 100ms var(--ease-out);
      &:active {
        transform: scale(0.92);
      }
      &.def {
        background: linear-gradient(135deg, var(--sf2) 50%, var(--bd) 50%);
        border: 1px solid var(--bd);
      }
      &[aria-checked='true'] {
        box-shadow: 0 0 0 2px var(--sf), 0 0 0 4px var(--ac);
      }
      &:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--sf), 0 0 0 4px var(--ac), 0 0 0 7px var(--acs);
      }
    }
    .custom {
      position: relative;
      border-radius: 50%;
      overflow: hidden;
      &.sel {
        box-shadow: 0 0 0 2px var(--sf), 0 0 0 4px var(--ac);
      }
      input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      &:focus-within {
        border-color: var(--ac);
        box-shadow: 0 0 0 3px var(--acs);
      }
    }
    .layouts {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      padding: 16px;
    }
    .lay {
      all: unset;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 14px;
      border-radius: 8px;
      box-shadow: inset 0 0 0 1px var(--hair);
      cursor: pointer;
      transition: transform 100ms var(--ease-out);
      &:active {
        transform: scale(0.98);
      }
      &.on {
        background: var(--acs);
        box-shadow: inset 0 0 0 2px var(--ac);
      }
      &:focus-visible {
        box-shadow: inset 0 0 0 2px var(--ac), 0 0 0 3px var(--acs);
      }
    }
    .shape-box {
      height: 44px;
      display: flex;
      align-items: center;
    }
    .shape {
      display: block;
      border-radius: 3px;
      border: 1.5px solid var(--tx3);
      background: repeating-linear-gradient(90deg, transparent 0 30%, var(--hair) 30% 34%);
    }
    .on .shape {
      border-color: var(--ac);
      background: repeating-linear-gradient(90deg, transparent 0 30%, var(--acb) 30% 34%);
    }
    .s-auto {
      width: 30px;
      height: 30px;
    }
    .s-full {
      width: 72px;
      height: 23px;
    }
    .s-mid {
      width: 26px;
      height: 40px;
    }
    .s-compact {
      width: 34px;
      height: 24px;
    }
    .lname {
      display: block;
      font-weight: 700;
      font-size: 13.5px;
    }
    .ldesc {
      display: block;
      font-size: 12px;
      color: var(--tx2);
    }
    .monbox {
      display: flex;
      gap: 24px;
      padding: 16px;
      align-items: center;
    }
    .mons {
      position: relative;
      flex-shrink: 0;
      .mon {
        position: absolute;
      }
    }
    .idm {
      margin-top: 10px;
    }
    .pair {
      display: flex;
      gap: 8px;
    }
    @media (prefers-reduced-motion: reduce) {
      .frame,
      .lay,
      .swatch {
        transition: none;
      }
      .thm:active .frame,
      .lay:active,
      .swatch:active {
        transform: none;
      }
    }
  `,
})
export class AppearancePage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  protected readonly themes = THEME_ORDER.map((id) => THEMES.find((x) => x.id === id)!);
  protected readonly accents = ACCENTS;
  protected readonly layouts = LAYOUTS;

  protected readonly darkOnly = computed(() => THEMES.find((x) => x.id === this.ctx.draft()?.widgetTheme)?.darkOnly ?? false);
  protected readonly mon = computed(() => selectedMonitor(this.t.catalog(), this.ctx.draft()));

  protected readonly themeAccent = computed(() => {
    const d = this.ctx.draft();
    const th = (d?.widgetTheme as ThemeName) || 'lumen';
    const light = d?.themeMode === 'light' || (d?.themeMode === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
    return THEME_ACCENT[th]?.[light && !this.darkOnly() ? 1 : 0] ?? '#4C8DFF';
  });

  protected readonly layoutNow = computed(() => {
    const s = this.s();
    const d = this.ctx.draft();
    if (!d) return '';
    const l = d.widget.layout ?? 'auto';
    return l === 'auto' ? s.layoutNowAuto(d.widget.width, d.widget.height) : s.layoutNowFixed(layoutName(s, l));
  });

  protected readonly perGame = computed(() => {
    const s = this.s();
    const p = Object.entries(this.ctx.draft()?.games.profiles ?? {}).find(([, v]) => v.layout);
    return p ? s.perGameHint(p[0], layoutName(s, p[1].layout!)) : s.perGameNone;
  });

  /** Monitores em escala, dentro de 300×112 (como no canvas). */
  protected readonly monBox = computed(() => {
    const list = this.t.catalog()?.monitors ?? [];
    if (!list.length) return { list: [], w: 300, h: 40 };
    const x0 = Math.min(...list.map((m) => m.x));
    const y0 = Math.min(...list.map((m) => m.y));
    const w = Math.max(...list.map((m) => m.x + m.width)) - x0;
    const h = Math.max(...list.map((m) => m.y + m.height)) - y0;
    const k = Math.min(300 / w, 112 / h);
    return {
      list: list.map((info) => ({ info, x: (info.x - x0) * k, y: (info.y - y0) * k, w: info.width * k - 6, h: info.height * k - 6 })),
      w: w * k,
      h: h * k,
    };
  });

  protected name(l: WidgetLayout) {
    return layoutName(this.s(), l);
  }

  protected where(m: MonitorInfo) {
    return monitorWhere(m, this.t.catalog()?.monitors ?? []);
  }

  protected isCustom(accent: string | undefined) {
    return !!accent && !ACCENTS.includes(accent);
  }

  protected patch(p: Partial<AppConfig>) {
    this.ctx.update((c) => Object.assign(c, p));
  }

  protected patchWidget(p: Partial<AppConfig['widget']>) {
    this.ctx.update((c) => Object.assign(c.widget, p));
  }

  protected setTheme(id: ThemeName) {
    const darkOnly = THEMES.find((x) => x.id === id)?.darkOnly;
    this.ctx.update((c) => {
      c.widgetTheme = id;
      if (darkOnly) c.themeMode = 'dark';
    });
  }

  protected setLayout(l: WidgetLayout) {
    this.patchWidget({ layout: l });
  }

  protected setMonitor(m: MonitorInfo) {
    this.ctx.update((c) => {
      if (c.widget.monitor === m.device) return;
      c.widget.monitor = m.device;
      c.widget.x = 40;
      c.widget.y = 40;
    });
  }
}
