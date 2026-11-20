import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { I18n } from '../../../i18n';
import { PcIncident } from '../../../models';
import { TelemetryService } from '../../../telemetry.service';
import { Icon } from '../../../ui/icon';
import { clock } from '../../format';
import { copyText } from '../../helpers';
import { downloadBlob, fileStamp } from '../../reports';
import { incidentText, readingColumns } from './pc-view';

/**
 * "Últimas medições": tudo o que o Pitwall leu na última gravação antes da queda, em 3 colunas, com
 * [Copiar como texto] [Copiar para fórum] [Salvar .txt] [Abrir CSV]. "Copiado"/"Salvo" é troca de texto por 2 s.
 */
@Component({
  selector: 'pw-pc-readings',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = incident();
    <div class="sh">
      <div>
        <h2>{{ sx.rp.readingsTitle }}</h2>
        <div class="ht">{{ sx.rp.readingsHint(at()) }}</div>
      </div>
      <span class="acts" aria-live="polite">
        <button type="button" class="btn sm" (click)="copy('text')"><pw-icon [name]="done() === 'text' ? 'check' : 'copy'" [size]="14" />{{ done() === 'text' ? sx.copied : sx.rp.copyText }}</button>
        <button type="button" class="btn sm" (click)="copy('md')"><pw-icon [name]="done() === 'md' ? 'check' : 'chat'" [size]="14" />{{ done() === 'md' ? sx.copied : sx.rp.copyForum }}</button>
        <button type="button" class="btn sm" (click)="save()"><pw-icon [name]="done() === 'txt' ? 'check' : 'download'" [size]="14" />{{ done() === 'txt' ? sx.rp.saved : sx.rp.saveTxt }}</button>
        @if (d.csvFile && t.inHost) {
          <button type="button" class="btn sm" (click)="t.host({ type: 'openLogFile', file: d.csvFile })"><pw-icon name="file" [size]="14" />{{ sx.openCsv }}</button>
        }
      </span>
    </div>
    <div class="grp">
      <div class="cols">
        @for (c of cols(); track c.title) {
          <div class="col3">
            <div class="th">{{ c.title }}</div>
            <div class="dl">
              @for (x of c.cells; track x.id) {
                <span class="k" [title]="x.name">{{ x.name }}</span>
                <span class="v" [class]="'v lv-' + x.level">{{ x.value }}</span>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    // Os 4 botões ficam numa linha; sem espaço, descem inteiros para baixo do título
    .sh {
      flex-wrap: wrap;
      > div {
        flex: 1 1 240px;
      }
    }
    .acts {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .grp {
      container-type: inline-size;
    }
    .cols {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .col3 {
      padding: 12px 16px;
      min-width: 0;
      .th {
        margin-bottom: 6px;
      }
    }
    .col3 + .col3 {
      border-left: 1px solid var(--hair);
    }
    .dl {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 12px;
      font-size: 13px;
      span {
        padding: 5px 0;
        border-top: 1px solid var(--hair);
      }
      span:nth-child(-n + 2) {
        border-top: 0;
      }
    }
    .k {
      color: var(--tx2);
      /* quebra em vez de cortar ("Engasgos na par…" a 960) */
      overflow-wrap: anywhere;
      line-height: 1.35;
    }
    .v {
      text-align: right;
      font-weight: 600;
      white-space: nowrap;
    }
    .lv-warn {
      color: var(--y);
    }
    .lv-crit {
      color: var(--r);
    }
    .lv-none {
      color: var(--tx3);
      font-weight: 500;
    }
    @container (max-width: 620px) {
      .cols {
        grid-template-columns: minmax(0, 1fr);
      }
      .col3 + .col3 {
        border-left: 0;
        border-top: 1px solid var(--hair);
      }
    }
  `,
})
export class PcReadings {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  readonly incident = input.required<PcIncident>();

  protected readonly done = signal<'text' | 'md' | 'txt' | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  protected readonly at = computed(() => clock(new Date(this.incident().time), this.s(), true));
  protected readonly cols = computed(() => readingColumns(this.incident(), this.s(), this.t.settings()).filter((c) => c.cells.length));

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  private text(md: boolean) {
    return incidentText(this.incident(), this.s(), this.t.catalog(), this.t.settings(), md);
  }

  protected async copy(kind: 'text' | 'md') {
    if (await copyText(this.text(kind === 'md'))) this.flash(kind);
  }

  protected save() {
    const blob = new Blob([this.text(false).replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' });
    downloadBlob(`${this.s().rp.txtFile}_${fileStamp(this.incident().time)}.txt`, blob);
    this.flash('txt');
  }

  private flash(kind: 'text' | 'md' | 'txt') {
    this.done.set(kind);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.done.set(null), 2000);
  }
}
