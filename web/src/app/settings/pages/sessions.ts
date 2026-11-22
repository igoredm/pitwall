import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { I18n } from '../../i18n';
import { benchAsSession } from '../../benchmark';
import { AppConfig, Benchmark, GameSession, SessionSeries } from '../../models';
import { TelemetryService, hashParams } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { PageHead } from '../page-head';
import { setHashParams } from '../reports';
import { SettingsCtx } from '../settings-ctx';
import { SessionAverages } from './sessions/averages';
import { SessionBench } from './sessions/bench';
import { SessionTrend } from './sessions/trend';
import { fmtCost, fmtEnergy } from './sessions/trend-util';
import { num } from '../reports';
import { SessionCompare } from './sessions/compare';
import { CsvRecording } from './sessions/csv-recording';
import { SessionHistory } from './sessions/history';
import { LastSession } from './sessions/last-session';
import { sameStart } from './sessions/session-util';
import { ShareDialog } from './sessions/share-dialog';

const PAGE = 20;

/**
 * Jogo › Relatórios de jogo (docs/design-notes.md › v1.2 › 3): última partida (faixa de números, linha do tempo,
 * marcadores), médias e picos, Comparar (seleção na URL: #/settings/sessions/compare?a=<start>&b=<start>, sincronizada
 * com as caixas do histórico), histórico paginado, gravação em CSV e o diálogo Compartilhar.
 */
@Component({
  selector: 'pw-page-sessions',
  imports: [PageHead, Icon, LastSession, SessionAverages, SessionTrend, SessionBench, SessionCompare, SessionHistory, CsvRecording, ShareDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="sessions" [intro]="sx.rp.sessionsIntro" />

    @if (d) {
      <!-- ================================================= última partida -->
      <section class="sec first" data-anchor="last" data-tour="game-last">
        @if (shown(); as x) {
          <pw-last-session [session]="x" [live]="isLive(x)" [latest]="isLatest(x)" [series]="lastSeries()" (share)="shareFor.set(x)" (seePc)="seePc($event)" />
        } @else {
          <div class="sh"><h2>{{ sx.rp.lastMatch }}</h2></div>
          <div class="grp">
            <div class="empty">
              <span class="ico"><pw-icon name="sessions" [size]="22" /></span>
              <div class="lb">{{ sx.noSessionsTitle }}</div>
              <div class="ht">{{ sx.noSessionsBody }}</div>
              <a class="lnk" href="#/settings/games/rules" (click)="$event.preventDefault(); ctx.go('games', 'rules')">{{ sx.notDetected }}</a>
            </div>
          </div>
        }
        <div class="grp autoopen">
          <div class="row">
            <div class="rl">
              <div class="lb" id="l-autoopen">{{ sx.autoOpenTitle }}</div>
              <div class="ht">{{ sx.autoOpenHint }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-autoopen" [attr.aria-checked]="!!d.features?.openSummaryOnGameEnd" (click)="ctx.update(flipAutoOpen)"></button>
          </div>
        </div>
      </section>

      @if (shown(); as x) {
        @if (!isLive(x)) {
          <section class="sec">
            <pw-session-averages [session]="x" />
          </section>
        }
      }

      <!-- ================================================= 1.3: tendência e benchmark -->
      <section class="sec" data-anchor="trend">
        <pw-session-trend />
      </section>

      <section class="sec" data-anchor="bench">
        <pw-session-bench (share)="shareBench.set($event)" />
      </section>

      <!-- ================================================= comparar -->
      @if (known().length > 1) {
        <section class="sec" data-anchor="compare">
          <pw-session-compare
            [a]="a()"
            [b]="b()"
            [options]="known()"
            [seriesA]="seriesOf(a())"
            [seriesB]="seriesOf(b())"
            (setA)="setSlot(0, $event)"
            (setB)="setSlot(1, $event)"
            (swap)="swap()"
            (clear)="setSelection(a() ? [a()!.start] : [])"
            (go)="ctx.go('sessions', 'compare')"
          />
        </section>
      }

      <!-- ================================================= histórico -->
      @if (t.sessions().length || hist().total) {
        <section class="sec" data-anchor="history">
          <pw-session-history
            [items]="hist().items"
            [total]="hist().total"
            [loading]="hist().loading"
            [selection]="effective()"
            [openStart]="shown()?.start ?? null"
            [liveStart]="liveStart()"
            [games]="games()"
            [exe]="exe()"
            [keepDays]="d.log.keepDays ?? 30"
            (toggle)="toggle($event)"
            (open)="open($event)"
            (share)="shareFor.set($event)"
            (more)="load(hist().items.length)"
            (filter)="setFilter($event)"
            (compare)="ctx.go('sessions', 'compare')"
          />
        </section>
      }

      <!-- ================================================= 1.3: custo da energia -->
      <section class="sec" data-anchor="energy">
        <div class="sh">
          <div>
            <h2>{{ sx.v13.energySec }}</h2>
            <div class="ht">{{ sx.v13.energyHint }}</div>
          </div>
        </div>
        <div class="grp">
          <div class="row ener">
            <div class="rl">
              <div class="lb" id="l-tariff">{{ sx.v13.tariff }}</div>
              <div class="ht" [title]="sx.v13.energyTip">{{ energyExample() }}</div>
            </div>
            <label class="fld">
              <span class="cap">{{ sx.v13.currency }}</span>
              <input class="in sm cur" type="text" maxlength="4" [value]="d.energy?.currency ?? 'R$'" (change)="setCurrency($any($event.target).value)" />
            </label>
            <label class="fld">
              <span class="cap">{{ sx.v13.tariff }}</span>
              <input class="in sm num tar" type="text" inputmode="decimal" aria-labelledby="l-tariff" [placeholder]="sx.v13.tariffPh" [value]="tariffText()" (change)="setTariff($any($event.target).value)" />
            </label>
          </div>
        </div>
      </section>

      <pw-csv-recording />
    }

    @if (shareFor(); as x) {
      <div class="scrim" animate.enter="fade-in" animate.leave="fade-out" (click)="shareFor.set(null)">
        <pw-share-dialog animate.enter="dlg-in" animate.leave="dlg-out" [session]="x" (close)="shareFor.set(null)" (click)="$event.stopPropagation()" />
      </div>
    }
    @if (shareBench(); as b) {
      <div class="scrim" animate.enter="fade-in" animate.leave="fade-out" (click)="shareBench.set(null)">
        <pw-share-dialog animate.enter="dlg-in" animate.leave="dlg-out" [session]="benchSession(b)" [bench]="true" (close)="shareBench.set(null)" (click)="$event.stopPropagation()" />
      </div>
    }
  `,
  styles: `
    .first {
      margin-top: 24px;
    }
    .autoopen {
      margin-top: 12px;
    }
    .ener {
      flex-wrap: wrap;
      row-gap: 10px;
    }
    .fld {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .cur {
      width: 64px;
    }
    .tar {
      width: 96px;
    }
  `,
})
export class SessionsPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);

  protected readonly flipAutoOpen = (c: AppConfig) =>
    (c.features = { crashReport: true, gameSuggestions: true, sessionPeaks: true, clockReason: true, ...c.features, openSummaryOnGameEnd: !c.features?.openSummaryOnGameEnd });

  /** Partida aberta em "Última partida" (null = a mais recente). */
  private readonly picked = signal<GameSession | null>(null);
  protected readonly exe = signal('');
  protected readonly hist = signal<{ items: GameSession[]; total: number; loading: boolean }>({ items: [], total: 0, loading: true });
  protected readonly shareFor = signal<GameSession | null>(null);
  /** 1.3: benchmark no diálogo Compartilhar. */
  protected readonly shareBench = signal<Benchmark | null>(null);
  protected benchSession(b: Benchmark) {
    return benchAsSession(b);
  }

  /** 1.3: tarifa no formato do idioma ("0,89"). */
  protected readonly tariffText = computed(() => {
    const v = this.ctx.draft()?.energy?.tariff;
    return v == null ? '' : num(v, v < 10 ? 2 : 0, this.s()).replace(/([.,]\d*?)0+$/, '$1').replace(/[.,]$/, '');
  });

  /** "Uma hora a 400 W: ≈ 0,40 kWh, ≈ R$ 0,36." */
  protected readonly energyExample = computed(() => {
    const s = this.s();
    return s.v13.energyExample(fmtEnergy(400, s), fmtCost(400, this.ctx.draft()?.energy, s));
  });

  protected setTariff(raw: string) {
    const txt = raw.trim().replace(/\s/g, '').replace(',', '.');
    const v = txt === '' ? null : Number(txt);
    if (v != null && !(Number.isFinite(v) && v >= 0)) return;
    this.ctx.update((c) => (c.energy = { currency: 'R$', ...c.energy, tariff: v }));
  }

  protected setCurrency(raw: string) {
    this.ctx.update((c) => (c.energy = { tariff: null, ...c.energy, currency: raw.trim().slice(0, 4) }));
  }
  /** Marcadas para comparar, na ordem (A, B). Vem da URL; sem nada, a última partida é a A. */
  protected readonly selection = signal<string[]>(['a', 'b'].map((k) => hashParams().get(k)).filter((v): v is string => !!v));
  private readonly userTouched = signal(this.selection().length > 0);
  /** Séries pedidas (getSessionSeries), por start. undefined = carregando. */
  private readonly series = signal<Record<string, SessionSeries | null>>({});
  private reqId = 0;

  protected readonly liveStart = computed(() => {
    const first = this.t.sessions()[0];
    return first && !first.end && first.exe === this.t.game()?.exe ? first.start : null;
  });

  protected isLive(x: GameSession) {
    return x.start === this.liveStart() && !x.end;
  }

  protected isLatest(x: GameSession) {
    return x.start === this.t.sessions()[0]?.start;
  }

  protected readonly shown = computed(() => this.picked() ?? this.t.sessions()[0] ?? null);

  /** Todas as partidas conhecidas (recentes + histórico carregado), sem repetir. */
  protected readonly known = computed(() => {
    const map = new Map<string, GameSession>();
    for (const x of [...this.t.sessions(), ...this.hist().items]) if (!map.has(x.start)) map.set(x.start, x);
    return [...map.values()].filter((x) => !this.isLive(x));
  });

  private find(start: string | undefined) {
    return start ? (this.known().find((x) => sameStart(x.start, start)) ?? null) : null;
  }

  /** Sem escolha, A = a última partida terminada (o design mostra a primeira linha marcada). */
  protected readonly effective = computed(() => {
    const sel = this.selection();
    if (sel.length || this.userTouched()) return sel;
    const first = this.known()[0];
    return first ? [first.start] : [];
  });
  protected readonly a = computed(() => this.find(this.effective()[0]));
  protected readonly b = computed(() => this.find(this.effective()[1]));

  protected readonly lastSeries = computed(() => {
    const x = this.shown();
    return x ? this.seriesOf(x) : undefined;
  });

  protected readonly games = computed(() => {
    const d = this.ctx.draft();
    const set = new Map<string, string>();
    for (const x of [...this.t.sessions(), ...this.hist().items]) set.set(x.exe.toLowerCase(), x.exe);
    for (const x of [...(d?.games.include ?? []), ...Object.keys(d?.games.profiles ?? {})]) if (!set.has(x.toLowerCase())) set.set(x.toLowerCase(), x);
    if (this.exe()) set.set(this.exe().toLowerCase(), this.exe());
    return [...set.values()].sort((a, b) => a.localeCompare(b));
  });

  constructor() {
    // Recarrega a primeira página quando uma sessão começa ou termina
    effect(() => {
      const first = this.t.sessions()[0];
      void first?.start;
      void first?.end;
      untracked(() => this.load(0));
    });
    // Pede a série da partida aberta e das comparadas
    effect(() => {
      const list = [this.shown(), this.a(), this.b()].filter((x): x is GameSession => !!x);
      untracked(() => list.forEach((x) => this.request(x)));
    });
  }

  protected seriesOf(x: GameSession | null): SessionSeries | null | undefined {
    if (!x) return null;
    const map = this.series();
    return x.start in map ? map[x.start] : undefined;
  }

  private request(x: GameSession) {
    const live = this.isLive(x);
    if (!live && x.start in this.series()) return;
    this.t.requestSessionSeries(x.start, !live).then((sr) => this.series.update((m) => ({ ...m, [x.start]: sr })));
  }

  protected open(x: GameSession) {
    this.picked.set(x);
    this.ctx.go('sessions', 'last');
  }

  /** Link "Ver relatório do PC": abre o incidente da queda em Relatório do PC. */
  protected seePc(id: string | null) {
    setHashParams({ incident: id, a: null, b: null });
    this.ctx.go('health', 'latest');
  }

  protected setSelection(list: string[]) {
    this.userTouched.set(true);
    this.selection.set(list.slice(0, 2));
    setHashParams({ a: list[0] ?? null, b: list[1] ?? null });
  }

  /** Marcar a terceira desmarca a mais antiga. */
  protected toggle(start: string) {
    const cur = this.effective();
    if (cur.some((x) => sameStart(x, start))) this.setSelection(cur.filter((x) => !sameStart(x, start)));
    else this.setSelection(cur.length >= 2 ? [cur[1], start] : [...cur, start]);
  }

  protected setSlot(i: 0 | 1, start: string | null) {
    const cur = [...this.effective()];
    if (i === 0) this.setSelection(start ? [start, ...(cur[1] && !sameStart(cur[1], start) ? [cur[1]] : [])] : cur.slice(1));
    else this.setSelection(cur[0] ? (start ? [cur[0], start] : [cur[0]]) : start ? [start] : []);
  }

  protected swap() {
    const [x, y] = this.effective();
    if (x && y) this.setSelection([y, x]);
  }

  protected setFilter(exe: string) {
    this.exe.set(exe);
    this.load(0);
  }

  protected load(offset: number) {
    const id = ++this.reqId;
    this.hist.update((h) => ({ ...h, loading: true, items: offset ? h.items : [] }));
    this.t.requestSessions(offset, PAGE, this.exe() || undefined).then((page) => {
      if (id !== this.reqId) return;
      this.hist.update((h) => ({ items: offset ? [...h.items, ...page.sessions] : page.sessions, total: page.total, loading: false }));
    });
  }
}
