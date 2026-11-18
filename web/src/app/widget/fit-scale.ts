import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * Layouts médio/compacto: se o conteúdo não couber na altura da janela, reduz a escala (--fit, multiplicador de
 * --u no .pw) até caber, em vez de cortar cards no meio. Mede só em resize ou quando linhas entram/saem —
 * nunca a cada atualização de valores.
 */
@Directive({ selector: '[pwFitScale]' })
export class FitScale implements AfterViewInit, OnDestroy {
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
    this.el.closest<HTMLElement>('.pw')?.style.removeProperty('--fit');
  }

  private schedule() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.fit());
  }

  private fit() {
    const pw = this.el.closest<HTMLElement>('.pw');
    if (!pw) return;
    const rows = this.el.querySelectorAll('section, .c-split').length;
    const key = `${this.el.clientWidth}x${this.el.clientHeight}:${rows}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    pw.style.setProperty('--fit', '1');
    const need = this.el.scrollHeight;
    const have = this.el.clientHeight;
    if (need > have + 1) {
      // Fontes e espaçamentos escalam juntos; uma segunda passada corrige o que não é linear (quebras de linha)
      let f = Math.max(0.6, have / need);
      pw.style.setProperty('--fit', f.toFixed(3));
      const again = this.el.scrollHeight;
      if (again > have + 1) {
        f = Math.max(0.6, f * (have / again));
        pw.style.setProperty('--fit', f.toFixed(3));
      }
    }
  }
}
