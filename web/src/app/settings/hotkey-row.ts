import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { I18n } from '../i18n';
import { HotkeyState } from '../models';
import { MODS, comboOf, heldMods, hotkeyParts, sameHotkey } from './hotkey';

/**
 * 1.2 · App › Atalhos: uma linha com o atalho em teclas, [Alterar] e a captura ("Pressione as teclas…"). Esc cancela,
 * Backspace desliga. A captura é teclado: nada anima. O host é a própria `.row` (o divisor `.row + .row` continua valendo).
 */
@Component({
  selector: 'pw-hotkey-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'row', '[class.top]': '!!hint().text' },
  template: `
    @let sx = s();
    <div class="rl" [class.dimmed]="disabled()">
      <div class="lb" [id]="id() + '-l'">{{ label() }}</div>
      @if (hint(); as h) {
        @if (h.text) {
          <div class="ht" [id]="id() + '-h'" [style.color]="h.color">{{ h.text }}</div>
        }
      }
    </div>
    @if (capturing()) {
      <span #box class="in capbox" role="textbox" tabindex="0" [attr.aria-label]="sx.hkFieldAria + ' · ' + label()" [attr.aria-describedby]="id() + '-h'" (keydown)="down($event)" (keyup)="up($event)" (blur)="cancel()">
        @if (held().length) {
          <span class="keys">
            @for (m of held(); track m) {
              <span class="kc">{{ m }}</span><i>+</i>
            }
          </span>
        }
        <span class="t3">{{ sx.hkPress }}</span>
      </span>
      <button type="button" class="btn qt sm" (mousedown)="$event.preventDefault()" (click)="cancel()">{{ sx.cancel }}</button>
    } @else {
      <span class="cur" [class.dimmed]="disabled()">
        @if (parts().length) {
          <span class="keys" [attr.aria-label]="value()">
            @for (k of parts(); track $index) {
              @if ($index) {
                <i>+</i>
              }
              <span class="kc">{{ k }}</span>
            }
          </span>
        } @else {
          <span class="t3">{{ sx.hkOff }}</span>
        }
        @if (status() === 'inUse' && !disabled() && parts().length) {
          <span class="pill p-r">{{ sx.hkInUse }}</span>
        }
      </span>
      <button type="button" class="btn sm" [disabled]="disabled()" [attr.aria-describedby]="id() + '-l'" (click)="start()">{{ sx.hkChange }}</button>
    }
  `,
  styles: `
    .capbox {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 220px;
      color: var(--tx2);
      border-color: var(--ac);
      box-shadow: 0 0 0 3px var(--acs);
      outline: none;
      cursor: default;
    }
    .cur {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .keys {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      i {
        font-style: normal;
        color: var(--tx3);
        font-size: 11px;
      }
    }
    .kc {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 26px;
      height: 24px;
      padding: 0 7px;
      border-radius: 6px;
      border: 1px solid var(--bd);
      border-bottom-width: 2px;
      background: var(--sf2);
      font-size: 12px;
      font-weight: 600;
      color: var(--tx);
    }
  `,
})
export class HotkeyRow {
  protected readonly s = inject(I18n).s;
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  /** "Ctrl+Alt+M"; vazio = desligado. */
  readonly value = input<string>('');
  /** catalog.hotkeys.<nome>. */
  readonly status = input<HotkeyState | undefined>(undefined);
  /** O outro atalho (iguais = aviso). */
  readonly other = input<string>('');
  readonly disabled = input(false);
  readonly changed = output<string>();

  protected readonly capturing = signal(false);
  protected readonly held = signal<string[]>([]);
  protected readonly invalid = signal(false);
  private readonly box = viewChild<ElementRef<HTMLElement>>('box');

  protected readonly parts = computed(() => hotkeyParts(this.value()));

  protected readonly hint = computed<{ text: string; color?: string }>(() => {
    const s = this.s();
    if (this.capturing()) return { text: this.invalid() ? s.hkInvalid : s.hkCaptureHint, color: this.invalid() ? 'var(--y)' : undefined };
    if (this.disabled() || !this.value()) return { text: '' };
    if (sameHotkey(this.other(), this.value())) return { text: s.hkSame, color: 'var(--r)' };
    if (this.status() === 'inUse') return { text: s.hkInUseHint(this.parts().join(' + ')), color: 'var(--r)' };
    if (this.status() === 'invalid') return { text: s.hkInvalid, color: 'var(--y)' };
    return { text: '' };
  });

  protected start() {
    this.invalid.set(false);
    this.held.set([]);
    this.capturing.set(true);
    setTimeout(() => this.box()?.nativeElement.focus());
  }

  protected cancel() {
    this.capturing.set(false);
    this.held.set([]);
    this.invalid.set(false);
  }

  protected down(e: KeyboardEvent) {
    if (e.key === 'Tab') return; // sair do campo pelo teclado continua possível (blur cancela)
    e.preventDefault();
    e.stopPropagation();
    const mods = heldMods(e);
    if (MODS[e.key]) {
      this.held.set(mods);
      return;
    }
    if (!mods.length && e.key === 'Escape') return this.cancel();
    if (!mods.length && e.key === 'Backspace') return this.finish('');
    // Letras e números precisam de um modificador; F1–F24 podem ir sozinhas
    const combo = comboOf(mods, e.code);
    if (combo == null) {
      this.invalid.set(true);
      return;
    }
    this.finish(combo);
  }

  protected up(e: KeyboardEvent) {
    if (MODS[e.key]) this.held.set(heldMods(e));
  }

  private finish(v: string) {
    this.capturing.set(false);
    this.held.set([]);
    this.invalid.set(false);
    if (v !== this.value()) this.changed.emit(v);
  }
}
