export type MetricGroup = 'fps' | 'gpu' | 'cpu' | 'ram' | 'other';

export interface MetricDef {
  id: string;
  group: MetricGroup;
  name: string;
  unit: string;
  isTemperature: boolean;
  available: boolean;
  /** De onde vem o valor: nome real do sensor no LibreHardwareMonitor, "PresentMon" ou "calculado". */
  source?: string;
  defaultWarn?: number;
  defaultCrit?: number;
}

export interface MetricSetting {
  id: string;
  enabled: boolean;
  label?: string;
  order: number;
  unit?: 'C' | 'F';
  warn?: number;
  crit?: number;
  sparkline: boolean;
}

export interface AppConfig {
  refreshMs: number;
  webSocketPort: number;
  appTheme: string;
  widgetTheme: string;
  themeMode: 'dark' | 'light' | 'system';
  accent: string;
  /** "auto" (idioma do Windows), "pt-BR" ou "en". */
  language?: 'auto' | 'pt-BR' | 'en';
  startWithWindows: boolean;
  autoOpenWidgetOnGame: boolean;
  primaryGpu: string;
  groupLabels: Record<string, string>;
  widget: {
    visible: boolean;
    monitor: string;
    x: number;
    y: number;
    width: number;
    height: number;
    alwaysOnTop: boolean;
    locked: boolean;
    layout: WidgetLayout;
  };
  log: { enabled: boolean; folder: string; intervalMs: number };
  gpuTuning: GpuTuningConfig;
  battery: { enabled: boolean; hidden: string[]; lowPercent: number };
  games: { autoDetect: boolean; include: string[]; ignore: string[] };
  metrics: MetricSetting[];
}

export interface WirelessDevice {
  key: string;
  name: string;
  via: string;
  kind: 'mouse' | 'headset' | 'keyboard' | 'gamepad' | 'phone';
  percent: number | null;
  levelText: string | null;
  charging: boolean;
  asleep: boolean;
  connected: boolean;
}

export interface GpuTuningConfig {
  enabled: boolean;
  preset: 'balanced' | 'cool' | 'custom';
  powerLimitW: number;
  maxClockMhz: number;
  onlyInGames: boolean;
}

export interface TuningCaps {
  supported: boolean;
  gpu?: string;
  powerMinW: number;
  powerMaxW: number;
  powerDefaultW: number;
  powerStartW: number;
  maxClockMhz: number;
  error?: string;
}

export interface TuningStatus {
  active: boolean;
  powerLimitW?: number;
  clockMaxMhz?: number;
  error?: string;
}

export interface MonitorInfo {
  device: string;
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  primary: boolean;
}

export interface Catalog {
  type: 'catalog';
  version?: string;
  /** Idioma resolvido pelo backend ("auto" → idioma do Windows). */
  lang?: 'pt-BR' | 'en';
  admin?: boolean;
  presentMon?: boolean;
  battery?: boolean;
  hardware: { cpu?: string; gpu?: string; gpu2?: string };
  monitors: MonitorInfo[];
  metrics: MetricDef[];
  tuning?: TuningCaps;
  tuningPresets?: Record<string, { powerW: number; clockMhz: number }>;
}

export interface GameSession {
  exe: string;
  start: string;
  end?: string;
}

export interface LogStatus {
  file: string;
  size: number;
}

export type WidgetLayout = 'auto' | 'full' | 'mid' | 'compact';

export type ThemeName = 'lumen' | 'minimo' | 'neon' | 'terminal' | 'splash';

export const THEMES: { id: ThemeName; name: string; darkOnly?: boolean }[] = [
  { id: 'minimo', name: 'Mínimo' },
  { id: 'neon', name: 'Neon', darkOnly: true },
  { id: 'terminal', name: 'Terminal', darkOnly: true },
  { id: 'lumen', name: 'Lumen' },
  { id: 'splash', name: 'Splash' },
];

export interface GameInfo {
  exe: string;
  mode: string;
}

export type ServerMessage =
  | Catalog
  | { type: 'config'; config: AppConfig }
  | {
      type: 'snapshot';
      t: number;
      game: GameInfo | null;
      values: Record<string, number | null>;
      frames?: number[];
      log?: LogStatus | null;
      tuning?: TuningStatus;
      /** Por que não há FPS (captura bloqueada etc.). null = capturando normalmente. */
      fpsStatus?: string | null;
      batteries?: WirelessDevice[] | null;
    }
  | { type: 'sessions'; sessions: GameSession[] }
  | { type: 'error'; message: string };

export type Level = 'ok' | 'warn' | 'crit';

/** Métrica pronta para exibir. */
export interface MetricView {
  id: string;
  label: string;
  value: number | null;
  text: string;
  unit: string;
  level: Level;
  sparkline: boolean;
  isTemperature: boolean;
}
