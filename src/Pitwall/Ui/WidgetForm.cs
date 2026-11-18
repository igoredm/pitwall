using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using Pitwall.Config;
using Pitwall.Native;

namespace Pitwall.Ui;

/// <summary>
/// Janela do widget: sem bordas, WebView2, posicionada no monitor escolhido.
/// Arrastar = região "app-region: drag" do CSS; redimensionar = borda de 6 px do próprio form.
/// "Travar posição" desliga ambos. "Sempre no topo" cede quando há app em tela cheia no mesmo monitor.
/// </summary>
public sealed class WidgetForm : Form
{
    const int ResizeBorder = 6;
    const int WM_NCHITTEST = 0x84, WM_EXITSIZEMOVE = 0x232, WM_NCLBUTTONDBLCLK = 0xA3;
    const int HTCLIENT = 1, HTLEFT = 10, HTRIGHT = 11, HTTOP = 12, HTTOPLEFT = 13, HTTOPRIGHT = 14,
        HTBOTTOM = 15, HTBOTTOMLEFT = 16, HTBOTTOMRIGHT = 17;

    readonly ConfigStore _config;
    readonly int _port;
    readonly WebView2 _web = new() { Dock = DockStyle.Fill };
    readonly System.Windows.Forms.Timer _topmostTimer = new() { Interval = 1000 };

    /// <summary>Página → host "openSettings" (page/anchor opcionais).</summary>
    public event Action<string?, string?>? SettingsRequested;

    public WidgetForm(ConfigStore config, int port)
    {
        _config = config;
        _port = port;
        Text = "Pitwall";
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        MaximizeBox = false;
        MinimumSize = new Size(160, 140);
        Icon = AppIcon.Large();
        Controls.Add(_web);
        ApplyConfig(config.Current);
        PlaceOnMonitor(config.Current.Widget);

        config.Changed += c => BeginInvokeSafe(() => ApplyConfig(c));
        _topmostTimer.Tick += (_, _) => UpdateTopMost();
        _topmostTimer.Start();
    }

    protected override async void OnLoad(EventArgs e)
    {
        base.OnLoad(e);
        var core = await WebViewHost.Init(_web, nonClientDrag: true);
        core.WebMessageReceived += OnWebMessage;
        // O widget nunca é a janela "ativa": pede ao WebView2 para manter o consumo de memória baixo.
        core.MemoryUsageTargetLevel = CoreWebView2MemoryUsageTargetLevel.Low;
        core.Navigate(WebViewHost.Url(_port, "widget"));
    }

    void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            using var doc = JsonDocument.Parse(e.WebMessageAsJson);
            switch (doc.RootElement.GetProperty("type").GetString())
            {
                case "openSettings":
                    // page/anchor opcionais: abre direto numa página (o SettingsForm valida os dois)
                    SettingsRequested?.Invoke(Str(doc.RootElement, "page"), Str(doc.RootElement, "anchor"));
                    break;
                case "hide": _config.Update(c => c.Widget.Visible = false); break;
            }
        }
        catch { }
    }

    static string? Str(JsonElement root, string key) =>
        root.TryGetProperty(key, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    void ApplyConfig(AppConfig c)
    {
        BackColor = Theme.Background(c, c.WidgetTheme);
        _web.DefaultBackgroundColor = BackColor;
        Padding = c.Widget.Locked ? Padding.Empty : new Padding(ResizeBorder);
        if (!IsHandleCreated) return;
        UpdateTopMost();
        if (c.Widget.Visible && !Visible) Show();
        else if (!c.Widget.Visible && Visible) Hide();
        var target = FindScreen(c.Widget.Monitor);
        if (IsHandleCreated && Screen.FromControl(this).DeviceName != target.DeviceName) PlaceOnMonitor(c.Widget);
    }

    void UpdateTopMost()
    {
        var w = _config.Current.Widget;
        if (!w.AlwaysOnTop)
        {
            if (TopMost) TopMost = false;
            return;
        }
        // Não fica por cima de um app em tela cheia no mesmo monitor.
        var fg = Win32.GetForegroundWindow();
        var yield = fg != Handle && Win32.IsFullscreen(fg, out var mon) &&
                    mon == Win32.MonitorFromWindow(Handle, Win32.MONITOR_DEFAULTTONEAREST);
        if (TopMost == yield) TopMost = !yield;
    }

    static Screen FindScreen(string device) =>
        Screen.AllScreens.FirstOrDefault(s => s.DeviceName == device)
        ?? Screen.AllScreens.FirstOrDefault(s => !s.Primary)
        ?? Screen.PrimaryScreen!;

    void PlaceOnMonitor(WidgetWindowConfig w)
    {
        var screen = FindScreen(w.Monitor);
        var b = screen.Bounds;
        var width = Math.Clamp(w.Width, MinimumSize.Width, b.Width);
        var height = Math.Clamp(w.Height, MinimumSize.Height, b.Height);
        var x = Math.Clamp(b.X + w.X, b.X, b.Right - width);
        var y = Math.Clamp(b.Y + w.Y, b.Y, b.Bottom - height);
        Bounds = new Rectangle(x, y, width, height);
    }

    /// <summary>
    /// Widget no canto superior direito do monitor escolhido: "compact" = 260×180, "mid" = 300×300 (pixels lógicos).
    /// </summary>
    public void PlaceTopRight(string layout)
    {
        var screen = FindScreen(_config.Current.Widget.Monitor);
        var scale = DpiOf(screen) / 96.0;
        var (w, h) = layout == "compact" ? (260, 180) : (300, 300);
        var width = (int)Math.Round(w * scale);
        var height = (int)Math.Round(h * scale);
        var margin = (int)Math.Round(16 * scale);
        var wa = screen.WorkingArea; // respeita a barra de tarefas
        Bounds = new Rectangle(wa.Right - width - margin, wa.Top + margin, width, height);
        _config.Update(c => c.Widget.Layout = layout);
        SavePlacement();
        if (!Visible) _config.Update(c => c.Widget.Visible = true);
    }

    static uint DpiOf(Screen screen)
    {
        var hmon = MonitorFromPoint(new Point(screen.Bounds.X + 1, screen.Bounds.Y + 1), 2);
        return GetDpiForMonitor(hmon, 0, out var dpiX, out _) == 0 ? dpiX : 96;
    }

    [System.Runtime.InteropServices.DllImport("user32.dll")]
    static extern IntPtr MonitorFromPoint(Point pt, uint flags);

    [System.Runtime.InteropServices.DllImport("shcore.dll")]
    static extern int GetDpiForMonitor(IntPtr hmonitor, int dpiType, out uint dpiX, out uint dpiY);

    void SavePlacement()
    {
        var screen = Screen.FromControl(this);
        var b = Bounds;
        _config.Update(c =>
        {
            c.Widget.Monitor = screen.DeviceName;
            c.Widget.X = b.X - screen.Bounds.X;
            c.Widget.Y = b.Y - screen.Bounds.Y;
            c.Widget.Width = b.Width;
            c.Widget.Height = b.Height;
        });
    }

    protected override void WndProc(ref Message m)
    {
        switch (m.Msg)
        {
            case WM_NCHITTEST when !_config.Current.Widget.Locked:
                base.WndProc(ref m);
                var p = PointToClient(new Point(unchecked((short)(long)m.LParam), unchecked((short)((long)m.LParam >> 16))));
                bool l = p.X < ResizeBorder, r = p.X >= ClientSize.Width - ResizeBorder,
                     t = p.Y < ResizeBorder, btm = p.Y >= ClientSize.Height - ResizeBorder;
                var hit = (t, btm, l, r) switch
                {
                    (true, _, true, _) => HTTOPLEFT,
                    (true, _, _, true) => HTTOPRIGHT,
                    (_, true, true, _) => HTBOTTOMLEFT,
                    (_, true, _, true) => HTBOTTOMRIGHT,
                    (true, _, _, _) => HTTOP,
                    (_, true, _, _) => HTBOTTOM,
                    (_, _, true, _) => HTLEFT,
                    (_, _, _, true) => HTRIGHT,
                    _ => HTCLIENT,
                };
                m.Result = hit;
                return;
            case WM_NCLBUTTONDBLCLK:
                return; // sem maximizar por duplo clique na área de arrasto
            case WM_EXITSIZEMOVE:
                base.WndProc(ref m);
                SavePlacement();
                return;
        }
        base.WndProc(ref m);
    }

    protected override CreateParams CreateParams
    {
        get
        {
            var cp = base.CreateParams;
            cp.ExStyle |= 0x80; // WS_EX_TOOLWINDOW: fora do Alt+Tab
            return cp;
        }
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            _config.Update(c => c.Widget.Visible = false);
            return;
        }
        base.OnFormClosing(e);
    }

    void BeginInvokeSafe(Action a)
    {
        if (IsHandleCreated && !IsDisposed) BeginInvoke(a);
    }
}
