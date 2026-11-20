using Pitwall.Localization;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Pitwall.Config;

namespace Pitwall.Ui;

/// <summary>
/// Janela de configurações (Angular #/settings). A config em si vai pelo WebSocket;
/// aqui ficam só as coisas nativas: escolher pasta/exe, identificar monitores, abrir pasta de logs.
/// </summary>
public sealed partial class SettingsForm : Form
{
    readonly ConfigStore _config;
    readonly int _port;
    readonly Func<string?> _logPath;
    readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    CoreWebView2? _core;

    public event Action? ShowWidgetRequested;

    public SettingsForm(ConfigStore config, int port, Func<string?> logPath)
    {
        _config = config;
        _port = port;
        _logPath = logPath;
        Text = L.T("Pitwall — Configurações", "Pitwall — Settings");
        Icon = AppIcon.Large();
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(960, 640);
        Size = new Size(1200, 800);
        Controls.Add(_web);
        ApplyTheme(config.Current);
        config.Changed += OnConfigChanged;
    }

    void OnConfigChanged(AppConfig c)
    {
        if (IsHandleCreated && !IsDisposed) BeginInvoke(() => ApplyTheme(c));
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        _core = await WebViewHost.Init(_web, nonClientDrag: false);
        _core.WebMessageReceived += OnWebMessage;
        // Deep link (#/settings/<página>/<âncora>) e/ou "Rever tutorial" com a janela recém-aberta: vão na URL,
        // porque a página ainda não carregou para ouvir mensagens do host
        var route = "settings" + (_pendingPage != null ? "/" + _pendingPage + (_pendingAnchor != null ? "/" + _pendingAnchor : "") : "");
        _core.Navigate(WebViewHost.Url(_port, _tutorialOnLoad ? route + "?tutorial=1" : route));
        _tutorialOnLoad = false;
        _pendingPage = _pendingAnchor = null;
    }

    bool _tutorialOnLoad;
    string? _pendingPage, _pendingAnchor;

    /// <summary>Páginas das configurações que aceitam deep link (ids estáveis do frontend).</summary>
    public static readonly string[] Pages = ["overview", "monitor", "health", "widget", "appearance", "metrics", "alerts", "games", "sessions", "gpu", "devices", "phone", "features", "app"];

    /// <summary>
    /// Leva a página das configurações para <paramref name="page"/> (e rola até <paramref name="anchor"/>). Janela recém-criada:
    /// vai na URL; já aberta: mensagem do host { type: "navigate", page, anchor }. Página desconhecida = não faz nada.
    /// </summary>
    public void Navigate(string? page, string? anchor = null)
    {
        if (page == null || !Pages.Contains(page)) return;
        anchor = CleanAnchor(anchor);
        if (_core == null) (_pendingPage, _pendingAnchor) = (page, anchor);
        else Reply(anchor == null ? (object)new { type = "navigate", page } : new { type = "navigate", page, anchor });
    }

    /// <summary>Âncora vai crua na URL: só letras minúsculas, dígitos e hífen (até 40); outra coisa = sem âncora.</summary>
    internal static string? CleanAnchor(string? anchor) =>
        !string.IsNullOrEmpty(anchor) && anchor.Length <= 40 && anchor.All(ch => ch is (>= 'a' and <= 'z') or (>= '0' and <= '9') or '-')
            ? anchor : null;

    /// <summary>
    /// "Rever tutorial" (bandeja). Janela recém-criada: vai na URL (#/settings?tutorial=1), porque a página ainda não
    /// carregou para ouvir mensagens; janela já aberta: mensagem do host { type: "startTutorial" }.
    /// </summary>
    public void StartTutorial()
    {
        if (_core == null) _tutorialOnLoad = true;
        else Reply(new { type = "startTutorial" });
    }

    void ApplyTheme(AppConfig c)
    {
        // Visual único do app (1.0): só claro/escuro, por config.appearance (themeMode/appTheme são do widget)
        var isDark = Theme.AppIsDark(c);
        var bg = Theme.AppBackground(isDark);
        BackColor = bg;
        _web.DefaultBackgroundColor = bg;
        if (IsHandleCreated)
        {
            // Barra de título escura/clara conforme a aparência das configurações
            int dark = isDark ? 1 : 0;
            DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
            var colorRef = bg.R | (bg.G << 8) | (bg.B << 16);
            DwmSetWindowAttribute(Handle, 35, ref colorRef, sizeof(int)); // DWMWA_CAPTION_COLOR (Win11)
        }
    }

    /// <summary>Aparência "Sistema": o usuário trocou o tema de apps do Windows com a janela aberta → repinta a barra de título.</summary>
    protected override void WndProc(ref Message m)
    {
        const int WM_SETTINGCHANGE = 0x001A;
        if (m.Msg == WM_SETTINGCHANGE && _config.Current.Appearance == "system" && m.LParam != IntPtr.Zero
            && Marshal.PtrToStringUni(m.LParam) == "ImmersiveColorSet")
            ApplyTheme(_config.Current);
        base.WndProc(ref m);
    }

    protected override void OnHandleCreated(EventArgs e)
    {
        base.OnHandleCreated(e);
        ApplyTheme(_config.Current);
    }

    void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            var root = doc.RootElement;
            switch (root.GetProperty("type").GetString())
            {
                case "pickFolder":
                {
                    using var dlg = new FolderBrowserDialog
                    {
                        Description = L.T("Pasta do log CSV", "CSV log folder"),
                        UseDescriptionForTitle = true,
                        InitialDirectory = _config.Current.Log.Folder,
                    };
                    if (dlg.ShowDialog(this) == DialogResult.OK)
                        Reply(new { type = "folderPicked", path = dlg.SelectedPath });
                    break;
                }
                case "pickExe":
                {
                    using var dlg = new OpenFileDialog { Filter = L.T("Executáveis (*.exe)|*.exe", "Executables (*.exe)|*.exe"), Title = L.T("Escolher executável", "Choose executable") };
                    if (dlg.ShowDialog(this) == DialogResult.OK)
                        Reply(new { type = "exePicked", name = Path.GetFileName(dlg.FileName) });
                    break;
                }
                case "identifyMonitors":
                    MonitorBadge.ShowAll();
                    break;
                case "openLogFolder":
                    Directory.CreateDirectory(_config.Current.Log.Folder);
                    Process.Start("explorer.exe", _config.Current.Log.Folder);
                    break;
                case "openLogFile":
                {
                    // Com "file": só um nome de arquivo .csv dentro da pasta de logs (nada de caminhos vindos da página)
                    var path = _logPath();
                    if (root.TryGetProperty("file", out var f) && f.GetString() is { } name)
                        path = name == Path.GetFileName(name) && name.EndsWith(".csv", StringComparison.OrdinalIgnoreCase)
                            ? Path.Combine(_config.Current.Log.Folder, name) : null;
                    if (path != null && File.Exists(path)) Process.Start("explorer.exe", $"/select,\"{path}\"");
                    else
                    {
                        Directory.CreateDirectory(_config.Current.Log.Folder);
                        Process.Start("explorer.exe", _config.Current.Log.Folder);
                    }
                    break;
                }
                case "openLatestCsv":
                    Pitwall.Logging.LatestLog.Reveal(_config.Current.Log.Folder);
                    break;
                case "showWidget":
                    ShowWidgetRequested?.Invoke();
                    break;
            }
        }
        catch { }
    }

    void Reply(object msg) => _core?.PostWebMessageAsJson(JsonSerializer.Serialize(msg));

    protected override void OnFormClosed(FormClosedEventArgs e)
    {
        _config.Changed -= OnConfigChanged;
        base.OnFormClosed(e);
    }

    [LibraryImport("dwmapi.dll")]
    private static partial int DwmSetWindowAttribute(IntPtr hwnd, int attr, ref int value, int size);
}

/// <summary>Número grande em cada monitor por 2 s ("Identificar monitores").</summary>
internal sealed class MonitorBadge : Form
{
    public static void ShowAll()
    {
        var screens = Screen.AllScreens;
        for (int i = 0; i < screens.Length; i++)
        {
            var badge = new MonitorBadge(i + 1, screens[i]);
            badge.Show();
            var timer = new System.Windows.Forms.Timer { Interval = 2000 };
            timer.Tick += (_, _) => { timer.Dispose(); badge.Close(); };
            timer.Start();
        }
    }

    readonly int _number;

    MonitorBadge(int number, Screen screen)
    {
        _number = number;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = Color.FromArgb(0x0A, 0x0D, 0x13);
        var size = 220;
        Bounds = new Rectangle(screen.Bounds.X + 40, screen.Bounds.Y + 40, size, size);
        DoubleBuffered = true;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        e.Graphics.TextRenderingHint = System.Drawing.Text.TextRenderingHint.AntiAliasGridFit;
        using var font = new Font("Segoe UI Light", 110);
        using var brush = new SolidBrush(Color.White);
        var sf = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center };
        e.Graphics.DrawString(_number.ToString(), font, brush, ClientRectangle, sf);
        using var pen = new Pen(Color.FromArgb(0x4C, 0x8D, 0xFF), 6);
        e.Graphics.DrawRectangle(pen, 3, 3, Width - 6, Height - 6);
    }

    protected override bool ShowWithoutActivation => true;
}
