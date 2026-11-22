import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, output, signal, untracked, viewChild } from '@angular/core';
import { benchAsSession, benchDuration, benchRemaining, fmtCountdown } from '../../../benchmark';
import { I18n } from '../../../i18n';
import { BENCHMARK_DURATIONS, Benchmark, BenchmarkDuration } from '../../../models';
import { TelemetryService } from '../../../telemetry.service';
import { Icon } from '../../../ui/icon';
import { fmtDuration } from '../../format';
import { shortDayTime } from '../../reports';
import { SettingsCtx } from '../../settings-ctx';
import { compareRows } from './session-util';
import { fmtCost, fmtEnergy } from './trend-util';

/**
 * 1.3 · Relatórios de jogo › Benchmark (#bench): duração (30 s · 1 · 2 · 5 min, salva em config.benchmark), Iniciar /
 * Cancelar, a contagem enquanto roda (pelo startedAt), a lista com nota editável, comparar dois (a tabela do Comparar)
 * e compartilhar (o mesmo card das partidas). Apagar pede um segundo clique.
 */
@Component({
  selector: 'pw-session-bench',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let st = t.benchmark();
    <div class="sh">
      <div class="min0">
        <h2>{{ sx.v13.benchTitle }}</h2>
        <div class="ht">{{ sx.v13.benchHint(keys()) }}</div>
      </div>
      @if (list().length) {
        @if (selected().length === 2) {
          <span class="cap nw">{{ sx.rp.cmpVs }}</span>
        } @else {
          <span class="cap nw">{{ sx.v13.benchSel(selected().length) }}</span>
        }
      }
    </div>
    <div class="grp">
      @if (left() != null) {
        <div class="row run" aria-live="polite">
          <i class="dot" style="background: var(--g)"></i>
          <div class="rl">
            <div class="lb">{{ sx.v13.benchRunning(st?.exe ?? t.game()?.exe ?? '') }} <span class="t2 mono cd">{{ sx.v13.benchLeft(countdown()) }}</span></div>
            <span class="bar pbar" role="progressbar" [attr.aria-valuenow]="progress()" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="progress()" style="background: var(--ac)"></span></span>
          </div>
          <button type="button" class="btn sm" (click)="t.cancelBenchmark()">{{ sx.v13.benchCancel }}</button>
        </div>
      } @else {
        <div class="row ctl">
          <div class="rl">
            <div class="lb" id="l-bdur">{{ sx.v13.benchDuration }}</div>
            <div class="ht">
              @if (t.game(); as g) {
                <span class="mono">{{ g.exe }}</span>
              } @else {
                {{ sx.v13.benchNeedGame }}
              }
            </div>
          </div>
          <span class="seg" role="group" aria-labelledby="l-bdur">
            @for (d of durations; track d) {
              <button type="button" [attr.aria-pressed]="duration() === d" (click)="setDuration(d)">{{ dur(d) }}</button>
            }
          </span>
          <button type="button" class="btn sm pri" [disabled]="!t.game()" (click)="start()"><pw-icon name="play" [size]="14" />{{ sx.v13.benchStart }}</button>
        </div>
      }
      @if (status(); as m) {
        <div class="row bt tight stat" role="status">
          <span [class]="'cap ' + m.cls">{{ m.text }}</span>
        </div>
      }
      @if (t.benchmarks() === null) {
        <div class="row bt"><span class="cap">{{ sx.loading }}</span></div>
      } @else if (!list().length) {
        <div class="row bt"><span class="ht m0">{{ sx.v13.benchEmpty }}</span></div>
      } @else {
        <div class="bt">
          <div class="tbl-r th bcols">
            <span></span><span>{{ sx.v13.colGame }}</span><span>{{ sx.v13.colWhen }}</span><span class="r c-dur">{{ sx.v13.colDur }}</span><span class="r">{{ sx.v13.colFps }}</span><span class="r">{{ sx.v13.col1 }}</span><span class="r c-01">{{ sx.v13.col01 }}</span><span class="r c-st">{{ sx.v13.colSt }}</span><span></span>
          </div>
          @for (r of rows(); track r.b.id) {
            <div class="tbl-r bcols brow" [class.sel]="r.checked">
              <button type="button" class="cb" role="checkbox" [attr.aria-checked]="r.checked" [attr.aria-label]="sx.v13.cbAria(r.b.exe, r.when)" (click)="toggle(r.b.id)">
                @if (r.checked) {
                  <pw-icon name="check" [size]="12" [stroke]="3" />
                }
              </button>
              <span class="gm">
                <span class="mono ell" [title]="r.b.exe">{{ r.b.exe }}</span>
                @if (editing() === r.b.id) {
                  <input #noteIn class="in sm note-in" type="text" maxlength="80" [value]="r.b.note ?? ''" [placeholder]="sx.v13.notePh" [attr.aria-label]="sx.v13.noteAria(r.b.exe, r.when)" (keydown.enter)="saveNote(r.b, $any($event.target).value)" (keydown.escape)="editing.set(null)" (blur)="saveNote(r.b, $any($event.target).value)" />
                } @else {
                  <button type="button" class="nt" [class.t3]="!r.b.note" [attr.aria-label]="sx.v13.noteAria(r.b.exe, r.when)" (click)="edit(r.b.id)">{{ r.b.note || sx.v13.addNote }}</button>
                }
              </span>
              <span class="t2 sm13 nw ell">{{ r.when }}</span>
              <span class="r nw c-dur">{{ r.dur }}@if (r.b.partial) {
                  <span class="pill p-y pp" [title]="sx.v13.benchPartialTip">{{ sx.v13.benchPartial }}</span>
                }</span>
              <span class="r b6">{{ r.fps }}</span>
              <span class="r">{{ r.low1 }}</span>
              <span class="r c-01">{{ r.low01 }}</span>
              <span class="r c-st">{{ r.st }}</span>
              <span class="acts">
                <button type="button" class="btn qt sm ib" [attr.aria-label]="sx.v13.shareAria(r.b.exe, r.when)" [title]="sx.rp.share" (click)="share.emit(r.b)"><pw-icon name="share" [size]="14" /></button>
                @if (confirm() === r.b.id) {
                  <button type="button" class="btn sm dg" (click)="remove(r.b.id)" (blur)="confirm.set(null)">{{ sx.v13.delSure }}</button>
                } @else {
                  <button type="button" class="btn qt sm ib" [attr.aria-label]="sx.v13.delAria(r.b.exe, r.when)" [title]="sx.v13.del" (click)="confirm.set(r.b.id)"><pw-icon name="x" [size]="14" /></button>
                }
              </span>
            </div>
          }
          <div class="row bt tight"><span class="cap">{{ sx.v13.keeps200 }}</span></div>
        </div>
      }
    </div>

    @if (table(); as tb) {
      <div class="grp cmp">
        <div class="tbl-r th ccols hd">
          <span>{{ sx.v13.benchCmpHint(tb.same) }}</span>
          <span class="r"><span class="pill p-ac">A</span><br /><span class="b6 ell">{{ tb.a }}</span></span>
          <span class="r"><span class="pill p-n">B</span><br /><span class="b6 ell">{{ tb.b }}</span></span>
          <span class="r">{{ sx.rp.cmpVs }}</span>
        </div>
        @for (r of tb.rows; track r.key) {
          <div class="tbl-r ccols crow">
            <span class="b6 nm">{{ r.name }}</span>
            <span class="r">{{ r.a }}</span>
            <span class="r t2">{{ r.b }}</span>
            <span [class]="'r d-' + r.tone">{{ r.delta }}</span>
          </div>
        }
        <div class="row bt tight"><span class="cap">{{ sx.rp.cmpRule }}</span></div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .min0 {
      min-width: 0;
    }
    .nw {
      white-space: nowrap;
    }
    .m0 {
      margin: 0;
    }
    .sm13 {
      font-size: 13px;
    }
    .b6 {
      font-weight: 600;
    }
    .r {
      text-align: right;
    }
    .grp {
      container-type: inline-size;
    }
    .ctl {
      flex-wrap: wrap;
      row-gap: 10px;
    }
    .run {
      gap: 14px;
      .dot {
        margin: 0;
        flex-shrink: 0;
      }
    }
    .cd {
      font-weight: 600;
      margin-left: 6px;
    }
    .pbar {
      margin-top: 8px;
      max-width: 420px;
    }
    .stat {
      padding-block: 10px;
      .warn {
        color: var(--y);
      }
      .ok {
        color: var(--tx2);
      }
    }
    .bcols {
      grid-template-columns: 22px minmax(0, 1fr) 104px 92px 48px 44px 48px 70px 68px;
    }
    .brow {
      min-height: 52px;
      font-size: 13.5px;
      &.sel {
        background: var(--acs);
      }
    }
    .cb {
      width: 18px;
      height: 18px;
      padding: 0;
      border-radius: 5px;
      border: 1.5px solid var(--bd);
      background: var(--sf2);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      &[aria-checked='true'] {
        background: var(--acf);
        border-color: var(--acf);
      }
      &:focus-visible {
        outline: 2px solid var(--ac);
        outline-offset: 2px;
      }
    }
    .gm {
      display: flex;
      flex-direction: column;
      min-width: 0;
      padding-block: 6px;
    }
    .nt {
      all: unset;
      font-size: 12px;
      color: var(--tx2);
      cursor: text;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      &.t3 {
        color: var(--tx3);
      }
      &:focus-visible {
        outline: 2px solid var(--ac);
        border-radius: 3px;
      }
    }
    .note-in {
      margin-top: 2px;
      height: 26px;
      font-size: 12.5px;
      width: 100%;
      box-sizing: border-box;
    }
    .pp {
      margin-left: 6px;
      font-size: 10.5px;
      padding: 0 6px;
    }
    .acts {
      display: flex;
      justify-content: flex-end;
      gap: 2px;
    }
    .ib {
      padding: 0 7px;
    }
    .cmp {
      margin-top: 12px;
      container-type: inline-size;
    }
    .ccols {
      grid-template-columns: minmax(0, 1fr) 150px 150px 120px;
    }
    .hd {
      min-height: 52px;
      align-items: end;
      padding-bottom: 8px;
      line-height: 1.6;
      .ell {
        display: inline-block;
        max-width: 100%;
        vertical-align: bottom;
      }
    }
    .crow {
      min-height: 38px;
      font-size: 13.5px;
    }
    .nm {
      min-width: 0;
      line-height: 1.3;
      padding-block: 6px;
    }
    .d-g {
      color: var(--g);
      font-weight: 700;
    }
    .d-r {
      color: var(--r);
      font-weight: 700;
    }
    .d-n {
      color: var(--tx3);
      font-weight: 600;
    }
    @container (max-width: 700px) {
      .bcols {
        grid-template-columns: 22px minmax(0, 1fr) 92px 48px 44px 68px;
        gap: 8px;
      }
      .c-dur,
      .c-01,
      .c-st {
        display: none;
      }
      .ccols {
        grid-template-columns: minmax(0, 1fr) 84px 84px 80px;
        gap: 8px;
      }
    }
    @container (max-width: 440px) {
      .ctl .rl {
        flex-basis: 100%;
      }
      .ctl .seg {
        flex-wrap: wrap;
      }
      .bcols {
        grid-template-columns: 22px minmax(0, 1fr) 44px 40px 64px;
      }
      .bcols > :nth-child(3) {
        display: none;
      }
    }
  `,
})
export class SessionBench {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  readonly share = output<Benchmark>();

  protected readonly durations = BENCHMARK_DURATIONS;
  protected readonly selected = signal<string[]>([]);
  protected readonly editing = signal<string | null>(null);
  protected readonly confirm = signal<string | null>(null);
  private readonly noteIn = viewChild<ElementRef<HTMLInputElement>>('noteIn');
  /** Relógio de 250 ms só enquanto roda. */
  private readonly now = signal(Date.now());

  protected readonly duration = computed(() => benchDuration(this.ctx.draft()?.benchmark?.durationSec));
  protected readonly list = computed(() => this.t.benchmarks() ?? []);

  /** "Ctrl Alt B" (null = atalho desligado). */
  protected readonly keys = computed(() => {
    const hk = this.ctx.draft()?.hotkeys;
    const st = this.t.catalog()?.hotkeys?.benchmark;
    const v = hk?.benchmark ?? 'Ctrl+Alt+B';
    if (hk?.enabled === false || !v || st === 'off' || st === 'invalid') return null;
    return v.split('+').join(' ');
  });

  protected readonly left = computed(() => benchRemaining(this.t.benchmark(), this.now()));
  protected readonly countdown = computed(() => fmtCountdown(this.left() ?? 0));
  protected readonly progress = computed(() => {
    const st = this.t.benchmark();
    const dur = st?.durationSec ?? 60;
    return Math.round(((dur - (this.left() ?? dur)) / dur) * 100);
  });

  protected readonly status = computed(() => {
    const s = this.s();
    const st = this.t.benchmark();
    if (!st) return null;
    if (st.state === 'error') return { text: s.v13.benchErr[st.error ?? 'noGame'] ?? '', cls: 'warn' };
    if (st.state === 'cancelled') return { text: s.v13.benchCancelled, cls: 'ok' };
    if (st.state === 'done' && st.result) {
      const r = st.result;
      const parts = [s.v13.benchDone(r.avgFps != null ? String(Math.round(r.avgFps)) : '—', r.low1 != null ? String(Math.round(r.low1)) : '—')];
      if (r.energyWh != null) {
        const cost = fmtCost(r.energyWh, this.ctx.draft()?.energy, s);
        parts.push(s.v13.energyLine(fmtEnergy(r.energyWh, s)) + (cost ? ` · ${cost}` : ''));
      }
      return { text: parts.join(' '), cls: 'ok' };
    }
    return null;
  });

  protected readonly rows = computed(() => {
    const s = this.s();
    const sel = this.selected();
    const r = (v?: number) => (v == null ? '—' : String(Math.round(v)));
    return this.list().map((b) => ({
      b,
      checked: sel.includes(b.id),
      when: shortDayTime(b.start, s),
      dur: fmtDuration(b.durationSec),
      fps: r(b.avgFps),
      low1: r(b.low1),
      low01: r(b.low01),
      st: b.stutters != null ? String(b.stutters) : '—',
    }));
  });

  protected readonly table = computed(() => {
    const [ia, ib] = this.selected();
    const a = this.list().find((b) => b.id === ia);
    const b = this.list().find((x) => x.id === ib);
    if (!a || !b) return null;
    const s = this.s();
    const label = (x: Benchmark) => `${shortDayTime(x.start, s)} · ${x.note || x.exe}`;
    return { a: label(a), b: label(b), same: a.exe.toLowerCase() === b.exe.toLowerCase(), rows: compareRows(benchAsSession(a), benchAsSession(b), s) };
  });

  constructor() {
    effect(() => {
      if (this.t.connected()) untracked(() => this.t.requestBenchmarks());
    });
    // Conta enquanto roda (o backend não manda nada por segundo)
    let timer: ReturnType<typeof setInterval> | undefined;
    effect(() => {
      const running = this.t.benchmark()?.state === 'running';
      clearInterval(timer);
      timer = undefined;
      if (running) {
        this.now.set(Date.now());
        timer = setInterval(() => this.now.set(Date.now()), 250);
      }
    });
    // Seleção some quando o benchmark é apagado
    effect(() => {
      const ids = new Set(this.list().map((b) => b.id));
      untracked(() => {
        const cur = this.selected();
        if (cur.some((id) => !ids.has(id))) this.selected.set(cur.filter((id) => ids.has(id)));
      });
    });
    // Foco no campo de nota quando ele abre
    effect(() => {
      const el = this.noteIn()?.nativeElement;
      if (el) setTimeout(() => el.focus());
    });
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected dur(d: BenchmarkDuration) {
    return fmtDuration(d);
  }

  protected setDuration(d: BenchmarkDuration) {
    this.ctx.update((c) => (c.benchmark = { ...c.benchmark, durationSec: d }));
  }

  protected start() {
    this.t.startBenchmark(this.duration());
  }

  /** Marcar o terceiro desmarca o mais antigo. */
  protected toggle(id: string) {
    const cur = this.selected();
    if (cur.includes(id)) this.selected.set(cur.filter((x) => x !== id));
    else this.selected.set(cur.length >= 2 ? [cur[1], id] : [...cur, id]);
  }

  protected edit(id: string) {
    this.editing.set(id);
  }

  protected saveNote(b: Benchmark, value: string) {
    if (this.editing() !== b.id) return;
    this.editing.set(null);
    const note = value.trim();
    if (note !== (b.note ?? '')) this.t.renameBenchmark(b.id, note);
  }

  protected remove(id: string) {
    this.confirm.set(null);
    this.t.deleteBenchmark(id);
  }
}
