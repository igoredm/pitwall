import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { TelemetryService } from '../telemetry.service';

/**
 * Claro ou escuro do app 1.0 (configurações, assistente, tour, tela de código). Vem de config.appearance
 * ("system" segue o Windows). Sem preferência do sistema, o padrão é escuro. O tema do widget é outra coisa
 * (widgetTheme/themeMode) e não passa por aqui.
 */
@Injectable({ providedIn: 'root' })
export class AppAppearance {
  private readonly t = inject(TelemetryService);
  private readonly mq = matchMedia('(prefers-color-scheme: light)');
  private readonly systemLight = signal(this.mq.matches);

  readonly dark = computed(() => {
    const pref = this.t.config()?.appearance ?? 'system';
    return pref === 'dark' || (pref === 'system' && !this.systemLight());
  });
  /** Classe com os tokens (.app-dark | .app-light, em ui/kit.scss). */
  readonly cls = computed(() => (this.dark() ? 'app-dark' : 'app-light'));

  constructor() {
    // Fundo da página no tom do app (o index.html já pintou pelo sistema; aqui vale a escolha da config)
    effect(() => {
      const bg = this.dark() ? '#0e1014' : '#f3f4f6';
      if (/^#\/?(settings|wizard|mobile)/.test(location.hash)) document.documentElement.style.background = bg;
    });
    const on = (e: MediaQueryListEvent) => this.systemLight.set(e.matches);
    this.mq.addEventListener('change', on);
    inject(DestroyRef).onDestroy(() => this.mq.removeEventListener('change', on));
  }
}
