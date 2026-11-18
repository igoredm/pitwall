import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Mobile } from './mobile/mobile';
import { Settings } from './settings/settings';
import { Widget } from './widget/widget';
import { Wizard } from './wizard/wizard';

/**
 * Roteamento mínimo por hash: #/widget (janela do widget), #/settings (janela de configurações),
 * #/mobile (celular na rede local; o QR traz #/mobile?pair=<código>) e #/wizard (assistente sozinho).
 */
@Component({
  selector: 'app-root',
  imports: [Widget, Settings, Mobile, Wizard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: block; height: 100%; }`,
  template: `
    @switch (route()) {
      @case ('settings') {
        <!-- carregado sob demanda: a janela do widget não baixa o código das configurações -->
        @defer {
          <pw-settings />
        }
      }
      @case ('mobile') {
        <!-- o celular baixa só a página dele -->
        @defer {
          <pw-mobile />
        }
      }
      @case ('wizard') {
        @defer {
          <pw-wizard />
        }
      }
      @default {
        <pw-widget />
      }
    }
  `,
})
export class App {
  protected readonly route = signal(this.read());

  constructor() {
    window.addEventListener('hashchange', () => this.route.set(this.read()));
  }

  /** "#/mobile?pair=K7QX2MPA" → "mobile" (a query dentro do hash é lida por quem precisa dela). */
  private read() {
    return location.hash.replace(/^#\/?/, '').split(/[?/]/)[0] || 'widget';
  }
}
