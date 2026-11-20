import type { Dict } from '../i18n';
import type { LayoutSize } from './auto-layout';
import { AppConfig, Catalog, Extremes, Level, MetricDef, MetricGroup, MetricView, ThemeName } from '../models';

/**
 * Métricas com pico da sessão nos tiles do completo: temperaturas, consumo (W), clock (MHz) e fan.
 * Uso (%), RAM e FPS não têm (mín/máx de FPS fica no resumo pós-jogo).
 */
export function hasPeak(def: MetricDef) {
  return def.isTemperature || def.unit === 'W' || def.unit === 'MHz' || def.id.startsWith('gpu.fan');
}

/** Médio: só nos chips de temperatura, power e clock. */
export function hasChipPeak(m: MetricView) {
  return !!m.peak && (m.isTemperature || m.unit === 'W' || m.unit === 'MHz');
}

/** Métricas habilitadas e disponíveis de um grupo, na ordem configurada, prontas para exibir. */
export function buildViews(
  config: AppConfig | null,
  defs: Map<string, MetricDef>,
  values: Record<string, number | null>,
  group: MetricGroup,
  /** Mín/máx da sessão; null = sem picos (ocioso). */
  extremes: Extremes | null = null,
): MetricView[] {
  const settings = config?.metrics ?? [];
  const out: MetricView[] = [];
  for (const s of [...settings].sort((a, b) => a.order - b.order)) {
    const def = defs.get(s.id);
    if (!def || def.group !== group || !s.enabled || !def.available || def.unit === 'text') continue;
    const raw = values[s.id] ?? null;
    const fahrenheit = def.isTemperature && s.unit === 'F';
    const shown = raw == null ? null : fahrenheit ? (raw * 9) / 5 + 32 : raw;
    const max = extremes && hasPeak(def) ? extremes[s.id]?.[1] : undefined;
    out.push({
      id: s.id,
      label: s.label || def.name,
      value: raw,
      text: formatValue(shown, def.unit),
      unit: unitLabel(def, fahrenheit),
      level: level(raw, s.warn, s.crit),
      sparkline: s.sparkline && def.isTemperature,
      isTemperature: def.isTemperature,
      peak:
        max == null
          ? null
          : { text: formatValue(fahrenheit ? (max * 9) / 5 + 32 : max, def.unit), level: level(max, s.warn, s.crit) },
    });
  }
  return out;
}

export function unitLabel(def: MetricDef, fahrenheit = false) {
  if (def.isTemperature) return fahrenheit ? '°F' : '°C';
  return def.unit === 'fps' || def.unit === 'graph' || def.unit === 'text' ? '' : def.unit;
}

export function level(v: number | null, warn?: number | null, crit?: number | null): Level {
  if (v == null) return 'ok';
  if (crit != null && v >= crit) return 'crit';
  if (warn != null && v >= warn) return 'warn';
  return 'ok';
}

export function formatValue(v: number | null, unit: string): string {
  if (v == null || !isFinite(v)) return '—';
  switch (unit) {
    case 'ms':
    case 'GB':
      return v.toFixed(1);
    case 'MB/s':
      return v < 10 ? v.toFixed(2) : v.toFixed(1);
    case 'V':
      return v.toFixed(3);
    default:
      return Math.round(v).toString();
  }
}

export function isDarkTheme(config: AppConfig | null, theme: ThemeName, systemDark: boolean) {
  if (theme === 'neon' || theme === 'terminal') return true;
  const mode = config?.themeMode ?? 'dark';
  return mode === 'system' ? systemDark : mode === 'dark';
}

/** Nome do bloco no widget: o que o usuário definiu, senão derivado do hardware ("RTX 3080", "i5-12600K"). */
export function groupLabel(config: AppConfig | null, group: MetricGroup, catalog: Catalog | null, s: Dict) {
  const custom = config?.groupLabels?.[group];
  if (custom) return custom;
  switch (group) {
    case 'gpu':
      return shortGpu(catalog?.hardware.gpu);
    case 'cpu':
      return shortCpu(catalog?.hardware.cpu);
    case 'ram':
      return s.groupRam;
    case 'fps':
      return 'FPS';
    default:
      return s.groupOther;
  }
}

export function shortGpu(name?: string) {
  if (!name) return 'GPU';
  const m = name.match(/(?:RTX|GTX|RX|Arc)\s*\w+(?:\s*(?:Ti|Super|XT|XTX))?/i);
  return m ? m[0] : name.replace(/NVIDIA|GeForce|AMD|Radeon/gi, '').trim();
}

export function shortCpu(name?: string) {
  if (!name) return 'CPU';
  const m = name.match(/(?:i[3579]|Ultra \d|Ryzen \d)[- ]?\w+/i);
  return m ? m[0] : name;
}

export type { LayoutSize } from './auto-layout';

/**
 * Quantas métricas cada layout mostra por grupo, na ordem de prioridade (a ordem de arrastar da configuração).
 * O uso (%) conta como um dos itens. "Outros" só aparece no completo. FPS inclui o próprio FPS.
 */
export const LIMITS: Record<Exclude<LayoutSize, 'full'>, Record<MetricGroup, number>> = {
  compact: { gpu: 4, cpu: 3, ram: 1, other: 0, fps: 2 },
  mid: { gpu: 6, cpu: 4, ram: 2, other: 0, fps: 3 },
  // 1.2 faixa: GPU = uso + grade 3×2; CPU = uso + 3 tiles; RAM = uso + usada; FPS + 1% + 0,1% + frametime + gráfico.
  // "Outros" só na 5ª coluna da faixa larga (2560×720).
  strip: { gpu: 7, cpu: 4, ram: 2, other: 2, fps: 5 },
  // 1.2 telinha: 6 células (GPU uso, núcleo, hot spot, …, CPU, RAM) e FPS + 1% low + frametime
  mini: { gpu: 4, cpu: 1, ram: 1, other: 0, fps: 3 },
};

/** "máx 101 °C": pico com a unidade (temperatura com espaço, como nas tabelas). */
export function peakText(m: MetricView): string {
  return m.peak ? (m.unit ? `${m.peak.text} ${m.unit}` : m.peak.text) : '';
}

/** ram.total é mostrado junto com ram.used ("18.4 / 32 GB"), não conta como item separado. */
export const NOT_COUNTED = new Set(['ram.total']);
