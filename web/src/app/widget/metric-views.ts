import { AppConfig, Catalog, Level, MetricDef, MetricGroup, MetricView, ThemeName } from '../models';

/** Métricas habilitadas e disponíveis de um grupo, na ordem configurada, prontas para exibir. */
export function buildViews(
  config: AppConfig | null,
  defs: Map<string, MetricDef>,
  values: Record<string, number | null>,
  group: MetricGroup,
): MetricView[] {
  const settings = config?.metrics ?? [];
  const out: MetricView[] = [];
  for (const s of [...settings].sort((a, b) => a.order - b.order)) {
    const def = defs.get(s.id);
    if (!def || def.group !== group || !s.enabled || !def.available) continue;
    const raw = values[s.id] ?? null;
    const fahrenheit = def.isTemperature && s.unit === 'F';
    const shown = raw == null ? null : fahrenheit ? (raw * 9) / 5 + 32 : raw;
    out.push({
      id: s.id,
      label: s.label || def.name,
      value: raw,
      text: formatValue(shown, def.unit),
      unit: unitLabel(def, fahrenheit),
      level: level(raw, s.warn, s.crit),
      sparkline: s.sparkline && def.isTemperature,
      isTemperature: def.isTemperature,
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
export function groupLabel(config: AppConfig | null, group: MetricGroup, catalog: Catalog | null) {
  const custom = config?.groupLabels?.[group];
  if (custom) return custom;
  switch (group) {
    case 'gpu':
      return shortGpu(catalog?.hardware.gpu);
    case 'cpu':
      return shortCpu(catalog?.hardware.cpu);
    case 'ram':
      return 'Memória';
    case 'fps':
      return 'FPS';
    default:
      return 'Outros';
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

export type LayoutSize = 'full' | 'mid' | 'compact';

/**
 * Quantas métricas cada layout mostra por grupo, na ordem de prioridade (a ordem de arrastar da configuração).
 * O uso (%) conta como um dos itens. "Outros" só aparece no completo. FPS inclui o próprio FPS.
 */
export const LIMITS: Record<Exclude<LayoutSize, 'full'>, Record<MetricGroup, number>> = {
  compact: { gpu: 4, cpu: 3, ram: 1, other: 0, fps: 2 },
  mid: { gpu: 6, cpu: 4, ram: 2, other: 0, fps: 3 },
};

/** ram.total é mostrado junto com ram.used ("18.4 / 32 GB"), não conta como item separado. */
export const NOT_COUNTED = new Set(['ram.total']);
