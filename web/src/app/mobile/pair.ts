import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { I18n } from '../i18n';
import { TelemetryService, urlParam } from '../telemetry.service';
import { AppAppearance } from '../ui/appearance';
import { Icon } from '../ui/icon';

/** Teclado na tela da TV: 3×4, na ordem de leitura. */
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
/** Teclas "Voltar" dos controles remotos (Tizen 10009, webOS 461) e do navegador. */
const BACK_KEYS = new Set(['Escape', 'Backspace', 'BrowserBack', 'GoBack']);
const BACK_CODES = new Set([10009, 461]);

/** TV: tela grande sem mouse (ou user agent de TV); ?tv=1 força para testar. */
function isTv(): boolean {
  if (urlParam('tv') === '1') return true;
  if (urlParam('tv') === '0') return false;
  const ua = navigator.userAgent;
  if (/\b(SMART-TV|SmartTV|GoogleTV|Android TV|AFT\w*|BRAVIA|Tizen|Web0S|webOS|CrKey|HbbTV|NetCast)\b/i.test(ua)) return true;
  return matchMedia('(min-width: 1280px) and (any-pointer: none), (min-width: 1280px) and (pointer: coarse) and (hover: none)').matches;
}

/**
 * Tela de código do celular e da TV (#/mobile sem ?pair= e sem token salvo). Celular: 6 caixas sobre um input
 * numérico (autocomplete one-time-code, colar distribui, o 6º dígito envia). TV: o mesmo código com um teclado 3×4
 * na tela, foco de 6 px sempre visível, setas movem, números do controle digitam, OK escolhe, Voltar apaga.
 * Usa o visual do app (o tema do widget só chega depois do pareamento).
 */
@Component({
  selector: 'pw-pair',
  imports: [Icon],
  styleUrls: ['../ui/kit.scss', './pair.scss'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    <div class="pw-app pr" [class]="appearance.cls()" [class.pr-tv]="tv" [class.pr-phone]="!tv">
      <header class="pr-head">
        <img src="pitwall-logo.png" alt="" [attr.width]="tv ? 72 : 32" [attr.height]="tv ? 72 : 32" />
        <span class="pr-brand">Pitwall</span>
        @if (tv) {
          <span class="pr-ro">{{ sx.localNetRO }}</span>
        } @else {
          <span class="pill p-n pr-net">{{ sx.localNet }}</span>
        }
      </header>

      @if (paired(); as name) {
        <div class="pr-done" role="status">
          <span class="pr-ok"><pw-icon name="check" [size]="tv ? 48 : 28" [stroke]="2.2" /></span>
          <h1>{{ sx.pairedDone }}</h1>
          <p class="pd">{{ sx.pairedAs[0] }}<b>{{ name }}</b>{{ sx.pairedAs[1] }}</p>
        </div>
        <div class="pr-skel" aria-hidden="true">
          <span class="skel" style="width: 56%; height: 18px"></span>
          <span class="skel" style="height: 92px"></span>
          <span class="skel" style="height: 92px"></span>
        </div>
      } @else {
        <div class="pr-grid">
          <div class="pr-main">
            @if (revoked() && !digits().length && state().status === 'idle') {
              <div class="note n-y pr-revoked" role="status">
                <span class="ico"><pw-icon name="warn" [size]="tv ? 28 : 16" [stroke]="2" /></span>
                <span>{{ sx.revokedNote }}</span>
              </div>
            }
            <h1>{{ sx.pairEnter }}</h1>
            <p class="pd pr-hint">{{ tv ? sx.pairTvHint : sx.pairEnterHint }}</p>

            <div class="pr-code" [class.err]="tone() === 'err'" [class.dim]="tone() === 'dim'">
              @if (!tv) {
                <input
                  #input
                  class="pr-input"
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  autocomplete="one-time-code"
                  maxlength="6"
                  [attr.aria-label]="sx.codeGroupAria"
                  [attr.aria-invalid]="tone() === 'err'"
                  aria-describedby="pr-msg"
                  [value]="digits()"
                  [disabled]="blocked() || checking()"
                  (input)="onInput($any($event.target))"
                  (focus)="focused.set(true)"
                  (blur)="focused.set(false)"
                />
              }
              <div class="pr-boxes" [attr.role]="tv ? 'group' : null" [attr.aria-label]="tv ? sx.codeGroupAria : null" aria-hidden="false">
                @for (i of slots; track i) {
                  @if (i === 3) {
                    <span class="pr-gap"></span>
                  }
                  <span class="pr-box" [class.cur]="caret() === i" [attr.aria-label]="tv ? sx.digitAria(i + 1) : null">
                    @if (digits()[i]; as d) {
                      {{ d }}
                    } @else if (caret() === i) {
                      <span class="pr-caret"></span>
                    }
                  </span>
                }
              </div>
            </div>

            <div class="pr-msg" id="pr-msg" [attr.role]="state().status === 'error' ? 'alert' : 'status'" aria-live="polite">
              @switch (message()?.kind) {
                @case ('checking') {
                  <span class="t2">{{ sx.pairChecking }}</span>
                }
                @case ('blocked') {
                  <span class="pr-strong"><b>{{ sx.errBlocked[0] }}</b>{{ sx.errBlocked[1] }}{{ countdown() }}.</span>
                  <br /><span class="t2">{{ sx.errBlockedHint }}</span>
                }
                @case ('error') {
                  <span class="pr-red"><b>{{ message()!.text[0] }}</b>{{ message()!.text[1] }}</span>
                  @if (message()!.extra; as ex) {
                    <br /><span class="t2">{{ ex }}</span>
                  }
                }
              }
            </div>

            @if (!tv) {
              <button type="button" class="btn pri pr-go" [class.busy]="checking()" [attr.aria-busy]="checking()" [disabled]="digits().length < 6 || blocked() || checking()" (click)="submit()">
                @if (checking()) {
                  <span class="pr-spin" aria-hidden="true"></span>{{ sx.connecting }}
                } @else {
                  {{ sx.connect }}
                }
              </button>
              <p class="cap pr-tip">{{ sx.qrTip }}</p>
            } @else if (!message()) {
              <p class="pr-tvhint">{{ sx.pairTvHint2 }}</p>
            }
          </div>

          @if (tv) {
            <div class="pr-pad" role="group" [attr.aria-label]="sx.codeGroupAria" (keydown)="padKeys($event)">
              @for (k of keys; track k; let i = $index) {
                <button
                  #key
                  type="button"
                  class="pr-key"
                  [class.pr-del]="k === 'del'"
                  [class.pr-ok-key]="k === 'ok'"
                  [attr.tabindex]="focusIdx() === i ? 0 : -1"
                  [attr.aria-disabled]="(k === 'ok' && digits().length < 6) || blocked() || checking() ? 'true' : null"
                  (focus)="focusIdx.set(i)"
                  (click)="press(k)"
                >
                  @switch (k) {
                    @case ('del') {
                      {{ sx.kpDelete }}
                    }
                    @case ('ok') {
                      @if (checking()) {
                        <span class="pr-spin" aria-hidden="true"></span>
                      }
                      {{ sx.connect }}
                    }
                    @default {
                      {{ k }}
                    }
                  }
                </button>
              }
            </div>
          }
        </div>
      }

      @if (tv) {
        <footer class="pr-legend">
          <span><pw-icon name="dpad" [size]="36" />{{ sx.tvLegend['move'] }}</span>
          <span><span class="pr-k">{{ sx.tvKeys['ok'] }}</span>{{ sx.tvLegend['ok'] }}</span>
          <span><span class="pr-k">{{ sx.tvKeys['digits'] }}</span>{{ sx.tvLegend['digits'] }}</span>
          <span><span class="pr-k">{{ sx.tvKeys['back'] }}</span>{{ sx.tvLegend['back'] }}</span>
        </footer>
      } @else {
        <p class="cap pr-foot">{{ sx.readOnlyFoot }}</p>
      }
    </div>
  `,
})
export class Pair {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly appearance = inject(AppAppearance);
  /** O PC revogou este aparelho (token salvo recusado). */
  readonly revoked = input(false);
  /** Nome com que acabou de parear (tela "Pareado"). */
  readonly paired = input<string | null>(null);

  protected readonly tv = isTv();
  protected readonly slots = [0, 1, 2, 3, 4, 5];
  protected readonly keys = KEYS;
  protected readonly digits = signal('');
  protected readonly focused = signal(false);
  protected readonly focusIdx = signal(0);
  private readonly now = signal(Date.now());
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private timer?: ReturnType<typeof setInterval>;

  protected readonly state = this.t.pairEntry;
  protected readonly checking = computed(() => this.state().status === 'checking');
  protected readonly blocked = computed(() => {
    const st = this.state();
    return st.status === 'error' && st.error === 'blocked' && (st.retryAt ?? 0) > this.now();
  });
  /** Caixa com o cursor (TV sempre; celular só com o campo em foco). */
  protected readonly caret = computed(() => {
    const n = this.digits().length;
    if (n >= 6 || this.checking() || this.blocked() || this.tone() === 'err') return -1;
    return this.tv || this.focused() ? n : -1;
  });
  protected readonly tone = computed(() => {
    const st = this.state();
    if (this.blocked()) return 'dim';
    return st.status === 'error' && st.error !== 'network' && st.error !== 'blocked' && this.digits().length === 6 ? 'err' : '';
  });
  protected readonly countdown = computed(() => {
    const left = Math.max(0, Math.round(((this.state().retryAt ?? 0) - this.now()) / 1000));
    return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  });
  protected readonly message = computed(() => {
    const s = this.s();
    const st = this.state();
    if (st.status === 'checking') return { kind: 'checking' as const, text: ['', ''], extra: '' };
    if (this.blocked()) return { kind: 'blocked' as const, text: ['', ''], extra: '' };
    if (st.status !== 'error' || st.error === 'blocked') return null;
    const text = st.error === 'expired' ? s.errExpired : st.error === 'noPending' ? s.errNoPending : st.error === 'network' ? s.errNetwork : s.errInvalid;
    const extra = st.error === 'invalidCode' && st.attemptsLeft != null && st.attemptsLeft > 0 ? s.attemptsLeft(st.attemptsLeft) : '';
    return { kind: 'error' as const, text, extra };
  });

  constructor() {
    // Bloqueio: o relógio só anda enquanto conta (sem nada em loop contínuo depois disso)
    effect(() => {
      const st = this.state();
      clearInterval(this.timer);
      if (st.status === 'error' && st.error === 'blocked' && st.retryAt) {
        this.now.set(Date.now());
        this.timer = setInterval(() => {
          this.now.set(Date.now());
          if (Date.now() >= (st.retryAt ?? 0)) {
            clearInterval(this.timer);
            untracked(() => this.t.pairEntry.set({ status: 'idle' }));
          }
        }, 1000);
      }
      // Depois do erro: TV foca "Apagar"; celular seleciona tudo (digitar de novo substitui)
      if (st.status === 'error')
        setTimeout(() => {
          if (this.tv) this.focusKey(KEYS.indexOf('del'));
          else {
            this.input()?.nativeElement.focus({ preventScroll: true });
            this.input()?.nativeElement.select();
          }
        }, 30);
    });
    // TV: números do controle digitam direto, Voltar apaga (e, vazio, sai)
    const keys = (e: KeyboardEvent) => this.globalKeys(e);
    document.addEventListener('keydown', keys);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(this.timer);
      document.removeEventListener('keydown', keys);
    });
    requestAnimationFrame(() => {
      if (this.tv) this.focusKey(0);
      else this.input()?.nativeElement.focus({ preventScroll: true });
    });
  }

  /** Celular: aceita colar "482 913" ou "482-913"; o 6º dígito envia. */
  protected onInput(el: HTMLInputElement) {
    const v = el.value.replace(/\D/g, '').slice(0, 6);
    if (el.value !== v) el.value = v;
    this.setDigits(v);
  }

  private setDigits(v: string) {
    if (this.blocked() || this.checking()) return;
    // Primeiro dígito depois de um erro começa de novo
    if (this.state().status === 'error' && v.length > 0) this.t.pairEntry.set({ status: 'idle' });
    this.digits.set(v);
    if (v.length === 6) this.submit();
  }

  protected submit() {
    if (this.digits().length < 6 || this.blocked() || this.checking()) return;
    this.t.pairWithCode(this.digits());
  }

  protected press(k: string) {
    if (this.blocked() || this.checking()) return;
    const d = this.state().status === 'error' ? '' : this.digits();
    if (k === 'del') {
      if (this.state().status === 'error') this.t.pairEntry.set({ status: 'idle' });
      this.digits.set(d.slice(0, -1));
    } else if (k === 'ok') this.submit();
    else if (d.length < 6) this.setDigits(d + k);
  }

  /** Setas movem o foco no teclado 3×4 (sem animação: é teclado). */
  protected padKeys(e: KeyboardEvent) {
    const i = this.focusIdx();
    const col = i % 3;
    const row = Math.floor(i / 3);
    let to = -1;
    if (e.key === 'ArrowRight' && col < 2) to = i + 1;
    else if (e.key === 'ArrowLeft' && col > 0) to = i - 1;
    else if (e.key === 'ArrowDown' && row < 3) to = i + 3;
    else if (e.key === 'ArrowUp' && row > 0) to = i - 3;
    else if (e.key.startsWith('Arrow')) to = i;
    if (to < 0) return;
    e.preventDefault();
    this.focusKey(to);
  }

  private focusKey(i: number) {
    this.focusIdx.set(i);
    this.host.nativeElement.querySelectorAll<HTMLButtonElement>('.pr-key')[i]?.focus({ preventScroll: true });
  }

  private globalKeys(e: KeyboardEvent) {
    if (!this.tv || this.paired()) return;
    const digit = /^[0-9]$/.test(e.key) ? e.key : null;
    if (digit) {
      e.preventDefault();
      this.press(digit);
      return;
    }
    if (BACK_KEYS.has(e.key) || BACK_CODES.has(e.keyCode)) {
      e.preventDefault();
      if (!this.digits().length && this.state().status !== 'error') history.back();
      else this.press('del');
    }
  }
}
