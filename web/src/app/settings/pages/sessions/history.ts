import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../../i18n';
import { GameSession } from '../../../models';
import { TelemetryService } from '../../../telemetry.service';
import { Icon } from '../../../ui/icon';
import { level } from '../../../widget/metric-views';
import { fmtDuration } from '../../format';
import { shortDayTime } from '../../reports';
import { crashed, durationSec, sameStart } from './session-util';

/**
 * Histórico (#history): caixa de seleção para comparar (a terceira desmarca a mais antiga), jogo com pílula
 * "PC desligou", números da partida, [Compartilhar] por linha. Clicar no jogo abre a partida em "Última partida".
 */
@Component({
  selector: 'pw-session-history',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    <div class="sh">
      <div class="min0">
        <h2>{{ sx.history }}</h2>
        <div class="ht">{{ sx.historyHint(keepDays()) }}</div>
      </div>
      <span class="acts">
        @if (selection().length === 2) {
          <button type="button" class="btn sm pri" (click)="compare.emit()">{{ sx.rp.compareTwo }}</button>
        } @else {
          <span class="cap nw">{{ sx.rp.selCount(selection().length) }}</span>
        }
        <select class="in" [attr.aria-label]="sx.gameFilter" (change)="filter.emit($any($event.target).value)">
          <option value="" [selected]="!exe()">{{ sx.allGames }}</option>
          @for (g of games(); track g) {
            <option [value]="g" [selected]="exe() === g">{{ g }}</option>
          }
        </select>
      </span>
    </div>
    <div class="grp hgrp">
      <div class="tbl-r th hcols">
        <span></span><span>{{ sx.colGame }}</span><span>{{ sx.colWhen }}</span><span>{{ sx.colDur }}</span><span>{{ sx.colAvgFps }}</span><span class="c-low">{{ sx.colLow1 }}</span><span class="c-st">{{ sx.rp.colStutters }}</span><span>{{ sx.colPeakHot2 }}</span><span></span>
      </div>
      @for (r of rows(); track r.key) {
        <div class="tbl-r hcols hrow" [class.sel]="r.checked" [class.open]="r.open">
          <button type="button" class="cb" role="checkbox" [attr.aria-checked]="r.checked" [attr.aria-label]="sx.rp.cbLabel(r.x.exe, r.when)" (click)="toggle.emit(r.x.start)">
            @if (r.checked) {
              <pw-icon name="check" [size]="12" [stroke]="2.6" />
            }
          </button>
          <button type="button" class="hexe" [attr.aria-label]="sx.rp.openRow(r.x.exe, r.when)" [attr.aria-current]="r.open ? 'true' : null" (click)="open.emit(r.x)">
            <span class="mono ell" [title]="r.x.exe">{{ r.x.exe }}</span>
            @if (r.crashed) {
              <span class="pill p-r">{{ sx.pcShutDown }}</span>
            } @else if (r.live) {
              <span class="pill p-g">{{ sx.inProgress }}</span>
            } @else if (r.x.gameExit) {
              <span class="pill p-y">{{ r.x.gameExit === 'crash' ? sx.v13.pillCrash : sx.v13.pillHang }}</span>
            }
          </button>
          <span class="t2 sm13 nw">{{ r.when }}</span>
          <span class="nw">{{ r.dur }}</span>
          <span>{{ r.avg }}</span>
          <span class="c-low">{{ r.low }}</span>
          <span class="c-st">{{ r.st }}</span>
          <span [class]="'lv-' + r.hotLevel">{{ r.hot }}</span>
          @if (r.live) {
            <span></span>
          } @else {
            <button type="button" class="btn qt sm ib" [attr.aria-label]="sx.rp.shareRow(r.x.exe, r.when)" [title]="sx.rp.share" (click)="share.emit(r.x)"><pw-icon name="share" [size]="14" /></button>
          }
        </div>
      } @empty {
        <div class="empty"><div class="ht">{{ loading() ? sx.loading : sx.historyEmptyGame }}</div></div>
      }
      @if (total() > items().length) {
        <div class="row bt tight more">
          <span class="cap">{{ sx.showing(items().length, total()) }}</span>
          <button type="button" class="btn sm" [disabled]="loading()" (click)="more.emit()">{{ sx.showMore }}</button>
        </div>
      } @else if (items().length > 5) {
        <div class="row bt tight more"><span class="cap">{{ sx.showing(items().length, total()) }}</span></div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .min0 {
      min-width: 0;
    }
    .acts {
      display: flex;
      gap: 10px;
      align-items: center;
      flex-shrink: 0;
    }
    .nw {
      white-space: nowrap;
    }
    .sm13 {
      font-size: 13px;
    }
    .hgrp {
      container-type: inline-size;
    }
    .hcols {
      grid-template-columns: 28px minmax(0, 1.3fr) 128px 64px 70px 60px 70px 76px 28px;
    }
    .hrow {
      font-size: 13.5px;
      &.sel {
        background: var(--acs);
      }
      &.open .hexe .mono {
        font-weight: 700;
      }
    }
    @media (hover: hover) and (pointer: fine) {
      .hrow:hover:not(.sel) {
        background: var(--sf2);
      }
    }
    .cb {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      border: 1.5px solid var(--bd);
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--sf2);
      color: #fff;
      padding: 0;
      cursor: pointer;
      &[aria-checked='true'] {
        background: var(--ac);
        border-color: var(--ac);
      }
      &:focus-visible {
        outline: 2px solid var(--ac);
        outline-offset: 2px;
      }
    }
    .hexe {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      border: 0;
      background: none;
      padding: 0;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
      min-height: 32px;
      .mono {
        font-size: 13px;
        min-width: 0;
      }
      .pill {
        flex-shrink: 0;
      }
      &:focus-visible {
        outline: 2px solid var(--ac);
        outline-offset: 2px;
        border-radius: 4px;
      }
    }
    @media (hover: hover) and (pointer: fine) {
      .hexe:hover .mono {
        text-decoration: underline;
      }
    }
    .ib {
      padding: 0 6px;
      justify-self: end;
    }
    .lv-warn {
      color: var(--y);
    }
    .lv-crit {
      color: var(--r);
    }
    .more {
      justify-content: space-between;
    }
    .tight {
      min-height: 0;
    }
    @container (max-width: 700px) {
      .hcols {
        grid-template-columns: 24px minmax(0, 1.3fr) 120px 56px 52px 64px 28px;
        gap: 8px;
      }
      .c-low,
      .c-st {
        display: none;
      }
    }
  `,
})
export class SessionHistory {
  private readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  readonly items = input<GameSession[]>([]);
  readonly total = input(0);
  readonly loading = input(false);
  /** starts marcados para comparar (no máximo 2). */
  readonly selection = input<string[]>([]);
  /** start da partida aberta em "Última partida". */
  readonly openStart = input<string | null>(null);
  readonly liveStart = input<string | null>(null);
  readonly games = input<string[]>([]);
  readonly exe = input('');
  readonly keepDays = input(30);
  readonly toggle = output<string>();
  readonly open = output<GameSession>();
  readonly share = output<GameSession>();
  readonly more = output<void>();
  readonly filter = output<string>();
  readonly compare = output<void>();

  protected readonly rows = computed(() => {
    const s = this.s();
    const hot = this.t.settings().get('gpu.hotspot');
    const sel = this.selection();
    const live = this.liveStart();
    return this.items().map((x) => {
      const isLive = !!live && x.start === live && !x.end;
      const d = durationSec(x, isLive);
      return {
        key: x.start + x.exe,
        x,
        live: isLive,
        crashed: crashed(x, isLive),
        checked: sel.some((st) => sameStart(st, x.start)),
        open: x.start === this.openStart(),
        when: shortDayTime(x.start, s),
        dur: isLive ? '—' : d > 0 ? fmtDuration(d) : '—',
        avg: x.avgFps != null ? String(Math.round(x.avgFps)) : '—',
        low: x.low1 != null ? String(Math.round(x.low1)) : '—',
        st: x.stutters != null ? String(x.stutters) : '—',
        hot: x.peakHotspot != null ? `${Math.round(x.peakHotspot)} °C` : '—',
        hotLevel: level(x.peakHotspot ?? null, hot?.warn, hot?.crit),
      };
    });
  });
}
