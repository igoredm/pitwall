using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Pitwall.Native;

namespace Pitwall.Battery;

public sealed record WirelessDevice(
    string Key,
    string Name,
    string Via,
    string Kind,
    int? Percent,
    string? LevelText,
    bool Charging,
    bool Asleep,
    bool Connected);

/// <summary>
/// Bateria de mouse/headset/teclado/controle sem fio via Battery Hub (ex-WirelessBattery, GPL-3.0, krisgfx9), que roda
/// como programa separado: "BatteryHub.exe --json" a cada minuto (mesmo intervalo do app original).
/// Ele fala direto com os dispositivos por HID/Bluetooth; sem software do fabricante. O HeadsetControl ao lado
/// amplia os headsets suportados.
/// </summary>
public sealed partial class BatteryService : IDisposable
{
    readonly string _exe = Path.Combine(AppContext.BaseDirectory, "tools", "battery", "BatteryHub.exe");
    readonly JobObject _job = new();
    readonly CancellationTokenSource _cts = new();
    readonly AutoResetEvent _refresh = new(false);
    volatile IReadOnlyList<WirelessDevice> _devices = [];
    Func<bool> _enabled = () => true;

    public bool Available => File.Exists(_exe);
    public IReadOnlyList<WirelessDevice> Devices => _devices;
    public DateTime? LastPoll { get; private set; }
    public event Action? Updated;

    public void Start(Func<bool> enabled)
    {
        _enabled = enabled;
        if (!Available) return;
        KillOrphans();
        new Thread(Loop) { IsBackground = true, Name = "Battery", Priority = ThreadPriority.Lowest }.Start();
    }

    /// <summary>Atualiza agora (botão na configuração, ou quando o recurso é ligado).</summary>
    public void RefreshNow() => _refresh.Set();

    void Loop()
    {
        while (!_cts.IsCancellationRequested)
        {
            if (_enabled())
            {
                try { Poll(); }
                catch { /* tenta de novo no próximo ciclo */ }
            }
            else if (_devices.Count > 0)
            {
                _devices = [];
                Updated?.Invoke();
            }
            WaitHandle.WaitAny([_cts.Token.WaitHandle, _refresh], TimeSpan.FromSeconds(60));
        }
    }

    /// <summary>
    /// Leitores que sobraram de uma execução anterior (ex.: o Pitwall foi fechado à força no meio de uma leitura):
    /// ficam presos segurando o exe, e uma atualização não consegue substituí-lo. Só os desta pasta.
    /// </summary>
    void KillOrphans()
    {
        var dir = Path.GetDirectoryName(_exe)!;
        foreach (var name in new[] { "BatteryHub", "WirelessBattery", "headsetcontrol" })
            foreach (var p in Process.GetProcessesByName(name))
                using (p)
                    try
                    {
                        if (p.MainModule?.FileName is { } f && f.StartsWith(dir, StringComparison.OrdinalIgnoreCase)) p.Kill();
                    }
                    catch { }
    }

    void Poll()
    {
        using var p = Process.Start(new ProcessStartInfo(_exe, "--json")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            StandardOutputEncoding = Encoding.UTF8,
            WorkingDirectory = Path.GetDirectoryName(_exe)!,
        })!;
        _job.Assign(p);
        try { p.PriorityClass = ProcessPriorityClass.BelowNormal; } catch { }
        var output = p.StandardOutput.ReadToEndAsync();
        if (!p.WaitForExit(20_000))
        {
            // Árvore inteira: o Battery Hub pode ter aberto o headsetcontrol
            try { p.Kill(entireProcessTree: true); } catch { }
            return;
        }
        _devices = Parse(output.Result);
        LastPoll = DateTime.Now;
        Updated?.Invoke();
    }

    /// <summary>
    /// "--json" (src/json_output.h do Battery Hub): um array, campos estáveis segundo o upstream:
    /// key, name, via, kind (mouse|headset|keyboard|gamepad|phone|other), percent (-1 = sem %), level (texto quando o
    /// aparelho não dá %), detail, charging, asleep, connected, millivolts, graceSec.
    /// </summary>
    public static IReadOnlyList<WirelessDevice> Parse(string json)
    {
        var list = new List<WirelessDevice>();
        var start = json.IndexOf('[');
        if (start < 0) return list;
        using var doc = JsonDocument.Parse(json.AsMemory(start));
        if (doc.RootElement.ValueKind != JsonValueKind.Array) return list;
        foreach (var e in doc.RootElement.EnumerateArray())
        {
            if (e.ValueKind != JsonValueKind.Object) continue;
            var name = Str(e, "name");
            var key = Str(e, "key");
            if (name.Length == 0 || key.Length == 0) continue;
            var pct = e.TryGetProperty("percent", out var p) && p.TryGetInt32(out var n) && n is >= 0 and <= 100 ? n : (int?)null;
            var level = Str(e, "level");
            var kind = Str(e, "kind");
            if (kind is not ("mouse" or "headset" or "keyboard" or "gamepad" or "phone")) kind = GuessKind(name);
            list.Add(new WirelessDevice(key, name, Str(e, "via"), kind, pct, level.Length > 0 ? level : null,
                Bool(e, "charging"), Bool(e, "asleep"), !e.TryGetProperty("connected", out var c) || c.ValueKind != JsonValueKind.False));
        }
        return list;
    }

    static string Str(JsonElement e, string name) =>
        e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()!.Trim() : "";

    static bool Bool(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;

    /// <summary>Quando o Battery Hub diz "other": adivinha pelo nome, como o próprio app fazia.</summary>
    static string GuessKind(string name)
    {
        var n = name.ToLowerInvariant();
        if (HeadsetRegex().IsMatch(n)) return "headset";
        if (PadRegex().IsMatch(n)) return "gamepad";
        if (KeyboardRegex().IsMatch(n)) return "keyboard";
        if (n.Contains("phone") || n.Contains("galaxy s") || n.Contains("iphone")) return "phone";
        return "mouse";
    }

    [GeneratedRegex(@"headset|headphone|head set|buds|airpods|cloud|arctis|kraken|blackshark|barracuda|nari|astro|a50|jabra|quantum|inzone|virtuoso|void|hs\d|g\d{3}x?\b.*(?:headset|lightspeed)|pulse|wh-|wf-|earbud|fone")]
    private static partial Regex HeadsetRegex();
    [GeneratedRegex(@"controller|gamepad|dualsense|dualshock|xbox|8bitdo|switch pro|gamesir|flydigi|joy-?con|pro controller")]
    private static partial Regex PadRegex();
    [GeneratedRegex(@"keyboard|teclado|keychron|\bkb\b|tkl|k\d{2,3}\b")]
    private static partial Regex KeyboardRegex();

    public void Dispose()
    {
        _cts.Cancel();
        _job.Dispose();
    }
}
