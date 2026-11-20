import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '../../i18n';
import { AppConfig } from '../../models';
import { TelemetryService, hashParams } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { clock } from '../format';
import { PageHead } from '../page-head';
import { evTime, fmtUp, setHashParams, shortCode } from '../reports';
import { SettingsCtx } from '../settings-ctx';
import { EventRow } from './health/event-row';
import { PcIncidentView } from './health/incident';
import { eventPills } from './health/pc-view';
import { PcReadings } from './health/readings';

/**
 * PC › Relatório do PC (docs/design-notes.md › v1.2 › 2): "Agora", a última queda (ou a escolhida no histórico) com os
 * 2 min antes, as últimas medições, os eventos do Windows dos últimos 30 dias e o histórico de incidentes.
 * Âncoras: latest, events, history. ?incident=<id> no hash abre um incidente direto (link de Relatórios de jogo).
 */
@Component({
  selector: 'pw-page-health',
  imports: [PageHead, Icon, EventRow, PcIncidentView, PcReadings],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let r = t.pcReport();
    <pw-page-head page="health" [intro]="sx.rp.healthIntro" />

    <!-- ================================================= agora -->
    <div class="grp now">
      <div class="row tight">
        <i class="dot" [style.background]="on() ? 'var(--g)' : 'var(--tx3)'"></i>
        <div class="rl">
          @if (r) {
            <b>{{ sx.rp.nowUp(up().dur) }}</b>
            <span class="ht inl">{{ sx.rp.nowSince(up().since) }}@if (on()) {
                · {{ sx.rp.nowBuffer }}
              }</span>
          } @else {
            <span class="skel" style="width: 260px; height: 14px"></span>
          }
        </div>
        @if (on()) {
          <a class="lnk" href="#/settings/features" (click)="$event.preventDefault(); ctx.go('features', 'crashReport')">{{ sx.pages.features }}</a>
        }
      </div>
      @if (!on()) {
        <div class="row bt">
          <div class="rl">
            <div class="lb">{{ sx.rp.offTitle }}</div>
            <div class="ht">{{ sx.rp.offHint }}</div>
          </div>
          <button type="button" class="btn sm pri" (click)="ctx.update(turnOn)">{{ sx.turnOn }}</button>
        </div>
      }
    </div>

    <!-- ================================================= última queda -->
    <section class="sec first" data-anchor="latest">
      <div class="sh"><h2>{{ sx.rp.latest }}</h2></div>
      @if (!r) {
        <div class="grp"><div class="row"><span class="cap">{{ sx.rp.loading }}</span></div></div>
      } @else if (selected(); as inc) {
        <pw-pc-incident [summary]="inc" [detail]="detail()" (dismiss)="dismiss(inc.id)" />
      } @else if (!on()) {
        <div class="grp">
          <div class="row">
            <div class="rl">
              <div class="lb t2">{{ sx.rp.offLatestTitle }}</div>
              <div class="ht">{{ sx.rp.offLatestBody }}</div>
            </div>
          </div>
        </div>
      } @else {
        <div class="grp">
          <div class="empty">
            <span class="ok"><pw-icon name="check" [size]="22" [stroke]="2" /></span>
            <div class="et">{{ sx.rp.emptyTitle }}</div>
            <div class="ht eb">{{ sx.rp.emptyBody }}</div>
          </div>
        </div>
      }
    </section>

    @if (detail(); as d) {
      @if (d.last.length) {
        <section class="sec">
          <pw-pc-readings [incident]="d" />
        </section>
      }
    }

    <!-- ================================================= eventos -->
    <section class="sec" data-anchor="events">
      <div class="sh">
        <div>
          <h2>{{ sx.rp.eventsTitle }}</h2>
          <div class="ht">{{ sx.rp.eventsHint }}</div>
        </div>
        @if (r) {
          <span class="cap nw">{{ sx.rp.eventsCount(r.events.length) }}</span>
        }
      </div>
      <div class="grp evgrp">
        @for (e of r?.events ?? []; track e.time + e.eventId + $index) {
          <pw-event-row [event]="e" />
        } @empty {
          <div class="row"><span class="cap">{{ r ? sx.rp.eventsEmpty : sx.rp.loading }}</span></div>
        }
      </div>
    </section>

    <!-- ================================================= histórico -->
    @if (r?.incidents?.length) {
      <section class="sec" data-anchor="history">
        <div class="sh"><h2>{{ sx.rp.incHistory }}</h2></div>
        <div class="grp hgrp">
          <div class="tbl-r th hcols">
            <span>{{ sx.rp.hWhen }}</span><span>{{ sx.rp.hWhat }}</span><span class="c-up">{{ sx.rp.hUp }}</span><span>{{ sx.rp.hGame }}</span><span>{{ sx.rp.hEvents }}</span><span></span>
          </div>
          @for (h of history(); track h.id) {
            <button type="button" class="tbl-r hcols hrow" [class.sel]="h.selected" [attr.aria-current]="h.selected ? 'true' : null" (click)="pick(h.id)">
              <span class="t2 sm13 nw">{{ h.when }}</span>
              <span class="what ell">{{ h.what }}@if (h.code) {
                  <span class="mono t3 code">{{ h.code }}</span>
                }</span>
              <span class="c-up nw">{{ h.up }}</span>
              <span class="ell">
                @if (h.exe) {
                  <span class="mono" [title]="h.exe">{{ h.exe }}</span>
                } @else {
                  <span class="t3">{{ sx.rp.noGame }}</span>
                }
              </span>
              <span class="pills">
                @for (p of h.pills; track p.text) {
                  <span class="pill" [class.p-r]="p.red" [class.p-n]="!p.red">{{ p.text }}</span>
                }
              </span>
              <span class="t3 chev"><pw-icon name="chevron" [size]="15" [stroke]="2" /></span>
            </button>
          }
          <div class="row bt tight"><span class="cap">{{ sx.rp.keeps20 }}</span></div>
        </div>
      </section>
    }
  `,
  styles: `
    .now {
      margin-top: 20px;
      .dot {
        margin: 0;
      }
      b {
        font-weight: 700;
      }
    }
    .inl {
      display: inline;
      margin: 0 0 0 8px;
    }
    .tight {
      min-height: 0;
    }
    .first {
      margin-top: 24px;
    }
    .empty {
      gap: 6px;
      padding: 24px 20px;
    }
    .ok {
      color: var(--g);
      display: flex;
    }
    .et {
      font-size: 15px;
      font-weight: 700;
    }
    .empty .eb {
      font-size: 13px;
      max-width: 60ch;
    }
    .nw {
      white-space: nowrap;
    }
    .sm13 {
      font-size: 13px;
    }
    .evgrp,
    .hgrp {
      container-type: inline-size;
    }
    .hcols {
      grid-template-columns: 112px minmax(0, 1fr) 92px 150px 200px 20px;
    }
    .hrow {
      width: 100%;
      border: 0;
      background: none;
      text-align: left;
      font: inherit;
      color: inherit;
      cursor: pointer;
      &.sel {
        background: var(--acs);
      }
      &:focus-visible {
        outline: none;
        box-shadow: inset 0 0 0 2px var(--ac);
      }
    }
    @media (hover: hover) and (pointer: fine) {
      .hrow:hover:not(.sel) {
        background: var(--sf2);
      }
    }
    .what {
      font-weight: 600;
    }
    .code {
      font-size: 12px;
      margin-left: 6px;
    }
    .pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      padding: 6px 0;
    }
    .chev {
      display: flex;
    }
    @container (max-width: 700px) {
      .hcols {
        grid-template-columns: 112px minmax(0, 1fr) 120px 150px 16px;
        gap: 10px;
      }
      .c-up {
        display: none;
      }
    }
  `,
})
export class HealthPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);

  /** Incidente escolhido no histórico (null = o mais novo). */
  private readonly picked = signal<string | null>(hashParams().get('incident'));
  /** Incidentes não vistos que apareceram nesta visita: marcados como vistos ao sair da página. */
  private readonly viewed = new Set<string>();
  /** Relógio de 30 s para o "ligado há". */
  private readonly now = signal(Date.now());

  protected readonly turnOn = (c: AppConfig) => (c.features = { gameSuggestions: true, sessionPeaks: true, clockReason: true, ...c.features, crashReport: true });

  /** Buffer ligado: recurso ligado no config e o backend confirma. */
  protected readonly on = computed(() => this.ctx.draft()?.features?.crashReport !== false && this.t.pcReport()?.ringActive !== false);

  protected readonly up = computed(() => {
    const r = this.t.pcReport();
    const s = this.s();
    if (!r) return { dur: '', since: '' };
    const sec = r.uptimeSec + (this.now() - this.t.pcReportAt()) / 1000;
    return { dur: fmtUp(sec), since: clock(new Date(r.bootTime), s) };
  });

  protected readonly selected = computed(() => {
    const list = this.t.pcReport()?.incidents ?? [];
    const id = this.picked();
    const chosen = id ? list.find((x) => x.id === id) : undefined;
    // Desligado: a última queda vira o aviso de "sem buffer"; só mostra se a pessoa escolheu uma no histórico
    if (!chosen && !this.on()) return null;
    return chosen ?? list[0] ?? null;
  });

  protected readonly detail = computed(() => {
    const d = this.t.pcIncident();
    return d && d.id === this.selected()?.id ? d : null;
  });

  protected readonly history = computed(() => {
    const s = this.s();
    const sel = this.selected()?.id;
    return (this.t.pcReport()?.incidents ?? []).map((x) => {
      const bug = x.kind === 'bugcheck' ? x.events.find((e) => e.kind === 'bugcheck' && e.code) : undefined;
      return {
        id: x.id,
        selected: x.id === sel,
        when: evTime(x.time, s).replace(' ', ', '),
        what: x.kind === 'bugcheck' ? s.rp.whatBugcheck : s.rp.whatAbrupt,
        code: bug ? shortCode(bug.code) : '',
        up: x.uptimeSec != null ? fmtUp(x.uptimeSec) : '—',
        exe: x.exe ?? null,
        pills: eventPills(x, s),
      };
    });
  });

  constructor() {
    // Pede ao abrir e de novo a cada reconexão (com link direto, a página pode abrir antes do socket)
    effect(() => {
      if (this.t.connected()) untracked(() => this.t.send({ type: 'getPcReport' }));
    });
    // Pede o detalhe quando o incidente mostrado muda
    effect(() => {
      const inc = this.selected();
      if (!inc || !this.t.connected()) return;
      if (!inc.seen) this.viewed.add(inc.id);
      untracked(() => {
        if (this.t.pcIncident()?.id !== inc.id) this.t.send({ type: 'getPcIncident', id: inc.id });
      });
    });
    const tick = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(tick);
      setHashParams({ incident: null });
      // Visto ao sair: o ponto vermelho e o banner somem depois que a pessoa olhou o relatório
      const pending = this.t.pcReport()?.incidents.filter((x) => !x.seen && this.viewed.has(x.id)) ?? [];
      for (const x of pending) this.t.send({ type: 'dismissPcIncident', id: x.id });
    });
  }

  protected pick(id: string) {
    this.picked.set(id);
    setHashParams({ incident: null });
    this.ctx.go('health', 'latest');
  }

  protected dismiss(id: string) {
    this.viewed.delete(id);
    this.t.send({ type: 'dismissPcIncident', id });
  }
}
