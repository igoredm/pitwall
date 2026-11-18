import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '../../i18n';
import { MetricDef, MetricGroup, MetricSetting } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { LIMITS, NOT_COUNTED, groupLabel, unitLabel } from '../../widget/metric-views';
import { SettingsNav } from '../nav';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';

type Tab = MetricGroup | 'battery';
const GROUPS: MetricGroup[] = ['gpu', 'cpu', 'ram', 'fps', 'other'];
const TABS: Tab[] = [...GROUPS, 'battery'];

interface Row {
  def: MetricDef;
  s: MetricSetting;
}

/** Widget › Métricas: abas por grupo (a aba fica na URL), tabela com prioridade por arrasto e a aba Bateria. */
@Component({
  selector: 'pw-page-metrics',
  imports: [PageHead, Icon, CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="metrics">
      <button type="button" class="btn sm" (click)="ctx.openPreview()">{{ sx.previewBtn }}</button>
    </pw-page-head>

    @if (d) {
      <div class="tabsrow">
        <span class="seg" role="tablist" [attr.aria-label]="sx.metricTabs" (keydown)="tabKeys($event)">
          @for (k of tabs; track k) {
            <button
              type="button"
              role="tab"
              [id]="'tab-' + k"
              [attr.aria-selected]="tab() === k"
              [attr.aria-controls]="'panel-metrics'"
              [attr.tabindex]="tab() === k ? 0 : -1"
              (click)="setTab(k)"
            >
              {{ tabName(k) }}<span class="n">{{ counts()[k] }}</span>
            </button>
          }
        </span>
        @if (tab() !== 'fps' && tab() !== 'battery') {
          <span class="gname">
            <label class="cap" for="gname">{{ sx.groupNameInWidget }}</label>
            <input
              id="gname"
              class="in"
              [value]="d.groupLabels[tab()] ?? ''"
              [placeholder]="placeholder()"
              (change)="setGroupLabel($any($event.target).value)"
            />
          </span>
        }
      </div>

      <div id="panel-metrics" role="tabpanel" [attr.aria-labelledby]="'tab-' + tab()">
        @if (tab() !== 'battery') {
          <div class="note n-ac mid pnote">
            <span class="ico"><pw-icon name="metrics" [size]="16" [stroke]="2" /></span>
            @let pn = sx.priorityNote;
            <span>{{ pn[0] }}<b>{{ pn[1] }}</b>{{ pn[2] }}<b>{{ pn[3] }}</b>{{ pn[4] }}<b>{{ pn[5] }}</b>{{ pn[6] }}</span>
          </div>
          @if (!d.features?.sessionPeaks) {
            <div class="grp offgrp">
              <div class="off-line">
                <span class="grow"><b>{{ sx.peaksOffLine }}</b> · {{ sx.offInFeatures }}</span>
                <button type="button" class="btn sm" (click)="ctx.update(enablePeaks)">{{ sx.turnOn }}</button>
              </div>
            </div>
          }
          <div class="grp mtable" data-tour="metrics-table">
            <div class="tbl-r th cols">
              <span></span>
              <span>{{ sx.colShow }}</span>
              <span>{{ sx.colName }}</span>
              <span class="c-sensor">{{ sx.colSensor }}</span>
              <span>{{ sx.colUnit }}</span>
              <span>{{ sx.colWarn }}</span>
              <span>{{ sx.colCrit }}</span>
              <span>{{ sx.colGraph }}</span>
              <span>{{ sx.colWhere }}</span>
            </div>
            <div cdkDropList [cdkDropListData]="rows()" (cdkDropListDropped)="drop($event)" class="dl">
              @for (r of rows(); track r.s.id; let i = $index) {
                @let nm = r.s.label || r.def.name;
                <div class="tbl-r cols mrow" cdkDrag cdkDragLockAxis="y" cdkDragPreviewContainer="parent" [attr.data-anchor]="r.s.id" [class.na]="!r.def.available">
                  <button type="button" class="handle" cdkDragHandle [attr.aria-label]="sx.moveMetric(nm)" (keydown)="moveKey($event, i)">
                    <pw-icon name="grip" [size]="16" />
                  </button>
                  <button type="button" class="sw" role="switch" [attr.aria-label]="sx.showFor(nm)" [attr.aria-checked]="r.s.enabled && r.def.available" [disabled]="!r.def.available" (click)="setMetric(r.s.id, { enabled: !r.s.enabled })"></button>
                  <input class="in sm" [attr.aria-label]="sx.colName + ' · ' + r.def.name" [value]="r.s.label ?? ''" [placeholder]="r.def.name" [disabled]="!r.def.available" (change)="setMetric(r.s.id, { label: $any($event.target).value || undefined })" />
                  <span class="c-sensor sensor ell" [title]="r.def.source ?? ''">
                    @if (r.def.available) {
                      {{ r.def.source ?? r.def.name }}
                    } @else {
                      <span class="pill p-n">{{ sx.notAvailable }}</span>
                    }
                  </span>
                  <span>
                    @if (r.def.isTemperature) {
                      <span class="seg tiny" role="group" [attr.aria-label]="sx.colUnit + ' · ' + nm">
                        <button type="button" [attr.aria-pressed]="r.s.unit !== 'F'" (click)="setMetric(r.s.id, { unit: 'C' })">°C</button>
                        <button type="button" [attr.aria-pressed]="r.s.unit === 'F'" (click)="setMetric(r.s.id, { unit: 'F' })">°F</button>
                      </span>
                    } @else {
                      <span class="cap">{{ unit(r.def) || '—' }}</span>
                    }
                  </span>
                  @if (hasLimits(r.def)) {
                    <span class="thr">
                      <i class="dot" style="background: var(--y)"></i>
                      <input class="in sm num" inputmode="decimal" [attr.aria-label]="sx.warnFor(nm)" [value]="r.s.warn ?? ''" placeholder="—" [disabled]="!r.def.available" (change)="setMetric(r.s.id, { warn: num($any($event.target).value) })" />
                    </span>
                    <span class="thr">
                      <i class="dot" style="background: var(--r)"></i>
                      <input class="in sm num" inputmode="decimal" [attr.aria-label]="sx.critFor(nm)" [value]="r.s.crit ?? ''" placeholder="—" [disabled]="!r.def.available" (change)="setMetric(r.s.id, { crit: num($any($event.target).value) })" />
                    </span>
                  } @else {
                    <span class="cap">—</span>
                    <span class="cap">—</span>
                  }
                  <span>
                    @if (r.def.isTemperature) {
                      <button type="button" class="sw" role="switch" [attr.aria-label]="sx.graphFor(nm)" [attr.aria-checked]="r.s.sparkline && r.def.available" [disabled]="!r.def.available" (click)="setMetric(r.s.id, { sparkline: !r.s.sparkline })"></button>
                    } @else {
                      <span class="cap">—</span>
                    }
                  </span>
                  <span class="where">
                    @switch (placement().get(r.s.id)) {
                      @case ('compact') {
                        <span class="pill p-ac">{{ sx.layoutCompactBtn }}</span><span class="pill p-n wide-only">{{ sx.layoutMidBtn }}</span>
                      }
                      @case ('mid') {
                        <span class="pill p-n">{{ sx.layoutMidBtn }}</span>
                      }
                      @case ('full') {
                        <span class="cap">{{ sx.layoutFullBtn }}</span>
                      }
                      @default {
                        <span class="cap">—</span>
                      }
                    }
                  </span>
                </div>
              }
            </div>
          </div>
          <p class="sr" aria-live="polite">{{ announce() }}</p>
        } @else {
          <section class="sec bsec" data-anchor="battery">
            @if (!t.catalog()?.battery) {
              <div class="note n-y">
                <span class="ico"><pw-icon name="warn" [size]="16" [stroke]="2" /></span>
                <span>{{ sx.feat['battery'][0] }} · {{ sx.readerNotFound }}</span>
              </div>
            } @else if (!d.battery.enabled) {
              <div class="grp">
                <div class="off-line">
                  <span class="grow"><b>{{ sx.feat['battery'][0] }}</b> · {{ sx.offInFeatures }}</span>
                  <button type="button" class="btn sm" (click)="ctx.update(enableBattery)">{{ sx.turnOn }}</button>
                </div>
              </div>
            } @else {
              <div class="sh">
                <div>
                  <h2>{{ sx.battDevicesSec }}</h2>
                  <div class="ht">{{ sx.battDevicesHint }}</div>
                </div>
                <button type="button" class="btn sm" (click)="t.send({ type: 'refreshBatteries' })"><pw-icon name="refresh" [size]="14" [stroke]="2" />{{ sx.refreshNow }}</button>
              </div>
              <div class="grp">
                @for (dev of t.batteries(); track dev.key) {
                  <div class="row">
                    <span class="ico"><pw-icon name="battery" [size]="18" /></span>
                    <div class="rl">
                      <div class="lb" [id]="'bd-' + dev.key">{{ dev.name }}</div>
                      <div class="ht">
                        {{ dev.via }} ·
                        {{ !dev.connected ? sx.battOff : dev.asleep ? sx.battAsleep : dev.percent != null ? dev.percent + '%' : (dev.levelText ?? '—') }}{{ dev.charging ? ' · ' + sx.battCharging : '' }}
                      </div>
                    </div>
                    @if (dev.percent != null && dev.percent <= d.battery.lowPercent) {
                      <span class="pill p-r">{{ dev.percent }}%</span>
                    }
                    <button type="button" class="sw" role="switch" [attr.aria-labelledby]="'bd-' + dev.key" [attr.aria-checked]="!d.battery.hidden.includes(dev.key)" (click)="toggleBattery(dev.key)"></button>
                  </div>
                } @empty {
                  <div class="empty">
                    <div class="lb">{{ sx.battNone }}</div>
                    <div class="ht">{{ sx.battLow(d.battery.lowPercent) }}</div>
                  </div>
                }
              </div>
            }
          </section>
        }
      </div>
    }
  `,
  styles: `
    .tabsrow {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-top: 22px;
      flex-wrap: wrap;
    }
    .gname {
      display: flex;
      gap: 8px;
      align-items: center;
      input {
        width: 140px;
      }
    }
    .pnote {
      margin-top: 14px;
    }
    .offgrp {
      margin-top: 14px;
    }
    .mtable {
      margin-top: 14px;
      container-type: inline-size;
    }
    .cols {
      grid-template-columns: 18px 40px minmax(0, 1.2fr) minmax(0, 1.1fr) 72px 78px 78px 52px 150px;
    }
    .mrow {
      background: var(--sf);
    }
    .dl .mrow:last-child {
      border-radius: 0 0 9px 9px;
    }
    .mrow + .mrow {
      border-top: 1px solid var(--hair);
    }
    .th + .dl {
      border-top: 1px solid var(--hair);
    }
    .na {
      opacity: 0.55;
    }
    .handle {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 28px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--tx3);
      cursor: grab;
      border-radius: 4px;
      &:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--ac);
      }
    }
    .sensor {
      font-size: 12.5px;
      color: var(--tx2);
    }
    .tiny {
      transform: scale(0.92);
      transform-origin: left;
    }
    .thr {
      display: flex;
      align-items: center;
      gap: 6px;
      input {
        width: 52px;
      }
    }
    .where {
      display: flex;
      gap: 4px;
    }
    .bsec {
      margin-top: 14px;
    }
    .sr {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    /* Janela no mínimo (960): some a coluna do sensor e a pílula do Médio */
    @container (max-width: 760px) {
      .cols {
        grid-template-columns: 18px 40px minmax(0, 1fr) 66px 72px 72px 44px 84px;
        gap: 10px;
      }
      .c-sensor,
      .wide-only {
        display: none;
      }
    }
    /* CDK: a linha arrastada anda por transform; as outras abrem espaço em 160 ms */
    .cdk-drag-preview {
      box-shadow: var(--popsh);
      border-radius: 8px;
      background: var(--pop);
    }
    .cdk-drag-placeholder {
      opacity: 0.35;
    }
    .cdk-drag-animating,
    .dl.cdk-drop-list-dragging .mrow:not(.cdk-drag-placeholder) {
      transition: transform 160ms var(--ease-out);
    }
    @media (prefers-reduced-motion: reduce) {
      .cdk-drag-animating,
      .dl.cdk-drop-list-dragging .mrow:not(.cdk-drag-placeholder) {
        transition: none;
      }
    }
  `,
})
export class MetricsPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  private readonly nav = inject(SettingsNav);
  protected readonly tabs = TABS;
  protected readonly tab = signal<Tab>('gpu');
  protected readonly announce = signal('');

  protected readonly enablePeaks = (c: { features?: { sessionPeaks: boolean } }) => {
    if (c.features) c.features.sessionPeaks = true;
  };
  protected readonly enableBattery = (c: { battery: { enabled: boolean } }) => {
    c.battery.enabled = true;
  };

  private readonly all = computed(() => {
    const d = this.ctx.draft();
    const defs = this.t.defs();
    if (!d) return [] as Row[];
    return [...d.metrics]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({ s, def: defs.get(s.id)! }))
      .filter((r) => !!r.def);
  });

  protected readonly rows = computed(() => {
    const tab = this.tab();
    return this.all().filter((r) => r.def.group === tab);
  });

  protected readonly counts = computed(() => {
    const out: Record<string, string> = {};
    for (const g of GROUPS) {
      const list = this.all().filter((r) => r.def.group === g && r.def.available);
      out[g] = `${list.filter((r) => r.s.enabled).length}/${list.length}`;
    }
    out['battery'] = String(this.t.batteries().length);
    return out;
  });

  protected readonly placeholder = computed(() => {
    const tab = this.tab();
    return tab === 'battery' ? '' : groupLabel(this.ctx.draft(), tab, this.t.catalog(), this.s());
  });

  /** Em qual layout menor cada métrica ainda aparece (pela ordem de prioridade dentro do grupo). */
  protected readonly placement = computed(() => {
    const out = new Map<string, 'compact' | 'mid' | 'full'>();
    const rank = new Map<string, number>();
    for (const { s, def } of this.all()) {
      if (!s.enabled || !def.available || NOT_COUNTED.has(s.id) || def.unit === 'text') continue;
      const i = rank.get(def.group) ?? 0;
      rank.set(def.group, i + 1);
      out.set(s.id, i < LIMITS.compact[def.group] && s.id !== 'fps.graph' ? 'compact' : i < LIMITS.mid[def.group] ? 'mid' : 'full');
    }
    return out;
  });

  constructor() {
    // Âncora da URL: uma aba (metrics/cpu) ou uma métrica (metrics/gpu.hotspot, vindo de Alertas)
    effect(() => {
      const a = this.nav.anchor();
      this.nav.seq();
      if (!a) return;
      const tab = (TABS as string[]).includes(a) ? (a as Tab) : untracked(() => this.t.defs().get(a)?.group);
      if (tab) this.tab.set(tab);
    });
  }

  protected tabName(k: Tab) {
    const s = this.s();
    return k === 'battery' ? s.battTab : k === 'other' ? s.groupOther : k.toUpperCase();
  }

  protected setTab(k: Tab) {
    if (k === this.tab()) return;
    this.tab.set(k);
    this.nav.go('metrics', k);
  }

  /** Setas entre as abas (padrão de tablist). */
  protected tabKeys(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.indexOf(this.tab());
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    this.setTab(next);
    requestAnimationFrame(() => document.getElementById('tab-' + next)?.focus());
    e.preventDefault();
  }

  protected unit(def: MetricDef) {
    return unitLabel(def);
  }

  protected hasLimits(def: MetricDef) {
    return def.unit !== 'graph' && def.unit !== 'text' && def.group !== 'fps';
  }

  protected num(v: string): number | undefined {
    const n = parseFloat(v.replace(',', '.'));
    return isFinite(n) ? n : undefined;
  }

  protected setMetric(id: string, patch: Partial<MetricSetting>) {
    this.ctx.update((c) => {
      const m = c.metrics.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
    });
  }

  protected setGroupLabel(value: string) {
    const key = this.tab();
    if (key === 'battery') return;
    this.ctx.update((c) => {
      c.groupLabels ??= {};
      if (value.trim()) c.groupLabels[key] = value.trim();
      else delete c.groupLabels[key];
    });
  }

  protected drop(e: CdkDragDrop<Row[]>) {
    this.reorder(e.previousIndex, e.currentIndex);
  }

  /** Alça com foco: ↑/↓ movem a métrica (o arrasto do CDK não tem teclado). */
  protected moveKey(e: KeyboardEvent, i: number) {
    const to = e.key === 'ArrowUp' ? i - 1 : e.key === 'ArrowDown' ? i + 1 : -1;
    if (to < 0 || to >= this.rows().length) return;
    e.preventDefault();
    this.reorder(i, to);
    const id = this.rows()[i]?.s.id;
    requestAnimationFrame(() => (document.querySelector(`[data-anchor="${id}"] .handle`) as HTMLElement | null)?.focus());
  }

  private reorder(from: number, to: number) {
    if (from === to) return;
    const rows = this.rows();
    const ids = rows.map((r) => r.s.id);
    const orders = rows.map((r) => r.s.order).sort((a, b) => a - b);
    moveItemInArray(ids, from, to);
    this.ctx.update((c) => {
      ids.forEach((id, i) => {
        const m = c.metrics.find((x) => x.id === id);
        if (m) m.order = orders[i];
      });
    });
    const r = rows[from];
    this.announce.set(this.s().moved(r.s.label || r.def.name, to + 1));
  }

  protected toggleBattery(key: string) {
    this.ctx.update((c) => {
      const h = c.battery.hidden;
      const i = h.indexOf(key);
      if (i >= 0) h.splice(i, 1);
      else h.push(key);
    });
  }
}
