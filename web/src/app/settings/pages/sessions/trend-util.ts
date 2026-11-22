import type { Dict } from '../../../i18n';
import { EnergyConfig, TrendPoint } from '../../../models';
import { num } from '../../reports';

/**
 * 1.3 · Tendência por jogo e por driver (docs/v13-contract.md › 3) e energia por sessão (› 5). Regras puras.
 */

/** Mediana (null sem valores). */
export function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const a = [...values].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Mediana móvel (janela que termina no ponto, até `size` valores com leitura). null onde não há nenhum. */
export function movingMedian(values: readonly (number | null | undefined)[], size = 5): (number | null)[] {
  return values.map((_, i) => {
    const win = values.slice(Math.max(0, i - size + 1), i + 1).filter((v): v is number => v != null);
    return values[i] == null ? null : median(win);
  });
}

/** Δ médio hot spot − núcleo por sessão (null sem os dois). */
export function hotspotDelta(p: TrendPoint): number | null {
  return p.avgHotspot != null && p.avgGpuTemp != null ? p.avgHotspot - p.avgGpuTemp : null;
}

/** Índices onde o driver muda (o ponto i tem driver conhecido e diferente do último conhecido antes dele). */
export function driverChanges(points: readonly TrendPoint[]): { index: number; from: string; to: string }[] {
  const out: { index: number; from: string; to: string }[] = [];
  let last: string | undefined;
  points.forEach((p, i) => {
    if (!p.gpuDriver) return;
    if (last && p.gpuDriver !== last) out.push({ index: i, from: last, to: p.gpuDriver });
    last = p.gpuDriver;
  });
  return out;
}

export interface DriverShift {
  driver: string;
  before: number;
  after: number;
  /** Diferença em % (arredondada). */
  pct: number;
  nBefore: number;
  nAfter: number;
}

/** Mínimo de sessões de cada lado para a frase aparecer. */
export const SHIFT_MIN = 3;

/**
 * Antes × depois da última troca de driver: mediana do FPS médio das sessões com o driver anterior (o trecho logo
 * antes da troca) e das sessões com o driver novo (da troca até o fim). Precisa de ≥ 3 de cada lado; senão null.
 */
export function driverShift(points: readonly TrendPoint[]): DriverShift | null {
  const ch = driverChanges(points).at(-1);
  if (!ch) return null;
  const fps = (list: readonly TrendPoint[], driver: string) => list.filter((p) => p.gpuDriver === driver && p.avgFps != null).map((p) => p.avgFps!);
  // Trecho anterior: volta da troca até achar outro driver conhecido
  let startPrev = ch.index - 1;
  while (startPrev > 0 && (points[startPrev - 1].gpuDriver ?? ch.from) === ch.from) startPrev--;
  const before = fps(points.slice(startPrev, ch.index), ch.from);
  const after = fps(points.slice(ch.index), ch.to);
  if (before.length < SHIFT_MIN || after.length < SHIFT_MIN) return null;
  const b = median(before)!;
  const a = median(after)!;
  return { driver: ch.to, before: b, after: a, pct: b ? Math.round(((a - b) / b) * 100) : 0, nBefore: before.length, nAfter: after.length };
}

/** "Desde o driver 591.44: FPS médio 141 → 128 (−9%)". */
export function shiftSentence(d: DriverShift, s: Dict): string {
  const pct = d.pct === 0 ? '0%' : `${d.pct > 0 ? '+' : '−'}${Math.abs(d.pct)}%`;
  return s.v13.trendShift(d.driver, String(Math.round(d.before)), String(Math.round(d.after)), pct);
}

/** "≈ 0,42 kWh" (≥ 100 Wh) ou "≈ 6,1 Wh". */
export function fmtEnergy(wh: number, s: Dict): string {
  return wh >= 100 ? `≈ ${num(wh / 1000, 2, s)} kWh` : `≈ ${num(wh, 1, s)} Wh`;
}

/** "≈ R$ 0,38" com a tarifa (preço do kWh); null sem tarifa. Abaixo de 1 centavo: "< R$ 0,01". */
export function fmtCost(wh: number, energy: EnergyConfig | undefined, s: Dict): string | null {
  if (!energy || energy.tariff == null || !(energy.tariff >= 0)) return null;
  const cur = (energy.currency ?? '').trim();
  const cost = (wh / 1000) * energy.tariff;
  const pre = cur ? `${cur} ` : '';
  return cost > 0 && cost < 0.005 ? `< ${pre}${num(0.01, 2, s)}` : `≈ ${pre}${num(cost, 2, s)}`;
}
