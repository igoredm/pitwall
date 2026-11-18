import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { I18n } from '../i18n';
import { GameProfile, TuningPreset, WidgetLayout } from '../models';
import { TelemetryService } from '../telemetry.service';
import { SettingsCtx } from './settings-ctx';

/** Jogos → "Perfis por jogo": ajuste da GPU e layout do widget por executável, enquanto o jogo roda. */
@Component({
  selector: 'pw-game-profiles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './game-profiles.scss',
  template: `
    @let sx = s();
    <section class="panel">
      <div class="head">
        <div>
          <h2>{{ sx.profilesTitle }}</h2>
          <p class="hint">{{ sx.profilesHint }}</p>
        </div>
        @if (!adding()) {
          <button class="btn primary" (click)="startAdd()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{{ sx.newProfile }}
          </button>
        }
      </div>

      @if (adding()) {
        <div class="add">
          <input class="input mono" [placeholder]="sx.exePlaceholder" [value]="newExe()" (input)="newExe.set($any($event.target).value)" (keydown.enter)="add()" (keydown.escape)="adding.set(false)" />
          @if (t.inHost) {
            <button class="btn ghost" (click)="t.host({ type: 'pickExe' })">{{ sx.browse }}</button>
          }
          <button class="btn primary" (click)="add()">{{ sx.add }}</button>
          <button class="btn quiet" (click)="adding.set(false)">{{ sx.close }}</button>
        </div>
      }

      @if (rows().length) {
        <div class="tr th"><span>{{ sx.colExe }}</span><span>{{ sx.colGpuTuning }}</span><span>{{ sx.colWidgetLayout }}</span><span></span></div>
        @for (r of rows(); track r.exe) {
          <div class="tr">
            <span class="exe">
              <span class="mono" [title]="r.exe">{{ r.exe }}</span>
              @if (r.active) {
                <span class="hint">{{ sx.activeNow }}</span>
              }
            </span>
            <span class="sel-wrap">
              <select class="sel" [class.def]="!r.p.tuningPreset" [disabled]="!tuningSupported()" [attr.aria-label]="sx.colGpuTuning + ' · ' + r.exe" (change)="setPreset(r.exe, $any($event.target).value)">
                @for (o of presetOptions(); track o.value) {
                  <option [value]="o.value" [selected]="(r.p.tuningPreset ?? '') === o.value">{{ o.label }}</option>
                }
              </select>
            </span>
            <span class="sel-wrap">
              <select class="sel" [class.def]="!r.p.layout" [attr.aria-label]="sx.colWidgetLayout + ' · ' + r.exe" (change)="setLayout(r.exe, $any($event.target).value)">
                @for (o of layoutOptions(); track o.value) {
                  <option [value]="o.value" [selected]="(r.p.layout ?? '') === o.value">{{ o.label }}</option>
                }
              </select>
            </span>
            <button class="x" [attr.aria-label]="sx.removeProfile(r.exe)" [title]="sx.removeProfile(r.exe)" (click)="remove(r.exe)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        }
      } @else if (!adding()) {
        <p class="hint empty">{{ sx.profilesEmpty }}</p>
      }
    </section>
  `,
})
export class GameProfiles {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  private readonly ctx = inject(SettingsCtx);

  protected readonly adding = signal(false);
  protected readonly newExe = signal('');

  protected readonly tuningSupported = computed(() => this.t.catalog()?.tuning?.supported ?? false);

  protected readonly rows = computed(() => {
    const profiles = this.ctx.draft()?.games.profiles ?? {};
    const active = this.t.profile()?.exe?.toLowerCase() ?? this.t.game()?.exe?.toLowerCase();
    return Object.entries(profiles)
      .map(([exe, p]) => ({ exe, p, active: exe.toLowerCase() === active }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.exe.localeCompare(b.exe));
  });

  protected readonly presetOptions = computed(() => {
    const s = this.s();
    const d = this.ctx.draft();
    const presets = this.t.catalog()?.tuningPresets ?? {};
    const name = (p: string) => (p === 'balanced' ? s.gpuBalanced : p === 'cool' ? s.gpuCool : s.gpuCustom);
    const withNumbers = (p: string, w?: number, mhz?: number) => (w ? `${name(p)} · ${w} W${mhz ? ` · ${mhz} MHz` : ''}` : name(p));
    const g = d?.gpuTuning;
    const global = g?.enabled ? name(g.preset) : s.gpuInactive;
    return [
      { value: '', label: s.profDefaultOf(global) },
      { value: 'balanced', label: withNumbers('balanced', presets['balanced']?.powerW, presets['balanced']?.clockMhz) },
      { value: 'cool', label: withNumbers('cool', presets['cool']?.powerW, presets['cool']?.clockMhz) },
      // "Personalizado" usa os valores de GPU → Personalizado (gpuTuning.powerLimitW / maxClockMhz)
      { value: 'custom', label: withNumbers('custom', g?.powerLimitW, g?.maxClockMhz) },
      { value: 'off', label: s.profOff },
    ];
  });

  protected readonly layoutOptions = computed(() => {
    const s = this.s();
    return [
      { value: '', label: s.profDefault },
      { value: 'full', label: s.layoutFullBtn },
      { value: 'mid', label: s.layoutMidBtn },
      { value: 'compact', label: s.layoutCompactBtn },
    ];
  });

  constructor() {
    const off = this.t.onHost((msg) => {
      if (msg?.type === 'exePicked' && this.adding()) this.newExe.set(msg.name);
    });
    inject(DestroyRef).onDestroy(off);
  }

  protected startAdd() {
    // Sugere o jogo atual se ele ainda não tem perfil
    const game = this.t.game()?.exe;
    const has = (exe: string) => this.rows().some((r) => r.exe.toLowerCase() === exe.toLowerCase());
    this.newExe.set(game && !has(game) ? game : '');
    this.adding.set(true);
  }

  protected add() {
    let exe = this.newExe().trim();
    if (!exe) return;
    if (!exe.toLowerCase().endsWith('.exe')) exe += '.exe';
    this.ctx.update((c) => {
      const profiles = (c.games.profiles ??= {});
      if (!Object.keys(profiles).some((k) => k.toLowerCase() === exe.toLowerCase())) profiles[exe] = {};
    });
    this.adding.set(false);
    this.newExe.set('');
  }

  protected setPreset(exe: string, value: string) {
    this.patch(exe, { tuningPreset: (value || undefined) as TuningPreset | undefined });
  }

  protected setLayout(exe: string, value: string) {
    this.patch(exe, { layout: (value || undefined) as WidgetLayout | undefined });
  }

  protected remove(exe: string) {
    this.ctx.update((c) => {
      if (c.games.profiles) delete c.games.profiles[exe];
    });
  }

  private patch(exe: string, patch: Partial<GameProfile>) {
    this.ctx.update((c) => {
      const p = { ...(c.games.profiles?.[exe] ?? {}), ...patch };
      for (const k of Object.keys(p) as (keyof GameProfile)[]) if (p[k] === undefined) delete p[k];
      (c.games.profiles ??= {})[exe] = p;
    });
  }
}
