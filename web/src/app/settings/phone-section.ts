import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import qrcode from 'qrcode-generator';
import { I18n } from '../i18n';
import { TelemetryService } from '../telemetry.service';
import { SettingsCtx } from './settings-ctx';

/** QR → caminho SVG (um quadrado por módulo escuro). Sem canvas e sem innerHTML. */
function qrPath(text: string): { d: string; size: number } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      // junta módulos vizinhos na mesma linha num retângulo só (caminho bem menor)
      let w = 1;
      while (c + w < n && qr.isDark(r, c + w)) w++;
      d += `M${c} ${r}h${w}v1h-${w}z`;
      c += w - 1;
    }
  }
  return { d, size: n };
}

/** Celular → ativar, aviso de rede local, parear (QR + código + IP:porta, 2 min) e dispositivos pareados. */
@Component({
  selector: 'pw-phone-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './phone-section.scss',
  template: `
    @let sx = s();
    <section class="panel top">
      <div class="field row first">
        <div>
          <div class="f-label">{{ sx.phoneEnable }}</div>
          <div class="hint">{{ sx.phoneEnableHint }}</div>
        </div>
        <button class="switch" role="switch" [attr.aria-checked]="enabled()" [attr.aria-label]="sx.phoneEnable" [class.on]="enabled()" (click)="toggle()"><i></i></button>
      </div>
      <div class="warn">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3z" /><path d="M12 10v4" /><path d="M12 17v.5" /></svg>
        <span><b>{{ sx.phoneWarnBold }}</b>{{ sx.phoneWarn }}</span>
      </div>
    </section>

    @if (enabled()) {
      <div class="cols">
        <section class="panel pair">
          <h2>{{ sx.pairTitle }}</h2>
          <p class="hint sub">{{ sx.pairHint }}</p>
          @if (error(); as err) {
            <p class="err msg">{{ err }}</p>
            <button class="btn" (click)="startPairing()">{{ sx.pairStart }}</button>
          } @else if (code(); as c) {
            <div class="pair-body">
              <div class="qr" role="img" [attr.aria-label]="sx.qrAria" [class.expired]="c.left <= 0">
                <svg [attr.viewBox]="'0 0 ' + c.qr.size + ' ' + c.qr.size" shape-rendering="crispEdges"><path [attr.d]="c.qr.d" /></svg>
              </div>
              <div class="pair-info">
                <span class="hint">{{ sx.pairOrType }}</span>
                <span class="mono addr">{{ c.host }}</span>
                @for (alt of c.alts; track alt) {
                  <span class="mono alt">{{ alt }}</span>
                }
                <span class="hint gap">{{ sx.pairCode }}</span>
                <span class="mono code">{{ c.code }}</span>
                <span class="hint">
                  @if (c.left > 0) {
                    {{ sx.pairValid(c.countdown) }} ·
                  } @else {
                    {{ sx.pairExpired }}
                  }
                  <button class="link" (click)="startPairing()">{{ sx.pairNew }}</button>
                </span>
              </div>
            </div>
          } @else {
            <button class="btn primary" [disabled]="!running()" (click)="startPairing()">{{ running() ? sx.pairStart : sx.loading }}</button>
          }
        </section>

        <section class="panel devices">
          <div class="d-head">
            <h2>{{ sx.pairedTitle }}</h2>
            @if (t.devices().length > 1) {
              <button class="btn quiet danger-text" (click)="revokeAll()">{{ confirmAll() ? sx.confirmAgain : sx.revokeAll }}</button>
            }
          </div>
          @for (d of t.devices(); track d.id) {
            <div class="dev">
              <span class="dot" [class.on]="d.id === justPaired()" aria-hidden="true"></span>
              <span class="grow">
                <span class="strong">{{ d.name || '—' }}</span>
                <span class="hint">{{ d.id === justPaired() ? sx.justPaired + ' · ' : '' }}{{ sx.pairedOn(date(d.created)) }}</span>
              </span>
              <button class="btn" (click)="revoke(d.id)">{{ sx.revoke }}</button>
            </div>
          } @empty {
            <p class="hint empty">{{ sx.noDevices }}</p>
          }
        </section>
      </div>
    }
  `,
})
export class PhoneSection {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  private readonly ctx = inject(SettingsCtx);

  protected readonly enabled = computed(() => this.ctx.draft()?.remote?.enabled ?? false);
  protected readonly running = computed(() => this.t.catalog()?.remote?.running ?? false);
  protected readonly confirmAll = signal(false);
  /** Relógio da contagem regressiva: só anda enquanto há um código válido na tela. */
  private readonly now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;
  private requested = false;

  protected readonly justPaired = signal<string | null>(null);

  protected readonly error = computed(() => {
    const s = this.s();
    const remote = this.t.catalog()?.remote;
    const p = this.t.pairing();
    if (p && !p.ok) {
      if (p.error === 'disabled') return s.pairErrDisabled;
      if (p.error === 'noNetwork') return s.pairErrNoNetwork;
      return s.pairErrNotRunning(remote?.port ?? this.ctx.draft()?.remote?.port ?? '');
    }
    if (remote?.error) return s.pairErrNotRunning(remote.port ?? this.ctx.draft()?.remote?.port ?? '');
    return null;
  });

  protected readonly code = computed(() => {
    const p = this.t.pairing();
    if (!p?.ok) return null;
    let host = '';
    let code = '';
    try {
      const u = new URL(p.url);
      host = u.host;
      code = new URLSearchParams(u.hash.split('?')[1] ?? '').get('pair') ?? '';
    } catch {
      return null;
    }
    const alts = (p.urls ?? []).slice(1, 3).flatMap((x) => {
      try {
        return [new URL(x).host];
      } catch {
        return [];
      }
    });
    const left = Math.max(0, Math.round((new Date(p.expiresAt).getTime() - this.now()) / 1000));
    return {
      qr: qrPathCached(p.url),
      host,
      alts,
      // "K7QX 2MPA": mais fácil de ler e digitar
      code: code.length > 4 ? `${code.slice(0, Math.ceil(code.length / 2))} ${code.slice(Math.ceil(code.length / 2))}` : code,
      left,
      countdown: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
    };
  });

  constructor() {
    this.t.send({ type: 'listDevices' });
    // Abre a seção já com um código, assim que o servidor do celular estiver de pé
    effect(() => {
      const on = this.enabled() && this.running();
      if (on && !this.requested && !untracked(() => this.code())) {
        this.requested = true;
        untracked(() => this.startPairing());
      }
      if (!this.enabled()) this.requested = false;
    });
    // Contagem regressiva: liga com um código válido, desliga quando vence
    effect(() => {
      const p = this.t.pairing();
      clearInterval(this.timer);
      if (p?.ok) {
        this.now.set(Date.now());
        this.timer = setInterval(() => {
          this.now.set(Date.now());
          if (new Date(p.expiresAt).getTime() <= Date.now()) clearInterval(this.timer);
        }, 1000);
      }
    });
    // Celular acabou de parear: destaca e já deixa outro código pronto
    let lastDevices = this.t.devices().length;
    effect(() => {
      const list = this.t.devices();
      untracked(() => {
        if (list.length > lastDevices) {
          const newest = [...list].sort((a, b) => b.created.localeCompare(a.created))[0];
          if (newest) this.justPaired.set(newest.id);
        }
        lastDevices = list.length;
      });
    });
    inject(DestroyRef).onDestroy(() => clearInterval(this.timer));
  }

  protected toggle() {
    const on = !this.enabled();
    this.ctx.update((c) => {
      c.remote = { port: 48124, pairedDevices: [], ...c.remote, enabled: on };
    });
    if (!on) this.t.pairing.set(null);
  }

  protected startPairing() {
    this.t.pairing.set(null);
    this.t.send({ type: 'startPairing' });
  }

  protected revoke(id: string) {
    this.t.send({ type: 'revokeDevice', id });
  }

  protected revokeAll() {
    if (!this.confirmAll()) {
      this.confirmAll.set(true);
      setTimeout(() => this.confirmAll.set(false), 4000);
      return;
    }
    this.confirmAll.set(false);
    for (const d of this.t.devices()) this.revoke(d.id);
  }

  protected date(iso: string) {
    return new Date(iso).toLocaleDateString(this.s().locale, { day: '2-digit', month: '2-digit' });
  }
}

const qrCache = new Map<string, { d: string; size: number }>();
function qrPathCached(url: string) {
  let v = qrCache.get(url);
  if (!v) {
    v = qrPath(url);
    qrCache.clear();
    qrCache.set(url, v);
  }
  return v;
}
