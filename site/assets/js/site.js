/* Pitwall · site. Idioma, modo teste (o widget real em iframes, só perto da tela), abas do app e as entradas. */
(function () {
  'use strict';

  var I18N = window.PW_I18N;
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var DEMO = 'demo/index.html';

  // ------------------------------------------------------------------ idioma
  var lang = root.lang === 'en' ? 'en' : 'pt';
  var original = new Map(); // elemento → { html, attrs } em português (o que veio no HTML)

  function remember(el) {
    if (original.has(el)) return original.get(el);
    var o = { html: el.hasAttribute('data-i18n') ? el.innerHTML : null, attrs: {} };
    var spec = el.getAttribute('data-i18n-attr');
    if (spec) spec.split(',').forEach(function (p) { var a = p.split(':')[0]; o.attrs[a] = el.getAttribute(a); });
    original.set(el, o);
    return o;
  }

  function applyLang(l, save) {
    lang = l;
    var en = l === 'en' ? I18N.en : null;
    document.querySelectorAll('[data-i18n], [data-i18n-attr]').forEach(function (el) {
      var o = remember(el);
      var key = el.getAttribute('data-i18n');
      if (key) el.innerHTML = en && en[key] != null ? en[key] : o.html;
      var spec = el.getAttribute('data-i18n-attr');
      if (spec) spec.split(',').forEach(function (p) {
        var kv = p.split(':');
        el.setAttribute(kv[0], en && en[kv[1]] != null ? en[kv[1]] : o.attrs[kv[0]]);
      });
    });
    var d = I18N.dyn[l];
    root.lang = l === 'en' ? 'en' : 'pt-BR';
    document.title = d.title;
    setMeta('name="description"', d.desc);
    setMeta('property="og:title"', d.ogTitle);
    setMeta('name="twitter:title"', d.ogTitle);
    setMeta('property="og:description"', d.ogDesc);
    setMeta('name="twitter:description"', d.ogDesc);
    setMeta('property="og:image:alt"', d.ogAlt);
    setMeta('property="og:locale"', l === 'en' ? 'en_US' : 'pt_BR');
    document.querySelectorAll('.lang button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.lang === l)); });
    if (save) try { localStorage.setItem('pitwall-site-lang', l); } catch (e) {}
  }
  function setMeta(sel, v) { var m = document.querySelector('meta[' + sel + ']'); if (m) m.setAttribute('content', v); }

  // ------------------------------------------------------------------ baixar
  // No clique, pergunta ao GitHub qual é o instalador da release mais recente e baixa direto.
  // Só consulta quem clicou. Se algo falhar, segue o href: a página da release.
  var SETUP = /^Pitwall-Setup-[\w.-]+\.exe$/i;
  var RELEASE_API = 'https://api.github.com/repos/igoredm/pitwall/releases/latest';
  var downloading = false;

  function latestSetup() {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 3000);
    return fetch(RELEASE_API, { signal: ctrl.signal, headers: { Accept: 'application/vnd.github+json' }, credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then(function (r) { if (!r.ok) throw new Error('release'); return r.json(); })
      .then(function (rel) {
        var a = (rel.assets || []).filter(function (x) { return SETUP.test(x.name); })[0];
        if (!a || a.browser_download_url.indexOf('https://github.com/igoredm/pitwall/releases/download/') !== 0) throw new Error('asset');
        return a.browser_download_url;
      })
      .finally(function () { clearTimeout(timer); });
  }

  document.querySelectorAll('a[data-download]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (downloading) return;
      downloading = true;
      link.setAttribute('aria-busy', 'true');
      latestSetup()
        .then(function (url) { location.href = url; }, function () { location.href = link.href; })
        .finally(function () { downloading = false; link.removeAttribute('aria-busy'); });
    });
  });

  // ------------------------------------------------------------------ iframes sob demanda
  // Cada "slot" só cria o iframe quando chega perto da tela e o destrói quando sai (o widget atualiza a cada 1 s:
  // fora da tela, não precisa gastar CPU). O pôster (imagem) fica por baixo até o widget desenhar.
  var slots = [];

  function demoUrl(params, route) {
    var q = new URLSearchParams({ demo: '1' });
    Object.keys(params).forEach(function (k) { if (params[k] != null) q.set(k, params[k]); });
    return DEMO + '?' + q.toString() + '#/' + route;
  }

  function Slot(el, opts) {
    this.el = el;
    this.opts = opts; // { src(), size() -> [w,h], fit(el,w,h) -> {s,x,y}, title() }
    this.frame = null;
    this.inView = false;
    this.timer = 0;
    this.enabled = !opts.deferred;
    this.box = opts.box || el;
    slots.push(this);
  }
  Slot.prototype.mount = function () {
    if (!this.enabled || document.hidden) return;
    var src = this.opts.src();
    if (this.frame && this.frame.dataset.src === src) return;
    var size = this.opts.size();
    var f = document.createElement('iframe');
    f.className = 'scaled';
    f.dataset.src = src;
    f.title = this.opts.title();
    f.width = size[0];
    f.height = size[1];
    f.style.width = size[0] + 'px';
    f.style.height = size[1] + 'px';
    if (this.opts.inert) { f.tabIndex = -1; f.setAttribute('aria-hidden', 'true'); }
    f.setAttribute('referrerpolicy', 'no-referrer');
    var self = this, box = this.box;
    // um iframe que ainda não desenhou e já foi substituído não aparece: sai na hora
    box.querySelectorAll('iframe:not(.ready)').forEach(function (x) { x.remove(); });
    this.frame = f;
    f.addEventListener('load', function () {
      // o Angular sobe e recebe o primeiro snapshot logo depois do load
      setTimeout(function () {
        if (self.frame !== f) return;
        f.classList.add('ready');
        var poster = self.el.querySelector('.poster');
        if (poster) {
          poster.style.opacity = '0';
          // escondida de vez depois do crossfade (o iframe tem o próprio título)
          setTimeout(function () { if (self.frame === f) poster.hidden = true; }, 520);
        }
        // os anteriores somem depois do crossfade
        setTimeout(function () {
          box.querySelectorAll('iframe').forEach(function (x) { if (x !== self.frame) x.remove(); });
        }, 420);
      }, 520);
    });
    f.src = src;
    this.box.appendChild(f);
    this.layout();
  };
  Slot.prototype.unmount = function () {
    var poster = this.el.querySelector('.poster');
    if (poster) { poster.hidden = false; poster.style.opacity = ''; }
    this.box.querySelectorAll('iframe').forEach(function (f) { f.remove(); });
    this.frame = null;
  };
  Slot.prototype.layout = function () {
    if (!this.frame) return;
    var size = this.opts.size();
    var r = this.el.getBoundingClientRect();
    var fit = this.opts.fit ? this.opts.fit(r, size) : { s: r.width / size[0] };
    this.box.querySelectorAll('iframe').forEach(function (f) {
      var w = +f.width, h = +f.height;
      var s = fit.sFor ? fit.sFor(w, h) : fit.s;
      f.style.transform = 'scale(' + s + ')';
    });
  };
  Slot.prototype.refresh = function () { if (this.inView) this.mount(); };

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      var slot = slots.find(function (s) { return s.el === e.target; });
      if (!slot) return;
      slot.inView = e.isIntersecting;
      clearTimeout(slot.timer);
      if (e.isIntersecting) slot.mount();
      else slot.timer = setTimeout(function () { slot.unmount(); }, 1200);
    });
  }, { rootMargin: '320px 0px' });

  var ro = new ResizeObserver(function (entries) {
    entries.forEach(function (e) {
      var slot = slots.find(function (s) { return s.el === e.target; });
      if (slot) { slot.opts.onResize && slot.opts.onResize(); slot.layout(); }
    });
  });

  document.addEventListener('visibilitychange', function () {
    slots.forEach(function (s) { if (document.hidden) s.unmount(); else if (s.inView) s.mount(); });
  });

  // ------------------------------------------------------------------ hero: o widget ao vivo no "monitor 2"
  var heroEl = document.querySelector('[data-frame="hero"]');
  var hero = new Slot(heroEl, {
    deferred: true,
    inert: true,
    src: function () { return demoUrl({ theme: 'lumen', mode: 'dark', lang: lang === 'en' ? 'en' : 'pt' }, 'widget'); },
    size: function () { return [1280, 400]; },
    title: function () { return I18N.dyn[lang].frameWidget; },
  });

  // ------------------------------------------------------------------ modo teste
  var SIZES = { full: [1280, 400], mid: [600, 600], compact: [320, 240], strip: [1920, 480], mini: [800, 480] };
  var SCENES = {
    idle: { scene: 'idle' },
    game: {},
    warm: { heat: 'warm' },
    hot: { heat: 'hot', perfcap: 'thermal' },
    anticheat: { fps: 'anticheat' },
    stutter: { stutter: '1' },
    battery: { battery: 'low' },
  };
  var form = document.getElementById('demo-controls');
  var stage = document.getElementById('stage');
  var stageBox = document.getElementById('stage-box');
  var wlangTouched = false;
  if (matchMedia('(max-width: 600px)').matches) form.elements.size.value = 'mid';

  function demoState() {
    var f = form.elements;
    return { theme: f.theme.value, mode: f.mode.value, size: f.size.value, scene: f.scene.value, wlang: f.wlang.value };
  }
  function stageFit() {
    var st = demoState(), sz = SIZES[st.size];
    var pad = stage.clientWidth < 500 ? 16 : 32;
    var W = stage.clientWidth - pad * 2, H = stage.clientHeight - pad * 2;
    var s = Math.min(W / sz[0], H / sz[1], 1.5);
    return { s: s, w: Math.round(sz[0] * s), h: Math.round(sz[1] * s) };
  }
  function sizeBox() {
    var fit = stageFit();
    stageBox.style.width = fit.w + 'px';
    stageBox.style.height = fit.h + 'px';
  }
  var demo = new Slot(stage, {
    box: stageBox,
    src: function () {
      var st = demoState();
      // w: só para o mesmo cenário em outro tamanho ser outro iframe (a demo ignora)
      var p = Object.assign({ theme: st.theme, mode: st.mode, lang: st.wlang, update: 'idle', w: st.size }, SCENES[st.scene]);
      return demoUrl(p, 'widget');
    },
    size: function () { return SIZES[demoState().size]; },
    fit: function () { return { s: stageFit().s }; },
    title: function () { return I18N.dyn[lang].frameWidget; },
    onResize: sizeBox,
  });

  function updateDemoText() {
    var st = demoState(), d = I18N.dyn[lang], sz = SIZES[st.size];
    document.getElementById('stage-size').textContent = sz[0] + ' × ' + sz[1] + ' · ' + d.sizes[st.size];
    var note = document.getElementById('stage-note');
    note.removeAttribute('data-i18n');
    note.textContent = d.notes[st.scene];
  }
  function syncMode() {
    var dark = form.elements.theme.value === 'neon' || form.elements.theme.value === 'terminal';
    var light = form.querySelector('input[name="mode"][value="light"]');
    light.disabled = dark;
    if (dark) form.elements.mode.value = 'dark';
    document.getElementById('mode-hint').hidden = !dark;
  }
  form.addEventListener('change', function (e) {
    if (e.target.name === 'wlang') wlangTouched = true;
    syncMode();
    // tamanho novo: o iframe antigo some junto com a troca (não dá para reescalar um layout para outro)
    if (e.target.name === 'size') { stageBox.querySelectorAll('iframe').forEach(function (f) { f.style.opacity = '0'; }); demo.frame = null; }
    sizeBox();
    updateDemoText();
    demo.refresh();
  });

  // ------------------------------------------------------------------ janela do app (Monitor / Relatório do PC / Relatórios de jogo)
  var appEl = document.querySelector('[data-frame="app"]');
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.tabs [role="tab"]'));
  var page = 'monitor';
  var app = new Slot(appEl, {
    src: function () { return demoUrl({ appearance: 'dark', lang: lang === 'en' ? 'en' : 'pt', update: 'idle' }, 'settings/' + page); },
    size: function () { return [1200, 760]; },
    title: function () { return I18N.dyn[lang].frameApp; },
  });
  function selectTab(t, focus) {
    tabs.forEach(function (x) {
      var on = x === t;
      x.setAttribute('aria-selected', String(on));
      x.tabIndex = on ? 0 : -1;
    });
    if (focus) t.focus();
    page = t.dataset.page;
    document.getElementById('panel-app').setAttribute('aria-labelledby', t.id);
    var note = document.getElementById('tab-note');
    note.removeAttribute('data-i18n');
    note.textContent = I18N.dyn[lang].tabs[page];
    app.refresh();
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { selectTab(t); });
    t.addEventListener('keydown', function (e) {
      var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : null;
      if (j == null) return;
      e.preventDefault();
      selectTab(tabs[(j + tabs.length) % tabs.length], true);
    });
  });

  // ------------------------------------------------------------------ celular
  var phone = new Slot(document.querySelector('[data-frame="phone"]'), {
    inert: false,
    src: function () { return demoUrl({ theme: 'lumen', mode: 'dark', lang: lang === 'en' ? 'en' : 'pt' }, 'mobile'); },
    size: function () { return [390, 844]; },
    title: function () { return I18N.dyn[lang].framePhone; },
  });

  // ------------------------------------------------------------------ troca de idioma
  function setLang(l, save) {
    applyLang(l, save);
    if (!wlangTouched) form.elements.wlang.value = l;
    updateDemoText();
    var sel = tabs.find(function (t) { return t.getAttribute('aria-selected') === 'true'; });
    document.getElementById('tab-note').textContent = I18N.dyn[lang].tabs[sel.dataset.page];
    slots.forEach(function (s) { s.refresh(); });
  }
  document.querySelectorAll('.lang button').forEach(function (b) {
    b.addEventListener('click', function () { if (b.dataset.lang !== lang) setLang(b.dataset.lang, true); });
  });

  // ------------------------------------------------------------------ entradas ao rolar (uma vez cada)
  var revealIO = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add(e.target.hasAttribute('data-pipe') ? 'run' : 'in');
      if (e.target.hasAttribute('data-pipe')) e.target.classList.add('in');
      revealIO.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  document.querySelectorAll('[data-reveal]').forEach(function (el) {
    // escalonamento curto entre irmãos que entram juntos
    var sib = Array.prototype.filter.call(el.parentElement.children, function (c) { return c.hasAttribute('data-reveal'); });
    el.style.setProperty('--i', Math.min(sib.indexOf(el), 6));
    revealIO.observe(el);
  });

  // nav: linha embaixo depois de rolar
  var nav = document.querySelector('.nav'), ticking = false;
  addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { nav.classList.toggle('scrolled', scrollY > 4); ticking = false; });
  }, { passive: true });

  // ------------------------------------------------------------------ início
  applyLang(lang, false);
  if (!wlangTouched) form.elements.wlang.value = lang;
  syncMode();
  sizeBox();
  updateDemoText();
  slots.forEach(function (s) { io.observe(s.el); ro.observe(s.el); });

  // momento do hero no próximo quadro (o CSS faz o resto)
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('ready'); }); });
  // o widget ao vivo do hero só depois do load, para não disputar com o LCP
  function startHero() { setTimeout(function () { hero.enabled = true; if (hero.inView) hero.mount(); }, reduce.matches ? 0 : 900); }
  if (document.readyState === 'complete') startHero(); else addEventListener('load', startHero);
})();
