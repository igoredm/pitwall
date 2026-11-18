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
import { SettingsNav } from './nav';
import { SettingsCtx } from './settings-ctx';
import { UpdateNotice } from './update-notice';

/** Os 8 passos (design-notes › Assistente + tour): página, âncora e alvo (o primeiro que existir na tela). */
export const TOUR_STEPS: { page: SettingsPage | null; anchor?: string; targets: string[] }[] = [
  { page: 'overview', targets: ['[data-tour="widget-thumb"]'] },
  { page: 'widget', anchor: 'layout', targets: ['[data-tour="layout"]'] },
  { page: 'metrics', anchor: 'gpu', targets: ['[data-tour="metrics-table"]'] },
  { page: 'games', anchor: 'detection', targets: ['[data-tour="detection"]'] },
  { page: 'gpu', anchor: 'tuning', targets: ['[data-tour="gpu-switch"]', '.na'] },
  { page: 'devices', anchor: 'pair', targets: ['[data-tour="pair"]', '[data-tour="remote"]'] },
  { page: 'alerts', anchor: 'windows', targets: ['[data-tour="alerts-switch"]'] },
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
  /** Passo na tela (1–8); 0 = tour fechado. */
  readonly step = signal(0);
  readonly running = computed(() => this.step() > 0);

  /** Idempotente: com o tour na tela, um gatilho novo (bandeja, URL) não reinicia. */
  /** Quem tinha o foco antes do tour (ex.: "Começar tour"): volta para ele ao fechar ou concluir. */
  private returnFocus: HTMLElement | null = null;

  start(resume = false) {
    if (this.running()) return;
    this.returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    const saved = this.ctx.draft()?.tour;
    const from = resume && saved && !saved.done && saved.step > 0 ? Math.min(saved.step, N) : 1;
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
    this.ctx.toast({ title: s.tourClosed(at), body: s.tourClosedHint, action: { label: s.resume, run: () => this.start(true) } });
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
 * Coach marks sobre a UI real: anel accent de 2 px no alvo, o resto escurecido com --dim (box-shadow, sem blur) e o
 * balão de 348 px. O anel não voa entre alvos: some em 100 ms, a página troca e rola na hora, e anel + balão voltam
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
        @if (box(); as b) {
          <div class="ring" [style.left.px]="b.x" [style.top.px]="b.y" [style.width.px]="b.w" [style.height.px]="b.h"></div>
        } @else {
          <div class="dim"></div>
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
          <h3 aria-live="polite">{{ title() }}</h3>
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
      border-radius: 10px;
      box-shadow: 0 0 0 2px var(--ac), 0 0 0 9999px var(--dim);
      pointer-events: none;
    }
    .dim {
      position: fixed;
      inset: 0;
      background: var(--dim);
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
  private readonly coachH = signal(180);
  private target: Element | null = null;
  private seq = 0;

  /** Passo que o balão mostra: só troca quando o anel volta (o texto não muda durante o fade-out). */
  protected readonly shown = signal(0);
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
    const x = Math.round(Math.min(Math.max(16, b.x + b.w - w), vw - w - 16));
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
      const el = sel.map((x) => main?.querySelector(x)).find((x) => !!x) ?? null;
      if (!el && sel.length && tries < 20) return this.findTarget(sel, id, tries + 1, step);
      this.target = el;
      this.shown.set(step);
      el?.scrollIntoView({ block: 'center', behavior: 'instant' });
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
    if (!this.target || !this.target.isConnected) {
      this.box.set(null);
      return;
    }
    const r = this.target.getBoundingClientRect();
    const pad = 4;
    const top = Math.max(r.top - pad, 8);
    const bottom = Math.min(r.bottom + pad, innerHeight - 8);
    this.box.set({ x: Math.round(r.left - pad), y: Math.round(top), w: Math.round(r.width + pad * 2), h: Math.round(Math.max(24, bottom - top)) });
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
