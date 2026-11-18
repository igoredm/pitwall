import { PerfCapReason } from './models';

/** Motivos que viram chip, em ordem de prioridade (o primeiro ganha quando há mais de um ao mesmo tempo). */
export const PERFCAP_PRIORITY: Exclude<PerfCapReason, 'none'>[] = ['thermal', 'power', 'voltage', 'sync', 'idle'];

/** Só mostra um motivo depois de 2 s contínuos... */
const SHOW_AFTER_MS = 2000;
/** ...e segura por pelo menos 3 s, mesmo que ele suma antes. */
const HOLD_MS = 3000;

export interface PerfCapShown {
  reason: Exclude<PerfCapReason, 'none'> | null;
  /** Quando o motivo atual começou (ms); para o "há 2 min" das configurações. */
  since: number;
}

/**
 * Anti-tremido do chip "Limite: …" (gpu.perfcap). O backend manda o motivo cru a cada snapshot; aqui ele só
 * aparece depois de 2 s seguidos, fica pelo menos 3 s e, com vários motivos juntos, vale a prioridade
 * térmico > power > voltagem > sincronia > ocioso. Aceita "thermal,power" caso o backend passe a mandar mais de um.
 */
export class PerfCapFilter {
  private readonly present = new Map<string, number>();
  private shown: PerfCapShown = { reason: null, since: 0 };
  private shownAt = 0;

  /** Processa uma leitura; devolve o estado exibido (mesmo objeto se nada mudou). */
  push(raw: string | null | undefined, now: number): PerfCapShown {
    const set = new Set((raw ?? '').split(/[,|\s]+/).filter((r) => r && r !== 'none'));
    for (const r of [...this.present.keys()]) if (!set.has(r)) this.present.delete(r);
    for (const r of set) if (!this.present.has(r)) this.present.set(r, now);

    let candidate: PerfCapShown['reason'] = null;
    for (const r of PERFCAP_PRIORITY) {
      const t = this.present.get(r);
      if (t != null && now - t >= SHOW_AFTER_MS) {
        candidate = r;
        break;
      }
    }
    if (candidate === this.shown.reason) return this.shown;
    // Segura o motivo atual pelo tempo mínimo antes de trocar ou esconder
    if (this.shown.reason && now - this.shownAt < HOLD_MS) return this.shown;
    this.shownAt = now;
    this.shown = { reason: candidate, since: candidate ? (this.present.get(candidate) ?? now) : now };
    return this.shown;
  }

  reset() {
    this.present.clear();
    this.shown = { reason: null, since: 0 };
    this.shownAt = 0;
  }
}
