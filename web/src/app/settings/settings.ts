import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  computed,
  effect,
  forwardRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { I18n } from '../i18n';
import { AppConfig, HostMessage, SettingsPage } from '../models';
import { TelemetryService, hashParams } from '../telemetry.service';
import { AppAppearance } from '../ui/appearance';
import { Icon } from '../ui/icon';
import { Widget } from '../widget/widget';
import { Wizard } from '../wizard/wizard';
import { fmtDuration, fmtMs } from './format';
import { selectedMonitor } from './helpers';
import { resolvePage, NAV, PAGES, SettingsNav } from './nav';
import { AlertsPage } from './pages/alerts';
import { AppPage } from './pages/app-page';
import { AppearancePage } from './pages/appearance';
import { DevicesPage } from './pages/devices';
import { FeaturesPage } from './pages/features';
import { GamesPage } from './pages/games';
import { GpuPage } from './pages/gpu';
import { MetricsPage } from './pages/metrics';
import { OverviewPage } from './pages/overview';
import { SessionsPage } from './pages/sessions';
import { Search } from './search';
import { ConfirmOptions, SaveState, SettingsCtx, ToastOptions } from './settings-ctx';
import { Tour, TourService } from './tour';
import { UpdateNotice } from './update-notice';

/** Ícone de cada página na navegação. */
const ICON: Record<SettingsPage, string> = {
  overview: 'overview',
  widget: 'widget',
  metrics: 'metrics',
  alerts: 'alerts',
  games: 'games',
  sessions: 'sessions',
  gpu: 'gpu',
  devices: 'devices',
  features: 'features',
  app: 'app',
};
/** "Agora não" no convite do tour: não pergunta de novo nesta máquina (o card da Visão geral continua). */
const INVITED_KEY = 'pitwall.tourInvited';

/**
 * Janela de configurações 1.0: barra lateral (logo, busca Ctrl K, 3 grupos, rodapé com atualização e status do
 * widget), uma página por vez com deep link #/settings/<pagina>/<ancora>, o "Salvo", diálogos, aviso no rodapé,
 * assistente de primeira execução, convite e tour. Um visual só (claro/escuro por config.appearance).
 */
@Component({
  selector: 'pw-settings',
  imports: [
    Icon,
    Search,
    Tour,
    Widget,
    Wizard,
    OverviewPage,
    AppearancePage,
    MetricsPage,
    AlertsPage,
    GamesPage,
    SessionsPage,
    GpuPage,
    DevicesPage,
    FeaturesPage,
    AppPage,
  ],
  templateUrl: './settings.html',
  styleUrls: ['../ui/kit.scss', './settings.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: SettingsCtx, useExisting: forwardRef(() => Settings) }, SettingsNav, TourService],
  host: { class: 'pw-settings-host' },
})
export class Settings implements SettingsCtx {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly appearance = inject(AppAppearance);
  protected readonly nav = inject(SettingsNav);
  protected readonly tour = inject(TourService);
  protected readonly notice = inject(UpdateNotice);
  protected readonly navGroups = NAV;
  protected readonly icons = ICON;
  private readonly main = viewChild<ElementRef<HTMLElement>>('main');
  private readonly search = viewChild(Search);
  private readonly confirmBtn = viewChild<ElementRef<HTMLButtonElement>>('confirmCancel');

  /** Cópia local editável; salva com debounce. Sincroniza com o servidor quando não há edição pendente. */
  readonly draft = signal<AppConfig | null>(null);
  private readonly pendingSave = signal(false);
  private saveTimer?: ReturnType<typeof setTimeout>;
  readonly saveState = computed<SaveState>(() => (!this.t.connected() ? 'offline' : this.pendingSave() ? 'saving' : 'saved'));

  protected readonly preview = signal(false);
  protected readonly invite = signal(false);
  protected readonly dialog = signal<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  protected readonly toastMsg = signal<ToastOptions | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;
  private toastLeft = 0;
  private toastStart = 0;

  /** Assistente: config que nunca concluiu (firstRunDone === false). */
  protected readonly showWizard = computed(() => (this.draft() ?? this.t.config())?.firstRunDone === false);
  protected readonly wide = computed(() => this.nav.page() === 'metrics');
  protected readonly previewMon = computed(() => selectedMonitor(this.t.catalog(), this.draft()));

  protected readonly side = computed(() => {
    const s = this.s();
    const d = this.draft();
    const m = selectedMonitor(this.t.catalog(), d);
    const g = this.t.game();
    const live = this.t.sessions()[0];
    const fps = this.t.values()['fps.current'];
    // Sem conexão (depois de já ter carregado, como o aviso do topo): o rodapé não pode continuar dizendo
    // "ao vivo" com o último jogo e FPS. Antes da primeira conexão fica o estado normal de carregamento.
    if (!this.t.connected() && d) return { visible: false, offline: true, title: s.sideOffline, line: s.sideOfflineLine };
    let line: string;
    if (g) {
      const dur = live && !live.end && live.exe === g.exe ? fmtDuration((Date.now() - new Date(live.start).getTime()) / 1000) : '';
      line = [g.exe, dur, fps != null ? `${Math.round(fps)} FPS` : ''].filter(Boolean).join(' · ');
    } else line = s.sideIdle(fmtMs(d?.refreshMs ?? 1000, s));
    return { visible: !!d?.widget.visible, offline: false, title: d?.widget.visible ? s.sideWidgetOn(m?.index ?? '—') : s.sideWidgetHidden, line };
  });

  constructor() {
    effect(() => {
      const c = this.t.config();
      if (c && !untracked(() => this.pendingSave())) this.draft.set(structuredClone(c));
    });

    // Rolar até a âncora (ou ao topo, ao trocar de página), sem animação: navegação nunca anima
    let lastPage: SettingsPage | null = null;
    effect(() => {
      this.nav.seq();
      const page = this.nav.page();
      const anchor = this.nav.anchor();
      const changed = page !== lastPage;
      lastPage = page;
      untracked(() => this.scrollTo(anchor, changed, this.nav.flash));
    });

    // Gatilhos do tour: #/settings?tutorial=1 (janela nova pela bandeja) e o convite depois do assistente
    let urlTour = hashParams().get('tutorial') === '1';
    effect(() => {
      const c = this.t.config();
      if (!c || this.showWizard()) return;
      untracked(() => {
        if (urlTour) {
          urlTour = false;
          history.replaceState(null, '', location.href.replace(/[?&]tutorial=1/, ''));
          this.startTour();
        } else if (c.tutorialDone === false && !c.tour?.done && !c.tour?.dismissed && !(c.tour?.step ?? 0) && !this.tour.running() && !invited()) {
          this.invite.set(true);
          markInvited();
        }
      });
    });

    // Convite aberto: o foco vai para "Começar tour"
    effect(() => {
      if (this.invite()) requestAnimationFrame(() => document.querySelector<HTMLElement>('.st-invite .btn.pri')?.focus());
    });

    const off = this.t.onHost((msg: HostMessage) => {
      if (msg?.type === 'folderPicked') this.update((c) => (c.log.folder = msg.path));
      else if (msg?.type === 'navigate' && resolvePage(msg.page)) this.go(resolvePage(msg.page)!, msg.anchor);
      else if (msg?.type === 'startTutorial') this.startTour();
    });
    const keys = (e: KeyboardEvent) => this.keys(e);
    document.addEventListener('keydown', keys);
    inject(DestroyRef).onDestroy(() => {
      off();
      document.removeEventListener('keydown', keys);
      clearTimeout(this.toastTimer);
    });
  }

  // ------------------------------------------------------------------ SettingsCtx

  update(mutate: (c: AppConfig) => void) {
    const d = this.draft();
    if (!d) return;
    const next = structuredClone(d);
    mutate(next);
    // tutorialDone é apelido de tour.done
    if (next.tour) next.tutorialDone = next.tour.done;
    this.draft.set(next);
    this.pendingSave.set(true);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      const cur = this.draft();
      if (cur) this.t.saveConfig(cur);
      this.pendingSave.set(false);
    }, 300);
  }

  go(page: SettingsPage, anchor?: string, flash = false) {
    this.nav.go(page, anchor, flash);
  }

  private previewReturn: HTMLElement | null = null;

  openPreview() {
    // Diálogo modal: o foco entra no × e volta para o botão "Pré-visualizar" ao fechar
    this.previewReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.preview.set(true);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.pw-prev-x')?.focus());
  }

  protected closePreview() {
    this.preview.set(false);
    if (this.previewReturn?.isConnected) this.previewReturn.focus();
    this.previewReturn = null;
  }

  toast(opts: ToastOptions) {
    clearTimeout(this.toastTimer);
    this.toastMsg.set(opts);
    this.toastLeft = opts.duration ?? 6000;
    this.resumeToast();
  }

  /** Quem abriu o diálogo: o foco volta para ele ao fechar (sem isso, ia para o body). */
  private dialogReturn: HTMLElement | null = null;

  confirm(opts: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
      this.dialogReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.dialog.set({ ...opts, resolve });
      // Ação destrutiva: o foco começa em Cancelar
      requestAnimationFrame(() => this.confirmBtn()?.nativeElement.focus());
    });
  }

  restoreDefaults() {
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.pendingSave.set(false);
    this.t.send({ type: 'restoreDefaults' });
  }

  startTour(resume = false) {
    this.invite.set(false);
    markInvited();
    this.tour.start(resume);
  }

  // ------------------------------------------------------------------ moldura

  protected navTo(e: MouseEvent, page: SettingsPage) {
    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    this.go(page);
  }

  protected onSearch(r: { page: SettingsPage; anchor?: string }) {
    this.go(r.page, r.anchor, true);
  }

  protected closeDialog(ok: boolean) {
    const d = this.dialog();
    this.dialog.set(null);
    d?.resolve(ok);
    if (this.dialogReturn?.isConnected) this.dialogReturn.focus();
    this.dialogReturn = null;
  }

  /** Tab fica dentro do diálogo aberto. */
  protected trapTab(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const box = e.currentTarget as HTMLElement;
    const items = [...box.querySelectorAll<HTMLElement>('button, [href], input, select')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }

  protected inviteLater() {
    this.invite.set(false);
  }

  protected wizardDone(finished: boolean) {
    const c = this.t.config();
    // Convite só ao concluir; "Pular configuração" não pergunta (o card da Visão geral continua)
    if (finished && c?.tutorialDone !== true && !c?.tour?.done) this.invite.set(true);
    markInvited();
  }

  protected pauseToast() {
    clearTimeout(this.toastTimer);
    this.toastLeft -= Date.now() - this.toastStart;
  }

  protected resumeToast() {
    this.toastStart = Date.now();
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMsg.set(null), Math.max(1200, this.toastLeft));
  }

  protected toastAction() {
    const a = this.toastMsg()?.action;
    this.toastMsg.set(null);
    clearTimeout(this.toastTimer);
    a?.run();
  }

  private keys(e: KeyboardEvent) {
    if (this.tour.running()) return;
    if (e.key === 'Escape') {
      if (this.dialog()) this.closeDialog(false);
      else if (this.preview()) this.closePreview();
      else if (this.invite()) this.inviteLater();
      else return;
      e.preventDefault();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && !this.dialog() && !this.showWizard()) {
      e.preventDefault();
      this.search()?.focus();
    }
  }

  /** Espera a página renderizar (até ~20 quadros) e rola até a âncora; sem âncora numa página nova, volta ao topo. */
  private scrollTo(anchor: string | null, pageChanged: boolean, flash: boolean, tries = 0) {
    requestAnimationFrame(() => {
      const main = this.main()?.nativeElement;
      if (!main) {
        if (tries < 40) this.scrollTo(anchor, pageChanged, flash, tries + 1);
        return;
      }
      const el = anchor ? main.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(anchor)}"]`) : null;
      if (!el) {
        if (anchor && tries < 40) return this.scrollTo(anchor, pageChanged, flash, tries + 1);
        if (pageChanged) main.scrollTop = 0;
        return;
      }
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
      this.holdAnchor(main, el);
      if (flash) {
        el.classList.remove('pw-flash');
        void el.offsetWidth;
        el.classList.add('pw-flash');
        setTimeout(() => el.classList.remove('pw-flash'), 1600);
      }
    });
  }

  /**
   * Conteúdo que chega depois (histórico, uso da pasta) empurra a âncora para baixo: segura a linha no lugar por
   * ~1 s, a não ser que a pessoa role antes.
   */
  private holdAnchor(main: HTMLElement, el: HTMLElement) {
    let cancelled = false;
    const cancel = () => (cancelled = true);
    const opts = { once: true, passive: true } as const;
    main.addEventListener('wheel', cancel, opts);
    main.addEventListener('touchmove', cancel, opts);
    main.addEventListener('keydown', cancel, opts);
    main.addEventListener('pointerdown', cancel, opts);
    for (const ms of [150, 400, 900])
      setTimeout(() => {
        if (!cancelled && el.isConnected) el.scrollIntoView({ block: 'start', behavior: 'instant' });
      }, ms);
  }
}

function invited(): boolean {
  try {
    return localStorage.getItem(INVITED_KEY) === '1';
  } catch {
    return false;
  }
}

function markInvited() {
  try {
    localStorage.setItem(INVITED_KEY, '1');
  } catch {
    // sem armazenamento: o convite pode voltar na próxima vez
  }
}
