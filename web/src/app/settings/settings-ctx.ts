import { Signal } from '@angular/core';
import { AppConfig, SettingsPage } from '../models';

/** Estado do "Salvo" no cabeçalho de cada página. */
export type SaveState = 'saved' | 'saving' | 'offline';

/** Diálogo de confirmação (Restaurar padrão, Revogar todos). */
export interface ConfirmOptions {
  title: string;
  body?: string;
  /** Lista do que muda (ex.: o que volta ao padrão). */
  listTitle?: string;
  items?: string[];
  /** Linha final, do que fica. */
  foot?: string;
  confirm: string;
  danger?: boolean;
}

/** Aviso no rodapé da janela (some sozinho; o tempo pausa com o mouse em cima). */
export interface ToastOptions {
  title: string;
  body?: string;
  action?: { label: string; run: () => void };
  /** ms (padrão 6000). */
  duration?: number;
}

/**
 * O que as páginas das configurações precisam da moldura: a cópia editável da config (salva com debounce), a
 * navegação com âncora, o "Salvo", a prévia do widget, avisos, diálogos e o tour. A Settings se fornece com este
 * token, assim as páginas não importam a Settings (evita import circular).
 */
export abstract class SettingsCtx {
  abstract readonly draft: Signal<AppConfig | null>;
  abstract readonly saveState: Signal<SaveState>;
  abstract update(mutate: (c: AppConfig) => void): void;
  /** Vai para uma página (e rola até a âncora; flash = destaca a linha, como na busca). */
  abstract go(page: SettingsPage, anchor?: string, flash?: boolean): void;
  abstract openPreview(): void;
  abstract toast(opts: ToastOptions): void;
  abstract confirm(opts: ConfirmOptions): Promise<boolean>;
  /** Config de fábrica (descarta a edição pendente antes). */
  abstract restoreDefaults(): void;
  /** Começa o tour (passo 1) ou retoma do último passo visto. */
  abstract startTour(resume?: boolean): void;
}
