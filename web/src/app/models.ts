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
  log: {
    enabled: boolean;
    folder: string;
    intervalMs: number;
    /** v0.7: apaga CSVs mais velhos que isso (dias). 0 = não apaga por idade. Padrão 30. */
    keepDays?: number;
    /** v0.7: teto do total da pasta (MB), apaga os mais antigos. 0 = sem teto. Padrão 500. */
    maxTotalMb?: number;
  };
  gpuTuning: GpuTuningConfig;
  battery: { enabled: boolean; hidden: string[]; lowPercent: number };
  games: {
    autoDetect: boolean;
    include: string[];
    ignore: string[];
    /** v0.7: perfil por exe (chave sem diferenciar maiúsculas). */
    profiles?: Record<string, GameProfile>;
    /** v0.7: exes recusados em "Marcar como jogo?". */
    dismissedSuggestions?: string[];
  };
  /** v0.7 (o backend sempre manda). */
  alerts?: AlertsConfig;
  /** v0.7 (o backend sempre manda). */
  remote?: RemoteConfig;
  update?: UpdateConfig;
  metrics: MetricSetting[];
}

/** v0.7: aviso do Windows quando uma métrica fica >= vermelho por 5 s. */
export interface AlertsConfig {
  enabled: boolean;
  sound: boolean;
  minIntervalMin: number;
}

/** v0.7: visualização no celular pela rede local. */
export interface RemoteConfig {
  enabled: boolean;
  port: number;
  /** Só leitura para a página: muda por startPairing/revokeDevice. Vem sem o hash do token. */
  pairedDevices: PairedDevice[];
}

export interface PairedDevice {
  id: string;
  name: string;
  /** ISO 8601. */
  created: string;
}

export type TuningPreset = 'off' | 'balanced' | 'cool' | 'custom';

/** v0.7: aplicado quando o jogo começa e desfeito quando termina. Campo ausente = usa a config geral. */
export interface GameProfile {
  tuningPreset?: TuningPreset;
  layout?: WidgetLayout;
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
  update?: UpdateState;
  /** v0.7: a última sessão não terminou ou houve Kernel-Power 41 depois dela. Some após dismissCrashReport. */
  crashReport?: CrashReport;
  /** v0.7: estado do servidor do celular (só no socket local). */
  remote?: { running: boolean; port?: number; error?: string };
}

/** v0.7: ids das séries do relatório de crash. */
export type CrashSeriesId = 'gpu.temp' | 'gpu.hotspot' | 'gpu.power' | 'gpu.clock' | 'fps.current' | 'cpu.temp';

export interface CrashReport {
  reason: 'unfinishedSession' | 'kernelPower41' | 'both';
  session: GameSession;
  /** Hora estimada do crash (ISO 8601). */
  time: string;
  kernelPowerTime?: string;
  /** Intervalo entre pontos das séries (ms). */
  intervalMs: number;
  /** Últimos ~60 s, do mais antigo para o mais novo; null = sem leitura. Ausente se o buffer não é desta sessão. */
  series?: Partial<Record<CrashSeriesId, (number | null)[]>>;
  csvFile?: string;
}

/** Atualizador (docs/updater.md). */
export interface UpdateConfig {
  autoCheck: boolean;
  channel: UpdateChannel;
  /** Versão que o usuário mandou pular. */
  skippedVersion?: string;
}

export type UpdateChannel = 'stable' | 'beta';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';

export interface UpdateState {
  status: UpdateStatus;
  /** Versão em execução. */
  current: string;
  /** Versão nova (available/downloading/ready). */
  version?: string;
  /** Página da release no GitHub. */
  notesUrl?: string;
  /** Notas da release em markdown, truncadas. Vem da internet: renderizar sanitizado. */
  notes?: string;
  channel: UpdateChannel;
  /** 0–100 durante o download. */
  progress?: number;
  /** Mensagem já traduzida. */
  error?: string;
  /** O usuário escolheu "atualizar ao sair". */
  installOnExit: boolean;
  /** "Atualizar agora" pedido com jogo aberto: instala quando o jogo fechar. */
  waitingForGame: boolean;
  lastCheck?: string;
}

/** Mensagens do atualizador enviadas pela página. */
export type UpdateCommand =
  | { type: 'checkUpdate' }
  | { type: 'installUpdate'; when: 'now' | 'exit' }
  | { type: 'skipUpdate' }
  | { type: 'setUpdateChannel'; channel: UpdateChannel }
  | { type: 'getUpdate' };

export interface GameSession {
  exe: string;
  start: string;
  end?: string;
  // v0.7: estatísticas (opcionais: sessões antigas não têm)
  durationSec?: number;
  avgFps?: number;
  low1?: number;
  low01?: number;
  peakGpuTemp?: number;
  peakHotspot?: number;
  peakHotspotDelta?: number;
  peakGpuPower?: number;
  /** Segundos com a métrica >= amarelo (inclui o tempo no vermelho), por id. */
  secondsAboveWarn?: Record<string, number>;
  /** Segundos com a métrica >= vermelho, por id. */
  secondsAboveCrit?: Record<string, number>;
  csvFile?: string;
}

/** v0.7: valor de gpu.perfcap (snapshot.texts). */
export type PerfCapReason = 'thermal' | 'power' | 'voltage' | 'idle' | 'sync' | 'none';

/** v0.7: [mín, máx] por id de métrica. */
export type Extremes = Record<string, [number, number]>;

/** v0.7: parte de snapshot com o que mudou no mín/máx. Epoch diferente do conhecido = descartar e recomeçar. */
export interface ExtremesDelta {
  epoch: number;
  values: Extremes;
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
      /** v0.7: métricas de texto (ex.: "gpu.perfcap": PerfCapReason). */
      texts?: Record<string, string | null>;
      /** v0.7: só quando algo mudou, no máximo 1x/s. */
      extremes?: ExtremesDelta;
      /** v0.7: perfil do jogo atual; layout (se houver) vale no lugar de config.widget.layout. */
      profile?: { exe: string; tuningPreset?: TuningPreset; layout?: WidgetLayout } | null;
      /** v0.7: "Marcar como jogo?". */
      gameSuggestion?: { exe: string } | null;
      presentMonError?: string | null;
    }
  | { type: 'sessions'; sessions: GameSession[] }
  | { type: 'update'; update: UpdateState }
  | { type: 'error'; message: string }
  // v0.7
  | ({ type: 'extremes' } & ExtremesDelta)
  | PairingMessage
  | { type: 'devices'; devices: PairedDevice[]; /** id do que acabou de parear */ paired?: string };

/** v0.7: resposta a startPairing (só para quem pediu). */
export type PairingMessage =
  | { type: 'pairing'; ok: true; url: string; urls: string[]; expiresAt: string }
  | { type: 'pairing'; ok: false; error: 'disabled' | 'notRunning' | 'noNetwork'; message?: string };

/** v0.7: mensagens da página local para o backend. */
export type ClientMessage =
  | { type: 'setConfig'; config: AppConfig }
  | { type: 'placeTopRight'; layout: 'compact' | 'mid' }
  | { type: 'refreshBatteries' }
  | { type: 'restoreDefaults' }
  | { type: 'getState' }
  | { type: 'resetExtremes' }
  | { type: 'dismissCrashReport' }
  | { type: 'acceptGameSuggestion'; exe?: string }
  | { type: 'dismissGameSuggestion'; exe?: string }
  | { type: 'startPairing' }
  | { type: 'listDevices' }
  | { type: 'revokeDevice'; id: string }
  // atualizador
  | { type: 'checkUpdate' }
  | { type: 'installUpdate'; when: 'now' | 'exit' }
  | { type: 'skipUpdate' }
  | { type: 'setUpdateChannel'; channel: 'stable' | 'beta' }
  | { type: 'getUpdate' };

/** v0.7: config sanitizada que o celular recebe (socket da rede). */
export interface RemoteViewConfig {
  refreshMs: number;
  appTheme: string;
  widgetTheme: string;
  themeMode: 'dark' | 'light' | 'system';
  accent: string;
  language?: 'auto' | 'pt-BR' | 'en';
  groupLabels: Record<string, string>;
  widget: { layout: WidgetLayout };
  battery: { enabled: boolean; hidden: string[]; lowPercent: number };
  metrics: MetricSetting[];
}

/** v0.7: mensagens do celular para o socket da rede (/ws na porta Remote.port). */
export type RemoteClientMessage =
  | { type: 'auth'; token: string }
  | { type: 'pair'; code: string; name?: string }
  | { type: 'ping' };

/** v0.7: mensagens do socket da rede para o celular. catalog vem sem tuning/monitores/crashReport/remote/admin. */
export type RemoteServerMessage =
  | { type: 'auth'; ok: true; deviceId: string; name: string }
  | { type: 'auth'; ok: false; error: 'invalidToken' }
  | { type: 'paired'; ok: true; deviceId: string; name: string; token: string }
  | { type: 'paired'; ok: false; error: 'invalidCode' | 'expired' | 'noPending' }
  | { type: 'pong'; t: number }
  | Catalog
  | { type: 'config'; config: RemoteViewConfig }
  | Extract<ServerMessage, { type: 'snapshot' }>;

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
