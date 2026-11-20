import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '../../../i18n';
import { LOG_KEEP_DAYS, LogKeepDays, LogStats } from '../../../models';
import { TelemetryService } from '../../../telemetry.service';
import { Icon } from '../../../ui/icon';
import { fmtBytes, fmtMb, fmtMs } from '../../format';
import { SettingsCtx } from '../../settings-ctx';

const CAPS = [500, 1024, 2048, 5120, 10240];
const LOG_INTERVALS = [500, 1000, 2000, 5000];

/** Mudança de retenção esperando "Aplicar" (diminuir apaga arquivos: o backend limpa ~5 s depois de salvar). */
interface Pending {
  kind: 'keep' | 'cap';
  value: number;
  prev: number;
  stats: LogStats | null;
}

/** Gravação em CSV (#csv): pasta, intervalo, retenção com prévia do que vai ser apagado e uso da pasta. Igual à 1.0. */
@Component({
  selector: 'pw-csv-recording',
  imports: [Icon, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    @if (d) {
  <section class="sec" data-anchor="csv">
    <div class="sh">
      <div>
        <h2>{{ sx.csvTitle }}</h2>
        <div class="ht">{{ sx.csvHint }}</div>
      </div>
    </div>
    <div class="grp">
      <div class="row">
        <div class="rl">
          <div class="lb" id="l-log">{{ sx.logEnable2 }}</div>
          <div class="ht">{{ sx.logEnableHint2 }}</div>
        </div>
        <button type="button" class="sw" role="switch" aria-labelledby="l-log" [attr.aria-checked]="d.log.enabled" (click)="ctx.update(flipLog)"></button>
      </div>
      @if (t.inHost) {
        <div class="row">
          <div class="rl">
            <div class="lb">{{ sx.latestTitle }}</div>
            <div class="ht">{{ sx.latestHint }}</div>
          </div>
          <button type="button" class="btn sm" (click)="t.host({ type: 'openLatestCsv' })"><pw-icon name="file" [size]="14" />{{ sx.latestBtn }}</button>
        </div>
      }
      <div class="row">
        <div class="rl">
          <div class="lb">{{ sx.logFolder2 }}</div>
          @if (t.inHost) {
            <div class="mono t2 folder ell" [title]="d.log.folder">{{ d.log.folder }}</div>
          } @else {
            <input class="in mono folder-in" [attr.aria-label]="sx.logFolder2" [value]="d.log.folder" (change)="setFolder($any($event.target).value)" />
          }
        </div>
        @if (t.inHost) {
          <button type="button" class="btn sm" (click)="t.host({ type: 'pickFolder' })">{{ sx.change }}</button>
          <button type="button" class="btn sm qt" (click)="t.host({ type: 'openLogFolder' })"><pw-icon name="folder" [size]="14" />{{ sx.open }}</button>
        }
      </div>
      <div class="row">
        <div class="rl">
          <div class="lb">{{ sx.interval }}</div>
          <div class="ht">{{ sx.intervalHint }}</div>
        </div>
        <span class="seg" role="group" [attr.aria-label]="sx.interval">
          @for (i of intervals; track i) {
            <button type="button" [attr.aria-pressed]="d.log.intervalMs === i" (click)="setInterval(i)">{{ ms(i) }}</button>
          }
        </span>
      </div>
      <div class="row top" data-anchor="keep">
        <div class="rl">
          <div class="lb">{{ sx.keepFor }}</div>
          <div class="ht">{{ sx.keepForHint }}</div>
        </div>
        <span class="seg" role="group" [attr.aria-label]="sx.keepFor">
          @for (k of keepOptions; track k) {
            <button type="button" [attr.aria-pressed]="keepShown() === k" (click)="chooseKeep(k)">{{ sx.keepLabel(k) }}</button>
          }
        </span>
      </div>
      @if (pending()?.kind === 'keep') {
        <ng-container *ngTemplateOutlet="previewNote" />
      }
      <div class="row top" data-anchor="cap">
        <div class="rl">
          <div class="lb" id="l-cap">{{ sx.capTitle }}</div>
          <div class="ht">{{ sx.capHint }}</div>
        </div>
        @if (capShown()) {
          <select class="in" [attr.aria-label]="sx.capSize" (change)="chooseCap(+$any($event.target).value)">
            @for (c of caps; track c) {
              <option [value]="c" [selected]="capShown() === c">{{ mb(c) }}</option>
            }
            @if (!caps.includes(capShown())) {
              <option [value]="capShown()" selected>{{ mb(capShown()) }}</option>
            }
          </select>
        }
        <button type="button" class="sw" role="switch" aria-labelledby="l-cap" [attr.aria-checked]="capShown() > 0" (click)="chooseCap(capShown() ? 0 : 2048)"></button>
      </div>
      @if (pending()?.kind === 'cap') {
        <ng-container *ngTemplateOutlet="previewNote" />
      }
      <div class="row col usage">
        @if (usage(); as u) {
          <div class="ul">
            <span><b>{{ u.used }}</b><span class="t2"> {{ u.rest }}</span></span>
            @if (u.after) {
              <span class="cap">{{ sx.usageAfter }}</span>
            }
          </div>
          <span class="bar ubar" role="img" [attr.aria-label]="u.aria">
            <span [style.width.%]="u.keepPct" style="background: var(--ac)"></span>
            <span class="hatch" [style.width.%]="u.gonePct"></span>
          </span>
        } @else {
          <span class="cap">{{ t.logStats() ? sx.usageEmpty : sx.usageLoading }}</span>
        }
        @if (t.log(); as l) {
          <span class="cap">
            {{ sx.currentFile }}
            @if (t.inHost) {
              <button type="button" class="lnk mono" (click)="t.host({ type: 'openLogFile' })">{{ l.file }}</button>
            } @else {
              <span class="mono">{{ l.file }}</span>
            }
            · {{ bytes(l.size) }}
          </span>
        }
      </div>
    </div>
  </section>

  <ng-template #previewNote>
    @let p = pending()!;
    <div class="pnote">
      <div class="note n-y mid" role="status" aria-live="polite">
        <span class="ico"><pw-icon name="warn" [size]="16" [stroke]="2" /></span>
        <div class="rl">
          @if (p.stats; as st) {
            {{ p.kind === 'keep' ? sx.previewKeep(sx.keepLabel(p.value).toLowerCase()) : sx.previewCap(mb(p.value)) }}<b>{{ sx.previewAmount(sx.files(st.wouldDeleteFiles), bytes(st.wouldDeleteBytes)) }}</b>{{ sx.previewWhen }}
            @if (p.kind === 'keep' && p.value) {
              {{ sx.previewHistory(sx.lastDays(p.value)) }}
            }
          } @else {
            {{ sx.previewChecking }}
          }
        </div>
        <button type="button" class="btn sm" (click)="revert()">
          <pw-icon name="undo" [size]="14" [stroke]="2" />{{ p.kind === 'keep' ? sx.revertTo(sx.keepLabel(p.prev).toLowerCase()) : p.prev ? sx.revertTo(mb(p.prev)) : sx.revertCapOff }}
        </button>
        <button type="button" class="btn sm pri" [disabled]="!p.stats" (click)="apply()">{{ sx.applyChange }}</button>
      </div>
    </div>
  </ng-template>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .folder {
      margin-top: 4px;
    }
    .folder-in {
      width: 100%;
      margin-top: 6px;
    }
    .pnote {
      padding: 0 16px 14px;
    }
    .usage {
      gap: 8px;
    }
    .ul {
      display: flex;
      justify-content: space-between;
      font-size: 13px;
    }
    .ubar {
      height: 8px;
    }
  `,
})
export class CsvRecording {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  protected readonly keepOptions = LOG_KEEP_DAYS;
  protected readonly caps = CAPS;
  protected readonly intervals = LOG_INTERVALS;
  protected readonly flipLog = (c: { log: { enabled: boolean } }) => (c.log.enabled = !c.log.enabled);
  protected readonly pending = signal<Pending | null>(null);
  private refreshTimer?: ReturnType<typeof setTimeout>;

  // ------------------------------------------------------------------ CSV
  protected readonly keepShown = computed(() => {
    const p = this.pending();
    return p?.kind === 'keep' ? p.value : (this.ctx.draft()?.log.keepDays ?? 30);
  });
  protected readonly capShown = computed(() => {
    const p = this.pending();
    return p?.kind === 'cap' ? p.value : (this.ctx.draft()?.log.maxTotalMb ?? 0);
  });

  protected readonly usage = computed(() => {
    const st = this.t.logStats();
    const s = this.s();
    if (!st || !st.files) return null;
    const p = this.pending();
    const gone = p?.stats ? p.stats.wouldDeleteBytes : 0;
    const goneFiles = p?.stats ? p.stats.wouldDeleteFiles : 0;
    const capMb = this.capShown();
    const cap = capMb ? capMb * 1024 * 1024 : 0;
    const scale = Math.max(cap, st.totalBytes) || 1;
    const after = !!p?.stats;
    const kept = st.totalBytes - gone;
    const oldest = st.oldest ? new Date(st.oldest).toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit' }) : null;
    return {
      after,
      used: fmtBytes(after ? kept : st.totalBytes, s),
      rest: [cap ? s.usageOf(fmtMb(capMb)) : '', s.files(after ? st.files - goneFiles : st.files), !after && oldest ? s.usageOldest(oldest) : ''].filter(Boolean).join(' · '),
      keepPct: (kept / scale) * 100,
      gonePct: (gone / scale) * 100,
      aria: s.usageAria(fmtBytes(st.totalBytes, s), gone ? fmtBytes(gone, s) : ''),
    };
  });

  protected ms(v: number) {
    return fmtMs(v, this.s(), true);
  }

  protected mb(v: number) {
    return fmtMb(v);
  }

  protected bytes(v: number) {
    return fmtBytes(v, this.s());
  }

  protected setFolder(v: string) {
    this.ctx.update((c) => (c.log.folder = v));
  }

  protected setInterval(v: number) {
    this.ctx.update((c) => (c.log.intervalMs = v));
  }

  /** Diminuir o prazo pede confirmação com a prévia; aumentar (ou "Para sempre") vale na hora. */
  protected chooseKeep(k: LogKeepDays) {
    const cur = this.ctx.draft()?.log.keepDays ?? 30;
    this.pending.set(null);
    if (k === cur) return;
    const lowering = k !== 0 && (cur === 0 || k < cur);
    if (!lowering) {
      this.ctx.update((c) => (c.log.keepDays = k));
      this.refreshSoon();
      return;
    }
    this.preview({ kind: 'keep', value: k, prev: cur, stats: null }, { keepDays: k });
  }

  /** Ligar o teto ou baixar o valor pede confirmação; desligar ou subir vale na hora. */
  protected chooseCap(mb: number) {
    const cur = this.ctx.draft()?.log.maxTotalMb ?? 0;
    this.pending.set(null);
    if (mb === cur) return;
    const lowering = mb !== 0 && (cur === 0 || mb < cur);
    if (!lowering) {
      this.ctx.update((c) => (c.log.maxTotalMb = mb));
      this.refreshSoon();
      return;
    }
    this.preview({ kind: 'cap', value: mb, prev: cur, stats: null }, { maxTotalMb: mb });
  }

  private preview(p: Pending, q: { keepDays?: LogKeepDays; maxTotalMb?: number }) {
    this.pending.set(p);
    this.t.requestLogStats(q).then((stats) => {
      const cur = this.pending();
      if (cur?.kind !== p.kind || cur.value !== p.value) return;
      // Nada a apagar: aplica direto, sem nota
      if (!stats.wouldDeleteFiles) {
        this.pending.set({ ...cur, stats });
        this.apply();
      } else this.pending.set({ ...cur, stats });
    });
  }

  protected apply() {
    const p = this.pending();
    if (!p) return;
    this.ctx.update((c) => {
      if (p.kind === 'keep') c.log.keepDays = p.value as LogKeepDays;
      else c.log.maxTotalMb = p.value;
    });
    this.pending.set(null);
    this.refreshSoon();
  }

  protected revert() {
    this.pending.set(null);
  }

  /** O backend limpa ~5 s depois de salvar: confere o uso de novo depois disso. */
  private refreshSoon() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => this.t.requestLogStats(), 6500);
  }

  constructor() {
    this.t.requestLogStats();
    // Recarrega o uso quando a gravação liga/desliga ou a pasta muda
    effect(() => {
      const d = this.ctx.draft();
      void d?.log.folder;
      void d?.log.enabled;
      untracked(() => this.t.requestLogStats());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.refreshTimer));
  }
}
