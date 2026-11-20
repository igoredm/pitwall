import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { Dict, I18n } from '../../i18n';
import { Level, MetricDef, MetricSetting, MissingReason } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { formatValue, level as levelOf, unitLabel } from '../../widget/metric-views';
import { clock } from '../format';
import { copyText, presetName } from '../helpers';
import { SettingsCtx } from '../settings-ctx';

const REPO = 'https://github.com/igoredm/pitwall';
/** 15 min a 1 Hz. */
const CAP = 900;
/** Pontos no máximo por gráfico (15 min viram baldes de ~8 s). */
const MAX_POINTS = 120;
const RANGES = [60, 300, 900] as const;
type Range = (typeof RANGES)[number];
const RANGE_KEY = 'pitwall.monitorRange';
/** Conteúdo ≥ 860 px: duas colunas; abaixo de 760: faixa 3+2 e textos curtos (janela de 960). */
const WIDE_PX = 860;
const NARROW_PX = 760;

type GroupId = 'gpu' | 'cpu' | 'ram' | 'fps' | 'disks' | 'net' | 'battery';
const ORDER: GroupId[] = ['gpu', 'cpu', 'ram', 'fps', 'disks', 'net', 'battery'];
const LEFT: GroupId[] = ['gpu', 'fps'];
const RIGHT: GroupId[] = ['cpu', 'ram', 'disks', 'net', 'battery'];
const FPS_IDS = ['fps.current', 'fps.low1', 'fps.low01', 'fps.frametime', 'fps.stutters', 'fps.animError', 'fps.pcLatency'];
const FIRST: Partial<Record<GroupId, string[]>> = {
  gpu: ['gpu.load', 'gpu.temp', 'gpu.hotspot', 'gpu.memjunction', 'gpu.hotspotDelta', 'gpu.power', 'gpu.clock', 'gpu.memclock', 'gpu.vramUsed', 'gpu.vramLoad', 'gpu.fan', 'gpu.fanRpm'],
  cpu: ['cpu.load', 'cpu.temp', 'cpu.clockAvg', 'cpu.power'],
  ram: ['ram.load', 'ram.used', 'ram.virtualLoad'],
  fps: FPS_IDS,
  net: ['net.down', 'net.up'],
};
/** Fora do Monitor: constantes, texto, gráfico e o que já está na faixa de estado. */
const SKIP = new Set(['ram.total', 'fps.graph', 'fps.avg', 'fps.displayed']);

function groupOf(def: MetricDef): GroupId | null {
  const id = def.id;
  if (def.unit === 'text' || def.unit === 'graph' || SKIP.has(id)) return null;
  if (id.startsWith('fps.')) return FPS_IDS.includes(id) ? 'fps' : null;
  if (id.startsWith('gpu')) return 'gpu';
  if (id.startsWith('cpu.') || id.startsWith('mb.')) return 'cpu';
  if (id.startsWith('ram.')) return 'ram';
  if (/^disk\d/.test(id)) return 'disks';
  if (id.startsWith('net.')) return 'net';
  return null;
}

/** Anel de 900 floats por sensor (NaN = sem leitura). Todos andam juntos pelo índice global de amostras. */
class Ring {
  readonly a = new Float32Array(CAP).fill(NaN);
}

interface Spark {
  line: string;
  area: string;
  warnY: number | null;
  color: string;
}

interface SensorRow {
  key: string;
  name: string;
  aria: string;
  /** Sem leitura (available: false ou bateria fora de alcance). */
  missing?: { text: string; reason?: MissingReason };
  value?: string;
  unit?: string;
  level?: Level;
  min?: string | null;
  max?: string | null;
  /** Engasgos: "0,1" (por minuto). */
  perMin?: string | null;
  spark?: Spark | null;
  /** Engasgos: posição (0–100) de cada um na janela. */
  ticks?: number[] | null;
}

interface GroupView {
  id: GroupId;
  title: string;
  hint: string;
  rows: SensorRow[];
  /** Todos faltam pelo mesmo motivo: uma linha só. */
  collapsed?: { text: string; why: string; reason?: MissingReason };
}

interface Cell {
  label: string;
  value: string;
  sub: string;
  mono?: boolean;
  warn?: boolean;
  dot?: string;
  /** O sub vira link para esta página. */
  link?: 'gpu' | 'features';
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    // armazenamento bloqueado: segue sem lembrar
  }
}

/** "36 min" · "2 h 58 min" · "4 h 05 min". */
function fmtSpan(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m < 60) return `${Math.max(1, m)} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

/** Valor como o Monitor mostra: CPU em GHz, rede em Mbit/s, °F se o usuário escolheu, vírgula em PT. */
function display(def: MetricDef, set: MetricSetting | undefined, raw: number, s: Dict): string {
  let v = raw;
  let txt: string;
  if (def.isTemperature && set?.unit === 'F') v = (v * 9) / 5 + 32;
  if (def.unit === 'MHz' && def.id.startsWith('cpu.')) txt = (v / 1000).toFixed(2);
  else if (def.unit === 'MB/s' && def.id.startsWith('net.')) {
    v *= 8.388608;
    txt = v === 0 ? '0' : v < 100 ? v.toFixed(1) : Math.round(v).toString();
  } else if (def.unit === 'ms' || def.unit === 'GB') txt = v.toFixed(1);
  else txt = formatValue(v, def.unit);
  return s.decimalComma ? txt.replace('.', ',') : txt;
}

function unitOf(def: MetricDef, set: MetricSetting | undefined): string {
  if (def.unit === 'MHz' && def.id.startsWith('cpu.')) return 'GHz';
  if (def.unit === 'MB/s' && def.id.startsWith('net.')) return 'Mbit/s';
  return unitLabel(def, def.isTemperature && set?.unit === 'F');
}

const BRANDS = /^(Samsung|WDC?|Western Digital|Crucial|Kingston|Seagate|Toshiba|KIOXIA|SK hynix|Intel|Corsair|Sabrent|ADATA|XPG|Micron|SanDisk|Lexar|TEAMGROUP|Team|Patriot|PNY|Gigabyte|Transcend|HP|Netac|Apacer|Hitachi|HGST|Silicon Power)\s+(SSD\s+)?/i;

/** Primeira letra maiúscula, para nomes como "Rede · download" → "Download". */
function cleanName(def: MetricDef): string {
  let n = def.id.startsWith('net.') ? def.name.replace(/^[^·]*·\s*/, '') : def.name;
  // Discos: o modelo inteiro já está na dica do grupo; na linha, sem a marca ("980 PRO · temperatura")
  if (/^disk\d/.test(def.id)) {
    const short = n.replace(BRANDS, '');
    if (!/^\d+\s*(TB|GB)\b/i.test(short)) n = short;
  }
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/**
 * Gráfico de 100×32 (preserveAspectRatio none): linha + área, com o tracejado do limite amarelo quando cabe. A escala
 * vai de 0 até um pouco acima do máximo da janela (sempre até 100 em %), para não exagerar ruído.
 */
function sparkOf(vals: number[], warn: number | null | undefined, unit: string, color: string): Spark | null {
  let max = -Infinity;
  let min = Infinity;
  for (const v of vals) {
    if (Number.isNaN(v)) continue;
    if (v > max) max = v;
    if (v < min) min = v;
  }
  if (max === -Infinity) return null;
  const lo = Math.min(0, min);
  let hi = Math.max(max * 1.12, unit === '%' ? 100 : 0, lo + 1);
  if (warn != null && warn > max && warn < max * 1.4) hi = Math.max(hi, warn * 1.08);
  const y = (v: number) => (32 - ((v - lo) / (hi - lo)) * 30).toFixed(2);
  const n = vals.length;
  let line = '';
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i++) {
    const v = vals[i];
    if (Number.isNaN(v)) continue;
    const x = n === 1 ? 100 : (i / (n - 1)) * 100;
    line += `${x.toFixed(2)},${y(v)} `;
    if (first < 0) first = x;
    last = x;
  }
  const area = `${first.toFixed(2)},32 ${line}${last.toFixed(2)},32`;
  const warnY = warn != null && warn >= lo && warn <= hi ? Number(y(warn)) : null;
  return { line, area, warnY, color };
}

/**
 * PC › Monitor (design-notes › v1.2 › 1): faixa de estado, grupos com uma linha por sensor (valor, nível, gráfico de
 * 1/5/15 min, mín/máx desde que o app abriu) e "sem leitura" com o motivo. Custo: só amostra (1 Hz, anel no front) e
 * redesenha (≤ 1×/s) com a página visível; nada anima.
 */
@Component({
  selector: 'pw-page-monitor',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let nar = narrow();
    <header class="ph">
      <div>
        <h1>{{ sx.pages.monitor }}</h1>
        <p class="pd">{{ nar ? sx.monIntroShort : sx.monIntro }}</p>
      </div>
      <div class="acts">
        <button type="button" class="btn sm" aria-live="polite" (click)="copyReadings()">
          <pw-icon [name]="copied() ? 'check' : 'copy'" [size]="14" [stroke]="copied() ? 2 : 1.7" />{{ copied() ? sx.monCopied : sx.monCopy }}
        </button>
        <button type="button" class="btn sm" aria-live="polite" [class.ok]="!!marked()" (click)="mark()">
          @if (marked(); as m) {
            <pw-icon name="check" [size]="14" [stroke]="2" />{{ sx.monMarked(m.index, m.time) }}
          } @else {
            <pw-icon name="flag" [size]="14" />{{ nar ? sx.monMarkShort : sx.monMark }}
            @if (!nar && markKbd(); as k) {
              <span class="kbd mk">{{ k }}</span>
            }
          }
        </button>
      </div>
    </header>

    <div class="grp strip" [class.r2]="nar" role="status">
      @for (c of strip(); track c.label) {
        <div>
          <div class="sl">{{ c.label }}</div>
          <div class="sv" [class.y]="c.warn">
            @if (c.dot) {
              <i class="dot" [style.background]="c.dot"></i>
            }
            <span class="ell" [class.mono]="c.mono" [class.exe]="c.mono">{{ c.value }}</span>
          </div>
          @if (c.link) {
            <a class="ss lnk sl2" [href]="'#/settings/' + c.link" (click)="$event.preventDefault(); ctx.go(c.link)">{{ c.sub }}</a>
          } @else {
            <div class="ss">{{ c.sub || nbsp }}</div>
          }
        </div>
      }
    </div>

    <div class="bar2">
      <nav [attr.aria-label]="sx.monJump" class="jump">
        @for (g of groups(); track g.id) {
          <a class="lnk" [href]="'#/settings/monitor/' + g.id" (click)="$event.preventDefault(); ctx.go('monitor', g.id)">{{ g.title }}</a>
        }
      </nav>
      <span class="grow"></span>
      <span class="cap">{{ since() }}</span>
      <span class="seg" role="group" [attr.aria-label]="sx.monRange">
        @for (r of ranges; track r) {
          <button type="button" [attr.aria-pressed]="range() === r" (click)="setRange(r)">{{ r / 60 }} min</button>
        }
      </span>
    </div>

    <div class="cols" [class.two]="wide()">
      @for (col of columns(); track $index) {
        <div class="col">
          @for (g of col; track g.id) {
            <section class="gsec" [attr.data-anchor]="g.id">
              <div class="gh">
                <h2>{{ g.title }}</h2>
                @if (g.hint) {
                  <span class="ht ell">{{ g.hint }}</span>
                }
              </div>
              <div class="grp">
                @if (g.collapsed; as c) {
                  <div class="sr off one">
                    <span class="cn"><b>{{ c.text }}</b> · {{ c.why }}</span>
                    @if (c.reason && sx.missingAction[c.reason]) {
                      <button type="button" class="lnk act" (click)="act(c.reason)">{{ sx.missingAction[c.reason] }}</button>
                    }
                  </div>
                } @else {
                  @for (r of g.rows; track r.key) {
                    @if (r.missing; as m) {
                      <div class="sr off" [class.w1]="!wide()" role="group" [attr.aria-label]="r.aria">
                        <span class="sn">{{ r.name }}</span>
                        <span class="miss">
                          <span>{{ m.text }}</span>
                          @if (m.reason && sx.missingAction[m.reason]) {
                            <button type="button" class="lnk act" (click)="act(m.reason)">{{ sx.missingAction[m.reason] }}</button>
                          }
                        </span>
                      </div>
                    } @else {
                      <div class="sr" [class.w1]="!wide()" role="group" [attr.aria-label]="r.aria">
                        <span class="sn" [title]="r.name">{{ r.name }}</span>
                        @if (r.ticks; as tk) {
                          <svg viewBox="0 0 100 16" preserveAspectRatio="none" class="trk" aria-hidden="true">
                            <line x1="0" x2="100" y1="8" y2="8" stroke="var(--hair)" stroke-width="1" vector-effect="non-scaling-stroke" />
                            @for (x of tk; track $index) {
                              <line [attr.x1]="x" [attr.x2]="x" y1="2" y2="14" stroke="var(--y)" stroke-width="2" vector-effect="non-scaling-stroke" />
                            }
                          </svg>
                        } @else if (r.spark; as sp) {
                          <svg viewBox="0 0 100 32" preserveAspectRatio="none" class="spk" aria-hidden="true">
                            @if (sp.warnY != null) {
                              <line x1="0" x2="100" [attr.y1]="sp.warnY" [attr.y2]="sp.warnY" stroke="var(--y)" stroke-opacity=".75" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
                            }
                            <polygon [attr.points]="sp.area" [attr.fill]="sp.color" fill-opacity=".13" />
                            <polyline [attr.points]="sp.line" fill="none" [attr.stroke]="sp.color" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
                          </svg>
                        } @else {
                          <span></span>
                        }
                        <span class="vv" [class]="'vv ' + (r.level ?? 'ok')">{{ r.value }}<small>{{ r.unit }}</small></span>
                        @if (r.perMin != null) {
                          <span class="mm"><span><b>{{ r.perMin }}</b>{{ sx.monPerMin }}</span></span>
                        } @else if (r.min != null) {
                          <span class="mm" [class.one]="!wide()">
                            <span>{{ sx.monMin }} <b>{{ r.min }}</b></span>
                            <span class="mx">{{ sx.monMax }} <b>{{ r.max }}</b></span>
                          </span>
                        } @else {
                          <span class="mm"></span>
                        }
                      </div>
                    }
                  }
                }
              </div>
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .acts {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      .ok {
        color: var(--g);
      }
    }
    .mk {
      margin-left: 4px;
    }
    .strip {
      margin-top: 20px;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      > div {
        padding: 12px 16px;
        min-width: 0;
      }
      > div + div {
        border-left: 1px solid var(--hair);
      }
      &.r2 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
        > div:nth-child(n + 4) {
          border-top: 1px solid var(--hair);
        }
        > div:nth-child(4) {
          border-left: 0;
        }
      }
    }
    .sl {
      font-size: 11.5px;
      font-weight: 700;
      color: var(--tx3);
      white-space: nowrap;
    }
    .sv {
      font-size: 15px;
      font-weight: 700;
      margin-top: 3px;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      &.y {
        color: var(--y);
      }
      .exe {
        font-size: 14px;
        font-weight: 600;
      }
    }
    .ss {
      font-size: 12px;
      color: var(--tx2);
      margin-top: 1px;
      line-height: 1.35;
      /* o motivo do FPS ("Precisa abrir como administrador") é a informação: até 2 linhas antes da reticência */
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
    }
    .sl2 {
      display: block;
      color: var(--act);
      font-weight: 600;
    }
    .bar2 {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    .jump {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      .lnk {
        color: var(--tx2);
        font-size: 12.5px;
      }
    }
    .cols {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 0 24px;
      align-items: start;
      &.two {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      }
    }
    .col {
      min-width: 0;
    }
    .gsec {
      margin-top: 24px;
      scroll-margin-top: 20px;
    }
    .gh {
      display: flex;
      align-items: baseline;
      gap: 10px;
      margin: 0 0 8px;
      min-width: 0;
      .ht {
        margin: 0;
        color: var(--tx3);
      }
    }
    .sr {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 96px 80px 52px;
      align-items: center;
      gap: 12px;
      padding: 0 14px;
      min-height: 44px;
      &.w1 {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) 96px 132px;
      }
      &.one {
        display: flex;
        gap: 12px;
        padding: 10px 14px;
        font-size: 12.5px;
        color: var(--tx2);
        b {
          color: var(--tx);
          font-weight: 600;
        }
        .cn {
          flex: 1;
          min-width: 0;
        }
      }
    }
    .sr + .sr {
      border-top: 1px solid var(--hair);
    }
    .sn {
      font-size: 13.5px;
      font-weight: 600;
      min-width: 0;
      /* em 2 colunas (1200) a coluna do nome tem ~130 px: "980 PRO · temperatura" quebra em 2 linhas em vez de
         virar "980 PRO · tempera…"; a reticência fica só para o que não cabe em 2 */
      line-height: 1.25;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
      overflow-wrap: anywhere;
      padding: 4px 0;
    }
    .off .sn {
      color: var(--tx2);
      font-weight: 500;
    }
    .spk {
      display: block;
      width: 100%;
      height: 24px;
      overflow: visible;
    }
    .trk {
      display: block;
      width: 100%;
      height: 14px;
    }
    .vv {
      justify-self: end;
      font-size: 16.5px;
      font-weight: 600;
      letter-spacing: -0.01em;
      white-space: nowrap;
      padding: 1px 6px;
      border-radius: 6px;
      margin-right: -6px;
      small {
        font-size: 11.5px;
        color: var(--tx3);
        font-weight: 600;
        margin-left: 2px;
        letter-spacing: 0;
      }
      &.warn {
        background: var(--ys);
        color: var(--y);
      }
      &.crit {
        background: var(--rs);
        color: var(--r);
      }
      &.warn small,
      &.crit small {
        color: inherit;
        opacity: 0.8;
      }
    }
    .mm {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      font-size: 11.5px;
      color: var(--tx3);
      line-height: 1.3;
      white-space: nowrap;
      b {
        color: var(--tx2);
        font-weight: 600;
      }
      &.one {
        flex-direction: row;
        justify-content: flex-end;
        gap: 4px;
        .mx::before {
          content: '· ';
        }
      }
    }
    .miss {
      grid-column: 2 / 5;
      font-size: 12.5px;
      color: var(--tx2);
      line-height: 1.35;
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: space-between;
      min-width: 0;
      padding: 6px 0;
    }
    .act {
      font-size: 12.5px;
      flex-shrink: 0;
    }
  `,
})
export class MonitorPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  protected readonly ranges = RANGES;
  protected readonly nbsp = ' ';

  protected readonly range = signal<Range>(((): Range => {
    const v = Number(storageGet(RANGE_KEY));
    return (RANGES as readonly number[]).includes(v) ? (v as Range) : 300;
  })());
  protected readonly copied = signal(false);
  protected readonly marked = signal<{ index: number; time: string } | null>(null);
  protected readonly wide = signal(true);
  protected readonly narrow = signal(false);

  /** Muda a cada amostra (1 Hz): é o único gatilho do redesenho dos valores e gráficos. */
  private readonly tick = signal(0);
  private readonly rings = new Map<string, Ring>();
  /** Amostras tiradas (índice global do anel). */
  private n = 0;
  private lastAt = 0;
  private last: Record<string, number | null> = {};
  /** Mín/máx vistos por esta página (se o backend for antigo e não mandar extremesApp). */
  private readonly local = new Map<string, [number, number]>();
  private readonly openedAt = Date.now();
  private timer?: ReturnType<typeof setInterval>;
  private copiedTimer?: ReturnType<typeof setTimeout>;
  private markedTimer?: ReturnType<typeof setTimeout>;
  private markSeen: unknown;

  protected readonly markKbd = computed(() => {
    const hk = this.ctx.draft()?.hotkeys;
    const st = this.t.catalog()?.hotkeys?.marker;
    if (!hk?.enabled || !hk.marker || st === 'off' || st === 'invalid') return null;
    return hk.marker.split('+').join(' ');
  });

  protected readonly since = computed(() => {
    const s = this.s();
    const at = this.t.appSince();
    if (at == null) return s.monSincePage;
    const time = clock(at, s);
    return this.narrow() ? s.monSinceShort(time) : s.monSince(time);
  });

  protected readonly strip = computed<Cell[]>(() => {
    this.tick();
    const s = this.s();
    const d = this.ctx.draft();
    const cat = this.t.catalog();
    const v = this.last;
    const game = this.t.game();
    const now = Date.now();
    const cells: Cell[] = [];

    // Jogo
    const open = game ? this.t.sessions().find((x) => !x.end && x.exe === game.exe) : null;
    cells.push(
      game
        ? { label: s.stGame, value: game.exe, mono: true, sub: open ? s.stAgo(fmtSpan(now - new Date(open.start).getTime())) : '' }
        : { label: s.stGame, value: s.stNone, sub: '' },
    );

    // FPS (ou o motivo)
    const fps = v['fps.current'];
    if (fps != null) {
      const low = v['fps.low1'];
      const ft = v['fps.frametime'];
      const dec = (x: number) => (s.decimalComma ? x.toFixed(1).replace('.', ',') : x.toFixed(1));
      cells.push({ label: s.stFps, value: String(Math.round(fps)), sub: low != null && ft != null ? s.stFpsSub(String(Math.round(low)), dec(ft)) : '' });
    } else {
      const reason = this.t.texts()['fps.reason'] ?? (game ? 'starting' : 'noGame');
      const quiet = reason === 'noGame' || reason === 'starting';
      cells.push({ label: s.stFps, value: quiet ? '—' : s.stNoReading, warn: !quiet, sub: s.fpsReason[reason] ?? reason });
    }

    // Clock limitado por (não é alarme: sem cor)
    const capDef = this.t.defs().get('gpu.perfcap');
    if (d?.features?.clockReason === false) cells.push({ label: s.stClock, value: '—', sub: s.stClockOff, link: 'features' });
    else if (!capDef?.available || cat?.tuning?.supported === false) cells.push({ label: s.stClock, value: '—', sub: s.stNeedsNvidia });
    else {
      const raw = this.t.perfcap().reason ?? (this.t.texts()['gpu.perfcap'] ? null : 'none');
      const key = (raw ?? 'none').split(/[,|\s]+/)[0] || 'none';
      const cr = this.t.snapshotClockReasons();
      let sub = '';
      if (cr) {
        const total = Object.values(cr.sec).reduce((a, b) => a + (b ?? 0), 0);
        const mine = cr.sec[key as keyof typeof cr.sec] ?? 0;
        if (total > 0 && key !== 'idle') sub = s.stClockPct(Math.round((mine / total) * 100), cr.live);
      }
      cells.push({ label: s.stClock, value: s.clockWord[key] ?? key, sub });
    }

    // Ajuste da GPU
    const tu = this.t.tuning();
    if (cat?.tuning?.supported === false) cells.push({ label: s.stTuning, value: s.stNeedsNvidia, sub: '' });
    else if (!d?.gpuTuning.enabled) cells.push({ label: s.stTuning, value: s.stTuningOff, sub: s.stTuningTurnOn, link: 'gpu' });
    else {
      const prof = this.t.profile()?.tuningPreset;
      const name = presetName(s, prof && prof !== 'off' ? prof : d.gpuTuning.preset);
      cells.push(
        tu?.active
          ? { label: s.stTuning, value: name, dot: 'var(--g)', sub: tu.powerLimitW != null && tu.clockMaxMhz != null ? s.stTuningUpTo(tu.powerLimitW, tu.clockMaxMhz) : '' }
          : { label: s.stTuning, value: name, dot: 'var(--tx3)', sub: s.stTuningWaiting },
      );
    }

    // Ligado há
    const boot = this.t.bootTime();
    cells.push(boot != null ? { label: s.stUp, value: fmtSpan(now - boot), sub: s.stSince(clock(boot, s)) } : { label: s.stUp, value: '—', sub: '' });
    return cells;
  });

  protected readonly groups = computed<GroupView[]>(() => {
    this.tick();
    const s = this.s();
    const cat = this.t.catalog();
    const d = this.ctx.draft();
    if (!cat || !d) return [];
    const sets = this.t.settings();
    const ext = this.t.extremesApp();
    const range = this.range();
    const byGroup = new Map<GroupId, MetricDef[]>();
    for (const def of cat.metrics) {
      const g = groupOf(def);
      if (!g) continue;
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(def);
    }
    const out: GroupView[] = [];
    for (const id of ORDER) {
      if (id === 'battery') {
        const bg = this.batteryGroup(s, range);
        if (bg) out.push(bg);
        continue;
      }
      const defs = byGroup.get(id) ?? [];
      if (!defs.length) continue;
      const first = FIRST[id] ?? [];
      const rank = (x: MetricDef) => {
        const i = first.indexOf(x.id);
        return i < 0 ? first.length : i;
      };
      defs.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id, undefined, { numeric: true }));
      const rows = defs.map((def) => this.row(def, sets.get(def.id), ext, range, s));
      out.push({ id, title: s.monGroups[id], hint: this.hint(id, defs), rows, collapsed: this.collapse(rows, defs, s) });
    }
    return out;
  });

  protected readonly columns = computed<GroupView[][]>(() => {
    const gs = this.groups();
    if (!this.wide()) return [gs];
    return [gs.filter((g) => LEFT.includes(g.id)), gs.filter((g) => RIGHT.includes(g.id))];
  });

  constructor() {
    const destroy = inject(DestroyRef);
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    // Largura da coluna (não da janela): só no resize, nada por quadro
    const ro = new ResizeObserver(([e]) => {
      const w = e.contentRect.width;
      if (w >= WIDE_PX !== this.wide()) this.wide.set(w >= WIDE_PX);
      if (w < NARROW_PX !== this.narrow()) this.narrow.set(w < NARROW_PX);
    });
    ro.observe(host);
    const onVis = () => this.syncTimer();
    document.addEventListener('visibilitychange', onVis);
    this.syncTimer();
    // "Marcador 3 · 21:02:41" por 2 s, para o botão e para o atalho
    this.markSeen = untracked(() => this.t.lastMarker());
    effect(() => {
      const m = this.t.lastMarker();
      if (!m || m === this.markSeen) return;
      this.markSeen = m;
      untracked(() => {
        this.marked.set({ index: m.index, time: clock(new Date(m.at), this.s(), true) });
        clearTimeout(this.markedTimer);
        this.markedTimer = setTimeout(() => this.marked.set(null), 2000);
      });
    });
    destroy.onDestroy(() => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(this.timer);
      clearTimeout(this.copiedTimer);
      clearTimeout(this.markedTimer);
    });
  }

  protected setRange(r: Range) {
    this.range.set(r);
    storageSet(RANGE_KEY, String(r));
  }

  protected copyReadings() {
    this.t.requestSensorDump().then((text) =>
      copyText(text).then((ok) => {
        if (!ok) return;
        this.copied.set(true);
        clearTimeout(this.copiedTimer);
        this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
      }),
    );
  }

  protected mark() {
    this.t.send({ type: 'addMarker' });
  }

  /** Ação ao lado do motivo: links são copiados (abrir daqui rodaria o navegador como administrador). */
  protected act(reason: MissingReason) {
    const s = this.s();
    if (reason === 'off') return this.ctx.go('features', 'battery');
    if (reason === 'needsAdmin') return this.ctx.toast({ title: s.missingAction['needsAdmin'], body: s.monAdminHow });
    const url = reason === 'needsPawnIO' ? 'https://pawnio.eu/' : `${REPO}/releases/latest`;
    copyText(url).then((ok) => ok && this.ctx.toast({ title: s.linkCopiedShort, body: url, duration: 4000 }));
  }

  // ------------------------------------------------------------------ amostragem (1 Hz, só com a página visível)

  private syncTimer() {
    const visible = document.visibilityState === 'visible';
    if (visible && !this.timer) {
      this.sample();
      this.timer = setInterval(() => this.sample(), 1000);
    } else if (!visible && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private sample() {
    const now = Date.now();
    // Volta depois de oculta: os segundos sem amostra ficam vazios (o gráfico não emenda horários diferentes)
    if (this.lastAt) {
      const gap = Math.min(CAP, Math.floor((now - this.lastAt) / 1000) - 1);
      for (let i = 0; i < gap; i++) this.write({});
    }
    this.lastAt = now;
    const values = untracked(() => this.t.values());
    const vals: Record<string, number | null> = { ...values };
    for (const b of untracked(() => this.t.batteries())) vals['bat:' + b.key] = b.connected && b.percent != null ? b.percent : null;
    this.last = vals;
    this.write(vals);
    this.tick.update((x) => x + 1);
  }

  private write(vals: Record<string, number | null>) {
    const slot = this.n % CAP;
    for (const [k, v] of Object.entries(vals)) {
      if (v == null || !Number.isFinite(v)) continue;
      let r = this.rings.get(k);
      if (!r) this.rings.set(k, (r = new Ring()));
      const e = this.local.get(k);
      this.local.set(k, e ? [Math.min(e[0], v), Math.max(e[1], v)] : [v, v]);
    }
    for (const [k, r] of this.rings) {
      const v = vals[k];
      r.a[slot] = v == null || !Number.isFinite(v) ? NaN : v;
    }
    this.n++;
  }

  /** Últimos `range` segundos em até MAX_POINTS baldes (média), do mais antigo ao mais novo. */
  private window(key: string, range: number): number[] {
    const r = this.rings.get(key);
    const buckets = Math.min(range, MAX_POINTS);
    const out = new Array<number>(buckets).fill(NaN);
    if (!r) return out;
    const start = this.n - range;
    const per = range / buckets;
    for (let b = 0; b < buckets; b++) {
      let sum = 0;
      let cnt = 0;
      const i0 = Math.floor(start + b * per);
      const i1 = Math.floor(start + (b + 1) * per);
      for (let i = i0; i < i1; i++) {
        if (i < 0 || i < this.n - CAP) continue;
        const v = r.a[i % CAP];
        if (!Number.isNaN(v)) {
          sum += v;
          cnt++;
        }
      }
      if (cnt) out[b] = sum / cnt;
    }
    return out;
  }

  /** Engasgos: um tique por aumento do contador dentro da janela. */
  private stutterTicks(range: number): number[] {
    const r = this.rings.get('fps.stutters');
    const ticks: number[] = [];
    if (!r) return ticks;
    const start = Math.max(this.n - range, this.n - CAP + 1, 1);
    for (let i = start; i < this.n; i++) {
      const a = r.a[(i - 1) % CAP];
      const b = r.a[i % CAP];
      if (!Number.isNaN(a) && !Number.isNaN(b) && b > a) ticks.push(Number((((i - (this.n - range)) / range) * 100).toFixed(2)));
    }
    return ticks;
  }

  // ------------------------------------------------------------------ linhas

  private row(def: MetricDef, set: MetricSetting | undefined, ext: Record<string, [number, number]>, range: number, s: Dict): SensorRow {
    const name = cleanName(def);
    if (!def.available) {
      const text = def.missingText || (def.missing ? s.missingFallback[def.missing] : '') || s.missingShort;
      return { key: def.id, name, aria: s.monNoReadingAria(name, text), missing: { text, reason: def.missing } };
    }
    const raw = this.last[def.id] ?? null;
    const lvl = levelOf(raw, set?.warn, set?.crit);
    const value = raw == null ? '—' : display(def, set, raw, s);
    const unit = unitOf(def, set);
    const valAria = `${value} ${def.isTemperature ? s.monDegrees : unit}`.trim();

    if (def.id === 'fps.stutters') {
      const open = this.t.sessions().find((x) => !x.end);
      const mins = open ? (Date.now() - new Date(open.start).getTime()) / 60_000 : 0;
      const per = raw != null && mins >= 1 ? raw / mins : null;
      const perTxt = per == null ? null : s.decimalComma ? per.toFixed(1).replace('.', ',') : per.toFixed(1);
      const ticks = this.stutterTicks(range);
      return { key: def.id, name, value, unit, level: 'ok', perMin: perTxt ?? '—', ticks, aria: s.monAria(name, valAria, '', null, null) + ', ' + s.monStutterAria(ticks.length) };
    }

    const mm = ext[def.id] ?? this.local.get(def.id);
    const min = mm ? display(def, set, mm[0], s) : null;
    const max = mm ? display(def, set, mm[1], s) : null;
    const color = lvl === 'crit' ? 'var(--r)' : lvl === 'warn' ? 'var(--y)' : def.group === 'fps' ? 'var(--g)' : 'var(--ac)';
    const spark = sparkOf(this.window(def.id, range), set?.warn, def.unit, color);
    return { key: def.id, name, value, unit, level: lvl, min, max, spark, aria: s.monAria(name, valAria, s.monLevel[lvl], min, max) };
  }

  private batteryGroup(s: Dict, range: number): GroupView | null {
    const d = this.ctx.draft();
    if (!d) return null;
    if (!d.battery.enabled) {
      return { id: 'battery', title: s.monGroups['battery'], hint: '', rows: [], collapsed: { text: s.monBatteryName, why: s.monBatteryFeatureOff, reason: 'off' } };
    }
    const list = this.t.batteries().filter((b) => !d.battery.hidden.includes(b.key));
    if (!list.length) return null;
    const rows: SensorRow[] = list.map((b) => {
      const key = 'bat:' + b.key;
      const pct = b.connected ? b.percent : null;
      if (pct == null && !b.levelText) return { key, name: b.name, aria: s.monNoReadingAria(b.name, s.monBatteryOff), missing: { text: s.monBatteryOff } };
      // Bateria: amarelo abaixo de 20%, sem mín/máx
      const lvl: Level = pct != null && pct < 20 ? 'warn' : 'ok';
      const color = lvl === 'warn' ? 'var(--y)' : 'var(--ac)';
      const value = pct != null ? String(Math.round(pct)) : (b.levelText ?? '—');
      return {
        key,
        name: b.name,
        value,
        unit: pct != null ? '%' : '',
        level: lvl,
        spark: pct != null ? sparkOf(this.window(key, range), null, '%', color) : null,
        aria: s.monAria(b.name, pct != null ? `${value}%` : value, s.monLevel[lvl], null, null),
      };
    });
    return { id: 'battery', title: s.monGroups['battery'], hint: s.monDevices(list.length), rows };
  }

  private hint(id: GroupId, defs: MetricDef[]): string {
    const cat = this.t.catalog();
    const s = this.s();
    const hw = cat?.hardware;
    switch (id) {
      case 'gpu':
        return [hw?.gpu, hw?.gpuDriver ? s.monDriver(hw.gpuDriver) : ''].filter(Boolean).join(' · ');
      case 'cpu':
        return hw?.cpu ?? '';
      case 'ram':
        return hw?.ramGb ? `${hw.ramGb} GB` : '';
      case 'fps': {
        const pm = cat?.about?.presentMon;
        return [this.t.game()?.exe, pm ? `PresentMon ${pm}` : ''].filter(Boolean).join(' · ');
      }
      case 'disks':
        return [...new Set(defs.map((x) => x.name.split(' · ')[0].trim()))].join(' · ');
      case 'net':
        return defs.find((x) => x.source)?.source ?? '';
      default:
        return '';
    }
  }

  /** Todos sem leitura pelo mesmo motivo → "FPS, 1% low, frametime e engasgos: sem leitura · motivo [ação]". */
  private collapse(rows: SensorRow[], defs: MetricDef[], s: Dict): GroupView['collapsed'] {
    if (rows.length < 2 || !rows.every((r) => r.missing)) return undefined;
    const reason = defs[0].missing;
    if (!reason || !defs.every((x) => x.missing === reason)) return undefined;
    const names = rows.map((r, i) => (i && /^[A-ZÀ-Ú][a-zà-ú]*(\s|$)/.test(r.name) ? r.name.charAt(0).toLowerCase() + r.name.slice(1) : r.name));
    let list: string;
    try {
      list = new Intl.ListFormat(s.locale, { type: 'conjunction' }).format(names);
    } catch {
      list = names.join(', ');
    }
    const why = (rows[0].missing!.text || '').replace(/\.$/, '');
    return { text: s.monGroupMissing(list), why, reason };
  }
}
