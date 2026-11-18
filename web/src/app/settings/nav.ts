import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { SettingsPage } from '../models';

/** Ordem e grupos da navegação (design-notes › v1.0 › IA). */
export const NAV: { group: 'widget' | 'game' | 'pitwall' | null; pages: SettingsPage[] }[] = [
  { group: null, pages: ['overview'] },
  { group: 'widget', pages: ['widget', 'metrics', 'alerts'] },
  { group: 'game', pages: ['games', 'sessions', 'gpu'] },
  { group: 'pitwall', pages: ['devices', 'features', 'app'] },
];
export const PAGES: SettingsPage[] = NAV.flatMap((g) => g.pages);

/** Ids da 0.7 (?section=) → páginas da 1.0. */
const LEGACY: Record<string, [SettingsPage, string?]> = {
  metricas: ['metrics'],
  geral: ['widget'],
  gpu: ['gpu'],
  jogos: ['games'],
  log: ['sessions', 'csv'],
  celular: ['devices'],
};

interface Target {
  page: SettingsPage;
  anchor: string | null;
}

/**
 * Página e âncora das configurações, no hash: #/settings/<pagina>[/<ancora>] (a query que vier depois, como
 * ?tutorial=1 ou ?demo=1, é mantida). Voltar/avançar do navegador funcionam. Trocar de página não anima.
 */
@Injectable()
export class SettingsNav {
  readonly page = signal<SettingsPage>('overview');
  readonly anchor = signal<string | null>(null);
  /** Muda a cada navegação pedida (mesmo para a mesma âncora): a moldura rola e destaca de novo. */
  readonly seq = signal(0);
  /** A navegação atual pediu destaque da linha (busca, "Editar" em Alertas). */
  flash = false;

  constructor() {
    const t = this.read();
    this.page.set(t.page);
    this.anchor.set(t.anchor);
    const onHash = () => {
      const n = this.read();
      if (!location.hash.startsWith('#/settings')) return;
      if (n.page === this.page() && n.anchor === this.anchor()) return;
      this.flash = false;
      this.page.set(n.page);
      this.anchor.set(n.anchor);
      this.seq.update((x) => x + 1);
    };
    window.addEventListener('hashchange', onHash);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('hashchange', onHash));
  }

  go(page: SettingsPage, anchor?: string | null, flash = false) {
    this.flash = flash;
    this.page.set(page);
    this.anchor.set(anchor ?? null);
    this.seq.update((x) => x + 1);
    const q = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?')) : '';
    const hash = `#/settings/${page}${anchor ? '/' + encodeURIComponent(anchor) : ''}${q}`;
    if (location.hash !== hash) history.pushState(null, '', location.pathname + location.search + hash);
  }

  /** Link de uma página (href dos itens da navegação). */
  href(page: SettingsPage, anchor?: string) {
    const q = location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?')) : '';
    return `#/settings/${page}${anchor ? '/' + anchor : ''}${q}`;
  }

  private read(): Target {
    const path = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
    if (path[0] === 'settings' && PAGES.includes(path[1] as SettingsPage))
      return { page: path[1] as SettingsPage, anchor: path[2] ? decodeURIComponent(path[2]) : null };
    // 0.7: ?section=jogos na URL normal
    const legacy = LEGACY[new URLSearchParams(location.search).get('section') ?? ''];
    if (legacy) return { page: legacy[0], anchor: legacy[1] ?? null };
    return { page: 'overview', anchor: null };
  }
}
