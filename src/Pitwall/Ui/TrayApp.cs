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
                    _tray.ShowBalloonTip(4000, "Pitwall", "Não foi possível alterar o início automático.", ToolTipIcon.Warning);
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
        menu.Items.Add(new ToolStripMenuItem(game != null ? $"Jogo: {game.Exe} ({game.Mode})" : "Nenhum jogo detectado") { Enabled = false });
        menu.Items.Add(new ToolStripSeparator());

        menu.Items.Add(new ToolStripMenuItem("Configurações…", null, (_, _) => OpenSettings()) { Font = new Font(menu.Font, FontStyle.Bold) });
        menu.Items.Add(Check("Mostrar widget", c.Widget.Visible, () => Toggle(x => x.Widget.Visible = !x.Widget.Visible)));
        menu.Items.Add(Check("Travar posição", c.Widget.Locked, () => Toggle(x => x.Widget.Locked = !x.Widget.Locked)));
        menu.Items.Add(Check("Sempre no topo (exceto sobre tela cheia)", c.Widget.AlwaysOnTop, () => Toggle(x => x.Widget.AlwaysOnTop = !x.Widget.AlwaysOnTop)));

        var monitors = new ToolStripMenuItem("Monitor do widget");
        var i = 1;
        foreach (var s in Screen.AllScreens)
        {
            var label = $"Monitor {i++} — {s.Bounds.Width}×{s.Bounds.Height}{(s.Primary ? " (principal)" : "")}{(s.Bounds.Height > s.Bounds.Width ? " · vertical" : "")}";
            var device = s.DeviceName;
            monitors.DropDownItems.Add(Check(label, Screen.FromControl(_widget).DeviceName == device,
                () => Toggle(x => { x.Widget.Monitor = device; x.Widget.X = 40; x.Widget.Y = 40; })));
        }
        menu.Items.Add(monitors);

        var layout = new ToolStripMenuItem("Layout do widget");
        layout.DropDownItems.Add(Check("Automático", c.Widget.Layout == "auto", () => Toggle(x => x.Widget.Layout = "auto")));
        layout.DropDownItems.Add(Check("Completo", c.Widget.Layout == "full", () => Toggle(x => x.Widget.Layout = "full")));
        layout.DropDownItems.Add(Check("Médio", c.Widget.Layout == "mid", () => Toggle(x => x.Widget.Layout = "mid")));
        layout.DropDownItems.Add(Check("Compacto", c.Widget.Layout == "compact", () => Toggle(x => x.Widget.Layout = "compact")));
        layout.DropDownItems.Add(new ToolStripSeparator());
        layout.DropDownItems.Add("Compacto no canto superior direito", null, (_, _) => _widget.PlaceTopRight("compact"));
        layout.DropDownItems.Add("Médio no canto superior direito", null, (_, _) => _widget.PlaceTopRight("mid"));
        menu.Items.Add(layout);

        var theme = new ToolStripMenuItem("Aparência");
        theme.DropDownItems.Add(Check("Escuro", c.ThemeMode == "dark", () => Toggle(x => x.ThemeMode = "dark")));
        theme.DropDownItems.Add(Check("Claro", c.ThemeMode == "light", () => Toggle(x => x.ThemeMode = "light")));
        menu.Items.Add(theme);

        var rate = new ToolStripMenuItem("Taxa de atualização");
        foreach (var ms in new[] { 250, 500, 1000, 2000 })
            rate.DropDownItems.Add(Check($"{ms} ms", c.RefreshMs == ms, () => Toggle(x => x.RefreshMs = ms)));
        menu.Items.Add(rate);

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(Check(
            c.GpuTuning.OnlyInGames ? "Ajuste da GPU (undervolt) · só em jogos" : "Ajuste da GPU (undervolt) · sempre",
            c.GpuTuning.Enabled, () => Toggle(x => x.GpuTuning.Enabled = !x.GpuTuning.Enabled)));
        menu.Items.Add(Check("Abrir widget ao detectar jogo", c.AutoOpenWidgetOnGame, () => Toggle(x => x.AutoOpenWidgetOnGame = !x.AutoOpenWidgetOnGame)));
        menu.Items.Add(Check("Iniciar com o Windows", c.StartWithWindows, ToggleAutostart));

        var log = new ToolStripMenuItem("Log CSV");
        log.DropDownItems.Add(Check("Gravar log", c.Log.Enabled, () => Toggle(x => x.Log.Enabled = !x.Log.Enabled)));
        log.DropDownItems.Add("Abrir pasta de logs", null, (_, _) =>
        {
            Directory.CreateDirectory(_config.Current.Log.Folder);
            Process.Start("explorer.exe", _config.Current.Log.Folder);
        });
        menu.Items.Add(log);

        menu.Items.Add("Listar sensores detectados…", null, (_, _) =>
        {
            var path = Path.Combine(ConfigStore.Dir, "sensores.txt");
            File.WriteAllText(path, _dumpSensors());
            Process.Start("notepad.exe", path);
        });

        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Sair", null, (_, _) => ExitThread());
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
