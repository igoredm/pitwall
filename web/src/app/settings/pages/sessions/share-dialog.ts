import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { I18n } from '../../../i18n';
import { GameSession } from '../../../models';
import { TelemetryService } from '../../../telemetry.service';
import { Icon } from '../../../ui/icon';
import { dayTime } from '../../format';
import { copyText } from '../../helpers';
import { downloadBlob, fileStamp } from '../../reports';
import { CARD_H, CARD_W, drawCard, shareData, shareMarkdown, shareText } from './share-card';

type Done = 'img' | 'saved' | 'png' | 'text' | 'md';

/**
 * Diálogo Compartilhar (frame V12-Card-Texto): prévia do PNG a 40% com [Copiar imagem] [Salvar PNG], e os blocos de
 * texto simples e Markdown. Entra com opacity + scale(.98) (classes dlg-in/dlg-out do kit, quem abre põe).
 */
@Component({
  selector: 'pw-share-dialog',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'dialog share', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'share-t', '(keydown)': 'keydown($event)' },
  template: `
    @let sx = s();
    @let x = session();
    <div class="hd">
      <span class="ttl" id="share-t">{{ bench() ? sx.v13.shareBenchTitle : sx.rp.shareTitle }}</span>
      <span class="cap ell"><span class="mono">{{ x.exe }}</span> · {{ when() }}</span>
      <span class="grow"></span>
      <button #closeBtn type="button" class="btn qt sm ib" [attr.aria-label]="sx.close" (click)="close.emit()"><pw-icon name="x" [size]="15" /></button>
    </div>
    <div class="bd">
      <div class="left">
        <div class="prev">
          <canvas #cv [width]="w" [height]="h" role="img" [attr.aria-label]="aria()"></canvas>
        </div>
        <div class="acts" aria-live="polite">
          <button type="button" class="btn sm pri" (click)="copyImage()"><pw-icon [name]="done() === 'img' ? 'check' : 'copy'" [size]="14" />{{ done() === 'img' ? sx.copied : done() === 'saved' ? sx.rp.imageSaved : sx.rp.copyImage }}</button>
          <button type="button" class="btn sm" (click)="savePng()"><pw-icon [name]="done() === 'png' ? 'check' : 'download'" [size]="14" />{{ done() === 'png' ? sx.rp.saved : sx.rp.savePng }}</button>
          <span class="cap">{{ sx.rp.pngHint }}</span>
        </div>
      </div>
      <div class="right">
        <div class="bh">
          <span><span class="lb">{{ sx.rp.textTitle }}</span> <span class="cap">{{ sx.rp.textHint }}</span></span>
          <button type="button" class="btn sm" (click)="copy('text')"><pw-icon [name]="done() === 'text' ? 'check' : 'copy'" [size]="14" />{{ done() === 'text' ? sx.copied : sx.rp.copyTextBtn }}</button>
        </div>
        <pre class="txt">{{ text() }}</pre>
        <div class="bh mt">
          <span><span class="lb">{{ sx.rp.mdTitle }}</span> <span class="cap">{{ sx.rp.mdHint }}</span></span>
          <button type="button" class="btn sm" (click)="copy('md')"><pw-icon [name]="done() === 'md' ? 'check' : 'copy'" [size]="14" />{{ done() === 'md' ? sx.copied : sx.rp.copyMd }}</button>
        </div>
        <pre class="txt">{{ md() }}</pre>
      </div>
    </div>
  `,
  styles: `
    :host {
      width: 1040px;
      max-width: calc(100vw - 48px);
      box-sizing: border-box;
      font-size: 14px;
      font-variant-numeric: tabular-nums;
    }
    .hd {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px 14px 20px;
      border-bottom: 1px solid var(--hair);
      min-width: 0;
    }
    .ttl {
      font-weight: 800;
      font-size: 15px;
      white-space: nowrap;
    }
    .grow {
      flex: 1;
    }
    .ib {
      padding: 0 8px;
    }
    .bd {
      display: flex;
      gap: 20px;
      padding: 20px;
    }
    .left {
      display: flex;
      flex-direction: column;
      gap: 10px;
      flex-shrink: 0;
      width: min(480px, 46%);
    }
    .prev {
      width: 100%;
      aspect-ratio: 1200 / 630;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 0 0 1px var(--hair);
      background: #0e1014;
      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    }
    .acts {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .right {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .bh {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      .lb {
        font-size: 13.5px;
        margin-right: 6px;
      }
    }
    .mt {
      margin-top: 6px;
    }
    .txt {
      margin: 0;
      padding: 14px 16px;
      font: 500 12.5px/1.6 'JetBrains Mono', ui-monospace, monospace;
      color: var(--tx);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: var(--sf2);
      border-radius: 8px;
      border: 1px solid var(--hair);
    }
    @media (max-width: 900px) {
      .bd {
        flex-direction: column;
      }
      .left,
      .prev {
        width: 100%;
      }
    }
  `,
})
export class ShareDialog {
  private readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly session = input.required<GameSession>();
  /** 1.3: é um benchmark (sem série da partida; "Benchmark 60 s" no lugar da duração). */
  readonly bench = input(false);
  readonly close = output<void>();

  protected readonly w = CARD_W;
  protected readonly h = CARD_H;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private readonly closeBtn = viewChild.required<ElementRef<HTMLButtonElement>>('closeBtn');
  /** Série do FPS da partida (null = sem CSV). */
  private readonly fps = signal<(number | null)[] | null | undefined>(undefined);
  protected readonly done = signal<Done | null>(null);
  private timer?: ReturnType<typeof setTimeout>;
  private drawn: Promise<void> = Promise.resolve();

  protected readonly when = computed(() => dayTime(this.session().start, this.s()));
  private readonly data = computed(() => shareData(this.session(), this.s(), this.t.catalog(), this.t.settings(), this.fps() ?? null, { bench: this.bench() }));
  protected readonly text = computed(() => shareText(this.data(), this.s()));
  protected readonly md = computed(() => shareMarkdown(this.data(), this.s()));
  protected readonly aria = computed(() => this.s().rp.cardAria(this.data().game, this.data().avg ?? ''));

  constructor() {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    effect(() => {
      const x = this.session();
      this.fps.set(undefined);
      // Benchmark não tem CSV próprio: o card sai sem a linha do FPS
      if (this.bench()) return this.fps.set(null);
      this.t.requestSessionSeries(x.start, !!x.end || !!x.endedByCrash).then((sr) => {
        if (this.session() === x) this.fps.set(sr.available ? (sr.series['fps.current'] ?? null) : null);
      });
    });
    // Redesenha quando os dados mudam (e quando a série chega)
    effect(() => {
      const d = this.data();
      const s = this.s();
      const cv = this.canvas().nativeElement;
      this.drawn = drawCard(cv, d, s);
    });
    afterNextRender(() => this.closeBtn().nativeElement.focus());
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      if (back?.isConnected) back.focus();
    });
  }

  private flash(d: Done) {
    this.done.set(d);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.done.set(null), 2000);
  }

  private async png(): Promise<Blob | null> {
    await this.drawn;
    return new Promise((resolve) => this.canvas().nativeElement.toBlob((b) => resolve(b), 'image/png'));
  }

  private fileName() {
    return `${this.s().rp.fileMatch}_${this.data().game.replace(/[^\w.-]+/g, '-')}_${fileStamp(this.session().start)}.png`;
  }

  /** Copia o PNG; sem suporte (ou recusado), baixa o arquivo. */
  protected async copyImage() {
    const blob = await this.png();
    if (!blob) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.flash('img');
    } catch {
      downloadBlob(this.fileName(), blob);
      this.flash('saved');
    }
  }

  protected async savePng() {
    const blob = await this.png();
    if (!blob) return;
    downloadBlob(this.fileName(), blob);
    this.flash('png');
  }

  protected async copy(kind: 'text' | 'md') {
    if (await copyText(kind === 'md' ? this.md() : this.text())) this.flash(kind);
  }

  /** Esc fecha; Tab fica dentro do diálogo. */
  protected keydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close.emit();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...(this.host.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('button:not([disabled])')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
