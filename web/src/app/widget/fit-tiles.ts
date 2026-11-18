import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, output } from '@angular/core';

// --row-min registrado como <length> para o getComputedStyle devolver px já resolvidos (calc com --u).
try {
  CSS.registerProperty({ name: '--row-min', syntax: '<length>', inherits: false, initialValue: '0px' });
} catch {
  // já registrado (HMR) — ok
}

/**
 * Layout completo: calcula quantos tiles cabem inteiros no container (linhas × colunas) e emite esse número.
 * O componente só renderiza essa quantidade — os que não cabem nem são criados (nada de medir
 * cada tile nem manter sparklines escondidos). Só recalcula em resize, e só emite quando o número muda.
 */
@Directive({ selector: '[pwFitTiles]' })
export class FitTiles implements AfterViewInit, OnDestroy {
  readonly capacity = output<number>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly resize = new ResizeObserver(() => this.schedule());
  private frame = 0;
  private last = -1;

  ngAfterViewInit() {
    this.resize.observe(this.el);
    this.schedule();
  }

  ngOnDestroy() {
    this.resize.disconnect();
    cancelAnimationFrame(this.frame);
  }

  private schedule() {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.measure());
  }

  private measure() {
    const cs = getComputedStyle(this.el);
    const rowMin = parseFloat(cs.getPropertyValue('--row-min')) || 40;
    const gap = parseFloat(cs.rowGap) || 0;
    const cols = cs.display === 'grid' ? Math.max(1, cs.gridTemplateColumns.split(' ').filter(Boolean).length) : 1;
    const rows = Math.max(0, Math.floor((this.el.clientHeight + gap) / (rowMin + gap)));
    const cap = rows * cols;
    if (cap !== this.last) {
      this.last = cap;
      this.capacity.emit(cap);
    }
  }
}
