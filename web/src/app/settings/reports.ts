import type { Dict } from '../i18n';
import { PcEvent } from '../models';
import { hashParams } from '../telemetry.service';
import { clock } from './format';

/**
 * 1.2: peças comuns do Relatório do PC e dos Relatórios de jogo: números, hora dos eventos, gráficos em SVG
 * (viewBox fixo + preserveAspectRatio="none"), parâmetros no hash e download de arquivo.
 */

/** Número com vírgula decimal em PT ("4,45"); digits = casas fixas. */
export function num(v: number, digits: number, s: Dict): string {
  const txt = v.toFixed(digits);
  return s.decimalComma ? txt.replace('.', ',') : txt;
}

/** Tempo ligado: "45 s" · "14 min" · "3 h 12 min" · "2 d 4 h". */
export function fmtUp(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ${String(m % 60).padStart(2, '0')} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** Hora de um evento: "hoje 21:16" · "15/11 22:47". */
export function evTime(iso: string, s: Dict): string {
  const d = new Date(iso);
  const t = clock(d, s);
  if (d.toDateString() === new Date().toDateString()) return `${s.today} ${t}`;
  return `${d.toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit' })} ${t}`;
}

/** "12/11" (null = hoje). */
export function dayOrNull(iso: string | number, s: Dict): string | null {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? null : d.toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit' });
}

/** Chave do evento nas tabelas de nome/significado (WHEA fatal é uma linha à parte). */
export function evKey(e: PcEvent): string {
  return e.kind === 'whea' && e.fatal ? 'wheaFatal' : e.kind;
}

/** Fonte em mono: provedor sem o prefixo "Microsoft-Windows-", mais o código ou componente. */
export function evSource(e: PcEvent): string {
  const src = e.source.replace(/^Microsoft-Windows-/i, '');
  return e.code ? `${src} · ${e.code}` : src;
}

/** "0x00000124" → "0x124". */
export function shortCode(code?: string): string {
  if (!code) return '';
  const m = code.match(/^0x0*([0-9a-f]+)$/i);
  return m ? `0x${m[1].toUpperCase()}` : code;
}

/** Valor de uma leitura com unidade, como nas tabelas ("81 °C", "4,45 GHz", "8,9 GB", "7,2 ms"). */
export function fmtReading(v: number, unit: string, s: Dict, id = ''): string {
  if (unit === 'MHz' && id.startsWith('cpu')) return `${num(v / 1000, 2, s)} GHz`;
  switch (unit) {
    case 'GB':
    case 'ms':
    case 'Mbit/s':
    case 'MB/s':
      return `${num(v, 1, s)} ${unit}`;
    case 'V':
      return `${num(v, 3, s)} V`;
    case 'GHz':
      return `${num(v, 2, s)} GHz`;
    case 'fps':
    case '':
      return String(Math.round(v));
    default:
      return `${Math.round(v)} ${unit}`;
  }
}

// ------------------------------------------------------------------ gráficos

/** Mín e máx dos valores com leitura (null = nenhum). */
export function extent(data: readonly (number | null | undefined)[]): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of data) {
    if (v == null) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? null : [lo, hi];
}

/**
 * Linha (com buracos onde não houve leitura) e área de uma série no viewBox 0..w × 0..h. lo → yBottom, hi → yTop.
 * xEnd < w encurta a série (comparação: a partida mais curta não vai até o fim).
 */
export function seriesPaths(data: readonly (number | null)[], lo: number, hi: number, o: { w?: number; h: number; yTop: number; yBottom: number; xEnd?: number }) {
  const w = o.xEnd ?? o.w ?? 100;
  const span = hi - lo || 1;
  const step = w / Math.max(1, data.length - 1);
  let line = '';
  let area = '';
  let seg: [string, string][] = [];
  const close = () => {
    if (seg.length > 1) area += `M${seg[0][0]} ${o.h}L${seg.map((p) => p.join(' ')).join('L')}L${seg[seg.length - 1][0]} ${o.h}Z`;
    seg = [];
  };
  data.forEach((v, i) => {
    if (v == null) {
      close();
      return;
    }
    const x = (i * step).toFixed(2);
    const y = (o.yBottom - ((Math.min(hi, Math.max(lo, v)) - lo) / span) * (o.yBottom - o.yTop)).toFixed(2);
    line += (seg.length ? 'L' : 'M') + x + ' ' + y;
    seg.push([x, y]);
  });
  close();
  return { line, area };
}

/** Posição (0..100, de cima) de um valor na escala, ou null fora dela. */
export function yOf(v: number, lo: number, hi: number, yTop: number, yBottom: number): number | null {
  if (v < lo || v > hi) return null;
  return yBottom - ((v - lo) / (hi - lo || 1)) * (yBottom - yTop);
}

/**
 * 4 marcas "redondas" no eixo Y que cobrem [min, max], mais o domínio do gráfico (um terço de passo de folga em cima
 * e embaixo, como no design: 40/80/120/160).
 */
export function yTicks(min: number, max: number, count = 4): { ticks: number[]; lo: number; hi: number } {
  if (max - min < 1e-6) {
    min -= 1;
    max += 1;
  }
  const steps = [1, 2, 2.5, 5, 10];
  const raw = (max - min) / (count - 1);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const fits = (st: number) => Math.floor(min / st) * st + st * (count - 1) >= max;
  let step = steps.map((k) => k * mag).find((st) => st >= raw && fits(st)) ?? 10 * mag;
  while (!fits(step)) step *= 2;
  const t0 = Math.floor(min / step) * step;
  const ticks = Array.from({ length: count }, (_, i) => t0 + i * step);
  return { ticks, lo: t0 - step / 3, hi: ticks[count - 1] + step / 3 };
}

/** Marcas do eixo X em minutos (0, 10, 20…), sem encostar no rótulo do fim. */
export function minuteTicks(totalSec: number): number[] {
  const totalMin = totalSec / 60;
  const step = [1, 2, 5, 10, 15, 20, 30, 60, 120].find((k) => totalMin / k <= 5) ?? 240;
  const out: number[] = [];
  for (let m = 0; m < totalMin * 0.86; m += step) out.push(m);
  return out;
}

// ------------------------------------------------------------------ URL e arquivos

/** Muda parâmetros da query que fica no hash (#/settings/sessions/compare?a=…&b=…), sem criar entrada no histórico. */
export function setHashParams(updates: Record<string, string | null>) {
  const hash = location.hash || '#/';
  const i = hash.indexOf('?');
  const path = i >= 0 ? hash.slice(0, i) : hash;
  const q = hashParams();
  for (const [k, v] of Object.entries(updates)) {
    if (v == null) q.delete(k);
    else q.set(k, v);
  }
  const qs = q.toString();
  history.replaceState(history.state, '', location.pathname + location.search + path + (qs ? '?' + qs : ''));
}

/** Baixa um arquivo gerado na página (no app, o WebView2 mostra o diálogo de salvar do Windows). */
export function downloadBlob(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** "2026-11-19_21-14" para nomes de arquivo. */
export function fileStamp(iso: string | number): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
}

/** Como dayTime, mas com o dia da semana curto ("dom., 19:40"): cabe nas colunas das tabelas. */
export function shortDayTime(iso: string | number, s: Dict): string {
  const d = new Date(iso);
  const now = new Date();
  const time = clock(d, s);
  if (d.toDateString() === now.toDateString()) return `${s.today}, ${time}`;
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return `${s.yesterday}, ${time}`;
  const sameWeek = now.getTime() - d.getTime() < 6 * 86_400_000;
  const dayTxt = sameWeek ? d.toLocaleDateString(s.locale, { weekday: 'short' }) : d.toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit' });
  return `${dayTxt}, ${time}`;
}
