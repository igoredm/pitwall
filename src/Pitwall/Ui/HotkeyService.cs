using System.Runtime.InteropServices;
using Pitwall.Config;

namespace Pitwall.Ui;

/// <summary>Estado de um atalho (catalog.hotkeys): ok | inUse | invalid | off.</summary>
public static class HotkeyState
{
    public const string Ok = "ok", InUse = "inUse", Invalid = "invalid", Off = "off";
}

/// <summary>Leitor do texto do atalho: "Ctrl+Alt+Shift+Win+Tecla" (A–Z, 0–9, F1–F24). Regra pura, testável.</summary>
public static class HotkeyParser
{
    public const uint ModAlt = 0x1, ModControl = 0x2, ModShift = 0x4, ModWin = 0x8;

    /// <returns><see cref="HotkeyState.Off"/> (vazio), <see cref="HotkeyState.Invalid"/> ou <see cref="HotkeyState.Ok"/>.</returns>
    /// <remarks>
    /// Sem diferenciar maiúsculas; aceita espaços e "Control"/"Windows". Letras e números precisam de pelo menos um
    /// modificador (senão a tecla deixaria de funcionar para digitar); F1–F24 podem ir sozinhas.
    /// </remarks>
    public static string Parse(string? text, out uint modifiers, out uint vk)
    {
        modifiers = 0;
        vk = 0;
        if (string.IsNullOrWhiteSpace(text)) return HotkeyState.Off;
        var parts = text.Split('+', StringSplitOptions.TrimEntries);
        for (int i = 0; i < parts.Length; i++)
        {
            var p = parts[i];
            if (p.Length == 0) return HotkeyState.Invalid;
            var last = i == parts.Length - 1;
            uint mod = p.ToUpperInvariant() switch
            {
                "CTRL" or "CONTROL" => ModControl,
                "ALT" => ModAlt,
                "SHIFT" => ModShift,
                "WIN" or "WINDOWS" => ModWin,
                _ => 0,
            };
            if (mod != 0)
            {
                if (last) return HotkeyState.Invalid; // só modificadores
                modifiers |= mod;
                continue;
            }
            if (!last || !TryKey(p, out vk)) { vk = 0; modifiers = 0; return HotkeyState.Invalid; }
        }
        var isFKey = vk is >= 0x70 and <= 0x87;
        if (modifiers == 0 && !isFKey) { vk = 0; return HotkeyState.Invalid; }
        return HotkeyState.Ok;
    }

    static bool TryKey(string p, out uint vk)
    {
        vk = 0;
        var u = p.ToUpperInvariant();
        if (u.Length == 1 && u[0] is >= 'A' and <= 'Z' or >= '0' and <= '9')
        {
            vk = u[0]; // VK_A..VK_Z e VK_0..VK_9 = código ASCII
            return true;
        }
        if (u.Length is 2 or 3 && u[0] == 'F' && int.TryParse(u.AsSpan(1), out var n) && n is >= 1 and <= 24 && u[1] != '0')
        {
            vk = (uint)(0x70 + n - 1); // VK_F1 = 0x70
            return true;
        }
        return false;
    }
}

/// <summary>
/// 1.2: atalhos globais com RegisterHotKey numa janela só de mensagens (HWND_MESSAGE). Não é hook de teclado:
/// o Windows só avisa quando a combinação registrada é apertada. Criar e usar na thread da interface.
/// </summary>
public sealed class HotkeyService : NativeWindow, IDisposable
{
    const int WmHotkey = 0x0312;
    const uint ModNoRepeat = 0x4000;
    const int IdToggle = 1, IdMarker = 2, IdBenchmark = 3;

    [DllImport("user32.dll", SetLastError = true)] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint fsModifiers, uint vk);
    [DllImport("user32.dll", SetLastError = true)] static extern bool UnregisterHotKey(IntPtr hWnd, int id);

    readonly Action _toggleWidget;
    readonly Action _marker;
    readonly Action? _benchmark;
    string? _appliedKey;

    public string ToggleState { get; private set; } = HotkeyState.Off;
    public string MarkerState { get; private set; } = HotkeyState.Off;
    /// <summary>1.3: atalho do benchmark.</summary>
    public string BenchmarkState { get; private set; } = HotkeyState.Off;

    /// <summary>Estado mudou (para o catálogo).</summary>
    public event Action<string, string, string>? StatusChanged;

    public HotkeyService(Action toggleWidget, Action marker, Action? benchmark = null)
    {
        _toggleWidget = toggleWidget;
        _marker = marker;
        _benchmark = benchmark;
        CreateHandle(new CreateParams { Caption = "Pitwall hotkeys", Parent = new IntPtr(-3) }); // HWND_MESSAGE
    }

    /// <summary>Registra de novo se a config dos atalhos mudou (no-op se for igual à última aplicada).</summary>
    public void Apply(HotkeysConfig cfg)
    {
        var key = $"{cfg.Enabled}|{cfg.ToggleWidget}|{cfg.Marker}|{cfg.Benchmark}";
        if (key == _appliedKey || Handle == IntPtr.Zero) return;
        _appliedKey = key;
        UnregisterHotKey(Handle, IdToggle);
        UnregisterHotKey(Handle, IdMarker);
        UnregisterHotKey(Handle, IdBenchmark);
        ToggleState = cfg.Enabled ? Register(IdToggle, cfg.ToggleWidget) : HotkeyState.Off;
        MarkerState = cfg.Enabled ? Register(IdMarker, cfg.Marker) : HotkeyState.Off;
        BenchmarkState = cfg.Enabled && _benchmark != null ? Register(IdBenchmark, cfg.Benchmark) : HotkeyState.Off;
        StatusChanged?.Invoke(ToggleState, MarkerState, BenchmarkState);
    }

    string Register(int id, string? text)
    {
        var state = HotkeyParser.Parse(text, out var mods, out var vk);
        if (state != HotkeyState.Ok) return state;
        // Falha = outro programa (ou o outro atalho do Pitwall) já usa a combinação
        return RegisterHotKey(Handle, id, mods | ModNoRepeat, vk) ? HotkeyState.Ok : HotkeyState.InUse;
    }

    protected override void WndProc(ref Message m)
    {
        if (m.Msg == WmHotkey)
        {
            try
            {
                if ((int)m.WParam == IdToggle) _toggleWidget();
                else if ((int)m.WParam == IdMarker) _marker();
                else if ((int)m.WParam == IdBenchmark) _benchmark?.Invoke();
            }
            catch { }
            return;
        }
        base.WndProc(ref m);
    }

    public void Dispose()
    {
        if (Handle != IntPtr.Zero)
        {
            UnregisterHotKey(Handle, IdToggle);
            UnregisterHotKey(Handle, IdMarker);
            UnregisterHotKey(Handle, IdBenchmark);
            DestroyHandle();
        }
    }
}
