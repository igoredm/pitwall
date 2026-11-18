import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import qrcode from 'qrcode-generator';
import { I18n } from '../../i18n';
import { PairedDevice } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { dayTime } from '../format';
import { copyText } from '../helpers';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';

/** QR → caminho SVG (um retângulo por sequência de módulos escuros na linha). Sem canvas e sem innerHTML. */
function qrPath(text: string): { d: string; size: number } {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.isDark(r, c)) continue;
      let w = 1;
      while (c + w < n && qr.isDark(r, c + w)) w++;
      d += `M${c} ${r}h${w}v1h-${w}z`;
      c += w - 1;
    }
  }
  return { d, size: n };
}
const qrCache = new Map<string, { d: string; size: number }>();
function qrCached(url: string) {
  let v = qrCache.get(url);
  if (!v) {
    v = qrPath(url);
    qrCache.clear();
    qrCache.set(url, v);
  }
  return v;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const VALID_SEC = 120;

/** Pitwall › Celular e TV: ativar, aviso de rede local, parear (endereço + código de 6 dígitos + QR) e aparelhos. */
@Component({
  selector: 'pw-page-devices',
  imports: [PageHead, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="devices" />

    @if (d) {
      <div class="top">
        <div class="grp" data-tour="remote">
          <div class="row">
            <div class="rl">
              <div class="lb" id="l-remote">{{ sx.remoteEnable }}</div>
              <div class="ht">{{ sx.remoteEnableHint }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-remote" [attr.aria-checked]="enabled()" (click)="toggle()"></button>
          </div>
        </div>
        <div class="note n-y warnnote">
          <span class="ico"><pw-icon name="warn" [size]="16" [stroke]="2" /></span>
          <span><b>{{ sx.phoneWarnBold }}</b>{{ sx.remoteWarn(port()) }}</span>
        </div>
      </div>

      @if (enabled()) {
        <section class="sec" data-anchor="pair">
          <div class="sh">
            <div>
              <h2>{{ sx.pairSec }}</h2>
              <div class="ht">{{ sx.pairSecHint }}</div>
            </div>
          </div>
          @if (portBusy(); as pb) {
            <div class="note n-r">
              <span class="ico"><pw-icon name="warn" [size]="16" [stroke]="2" /></span>
              <div class="rl">
                <b>{{ sx.portBusyTitle(pb) }}</b> {{ sx.portBusyBody }}
                <div class="portrow">
                  <input class="in" inputmode="numeric" [attr.aria-label]="sx.portAria" [value]="newPort()" (input)="newPort.set($any($event.target).value)" (keydown.enter)="usePort()" />
                  <button type="button" class="btn sm" (click)="usePort()">{{ sx.usePort }}</button>
                </div>
              </div>
            </div>
          } @else if (error(); as err) {
            <div class="note n-r mid">
              <span class="ico"><pw-icon name="warn" [size]="16" [stroke]="2" /></span>
              <span class="grow">{{ err }}</span>
              <button type="button" class="btn sm" (click)="startPairing()">{{ sx.pairNew }}</button>
            </div>
          } @else {
            <div class="grp" data-tour="pair">
              @if (code(); as c) {
                <div class="pair">
                  <div class="steps">
                    <div>
                      <div class="cap b">{{ sx.pairStep1 }}</div>
                      <div class="addr">
                        <span class="mono big">{{ c.host }}</span>
                        <button type="button" class="btn sm qt" (click)="copy(c.host)">{{ copied() ? sx.copied : sx.copy }}</button>
                      </div>
                      @for (alt of c.alts; track alt) {
                        <div class="mono alt">{{ alt }}</div>
                      }
                    </div>
                    <div>
                      <div class="cap b">{{ sx.pairStep2 }}</div>
                      <div class="digits" role="img" [attr.aria-label]="sx.codeAria(c.spoken)" [class.expired]="c.left <= 0">
                        @for (ch of c.digits; track $index) {
                          @if ($index === 3) {
                            <span class="gap"></span>
                          }
                          <span class="dgt">{{ ch }}</span>
                        }
                      </div>
                      @if (c.left > 0) {
                        <div class="timer">
                          <span class="bar tb" role="progressbar" [attr.aria-label]="sx.pairValidAria" [attr.aria-valuenow]="c.left" aria-valuemin="0" [attr.aria-valuemax]="validSec">
                            <span [style.width.%]="(c.left / validSec) * 100" style="background: var(--ac)"></span>
                          </span>
                          <span class="cap">{{ sx.pairValid2(c.countdown) }}</span>
                          <button type="button" class="btn sm qt" (click)="startPairing()"><pw-icon name="refresh" [size]="14" [stroke]="2" />{{ sx.pairNew }}</button>
                        </div>
                      } @else {
                        <div class="expired-row">
                          <div>
                            <div class="lb">{{ sx.pairExpiredTitle }}</div>
                            <div class="ht">{{ sx.pairExpiredHint }}</div>
                          </div>
                          <button type="button" class="btn sm pri" (click)="startPairing()">{{ sx.pairNew }}</button>
                        </div>
                      }
                    </div>
                  </div>
                  <div class="qrcol">
                    <span class="qr" [class.expired]="c.left <= 0">
                      <svg [attr.viewBox]="'0 0 ' + c.qr.size + ' ' + c.qr.size" width="132" height="132" shape-rendering="crispEdges" role="img" [attr.aria-label]="sx.qrAria">
                        <path [attr.d]="c.qr.d" fill="#111" />
                      </svg>
                    </span>
                    <span class="cap qrcap">{{ sx.qrCaption }}</span>
                  </div>
                </div>
              } @else {
                <div class="pair">
                  <div class="steps">
                    <span class="skel" style="width: 220px; height: 22px"></span>
                    <span class="skel" style="width: 280px; height: 54px"></span>
                  </div>
                  <div class="qrcol"><span class="skel" style="width: 152px; height: 152px"></span></div>
                </div>
              }
            </div>
          }
        </section>

        <section class="sec" data-anchor="list">
          <div class="sh">
            <h2>{{ sx.pairedSec }}</h2>
            @if (t.devices().length > 1) {
              <button type="button" class="btn sm qt dg" (click)="revokeAll()">{{ sx.revokeAll }}</button>
            }
          </div>
          <div class="grp">
            @for (dev of devices(); track dev.id) {
              <div class="row">
                <span class="ico t2"><pw-icon [name]="dev.icon" [size]="18" /></span>
                <div class="rl">
                  <div class="lb dname">
                    <span class="ell">{{ dev.name }}</span>
                    @if (dev.online) {
                      <span class="pill p-g">{{ sx.watchingNow }}</span>
                    }
                  </div>
                  <div class="ht">{{ dev.line }}</div>
                </div>
                <button type="button" class="btn sm" [attr.aria-label]="sx.revoke + ' · ' + dev.name" (click)="revoke(dev.id)">{{ sx.revoke }}</button>
              </div>
            } @empty {
              <div class="empty"><div class="ht">{{ sx.noDevices2 }}</div></div>
            }
          </div>
        </section>
      }
    }
  `,
  styles: `
    .top {
      margin-top: 22px;
    }
    .warnnote {
      margin-top: 12px;
    }
    .portrow {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      input {
        width: 90px;
      }
    }
    .pair {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 190px;
      gap: 24px;
      padding: 20px;
    }
    .steps {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .b {
      font-weight: 700;
    }
    .addr {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 6px;
    }
    .big {
      font-size: 20px;
      font-weight: 500;
      color: var(--tx);
      user-select: all;
    }
    .alt {
      color: var(--tx3);
      margin-top: 2px;
    }
    .digits {
      display: flex;
      gap: 6px;
      margin-top: 8px;
      &.expired {
        opacity: 0.4;
      }
    }
    .gap {
      width: 6px;
    }
    .dgt {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 54px;
      border-radius: 8px;
      background: var(--sf2);
      border: 1px solid var(--bd);
      font-size: 28px;
      font-weight: 700;
    }
    .timer {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 10px;
    }
    .tb {
      width: 180px;
    }
    .expired-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 10px;
    }
    .qrcol {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      border-left: 1px solid var(--hair);
      padding-left: 24px;
    }
    .qr {
      display: block;
      padding: 10px;
      background: #fff;
      border-radius: 8px;
      svg {
        display: block;
      }
      &.expired {
        opacity: 0.35;
      }
    }
    .qrcap {
      text-align: center;
    }
    .dname {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
  `,
})
export class DevicesPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  protected readonly validSec = VALID_SEC;
  protected readonly copied = signal(false);
  protected readonly newPort = signal('');
  private readonly now = signal(Date.now());
  private timer?: ReturnType<typeof setInterval>;
  private requested = false;

  protected readonly enabled = computed(() => this.ctx.draft()?.remote?.enabled ?? false);
  protected readonly port = computed(() => this.t.catalog()?.remote?.port ?? this.ctx.draft()?.remote?.port ?? 48124);
  private readonly running = computed(() => this.t.catalog()?.remote?.running ?? false);

  protected readonly portBusy = computed(() => {
    const r = this.t.catalog()?.remote;
    return this.enabled() && r?.error ? (r.port ?? this.port()) : null;
  });

  protected readonly error = computed(() => {
    const s = this.s();
    const p = this.t.pairing();
    if (p && !p.ok) {
      if (p.error === 'disabled') return s.pairErrDisabled;
      if (p.error === 'noNetwork') return s.pairErrNoNetwork;
      return s.pairErrNotRunning(this.port());
    }
    return null;
  });

  protected readonly code = computed(() => {
    const p = this.t.pairing();
    if (!p?.ok) return null;
    let code = p.code ?? '';
    if (!code) {
      try {
        code = new URLSearchParams(new URL(p.url).hash.split('?')[1] ?? '').get('pair') ?? '';
      } catch {
        code = '';
      }
    }
    const left = Math.max(0, Math.round((new Date(p.expiresAt).getTime() - this.now()) / 1000));
    const typeUrls = p.typeUrls?.length ? p.typeUrls : p.urls;
    return {
      qr: qrCached(p.url),
      host: hostOf(p.typeUrl ?? p.url),
      alts: (typeUrls ?? []).slice(1, 3).map(hostOf),
      digits: code.split(''),
      spoken: code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code,
      left,
      countdown: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
    };
  });

  protected readonly devices = computed(() => {
    const s = this.s();
    const now = this.now();
    const date = (iso: string) => new Date(iso).toLocaleDateString(s.locale, { day: '2-digit', month: '2-digit' });
    return [...this.t.devices()]
      .sort((a, b) => Number(!!b.online) - Number(!!a.online) || (b.lastSeen ?? b.created).localeCompare(a.lastSeen ?? a.created))
      .map((d: PairedDevice) => {
        const fresh = now - new Date(d.created).getTime() < 2 * 86_400_000;
        const line = d.online
          ? s.pairedWhen(dayTime(d.created, s))
          : d.lastSeen
            ? `${s.seenAgo(s.ago(now - new Date(d.lastSeen).getTime()))} · ${fresh ? s.pairedWhen(dayTime(d.created, s)).toLowerCase() : s.pairedOnDate(date(d.created))}`
            : `${s.neverSeen} · ${s.pairedOnDate(date(d.created))}`;
        return { ...d, icon: d.kind === 'tv' ? 'tv' : d.kind === 'desktop' ? 'desktop' : 'phone', line };
      });
  });

  constructor() {
    this.t.send({ type: 'listDevices' });
    // Abre a seção já com um código, assim que o servidor da rede estiver de pé
    effect(() => {
      const on = this.enabled() && this.running();
      if (on && !this.requested && !untracked(() => this.code())) {
        this.requested = true;
        untracked(() => this.startPairing());
      }
      if (!this.enabled()) this.requested = false;
    });
    // Contagem regressiva: só anda com um código válido na tela
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
    effect(() => {
      const p = this.portBusy();
      if (p) untracked(() => this.newPort.set(String(Number(p) + 1)));
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

  protected usePort() {
    const p = Math.round(Number(this.newPort()));
    if (!p || p < 1024 || p > 65535) return;
    this.ctx.update((c) => {
      c.remote = { enabled: true, pairedDevices: [], ...c.remote, port: p };
    });
  }

  protected copy(text: string) {
    copyText(text).then((ok) => {
      if (!ok) return;
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  protected revoke(id: string) {
    this.t.send({ type: 'revokeDevice', id });
  }

  protected async revokeAll() {
    const s = this.s();
    const ok = await this.ctx.confirm({ title: s.revokeAllTitle, body: s.revokeAllBody, confirm: s.revokeAll, danger: true });
    if (ok) for (const d of this.t.devices()) this.revoke(d.id);
  }
}
