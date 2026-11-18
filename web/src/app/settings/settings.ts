import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { AppConfig, MetricDef, MetricGroup, MetricSetting, MonitorInfo, THEMES, ThemeName } from '../models';
import { TelemetryService } from '../telemetry.service';
import { LIMITS, NOT_COUNTED, groupLabel, isDarkTheme, unitLabel } from '../widget/metric-views';
import { Widget } from '../widget/widget';

type Section = 'metricas' | 'geral' | 'gpu' | 'log' | 'jogos';

interface Row {
  def: MetricDef;
  s: MetricSetting;
}

interface Group {
  key: MetricGroup;
  name: string;
  label: string;
  rows: Row[];
  active: number;
  total: number;
}

const GROUPS: { key: MetricGroup; name: string }[] = [
  { key: 'gpu', name: 'GPU' },
  { key: 'cpu', name: 'CPU' },
  { key: 'ram', name: 'RAM' },
  { key: 'fps', name: 'FPS' },
  { key: 'other', name: 'Outros' },
];

/** Lista "ignorar" de fábrica (espelha GamesConfig.Ignore no backend) — só para mostrar a origem de cada regra. */
const DEFAULT_IGNORE = new Set(
  [
    'explorer.exe', 'chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'brave.exe', 'discord.exe', 'pitwall.exe',
    'msedgewebview2.exe', 'dwm.exe', 'applicationframehost.exe', 'textinputhost.exe', 'shellexperiencehost.exe',
    'startmenuexperiencehost.exe', 'searchhost.exe', 'lockapp.exe', 'spotify.exe', 'vlc.exe', 'mpc-hc64.exe',
    'code.exe', 'devenv.exe', 'claude.exe',
  ],
);
const BROWSERS = new Set(['chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'brave.exe']);

export const ACCENTS = [
  { value: '', name: 'Padrão do tema' },
  { value: '#4C8DFF', name: 'Azul' },
  { value: '#8B5CF6', name: 'Violeta' },
  { value: '#FF2E88', name: 'Magenta' },
  { value: '#FF7A1A', name: 'Laranja' },
  { value: '#FFC53D', name: 'Âmbar' },
  { value: '#3DDC84', name: 'Verde' },
  { value: '#00E5FF', name: 'Ciano' },
];

@Component({
  selector: 'pw-settings',
  imports: [CdkDropList, CdkDrag, CdkDragHandle, Widget],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Settings {
  protected readonly t = inject(TelemetryService);
  protected readonly themes = THEMES;
  protected readonly accents = ACCENTS;
  protected readonly refreshRates = [250, 500, 1000, 2000];
  protected readonly logIntervals = [500, 1000, 2000, 5000];

  protected readonly section = signal<Section>('metricas');
  protected readonly search = signal('');
  protected readonly collapsed = signal<Set<MetricGroup>>(new Set(['ram', 'fps', 'other']));
  protected readonly confirmReset = signal(false);
  protected readonly preview = signal(false);
  protected readonly newExe = signal('');
  protected readonly newRule = signal<'include' | 'ignore'>('include');
  protected readonly ruleFilter = signal<'all' | 'include' | 'ignore'>('all');

  /** Cópia local editável; salva com debounce. Sincroniza com o servidor quando não há edição pendente. */
  protected readonly draft = signal<AppConfig | null>(null);
  private saveTimer?: ReturnType<typeof setTimeout>;
  private readonly systemDark = signal(matchMedia('(prefers-color-scheme: dark)').matches);

  protected readonly dark = computed(() => {
    const d = this.draft();
    return isDarkTheme(d, (d?.appTheme as ThemeName) || 'lumen', this.systemDark());
  });
  protected readonly rootClass = computed(() => {
    const d = this.draft();
    return `st t-${d?.appTheme || 'lumen'} ${this.dark() ? 'dark' : 'light'}`;
  });

  protected readonly groups = computed<Group[]>(() => {
    const d = this.draft();
    const defs = this.t.defs();
    if (!d || defs.size === 0) return [];
    const q = normalize(this.search());
    return GROUPS.map(({ key, name }) => {
      const all = [...d.metrics]
        .sort((a, b) => a.order - b.order)
        .map((s) => ({ s, def: defs.get(s.id)! }))
        .filter((r) => r.def && r.def.group === key);
      const rows = q ? all.filter((r) => normalize(`${r.def.name} ${r.s.label ?? ''} ${r.s.id}`).includes(q)) : all;
      return {
        key,
        name,
        label: groupLabel(d, key, this.t.catalog()),
        rows,
        active: all.filter((r) => r.s.enabled && r.def.available).length,
        total: all.filter((r) => r.def.available).length,
      };
    }).filter((g) => g.rows.length > 0 || !q);
  });

  /** Em qual layout menor cada métrica ainda aparece (pela ordem de prioridade dentro do grupo). */
  protected readonly placement = computed(() => {
    const d = this.draft();
    const defs = this.t.defs();
    const out = new Map<string, 'compact' | 'mid' | 'full'>();
    if (!d) return out;
    const rank = new Map<string, number>();
    for (const s of [...d.metrics].sort((a, b) => a.order - b.order)) {
      const def = defs.get(s.id);
      if (!def || !s.enabled || !def.available || NOT_COUNTED.has(s.id)) continue;
      const i = rank.get(def.group) ?? 0;
      rank.set(def.group, i + 1);
      out.set(
        s.id,
        i < LIMITS.compact[def.group] && s.id !== 'fps.graph' ? 'compact' : i < LIMITS.mid[def.group] ? 'mid' : 'full',
      );
    }
    return out;
  });

  protected readonly monitors = computed(() => {
    const list = this.t.catalog()?.monitors ?? [];
    if (!list.length) return { list: [], box: { x: 0, y: 0, w: 1, h: 1 } };
    const x = Math.min(...list.map((m) => m.x));
    const y = Math.min(...list.map((m) => m.y));
    const w = Math.max(...list.map((m) => m.x + m.width)) - x;
    const h = Math.max(...list.map((m) => m.y + m.height)) - y;
    return { list, box: { x, y, w, h } };
  });

  protected readonly selectedMonitor = computed<MonitorInfo | null>(() => {
    const list = this.t.catalog()?.monitors ?? [];
    const dev = this.draft()?.widget.monitor;
    return list.find((m) => m.device === dev) ?? list.find((m) => !m.primary) ?? list[0] ?? null;
  });

  protected readonly rules = computed(() => {
    const g = this.draft()?.games;
    if (!g) return [];
    const rows = [
      ...g.include.map((exe) => ({ exe, rule: 'include' as const })),
      ...g.ignore.map((exe) => ({ exe, rule: 'ignore' as const })),
    ].map((r) => ({ ...r, origin: origin(r.exe), fixed: r.exe.toLowerCase() === 'pitwall.exe' }));
    const f = this.ruleFilter();
    return f === 'all' ? rows : rows.filter((r) => r.rule === f);
  });
  protected readonly ruleCounts = computed(() => {
    const g = this.draft()?.games;
    return { include: g?.include.length ?? 0, ignore: g?.ignore.length ?? 0 };
  });

  protected readonly status = computed(() => {
    const d = this.draft();
    const m = this.selectedMonitor();
    const game = this.t.game();
    return {
      title: d?.widget.visible ? 'Widget ativo' : 'Widget oculto',
      line1: `Monitor ${m?.index ?? '?'}${d?.widget.locked ? ' · posição travada' : ''}`,
      line2: `${game ? 'Jogo: ' + game.exe : 'Sem jogo'} · ${fmtMs(d?.refreshMs ?? 500)}`,
    };
  });

  constructor() {
    effect(() => {
      const c = this.t.config();
      if (c && !untracked(() => this.saveTimer)) this.draft.set(structuredClone(c));
    });
    const off = this.t.onHost((msg) => {
      if (msg?.type === 'folderPicked') this.update((c) => (c.log.folder = msg.path));
      if (msg?.type === 'exePicked') this.newExe.set(msg.name);
    });
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    mq.addEventListener('change', onScheme);
    inject(DestroyRef).onDestroy(() => {
      off();
      mq.removeEventListener('change', onScheme);
    });
  }

  // ------------------------------------------------------------------ edição

  protected update(mutate: (c: AppConfig) => void) {
    const d = this.draft();
    if (!d) return;
    const next = structuredClone(d);
    mutate(next);
    this.draft.set(next);
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      const cur = this.draft();
      if (cur) this.t.saveConfig(cur);
    }, 300);
  }

  /** Atribui por caminho ("widget.locked", "log.folder"…). */
  protected patch(path: string, value: unknown) {
    this.update((c) => {
      const keys = path.split('.');
      let obj: any = c;
      for (const k of keys.slice(0, -1)) obj = obj[k];
      obj[keys[keys.length - 1]] = value;
    });
  }

  protected flip(path: string) {
    let obj: any = this.draft();
    for (const k of path.split('.')) obj = obj?.[k];
    this.patch(path, !obj);
  }

  protected isCustomAccent(accent: string | undefined) {
    return !!accent && !ACCENTS.some((a) => a.value === accent);
  }

  protected round(v: number) {
    return Math.round(v);
  }

  protected toggleBatteryDevice(key: string) {
    this.update((c) => {
      const h = c.battery.hidden;
      const i = h.indexOf(key);
      if (i >= 0) h.splice(i, 1);
      else h.push(key);
    });
  }

  protected setMetric(id: string, patch: Partial<MetricSetting>) {
    this.update((c) => {
      const m = c.metrics.find((x) => x.id === id);
      if (m) Object.assign(m, patch);
    });
  }

  protected numberOrNull(v: string): number | undefined {
    const n = parseFloat(v.replace(',', '.'));
    return isFinite(n) ? n : undefined;
  }

  protected drop(group: Group, e: CdkDragDrop<Row[]>) {
    if (e.previousIndex === e.currentIndex || this.search()) return;
    const ids = group.rows.map((r) => r.s.id);
    const orders = group.rows.map((r) => r.s.order).sort((a, b) => a - b);
    moveItemInArray(ids, e.previousIndex, e.currentIndex);
    this.update((c) => {
      ids.forEach((id, i) => {
        const m = c.metrics.find((x) => x.id === id);
        if (m) m.order = orders[i];
      });
    });
  }

  protected toggleGroup(key: MetricGroup) {
    this.collapsed.update((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  protected setGroupLabel(key: MetricGroup, value: string) {
    this.update((c) => {
      c.groupLabels ??= {};
      if (value.trim()) c.groupLabels[key] = value.trim();
      else delete c.groupLabels[key];
    });
  }

  protected unitOf(def: MetricDef) {
    return unitLabel(def);
  }

  protected setMonitor(m: MonitorInfo) {
    this.update((c) => {
      if (c.widget.monitor === m.device) return;
      c.widget.monitor = m.device;
      c.widget.x = 40;
      c.widget.y = 40;
    });
  }

  protected monitorStyle(m: MonitorInfo) {
    const { box } = this.monitors();
    const scale = Math.min(300 / box.w, 110 / box.h);
    return {
      left: `${(m.x - box.x) * scale}px`,
      top: `${(m.y - box.y) * scale}px`,
      width: `${m.width * scale - 6}px`,
      height: `${m.height * scale - 6}px`,
    };
  }

  protected monitorsBoxStyle() {
    const { box } = this.monitors();
    const scale = Math.min(300 / box.w, 110 / box.h);
    return { width: `${box.w * scale}px`, height: `${box.h * scale}px` };
  }

  protected addRule() {
    const exe = this.newExe().trim();
    if (!exe) return;
    const name = exe.toLowerCase().endsWith('.exe') ? exe : exe + '.exe';
    this.update((c) => {
      c.games.include = c.games.include.filter((x) => x.toLowerCase() !== name.toLowerCase());
      c.games.ignore = c.games.ignore.filter((x) => x.toLowerCase() !== name.toLowerCase());
      (this.newRule() === 'include' ? c.games.include : c.games.ignore).push(name);
    });
    this.newExe.set('');
  }

  protected setRule(exe: string, rule: 'include' | 'ignore') {
    this.update((c) => {
      c.games.include = c.games.include.filter((x) => x !== exe);
      c.games.ignore = c.games.ignore.filter((x) => x !== exe);
      (rule === 'include' ? c.games.include : c.games.ignore).push(exe);
    });
  }

  protected removeRule(exe: string) {
    this.update((c) => {
      c.games.include = c.games.include.filter((x) => x !== exe);
      c.games.ignore = c.games.ignore.filter((x) => x !== exe);
    });
  }

  protected restoreDefaults() {
    if (!this.confirmReset()) {
      this.confirmReset.set(true);
      setTimeout(() => this.confirmReset.set(false), 4000);
      return;
    }
    this.confirmReset.set(false);
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.t.send({ type: 'restoreDefaults' });
  }

  // ------------------------------------------------------------------ formatação

  protected fmtMs = fmtMs;

  /** Valores efetivos do ajuste de GPU para o preset escolhido (para mostrar na tela). */
  protected tuningTarget() {
    const d = this.draft()?.gpuTuning;
    const cat = this.t.catalog();
    if (!d || !cat?.tuning) return null;
    if (d.preset === 'custom') return { powerW: d.powerLimitW, clockMhz: d.maxClockMhz };
    return cat.tuningPresets?.[d.preset] ?? null;
  }

  protected pctOfDefault(w: number) {
    const def = this.t.catalog()?.tuning?.powerDefaultW || 1;
    return Math.round((w / def) * 100);
  }

  protected setCustom(patch: { powerLimitW?: number; maxClockMhz?: number }) {
    this.update((c) => {
      // Ao mexer nos controles, parte do preset atual
      if (c.gpuTuning.preset !== 'custom') {
        const p = this.tuningTarget();
        if (p) {
          c.gpuTuning.powerLimitW = p.powerW;
          c.gpuTuning.maxClockMhz = p.clockMhz;
        }
        c.gpuTuning.preset = 'custom';
      }
      Object.assign(c.gpuTuning, patch);
    });
  }

  protected fmtSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  protected sessionWhen(start: string) {
    const d = new Date(start);
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (d.toDateString() === today.toDateString()) return `hoje, ${time}`;
    if (d.toDateString() === yesterday.toDateString()) return `ontem, ${time}`;
    return `${d.toLocaleDateString('pt-BR', { weekday: 'long' })}, ${time}`;
  }

  protected sessionDuration(start: string, end?: string) {
    if (!end) return 'em andamento';
    const min = Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000));
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`;
  }

  protected monitorLabel(m: MonitorInfo | null) {
    if (!m) return 'Nenhum monitor';
    const orient = m.height > m.width ? 'vertical' : 'horizontal';
    return `Monitor ${m.index} · ${m.width} × ${m.height} · ${orient}${m.primary ? ' · principal' : ''}`;
  }

  protected isDarkOnly(theme: string | undefined) {
    return THEMES.find((x) => x.id === theme)?.darkOnly ?? false;
  }
}

function fmtMs(ms: number) {
  return ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
}

function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

function origin(exe: string) {
  const e = exe.toLowerCase();
  if (e === 'pitwall.exe') return 'O próprio app · fixo';
  if (BROWSERS.has(e)) return 'Navegador · padrão';
  if (DEFAULT_IGNORE.has(e)) return 'Padrão';
  return 'Adicionado manualmente';
}
