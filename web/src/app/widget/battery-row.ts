import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { WirelessDevice } from '../models';

/** Bateria dos periféricos sem fio, discreta, perto do FPS: ícone + %, ⚡ carregando, vermelho quando baixa. */
@Component({
  selector: 'pw-battery-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (d of visible(); track d.key) {
      <span
        class="dev"
        [class.low]="d.percent != null && d.percent <= low()"
        [class.asleep]="d.asleep"
        [title]="d.name + ' · ' + d.via + (d.asleep ? ' · dormindo (último valor)' : '') + (d.charging ? ' · carregando' : '')"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          @switch (d.kind) {
            @case ('headset') {
              <path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4.5" height="6.5" rx="1.6" /><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.6" />
            }
            @case ('keyboard') {
              <rect x="2.5" y="6" width="19" height="12" rx="2.2" /><path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M8 14h8" />
            }
            @case ('gamepad') {
              <path d="M7 8.5h10a4.5 4.5 0 0 1 4.4 5.5l-.6 2.6a2 2 0 0 1-3.4.9L15 15h-6l-2.4 2.5a2 2 0 0 1-3.4-.9l-.6-2.6A4.5 4.5 0 0 1 7 8.5z" /><path d="M8.5 11v3M7 12.5h3M15.5 12h.01M17.5 13.5h.01" />
            }
            @case ('phone') {
              <rect x="7" y="2.5" width="10" height="19" rx="2.2" /><path d="M11 18.5h2" />
            }
            @default {
              <rect x="6.5" y="2.5" width="11" height="19" rx="5.5" /><path d="M12 6.5v3.5" />
            }
          }
        </svg>
        <span class="v">{{ d.percent != null ? d.percent + '%' : (d.levelText ?? '—') }}</span>
        @if (d.charging) {
          <span class="chg" aria-label="carregando">⚡</span>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 0.3em 0.9em;
      color: var(--text3);
      font-size: inherit;
      line-height: 1;
    }
    .dev { display: inline-flex; align-items: center; gap: 0.3em; white-space: nowrap; transition: color 600ms ease, opacity 600ms ease; }
    svg { width: 1.15em; height: 1.15em; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    .v { font-family: var(--font-num); font-weight: 700; color: var(--text2); font-variant-numeric: tabular-nums; }
    .low, .low .v { color: var(--red); }
    .asleep { opacity: 0.5; }
    .chg { color: var(--accent); font-size: 0.9em; }
  `,
})
export class BatteryRow {
  readonly devices = input.required<readonly WirelessDevice[]>();
  readonly hidden = input<readonly string[]>([]);
  readonly low = input(15);
  /** Limite de itens (layouts menores). */
  readonly max = input(8);

  protected readonly visible = computed(() =>
    this.devices()
      .filter((d) => d.connected && !this.hidden().includes(d.key))
      .slice(0, this.max()),
  );
}
