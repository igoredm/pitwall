import { Injectable, computed, inject, signal } from '@angular/core';
import { UpdateState } from '../models';
import { TelemetryService } from '../telemetry.service';

const SNOOZE_KEY = 'pitwall.updateSnooze';

/**
 * "Depois": esconde o aviso de atualização por 24 h ou até sair uma versão nova. Fica no navegador do WebView2
 * (por máquina); se o armazenamento falhar, o aviso só volta a aparecer, nada quebra.
 */
@Injectable({ providedIn: 'root' })
export class UpdateNotice {
  private readonly t = inject(TelemetryService);
  private readonly snooze = signal(read());

  /** Há uma versão nova para mostrar (cartão no rodapé da navegação). */
  readonly pending = computed(() => {
    const u = this.t.update();
    if (!u?.version || !(['available', 'downloading', 'ready'] as UpdateState['status'][]).includes(u.status)) return null;
    const sn = this.snooze();
    return sn && sn.version === u.version && sn.until > Date.now() && u.status === 'available' ? null : u;
  });
  readonly snoozed = computed(() => {
    const u = this.t.update();
    const sn = this.snooze();
    return !!u?.version && !!sn && sn.version === u.version && sn.until > Date.now();
  });

  later(version: string) {
    const v = { version, until: Date.now() + 86_400_000 };
    this.snooze.set(v);
    try {
      localStorage.setItem(SNOOZE_KEY, JSON.stringify(v));
    } catch {
      // sem armazenamento: vale só nesta janela
    }
  }
}

function read(): { version: string; until: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? 'null');
    return v && typeof v.version === 'string' && typeof v.until === 'number' ? v : null;
  } catch {
    return null;
  }
}
