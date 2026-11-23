import type { Dict } from '../../../i18n';
import { Catalog, GameSession, SettingsPage } from '../../../models';
import { capitalize, fmtDuration } from '../../format';
import { num } from '../../reports';
import { critEntries, durationSec, perMinute } from './session-util';

/**
 * 1.3 · "O que segurou o FPS" (docs/v13-contract.md › 2): frases de fato com os números da sessão, nunca diagnóstico.
 * Regra pura; "Última sessão" mostra até 4 e o card de compartilhar até 2 (já vêm ordenadas crit > warn > info).
 */
export type InsightTone = 'info' | 'warn' | 'crit';

export interface Insight {
  id: string;
  tone: InsightTone;
  text: string;
  link?: SettingsPage;
}

const RANK: Record<InsightTone, number> = { crit: 0, warn: 1, info: 2 };

/** Limites do contrato. */
export const INSIGHT_RULES = {
  gpuBound: 95,
  gpuSpare: 80,
  gpuSpareMinSec: 120,
  power: 0.25,
  thermal: 0.1,
  critSec: 30,
  critMax: 2,
  stuttersPerMin: 2,
} as const;

/**
 * Regras (todas com números da sessão): GPU no limite / com folga, clock limitado por energia / temperatura, tempo
 * acima do limite crítico (as 2 métricas que mais ficaram, ≥ 30 s), engasgos por minuto e o jogo que fechou com erro.
 */
export function sessionInsights(x: GameSession, s: Dict, cat?: Catalog | null): Insight[] {
  const v = s.v13;
  const out: Insight[] = [];
  const pct = (a: number) => Math.round(a * 100);

  if (x.gameExit === 'crash') out.push({ id: 'gameExit', tone: 'crit', text: v.insCrash });
  else if (x.gameExit === 'hang') out.push({ id: 'gameExit', tone: 'crit', text: v.insHang });

  const crit = critEntries(x)
    .filter(([, sec]) => sec >= INSIGHT_RULES.critSec)
    .sort((a, b) => b[1] - a[1])
    .slice(0, INSIGHT_RULES.critMax);
  for (const [id, sec] of crit) {
    const name = s.rp.redNames[id] ?? s.rp.rows[id] ?? cat?.metrics?.find((m) => m.id === id)?.name ?? id;
    out.push({ id: `crit:${id}`, tone: 'crit', text: v.insCrit(capitalize(name), fmtDuration(sec)) });
  }

  const reasons = x.clockReasonSec ?? {};
  const total = Object.values(reasons).reduce<number>((a, b) => a + (b ?? 0), 0);
  if (total > 0) {
    const power = (reasons.power ?? 0) / total;
    const thermal = (reasons.thermal ?? 0) / total;
    if (power >= INSIGHT_RULES.power) out.push({ id: 'power', tone: 'warn', text: v.insPower(pct(power)), link: 'gpu' });
    if (thermal >= INSIGHT_RULES.thermal) out.push({ id: 'thermal', tone: 'warn', text: v.insThermal(pct(thermal)) });
  }

  const pm = perMinute(x);
  if (pm != null && pm >= INSIGHT_RULES.stuttersPerMin) out.push({ id: 'stutters', tone: 'warn', text: v.insStutters(x.stutters!, num(pm, 1, s)) });

  if (x.avgGpuLoad != null) {
    const load = Math.round(x.avgGpuLoad);
    if (x.avgGpuLoad >= INSIGHT_RULES.gpuBound) out.push({ id: 'gpuBound', tone: 'info', text: v.insGpuBound(load) });
    else if (x.avgGpuLoad < INSIGHT_RULES.gpuSpare && durationSec(x) >= INSIGHT_RULES.gpuSpareMinSec) out.push({ id: 'gpuSpare', tone: 'info', text: v.insGpuSpare(load) });
  }

  // sort é estável: dentro do mesmo tom fica a ordem acima
  return out.sort((a, b) => RANK[a.tone] - RANK[b.tone]);
}
