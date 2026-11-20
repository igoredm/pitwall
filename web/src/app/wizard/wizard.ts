import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, computed, effect, inject, output, signal, viewChild } from '@angular/core';
import { I18n } from '../i18n';
import { AppConfig, MonitorInfo, THEMES, ThemeName, WidgetLayout } from '../models';
import { layoutName, selectedMonitor } from '../settings/helpers';
import { THEME_ORDER } from '../settings/pages/appearance';
import { SettingsCtx } from '../settings/settings-ctx';
import { TelemetryService } from '../telemetry.service';
import { AppAppearance } from '../ui/appearance';
import { Icon } from '../ui/icon';
import { WidgetThumb } from '../ui/widget-thumb';

type CheckState = 'checking' | 'ok' | 'warn' | 'fail';
interface Check {
  key: string;
  label: string;
  state: CheckState;
  text: string;
}
const LAYOUTS: WidgetLayout[] = ['auto', 'full', 'mid', 'compact'];
type Corner = 'tl' | 'tr' | 'bl' | 'br';
const CORNERS: Corner[] = ['tl', 'tr', 'bl', 'br'];

/**
 * Assistente de primeira execução (diálogo 880×600, 3 passos): monitor + idioma, tema do widget + variante + layout,
 * verificação do PC + iniciar com o Windows. Aparece enquanto firstRunDone === false; "Concluir" e "Pular
 * configuração" gravam firstRunDone = true. Cada escolha vale na hora (o widget já muda). Também roda sozinho em
 * #/wizard, por isso traz o kit do app junto.
 */
@Component({
  selector: 'pw-wizard',
  imports: [Icon, WidgetThumb],
  styleUrls: ['../ui/kit.scss', './wizard.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let c = cfg();
    <div class="pw-app wz" [class]="appearance.cls()" role="dialog" aria-modal="true" [attr.aria-label]="sx.wizAria(step(), 3)" tabindex="-1" #root>
      <header class="wz-head">
        <img src="pitwall-logo.png" alt="" width="26" height="26" />
        <span class="wz-title">{{ sx.wizSetup }}</span>
        <span class="wz-steps" aria-hidden="true">
          @for (i of [1, 2, 3]; track i) {
            <i [class.on]="i <= step()"></i>
          }
          <em>{{ sx.wizStep(step(), 3) }}</em>
        </span>
      </header>

      <div class="wz-body">
        @switch (step()) {
          @case (1) {
            @if (oneMon(); as m) {
              <!-- 1.2: um monitor só — celular/TV ou compacto num canto (com 2 monitores volta ao passo normal) -->
              <div>
                <h1 aria-live="polite">{{ sx.wiz1Title }}</h1>
                <p class="pd">{{ sx.wizOneMonHint(m.width, m.height) }}</p>
              </div>
              <div class="grp wz-how" role="radiogroup" [attr.aria-label]="sx.wizHowAria">
                <div class="row wz-opt" role="radio" tabindex="0" [class.on]="how() === 'phone'" [attr.aria-checked]="how() === 'phone'" (click)="how.set('phone')" (keydown.enter)="how.set('phone')" (keydown.space)="$event.preventDefault(); how.set('phone')">
                  <span class="wz-radio" aria-hidden="true"></span>
                  <span class="wz-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="13" height="10" rx="1.5" /><path d="M6.5 19h5" /><rect x="17" y="9" width="5" height="10" rx="1.2" /></svg></span>
                  <div class="rl">
                    <div class="lb">{{ sx.wizPhoneTitle }}</div>
                    <div class="ht">{{ sx.wizPhoneHint }}</div>
                  </div>
                </div>
                <div class="row bt wz-opt" role="radio" tabindex="0" [class.on]="how() === 'corner'" [attr.aria-checked]="how() === 'corner'" (click)="how.set('corner')" (keydown.enter)="how.set('corner')" (keydown.space)="$event.preventDefault(); how.set('corner')">
                  <span class="wz-radio" aria-hidden="true"></span>
                  <span class="wz-ico" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2" /><rect x="13.5" y="13" width="5" height="4" rx="1" fill="currentColor" stroke="none" /></svg></span>
                  <div class="rl">
                    <div class="lb">{{ sx.wizCornerTitle }}</div>
                    <div class="ht">{{ sx.wizCornerHint(toggleKeys()) }}</div>
                    @if (how() === 'corner') {
                      <div class="wz-corner">
                        <span class="cap">{{ sx.wizCorner }}</span>
                        <span class="seg" role="group" [attr.aria-label]="sx.wizCornerAria">
                          @for (k of corners; track k) {
                            <button type="button" [attr.aria-pressed]="corner() === k" (click)="$event.stopPropagation(); corner.set(k)">{{ sx.wizCorners[k] }}</button>
                          }
                        </span>
                      </div>
                    }
                  </div>
                </div>
              </div>
            } @else {
            <div>
              <h1 aria-live="polite">{{ sx.wiz1Title }}</h1>
              <p class="pd">{{ sx.wiz1Hint2 }}</p>
            </div>
            <div class="wz-mons" role="radiogroup" [attr.aria-label]="sx.monitor">
              @for (m of monitors(); track m.info.device) {
                <button
                  type="button"
                  class="mon"
                  role="radio"
                  [attr.aria-checked]="m.info.device === mon()?.device"
                  [attr.aria-pressed]="m.info.device === mon()?.device"
                  [style.width.px]="m.w"
                  [style.height.px]="m.h"
                  (click)="setMonitor(m.info)"
                >
                  <span class="wz-mn">{{ m.info.index }}</span>
                  <span class="mon-sub">{{ m.info.width }} × {{ m.info.height }}{{ m.info.primary ? ' · ' + sx.primary : '' }}</span>
                </button>
              } @empty {
                <span class="skel" style="width: 340px; height: 192px"></span>
              }
              @if (t.inHost) {
                <button type="button" class="btn sm wz-id" (click)="t.host({ type: 'identifyMonitors' })">{{ sx.identifyMonitors }}</button>
              }
            </div>
            }
            <div class="grp">
              <div class="row">
                <div class="rl">
                  <div class="lb">{{ sx.language }}</div>
                  <div class="ht">{{ sx.wizLangHint }} <span [attr.lang]="sx.locale === 'en-US' ? 'pt-BR' : 'en'">{{ sx.locale === 'en-US' ? 'Idioma' : 'Language' }}</span></div>
                </div>
                <span class="seg" role="group" [attr.aria-label]="sx.language">
                  <button type="button" [attr.aria-pressed]="(c?.language ?? 'auto') === 'auto'" (click)="apply({ language: 'auto' })">{{ sx.automatic }}</button>
                  <button type="button" lang="pt-BR" [attr.aria-pressed]="c?.language === 'pt-BR'" (click)="apply({ language: 'pt-BR' })">Português</button>
                  <button type="button" lang="en" [attr.aria-pressed]="c?.language === 'en'" (click)="apply({ language: 'en' })">English</button>
                </span>
              </div>
            </div>
          }
          @case (2) {
            <div>
              <h1 aria-live="polite">{{ sx.wiz2Title2 }}</h1>
              <p class="pd">{{ sx.wiz2Hint2(mon()?.index ?? '—') }}</p>
            </div>
            <div class="wz-themes" role="radiogroup" [attr.aria-label]="sx.widgetTheme">
              @for (th of themes; track th.id) {
                @let on = theme() === th.id;
                <button type="button" class="wz-th" role="radio" [attr.aria-checked]="on" (click)="setTheme(th.id)">
                  <span class="wz-frame" [class.on]="on"><pw-widget-thumb [theme]="th.id" /></span>
                  <span class="wz-tn" [class.on]="on">
                    {{ sx.themeNames[th.id] }}
                    @if (on) {
                      <span class="wz-ck"><pw-icon name="check" [size]="15" [stroke]="2" /></span>
                    }
                  </span>
                </button>
              }
            </div>
            <div class="grp">
              <div class="row">
                <div class="rl">
                  <div class="lb">{{ sx.variant }}</div>
                  <div class="ht">{{ sx.darkOnlyHint }}</div>
                </div>
                <span class="seg" role="group" [attr.aria-label]="sx.variant">
                  <button type="button" [attr.aria-pressed]="c?.themeMode === 'light' && !darkOnly()" [disabled]="darkOnly()" (click)="apply({ themeMode: 'light' })">{{ sx.light }}</button>
                  <button type="button" [attr.aria-pressed]="c?.themeMode === 'dark' || darkOnly()" (click)="apply({ themeMode: 'dark' })">{{ sx.dark }}</button>
                  <button type="button" [attr.aria-pressed]="c?.themeMode === 'system' && !darkOnly()" [disabled]="darkOnly()" (click)="apply({ themeMode: 'system' })">{{ sx.system }}</button>
                </span>
              </div>
              <div class="row">
                <div class="rl">
                  <div class="lb">{{ sx.layout }}</div>
                  <div class="ht">{{ sx.wizLayoutHint2 }}</div>
                </div>
                <span class="seg" role="group" [attr.aria-label]="sx.layout">
                  @for (l of layouts; track l) {
                    <button type="button" [attr.aria-pressed]="(c?.widget?.layout ?? 'auto') === l" (click)="setLayout(l)">{{ name(l) }}</button>
                  }
                </span>
              </div>
            </div>
          }
          @case (3) {
            <div>
              <h1 aria-live="polite">{{ sx.wiz3Title }}</h1>
              <p class="pd">{{ sx.wiz3Hint }}</p>
            </div>
            <div class="grp">
              @for (ck of checks(); track ck.key) {
                <div class="row">
                  <span class="pill wz-pill" [class]="'pill wz-pill ' + tone(ck.state)">{{ sx.chkPill[ck.state] }}</span>
                  <div class="rl">
                    <div class="lb">{{ ck.label }}</div>
                    <div class="ht">{{ ck.text }}</div>
                  </div>
                </div>
              }
            </div>
            <div class="grp">
              <div class="row">
                <div class="rl">
                  <div class="lb" id="wz-sw">{{ sx.startWithWindows }}</div>
                  <div class="ht">{{ sx.startWinWizHint }}</div>
                </div>
                <button type="button" class="sw" role="switch" aria-labelledby="wz-sw" [attr.aria-checked]="startWin()" (click)="startWin.set(!startWin())"></button>
              </div>
            </div>
          }
        }
      </div>

      <footer class="wz-foot">
        <button type="button" class="btn qt sm" (click)="finish(false)">{{ sx.skipSetup }}</button>
        @if (step() === 1 && oneMon()) {
          <span class="cap wz-more">{{ sx.wizMoreMonitors }}</span>
        }
        <span class="grow"></span>
        @if (step() > 1) {
          <button type="button" class="btn sm" (click)="go(step() - 1)">{{ sx.back }}</button>
        }
        <button type="button" class="btn pri sm" (click)="step() === 3 ? finish(true) : go(step() + 1)">{{ step() === 3 ? sx.finish : sx.next }}</button>
      </footer>
    </div>
  `,
})
export class Wizard {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly appearance = inject(AppAppearance);
  /** Dentro das configurações, as escolhas passam pela cópia editável (mesmo debounce e "Salvo"). */
  private readonly ctx = inject(SettingsCtx, { optional: true });
  private readonly root = viewChild<ElementRef<HTMLElement>>('root');
  readonly done = output<boolean>();

  protected readonly themes = THEME_ORDER.map((id) => THEMES.find((x) => x.id === id)!);
  protected readonly layouts = LAYOUTS;
  protected readonly step = signal(1);
  protected readonly startWin = signal(true);
  protected readonly cfg = computed(() => this.ctx?.draft() ?? this.t.config());

  protected readonly theme = computed<ThemeName>(() => (this.cfg()?.widgetTheme as ThemeName) || 'lumen');
  protected readonly darkOnly = computed(() => THEMES.find((x) => x.id === this.theme())?.darkOnly ?? false);
  protected readonly mon = computed(() => selectedMonitor(this.t.catalog(), this.cfg()));

  /** 1.2: um monitor só (ao vivo: ligou outro, volta ao passo normal). */
  protected readonly oneMon = computed(() => {
    const list = this.t.catalog()?.monitors ?? [];
    return list.length === 1 ? list[0] : null;
  });
  protected readonly how = signal<'phone' | 'corner'>('corner');
  protected readonly corners = CORNERS;
  protected readonly corner = signal<Corner>('tr');
  /** "Ctrl Alt P" (atalho de mostrar/esconder), ou vazio se desligado. */
  protected readonly toggleKeys = computed(() => {
    const h = this.cfg()?.hotkeys;
    return h && h.enabled !== false && h.toggleWidget ? h.toggleWidget.split('+').join(' ') : '';
  });

  /** Monitores proporcionais à resolução (o maior com ~340×192, como no canvas). */
  protected readonly monitors = computed(() => {
    const list = this.t.catalog()?.monitors ?? [];
    const maxW = Math.max(1, ...list.map((m) => m.width));
    const maxH = Math.max(1, ...list.map((m) => m.height));
    const k = Math.min(340 / maxW, 192 / maxH);
    return list.map((info) => ({ info, w: Math.max(140, Math.round(info.width * k)), h: Math.max(90, Math.round(info.height * k)) }));
  });

  /** Verificação do PC a partir do catálogo (sem catálogo ainda = "…"). */
  protected readonly checks = computed<Check[]>(() => {
    const s = this.s();
    const cat = this.t.catalog();
    const loading = !cat;
    const cpuTemp = this.t.defs().get('cpu.temp')?.available;
    const nvidia = !!cat?.tuning?.supported || /nvidia/i.test(cat?.hardware.gpu ?? '');
    const mk = (key: string, label: string, ok: boolean | undefined, okText: string, badText: string, bad: CheckState = 'warn'): Check =>
      loading ? { key, label, state: 'checking', text: s.checking } : { key, label, state: ok ? 'ok' : bad, text: ok ? okText : badText };
    return [
      mk('nv', s.chkNv, nvidia, s.chkNvOk2(cat?.hardware.gpu?.replace(/NVIDIA\s*(GeForce\s*)?/i, '') ?? 'GPU'), s.chkNvWarn),
      mk('pm', s.chkPm, cat?.presentMon, s.chkPmOk2, s.chkPmFail, 'fail'),
      mk('pawn', s.chkPawn2, cpuTemp, s.chkPawnOk2, s.chkPawnFail, 'fail'),
      mk('admin', s.chkAdmin, cat?.admin, s.chkAdminOk, s.chkAdminWarn2),
    ];
  });

  constructor() {
    // O foco vai para o diálogo (leitor de tela anuncia o passo)
    effect(() => {
      this.step();
      requestAnimationFrame(() => this.root()?.nativeElement.focus({ preventScroll: true }));
    });
  }

  protected name(l: WidgetLayout) {
    return layoutName(this.s(), l);
  }

  protected tone(st: CheckState) {
    return st === 'ok' ? 'p-g' : st === 'warn' ? 'p-y' : st === 'fail' ? 'p-r' : 'p-n';
  }

  protected go(i: number) {
    // Um monitor + "Deixar no canto": o widget vai já para o canto escolhido, no compacto
    if (this.step() === 1 && i === 2 && this.oneMon() && this.how() === 'corner')
      this.t.send({ type: 'placeTopRight', layout: 'compact', corner: this.corner() });
    this.step.set(i);
  }

  protected apply(patch: Partial<AppConfig>) {
    if (this.ctx) {
      this.ctx.update((c) => Object.assign(c, patch));
      return;
    }
    const c = this.t.config();
    if (c) this.t.saveConfig({ ...structuredClone(c), ...patch });
  }

  protected setMonitor(m: MonitorInfo) {
    const c = this.cfg();
    if (!c || c.widget.monitor === m.device) return;
    this.apply({ widget: { ...c.widget, monitor: m.device, x: 40, y: 40 } });
  }

  protected setTheme(id: ThemeName) {
    const dark = THEMES.find((x) => x.id === id)?.darkOnly;
    this.apply(dark ? { widgetTheme: id, themeMode: 'dark' } : { widgetTheme: id });
  }

  protected setLayout(layout: WidgetLayout) {
    const c = this.cfg();
    if (c) this.apply({ widget: { ...c.widget, layout } });
  }

  /** "Concluir" (com o iniciar com o Windows do passo 3) ou "Pular configuração" (fica tudo no padrão). */
  protected finish(done: boolean) {
    this.apply(done ? { firstRunDone: true, startWithWindows: this.startWin() } : { firstRunDone: true });
    this.done.emit(done);
    // Um monitor + "Ver no celular ou na TV": ao concluir, abre Celular e TV para parear
    if (done && this.oneMon() && this.how() === 'phone') {
      if (this.ctx) this.ctx.go('devices');
      else location.hash = '#/settings/devices';
    }
  }
}
