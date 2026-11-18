using Pitwall.Localization;
using System.Diagnostics;
using Pitwall.Config;

namespace Pitwall.Ui;

/// <summary>Ícone na bandeja + menu. A tela de configuração completa vem na fase 3; por ora, o essencial fica aqui.</summary>
public sealed class TrayApp : ApplicationContext
{
    readonly ConfigStore _config;
    readonly TelemetryHub _hub;
    readonly Func<string> _dumpSensors;
    readonly NotifyIcon _tray;
    readonly WidgetForm _widget;
    readonly SynchronizationContext _ui;
    SettingsForm? _settings;
    bool _autostartState;

    public TrayApp(ConfigStore config, TelemetryHub hub, Func<string> dumpSensors)
    {
        _config = config;
        _hub = hub;
        _dumpSensors = dumpSensors;
        _ui = SynchronizationContext.Current ?? new WindowsFormsSynchronizationContext();

        _widget = new WidgetForm(config, hub.Port);
        _tray = new NotifyIcon
        {
            Icon = AppIcon.Small(),
            Text = "Pitwall",
            Visible = true,
            ContextMenuStrip = new ContextMenuStrip(),
        };
        _tray.ContextMenuStrip.Opening += (_, _) => BuildMenu(_tray.ContextMenuStrip);
        _tray.MouseClick += (_, e) =>
        {
            if (e.Button == MouseButtons.Left) Toggle(c => c.Widget.Visible = !c.Widget.Visible);
        };
        _tray.MouseDoubleClick += (_, e) => { if (e.Button == MouseButtons.Left) OpenSettings(); };
        _widget.SettingsRequested += OpenSettings;
        hub.PlaceTopRightRequested += layout => _ui.Post(_ => _widget.PlaceTopRight(layout), null);

        // "Iniciar com o Windows" pode ser alterado pela tela de configurações: sincroniza a tarefa agendada.
        config.Changed += c =>
        {
            if (c.StartWithWindows == _autostartState) return;
            _ui.Post(_ =>
            {
                var want = _config.Current.StartWithWindows;
                if (want == _autostartState) return;
                if (Autostart.Set(want)) _autostartState = want;
                else
                {
                    _tray.ShowBalloonTip(4000, "Pitwall", L.T("Não foi possível alterar o início automático.", "Could not change start with Windows."), ToolTipIcon.Warning);
                    _config.Update(x => x.StartWithWindows = _autostartState);
                }
            }, null);
        };

        hub.GameChanged += game =>
        {
            if (game != null && _config.Current.AutoOpenWidgetOnGame && !_config.Current.Widget.Visible)
                _ui.Post(_ => Toggle(c => c.Widget.Visible = true), null);
        };

        hub.QuitRequested += () => _ui.Post(_ => ExitThread(), null);
        UpdateTray.Attach(_tray, _ui, hub.Updater, ExitThread, OpenSettings);

        // Alerta de vermelho: balão da bandeja (o Windows 10/11 mostra como notificação). Sem dependência nova.
        hub.AlertRaised += (title, text) => _ui.Post(_ =>
        {
            _tray.ShowBalloonTip(8000, title, text, ToolTipIcon.Warning);
            if (_config.Current.Alerts.Sound) System.Media.SystemSounds.Exclamation.Play();
        }, null);
        // Clicar no balão (alerta ou relatório de crash) abre as configurações
        _tray.BalloonTipClicked += (_, _) => OpenSettings();

        // Relatório de crash: a detecção roda em segundo plano e pode terminar antes ou depois daqui
        hub.CrashReportDetected += r => _ui.Post(_ => ShowCrashBalloon(r), null);
        if (hub.PendingCrashReport is { } pending) ShowCrashBalloon(pending);

        // Sincroniza a flag com o Agendador (pode ter sido removida por fora)
        _autostartState = Autostart.IsEnabled();
        if (_autostartState != config.Current.StartWithWindows) config.Update(c => c.StartWithWindows = _autostartState);

        if (config.Current.Widget.Visible) _widget.Show();
        else _widget.CreateControl();
    }

    void BuildMenu(ContextMenuStrip menu)
    {
        var c = _config.Current;
        menu.Items.Clear();

        var game = _hub.CurrentGame;
        menu.Items.Add(new ToolStripMenuItem(game != null ? L.T($"Jogo: {game.Exe} ({game.Mode})", $"Game: {game.Exe} ({game.Mode})") : L.T("Nenhum jogo detectado", "No game detected")) { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());

        menu.Items.Add(new ToolStripMenuItem(L.T("Configurações…", "Settings…"), null, (_, _) => OpenSettings()) { Font = new Font(menu.Font, FontStyle.Bold) });
        menu.Items.Add(Check(L.T("Mostrar widget", "Show widget"), c.Widget.Visible, () => Toggle(x => x.Widget.Visible = !x.Widget.Visible)));
        menu.Items.Add(Check(L.T("Travar posição", "Lock position"), c.Widget.Locked, () => Toggle(x => x.Widget.Locked = !x.Widget.Locked)));
        menu.Items.Add(Check(L.T("Sempre no topo (exceto sobre tela cheia)", "Always on top (except over fullscreen)"), c.Widget.AlwaysOnTop, () => Toggle(x => x.Widget.AlwaysOnTop = !x.Widget.AlwaysOnTop)));

        var monitors = new ToolStripMenuItem(L.T("Monitor do widget", "Widget monitor"));
        var i = 1;
        foreach (var s in Screen.AllScreens)
        {
            var label = $"Monitor {i++} — {s.Bounds.Width}×{s.Bounds.Height}{(s.Primary ? L.T(" (principal)", " (primary)") : "")}{(s.Bounds.Height > s.Bounds.Width ? L.T(" · vertical", " · portrait") : "")}";
            var device = s.DeviceName;
            monitors.DropDownItems.Add(Check(label, Screen.FromControl(_widget).DeviceName == device,
                () => Toggle(x => { x.Widget.Monitor = device; x.Widget.X = 40; x.Widget.Y = 40; })));
        }
        menu.Items.Add(monitors);

        var layout = new ToolStripMenuItem(L.T("Layout do widget", "Widget layout"));
        layout.DropDownItems.Add(Check(L.T("Automático", "Automatic"), c.Widget.Layout == "auto", () => Toggle(x => x.Widget.Layout = "auto")));
        layout.DropDownItems.Add(Check(L.T("Completo", "Full"), c.Widget.Layout == "full", () => Toggle(x => x.Widget.Layout = "full")));
        layout.DropDownItems.Add(Check(L.T("Médio", "Medium"), c.Widget.Layout == "mid", () => Toggle(x => x.Widget.Layout = "mid")));
        layout.DropDownItems.Add(Check(L.T("Compacto", "Compact"), c.Widget.Layout == "compact", () => Toggle(x => x.Widget.Layout = "compact")));
        layout.DropDownItems.Add(new ToolStripSeparator());
        layout.DropDownItems.Add(L.T("Compacto no canto superior direito", "Compact in the top-right corner"), null, (_, _) => _widget.PlaceTopRight("compact"));
        layout.DropDownItems.Add(L.T("Médio no canto superior direito", "Medium in the top-right corner"), null, (_, _) => _widget.PlaceTopRight("mid"));
        menu.Items.Add(layout);

        var theme = new ToolStripMenuItem(L.T("Aparência", "Appearance"));
        theme.DropDownItems.Add(Check(L.T("Escuro", "Dark"), c.ThemeMode == "dark", () => Toggle(x => x.ThemeMode = "dark")));
        theme.DropDownItems.Add(Check(L.T("Claro", "Light"), c.ThemeMode == "light", () => Toggle(x => x.ThemeMode = "light")));
        menu.Items.Add(theme);

        var rate = new ToolStripMenuItem(L.T("Taxa de atualização", "Refresh rate"));
        foreach (var ms in new[] { 250, 500, 1000, 2000 })
            rate.DropDownItems.Add(Check($"{ms} ms", c.RefreshMs == ms, () => Toggle(x => x.RefreshMs = ms)));
        menu.Items.Add(rate);

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Check(
            c.GpuTuning.OnlyInGames ? L.T("Ajuste da GPU (undervolt) · só em jogos", "GPU tuning (undervolt) · games only") : L.T("Ajuste da GPU (undervolt) · sempre", "GPU tuning (undervolt) · always"),
            c.GpuTuning.Enabled, () => Toggle(x => x.GpuTuning.Enabled = !x.GpuTuning.Enabled)));
        menu.Items.Add(Check(L.T("Abrir widget ao detectar jogo", "Open widget when a game is detected"), c.AutoOpenWidgetOnGame, () => Toggle(x => x.AutoOpenWidgetOnGame = !x.AutoOpenWidgetOnGame)));
        menu.Items.Add(Check(L.T("Iniciar com o Windows", "Start with Windows"), c.StartWithWindows, ToggleAutostart));

        var log = new ToolStripMenuItem("Log CSV");
        log.DropDownItems.Add(Check(L.T("Gravar log", "Write log"), c.Log.Enabled, () => Toggle(x => x.Log.Enabled = !x.Log.Enabled)));
        log.DropDownItems.Add(L.T("Abrir pasta de logs", "Open log folder"), null, (_, _) =>
        {
            Directory.CreateDirectory(_config.Current.Log.Folder);
            Process.Start("explorer.exe", _config.Current.Log.Folder);
        });
        menu.Items.Add(log);

        menu.Items.Add(L.T("Listar sensores detectados…", "List detected sensors…"), null, (_, _) =>
        {
            var path = Path.Combine(ConfigStore.Dir, "sensores.txt");
            File.WriteAllText(path, _dumpSensors());
            Process.Start("notepad.exe", path);
        });

        menu.Items.Add(UpdateTray.MenuItem(_hub.Updater));

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(L.T("Sair", "Exit"), null, (_, _) => ExitThread());
    }

    bool _crashShown;

    void ShowCrashBalloon(Games.CrashReport r)
    {
        if (_crashShown) return;
        _crashShown = true;
        var when = r.Time.ToString("g");
        var text = r.Reason == "kernelPower41"
            ? L.T($"O Windows registrou um desligamento inesperado (Kernel-Power 41) depois de {r.Session.Exe}. Clique para ver o relatório.",
                  $"Windows logged an unexpected shutdown (Kernel-Power 41) after {r.Session.Exe}. Click to see the report.")
            : L.T($"O PC desligou ou travou durante {r.Session.Exe} ({when}). Clique para ver os últimos 60 s.",
                  $"The PC shut down or froze during {r.Session.Exe} ({when}). Click to see the last 60 s.");
        _tray.ShowBalloonTip(10000, L.T("Pitwall · relatório de crash", "Pitwall · crash report"), text, ToolTipIcon.Warning);
    }

    void ToggleAutostart() => Toggle(c => c.StartWithWindows = !c.StartWithWindows);

    void OpenSettings()
    {
        if (_settings is { IsDisposed: false })
        {
            if (_settings.WindowState == FormWindowState.Minimized) _settings.WindowState = FormWindowState.Normal;
            _settings.Activate();
            return;
        }
        _settings = new SettingsForm(_config, _hub.Port, () => _hub.LogPath);
        _settings.ShowWidgetRequested += () => Toggle(c => c.Widget.Visible = true);
        // Fechar a janela libera o WebView2 dela (a RAM volta ao nível do widget sozinho)
        _settings.FormClosed += (_, _) => _settings = null;
        _settings.Show();
    }

    void Toggle(Action<AppConfig> change) => _config.Update(change);

    static ToolStripMenuItem Check(string text, bool on, Action click)
    {
        var item = new ToolStripMenuItem(text) { Checked = on };
        item.Click += (_, _) => click();
        return item;
    }

    protected override void ExitThreadCore()
    {
        _tray.Visible = false;
        _tray.Dispose();
        _widget.Dispose();
        base.ExitThreadCore();
    }
}
