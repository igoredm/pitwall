import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { I18n } from '../../../i18n';
import { PcEvent, PcInstall } from '../../../models';
import { evTime } from '../../reports';
import { crashTimes, crashesAround, isMainInstall } from './installs-util';

const PAGE = 25;

/**
 * 1.4: Relatório do PC › Instalado recentemente. Programas, drivers e atualizações dos últimos 30 dias, com as quedas
 * nos 7 dias antes e depois de cada um (coincidência no tempo, sem diagnóstico). "Principais" esconde apps da Store e
 * drivers da Microsoft.
 */
@Component({
  selector: 'pw-installs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    <div class="sh">
      <div>
        <h2>{{ sx.v14.installsTitle }}</h2>
        <div class="ht">{{ sx.v14.installsHint }}</div>
      </div>
      <span class="tools">
        @if (loaded()) {
          <span class="cap nw">{{ sx.v14.installsCount(list().length) }}</span>
        }
        <span class="seg" role="group" [attr.aria-label]="sx.v14.installsAria">
          <button type="button" [attr.aria-pressed]="!all()" (click)="all.set(false)">{{ sx.v14.installsMain }}</button>
          <button type="button" [attr.aria-pressed]="all()" (click)="all.set(true)">{{ sx.v14.installsAll }}</button>
        </span>
      </span>
    </div>
    <div class="grp">
      @for (r of rows(); track r.key) {
        <div class="ir">
          <span class="it">{{ r.when }}</span>
          <div class="ic">
            <div class="xin">
              <span class="nm">{{ r.name }}</span>
              @if (r.version) {
                <span class="mono t3 ver">{{ r.version }}</span>
              }
            </div>
            <div class="is">{{ r.sub }}</div>
          </div>
          <span class="ip">
            @if (r.crashes; as c) {
              <span class="pill" [class.p-r]="c.after > c.before" [class.p-n]="c.after <= c.before" [title]="sx.v14.instCrashesTip">{{ sx.v14.instCrashes(c.before, c.after) }}</span>
            }
          </span>
        </div>
      } @empty {
        <div class="row"><span class="cap">{{ loaded() ? sx.v14.installsEmpty : sx.rp.loading }}</span></div>
      }
      @if (more(); as n) {
        <button type="button" class="row bt tight more" (click)="shown.set(shown() + PAGE)"><span class="cap">{{ sx.v14.installsMore(n) }}</span></button>
      } @else if (hidden(); as n) {
        <button type="button" class="row bt tight more" (click)="all.set(true)"><span class="cap">{{ sx.v14.installsHidden(n) }}</span></button>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .tools {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .nw {
      white-space: nowrap;
    }
    .grp {
      container-type: inline-size;
    }
    .ir {
      display: grid;
      grid-template-columns: 108px minmax(0, 1fr) auto;
      gap: 16px;
      padding: 10px 16px;
      align-items: start;
    }
    .ir + .ir {
      border-top: 1px solid var(--hair);
    }
    .it {
      font-size: 13px;
      color: var(--tx2);
      font-weight: 600;
      white-space: nowrap;
    }
    .ic {
      min-width: 0;
    }
    .xin {
      display: flex;
      align-items: baseline;
      gap: 8px;
      min-width: 0;
    }
    .nm {
      font-weight: 700;
      font-size: 13.5px;
      overflow-wrap: anywhere;
    }
    .ver {
      font-size: 11.5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }
    .is {
      font-size: 12.5px;
      color: var(--tx2);
      margin-top: 2px;
    }
    .ip {
      display: flex;
      padding-top: 1px;
    }
    .tight {
      min-height: 0;
    }
    .more {
      width: 100%;
      border: 0;
      border-top: 1px solid var(--hair);
      background: none;
      font: inherit;
      text-align: left;
      cursor: pointer;
      padding: 10px 16px;
      border-radius: 0 0 9px 9px;
      &:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 2px var(--ac);
      }
    }
    @media (hover: hover) and (pointer: fine) {
      .more:hover .cap {
        color: var(--tx2);
      }
    }
    @container (max-width: 560px) {
      .ir {
        grid-template-columns: minmax(0, 1fr);
        gap: 4px;
      }
    }
  `,
})
export class Installs {
  protected readonly s = inject(I18n).s;
  protected readonly PAGE = PAGE;

  /** null = relatório ainda não chegou; undefined (backend 1.3) = lista vazia. */
  readonly installs = input<PcInstall[] | null | undefined>(null);
  readonly events = input<PcEvent[]>([]);

  protected readonly all = signal(false);
  protected readonly shown = signal(PAGE);

  protected readonly loaded = computed(() => this.installs() !== null);
  protected readonly list = computed(() => {
    const l = this.installs() ?? [];
    return this.all() ? l : l.filter(isMainInstall);
  });
  protected readonly hidden = computed(() => (this.all() ? 0 : (this.installs() ?? []).length - this.list().length));
  protected readonly more = computed(() => Math.max(0, this.list().length - this.shown()));

  private readonly crashes = computed(() => crashTimes(this.events()));

  protected readonly rows = computed(() => {
    const s = this.s();
    const crashes = this.crashes();
    return this.list()
      .slice(0, this.shown())
      .map((i, n) => {
        const c = crashesAround(i, crashes);
        const cls = i.deviceClass ? s.v14.instClass[i.deviceClass] : '';
        const sub = [s.v14.instKind[i.kind] ?? i.kind, cls, i.publisher].filter(Boolean).join(' · ');
        return {
          key: `${i.kind}|${i.name}|${i.version ?? ''}|${n}`,
          when: i.dateOnly ? new Date(i.time).toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit' }) : evTime(i.time, s),
          name: i.name,
          version: i.version ?? '',
          sub,
          crashes: c.before + c.after > 0 ? c : null,
        };
      });
  });
}
