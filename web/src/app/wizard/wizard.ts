import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n } from '../i18n';
import { AppConfig, MonitorInfo, THEMES, ThemeName, WidgetLayout } from '../models';
import { TelemetryService } from '../telemetry.service';
import { isDarkTheme } from '../widget/metric-views';

type Check = { key: string; label: string; state: 'checking' | 'ok' | 'warn' | 'fail'; text: string };

/**
 * Assistente de primeira execução (4 passos, 880×600): monitor + idioma, tema + variante + layout, verificação do PC
 * e "Tudo pronto". Aparece enquanto a config tem firstRunDone === false (instalação nova); "Começar" e
 * "Pular configuração" gravam firstRunDone = true. Cada escolha é aplicada na hora (o widget já muda).
 */
@Component({
  selector: 'pw-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './wizard.scss',
  template: `
    @let sx = s();
    @let c = t.config();
    <div [class]="rootClass()" role="dialog" aria-modal="true" [attr.aria-label]="'Pitwall · ' + sx.wizStep(step(), 4)">
      <div class="glow" aria-hidden="true"></div>
      <header>
        <span class="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M5 16a7 7 0 0 1 14 0" /><path d="M12 16l3.5-4.5" /></svg>
        </span>
        <span class="brand">Pitwall</span>
        <span class="dots" aria-hidden="true">
          @for (i of [1, 2, 3, 4]; track i) {
            <i [class.on]="i <= step()" [class.cur]="i === step()"></i>
          }
        </span>
        <span class="hint num">{{ sx.wizStep(step(), 4) }}</span>
      </header>

      <main>
        @switch (step()) {
          @case (1) {
            <div class="step">
              <div>
                <h1>{{ sx.wiz1Title }}</h1>
                <p class="hint">{{ sx.wiz1Hint }}</p>
              </div>
              <div class="mons">
                @for (m of monitors(); track m.info.device) {
                  <button class="mon" [class.sel]="m.info.device === selectedMonitor()?.device" [attr.aria-pressed]="m.info.device === selectedMonitor()?.device" [style.width.px]="m.w" [style.height.px]="m.h" (click)="setMonitor(m.info)">
                    <span class="m-n">{{ m.info.index }}</span>
                    <span class="hint">{{ m.info.width }} × {{ m.info.height }}{{ m.info.primary ? ' · ' + sx.primary : '' }}</span>
                  </button>
                } @empty {
                  <span class="hint">{{ sx.connectingPitwall }}</span>
                }
                @if (t.inHost) {
                  <button class="btn push" (click)="t.host({ type: 'identifyMonitors' })">{{ sx.identifyMonitors }}</button>
                }
              </div>
              <div class="row">
                <div>
                  <div class="lbl">{{ sx.language }}</div>
                  <div class="hint">{{ sx.wizLangHint }}</div>
                </div>
                <div class="seg" role="group" [attr.aria-label]="sx.language">
                  <button [class.sel]="(c?.language ?? 'auto') === 'auto'" (click)="apply({ language: 'auto' })">{{ sx.automatic }}</button>
                  <button [class.sel]="c?.language === 'pt-BR'" lang="pt-BR" (click)="apply({ language: 'pt-BR' })">Português</button>
                  <button [class.sel]="c?.language === 'en'" lang="en" (click)="apply({ language: 'en' })">English</button>
                </div>
              </div>
            </div>
          }
          @case (2) {
            <div class="step">
              <div>
                <h1>{{ sx.wiz2Title }}</h1>
                <p class="hint">{{ sx.wiz2Hint }}</p>
              </div>
              <div class="themes">
                @for (th of themes; track th.id) {
                  <button class="th" [class.sel]="theme() === th.id" [attr.aria-pressed]="theme() === th.id" (click)="setTheme(th.id)">
                    <span [class]="'mini m-' + th.id" aria-hidden="true"><span class="blk"></span><span class="n">144</span></span>
                    {{ sx.themeNames[th.id] }}
                  </button>
                }
              </div>
              <div class="row">
                <div class="lbl">{{ sx.variant }}</div>
                <div class="seg" role="group" [attr.aria-label]="sx.variant">
                  <button [class.sel]="!darkSel()" [disabled]="darkOnly()" (click)="apply({ themeMode: 'light' })">{{ sx.wizLight }}</button>
                  <button [class.sel]="darkSel()" (click)="apply({ themeMode: 'dark' })">{{ sx.wizDark }}</button>
                </div>
              </div>
              <div class="row">
                <div>
                  <div class="lbl">{{ sx.layout }}</div>
                  <div class="hint">{{ sx.wizLayoutHint(selectedMonitor()?.index ?? '—') }}</div>
                </div>
                <div class="seg" role="group" [attr.aria-label]="sx.layout">
                  @for (l of layouts; track l.id) {
                    <button [class.sel]="(c?.widget?.layout ?? 'auto') === l.id" (click)="setLayout(l.id)">{{ sx[l.label] }}</button>
                  }
                </div>
              </div>
            </div>
          }
          @case (3) {
            <div class="step tight">
              <div>
                <h1>{{ sx.wiz3Title }}</h1>
                <p class="hint">{{ sx.wiz3Hint }}</p>
              </div>
              @for (ck of checks(); track ck.key) {
                <div [class]="'ck ' + ck.state">
                  <span class="ic" aria-hidden="true">
                    @switch (ck.state) {
                      @case ('ok') {
                        <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      }
                      @case ('checking') {
                        <svg viewBox="0 0 24 24" class="spin"><path d="M12 3a9 9 0 1 1-9 9" /></svg>
                      }
                      @default {
                        <svg viewBox="0 0 24 24"><path d="M12 7v6" /><path d="M12 17v.5" /></svg>
                      }
                    }
                  </span>
                  <span class="ck-t">
                    <span class="lbl">{{ ck.label }}</span>
                    <span class="hint">{{ ck.text }}</span>
                  </span>
                </div>
              }
            </div>
          }
          @case (4) {
            <div class="step">
              <div>
                <h1>{{ sx.wiz4Title }}</h1>
                <p class="hint">{{ sx.wiz4Hint(selectedMonitor()?.index ?? '—') }}</p>
              </div>
              <div class="row boxed">
                <div>
                  <div class="lbl">{{ sx.startWithWindows }}</div>
                  <div class="hint">{{ sx.startWithWindowsHint }}</div>
                </div>
                <button class="switch" role="switch" [attr.aria-checked]="startWin()" [attr.aria-label]="sx.startWithWindows" [class.on]="startWin()" (click)="startWin.set(!startWin())"><i></i></button>
              </div>
              <div class="summary">
                <div class="sum"><span class="hint">{{ sx.sumMonitor }}</span><div class="lbl">{{ selectedMonitor() ? selectedMonitor()!.index + ' · ' + selectedMonitor()!.width + '×' + selectedMonitor()!.height : '—' }}</div></div>
                <div class="sum"><span class="hint">{{ sx.sumTheme }}</span><div class="lbl">{{ sx.themeVariant(sx.themeNames[theme()], darkSel()) }}</div></div>
                <div class="sum"><span class="hint">{{ sx.layout }}</span><div class="lbl">{{ layoutName() }}</div></div>
                <div class="sum">
                  <span class="hint">{{ sx.sumChecks }}</span>
                  <div class="lbl" [class.warn]="checksOk() < checks().length">{{ sx.checksOk(checksOk(), checks().length) }}</div>
                </div>
              </div>
            </div>
          }
        }
      </main>

      <footer>
        @if (step() > 1) {
          <button class="btn" (click)="step.set(step() - 1)">{{ sx.back }}</button>
        }
        <span class="grow"></span>
        @if (step() < 4) {
          <button class="btn quiet" (click)="finish(false)">{{ sx.skipSetup }}</button>
        }
        <button class="btn primary" (click)="step() === 4 ? finish(true) : step.set(step() + 1)">{{ step() === 4 ? sx.getStarted : sx.next }}</button>
      </footer>
    </div>
  `,
})
export class Wizard {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  /** Ordem do design: Lumen primeiro (o padrão). */
  protected readonly themes = (['lumen', 'minimo', 'neon', 'terminal', 'splash'] as ThemeName[]).map((id) => THEMES.find((x) => x.id === id)!);
  protected readonly layouts: { id: WidgetLayout; label: 'automatic' | 'layoutFullBtn' | 'layoutMidBtn' | 'layoutCompactBtn' }[] = [
    { id: 'auto', label: 'automatic' },
    { id: 'full', label: 'layoutFullBtn' },
    { id: 'mid', label: 'layoutMidBtn' },
    { id: 'compact', label: 'layoutCompactBtn' },
  ];

  protected readonly step = signal(1);
  protected readonly startWin = signal(true);

  protected readonly theme = computed<ThemeName>(() => (this.t.config()?.widgetTheme as ThemeName) || 'lumen');
  protected readonly darkOnly = computed(() => THEMES.find((x) => x.id === this.theme())?.darkOnly ?? false);
  protected readonly darkSel = computed(() => isDarkTheme(this.t.config(), this.theme(), matchMedia('(prefers-color-scheme: dark)').matches));
  /** O assistente usa o tema do app (Lumen escuro numa instalação nova). */
  protected readonly rootClass = computed(() => {
    const c = this.t.config();
    const th = (c?.appTheme as ThemeName) || 'lumen';
    const dark = isDarkTheme(c, th, matchMedia('(prefers-color-scheme: dark)').matches);
    return `wz t-${th} ${dark ? 'dark' : 'light'}`;
  });

  protected readonly selectedMonitor = computed<MonitorInfo | null>(() => {
    const list = this.t.catalog()?.monitors ?? [];
    const dev = this.t.config()?.widget.monitor;
    return list.find((m) => m.device === dev) ?? list.find((m) => !m.primary) ?? list[0] ?? null;
  });

  /** Cards proporcionais à resolução (o maior com ~260×150). */
  protected readonly monitors = computed(() => {
    const list = this.t.catalog()?.monitors ?? [];
    const maxW = Math.max(1, ...list.map((m) => m.width));
    const maxH = Math.max(1, ...list.map((m) => m.height));
    const k = Math.min(260 / maxW, 150 / maxH);
    return list.map((info) => ({ info, w: Math.max(120, Math.round(info.width * k)), h: Math.max(80, Math.round(info.height * k)) }));
  });

  protected readonly layoutName = computed(() => {
    const id = this.t.config()?.widget.layout ?? 'auto';
    return this.s()[this.layouts.find((l) => l.id === id)?.label ?? 'automatic'];
  });

  /** Verificação do PC a partir do catálogo (sem catálogo ainda = "Verificando…"). */
  protected readonly checks = computed<Check[]>(() => {
    const s = this.s();
    const cat = this.t.catalog();
    const loading = !cat;
    const cpuTemp = this.t.defs().get('cpu.temp')?.available;
    const nvidia = !!cat?.tuning?.supported || /nvidia/i.test(cat?.hardware.gpu ?? '');
    const mk = (key: string, label: string, ok: boolean | undefined, okText: string, badText: string, bad: 'warn' | 'fail' = 'warn'): Check =>
      loading ? { key, label, state: 'checking', text: s.checking } : { key, label, state: ok ? 'ok' : bad, text: ok ? okText : badText };
    return [
      mk('pawn', s.chkPawn, cpuTemp, s.chkPawnOk, s.chkPawnFail, 'fail'),
      mk('pm', s.chkPm, cat?.presentMon, s.chkPmOk, s.chkPmFail, 'fail'),
      mk('admin', s.chkAdmin, cat?.admin, s.chkAdminOk, s.chkAdminWarn),
      mk('nv', s.chkNv, nvidia, s.chkNvOk(cat?.hardware.gpu?.replace(/NVIDIA\s*/i, '') ?? 'GPU'), s.chkNvWarn),
    ];
  });
  protected readonly checksOk = computed(() => this.checks().filter((c) => c.state === 'ok').length);

  protected apply(patch: Partial<AppConfig>) {
    const c = this.t.config();
    if (c) this.t.saveConfig({ ...structuredClone(c), ...patch });
  }

  protected setMonitor(m: MonitorInfo) {
    const c = this.t.config();
    if (!c || c.widget.monitor === m.device) return;
    this.apply({ widget: { ...c.widget, monitor: m.device, x: 40, y: 40 } });
  }

  protected setTheme(id: ThemeName) {
    const dark = THEMES.find((x) => x.id === id)?.darkOnly;
    this.apply(dark ? { widgetTheme: id, themeMode: 'dark' } : { widgetTheme: id });
  }

  protected setLayout(layout: WidgetLayout) {
    const c = this.t.config();
    if (c) this.apply({ widget: { ...c.widget, layout } });
  }

  /** "Começar" (com as escolhas do passo 4) ou "Pular configuração" (fica tudo no padrão). */
  protected finish(done: boolean) {
    this.apply(done ? { firstRunDone: true, startWithWindows: this.startWin() } : { firstRunDone: true });
  }
}
