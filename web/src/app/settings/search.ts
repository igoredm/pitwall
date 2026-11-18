import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { Dict, I18n } from '../i18n';
import { SettingsPage } from '../models';
import { Icon } from '../ui/icon';
import { fold } from './helpers';
import { PAGES } from './nav';

/** Uma entrada do índice: rótulo, dica, seção e sinônimos (as palavras de busca não aparecem na tela). */
interface Entry {
  page: SettingsPage;
  anchor?: string;
  label: string;
  hint: string;
  section: string;
  icon: string;
  words: string;
}

type Seg = { t: string; hit: boolean };

/**
 * Índice estático montado do i18n (rótulo, dica, sinônimos) do idioma atual. Ordem = ordem da navegação, para os
 * resultados saírem agrupados por página.
 */
function buildIndex(s: Dict): Entry[] {
  const P = s.pages;
  const out: Entry[] = [];
  const add = (page: SettingsPage, anchor: string | undefined, section: string, label: string, hint = '', icon = 'chevron', words = '') =>
    out.push({ page, anchor, label, hint, section, icon, words });

  add('overview', undefined, '', P.overview, s.pageIntro.overview, 'overview', 'inicio home status agora now');
  add('overview', 'tour', s.firstSteps, s.tourCardTitle, s.tourCardNew, 'play', 'tutorial tour ajuda help primeiros passos getting started');

  add('widget', 'theme', s.widgetTheme, s.widgetTheme, s.widgetThemeHint2, 'widget', 'tema theme lumen minimo neon terminal splash visual look');
  add('widget', 'variant', s.widgetTheme, s.variant, s.darkOnlyHint, 'widget', 'claro escuro light dark modo mode');
  add('widget', 'accent', s.widgetTheme, s.accent, '', 'widget', 'cor color destaque accent');
  add('widget', 'layout', s.layout, s.layout, s.wizLayoutHint2, 'widget', 'tamanho size compacto compact medio mid completo full automatico');
  add('widget', 'monitor', s.monitor, s.monitor, s.identifyMonitors, 'widget', 'tela screen display segundo monitor');
  add('widget', 'window', s.windowSec, s.showWidgetRow, s.showWidgetHint, 'eye', 'esconder hide mostrar show visivel');
  add('widget', 'lock', s.windowSec, s.lockRow, s.lockHint, 'widget', 'travar lock arrastar drag mover move');
  add('widget', 'window', s.windowSec, s.onTopRow, s.onTopHint, 'widget', 'topo top cima');
  add('widget', 'window', s.windowSec, s.autoOpenRow, s.autoOpenHint2, 'widget', 'abrir jogo open game');
  add('widget', 'corner', s.windowSec, s.cornerRow, '', 'widget', 'canto corner discord posicao');

  add('metrics', 'gpu', P.metrics, P.metrics, s.pageIntro.metrics, 'metrics', 'sensores sensors ordem order prioridade priority');
  add('metrics', 'gpu', P.metrics, `${s.colWarn} / ${s.colCrit}`, s.priorityNote.join(''), 'metrics', 'limite limit threshold temperatura temperature');
  add('metrics', 'gpu', P.metrics, s.groupNameInWidget, '', 'metrics', 'nome name rotulo label');
  add('metrics', 'battery', s.battTab, s.battTab, s.battDevicesHint, 'battery', 'bateria battery mouse fone headset controle controller');

  add('alerts', 'windows', s.winNotice, s.alertsEnable2, s.alertsEnableHint2, 'alerts', 'notificacao notification aviso alerta vermelho red');
  add('alerts', 'windows', s.winNotice, s.alertsSound, s.alertsSoundHint2, 'alerts', 'som sound');
  add('alerts', 'windows', s.winNotice, s.alertsSustain, s.alertsSustainHint2, 'alerts');
  add('alerts', 'windows', s.winNotice, s.alertsInterval, s.alertsIntervalHint2, 'alerts');
  add('alerts', 'metrics', s.alertMetrics, s.alertMetrics, s.alertMetricsHint, 'alerts', 'limite limit');

  add('games', 'detection', s.detection, s.autoDetect2, s.autoDetectHint2, 'games', 'detectar detect jogo game');
  add('games', 'detection', s.detection, s.suggestMark, s.feat['gameSuggestions'][1], 'games', 'sugestao suggestion marcar mark');
  add('games', 'rules', s.rules, s.rules, s.rulesHint, 'games', 'exe executavel executable incluir include ignorar ignore');
  add('games', 'profiles', s.profilesTitle, s.profilesTitle, s.profilesHint2, 'games', 'perfil profile por jogo per game');

  add('sessions', 'crash', s.crashReportTitle, s.crashReportTitle, s.feat['crashReport'][1], 'power', 'queda crash desligou shutdown travou');
  add('sessions', 'last', s.lastSession, s.lastSession, s.pageIntro.sessions, 'sessions', 'resumo summary fps medio average low');
  add('sessions', 'history', s.history, s.history, s.allGames, 'sessions', 'historico history partidas matches');
  add('sessions', 'csv', s.csvTitle, s.logEnable2, s.logEnableHint2, 'file', 'csv log gravar record');
  add('sessions', 'csv', s.csvTitle, s.logFolder2, '', 'folder', 'pasta folder csv');
  add('sessions', 'csv', s.csvTitle, s.interval, s.intervalHint, 'file', 'csv intervalo');
  add('sessions', 'keep', s.csvTitle, s.keepFor, s.keepForHint, 'file', 'csv retencao retention apagar delete dias days');
  add('sessions', 'cap', s.csvTitle, s.capTitle, s.capHint, 'file', 'csv tamanho size gb disco disk');

  add('gpu', 'tuning', s.tuningSec, s.gpuEnable2, s.pageIntro.gpu, 'gpu', 'undervolt nvidia consumo power clock ajuste tuning');
  add('gpu', 'tuning', s.tuningSec, s.gpuProfile, s.presetHint['cool'], 'gpu', 'equilibrado balanced frio cool personalizado custom');
  add('gpu', 'tuning', s.tuningSec, s.powerLimitRow, '', 'gpu', 'watts power limit');
  add('gpu', 'tuning', s.tuningSec, s.maxClockRow, '', 'gpu', 'mhz clock');
  add('gpu', 'now', s.gpuNow, s.whyTitle, s.whyHint, 'gpu', 'motivo reason perfcap limite termico thermal');

  add('devices', undefined, P.devices, s.remoteEnable, s.remoteEnableHint, 'devices', 'celular phone tv rede network wifi');
  add('devices', 'pair', s.pairSec, s.pairSec, s.pairSecHint, 'devices', 'parear pair codigo code qr');
  add('devices', 'list', s.pairedSec, s.pairedSec, s.revokeAll, 'devices', 'revogar revoke aparelhos devices');

  for (const k of Object.keys(s.feat)) add('features', k, P.features, s.feat[k][0], s.feat[k][1], 'features', 'recurso feature ligar desligar on off');

  add('app', 'language', s.generalSec, s.language, s.languageHint, 'app', 'idioma language portugues english ingles');
  add('app', 'appearance', s.generalSec, s.appearanceRow, s.appearanceHint, 'app', 'claro escuro light dark tema theme');
  add('app', 'general', s.generalSec, s.startWithWindows, s.startWinHint2, 'app', 'windows iniciar startup boot');
  add('app', 'rate', s.generalSec, s.refreshRate, s.refreshHint2, 'refresh', 'taxa rate ms atualizacao');
  add('app', 'updates', s.updatesTitle, s.updatesTitle, s.updAutoHint, 'download', 'atualizar update versao version beta canal channel');
  add('app', 'tour', s.helpSec, s.replayTour, s.replayTourHint, 'play', 'tutorial tour ajuda help');
  add('app', 'help', s.helpSec, s.shortcuts, `Ctrl K ${s.kbSearch}`, 'app', 'atalho shortcut teclado keyboard');
  add('app', 'help', s.helpSec, s.reportIssue, s.reportIssueHint, 'external', 'bug problema issue github');
  add('app', 'about', s.aboutSec, s.aboutSec, '', 'app', 'versao version sobre about licencas licenses');
  add('app', 'reset', s.resetSec, s.resetRow, s.resetHint, 'undo', 'restaurar reset padrao defaults fabrica factory');
  return out;
}

/** Trecho com o termo destacado (sem HTML: segmentos). */
function highlight(text: string, q: string): Seg[] {
  if (!q) return [{ t: text, hit: false }];
  const i = fold(text).indexOf(q);
  if (i < 0) return [{ t: text, hit: false }];
  return [
    { t: text.slice(0, i), hit: false },
    { t: text.slice(i, i + q.length), hit: true },
    { t: text.slice(i + q.length), hit: false },
  ].filter((x) => x.t);
}

/** Pedaço da dica em volta do termo (~48 caracteres). */
function excerpt(text: string, q: string): string {
  const i = fold(text).indexOf(q);
  if (i < 0) return '';
  const start = Math.max(0, i - 18);
  const end = Math.min(text.length, i + q.length + 30);
  return (start ? '…' : '') + text.slice(start, end).trim() + (end < text.length ? '…' : '');
}

/**
 * Busca da barra lateral (Ctrl K): até 8 resultados agrupados por página, setas e Enter. Abrir e fechar não anima
 * (ação de teclado).
 */
@Component({
  selector: 'pw-search',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    <div class="srch" [class.on]="focused()">
      <pw-icon name="search" [size]="15" />
      <input
        #input
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls="search-results"
        [attr.aria-expanded]="open()"
        [attr.aria-activedescendant]="open() && results().length ? 'sr-' + active() : null"
        [attr.aria-label]="sx.searchAria"
        [placeholder]="sx.search"
        [value]="query()"
        spellcheck="false"
        autocomplete="off"
        (input)="onInput($any($event.target).value)"
        (focus)="focused.set(true)"
        (blur)="onBlur()"
        (keydown)="keys($event)"
      />
      @if (!focused() && !query()) {
        <span class="kbd">Ctrl K</span>
      }
    </div>
    @if (open()) {
      <div class="results pop" id="search-results" role="listbox" [attr.aria-label]="sx.searchResults" [style.left.px]="anchor().x" [style.top.px]="anchor().y" (mousedown)="$event.preventDefault()">
        @for (r of results(); track $index) {
          <div class="opt" role="option" [id]="'sr-' + $index" [attr.aria-selected]="active() === $index" (mousemove)="active.set($index)" (click)="pick($index)">
            <span class="oico"><pw-icon [name]="r.icon" [size]="16" /></span>
            <span class="otx">
              <!-- numa linha só: a quebra de linha virava espaço em volta do termo ("Game s") -->
              <span class="ol">@for (g of r.label; track $index) {@if (g.hit) {<b>{{ g.t }}</b>} @else {<span>{{ g.t }}</span>}}</span>
              <span class="os">@for (g of r.sub; track $index) {@if (g.hit) {<b>{{ g.t }}</b>} @else {<span>{{ g.t }}</span>}}</span>
            </span>
            @if (active() === $index) {
              <span class="oico"><pw-icon name="chevron" [size]="14" [stroke]="2" /></span>
            }
          </div>
        } @empty {
          <div class="none">{{ sx.searchNone(query()) }}</div>
        }
        <div class="legend">
          <span><span class="kbd">↑</span> <span class="kbd">↓</span> {{ sx.kbNavigate }}</span>
          <span><span class="kbd">Enter</span> {{ sx.kbOpen }}</span>
          <span><span class="kbd">Esc</span> {{ sx.kbClose }}</span>
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      margin-bottom: 6px;
    }
    .srch {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 32px;
      padding: 0 6px 0 10px;
      border-radius: 8px;
      background: var(--sf);
      border: 1px solid var(--hair);
      color: var(--tx3);
      &.on {
        border-color: var(--ac);
        box-shadow: 0 0 0 3px var(--acs);
        color: var(--tx);
      }
      input {
        flex: 1;
        min-width: 0;
        height: 100%;
        padding: 0;
        border: 0;
        background: none;
        outline: none;
        font: 500 13px 'Manrope', sans-serif;
        color: var(--tx);
        &::placeholder {
          color: var(--tx3);
        }
      }
    }
    /* fixed: a barra lateral rola (overflow) e cortaria o popover */
    .results {
      position: fixed;
      z-index: 30;
      width: 460px;
      padding: 6px;
      border-radius: 10px;
      font-size: 13.5px;
    }
    .opt {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border-radius: 7px;
      cursor: pointer;
      &[aria-selected='true'] {
        background: var(--acs);
      }
      b {
        color: var(--act);
        font-weight: 700;
      }
    }
    .oico {
      display: flex;
      color: var(--tx3);
    }
    .otx {
      flex: 1;
      min-width: 0;
    }
    .ol {
      display: block;
      font-weight: 600;
    }
    .os {
      display: block;
      font-size: 12px;
      color: var(--tx3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .none {
      padding: 12px 10px;
      color: var(--tx2);
    }
    .legend {
      display: flex;
      gap: 14px;
      padding: 8px 10px 4px;
      margin-top: 4px;
      border-top: 1px solid var(--hair);
      font-size: 11.5px;
      color: var(--tx3);
    }
  `,
})
export class Search {
  protected readonly s = inject(I18n).s;
  readonly navigate = output<{ page: SettingsPage; anchor?: string }>();
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('input');

  protected readonly query = signal('');
  protected readonly focused = signal(false);
  protected readonly active = signal(0);
  protected readonly open = computed(() => this.focused() && this.query().trim().length > 0);
  /** Canto do popover, logo abaixo do campo. */
  protected readonly anchor = signal({ x: 12, y: 96 });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private readonly index = computed(() => buildIndex(this.s()).map((e) => ({ e, hay: fold(`${e.label} ${e.hint} ${e.section} ${this.s().pages[e.page]} ${e.words}`) })));

  protected readonly results = computed(() => {
    const q = fold(this.query().trim());
    if (!q) return [];
    const words = q.split(/\s+/);
    const s = this.s();
    const scored = this.index()
      .filter((x) => words.every((w) => x.hay.includes(w)))
      .map((x) => {
        const l = fold(x.e.label);
        const score = l.startsWith(q) ? 0 : l.includes(q) ? 1 : fold(x.e.hint).includes(q) ? 2 : 3;
        return { ...x, score };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 8);
    // Agrupado por página: primeiro a página com o melhor resultado (empate: ordem da navegação)
    const best = new Map<SettingsPage, number>();
    for (const x of scored) best.set(x.e.page, Math.min(best.get(x.e.page) ?? 9, x.score));
    scored.sort((a, b) => best.get(a.e.page)! - best.get(b.e.page)! || PAGES.indexOf(a.e.page) - PAGES.indexOf(b.e.page) || a.score - b.score);
    return scored.map(({ e }) => {
      const crumb = e.section && e.section !== s.pages[e.page] ? `${s.pages[e.page]} › ${e.section}` : s.pages[e.page];
      const ex = fold(e.label).includes(q) ? '' : excerpt(e.hint, q);
      return { e, icon: e.icon, label: highlight(e.label, q), sub: highlight(ex ? `${crumb} · ${ex}` : crumb, q) };
    });
  });

  /** Ctrl K (chamado pela moldura). */
  focus() {
    const el = this.input()?.nativeElement;
    el?.focus();
    el?.select();
  }

  protected onInput(v: string) {
    const r = this.host.nativeElement.getBoundingClientRect();
    this.anchor.set({ x: Math.round(r.left), y: Math.round(r.top + 38) });
    this.query.set(v);
    this.active.set(0);
  }

  protected onBlur() {
    this.focused.set(false);
  }

  protected keys(e: KeyboardEvent) {
    const n = this.results().length;
    if (e.key === 'ArrowDown' && n) this.active.set((this.active() + 1) % n);
    else if (e.key === 'ArrowUp' && n) this.active.set((this.active() + n - 1) % n);
    else if (e.key === 'Enter' && n) this.pick(this.active());
    else if (e.key === 'Escape') {
      if (this.query()) this.query.set('');
      else this.input()?.nativeElement.blur();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  }

  protected pick(i: number) {
    const r = this.results()[i];
    if (!r) return;
    this.query.set('');
    this.input()?.nativeElement.blur();
    this.navigate.emit({ page: r.e.page, anchor: r.e.anchor });
  }
}
