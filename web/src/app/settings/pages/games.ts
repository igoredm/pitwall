import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { I18n } from '../../i18n';
import { GameProfile, TuningPreset, WidgetLayout } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { presetName } from '../helpers';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';

/** Lista "ignorar" de fábrica (espelha GamesConfig.Ignore no backend): só para mostrar a origem de cada regra. */
const DEFAULT_IGNORE = new Set([
  'explorer.exe', 'chrome.exe', 'msedge.exe', 'firefox.exe', 'opera.exe', 'brave.exe', 'discord.exe', 'pitwall.exe',
  'msedgewebview2.exe', 'dwm.exe', 'applicationframehost.exe', 'textinputhost.exe', 'shellexperiencehost.exe',
  'startmenuexperiencehost.exe', 'searchhost.exe', 'lockapp.exe', 'spotify.exe', 'vlc.exe', 'mpc-hc64.exe',
  'code.exe', 'devenv.exe', 'claude.exe',
]);

/** Jogo › Jogos: detecção (com "Marcar como jogo?" na linha), regras incluir/ignorar e perfis por jogo. */
@Component({
  selector: 'pw-page-games',
  imports: [PageHead, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="games" />

    @if (d) {
      <section class="sec" data-anchor="detection">
        <div class="sh"><h2>{{ sx.detection }}</h2></div>
        <div class="grp" data-tour="detection">
          <div class="row">
            <div class="rl">
              <div class="lb" id="l-det">{{ sx.autoDetect2 }}</div>
              <div class="ht">{{ sx.autoDetectHint2 }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-det" [attr.aria-checked]="d.games.autoDetect" (click)="ctx.update(flipDetect)"></button>
          </div>
          @if (d.features?.gameSuggestions === false) {
            <div class="off-line bt">
              <span class="grow"><b>{{ sx.suggestOffLine }}</b> · {{ sx.offInFeatures }}</span>
              <button type="button" class="btn sm" (click)="ctx.go('features', 'gameSuggestions')">{{ sx.pages.features }}</button>
            </div>
          } @else if (t.gameSuggestion(); as sug) {
            <div class="row" role="status">
              <span class="dot sdot"></span>
              <div class="rl">
                <div class="lb"><span class="mono sx">{{ sug.exe }}</span>{{ sx.suggestDrawing }}</div>
                <div class="ht">{{ sx.suggestSub(fps()) }}</div>
              </div>
              <button type="button" class="btn sm qt" (click)="t.send({ type: 'dismissGameSuggestion', exe: sug.exe })">{{ sx.suggestIgnore }}</button>
              <button type="button" class="btn sm pri" (click)="t.send({ type: 'acceptGameSuggestion', exe: sug.exe })">{{ sx.suggestMark }}</button>
            </div>
          } @else if (t.game(); as g) {
            <div class="row">
              <span class="dot" style="background: var(--g)"></span>
              <div class="rl">
                <div class="lb"><span class="mono sx">{{ g.exe }}</span></div>
                <div class="ht">{{ sx.focusedNow }} · {{ sx.gameModes[g.mode] ?? g.mode }}</div>
              </div>
              <span class="pill p-g">{{ sx.inGame }}</span>
            </div>
          }
          @if (t.fpsStatus(); as st) {
            <div class="row tight bt">
              <span class="ico" style="color: var(--y)"><pw-icon name="warn" [size]="16" [stroke]="2" /></span>
              <div class="rl ht">{{ st }}</div>
            </div>
          }
        </div>
      </section>

      <section class="sec" data-anchor="rules">
        <div class="sh">
          <div>
            <h2>{{ sx.rules }}</h2>
            <div class="ht">{{ sx.rulesHint }}</div>
          </div>
          <span class="seg" role="group" [attr.aria-label]="sx.rules">
            <button type="button" [attr.aria-pressed]="filter() === 'all'" (click)="filter.set('all')">{{ sx.rulesAll(counts().include + counts().ignore) }}</button>
            <button type="button" [attr.aria-pressed]="filter() === 'include'" (click)="filter.set('include')">{{ sx.rulesInclude(counts().include) }}</button>
            <button type="button" [attr.aria-pressed]="filter() === 'ignore'" (click)="filter.set('ignore')">{{ sx.rulesIgnore(counts().ignore) }}</button>
          </span>
        </div>
        <div class="grp">
          <div class="row addrow">
            <input class="in mono grow" [attr.aria-label]="sx.colExe" [placeholder]="sx.exePlaceholder" [value]="newExe()" (input)="newExe.set($any($event.target).value)" (keydown.enter)="addRule()" />
            <span class="seg" role="group" [attr.aria-label]="sx.colRule">
              <button type="button" [attr.aria-pressed]="newRule() === 'include'" (click)="newRule.set('include')">{{ sx.include }}</button>
              <button type="button" [attr.aria-pressed]="newRule() === 'ignore'" (click)="newRule.set('ignore')">{{ sx.ignore }}</button>
            </span>
            @if (t.inHost) {
              <button type="button" class="btn sm" (click)="picking = 'rule'; t.host({ type: 'pickExe' })">{{ sx.browse }}</button>
            }
            <button type="button" class="btn sm pri" [disabled]="!newExe().trim()" (click)="addRule()">{{ sx.add }}</button>
          </div>
          <div class="tbl-r th bt rcols">
            <span>{{ sx.colExe }}</span><span>{{ sx.colRule }}</span><span>{{ sx.colOrigin }}</span><span></span>
          </div>
          @for (r of rules(); track r.exe) {
            <div class="tbl-r rcols">
              <span class="mono ell rexe" [title]="r.exe">{{ r.exe }}</span>
              <span class="seg" [class.dis]="r.fixed" role="group" [attr.aria-label]="sx.ruleFor(r.exe)">
                <button type="button" [attr.aria-pressed]="r.rule === 'include'" [disabled]="r.fixed" (click)="setRule(r.exe, 'include')">{{ sx.include }}</button>
                <button type="button" [attr.aria-pressed]="r.rule === 'ignore'" [disabled]="r.fixed" (click)="setRule(r.exe, 'ignore')">{{ sx.ignore }}</button>
              </span>
              <span class="cap">{{ r.origin }}</span>
              @if (r.fixed) {
                <span class="ico" [title]="r.origin"><pw-icon name="lock" [size]="15" /></span>
              } @else {
                <button type="button" class="btn qt sm icon" [attr.aria-label]="sx.removeRule(r.exe)" [title]="sx.removeRule(r.exe)" (click)="removeRule(r.exe)">
                  <pw-icon name="x" [size]="14" [stroke]="2" />
                </button>
              }
            </div>
          } @empty {
            <div class="empty"><div class="ht">{{ sx.rulesEmpty }}</div></div>
          }
        </div>
      </section>

      <section class="sec" data-anchor="profiles">
        <div class="sh">
          <div>
            <h2>{{ sx.profilesTitle }}</h2>
            <div class="ht">{{ sx.profilesHint2 }}</div>
          </div>
          @if (!adding()) {
            <button type="button" class="btn sm" (click)="startAdd()"><pw-icon name="plus" [size]="14" [stroke]="2" />{{ sx.newProfile }}</button>
          }
        </div>
        <div class="grp">
          @if (adding()) {
            <div class="row addrow">
              <input #pexe class="in mono grow" [attr.aria-label]="sx.profileExeAria" [placeholder]="sx.exePlaceholder" [value]="profExe()" (input)="profExe.set($any($event.target).value)" (keydown.enter)="addProfile()" (keydown.escape)="adding.set(false)" />
              @if (t.inHost) {
                <button type="button" class="btn sm" (click)="picking = 'profile'; t.host({ type: 'pickExe' })">{{ sx.browse }}</button>
              }
              <button type="button" class="btn sm qt" (click)="adding.set(false)">{{ sx.cancel }}</button>
              <button type="button" class="btn sm pri" [disabled]="!profExe().trim()" (click)="addProfile()">{{ sx.add }}</button>
            </div>
          }
          @if (profiles().length) {
            <div class="tbl-r th pcols" [class.bt]="adding()">
              <span>{{ sx.colExe }}</span><span>{{ sx.colGpuTuning }}</span><span>{{ sx.colWidgetLayout }}</span><span></span>
            </div>
            @for (r of profiles(); track r.exe) {
              <div class="tbl-r pcols prow">
                <span class="pexe ell">
                  <span class="mono" [title]="r.exe">{{ r.exe }}</span>
                  @if (r.active) {
                    <span class="pill p-g">{{ sx.activeNow }}</span>
                  }
                </span>
                <select class="in" [attr.aria-label]="sx.colGpuTuning + ' · ' + r.exe" [disabled]="!tuningSupported()" (change)="setPreset(r.exe, $any($event.target).value)">
                  @for (o of presetOptions(); track o.value) {
                    <option [value]="o.value" [selected]="(r.p.tuningPreset ?? '') === o.value">{{ o.label }}</option>
                  }
                </select>
                <select class="in" [attr.aria-label]="sx.colWidgetLayout + ' · ' + r.exe" (change)="setLayout(r.exe, $any($event.target).value)">
                  @for (o of layoutOptions(); track o.value) {
                    <option [value]="o.value" [selected]="(r.p.layout ?? '') === o.value">{{ o.label }}</option>
                  }
                </select>
                <button type="button" class="btn qt sm icon" [attr.aria-label]="sx.removeProfile(r.exe)" [title]="sx.removeProfile(r.exe)" (click)="removeProfile(r.exe)">
                  <pw-icon name="x" [size]="14" [stroke]="2" />
                </button>
              </div>
            }
          } @else if (!adding()) {
            <div class="empty"><div class="ht">{{ sx.profilesEmpty }}</div></div>
          }
        </div>
      </section>
    }
  `,
  styles: `
    .sdot {
      width: 8px;
      height: 8px;
      background: var(--y);
    }
    .sx {
      font-size: 13.5px;
    }
    .addrow {
      gap: 8px;
      min-height: 0;
    }
    .rcols {
      grid-template-columns: minmax(0, 1fr) 150px 140px 32px;
    }
    .rexe {
      font-size: 13px;
    }
    .pcols {
      grid-template-columns: minmax(0, 1fr) 230px 150px 32px;
    }
    .prow {
      min-height: 52px;
    }
    .pexe {
      display: flex;
      align-items: center;
      gap: 6px;
      .mono {
        font-size: 13px;
      }
    }
  `,
})
export class GamesPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);

  protected readonly filter = signal<'all' | 'include' | 'ignore'>('all');
  protected readonly newExe = signal('');
  protected readonly newRule = signal<'include' | 'ignore'>('include');
  protected readonly adding = signal(false);
  protected readonly profExe = signal('');
  /** Quem pediu o "Procurar…" (a resposta exePicked do host não diz). */
  protected picking: 'rule' | 'profile' = 'rule';
  private readonly pexe = viewChild<ElementRef<HTMLInputElement>>('pexe');

  protected readonly flipDetect = (c: { games: { autoDetect: boolean } }) => (c.games.autoDetect = !c.games.autoDetect);

  protected readonly fps = computed(() => {
    const v = this.t.values()['fps.current'];
    return v != null ? String(Math.round(v)) : null;
  });

  protected readonly counts = computed(() => {
    const g = this.ctx.draft()?.games;
    return { include: g?.include.length ?? 0, ignore: g?.ignore.length ?? 0 };
  });

  protected readonly rules = computed(() => {
    const g = this.ctx.draft()?.games;
    const s = this.s();
    if (!g) return [];
    const origin = (exe: string) => {
      const e = exe.toLowerCase();
      return e === 'pitwall.exe' ? s.originPitwall : DEFAULT_IGNORE.has(e) ? s.originFactory : s.originYou;
    };
    const rows = [...g.include.map((exe) => ({ exe, rule: 'include' as const })), ...g.ignore.map((exe) => ({ exe, rule: 'ignore' as const }))].map((r) => ({
      ...r,
      origin: origin(r.exe),
      fixed: r.exe.toLowerCase() === 'pitwall.exe',
    }));
    const f = this.filter();
    return f === 'all' ? rows : rows.filter((r) => r.rule === f);
  });

  protected readonly tuningSupported = computed(() => this.t.catalog()?.tuning?.supported ?? false);

  protected readonly profiles = computed(() => {
    const profiles = this.ctx.draft()?.games.profiles ?? {};
    const active = (this.t.profile()?.exe ?? this.t.game()?.exe)?.toLowerCase();
    return Object.entries(profiles)
      .map(([exe, p]) => ({ exe, p, active: exe.toLowerCase() === active }))
      .sort((a, b) => Number(b.active) - Number(a.active) || a.exe.localeCompare(b.exe));
  });

  protected readonly presetOptions = computed(() => {
    const s = this.s();
    const d = this.ctx.draft();
    const presets = this.t.catalog()?.tuningPresets ?? {};
    const g = d?.gpuTuning;
    const nums = (p: string, w?: number, mhz?: number) => (w ? `${presetName(s, p)} · ${w} W${mhz ? ` · ${mhz} MHz` : ''}` : presetName(s, p));
    return [
      { value: '', label: s.profDefaultOf(g?.enabled ? presetName(s, g.preset) : s.gpuInactive) },
      { value: 'balanced', label: nums('balanced', presets['balanced']?.powerW, presets['balanced']?.clockMhz) },
      { value: 'cool', label: nums('cool', presets['cool']?.powerW, presets['cool']?.clockMhz) },
      { value: 'custom', label: nums('custom', g?.powerLimitW, g?.maxClockMhz) },
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
      if (msg?.type !== 'exePicked') return;
      if (this.picking === 'profile' && this.adding()) this.profExe.set(msg.name);
      else this.newExe.set(msg.name);
    });
    inject(DestroyRef).onDestroy(off);
  }

  private static exeName(raw: string) {
    const exe = raw.trim();
    return exe.toLowerCase().endsWith('.exe') ? exe : exe + '.exe';
  }

  protected addRule() {
    if (!this.newExe().trim()) return;
    const name = GamesPage.exeName(this.newExe());
    this.ctx.update((c) => {
      c.games.include = c.games.include.filter((x) => x.toLowerCase() !== name.toLowerCase());
      c.games.ignore = c.games.ignore.filter((x) => x.toLowerCase() !== name.toLowerCase());
      (this.newRule() === 'include' ? c.games.include : c.games.ignore).push(name);
    });
    this.newExe.set('');
  }

  protected setRule(exe: string, rule: 'include' | 'ignore') {
    this.ctx.update((c) => {
      c.games.include = c.games.include.filter((x) => x !== exe);
      c.games.ignore = c.games.ignore.filter((x) => x !== exe);
      (rule === 'include' ? c.games.include : c.games.ignore).push(exe);
    });
  }

  protected removeRule(exe: string) {
    this.ctx.update((c) => {
      c.games.include = c.games.include.filter((x) => x !== exe);
      c.games.ignore = c.games.ignore.filter((x) => x !== exe);
    });
  }

  protected startAdd() {
    // Sugere o jogo atual se ele ainda não tem perfil
    const game = this.t.game()?.exe;
    const has = (exe: string) => this.profiles().some((r) => r.exe.toLowerCase() === exe.toLowerCase());
    this.profExe.set(game && !has(game) ? game : '');
    this.adding.set(true);
    requestAnimationFrame(() => this.pexe()?.nativeElement.focus());
  }

  protected addProfile() {
    if (!this.profExe().trim()) return;
    const exe = GamesPage.exeName(this.profExe());
    this.ctx.update((c) => {
      const profiles = (c.games.profiles ??= {});
      if (!Object.keys(profiles).some((k) => k.toLowerCase() === exe.toLowerCase())) profiles[exe] = {};
    });
    this.adding.set(false);
    this.profExe.set('');
  }

  protected setPreset(exe: string, value: string) {
    this.patchProfile(exe, { tuningPreset: (value || undefined) as TuningPreset | undefined });
  }

  protected setLayout(exe: string, value: string) {
    this.patchProfile(exe, { layout: (value || undefined) as WidgetLayout | undefined });
  }

  protected removeProfile(exe: string) {
    this.ctx.update((c) => {
      if (c.games.profiles) delete c.games.profiles[exe];
    });
  }

  private patchProfile(exe: string, patch: Partial<GameProfile>) {
    this.ctx.update((c) => {
      const p = { ...(c.games.profiles?.[exe] ?? {}), ...patch };
      for (const k of Object.keys(p) as (keyof GameProfile)[]) if (p[k] === undefined) delete p[k];
      (c.games.profiles ??= {})[exe] = p;
    });
  }
}
