import { Signal } from '@angular/core';
import { AppConfig } from '../models';

/**
 * O que as seções em componente próprio (Celular, perfis por jogo...) precisam da tela de configurações:
 * a cópia editável da config e o jeito de alterá-la (salva com debounce). A Settings se fornece com este token,
 * assim os filhos não importam a Settings (evita import circular).
 */
export abstract class SettingsCtx {
  abstract readonly draft: Signal<AppConfig | null>;
  abstract update(mutate: (c: AppConfig) => void): void;
  /** Vai para outra seção da tela (ex.: o card de atualização no rodapé da navegação). */
  abstract go(section: string, anchor?: string): void;
}
