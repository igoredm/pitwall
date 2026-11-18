import { ChangeDetectionStrategy, Component, Injectable, computed, inject, signal } from '@angular/core';
import { I18n } from '../i18n';
import { UpdateState } from '../models';
import { TelemetryService } from '../telemetry.service';
import { markdownToBlocks } from './format';
import { SettingsCtx } from './settings-ctx';

const SNOOZE_KEY = 'pitwall.updateSnooze';

/**
 * "Depois": esconde o aviso de atualização por 24 h ou até sair uma versão nova. Fica no navegador do WebView2
 * (por máquina); se o armazenamento falhar, o aviso só volta a aparecer — nada quebra.
 */
@Injectable({ providedIn: 'root' })
export class UpdateNotice {
  private readonly t = inject(TelemetryService);
  private readonly snooze = signal(read());

  /** Há uma versão nova para mostrar (ponto/card na navegação). */
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

/** Geral → card "Atualizações": faixa de status, canal Estável/Beta, procurar sozinho, notas sanitizadas. */
@Component({
  selector: 'pw-updates-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './updates-card.scss',
  template: `
    @let u = t.update();
    @let sx = s();
    <section class="panel" id="updates">
      <h2>{{ sx.updatesTitle }}</h2>

      @if (u) {
        @switch (u.status) {
          @case ('available') {
            <div class="strip" [class.quiet]="notice.snoozed()">
              <span class="pulse" aria-hidden="true"></span>
              <span class="grow">
                <span class="st-title">{{ sx.updAvailable(u.version ?? '') }}@if (u.size) { <span class="hint"> · {{ (u.size / 1048576).toFixed(0) }} MB</span> }</span>
                <span class="hint">{{ notice.snoozed() ? sx.updSnoozed : sx.updYouHave(u.current, channelName(u.channel)) }}</span>
              </span>
              <button class="link" (click)="notesOpen.set(!notesOpen())" [attr.aria-expanded]="notesOpen()">{{ notesOpen() ? sx.updHideNotes : sx.updNotes }}</button>
              @if (!notice.snoozed()) {
                <button class="btn" (click)="notice.later(u.version!)">{{ sx.updLater }}</button>
              }
              <button class="btn primary" (click)="install('now')">{{ sx.updNow }}</button>
            </div>
            <div class="sub-actions">
              <button class="link" (click)="install('exit')">{{ sx.updOnExit }}</button>
              <span class="hint">·</span>
              <button class="link muted-link" (click)="t.send({ type: 'skipUpdate' })">{{ sx.updSkip }}</button>
              <span class="hint grow right">{{ sx.updRestartNote }}</span>
            </div>
          }
          @case ('downloading') {
            <div class="strip plain">
              <span class="grow">
                <span class="st-title">{{ sx.updDownloading(u.progress ?? 0) }}</span>
                <span class="prog"><i [style.transform]="'scaleX(' + (u.progress ?? 0) / 100 + ')'"></i></span>
              </span>
            </div>
          }
          @case ('ready') {
            <div class="strip plain">
              <span class="pulse ok" aria-hidden="true"></span>
              <span class="grow">
                <span class="st-title">{{ sx.updAvailable(u.version ?? '') }}</span>
                <span class="hint">{{ u.installOnExit ? sx.updReadyExit : u.waitingForGame ? sx.updReadyGame : sx.updInstalling }}</span>
              </span>
              @if (u.installOnExit) {
                <button class="btn primary" (click)="install('now')">{{ sx.updNow }}</button>
              }
            </div>
          }
          @case ('error') {
            <div class="strip error">
              <span class="grow">
                <span class="st-title">{{ u.version ? sx.updFailed : sx.updOffline }}</span>
                @if (u.error) {
                  <span class="hint">{{ u.error }}</span>
                }
              </span>
              <button class="btn" (click)="u.version ? install('now') : check()">{{ u.version ? sx.updRetry : sx.updCheckNow }}</button>
            </div>
          }
          @case ('checking') {
            <div class="field row first">
              <span class="hint">{{ sx.updChecking }}</span>
              <button class="btn" disabled>{{ sx.updCheckNow }}</button>
            </div>
          }
          @default {
            <div class="field row first">
              <span class="hint">
                {{ sx.updUpToDate }}{{ u.lastCheck ? ' · ' + sx.updChecked(sx.ago(now() - lastCheckMs(u.lastCheck))) : '' }}
              </span>
              <button class="btn" (click)="check()">{{ sx.updCheckNow }}</button>
            </div>
          }
        }

        @if (notesOpen() && u.status === 'available') {
          <div class="notes" role="region" [attr.aria-label]="sx.updNotes">
            @for (b of notes(); track $index) {
              <p [class]="'md-' + b.kind">
                @for (sp of b.spans; track $index) {
                  @if (sp.code) {
                    <code>{{ sp.t }}</code>
                  } @else if (sp.b) {
                    <b>{{ sp.t }}</b>
                  } @else if (sp.i) {
                    <i>{{ sp.t }}</i>
                  } @else {
                    {{ sp.t }}
                  }
                }
              </p>
            }
            @if (u.notesUrl) {
              <div class="notes-url">
                <span class="hint">{{ sx.updPage }}</span>
                <span class="mono url">{{ u.notesUrl }}</span>
                <button class="link" (click)="copy(u.notesUrl)">{{ copied() ? sx.updCopied : sx.updCopy }}</button>
              </div>
            }
          </div>
        }
      } @else {
        <div class="field row first"><span class="hint">{{ sx.loading }}</span></div>
      }

      <div class="field row">
        <div>
          <div class="f-label">{{ sx.updChannel }}</div>
          <div class="hint">{{ sx.updChannelHint }}</div>
        </div>
        <div class="seg" role="group" [attr.aria-label]="sx.updChannel">
          <button [class.sel]="channel() === 'stable'" [attr.aria-pressed]="channel() === 'stable'" (click)="setChannel('stable')">{{ sx.updStable }}</button>
          <button [class.sel]="channel() === 'beta'" [attr.aria-pressed]="channel() === 'beta'" (click)="setChannel('beta')">{{ sx.updBeta }}</button>
        </div>
      </div>
      <div class="field row">
        <div>
          <div class="f-label">{{ sx.updAuto }}</div>
          <div class="hint">{{ sx.updAutoHint }}</div>
        </div>
        <button class="switch" role="switch" [attr.aria-checked]="autoCheck()" [attr.aria-label]="sx.updAuto" [class.on]="autoCheck()" (click)="toggleAuto()"><i></i></button>
      </div>
    </section>
  `,
})
export class UpdatesCard {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly notice = inject(UpdateNotice);
  private readonly ctx = inject(SettingsCtx);

  protected readonly notesOpen = signal(false);
  protected readonly copied = signal(false);
  /** Só para o "verificado há 2 h"; não precisa andar sozinho. */
  protected readonly now = signal(Date.now());

  protected readonly notes = computed(() => markdownToBlocks(this.t.update()?.notes ?? ''));
  protected readonly channel = computed(() => this.t.update()?.channel ?? this.ctx.draft()?.update?.channel ?? 'stable');
  protected readonly autoCheck = computed(() => this.ctx.draft()?.update?.autoCheck ?? true);

  protected channelName(c: string) {
    return (c === 'beta' ? this.s().updBeta : this.s().updStable).toLowerCase();
  }

  protected lastCheckMs(iso: string) {
    return new Date(iso).getTime();
  }

  protected install(when: 'now' | 'exit') {
    this.t.send({ type: 'installUpdate', when });
  }

  protected check() {
    this.now.set(Date.now());
    this.t.send({ type: 'checkUpdate' });
  }

  protected setChannel(channel: 'stable' | 'beta') {
    this.t.send({ type: 'setUpdateChannel', channel });
  }

  protected toggleAuto() {
    this.ctx.update((c) => {
      c.update = { channel: 'stable', ...c.update, autoCheck: !(c.update?.autoCheck ?? true) };
    });
  }

  protected copy(url: string) {
    // Copia em vez de abrir: um link aberto daqui rodaria o navegador como administrador
    navigator.clipboard?.writeText(url).then(
      () => {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      },
      () => {},
    );
  }
}
