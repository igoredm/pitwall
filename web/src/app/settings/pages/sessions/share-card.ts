import type { Dict } from '../../../i18n';
import { Catalog, GameSession, MetricSetting } from '../../../models';
import { level } from '../../../widget/metric-views';
import { fmtDuration } from '../../format';
import { extent } from '../../reports';
import { InsightTone, sessionInsights } from './insights';
import { durationSec, fmtPm, gameName, hardwareLine, perMinute, redCaption, secondsRed } from './session-util';

/**
 * Card PNG 1200×630 (design-notes › v1.2 › 4, frame V12-Card-Compartilhar): sempre escuro, hex fixos (nunca os
 * tokens do tema), Manrope. Desenhado num canvas com as medidas do frame; linha sem dado some.
 */
export const CARD_W = 1200;
export const CARD_H = 630;

const C = { bg: '#0E1014', tx: '#ECEEF2', tx2: '#A3AAB6', tx3: '#848C99', hair: '#23272E', red: '#FF6B70', fps: '#3DDC84', yellow: '#F2B33D' };
/** Cor do ponto de cada frase de "O que segurou o FPS". */
const TONE: Record<InsightTone, string> = { crit: C.red, warn: C.yellow, info: C.tx3 };
const FONT = "Manrope, 'Segoe UI', system-ui, sans-serif";
const URL_TEXT = 'github.com/igoredm/pitwall';

/** Tudo o que o card e os textos mostram, já formatado. Campo null = sem dado (a linha some). */
export interface ShareData {
  game: string;
  date: string;
  dateShort: string;
  dur: string;
  hw: string;
  avg: string | null;
  low1: string | null;
  low01: string | null;
  stutters: number | null;
  perMin: string | null;
  peaks: { key: 'hot' | 'core' | 'power'; text: string; alert: boolean }[];
  /** Tempo acima do limite crítico (a métrica que mais ficou). */
  red: string | null;
  redOn: boolean;
  /** "hot spot ≥ 100 °C" (+N se outras também passaram). */
  redCap: string | null;
  fps: (number | null)[] | null;
  version: string;
  /** 1.3: até 2 frases de "O que segurou o FPS". */
  insights: { tone: InsightTone; text: string }[];
}

export function shareData(
  x: GameSession,
  s: Dict,
  cat: Catalog | null,
  settings: Map<string, MetricSetting>,
  fps: (number | null)[] | null,
  opts: { bench?: boolean } = {},
): ShareData {
  const d = new Date(x.start);
  const parts = new Intl.DateTimeFormat(s.locale, { day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(d);
  const part = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  // PT: "19 nov. 2026" (sem os "de"); EN: "Nov 19, 2026"
  const date = s.decimalComma ? `${part('day')} ${part('month')} ${part('year')}` : d.toLocaleDateString(s.locale, { day: 'numeric', month: 'short', year: 'numeric' });
  const r = (v?: number) => (v == null ? null : String(Math.round(v)));
  const alert = (id: string, v: number) => {
    const st = settings.get(id);
    return level(v, st?.warn, st?.crit) !== 'ok';
  };
  const peaks: ShareData['peaks'] = [];
  if (x.peakHotspot != null) peaks.push({ key: 'hot', text: `${Math.round(x.peakHotspot)} °C`, alert: alert('gpu.hotspot', x.peakHotspot) });
  if (x.peakGpuTemp != null) peaks.push({ key: 'core', text: `${Math.round(x.peakGpuTemp)} °C`, alert: alert('gpu.temp', x.peakGpuTemp) });
  if (x.peakGpuPower != null) peaks.push({ key: 'power', text: `${Math.round(x.peakGpuPower)} W`, alert: false });
  const red = secondsRed(x);
  const pm = perMinute(x);
  return {
    game: gameName(x),
    date,
    dateShort: d.toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    dur: opts.bench ? s.v13.benchDur(fmtDuration(durationSec(x))) : fmtDuration(durationSec(x)),
    hw: hardwareLine(x, cat),
    avg: r(x.avgFps),
    low1: r(x.low1),
    low01: r(x.low01),
    stutters: x.stutters ?? null,
    perMin: pm != null ? fmtPm(pm, s) : null,
    peaks,
    red: red ? fmtDuration(red, true) : null,
    redOn: !!red,
    redCap: red ? redCaption(x, s, settings, cat) : null,
    fps: fps && extent(fps) ? fps : null,
    version: cat?.version ?? cat?.about?.app ?? '',
    insights: sessionInsights(x, s, cat)
      .slice(0, 2)
      .map((i) => ({ tone: i.tone, text: i.text })),
  };
}

/** "Acima do limite crítico definido: 48 s (hot spot ≥ 100 °C)"; '' sem tempo. */
function redLine(v: ShareData, s: Dict): string {
  return v.red ? `${s.rp.tRed}: ${v.red}${v.redCap ? ` (${v.redCap})` : ''}` : '';
}

/** Texto simples (funciona em qualquer lugar). */
export function shareText(v: ShareData, s: Dict): string {
  const peakName = { hot: s.rp.tHot, core: s.rp.tCore, power: s.rp.tPower };
  const fps = [v.avg && `${s.rp.avgFps} ${v.avg}`, v.low1 && `${s.rp.low1} ${v.low1}`, v.low01 && `${s.rp.low01} ${v.low01}`].filter(Boolean).join(' · ');
  return [
    `${v.game} · ${v.dateShort} · ${v.dur}`,
    v.hw,
    fps,
    v.stutters != null && v.perMin ? s.rp.tStutters(v.stutters, v.perMin) : '',
    v.peaks.length ? `${s.rp.tPeaks}: ${v.peaks.map((p) => `${peakName[p.key]} ${p.text}`).join(' · ')}` : '',
    redLine(v, s),
    ...v.insights.map((i) => `· ${i.text}`),
    `Pitwall ${v.version}`.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Markdown (Reddit, fóruns, GitHub): jogo em negrito, tabela alinhada à direita, picos com o hot spot em negrito. */
export function shareMarkdown(v: ShareData, s: Dict): string {
  const peakName = { hot: s.rp.tHot, core: s.rp.tCore, power: s.rp.tPower };
  const cols = [
    [s.rp.avgFps, v.avg],
    [s.rp.low1, v.low1],
    [s.rp.low01, v.low01],
    [s.rp.stutters, v.stutters != null ? String(v.stutters) : null],
  ].filter((c): c is [string, string] => c[1] != null);
  const out = [`**${v.game}** · ${v.dateShort} · ${v.dur}`];
  if (v.hw) out.push(v.hw);
  if (cols.length) out.push('', `| ${cols.map((c) => c[0]).join(' | ')} |`, `|${cols.map(() => '---:').join('|')}|`, `| ${cols.map((c) => c[1]).join(' | ')} |`, '');
  if (v.peaks.length) out.push(`${s.rp.tPeaks}: ${v.peaks.map((p, i) => `${peakName[p.key]} ${i === 0 ? `**${p.text}**` : p.text}`).join(' · ')}`);
  if (v.insights.length) out.push(...v.insights.map((i) => `- ${i.text}`), '');
  out.push([redLine(v, s), `*Pitwall ${v.version}*`].filter(Boolean).join(' · '));
  return out.join('\n');
}

let logoPromise: Promise<HTMLImageElement | null> | null = null;
function logo(): Promise<HTMLImageElement | null> {
  logoPromise ??= new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = 'pitwall-logo.png';
  });
  return logoPromise;
}

/** Espera as fontes do card (Manrope já vem no pacote; os pesos que faltam caem no mais perto). */
async function fonts() {
  try {
    await Promise.all(['300 156px', '500 17px', '700 40px', '800 40px'].map((f) => document.fonts.load(`${f} Manrope`)));
    await document.fonts.ready;
  } catch {
    // sem a API de fontes: desenha com o que houver
  }
}

/** Linha de base de um texto num bloco CSS (top, font-size, line-height): ascendente/descendente da Manrope. */
const base = (top: number, size: number, lh: number) => top + lh / 2 + 0.383 * size;

function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
}

/** Desenha o card no canvas (1200×630, sem escala). */
export async function drawCard(canvas: HTMLCanvasElement, v: ShareData, s: Dict): Promise<void> {
  await fonts();
  const img = await logo();
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;
  const font = (w: number, px: number) => (ctx.font = `${w} ${px}px ${FONT}`);
  const text = (t: string, x: number, y: number, color: string, align: CanvasTextAlign = 'left') => {
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.fillText(t, x, y);
  };
  ctx.textBaseline = 'alphabetic';
  ctx.letterSpacing = '0px';
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // Topo: logo 44 (raio 10) + "Pitwall"; à direita a data e a duração
  if (img) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(56, 48, 44, 44, 10);
    ctx.clip();
    ctx.drawImage(img, 56, 48, 44, 44);
    ctx.restore();
  }
  font(800, 22);
  ctx.letterSpacing = '-0.22px';
  text('Pitwall', img ? 114 : 56, base(55, 22, 30), C.tx);
  ctx.letterSpacing = '0px';
  font(600, 17);
  text(`${v.date} · ${v.dur}`, 1144, base(59, 17, 23), C.tx2, 'right');

  // Esquerda: jogo, hardware, FPS médio fino e os outros números
  font(800, 40);
  ctx.letterSpacing = '-1px';
  text(fit(ctx, v.game, 732), 56, base(122, 40, 42), C.tx);
  ctx.letterSpacing = '0px';
  if (v.hw) {
    font(600, 18);
    text(fit(ctx, v.hw, 732), 56, base(172, 18, 24), C.tx2);
  }
  let x = 56;
  if (v.avg) {
    font(300, 156);
    ctx.letterSpacing = '-7.8px';
    text(v.avg, 56, base(222, 156, 131), C.tx);
    const w = ctx.measureText(v.avg).width;
    ctx.letterSpacing = '0px';
    font(700, 15);
    text(s.rp.avgFps, 56, base(363, 15, 21), C.tx3);
    x = 56 + Math.max(w, ctx.measureText(s.rp.avgFps).width) + 40;
  }
  const small: [string, string][] = [];
  if (v.low1) small.push([v.low1, s.rp.low1]);
  if (v.low01) small.push([v.low01, s.rp.low01]);
  if (v.stutters != null) small.push([String(v.stutters), s.rp.cardStutters]);
  // Sem o FPS médio, os números menores sobem para a linha de base dele
  const yv = v.avg ? 317 : 240;
  for (const [val, label] of small) {
    font(700, 40);
    ctx.letterSpacing = '-0.8px';
    const wv = ctx.measureText(val).width;
    text(val, x, base(yv, 40, 42), C.tx);
    ctx.letterSpacing = '0px';
    font(700, 15);
    const wl = ctx.measureText(label).width;
    text(label, x, base(yv + 42, 15, 21), C.tx3);
    x += Math.max(wv, wl) + 32;
  }

  // 1.3: até 2 frases de "O que segurou o FPS" embaixo dos números (ponto com a cor do tom)
  v.insights.forEach((ins, i) => {
    const top = (v.avg ? 396 : 318) + i * 26;
    ctx.fillStyle = TONE[ins.tone];
    ctx.beginPath();
    ctx.arc(61, top + 12, 5, 0, Math.PI * 2);
    ctx.fill();
    font(600, 17);
    text(fit(ctx, ins.text, 740), 76, base(top, 17, 24), C.tx2);
  });

  // Direita (300 px): Picos e, por último, o tempo acima do limite crítico, com divisores
  const rows: { label: string; value: string; red: boolean }[] = v.peaks.map((p) => ({
    label: p.key === 'hot' ? s.rp.cardHot : p.key === 'core' ? s.rp.cardCore : s.rp.cardPower,
    value: p.text,
    red: p.alert,
  }));
  if (rows.length || v.red) {
    font(700, 15);
    text(s.rp.cardPeaks, 844, base(126, 15, 21), C.tx3);
    rows.forEach((r, i) => {
      const top = 157 + i * 66;
      ctx.fillStyle = C.hair;
      ctx.fillRect(844, top, 300, 1);
      font(600, 17);
      text(r.label, 844, 202 + i * 66, C.tx2);
      font(700, 30);
      ctx.letterSpacing = '-0.3px';
      text(r.value, 1144, 202 + i * 66, r.red ? C.red : C.tx, 'right');
      ctx.letterSpacing = '0px';
    });
    // O rótulo é longo ("Acima do limite crítico definido"): linha inteira em cima; embaixo a métrica (tx3) e o tempo
    if (v.red) {
      const top = 157 + rows.length * 66;
      ctx.fillStyle = C.hair;
      ctx.fillRect(844, top, 300, 1);
      font(600, 17);
      text(fit(ctx, s.rp.cardRed, 300), 844, top + 29, C.tx2);
      font(700, 30);
      ctx.letterSpacing = '-0.3px';
      const wv = ctx.measureText(v.red).width;
      text(v.red, 1144, top + 66, v.redOn ? C.red : C.tx, 'right');
      ctx.letterSpacing = '0px';
      if (v.redCap) {
        font(600, 15);
        text(fit(ctx, v.redCap, 300 - wv - 16), 844, top + 66, C.tx3);
      }
    }
  }

  // Base: linha do FPS da partida (104 px, área 10%) e o rodapé
  if (v.fps) {
    const [, max] = extent(v.fps)!;
    const top = 453;
    const h = 104;
    const hi = max * 1.1 || 1;
    const step = 1088 / Math.max(1, v.fps.length - 1);
    const pts: [number, number][][] = [[]];
    v.fps.forEach((f, i) => {
      if (f == null) {
        if (pts[pts.length - 1].length) pts.push([]);
        return;
      }
      pts[pts.length - 1].push([56 + i * step, top + h - (Math.max(0, f) / hi) * h]);
    });
    for (const seg of pts.filter((p) => p.length > 1)) {
      ctx.beginPath();
      ctx.moveTo(seg[0][0], top + h);
      for (const [px, py] of seg) ctx.lineTo(px, py);
      ctx.lineTo(seg[seg.length - 1][0], top + h);
      ctx.closePath();
      ctx.fillStyle = 'rgba(61, 220, 132, 0.10)';
      ctx.fill();
      ctx.beginPath();
      seg.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.strokeStyle = C.fps;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.stroke();
    }
    font(600, 14);
    text(s.rp.cardFpsLine, 56, base(567, 14, 19), C.tx3);
  }
  font(600, 14);
  text(URL_TEXT, 1144, base(567, 14, 19), C.tx3, 'right');
}
