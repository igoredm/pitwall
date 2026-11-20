import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { I18n } from '../../../i18n';
import { PcIncident, PcIncidentSummary } from '../../../models';
import { TelemetryService } from '../../../telemetry.service';
import { Icon } from '../../../ui/icon';
import { clock } from '../../format';
import { EventRow } from './event-row';
import { axisLabels, chartRows, incidentHead, saveNote } from './pc-view';

/**
 * Bloco "Última queda" (ou o incidente escolhido no histórico): cabeçalho, 6 gráficos dos 2 min antes com eixo comum,
 * a nota da última gravação e os eventos do Windows perto da hora. Os gráficos não animam (só trocam o desenho).
 */
@Component({
  selector: 'pw-pc-incident',
  imports: [Icon, EventRow],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let h = head();
    <div class="grp">
      <div class="row ihead">
        <span class="pw-ico"><pw-icon name="power" [size]="20" [stroke]="2" /></span>
        <div class="rl">
          <div class="ititle">{{ h.title }}</div>
          <div class="ht isub">
            @if (h.upFor) {
              {{ h.upFor }} ·
            }
            @if (h.exe) {
              {{ sx.rp.playing }} <span class="mono">{{ h.exe }}</span>
              @if (h.matchFor) {
                {{ h.matchFor }}
              }
            } @else {
              {{ sx.rp.outOfGame }}
            }
            @if (h.back) {
              · {{ h.back }}
            }
          </div>
          @if (h.hw) {
            <div class="ht t3 ihw">{{ h.hw }}</div>
          }
        </div>
        @if (!summary().seen) {
          <button type="button" class="btn qt sm" (click)="dismiss.emit()">{{ sx.rp.dismiss }}</button>
        }
      </div>

      <div class="charts">
        @if (detail(); as d) {
          @for (r of rows(); track r.id) {
            <div class="tbl-r crow" role="img" [attr.aria-label]="r.aria">
              <span class="cname">{{ r.name }}</span>
              <svg viewBox="0 0 100 32" preserveAspectRatio="none" class="spark" aria-hidden="true">
                @if (r.warnY != null) {
                  <line x1="0" x2="100" [attr.y1]="r.warnY" [attr.y2]="r.warnY" stroke="var(--y)" stroke-opacity=".75" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
                }
                <path [attr.d]="r.area" [attr.fill]="r.color" fill-opacity=".13" />
                <path [attr.d]="r.line" fill="none" [attr.stroke]="r.color" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
              </svg>
              <span class="cval">{{ r.minMax }}<br />{{ sx.rp.atEnd }} <b [class]="'lv-' + r.endLevel">{{ r.end }}</b></span>
            </div>
          } @empty {
            <div class="row"><span class="ht m0">{{ sx.rp.noSeries }}</span></div>
          }
          @if (rows().length) {
            <div class="tbl-r crow axisrow" aria-hidden="true">
              <span></span>
              <span class="axis">
                @for (a of axis(); track $index) {
                  <span [class.end]="$last">{{ a }}</span>
                }
              </span>
              <span></span>
            </div>
          }
        } @else {
          @for (i of [0, 1, 2]; track i) {
            <div class="tbl-r crow"><span class="skel" style="width: 80px; height: 12px"></span><span class="skel" style="height: 24px"></span><span></span></div>
          }
        }
      </div>
      <div class="row bt tight"><span class="cap">{{ note() }}</span></div>
      <div class="nearh"><div class="th">{{ near().title }}</div></div>
      @for (e of near().events; track e.time + e.eventId) {
        <pw-event-row [event]="e" [near]="true" />
      } @empty {
        <div class="row tight"><span class="cap">{{ sx.rp.eventsNearNone }}</span></div>
      }
    </div>
  `,
  styles: `
    .grp {
      container-type: inline-size;
    }
    .ihead {
      align-items: flex-start;
      padding: 16px;
    }
    .pw-ico {
      color: var(--r);
      display: flex;
      padding-top: 2px;
    }
    .ititle {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.01em;
    }
    .isub {
      font-size: 13px;
    }
    .ihw {
      margin-top: 6px;
    }
    .charts {
      border-top: 1px solid var(--hair);
    }
    .crow {
      grid-template-columns: 112px minmax(0, 1fr) 132px;
      min-height: 50px;
    }
    .cname {
      font-weight: 600;
      font-size: 13px;
    }
    .spark {
      display: block;
      width: 100%;
      height: 34px;
      overflow: visible;
    }
    .cval {
      text-align: right;
      font-size: 12px;
      color: var(--tx2);
      line-height: 1.35;
      white-space: nowrap;
      b {
        color: var(--tx);
        font-size: 13.5px;
      }
      b.lv-warn {
        color: var(--y);
      }
      b.lv-crit {
        color: var(--r);
      }
    }
    .axisrow {
      min-height: 30px;
    }
    .axis {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--tx3);
      font-weight: 600;
      .end {
        color: var(--tx2);
      }
    }
    .tight {
      min-height: 0;
    }
    .m0 {
      margin: 0;
    }
    .nearh {
      border-top: 1px solid var(--hair);
      padding: 12px 16px 4px;
    }
    @container (max-width: 560px) {
      .crow {
        grid-template-columns: 92px minmax(0, 1fr) 112px;
      }
    }
  `,
})
export class PcIncidentView {
  private readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  readonly summary = input.required<PcIncidentSummary>();
  /** Detalhe (getPcIncident); null enquanto não chega. */
  readonly detail = input<PcIncident | null>(null);
  readonly dismiss = output<void>();

  protected readonly head = computed(() => incidentHead(this.summary(), this.s(), this.t.catalog()));
  protected readonly rows = computed(() => {
    const d = this.detail();
    return d ? chartRows(d, this.s(), this.t.settings()) : [];
  });
  protected readonly axis = computed(() => {
    const d = this.detail();
    return d ? axisLabels(d, this.s()) : [];
  });
  protected readonly note = computed(() => saveNote(this.summary(), this.s()));

  /** Eventos de time − 10 min até time + 10 min (o backend já anexa só os de perto). */
  protected readonly near = computed(() => {
    const s = this.s();
    const inc = this.summary();
    const t = new Date(inc.time).getTime();
    return {
      title: s.rp.eventsNear(clock(t - 600_000, s), clock(t + 600_000, s)),
      events: [...inc.events].sort((a, b) => a.time.localeCompare(b.time)),
    };
  });
}
