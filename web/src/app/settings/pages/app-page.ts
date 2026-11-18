import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18n, LANGUAGES } from '../../i18n';
import { AppConfig, UpdateChannel } from '../../models';
import { TelemetryService } from '../../telemetry.service';
import { Icon } from '../../ui/icon';
import { fmtBytes, fmtMs, markdownToBlocks } from '../format';
import { copyText } from '../helpers';
import { PageHead } from '../page-head';
import { SettingsCtx } from '../settings-ctx';
import { UpdateNotice } from '../update-notice';

const REPO = 'https://github.com/igoredm/pitwall';
const RATES = [250, 500, 1000, 2000];

/** Pitwall › App e atualizações: geral, atualizações, ajuda (rever tutorial), sobre e restaurar padrão. */
@Component({
  selector: 'pw-page-app',
  imports: [PageHead, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sx = s();
    @let d = ctx.draft();
    <pw-page-head page="app" />

    @if (d) {
      <section class="sec" data-anchor="general">
        <div class="sh"><h2>{{ sx.generalSec }}</h2></div>
        <div class="grp">
          <div class="row" data-anchor="language">
            <div class="rl">
              <div class="lb">{{ sx.language }}</div>
              <div class="ht">{{ sx.languageHint }} <span [attr.lang]="sx.locale === 'en-US' ? 'pt-BR' : 'en'">{{ sx.locale === 'en-US' ? 'Idioma' : 'Language' }}</span></div>
            </div>
            <span class="seg" role="group" [attr.aria-label]="sx.language">
              <button type="button" [attr.aria-pressed]="(d.language ?? 'auto') === 'auto'" (click)="patch({ language: 'auto' })">{{ sx.automatic }}</button>
              @for (l of languages; track l.id) {
                <button type="button" [attr.aria-pressed]="d.language === l.id" [attr.lang]="l.id" (click)="patch({ language: l.id })">{{ l.short }}</button>
              }
            </span>
          </div>
          <div class="row" data-anchor="appearance">
            <div class="rl">
              <div class="lb">{{ sx.appearanceRow }}</div>
              <div class="ht">{{ sx.appearanceHint }}</div>
            </div>
            <span class="seg" role="group" [attr.aria-label]="sx.appearanceRow">
              <button type="button" [attr.aria-pressed]="(d.appearance ?? 'system') === 'system'" (click)="patch({ appearance: 'system' })">{{ sx.system }}</button>
              <button type="button" [attr.aria-pressed]="d.appearance === 'light'" (click)="patch({ appearance: 'light' })">{{ sx.light }}</button>
              <button type="button" [attr.aria-pressed]="d.appearance === 'dark'" (click)="patch({ appearance: 'dark' })">{{ sx.dark }}</button>
            </span>
          </div>
          <div class="row">
            <div class="rl">
              <div class="lb" id="l-sw">{{ sx.startWithWindows }}</div>
              <div class="ht">{{ sx.startWinHint2 }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-sw" [attr.aria-checked]="d.startWithWindows" (click)="patch({ startWithWindows: !d.startWithWindows })"></button>
          </div>
          <div class="row" data-anchor="rate">
            <div class="rl">
              <div class="lb">{{ sx.refreshRate }}</div>
              <div class="ht">{{ sx.refreshHint2 }}</div>
            </div>
            <span class="seg" role="group" [attr.aria-label]="sx.refreshRate">
              @for (r of rates; track r) {
                <button type="button" [attr.aria-pressed]="d.refreshMs === r" (click)="patch({ refreshMs: r })">{{ ms(r) }}</button>
              }
            </span>
          </div>
        </div>
      </section>

      <section class="sec" data-anchor="updates">
        <div class="sh"><h2>{{ sx.updatesTitle }}</h2></div>
        <div class="grp">
          @if (t.update(); as u) {
            @switch (u.status) {
              @case ('available') {
                <div class="row">
                  <span class="ico act"><pw-icon name="download" [size]="18" [stroke]="2" /></span>
                  <div class="rl">
                    <div class="lb">{{ sx.updAvailable(u.version ?? '') }}</div>
                    <div class="ht">{{ notice.snoozed() ? sx.updSnoozed : sx.updYouHave2(u.current, u.size ? bytes(u.size) : null) }}</div>
                  </div>
                  <button type="button" class="btn sm qt" [attr.aria-expanded]="notesOpen()" (click)="notesOpen.set(!notesOpen())">{{ notesOpen() ? sx.updHideNotes : sx.updNotes }}</button>
                  @if (!notice.snoozed()) {
                    <button type="button" class="btn sm" (click)="notice.later(u.version!)">{{ sx.updLater }}</button>
                  }
                  <button type="button" class="btn sm pri" (click)="install('now')">{{ sx.updNow }}</button>
                </div>
                @if (notesOpen()) {
                  <div class="notes" role="region" [attr.aria-label]="sx.updNotes">
                    @for (b of notes(); track $index) {
                      <!-- numa linha só: a quebra de linha virava espaço antes de vírgula e ponto -->
                      <p [class]="'md-' + b.kind">@for (sp of b.spans; track $index) {@if (sp.code) {<code>{{ sp.t }}</code>} @else if (sp.b) {<b>{{ sp.t }}</b>} @else if (sp.i) {<i>{{ sp.t }}</i>} @else {<span>{{ sp.t }}</span>}}</p>
                    }
                    @if (u.notesUrl) {
                      <div class="nurl">
                        <span class="cap">{{ sx.updPage }}</span>
                        <span class="mono t2 ell">{{ u.notesUrl }}</span>
                        <button type="button" class="lnk" (click)="copyLink(u.notesUrl)">{{ sx.updCopy }}</button>
                      </div>
                    }
                  </div>
                }
                <div class="row tight sub">
                  <button type="button" class="lnk" (click)="install('exit')">{{ sx.updOnExit }}</button>
                  <span class="t3">·</span>
                  <button type="button" class="lnk t2l" (click)="t.send({ type: 'skipUpdate' })">{{ sx.updSkip }}</button>
                </div>
              }
              @case ('downloading') {
                <div class="row col">
                  <div class="lb">{{ sx.updDownloading(u.progress ?? 0) }}</div>
                  <span class="bar" role="progressbar" [attr.aria-valuenow]="u.progress ?? 0" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="u.progress ?? 0" style="background: var(--ac)"></span></span>
                </div>
              }
              @case ('ready') {
                <div class="row">
                  <span class="ico" style="color: var(--g)"><pw-icon name="check" [size]="18" [stroke]="2" /></span>
                  <div class="rl">
                    <div class="lb">{{ sx.updAvailable(u.version ?? '') }}</div>
                    <div class="ht">{{ u.installOnExit ? sx.updReadyExit : u.waitingForGame ? sx.updReadyGame : sx.updInstalling }}</div>
                  </div>
                  @if (u.installOnExit) {
                    <button type="button" class="btn sm pri" (click)="install('now')">{{ sx.updNow }}</button>
                  }
                </div>
              }
              @case ('error') {
                <div class="row">
                  <span class="ico" style="color: var(--r)"><pw-icon name="warn" [size]="18" [stroke]="2" /></span>
                  <div class="rl">
                    <div class="lb">{{ u.version ? sx.updFailed : sx.updOffline }}</div>
                    @if (u.error) {
                      <div class="ht">{{ u.error }}</div>
                    }
                  </div>
                  <button type="button" class="btn sm" (click)="u.version ? install('now') : check()">{{ u.version ? sx.updRetry : sx.updCheckNow }}</button>
                </div>
              }
              @case ('checking') {
                <div class="row">
                  <div class="rl"><div class="lb">{{ sx.updChecking }}</div></div>
                  <button type="button" class="btn sm" disabled>{{ sx.updCheckNow }}</button>
                </div>
              }
              @default {
                <div class="row">
                  <div class="rl">
                    <div class="lb">{{ sx.updUpToDate }}</div>
                    @if (u.lastCheck) {
                      <div class="ht">{{ sx.updChecked(sx.ago(now() - time(u.lastCheck))) }}</div>
                    }
                  </div>
                  <button type="button" class="btn sm" (click)="check()">{{ sx.updCheckNow }}</button>
                </div>
              }
            }
          } @else {
            <div class="row"><span class="skel" style="width: 40%; height: 14px"></span></div>
          }
          <div class="row">
            <div class="rl">
              <div class="lb">{{ sx.updChannel }}</div>
              <div class="ht">{{ sx.updChannelHint }}</div>
            </div>
            <span class="seg" role="group" [attr.aria-label]="sx.updChannel">
              <button type="button" [attr.aria-pressed]="channel() === 'stable'" (click)="setChannel('stable')">{{ sx.updStable }}</button>
              <button type="button" [attr.aria-pressed]="channel() === 'beta'" (click)="setChannel('beta')">{{ sx.updBeta }}</button>
            </span>
          </div>
          <div class="row">
            <div class="rl">
              <div class="lb" id="l-auto">{{ sx.updAuto }}</div>
              <div class="ht">{{ sx.updAutoHint }}</div>
            </div>
            <button type="button" class="sw" role="switch" aria-labelledby="l-auto" [attr.aria-checked]="d.update?.autoCheck ?? true" (click)="toggleAuto()"></button>
          </div>
        </div>
      </section>

      <section class="sec" data-anchor="help">
        <div class="sh"><h2>{{ sx.helpSec }}</h2></div>
        <div class="grp">
          <div class="row" data-anchor="tour">
            <div class="rl">
              <div class="lb">{{ sx.replayTour }}</div>
              <div class="ht">{{ sx.replayTourHint }}</div>
            </div>
            <button type="button" class="btn sm pri" (click)="ctx.startTour()"><pw-icon name="play" [size]="13" [stroke]="2" />{{ sx.startTour }}</button>
          </div>
          <div class="row">
            <div class="rl">
              <div class="lb">{{ sx.shortcuts }}</div>
              <div class="ht kb">
                <span class="kbd">Ctrl K</span> {{ sx.kbSearch }} · <span class="kbd">←</span> <span class="kbd">→</span> {{ sx.kbTour }} · <span class="kbd">Esc</span> {{ sx.kbEsc }}
              </div>
            </div>
          </div>
          <div class="row">
            <div class="rl">
              <div class="lb">{{ sx.reportIssue }}</div>
              <div class="ht">{{ sx.reportIssueHint }}</div>
            </div>
            <button type="button" class="btn sm" (click)="copyLink(issueUrl())"><pw-icon name="copy" [size]="14" />{{ sx.copyLink }}</button>
          </div>
        </div>
      </section>

      <section class="sec" data-anchor="about">
        <div class="sh"><h2>{{ sx.aboutSec }}</h2></div>
        <div class="grp">
          <div class="row">
            <img class="logo" src="pitwall-logo.png" alt="" width="40" height="40" />
            <div class="rl">
              <div class="lb">Pitwall {{ version() }}</div>
              <div class="ht">{{ about() }}</div>
            </div>
            <button type="button" class="lnk" (click)="copyLink(repo)">GitHub<pw-icon name="copy" [size]="13" /></button>
            <button type="button" class="lnk" (click)="copyLink(licenses)">{{ sx.licenses }}<pw-icon name="copy" [size]="13" /></button>
          </div>
        </div>
      </section>

      <section class="sec" data-anchor="reset">
        <div class="sh"><h2>{{ sx.resetSec }}</h2></div>
        <div class="grp">
          <div class="row">
            <div class="rl">
              <div class="lb">{{ sx.resetRow }}</div>
              <div class="ht">{{ sx.resetHint }}</div>
            </div>
            <button type="button" class="btn sm dg" (click)="reset()">{{ sx.resetBtn }}</button>
          </div>
        </div>
      </section>
    }
  `,
  styles: `
    .act {
      color: var(--act);
    }
    .sub {
      gap: 10px;
      padding-top: 0;
      // alinha os links com o texto da linha de cima (16 de padding + ícone 18 + gap 24)
      padding-left: 58px;
      border-top: 0 !important;
      font-size: 13px;
    }
    .t2l {
      color: var(--tx2);
    }
    .right {
      text-align: right;
    }
    .notes {
      margin: 0 16px 12px;
      padding: 12px 14px;
      border-radius: 8px;
      background: var(--sf2);
      font-size: 13px;
      line-height: 1.5;
      max-height: 240px;
      overflow: auto;
      p {
        margin: 0 0 6px;
      }
      .md-h {
        font-weight: 700;
        margin-top: 4px;
      }
      .md-li::before {
        content: '•';
        color: var(--tx3);
        margin-right: 8px;
      }
      code {
        font-family: 'JetBrains Mono', monospace;
        font-size: 12px;
      }
    }
    .nurl {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-top: 8px;
    }
    .kb {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }
    .logo {
      border-radius: 9px;
      flex-shrink: 0;
    }
  `,
})
export class AppPage {
  protected readonly t = inject(TelemetryService);
  protected readonly s = inject(I18n).s;
  protected readonly ctx = inject(SettingsCtx);
  protected readonly notice = inject(UpdateNotice);
  protected readonly languages = LANGUAGES.map((l) => ({ ...l, short: l.id === 'pt-BR' ? 'Português' : 'English' }));
  protected readonly rates = RATES;
  protected readonly repo = REPO;
  protected readonly licenses = `${REPO}/blob/main/installer/THIRD-PARTY-NOTICES.txt`;
  protected readonly notesOpen = signal(false);
  protected readonly now = signal(Date.now());

  protected readonly notes = computed(() => markdownToBlocks(this.t.update()?.notes ?? ''));
  protected readonly channel = computed(() => this.t.update()?.channel ?? this.ctx.draft()?.update?.channel ?? 'stable');
  protected readonly version = computed(() => this.t.catalog()?.about?.app ?? this.t.catalog()?.version ?? '—');

  protected readonly about = computed(() => {
    const s = this.s();
    const cat = this.t.catalog();
    const a = cat?.about;
    const parts: string[] = [];
    if (a?.presentMon) parts.push(`PresentMon ${a.presentMon}`);
    else if (cat?.presentMon === false) parts.push(`PresentMon ${s.chkPill['fail']}`);
    if (a?.pawnIO) parts.push(`PawnIO ${a.pawnIO}`);
    if (a?.dotnet) parts.push(`.NET ${a.dotnet}`);
    if (a?.webView2) parts.push(`WebView2 ${a.webView2}`);
    return s.aboutLine(!!cat?.admin, parts);
  });

  /** Issue nova no GitHub com versão e hardware (o usuário cola no navegador). */
  protected readonly issueUrl = computed(() => {
    const cat = this.t.catalog();
    const body = [
      `Pitwall ${this.version()}`,
      `CPU: ${cat?.hardware.cpu ?? '?'}`,
      `GPU: ${cat?.hardware.gpu ?? '?'}`,
      cat?.about?.dotnet ? `.NET ${cat.about.dotnet}` : '',
      cat?.about?.webView2 ? `WebView2 ${cat.about.webView2}` : '',
      '',
      '---',
      '',
    ]
      .filter((x, i, all) => x || all[i - 1])
      .join('\n');
    return `${REPO}/issues/new?body=${encodeURIComponent(body)}`;
  });

  protected ms(v: number) {
    return fmtMs(v, this.s());
  }

  protected bytes(v: number) {
    return fmtBytes(v, this.s());
  }

  protected time(iso: string) {
    return new Date(iso).getTime();
  }

  protected patch(p: Partial<AppConfig>) {
    this.ctx.update((c) => Object.assign(c, p));
  }

  protected install(when: 'now' | 'exit') {
    this.t.send({ type: 'installUpdate', when });
  }

  protected check() {
    this.now.set(Date.now());
    this.t.send({ type: 'checkUpdate' });
  }

  protected setChannel(channel: UpdateChannel) {
    this.t.send({ type: 'setUpdateChannel', channel });
  }

  protected toggleAuto() {
    this.ctx.update((c) => {
      c.update = { channel: 'stable', ...c.update, autoCheck: !(c.update?.autoCheck ?? true) };
    });
  }

  /** Copia em vez de abrir: um link aberto daqui rodaria o navegador como administrador. */
  protected copyLink(url: string) {
    copyText(url).then((ok) => {
      if (ok) this.ctx.toast({ title: this.s().linkCopied, duration: 3000 });
    });
  }

  protected async reset() {
    const s = this.s();
    const ok = await this.ctx.confirm({
      title: s.resetTitle,
      listTitle: s.resetLose,
      items: s.resetItems,
      foot: s.resetKeep,
      confirm: s.resetConfirm,
      danger: true,
    });
    if (ok) this.ctx.restoreDefaults();
  }
}
