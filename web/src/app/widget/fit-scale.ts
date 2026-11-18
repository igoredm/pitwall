import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Layouts médio/compacto: se o conteúdo não couber na altura da janela, reduz a escala (--fit, multiplicador de
 * --u no .pw) até caber, em vez de cortar cards no meio. Mede só em resize ou quando elementos entram/saem —
 * nunca a cada atualização de valores.
 * pwFitScale="self": põe o --fit no próprio elemento (coluna do FPS no completo, que tem altura fixa).
 */
@Directive({ selector: '[pwFitScale]' })
export class FitScale implements AfterViewInit, OnDestroy {
  readonly target = input<string>('', { alias: 'pwFitScale' });
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly resize = new ResizeObserver(() => this.schedule());
  private readonly mutation = new MutationObserver(() => this.schedule());
  private frame = 0;
  private lastKey = '';

  ngAfterViewInit() {
    this.resize.observe(this.el);
    this.mutation.observe(this.el, { childList: true, subtree: true });
    this.schedule();
  }

  ngOnDestroy() {
    this.resize.disconnect();
    this.mutation.disconnect();
    cancelAnimationFrame(this.frame);
    this.host()?.style.removeProperty('--fit');
  }

  private schedule() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.fit());
  }

  /**
   * Altura do conteúdo em fluxo (coluna do FPS): o scrollHeight conta o anel do Neon e a faixa dos picos, que são
   * absolutos e não encolhem com o --fit. offsetTop/offsetHeight ignoram o transform da animação de entrada.
   */
  private flowHeight() {
    let top = Infinity;
    let bottom = 0;
    for (const c of Array.from(this.el.children) as HTMLElement[]) {
      const pos = getComputedStyle(c).position;
      if (pos === 'absolute' || pos === 'fixed' || c.offsetHeight === 0) continue;
      top = Math.min(top, c.offsetTop);
      bottom = Math.max(bottom, c.offsetTop + c.offsetHeight);
    }
    if (top === Infinity) return 0;
    const cs = getComputedStyle(this.el);
    return bottom - top + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
  }

  private host() {
    return this.target() === 'self' ? this.el : this.el.closest<HTMLElement>('.pw');
  }

  private fit() {
    const pw = this.host();
    if (!pw) return;
    // quantos elementos há dentro (linhas, pílulas do FPS, gráfico, bateria): muda = mede de novo
    const rows = this.el.getElementsByTagName('*').length;
    const key = `${this.el.clientWidth}x${this.el.clientHeight}:${rows}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    pw.style.setProperty('--fit', '1');
    const have = this.el.clientHeight;
    // Fontes e espaçamentos escalam juntos; as passadas extras corrigem o que não é linear (quebras de linha,
    // pílulas que mudam de fileira). Até 4 passadas, só em resize/mudança de elementos.
    let f = 1;
    for (let i = 0; i < 4; i++) {
      const need = this.target() === 'self' ? this.flowHeight() : this.el.scrollHeight;
      if (need <= have + 1 || f <= 0.6) break;
      f = Math.max(0.6, f * (have / need));
      pw.style.setProperty('--fit', f.toFixed(3));
    }
  }
}
