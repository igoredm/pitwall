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
        Text = "Pitwall — Configurações";
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
        _core.Navigate(WebViewHost.Url(_port, "settings"));
    }

    void ApplyTheme(AppConfig c)
    {
        var bg = Theme.Background(c, c.AppTheme);
        BackColor = bg;
        _web.DefaultBackgroundColor = bg;
        if (IsHandleCreated)
        {
            // Barra de título escura/clara conforme o tema do app
            int dark = Theme.IsDark(c, c.AppTheme) ? 1 : 0;
            DwmSetWindowAttribute(Handle, 20, ref dark, sizeof(int));
            var colorRef = bg.R | (bg.G << 8) | (bg.B << 16);
            DwmSetWindowAttribute(Handle, 35, ref colorRef, sizeof(int)); // DWMWA_CAPTION_COLOR (Win11)
        }
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
                        Description = "Pasta do log CSV",
                        UseDescriptionForTitle = true,
                        InitialDirectory = _config.Current.Log.Folder,
                    };
                    if (dlg.ShowDialog(this) == DialogResult.OK)
                        Reply(new { type = "folderPicked", path = dlg.SelectedPath });
                    break;
                }
                case "pickExe":
                {
                    using var dlg = new OpenFileDialog { Filter = "Executáveis (*.exe)|*.exe", Title = "Escolher executável" };
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
                    if (_logPath() is { } path && File.Exists(path)) Process.Start("explorer.exe", $"/select,\"{path}\"");
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
