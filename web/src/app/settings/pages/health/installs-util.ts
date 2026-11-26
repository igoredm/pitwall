import { PcEvent, PcInstall } from '../../../models';

const DAY = 86_400_000;
/** Eventos de uma mesma queda (Kernel-Power 41 + EventLog 6008 + BugCheck 1001) chegam juntos: viram 1. */
const SAME_CRASH = 2 * 60_000;
const BUGCHECK_LATE = 15 * 60_000;

/** Horas das quedas do PC (desligamento abrupto, tela azul, WHEA grave, reinício do driver de vídeo), uma por queda, em ordem. */
export function crashTimes(events: readonly PcEvent[]): number[] {
  const list = events
    .filter((e) => e.kind === 'kernelPower41' || e.kind === 'unexpectedShutdown' || e.kind === 'bugcheck' || e.kind === 'gpuReset' || (e.kind === 'whea' && e.fatal))
    .map((e) => ({ t: new Date(e.time).getTime(), bug: e.kind === 'bugcheck' }))
    .filter((x) => !isNaN(x.t))
    .sort((a, b) => a.t - b.t);
  const out: number[] = [];
  for (const x of list) {
    const gap = out.length ? x.t - out[out.length - 1] : Infinity;
    // O BugCheck 1001 é gravado alguns minutos depois do boot: ainda é a mesma queda
    if (gap > (x.bug ? BUGCHECK_LATE : SAME_CRASH)) out.push(x.t);
  }
  return out;
}

/** Quedas nos `days` dias antes e depois da instalação (dateOnly: "depois" conta do começo do dia). */
export function crashesAround(item: PcInstall, crashes: readonly number[], days = 7): { before: number; after: number } {
  const at = new Date(item.time).getTime();
  const span = days * DAY;
  let before = 0;
  let after = 0;
  for (const t of crashes) {
    if (t >= at && t < at + span) after++;
    else if (t < at && t >= at - span) before++;
  }
  return { before, after };
}

/** "Principais": esconde apps da Store e drivers que vêm com o Windows (provedor Microsoft). */
export function isMainInstall(i: PcInstall): boolean {
  if (i.kind === 'store') return false;
  if (i.kind === 'driver' && /^microsoft\b/i.test(i.publisher ?? '')) return false;
  return true;
}
