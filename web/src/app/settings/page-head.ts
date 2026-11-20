import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { I18n } from '../i18n';
import { SettingsPage } from '../models';
import { Icon } from '../ui/icon';
import { SettingsCtx } from './settings-ctx';

/**
 * Cabeçalho de página: h1 22/800, descrição até 64ch e o "Salvo" à direita (troca de texto sem animação).
 * Ações extras (ex.: Pré-visualizar) entram por projeção.
 */
@Component({
  selector: 'pw-page-head',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    <header class="ph">
      <div>
        <h1>{{ sx.pages[page()] }}</h1>
        <p class="pd">{{ intro() ?? sx.pageIntro[page()] }}</p>
      </div>
      <div class="ph-actions">
        <ng-content />
        @switch (ctx.saveState()) {
          @case ('saving') {
            <span class="saved" role="status">{{ sx.saving }}</span>
          }
          @case ('offline') {
            <span class="saved warn" role="status"><pw-icon name="warn" [size]="14" [stroke]="2" />{{ sx.notSaved }}</span>
          }
          @default {
            <span class="saved" role="status"><pw-icon name="check" [size]="14" [stroke]="2" />{{ sx.saved }}</span>
          }
        }
      </div>
    </header>
  `,
})
export class PageHead {
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  readonly page = input.required<SettingsPage>();
  /** 1.2: descrição no lugar da de pageIntro (Relatório do PC, Relatórios de jogo). */
  readonly intro = input<string>();
}
