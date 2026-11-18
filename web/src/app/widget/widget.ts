import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { AppConfig, MetricGroup, MetricView, ThemeName, WidgetLayout } from '../models';
import { I18n } from '../i18n';
import { TelemetryService } from '../telemetry.service';
import { BatteryRow } from './battery-row';
import { FrameGraph } from './frame-graph';
import { Sparkline } from './sparkline';
import { SplashBlobs } from './splash-blobs';
import { FitScale } from './fit-scale';
import { FitTiles } from './fit-tiles';
import { LIMITS, LayoutSize, NOT_COUNTED, buildViews, groupLabel, hasChipPeak, isDarkTheme } from './metric-views';

interface Block {
  key: MetricGroup;
  kind: string;
  label: string;
  head: MetricView | null;
  sub: string | null;
  tiles: MetricView[];
}

/** Métricas que viram o "cabeçalho + barra" do bloco em vez de tile. */
const HEAD: Partial<Record<MetricGroup, string>> = { gpu: 'gpu.load', cpu: 'cpu.load', ram: 'ram.load' };
/** Aparecem embutidas em outro lugar (subtítulo da RAM / centro do FPS). */
const EMBEDDED = new Set(['ram.used', 'ram.total', 'fps.current', 'fps.graph']);
/** Nome curto dos layouts, para as classes CSS. */
const MODE_CLASS: Record<LayoutSize, string> = { full: '', mid: ' c', compact: ' c tiny' };

/** Rótulos curtos para os chips do layout compacto (quando o usuário não definiu um label). Os que mudam com o idioma ficam em i18n.ts. */
const SHORT: Record<string, string> = {
  'gpu.hotspot': 'Hot spot',
  'gpu.memjunction': 'VRAM',
  'gpu.hotspotDelta': 'Δ HS',
  'gpu.clock': 'Clock',
  'gpu.memclock': 'Mem',
  'gpu.power': 'Power',
  'gpu.powerLimit': 'PL',
  'gpu.vramUsed': 'VRAM',
  'gpu.vramLoad': 'VRAM',
  'gpu.fan': 'Fan',
  'gpu.fanRpm': 'Fan',
  'gpu.voltage': 'Volt',
  'cpu.temp': 'Package',
  'cpu.power': 'Power',
  'cpu.clockAvg': 'Clock',
  'fps.low1': '1%',
  'fps.low01': '0.1%',
  'fps.frametime': 'frametime',
  'net.down': '↓',
  'net.up': '↑',
};


@Component({
  selector: 'pw-widget',
  imports: [NgTemplateOutlet, Sparkline, FrameGraph, SplashBlobs, FitTiles, FitScale, BatteryRow],
  templateUrl: './widget.html',
  styleUrl: './widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Widget {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;

  /** Pré-visualização na tela de configurações: força tema/orientação sem mexer na config. */
  readonly previewTheme = input<ThemeName | null>(null);
  readonly previewVertical = input<boolean | null>(null);
  readonly previewLayout = input<WidgetLayout | null>(null);

  private readonly size = signal({ w: window.innerWidth, h: window.innerHeight });
  protected readonly vertical = computed(() => this.previewVertical() ?? this.size().h > this.size().w);
  /**
   * Layout efetivo: forçado na config, ou automático pelo tamanho da janela
   * (compacto = retângulo pequenininho, médio = ~300 px, completo = o resto).
   */
  protected readonly mode = computed<LayoutSize>(() => {
    // Perfil do jogo atual (v0.7) vale no lugar do layout da config enquanto o jogo roda
    const pref = this.previewLayout() ?? this.urlLayout ?? this.t.profile()?.layout ?? this.config()?.widget.layout ?? 'auto';
    if (pref === 'compact' || pref === 'mid' || pref === 'full') return pref;
    const { w, h } = this.size();
    if (w < 340 && h < 260) return 'compact';
    if (w < 640 && h < 640) return 'mid';
    return 'full';
  });
  protected readonly compactWide = computed(() => {
    if (this.previewLayout() || this.mode() === 'full') return false;
    const { w, h } = this.size();
    return w / h > (this.mode() === 'compact' ? 1.8 : 1.5);
  });
  protected readonly modeClass = computed(() =>
    this.mode() === 'full'
      ? this.vertical() ? ' v' : ' h'
      : MODE_CLASS[this.mode()] + (this.compactWide() ? ' cw' : ''),
  );
  protected readonly now = signal(new Date());
  private readonly systemDark = signal(matchMedia('(prefers-color-scheme: dark)').matches);

  protected readonly config = this.t.config;
  protected readonly locked = computed(() => this.previewTheme() != null || (this.config()?.widget.locked ?? false));
  /** ?theme=neon&mode=light na URL: pré-visualização em desenvolvimento, sem alterar a config. */
  private readonly urlTheme = new URLSearchParams(location.search).get('theme') as ThemeName | null;
  private readonly urlMode = new URLSearchParams(location.search).get('mode');
  private readonly urlLayout = new URLSearchParams(location.search).get('layout') as WidgetLayout | null;
  protected readonly theme = computed<ThemeName>(
    () => this.previewTheme() ?? this.urlTheme ?? ((this.config()?.widgetTheme as ThemeName) || 'lumen'),
  );
  protected readonly dark = computed(() =>
    this.urlMode && this.theme() !== 'neon' && this.theme() !== 'terminal'
      ? this.urlMode === 'dark'
      : isDarkTheme(this.config(), this.theme(), this.systemDark()),
  );
  protected readonly accent = computed(() => this.config()?.accent || null);
  protected readonly tags = computed(() => this.s().tags[this.theme()]);

  protected readonly gpu = computed(() => this.block('gpu', 'GPU', groupLabel(this.config(), 'gpu', this.t.catalog(), this.s())));
  protected readonly cpu = computed(() => this.block('cpu', 'CPU', groupLabel(this.config(), 'cpu', this.t.catalog(), this.s())));
  protected readonly ram = computed(() => {
    const b = this.block('ram', 'RAM', groupLabel(this.config(), 'ram', this.t.catalog(), this.s()));
    const v = this.t.values();
    if (b.sub && v['ram.used'] != null && v['ram.total'] != null)
      b.sub = `${v['ram.used']!.toFixed(1)} / ${Math.round(v['ram.total']!)} GB`;
    else b.sub = null;
    return b;
  });
  protected readonly other = computed(() => this.block('other', this.s().groupOther, groupLabel(this.config(), 'other', this.t.catalog(), this.s())));

  protected readonly fps = computed(() => {
    const views = this.limited('fps');
    return {
      current: views.find((m) => m.id === 'fps.current') ?? null,
      graph: views.some((m) => m.id === 'fps.graph'),
      extras: views.filter((m) => !EMBEDDED.has(m.id)),
    };
  });

  protected readonly alerts = computed(() => {
    let n = 0;
    for (const b of [this.gpu(), this.cpu(), this.ram(), this.other()]) {
      if (b.head && b.head.level !== 'ok') n++;
      for (const m of b.tiles) if (m.level !== 'ok') n++;
    }
    return n;
  });

  /**
   * Chip "Limite: …" ao lado do nome da GPU (completo e médio). O motivo já vem filtrado do serviço
   * (2 s para aparecer, 3 s no mínimo, prioridade). Sem limite = sem chip. Na pré-visualização não aparece.
   */
  protected readonly limit = computed(() => {
    const reason = this.t.perfcap().reason;
    if (!reason || this.previewTheme() || !this.t.defs().get('gpu.perfcap')?.available) return null;
    const s = this.s();
    return {
      reason,
      label: s.perfcapLabel[reason],
      /** Mínimo e Neon: "Limite · térmico" (texto, sem pílula no Mínimo). */
      dotted: s.perfcapLabel[reason].replace(': ', ' · '),
      word: s.perfcapWord[reason],
      // Térmico em amarelo; power/voltagem no accent; ocioso/sincronia neutros. Nunca vermelho: limite não é alarme.
      tone: reason === 'thermal' ? 'warn' : reason === 'power' || reason === 'voltage' ? 'accent' : 'neutral',
      title: reason === 'voltage' ? `${s.perfcapWhy} · ${s.perfcapVoltageHint}` : s.perfcapWhy,
    };
  });

  /** Picos (v0.7): só com jogo; o pill de zerar aparece no hover com o widget destravado. */
  protected readonly resetDone = signal(false);
  private resetTimer?: ReturnType<typeof setTimeout>;
  protected readonly peaksSince = computed(() => {
    const s = this.s();
    let since = this.t.extremesSince();
    if (since == null) {
      const game = this.t.game();
      const cur = this.t.sessions().find((x) => !x.end && x.exe === game?.exe);
      since = cur ? new Date(cur.start).getTime() : null;
    }
    if (since == null) return s.peaksSession;
    return s.peaksSince(new Date(since).toLocaleTimeString(s.locale, { hour: 'numeric', minute: '2-digit' }));
  });

  protected resetPeaks() {
    this.t.send({ type: 'resetExtremes' });
    this.resetDone.set(true);
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.resetDone.set(false), 2000);
  }

  /** Médio: pico no chip só para temperatura, power e clock. */
  protected chipPeak = hasChipPeak;

  /** Jogo detectado sem captura de FPS (anti-cheat bloqueou o PresentMon). */
  protected readonly fpsBlocked = computed(() => !!this.t.game() && !!this.t.fpsStatus() && this.t.values()['fps.current'] == null);

  /** Bateria dos periféricos (discreta, perto do FPS). */
  protected readonly battery = computed(() => {
    const cfg = this.config()?.battery;
    const devices = this.t.batteries();
    const show = (cfg?.enabled ?? true) && devices.some((d) => d.connected && !(cfg?.hidden ?? []).includes(d.key));
    return { show, devices, hidden: cfg?.hidden ?? [], low: cfg?.lowPercent ?? 15 };
  });

  protected readonly clock = computed(() =>
    this.now().toLocaleTimeString(this.s().locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
  );
  protected readonly date = computed(() =>
    this.now().toLocaleDateString(this.s().locale, { weekday: 'long', day: 'numeric', month: 'long' }),
  );

  constructor() {
    const onResize = () => this.size.set({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const onScheme = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    mq.addEventListener('change', onScheme);
    // Relógio: só precisa virar o minuto — acorda no início de cada minuto em vez de a cada segundo.
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      this.now.set(new Date());
      timer = setTimeout(tick, 60_000 - (Date.now() % 60_000) + 50);
    };
    tick();
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('resize', onResize);
      mq.removeEventListener('change', onScheme);
      clearTimeout(timer);
      clearTimeout(this.resetTimer);
    });
  }

  /** Quantos tiles cabem em cada bloco do completo (medido por FitTiles). Só esses são renderizados. */
  private readonly caps = signal<Partial<Record<MetricGroup, number>>>({});

  protected setCap(key: MetricGroup, cap: number) {
    this.caps.update((c) => (c[key] === cap ? c : { ...c, [key]: cap }));
  }

  protected visibleTiles(b: Block): MetricView[] {
    return b.tiles.slice(0, this.caps()[b.key] ?? 6);
  }

  protected hiddenCount(b: Block): number {
    return Math.max(0, b.tiles.length - (this.caps()[b.key] ?? 6));
  }

  /**
   * Compacto: células de número. Linha 1 = GPU; linha 2 = CPU + RAM.
   * O uso (%) do grupo vira a célula rotulada com o nome do grupo ("GPU", "CPU", "RAM").
   */
  protected readonly miniRows = computed(() => {
    const cells = (b: Block) => [
      ...(b.head ? [{ ...b.head, label: b.kind, unit: '%', group: b.key }] : []),
      ...b.tiles.map((m) =>
        // MHz não cabe na célula: 1305 MHz → 1.31 GHz
        m.unit === 'MHz' && m.value != null
          ? { ...m, text: (m.value / 1000).toFixed(2), unit: 'GHz', label: this.short(m), group: b.key }
          : { ...m, label: this.short(m), unit: this.shortUnit(m), group: b.key },
      ),
    ];
    return [cells(this.gpu()), [...cells(this.cpu()), ...cells(this.ram())]].filter((r) => r.length);
  });

  /** CPU e RAM dividem a mesma linha no compacto e no médio. */
  protected readonly splitBlocks = computed(() => [this.cpu(), this.ram()].filter((b) => b.head || b.tiles.length || b.sub));

  /** Label curto para chips do compacto. */
  protected short(m: MetricView) {
    const custom = this.config()?.metrics.find((x) => x.id === m.id)?.label;
    return custom || this.s().short[m.id] || SHORT[m.id] || this.label(m);
  }

  /** Unidade curta: temperatura vira só "°". */
  protected shortUnit(m: MetricView) {
    return m.isTemperature ? '°' : m.unit;
  }

  protected tagFor(m: MetricView) {
    return this.tags()[m.level];
  }

  protected barWidth(m: MetricView | null) {
    return Math.max(0, Math.min(100, m?.value ?? 0));
  }

  /** Barra ASCII do tema Terminal: [██████░░░░] */
  protected ascii(m: MetricView | null, width = 24) {
    const filled = Math.round((this.barWidth(m) / 100) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
  }

  /** Labels em snake_case no tema Terminal. */
  protected label(m: MetricView) {
    if (this.theme() !== 'terminal') return m.label;
    return m.label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/Δ/g, 'delta')
      .replace(/%/g, 'pct')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private block(key: MetricGroup, kind: string, label: string): Block {
    const views = this.limited(key);
    const headId = HEAD[key];
    return {
      key,
      kind,
      label,
      head: views.find((m) => m.id === headId) ?? null,
      sub: views.some((m) => m.id === 'ram.used') ? 'ram' : null,
      tiles: views.filter((m) => m.id !== headId && !EMBEDDED.has(m.id)),
    };
  }

  /** Métricas do grupo que o layout atual mostra: as N primeiras na ordem de prioridade (completo = todas). */
  private limited(group: MetricGroup): MetricView[] {
    const views = this.views(group).filter((m) => !NOT_COUNTED.has(m.id));
    const mode = this.mode();
    if (mode === 'full') return views;
    const limit = LIMITS[mode][group];
    const out = views.slice(0, limit);
    // O FPS em si sempre aparece, mesmo que o usuário o tenha arrastado para baixo
    if (group === 'fps' && !out.some((m) => m.id === 'fps.current')) {
      const cur = views.find((m) => m.id === 'fps.current');
      if (cur) out.splice(limit - 1, 1, cur);
    }
    return mode === 'compact' ? out.filter((m) => m.id !== 'fps.graph') : out;
  }

  private views(group: MetricGroup): MetricView[] {
    // No ocioso não há pico (o tile esconde o "máx"); na pré-visualização também não
    const ext = this.t.game() && !this.previewTheme() && this.mode() !== 'compact' ? this.t.extremes() : null;
    return buildViews(this.config() as AppConfig | null, this.t.defs(), this.t.values(), group, ext);
  }
}
