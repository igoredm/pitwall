import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Settings } from './settings/settings';
import { Widget } from './widget/widget';

/** Roteamento mínimo por hash: #/widget (janela do widget) e #/settings (janela de configurações). */
@Component({
  selector: 'app-root',
  imports: [Widget, Settings],
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

  private read() {
    return location.hash.replace(/^#\/?/, '') || 'widget';
  }
}
