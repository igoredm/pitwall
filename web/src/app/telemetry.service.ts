import { Injectable, computed, signal } from '@angular/core';
import {
  AppConfig,
  Catalog,
  Extremes,
  GameInfo,
  GameSession,
  LogStatus,
  PairedDevice,
  PairingMessage,
  PerfCapReason,
  TuningPreset,
  TuningStatus,
  UpdateState,
  WidgetLayout,
  WirelessDevice,
  MetricDef,
  MetricSetting,
  RemoteServerMessage,
  ServerMessage,
} from './models';
import { PerfCapFilter, PerfCapShown } from './perfcap';

/** Pontos guardados para sparklines: ~60 s na taxa atual. */
const HISTORY_SECONDS = 60;
/** Frames guardados para o gráfico de frametime (~5 s a 144 FPS). */
const MAX_FRAMES = 720;
/** Celular: chave do token do dispositivo no localStorage. */
const TOKEN_KEY = 'pitwall.deviceToken';

const DEMO_BATTERIES: WirelessDevice[] = [
  { key: 'm', name: 'Logitech G Pro X Superlight', via: 'Lightspeed', kind: 'mouse', percent: 87, levelText: null, charging: false, asleep: false, connected: true },
  { key: 'h', name: 'HyperX Cloud III Wireless', via: '2.4 GHz', kind: 'headset', percent: 12, levelText: null, charging: false, asleep: false, connected: true },
  { key: 'k', name: 'Keychron K2', via: 'Bluetooth', kind: 'keyboard', percent: 64, levelText: null, charging: true, asleep: false, connected: true },
];

/**
 * Estado da página do celular (#/mobile): conectando, ao vivo, sem conexão (tentando de novo), sem acesso
 * (revogado / código vencido) ou sem código de pareamento.
 */
export type RemoteState = 'connecting' | 'live' | 'reconnecting' | 'revoked' | 'needPair';

/** Parâmetros da query que fica dentro do hash (#/mobile?pair=K7QX2MPA). */
export function hashParams(): URLSearchParams {
  const i = location.hash.indexOf('?');
  return new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : '');
}

/** Parâmetro da URL: ?x=… normal ou dentro do hash (#/mobile?x=…). */
export function urlParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name) ?? hashParams().get(name);
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string | null) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // modo privado / armazenamento bloqueado: segue sem lembrar
  }
}

/** Nome do celular sugerido para o pareamento, derivado do user agent ("iPhone · Safari"). */
function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : 'Navegador';
  const br = /EdgA?\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '';
  return (br ? `${os} · ${br}` : os).slice(0, 40);
}

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  readonly connected = signal(false);
  readonly catalog = signal<Catalog | null>(null);
  readonly config = signal<AppConfig | null>(null);
  readonly values = signal<Record<string, number | null>>({});
  readonly game = signal<GameInfo | null>(null);
  readonly sessions = signal<GameSession[]>([]);
  readonly log = signal<LogStatus | null>(null);
  readonly tuning = signal<TuningStatus | null>(null);
  readonly fpsStatus = signal<string | null>(null);
  readonly batteries = signal<WirelessDevice[]>([]);
  /** v0.7: métricas de texto (gpu.perfcap). Só muda quando algum texto muda. */
  readonly texts = signal<Record<string, string | null>>({});
  /** v0.7: mín/máx da sessão por métrica (snapshot.extremes chega no máximo 1x/s). */
  readonly extremes = signal<Extremes>({});
  /** v0.7: desde quando valem os picos (ms), quando o app viu o epoch mudar; null = desde o início da sessão. */
  readonly extremesSince = signal<number | null>(null);
  /** v0.7: perfil do jogo atual (layout vale no lugar de config.widget.layout). */
  readonly profile = signal<{ exe: string; tuningPreset?: TuningPreset; layout?: WidgetLayout } | null>(null);
  /** v0.7: "Marcar como jogo?". */
  readonly gameSuggestion = signal<{ exe: string } | null>(null);
  /** Estado do atualizador (catalog.update e mensagem "update"). */
  readonly update = signal<UpdateState | null>(null);
  /** v0.7: última resposta a startPairing. */
  readonly pairing = signal<PairingMessage | null>(null);
  /** v0.7: celulares pareados (mensagem "devices"; antes dela, o que veio no config). */
  private readonly devicesMsg = signal<PairedDevice[] | null>(null);
  readonly devices = computed(() => this.devicesMsg() ?? this.config()?.remote?.pairedDevices ?? []);
  /** v0.7: motivo do limite de clock já filtrado (2 s para aparecer, 3 s mínimo, prioridade). */
  readonly perfcap = signal<PerfCapShown>({ reason: null, since: 0 });
  /** v0.7: tempo (ms) de cada motivo cru nesta sessão de jogo, visto por esta página. Atualiza 1x/s. */
  readonly perfcapStats = signal<Partial<Record<PerfCapReason, number>>>({});
  /** Hora (ms) do último snapshot; o celular mostra "último valor 21:46:58" quando cai. */
  readonly lastSnapshotAt = signal(0);

  /** Página do celular: socket da rede (ws://<host>/ws), autenticação por token do dispositivo. */
  readonly remoteMode = location.hash.startsWith('#/mobile');
  readonly remote = signal<RemoteState>('connecting');
  /** ?demo=v07: dados de exemplo da 0.7, sem backend (teste de layout). */
  readonly demo = urlParam('demo') === 'v07';

  /** ?batteries=demo na URL: dispositivos de exemplo para pré-visualizar o visual em dev. */
  private readonly demoBatteries = urlParam('batteries') === 'demo';

  /** Histórico por métrica (temperaturas). Mutado in-place; `historyTick` sinaliza mudança. */
  private readonly history = new Map<string, number[]>();
  readonly historyTick = signal(0);
  /** Frametimes individuais recentes (gráfico de frametime). */
  readonly frames: number[] = [];

  readonly defs = computed(() => {
    const map = new Map<string, MetricDef>();
    for (const m of this.catalog()?.metrics ?? []) map.set(m.id, m);
    return map;
  });

  readonly settings = computed(() => {
    const map = new Map<string, MetricSetting>();
    for (const m of this.config()?.metrics ?? []) map.set(m.id, m);
    return map;
  });

  private ws?: WebSocket;
  private retryMs = 500;
  private stopped = false;
  private readonly port = new URLSearchParams(location.search).get('port') ?? '48123';
  // Token da execução atual do app (vai na URL do WebView2); sem ele o servidor recusa a conexão
  private readonly token = new URLSearchParams(location.search).get('token') ?? '';
  private readonly hostListeners = new Set<(msg: any) => void>();
  private extremesEpoch: number | null = null;
  private readonly perfcapFilter = new PerfCapFilter();
  private perfcapLastT = 0;
  private perfcapAcc: Partial<Record<PerfCapReason, number>> = {};
  private perfcapFlushAt = 0;
  /** Modo demo: quem responde às mensagens que a página manda. */
  private demoHandler?: (msg: any) => void;

  constructor() {
    if (this.demo) {
      // Carregado sob demanda: o build normal não leva os dados de exemplo no pacote inicial
      import('./demo').then((m) => m.startDemo(this));
    } else {
      this.connect();
      if (this.remoteMode) this.watchdog();
    }
    // Mensagens do host nativo (WebView2): respostas de diálogos etc.
    (window as any).chrome?.webview?.addEventListener('message', (e: MessageEvent) => {
      for (const l of this.hostListeners) l(e.data);
    });
  }

  historyOf(id: string): readonly number[] {
    return this.history.get(id) ?? [];
  }

  send(msg: object) {
    if (this.demoHandler) return this.demoHandler(msg);
    if (this.remoteMode) return; // o socket do celular é só leitura
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  saveConfig(config: AppConfig) {
    this.config.set(config);
    this.send({ type: 'setConfig', config });
  }

  /** Mensagem para o host nativo (só existe dentro do app). */
  host(msg: object) {
    (window as any).chrome?.webview?.postMessage(msg);
  }

  get inHost(): boolean {
    return !!(window as any).chrome?.webview;
  }

  onHost(listener: (msg: any) => void): () => void {
    this.hostListeners.add(listener);
    return () => this.hostListeners.delete(listener);
  }

  /** Modo demo: liga o simulador (recebe o que a página manda). */
  attachDemo(handler: (msg: any) => void) {
    this.demoHandler = handler;
  }

  /** Modo demo: entrega uma mensagem como se viesse do servidor. */
  receive(msg: ServerMessage | RemoteServerMessage) {
    this.handle(msg);
  }

  private connect() {
    const url = this.remoteMode
      ? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`
      : `ws://localhost:${this.port}/ws?token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.retryMs = 500;
      if (!this.remoteMode) {
        this.connected.set(true);
        return;
      }
      // Celular: a primeira mensagem precisa ser pair (código do QR) ou auth (token guardado)
      const code = hashParams().get('pair');
      const token = storageGet(TOKEN_KEY);
      if (code) ws.send(JSON.stringify({ type: 'pair', code, name: deviceName() }));
      else if (token) ws.send(JSON.stringify({ type: 'auth', token }));
      else {
        this.stopped = true;
        this.remote.set('needPair');
        ws.close();
      }
    };
    ws.onmessage = (e) => this.handle(JSON.parse(e.data));
    ws.onclose = () => {
      this.connected.set(false);
      if (this.ws !== ws) return;
      if (this.stopped) return;
      if (this.remoteMode && this.remote() === 'live') this.remote.set('reconnecting');
      setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 5000);
    };
  }

  /** Celular: Wi-Fi que dorme não fecha o socket na hora; sem snapshot por alguns segundos = reconectar. */
  private watchdog() {
    setInterval(() => {
      const ws = this.ws;
      if (!ws || ws.readyState !== WebSocket.OPEN || this.remote() !== 'live') return;
      const limit = Math.max(5000, (this.config()?.refreshMs ?? 1000) * 5);
      if (Date.now() - this.lastSnapshotAt() > limit) {
        this.remote.set('reconnecting');
        ws.close();
      } else {
        ws.send('{"type":"ping"}');
      }
    }, 4000);
  }

  private handle(msg: ServerMessage | RemoteServerMessage) {
    switch (msg.type) {
      case 'auth':
      case 'paired':
        if (msg.ok) {
          if (msg.type === 'paired') {
            storageSet(TOKEN_KEY, msg.token);
            // Tira o código da URL: recarregar a página não tenta parear de novo com um código já usado
            history.replaceState(null, '', location.pathname + location.search + '#/mobile');
          }
          this.connected.set(true);
          this.remote.set('live');
        } else {
          if (msg.type === 'auth') storageSet(TOKEN_KEY, null);
          this.stopped = true;
          this.remote.set('revoked');
        }
        break;
      case 'catalog':
        this.catalog.set(msg);
        if (msg.update) this.update.set(msg.update);
        break;
      case 'config':
        this.config.set(msg.config as AppConfig);
        break;
      case 'sessions':
        this.sessions.set(msg.sessions);
        break;
      case 'update':
        this.update.set(msg.update);
        break;
      case 'extremes':
        this.applyExtremes(msg.epoch, msg.values, true);
        break;
      case 'pairing':
        this.pairing.set(msg);
        break;
      case 'devices':
        this.devicesMsg.set(msg.devices);
        break;
      case 'snapshot': {
        const now = Date.now();
        this.lastSnapshotAt.set(now);
        this.values.set(msg.values);
        if ((msg.fpsStatus ?? null) !== this.fpsStatus()) this.fpsStatus.set(msg.fpsStatus ?? null);
        const bats = this.demoBatteries ? DEMO_BATTERIES : (msg.batteries ?? []);
        if (JSON.stringify(bats) !== JSON.stringify(this.batteries())) this.batteries.set(bats);
        const tu = msg.tuning ?? null;
        const cur0 = this.tuning();
        if (tu?.active !== cur0?.active || tu?.powerLimitW !== cur0?.powerLimitW || tu?.clockMaxMhz !== cur0?.clockMaxMhz || tu?.error !== cur0?.error)
          this.tuning.set(tu);
        const g = msg.game;
        const cur = this.game();
        if (g?.exe !== cur?.exe || g?.mode !== cur?.mode) {
          if (g?.exe !== cur?.exe) this.resetPerfcapStats();
          this.game.set(g);
          this.frames.length = 0;
        }
        const log = msg.log ?? null;
        if (log?.file !== this.log()?.file || log?.size !== this.log()?.size) this.log.set(log);
        if (msg.frames?.length) {
          this.frames.push(...msg.frames);
          if (this.frames.length > MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES);
        }
        // v0.7 — cada sinal só muda quando o conteúdo muda (o widget não re-renderiza à toa)
        const texts = msg.texts ?? {};
        if (!sameRecord(texts, this.texts())) this.texts.set(texts);
        if (msg.extremes) this.applyExtremes(msg.extremes.epoch, msg.extremes.values, false);
        const prof = msg.profile ?? null;
        const p0 = this.profile();
        if (prof?.exe !== p0?.exe || prof?.layout !== p0?.layout || prof?.tuningPreset !== p0?.tuningPreset) this.profile.set(prof);
        const sug = msg.gameSuggestion ?? null;
        if (sug?.exe !== this.gameSuggestion()?.exe) this.gameSuggestion.set(sug);
        this.trackPerfcap(texts['gpu.perfcap'] ?? null, now);
        this.pushHistory(msg.values);
        break;
      }
    }
  }

  /** Regra do protocolo: epoch diferente = descartar e recomeçar; igual = sobrescrever as chaves recebidas. */
  private applyExtremes(epoch: number, values: Extremes, full: boolean) {
    if (epoch !== this.extremesEpoch) {
      // Epoch novo depois do primeiro = zerou agora (jogo novo ou "Zerar"); o primeiro é o da sessão atual
      if (this.extremesEpoch != null) this.extremesSince.set(Date.now());
      this.extremesEpoch = epoch;
      this.extremes.set({ ...values });
      return;
    }
    if (full) this.extremes.set({ ...values });
    else this.extremes.update((cur) => ({ ...cur, ...values }));
  }

  private trackPerfcap(raw: string | null, now: number) {
    const shown = this.perfcapFilter.push(raw, now);
    if (shown !== this.perfcap()) this.perfcap.set(shown);
    // Tempo por motivo só conta durante um jogo (é a "sessão" da linha "Por que o clock caiu")
    if (this.game() && raw && this.perfcapLastT) {
      const dt = Math.min(now - this.perfcapLastT, 5000);
      const key = (raw.split(/[,|\s]+/)[0] || 'none') as PerfCapReason;
      this.perfcapAcc[key] = (this.perfcapAcc[key] ?? 0) + dt;
      if (now >= this.perfcapFlushAt) {
        this.perfcapFlushAt = now + 1000;
        this.perfcapStats.set({ ...this.perfcapAcc });
      }
    }
    this.perfcapLastT = now;
  }

  private resetPerfcapStats() {
    this.perfcapAcc = {};
    this.perfcapStats.set({});
  }

  private pushHistory(values: Record<string, number | null>) {
    const defs = this.defs();
    const refresh = this.config()?.refreshMs ?? 500;
    const max = Math.max(10, Math.round((HISTORY_SECONDS * 1000) / refresh));
    for (const [id, v] of Object.entries(values)) {
      if (v == null || !defs.get(id)?.isTemperature) continue;
      let arr = this.history.get(id);
      if (!arr) this.history.set(id, (arr = []));
      arr.push(v);
      if (arr.length > max) arr.splice(0, arr.length - max);
    }
    this.historyTick.update((t) => t + 1);
  }
}

function sameRecord(a: Record<string, string | null>, b: Record<string, string | null>) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}
