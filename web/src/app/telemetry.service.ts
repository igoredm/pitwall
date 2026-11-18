import { Injectable, computed, signal } from '@angular/core';
import {
  AppConfig,
  Catalog,
  GameInfo,
  GameSession,
  LogStatus,
  TuningStatus,
  WirelessDevice,
  MetricDef,
  MetricSetting,
  ServerMessage,
} from './models';

/** Pontos guardados para sparklines: ~60 s na taxa atual. */
const HISTORY_SECONDS = 60;
/** Frames guardados para o gráfico de frametime (~5 s a 144 FPS). */
const MAX_FRAMES = 720;

const DEMO_BATTERIES: WirelessDevice[] = [
  { key: 'm', name: 'Logitech G Pro X Superlight', via: 'Lightspeed', kind: 'mouse', percent: 87, levelText: null, charging: false, asleep: false, connected: true },
  { key: 'h', name: 'HyperX Cloud III Wireless', via: '2.4 GHz', kind: 'headset', percent: 12, levelText: null, charging: false, asleep: false, connected: true },
  { key: 'k', name: 'Keychron K2', via: 'Bluetooth', kind: 'keyboard', percent: 64, levelText: null, charging: true, asleep: false, connected: true },
];

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
  /** ?batteries=demo na URL: dispositivos de exemplo para pré-visualizar o visual em dev. */
  private readonly demoBatteries = new URLSearchParams(location.search).get('batteries') === 'demo';

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
  private readonly port = new URLSearchParams(location.search).get('port') ?? '48123';
  // Token da execução atual do app (vai na URL do WebView2); sem ele o servidor recusa a conexão
  private readonly token = new URLSearchParams(location.search).get('token') ?? '';
  private readonly hostListeners = new Set<(msg: any) => void>();

  constructor() {
    this.connect();
    // Mensagens do host nativo (WebView2): respostas de diálogos etc.
    (window as any).chrome?.webview?.addEventListener('message', (e: MessageEvent) => {
      for (const l of this.hostListeners) l(e.data);
    });
  }

  historyOf(id: string): readonly number[] {
    return this.history.get(id) ?? [];
  }

  send(msg: object) {
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

  private connect() {
    const ws = new WebSocket(`ws://localhost:${this.port}/ws?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.connected.set(true);
      this.retryMs = 500;
    };
    ws.onmessage = (e) => this.handle(JSON.parse(e.data) as ServerMessage);
    ws.onclose = () => {
      this.connected.set(false);
      setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, 5000);
    };
  }

  private handle(msg: ServerMessage) {
    switch (msg.type) {
      case 'catalog':
        this.catalog.set(msg);
        break;
      case 'config':
        this.config.set(msg.config);
        break;
      case 'sessions':
        this.sessions.set(msg.sessions);
        break;
      case 'snapshot': {
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
          this.game.set(g);
          this.frames.length = 0;
        }
        const log = msg.log ?? null;
        if (log?.file !== this.log()?.file || log?.size !== this.log()?.size) this.log.set(log);
        if (msg.frames?.length) {
          this.frames.push(...msg.frames);
          if (this.frames.length > MAX_FRAMES) this.frames.splice(0, this.frames.length - MAX_FRAMES);
        }
        this.pushHistory(msg.values);
        break;
      }
    }
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
