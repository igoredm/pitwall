import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { I18n } from '../i18n';
import { SettingsPage } from '../models';
import { TelemetryService } from '../telemetry.service';
import { Icon } from '../ui/icon';
import { selectedMonitor } from './helpers';
import { NAV, SettingsNav } from './nav';
import { SettingsCtx } from './settings-ctx';
import { UpdateNotice } from './update-notice';

/**
 * Os 9 passos (1.2): página, âncora e alvos. Vale o primeiro alvo que existir e caiba na tela (até 60% da altura);
 * se nenhum couber, o primeiro que existir. O cabeçalho da página (.ph) é o último recurso: sempre existe, mesmo
 * numa instalação nova (sem quedas, sem partidas).
 */
export const TOUR_STEPS: { page: SettingsPage | null; anchor?: string; targets: string[] }[] = [
  { page: 'overview', targets: ['[data-tour="widget-thumb"]'] },
  { page: 'monitor', targets: ['[data-tour="monitor-strip"]', '.ph'] },
  { page: 'health', targets: ['[data-tour="pc-latest"]', '[data-tour="pc-now"]', '.ph'] },
  { page: 'widget', anchor: 'layout', targets: ['[data-tour="layout"]'] },
  { page: 'metrics', anchor: 'gpu', targets: ['[data-tour="metrics-table"]'] },
  { page: 'sessions', targets: ['[data-tour="game-last"]', '.ph'] },
  { page: 'gpu', anchor: 'tuning', targets: ['[data-tour="gpu-switch"]', '.na'] },
  { page: 'app', anchor: 'hotkeys', targets: ['[data-tour="hotkeys"]'] },
  { page: null, targets: [] },
];
const N = TOUR_STEPS.length;

/**
 * Estado do tour: passo na tela (0 = fechado) e o progresso salvo em config.tour (tutorialDone é apelido de
 * tour.done). Fechar no meio guarda o passo e mostra o aviso "Tour fechado… [Retomar]".
 */
@Injectable()
export class TourService {
  /** A moldura (SettingsCtx) cria este serviço no construtor dela: pega o ctx só na hora de usar. */
  private readonly injector = inject(Injector);
  private get ctx() {
    return this.injector.get(SettingsCtx);
  }
  private readonly s = inject(I18n).s;
  /** Passo na tela (1–N); 0 = tour fechado. */
  readonly step = signal(0);
  readonly running = computed(() => this.step() > 0);

  /** Idempotente: com o tour na tela, um gatilho novo (bandeja, URL) não reinicia. */
  /** Quem tinha o foco antes do tour (ex.: "Começar tour"): volta para ele ao fechar ou concluir. */
  private returnFocus: HTMLElement | null = null;

  /** `at`: o passo exato (o Retomar do aviso volta para onde fechou, mesmo revendo um tour já concluído). */
  start(resume = false, at?: number) {
    if (this.running()) return;
    this.returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const saved = this.ctx.draft()?.tour;
    const from = at ? Math.min(at, N) : resume && saved && !saved.done && saved.step > 0 ? Math.min(saved.step, N) : 1;
    this.go(from);
  }

  next() {
    if (this.step() >= N) this.finish();
    else this.go(this.step() + 1);
  }

  back() {
    if (this.step() > 1) this.go(this.step() - 1);
  }

  /** × ou Esc: fecha direto, sem confirmação, e oferece retomar por 6 s. */
  close() {
    const at = this.step();
    if (!at) return;
    this.step.set(0);
    this.restoreFocus();
    const s = this.s();
    this.ctx.toast({ title: s.tourClosed(at, N), body: s.tourClosedHint, action: { label: s.resume, run: () => this.start(true, at) } });
  }

  finish() {
    this.step.set(0);
    this.restoreFocus();
    this.ctx.update((c) => {
      c.tour = { step: N, done: true, dismissed: c.tour?.dismissed ?? false };
      c.tutorialDone = true;
    });
  }

  private restoreFocus() {
    const el = this.returnFocus;
    this.returnFocus = null;
    // O botão pode ter saído da tela (o tour troca de página): aí o foco vai para o conteúdo
    if (el?.isConnected) el.focus();
    else document.querySelector<HTMLElement>('.st-main')?.focus({ preventScroll: true });
  }

  private go(i: number) {
    this.step.set(i);
    this.ctx.update((c) => {
      const t = c.tour ?? { step: 0, done: false, dismissed: false };
      // Último passo visto (Retomar volta para ele). Rever depois de concluir não desfaz o "concluído"
      c.tour = { ...t, step: t.done ? t.step : i };
    });
  }
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Coach marks sobre a UI real: anel accent de 2 px no item da navegação (onde fica) e no alvo (o quê), o resto
 * escurecido com --dim (SVG com os dois recortes, sem blur) e o balão de 348 px com "Grupo › Página". Os anéis não voam entre alvos: somem em 100 ms, a página troca e rola na hora, e anéis + balão voltam
 * em 160 ms (balão com translateY 4 px → 0).
 */
@Component({
  selector: 'pw-tour',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @if (tour.running()) {
      <div class="layer" [class.vis]="visible()" (pointerdown)="$event.preventDefault()">
        <!-- Fundo escurecido com dois recortes: o item da navegação (onde fica) e o alvo na página (o quê) -->
        <svg class="dim" aria-hidden="true">
          <path class="fill" fill-rule="evenodd" [attr.d]="dimPath()" />
        </svg>
        @for (h of holes(); track $index) {
          <div class="ring" [style.left.px]="h.x" [style.top.px]="h.y" [style.width.px]="h.w" [style.height.px]="h.h" [style.border-radius.px]="h.r"></div>
        }
        <div
          #coach
          class="coach"
          role="dialog"
          aria-modal="true"
          [attr.aria-label]="sx.tourAria(shown(), total)"
          aria-describedby="tour-body"
          tabindex="-1"
          [class.wide]="!box()"
          [style.left.px]="pos().x"
          [style.top.px]="pos().y"
          (pointerdown)="$event.stopPropagation()"
          (keydown)="trap($event)"
        >
          @if (box() && pos().arrow; as a) {
            <span class="arrow" [class]="'arrow ' + a.side" [style.left.px]="a.at"></span>
          }
          <h3 aria-live="polite"><span class="crumb">{{ crumb() }}</span>{{ title() }}</h3>
          <p id="tour-body">{{ body() }}</p>
          @if (shown() === total) {
            <div class="tray-wrap">
              <div class="tray" role="img" [attr.aria-label]="sx.trayAria">
                <div class="ti"><span class="tic"><pw-icon name="check" [size]="13" [stroke]="2" /></span>{{ sx.tray[0] }}</div>
                <div class="ti"><span class="tic"><pw-icon name="check" [size]="13" [stroke]="2" /></span>{{ sx.tray[1] }}</div>
                <div class="ti"><span class="tic"></span>{{ sx.tray[2] }}</div>
                <div class="tsep"></div>
                <div class="ti"><span class="tic"></span>{{ sx.tray[3] }}</div>
                <div class="ti hl"><span class="tic"></span>{{ sx.tray[4] }}</div>
                <div class="tsep"></div>
                @if (update(); as v) {
                  <div class="ti"><span class="tic"></span>{{ sx.trayUpdate(v) }}</div>
                }
                <div class="ti"><span class="tic"></span>{{ sx.tray[5] }}</div>
              </div>
            </div>
          }
          <div class="cfoot">
            <span class="steps" aria-hidden="true">
              @for (i of dots; track i) {
                <i [class.on]="i <= shown()"></i>
              }
              <em>{{ sx.tourOf(shown(), total) }}</em>
            </span>
            @if (shown() > 1) {
              <button type="button" class="btn qt sm" (click)="tour.back()">{{ sx.back }}</button>
            }
            <button type="button" class="btn pri sm" (click)="tour.next()">{{ shown() === total ? sx.tourFinish : sx.tourNext }}</button>
          </div>
          <button type="button" class="btn qt sm icon x" [attr.aria-label]="sx.tourExit" [title]="sx.tourExit" (click)="tour.close()">
            <pw-icon name="x" [size]="14" [stroke]="2" />
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .layer {
      position: fixed;
      inset: 0;
      z-index: 50;
      opacity: 0;
      transition: opacity 100ms var(--ease-out);
      &.vis {
        opacity: 1;
        transition-duration: 160ms;
      }
    }
    .ring {
      position: fixed;
      box-shadow: 0 0 0 2px var(--ac);
      pointer-events: none;
    }
    .dim {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      .fill {
        fill: var(--dim);
      }
    }
    .crumb {
      display: flex;
      width: fit-content;
      margin-bottom: 8px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--acs);
      color: var(--ac);
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .coach {
      position: fixed;
      width: 348px;
      padding: 16px 16px 12px;
      border-radius: 12px;
      background: var(--pop);
      box-shadow: var(--popsh);
      color: var(--tx);
      font-size: 13.5px;
      line-height: 1.5;
      transform: translateY(4px);
      transition: transform 160ms var(--ease-out);
      outline: none;
      &.wide {
        width: 440px;
      }
      h3 {
        margin: 0 0 4px;
        padding-right: 24px;
        font-size: 15px;
        font-weight: 800;
        letter-spacing: -0.01em;
      }
      p {
        margin: 0;
        color: var(--tx2);
      }
    }
    .vis .coach {
      transform: none;
    }
    .arrow {
      position: absolute;
      width: 12px;
      height: 12px;
      background: var(--pop);
      transform: rotate(45deg);
      &.up {
        top: -6px;
      }
      &.down {
        bottom: -6px;
      }
    }
    .x {
      position: absolute;
      top: 8px;
      right: 6px;
    }
    .cfoot {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
    }
    .steps {
      display: flex;
      gap: 3px;
      margin-right: auto;
      align-items: center;
      i {
        display: block;
        width: 12px;
        height: 3px;
        border-radius: 2px;
        background: var(--bd);
        &.on {
          background: var(--ac);
        }
      }
      em {
        font-style: normal;
        white-space: nowrap;
        font-size: 11.5px;
        color: var(--tx3);
        margin-left: 6px;
        font-weight: 600;
      }
    }
    .tray-wrap {
      display: flex;
      justify-content: center;
      padding: 16px 0 4px;
    }
    /* Réplica do menu da bandeja do Windows 11 (sempre escuro, como no sistema) */
    .tray {
      width: 260px;
      padding: 4px;
      border-radius: 8px;
      background: #2c2c2c;
      border: 1px solid #3a3a3a;
      color: #fff;
      font: 13px 'Segoe UI', system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }
    .ti {
      display: flex;
      align-items: center;
      gap: 10px;
      height: 30px;
      padding: 0 10px;
      border-radius: 4px;
      &.hl {
        background: rgba(255, 255, 255, 0.09);
      }
    }
    .tic {
      display: flex;
      width: 14px;
    }
    .tsep {
      height: 1px;
      background: #3a3a3a;
      margin: 4px 0;
    }
    @media (prefers-reduced-motion: reduce) {
      .coach {
        transform: none;
        transition: none;
      }
      .layer,
      .layer.vis {
        transition-duration: 100ms;
      }
    }
  `,
})
export class Tour {
  protected readonly s = inject(I18n).s;
  protected readonly tour = inject(TourService);
  private readonly t = inject(TelemetryService);
  private readonly nav = inject(SettingsNav);
  private readonly ctx = inject(SettingsCtx);
  private readonly notice = inject(UpdateNotice);
  private readonly coach = viewChild<ElementRef<HTMLElement>>('coach');

  protected readonly total = N;
  protected readonly dots = Array.from({ length: N }, (_, i) => i + 1);
  protected readonly visible = signal(false);
  protected readonly box = signal<Box | null>(null);
  /** Item da navegação da página do passo (anel "você está aqui"). */
  protected readonly navBox = signal<Box | null>(null);
  protected readonly holes = computed(() => {
    const n = this.navBox();
    const b = this.box();
    return [...(n ? [{ ...n, r: 9 }] : []), ...(b ? [{ ...b, r: 10 }] : [])];
  });
  /** Tamanho da janela (medido junto com os anéis). */
  private readonly vp = signal({ w: innerWidth, h: innerHeight });
  /**
   * Janela inteira menos os recortes (evenodd, sem máscara: url(#id) quebra com <base href>). O retângulo de fora tem o
   * tamanho exato da janela: com coordenadas enormes o Chrome deixa de pintar o caminho.
   */
  protected readonly dimPath = computed(() => {
    const hole = ({ x, y, w, h, r }: Box & { r: number }) =>
      `M${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x + r}A${r},${r} 0 0 1 ${x},${y + h - r}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}Z`;
    const { w, h } = this.vp();
    return `M0,0H${w}V${h}H0Z` + this.holes().map(hole).join('');
  });
  /** Borda direita da barra lateral: o balão nunca a cobre (o anel da navegação fica à vista). */
  private readonly sideRight = signal(0);
  private readonly coachH = signal(180);
  private target: Element | null = null;
  private navItem: Element | null = null;
  private seq = 0;

  /** Passo que o balão mostra: só troca quando o anel volta (o texto não muda durante o fade-out). */
  protected readonly shown = signal(0);
  /** "PC › Relatório do PC": grupo e página exatamente como na barra lateral. */
  protected readonly crumb = computed(() => {
    const s = this.s();
    const page = TOUR_STEPS[this.shown() - 1]?.page;
    if (!page) return s.tourTrayCrumb;
    const g = NAV.find((x) => x.pages.includes(page))?.group;
    return g ? `${s.navGroups[g]} › ${s.pages[page]}` : s.pages[page];
  });
  protected readonly title = computed(() => this.s().tourSteps[this.shown() - 1]?.[0] ?? '');
  protected readonly body = computed(() => {
    const m = selectedMonitor(this.t.catalog(), this.ctx.draft());
    return (this.s().tourSteps[this.shown() - 1]?.[1] ?? '').replace('{n}', String(m?.index ?? 2));
  });
  protected readonly update = computed(() => this.notice.pending()?.version ?? null);

  /** Balão abaixo do alvo se couber, senão acima; sem alvo, no centro. Sempre dentro da janela. */
  protected readonly pos = computed(() => {
    const b = this.box();
    const vw = innerWidth;
    const vh = innerHeight;
    const w = b ? 348 : 440;
    const h = this.coachH();
    if (!b) return { x: Math.round((vw - w) / 2), y: Math.round(Math.max(24, (vh - h) / 2)), arrow: null };
    const gap = 14;
    const minX = Math.max(16, this.sideRight() + 16);
    const x = Math.round(Math.max(minX, Math.min(b.x + b.w - w, vw - w - 16)));
    let y: number;
    let side: 'up' | 'down' | null;
    if (b.y + b.h + gap + h <= vh - 16) {
      y = b.y + b.h + gap;
      side = 'up';
    } else if (b.y - gap - h >= 16) {
      y = b.y - gap - h;
      side = 'down';
    } else {
      // Alvo maior que a janela: o balão fica por cima do canto do alvo
      y = Math.max(16, Math.min(b.y + 16, vh - h - 16));
      side = null;
    }
    const at = Math.min(Math.max(18, b.x + Math.min(b.w, 220) / 2 - x), w - 30);
    return { x, y: Math.round(y), arrow: side ? { side, at } : null };
  });

  constructor() {
    // Cada passo: some (100 ms) → navega e rola na hora → mede → aparece (160 ms)
    effect(() => {
      const i = this.tour.step();
      untracked(() => this.show(i));
    });
    const relayout = () => this.measure();
    const keys = (e: KeyboardEvent) => this.keys(e);
    addEventListener('resize', relayout);
    document.addEventListener('scroll', relayout, { capture: true, passive: true });
    document.addEventListener('keydown', keys);
    inject(DestroyRef).onDestroy(() => {
      removeEventListener('resize', relayout);
      document.removeEventListener('scroll', relayout, { capture: true });
      document.removeEventListener('keydown', keys);
    });
  }

  private show(i: number) {
    const id = ++this.seq;
    if (!i) {
      this.visible.set(false);
      this.target = null;
      this.navItem = null;
      return;
    }
    const wasVisible = this.visible();
    this.visible.set(false);
    setTimeout(
      () => {
        if (id !== this.seq) return;
        const st = TOUR_STEPS[i - 1];
        if (st.page) this.nav.go(st.page, st.anchor ?? null);
        this.findTarget(st.targets, id, 0, i);
      },
      wasVisible ? 100 : 0,
    );
  }

  /** Espera a página nova renderizar (até ~20 quadros) e rola o alvo para o meio da tela, sem animação. */
  private findTarget(sel: string[], id: number, tries: number, step: number) {
    requestAnimationFrame(() => {
      if (id !== this.seq) return;
      const main = document.querySelector('.pw-app main');
      const found = sel.map((x) => main?.querySelector(x)).filter((x): x is Element => !!x);
      // Espera a página nova: sem nenhum alvo, até ~20 quadros; sem o principal (mas com um reserva), 3
      const waitMain = sel.length > 0 && !main?.querySelector(sel[0]) && tries < 3;
      if (sel.length && (!found.length || waitMain) && tries < 20) return this.findTarget(sel, id, tries + 1, step);
      const fits = (x: Element) => x.getBoundingClientRect().height <= innerHeight * 0.6;
      const el = found.find(fits) ?? found[0] ?? null;
      const page = TOUR_STEPS[step - 1]?.page;
      this.navItem = page ? document.querySelector(`.st-side [data-nav="${page}"]`) : null;
      this.target = el;
      this.shown.set(step);
      this.navItem?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      // Alvo alto demais (ex.: a tabela de Métricas): mostra o começo dele, e o anel termina antes do balão
      el?.scrollIntoView({ block: fits(el) ? 'center' : 'start', behavior: 'instant' });
      requestAnimationFrame(() => {
        if (id !== this.seq) return;
        this.measure();
        this.visible.set(true);
        this.coach()?.nativeElement.focus({ preventScroll: true });
        // O texto novo pode mudar a altura do balão: mede de novo no quadro seguinte
        requestAnimationFrame(() => this.measure());
      });
    });
  }

  private measure() {
    if (!this.tour.running()) return;
    const c = this.coach()?.nativeElement;
    if (c) this.coachH.set(c.offsetHeight);
    this.vp.set({ w: innerWidth, h: innerHeight });
    this.sideRight.set(document.querySelector('.st-side')?.getBoundingClientRect().right ?? 0);
    this.navBox.set(this.navItem?.isConnected ? this.rect(this.navItem, 3) : null);
    const b = this.target?.isConnected ? this.rect(this.target, 4) : null;
    // Sem espaço acima nem abaixo: corta o anel na parte de cima do alvo para o balão caber embaixo sem cobri-lo
    const h = this.coachH();
    if (b && b.y + b.h + 14 + h > innerHeight - 16 && b.y - 14 - h < 16) b.h = Math.max(60, innerHeight - 30 - h - b.y);
    this.box.set(b);
  }

  /** Caixa do anel: o elemento com folga, cortado na parte visível da janela. */
  private rect(el: Element, pad: number): Box {
    const r = el.getBoundingClientRect();
    const top = Math.max(r.top - pad, 8);
    const bottom = Math.min(r.bottom + pad, innerHeight - 8);
    return { x: Math.round(r.left - pad), y: Math.round(top), w: Math.round(r.width + pad * 2), h: Math.round(Math.max(24, bottom - top)) };
  }

  /** → / Enter avança, ← volta, Esc fecha (sem animação extra: é teclado). */
  private keys(e: KeyboardEvent) {
    if (!this.tour.running()) return;
    const onButton = (e.target as HTMLElement)?.tagName === 'BUTTON';
    if (e.key === 'Escape') this.tour.close();
    else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !onButton)) this.tour.next();
    else if (e.key === 'ArrowLeft') this.tour.back();
    else return;
    e.preventDefault();
    e.stopPropagation();
  }

  /** Tab fica dentro do balão. */
  protected trap(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;
    const items = [...(this.coach()?.nativeElement.querySelectorAll<HTMLElement>('button') ?? [])];
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
}
