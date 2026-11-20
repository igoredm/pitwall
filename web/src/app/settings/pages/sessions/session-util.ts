import type { Dict } from '../../../i18n';
import { Catalog, GameSession, SessionSeries } from '../../../models';
import { shortCpu, shortGpu } from '../../../widget/metric-views';
import { fmtDuration } from '../../format';
import { num, shortDayTime } from '../../reports';

/** Séries da linha do tempo (getSessionSeries) que viram botão no segmentado. */
export type SeriesKey = keyof SessionSeries['series'];

/** 1.2: marcador com a origem (opcional no backend: design-notes › "O que precisa do backend" › 4). */
export interface MarkerVia {
  via?: 'hotkey' | 'button';
}

/** Duração em segundos (sessão aberta = até agora). */
export function durationSec(x: GameSession, live = false): number {
  const start = new Date(x.start).getTime();
  if (live) return (Date.now() - start) / 1000;
  if (x.durationSec != null) return x.durationSec;
  return x.end ? (new Date(x.end).getTime() - start) / 1000 : 0;
}

/** Hora do fim (end, senão início + duração). */
export function endTime(x: GameSession): number | null {
  if (x.end) return new Date(x.end).getTime();
  return x.durationSec != null ? new Date(x.start).getTime() + x.durationSec * 1000 : null;
}

/** Engasgos por minuto (null = não contado ou sem duração). */
export function perMinute(x: GameSession): number | null {
  const d = durationSec(x);
  return x.stutters != null && d > 0 ? x.stutters / (d / 60) : null;
}

/** "0,1" (1 casa) ou "0,13" (2 casas, na comparação). */
export function fmtPm(v: number, s: Dict, digits = 1): string {
  return num(v, digits, s);
}

/** Maior tempo no vermelho entre as métricas (s). */
export function secondsRed(x: GameSession): number | null {
  const crit = x.secondsAboveCrit;
  if (!crit) return x.secondsAboveWarn ? 0 : null;
  const vals = Object.values(crit);
  return vals.length ? Math.max(...vals) : 0;
}

/** Terminou numa queda: marcado pelo backend, ou (sessão antiga) sem fim e não está aberta. */
export function crashed(x: GameSession, live: boolean): boolean {
  return !!x.endedByCrash || (!x.end && !live);
}

/** Nome do jogo no card: o exe sem ".exe" (o perfil não tem nome amigável). */
export function gameName(x: GameSession): string {
  return x.exe.replace(/\.exe$/i, '');
}

/** "RTX 3080 · Ryzen 7 5800X3D · 32 GB" (o da sessão; senão o do PC agora). */
export function hardwareLine(x: GameSession, cat: Catalog | null): string {
  const gpu = x.gpu ?? cat?.hardware.gpu;
  const cpu = x.cpu ?? cat?.hardware.cpu;
  return [gpu ? shortGpu(gpu) : '', cpu ? shortCpu(cpu) : '', cat?.hardware.ramGb ? `${cat.hardware.ramGb} GB` : ''].filter(Boolean).join(' · ');
}

/** Opção dos seletores do Comparar: "FC26.exe · hoje, 20:26 · 48 min". */
export function optionLabel(x: GameSession, s: Dict): string {
  const d = durationSec(x);
  return [x.exe, shortDayTime(x.start, s), d > 0 ? fmtDuration(d) : ''].filter(Boolean).join(' · ');
}

/** Mesma sessão (o start vem em ISO; tolera 1 s, como o backend). */
export function sameStart(a: string, b: string): boolean {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= 1000;
}
