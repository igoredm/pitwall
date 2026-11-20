import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../../../i18n';
import { PcEvent } from '../../../models';
import { clock } from '../../format';
import { evKey, evSource, evTime } from '../../reports';

/**
 * Uma linha de evento do Windows: hora | nome + fonte em mono | o que quer dizer. Sem diagnóstico e sem cor
 * (design-notes › v1.2 › 2). near = dentro do incidente (hora com segundos, coluna mais estreita).
 */
@Component({
  selector: 'pw-event-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'ev', '[class.near]': 'near()' },
  template: `
    @let v = view();
    <span class="evt">{{ v.time }}</span>
    <div class="evc">
      <div class="evn">{{ v.name }}</div>
      <div class="evs">{{ v.source }}</div>
    </div>
    <div class="evm">{{ v.meaning }}</div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 96px minmax(0, 1.1fr) minmax(0, 1.6fr);
      gap: 16px;
      padding: 10px 16px;
      align-items: start;
    }
    :host(.near) {
      grid-template-columns: 86px minmax(0, 1.1fr) minmax(0, 1.6fr);
    }
    :host + :host {
      border-top: 1px solid var(--hair);
    }
    .evt {
      font-size: 13px;
      color: var(--tx2);
      font-weight: 600;
      white-space: nowrap;
    }
    .evc {
      min-width: 0;
    }
    .evn {
      font-weight: 700;
      font-size: 13.5px;
    }
    .evs {
      font-family: 'JetBrains Mono', ui-monospace, monospace;
      font-size: 11.5px;
      color: var(--tx3);
      margin-top: 2px;
      overflow-wrap: anywhere;
    }
    .evm {
      font-size: 12.5px;
      color: var(--tx2);
      line-height: 1.45;
    }
    @container (max-width: 560px) {
      :host,
      :host(.near) {
        grid-template-columns: 86px minmax(0, 1fr);
      }
      .evm {
        grid-column: 2;
      }
    }
  `,
})
export class EventRow {
  private readonly s = inject(I18n).s;
  readonly event = input.required<PcEvent>();
  readonly near = input(false);

  protected readonly view = computed(() => {
    const s = this.s();
    const e = this.event();
    const k = evKey(e);
    return {
      time: this.near() ? clock(new Date(e.time), s, true) : evTime(e.time, s),
      name: s.rp.evName[k] ?? e.source,
      source: evSource(e),
      meaning: s.rp.evMeaning[k] ?? e.message ?? '',
    };
  });
}
