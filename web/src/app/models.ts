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
  /** 1.2: por que não há leitura (só com available = false). */
  missing?: MissingReason;
  /** 1.2: explicação pronta (idioma do backend), ex.: "A NVIDIA tirou o hot spot das RTX 50". */
  missingText?: string;
}

/** 1.2: motivo de um sensor sem leitura. */
export type MissingReason = 'notExposed' | 'needsNvidia' | 'needsPawnIO' | 'needsAdmin' | 'noDevice' | 'needsPresentMon' | 'off';

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
  /** v0.7: assistente de primeira execução concluído (ou pulado). Config antiga vira true na migração v5. */
  firstRunDone?: boolean;
  /**
   * 1.0: tutorial das configurações visto (ou pulado). false → a página mostra o tutorial (depois do assistente, se
   * firstRunDone também for false) e manda setConfig com true ao terminar. Instalação nova = false; config antiga = true
   * (migração v6). "Rever tutorial" (bandeja ou { type: 'replayTutorial' }) volta para false.
   */
  tutorialDone?: boolean;
  /** 1.0: progresso do tour das configurações. tutorialDone continua como apelido de tour.done; replayTutorial zera. */
  tour?: TourState;
  /** 1.0: visual das configurações, do assistente e do tour (o widget usa widgetTheme/themeMode). Padrão "system". */
  appearance?: AppAppearance;
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
    /** Apaga CSVs mais velhos que isso (dias). 1.0: só 1, 5, 15, 30, 90 ou 0 (= para sempre). Padrão 30. */
    keepDays?: LogKeepDays;
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
  /** 1.0 (o backend sempre manda): recursos desligáveis. Ver docs/protocol.md, "Recursos / feature switches". */
  features?: FeaturesConfig;
  /** 1.2: atalhos globais. */
  hotkeys?: HotkeysConfig;
  metrics: MetricSetting[];
}

/** 1.0: tema das configurações. "system" segue o prefers-color-scheme do Windows. */
export type AppAppearance = 'system' | 'light' | 'dark';

/** 1.0: tour de 8 passos. step = último passo visto (0 = nunca começou). */
export interface TourState {
  step: number;
  done: boolean;
  dismissed: boolean;
}

/** 1.0: valores aceitos em log.keepDays (0 = para sempre). Outro valor é ajustado pelo backend. */
export type LogKeepDays = 0 | 1 | 5 | 15 | 30 | 90;
export const LOG_KEEP_DAYS: LogKeepDays[] = [1, 5, 15, 30, 90, 0];

/** 1.0: desligado = o backend não faz nada daquilo (custo ~0). Padrão: tudo true. */
export interface FeaturesConfig {
  /** Buffer de 60 s em disco durante o jogo + relatório/balão de crash. Off: catalog.crashReport some. */
  crashReport: boolean;
  /** "Marcar como jogo?". Off: snapshot.gameSuggestion sempre null. */
  gameSuggestions: boolean;
  /** Mín/máx da sessão. Off: sem mensagem extremes nem snapshot.extremes. */
  sessionPeaks: boolean;
  /** Motivo do limite de clock (NVML). Off: sem texts['gpu.perfcap'], snapshot.clockReasons nem session.clockReasonSec. */
  clockReason: boolean;
  /** Ao terminar um jogo, abre as configurações no resumo da sessão (padrão: desligado). */
  openSummaryOnGameEnd?: boolean;
  /** 1.2: conta engasgos na sessão (padrão true). */
  stutters?: boolean;
}

/** 1.2: "Ctrl+Alt+Shift+Win+Tecla" (A–Z, 0–9, F1–F24); vazio = desligado. */
export interface HotkeysConfig {
  enabled: boolean;
  toggleWidget: string;
  marker: string;
}

/** v0.7: aviso do Windows quando uma métrica fica >= vermelho por 5 s. */
export interface AlertsConfig {
  enabled: boolean;
  sound: boolean;
  minIntervalMin: number;
  /** Segundos no vermelho antes do aviso (padrão 10). */
  sustainSec?: number;
}

/** v0.7: visualização no celular pela rede local. */
export interface RemoteConfig {
  enabled: boolean;
  port: number;
  /** Só leitura para a página: muda por startPairing/revokeDevice. Vem sem o hash do token. */
  pairedDevices: PairedDevice[];
  /** 1.2: GET /api/v1/state com token (Home Assistant). Precisa de enabled. */
  apiEnabled?: boolean;
}

export interface PairedDevice {
  id: string;
  name: string;
  /** ISO 8601. */
  created: string;
  /** 1.0: ISO 8601. Última autenticação ou presença (gravado no máximo 1x/min enquanto conectado). Ausente = nunca. */
  lastSeen?: string;
  /** 1.0: conectado agora ("Vendo agora"). Só na mensagem devices (não no config). */
  online?: boolean;
  /** 1.0: tipo pelo user agent, para o ícone. Ausente = "unknown". */
  kind?: DeviceKind;
}

export type DeviceKind = 'phone' | 'tv' | 'desktop' | 'integration' | 'unknown';

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
  hardware: { cpu?: string; gpu?: string; gpu2?: string; ramGb?: number; os?: string; gpuDriver?: string };
  monitors: MonitorInfo[];
  metrics: MetricDef[];
  tuning?: TuningCaps;
  tuningPresets?: Record<string, { powerW: number; clockMhz: number }>;
  update?: UpdateState;
  /** v0.7: a última sessão não terminou ou houve Kernel-Power 41 depois dela. Some após dismissCrashReport. */
  crashReport?: CrashReport;
  /** v0.7: estado do servidor do celular (só no socket local). */
  remote?: { running: boolean; port?: number; error?: string };
  /** 1.0: versões dos componentes, para App › Sobre. Ausente = backend antigo. */
  about?: AboutInfo;
  /** 1.2: incidente do PC ainda não visto (balão / banner). */
  pcPending?: PcIncidentSummary;
  /** 1.2: estado de registro dos atalhos. */
  hotkeys?: HotkeyStatus;
}

/** 1.0: versões mostradas em App › Sobre (texto livre vindo do backend; ausente/null = não encontrado). */
export interface AboutInfo {
  app: string;
  dotnet?: string | null;
  webView2?: string | null;
  presentMon?: string | null;
  pawnIO?: string | null;
}

/** 1.0: resposta a getLogStats. Com keepDays/maxTotalMb hipotéticos, "wouldDelete*" é a prévia da próxima limpeza. */
export interface LogStats {
  type: 'logStats';
  totalBytes: number;
  files: number;
  /** ISO 8601 do CSV mais antigo; null sem arquivos. */
  oldest: string | null;
  wouldDeleteFiles: number;
  wouldDeleteBytes: number;
}

/** 1.0: resposta a getSessions (histórico paginado, mais novas primeiro). */
export interface SessionsPage {
  type: 'sessionsPage';
  total: number;
  offset: number;
  sessions: GameSession[];
}

/** 1.0: erros do pareamento por código (resposta "paired" com ok: false). */
export type PairError = 'invalidCode' | 'expired' | 'noPending' | 'blocked';

/** 1.0: páginas das configurações (ids estáveis, usados nos deep links #/settings/<page>/<anchor>). */
export type SettingsPage = 'overview' | 'monitor' | 'health' | 'widget' | 'metrics' | 'alerts' | 'games' | 'sessions' | 'gpu' | 'devices' | 'features' | 'app';

/** Mensagens do host nativo (WebView2) para a página. */
export type HostMessage =
  | { type: 'folderPicked'; path: string }
  | { type: 'exePicked'; name: string }
  /** 1.0: abre uma página das configurações (balão de queda → sessions/crash, aviso de alerta → sessions). */
  | { type: 'navigate'; page: SettingsPage; anchor?: string }
  /** 1.0: "Rever tutorial" na bandeja com a janela já aberta. */
  | { type: 'startTutorial' };

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
  /** Tamanho do instalador em bytes (quando há versão disponível). */
  size?: number | null;
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
  /** 1.0: segundos por motivo do limite de clock na sessão (soma = tempo com leitura do NVML). */
  clockReasonSec?: Partial<Record<PerfCapReason, number>>;
  csvFile?: string;
  // 1.2: médias, engasgos e marcadores (opcionais: sessões antigas não têm)
  avgGpuTemp?: number;
  avgHotspot?: number;
  avgGpuPower?: number;
  avgGpuClock?: number;
  avgGpuLoad?: number;
  avgCpuTemp?: number;
  avgCpuLoad?: number;
  peakCpuTemp?: number;
  /** Engasgos na sessão (docs/v12-contract.md › Engasgo). Ausente = não contado (features.stutters off ou sessão antiga). */
  stutters?: number;
  markers?: SessionMarker[];
  /** Média do |MsAnimationError| (PresentMon 2.x). */
  animErrorMs?: number;
  /** Média do MsPCLatency (PresentMon 2.x), se existir. */
  pcLatencyMs?: number;
  /** A sessão terminou numa queda do PC (incidente com este id). */
  endedByCrash?: boolean;
  incidentId?: string;
  /** Hardware no momento da sessão (card de compartilhar). */
  gpu?: string;
  cpu?: string;
}

/** 1.2: marcador (atalho ou botão "Marcar momento"). t = segundos desde o início da sessão. */
export interface SessionMarker {
  t: number;
  /** ISO 8601. */
  at: string;
  note?: string;
  /** De onde veio (ausente nos marcadores antigos). */
  via?: 'hotkey' | 'button';
}

/** 1.2: séries do buffer do PC (pc-ring.json). */
export type PcSeriesId =
  | 'gpu.temp' | 'gpu.hotspot' | 'gpu.memjunction' | 'gpu.power' | 'gpu.clock' | 'gpu.load' | 'gpu.fan'
  | 'cpu.temp' | 'cpu.power' | 'cpu.load' | 'ram.load' | 'fps.current';

/** 1.2: tipo de incidente do PC. */
export type PcIncidentKind = 'abruptShutdown' | 'bugcheck';

/** 1.2: evento do Windows (log System), só dados, sem diagnóstico. */
export interface PcEvent {
  /** ISO 8601. */
  time: string;
  kind: 'kernelPower41' | 'unexpectedShutdown' | 'bugcheck' | 'whea' | 'gpuReset';
  /** Provedor + id, ex.: "Microsoft-Windows-WHEA-Logger 17". */
  source: string;
  eventId: number;
  /** WHEA erro/crítico. */
  fatal?: boolean;
  /** BugCheck: "0x00000124"; WHEA: componente ("PCI Express Root Port", "Processor Core"). */
  code?: string;
  /** Texto do evento (primeira linha, sem dados pessoais). */
  message?: string;
}

export interface PcIncidentSummary {
  id: string;
  kind: PcIncidentKind;
  /** Hora estimada (última gravação do buffer). ISO 8601. */
  time: string;
  /** Hora em que o PC voltou (boot). */
  bootTime?: string;
  /** Jogo aberto na hora, se havia. */
  exe?: string;
  sessionStart?: string;
  /** Ligado há N s quando caiu. */
  uptimeSec?: number;
  /** Eventos do Windows a ±10 min. */
  events: PcEvent[];
  seen: boolean;
}

/** 1.2: uma leitura de "últimas medições". */
export interface PcReading {
  id: string;
  name: string;
  group: MetricGroup;
  value: number | null;
  unit: string;
}

export interface PcIncident extends PcIncidentSummary {
  intervalMs: number;
  /** Últimos 120 s, do mais antigo para o mais novo; null = sem leitura. */
  series: Partial<Record<PcSeriesId, (number | null)[]>>;
  /** Todas as métricas na última gravação antes da queda. */
  last: PcReading[];
  csvFile?: string;
}

export interface PcReport {
  type: 'pcReport';
  /** ISO 8601. */
  bootTime: string;
  uptimeSec: number;
  /** Última saída normal do Pitwall (ISO), se conhecida. */
  lastCleanExit?: string;
  incidents: PcIncidentSummary[];
  /** Eventos dos últimos 30 dias, mais novos primeiro (≤ 200). */
  events: PcEvent[];
  /** features.crashReport desligado = buffer parado. */
  ringActive: boolean;
}

/** 1.2: motivo de não haver FPS (snapshot.texts['fps.reason']). */
export type FpsReason = 'noGame' | 'starting' | 'antiCheat' | 'noPresentMon' | 'otherCapture' | 'noFrames' | 'notAdmin';

/** 1.2: estado dos atalhos. */
export type HotkeyState = 'ok' | 'inUse' | 'invalid' | 'off';
export interface HotkeyStatus {
  toggleWidget: HotkeyState;
  marker: HotkeyState;
}

/** 1.2: resposta a getSessionSeries (do CSV da sessão, reamostrado). */
export interface SessionSeries {
  type: 'sessionSeries';
  start: string;
  /** Segundos entre pontos. */
  stepSec: number;
  series: Partial<Record<'fps.current' | 'fps.low1' | 'gpu.temp' | 'gpu.hotspot' | 'gpu.power' | 'gpu.clock' | 'cpu.temp' | 'cpu.load', (number | null)[]>>;
  /** false = sem CSV da sessão (apagado pela retenção ou gravação desligada). */
  available: boolean;
}

/** 1.2: resposta a getSensorDump (texto pronto para colar numa issue). */
export interface SensorDump {
  type: 'sensorDump';
  text: string;
}

/** 1.2: resposta a createApiToken. O token só aparece aqui, uma vez. */
export interface ApiToken {
  type: 'apiToken';
  token: string;
  device: PairedDevice;
}

/** 1.2: broadcast quando um marcador é gravado. */
export interface MarkerMessage {
  type: 'marker';
  index: number;
  at: string;
  exe?: string;
  via?: 'hotkey' | 'button';
}

/** 1.2: mín/máx desde que o app abriu (Monitor). Completo ao conectar; depois só as mudanças em snapshot.extremesApp. */
export interface ExtremesAppMessage {
  type: 'extremesApp';
  /** ISO: quando o Pitwall abriu. */
  since: string;
  /** ISO: quando o Windows ligou (Ligado há). */
  bootTime: string;
  values: Extremes;
}

/** 1.2: mensagens novas do cliente (somar à ClientMessage). */
export type ClientMessage12 =
  | { type: 'getPcReport' }
  | { type: 'getPcIncident'; id: string }
  | { type: 'dismissPcIncident'; id: string }
  | { type: 'getSessionSeries'; start: string; points?: number }
  | { type: 'addMarker'; note?: string }
  | { type: 'getSensorDump' }
  | { type: 'createApiToken'; name: string };


/** v0.7: valor de gpu.perfcap (snapshot.texts). */
export type PerfCapReason = 'thermal' | 'power' | 'voltage' | 'idle' | 'sync' | 'none';

/** 1.0: snapshot.clockReasons — segundos por motivo na sessão atual (live) ou, fora de jogo, na última. */
export interface ClockReasonStats {
  live: boolean;
  exe: string;
  sec: Partial<Record<PerfCapReason, number>>;
}

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

export type WidgetLayout = 'auto' | 'full' | 'mid' | 'compact' | 'strip' | 'mini';

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
      /** 1.0: ausente sem dados ou com features.clockReason desligado. */
      clockReasons?: ClockReasonStats;
      presentMonError?: string | null;
      /** 1.2: mín/máx desde que o app abriu, só o que mudou (no máximo a cada 5 s; só no socket local). */
      extremesApp?: Extremes;
    }
  | { type: 'sessions'; sessions: GameSession[] }
  | SessionsPage
  | LogStats
  | { type: 'update'; update: UpdateState }
  | { type: 'error'; message: string }
  // v0.7
  | ({ type: 'extremes' } & ExtremesDelta)
  | PairingMessage
  | { type: 'devices'; devices: PairedDevice[]; /** id do que acabou de parear */ paired?: string }
  // 1.2
  | PcReport
  | ({ type: 'pcIncident' } & PcIncident)
  | SessionSeries
  | SensorDump
  | ApiToken
  | MarkerMessage
  | ExtremesAppMessage;

/** v0.7: resposta a startPairing (só para quem pediu). */
export type PairingMessage =
  | {
      type: 'pairing';
      ok: true;
      /** 1.0: 6 dígitos, para mostrar grande ao lado do QR (digitar na TV/celular). */
      code: string;
      /** QR: http://<ip>:<porta>/index.html#/mobile?pair=<code> */
      url: string;
      urls: string[];
      /** 1.0: endereço curto para digitar (http://<ip>:<porta>/), que abre a tela de código. */
      typeUrl: string;
      typeUrls: string[];
      expiresAt: string;
    }
  | { type: 'pairing'; ok: false; error: 'disabled' | 'notRunning' | 'noNetwork'; message?: string };

/** v0.7: mensagens da página local para o backend. */
export type ClientMessage =
  | { type: 'setConfig'; config: AppConfig }
  /** corner (1.2, opcional): tl | tr | bl | br; padrão tr. */
  | { type: 'placeTopRight'; layout: 'compact' | 'mid'; corner?: 'tl' | 'tr' | 'bl' | 'br' }
  /** 1.2: o widget ocupa o monitor inteiro (telinhas e faixas dedicadas). */
  | { type: 'fillMonitor' }
  | { type: 'refreshBatteries' }
  | { type: 'restoreDefaults' }
  | { type: 'getState' }
  | { type: 'resetExtremes' }
  | { type: 'testAlert' }
  | { type: 'dismissCrashReport' }
  | { type: 'acceptGameSuggestion'; exe?: string }
  | { type: 'dismissGameSuggestion'; exe?: string }
  | { type: 'startPairing' }
  | { type: 'listDevices' }
  | { type: 'revokeDevice'; id: string }
  // 1.0
  | { type: 'replayTutorial' }
  /** Uso da pasta de CSV; com valores hipotéticos devolve a prévia do que a próxima limpeza apagaria. */
  | { type: 'getLogStats'; keepDays?: LogKeepDays; maxTotalMb?: number }
  /** Histórico paginado (limit ≤ 100), opcionalmente de um jogo só. */
  | { type: 'getSessions'; offset: number; limit: number; exe?: string }
  // atualizador
  | { type: 'checkUpdate' }
  | { type: 'installUpdate'; when: 'now' | 'exit' }
  | { type: 'skipUpdate' }
  | { type: 'setUpdateChannel'; channel: 'stable' | 'beta' }
  | { type: 'getUpdate' }
  | ClientMessage12;

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
  | { type: 'paired'; ok: false; error: PairError; /** 1.0: tentativas antes do bloqueio */ attemptsLeft?: number; /** 1.0: segundos até desbloquear */ retryAfterSec?: number }
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
  /** v0.7: pico da sessão (máx) já formatado, com o nível que ele alcançou. Ausente = métrica sem pico ou ocioso. */
  peak?: { text: string; level: Level } | null;
}
