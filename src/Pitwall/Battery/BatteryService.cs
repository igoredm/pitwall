using System.Diagnostics;
using System.Text;
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
/// Bateria de mouse/headset/teclado/controle sem fio via WirelessBattery (GPL-3.0, krisgfx9), que roda como
/// programa separado: "WirelessBattery.exe --list" a cada minuto (mesmo intervalo do app original).
/// Ele fala direto com os dispositivos por HID/Bluetooth; sem software do fabricante. O HeadsetControl ao lado
/// amplia os headsets suportados.
/// </summary>
public sealed partial class BatteryService : IDisposable
{
    readonly string _exe = Path.Combine(AppContext.BaseDirectory, "tools", "battery", "WirelessBattery.exe");
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

    void Poll()
    {
        using var p = Process.Start(new ProcessStartInfo(_exe, "--list")
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
            try { p.Kill(); } catch { }
            return;
        }
        _devices = Parse(output.Result);
        LastPoll = DateTime.Now;
        Updated?.Invoke();
    }

    /// <summary>
    /// Formato de uma linha (src/main.cpp ListToConsole):
    /// "{name}  [{via}]  [{{Marca}}  ]{NN% | asleep | off / not connected | unknown | texto}[ ({detail})][, charging][, N mV]   ({key})"
    /// </summary>
    public static IReadOnlyList<WirelessDevice> Parse(string text)
    {
        var list = new List<WirelessDevice>();
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.TrimEnd('\r');
            var m = LineRegex().Match(line);
            if (!m.Success) continue;
            var name = m.Groups["name"].Value.Trim();
            var status = m.Groups["status"].Value;
            var charging = status.Contains(", charging");
            status = MvRegex().Replace(status.Replace(", charging", ""), "");
            status = DetailRegex().Replace(status, "").Trim();

            int? pct = null;
            string? level = null;
            bool asleep = false, connected = true;
            var pm = PctRegex().Match(status);
            if (pm.Success) pct = int.Parse(pm.Groups[1].Value);
            else if (status == "asleep") asleep = true;
            else if (status.StartsWith("off")) connected = false;
            else if (status != "unknown") level = status;

            list.Add(new WirelessDevice(m.Groups["key"].Value, name, m.Groups["via"].Value, GuessKind(name),
                pct, level, charging, asleep, connected));
        }
        return list;
    }

    /// <summary>O --list não diz o tipo; o próprio app adivinha pelo nome (GuessKind). Mesma ideia aqui.</summary>
    static string GuessKind(string name)
    {
        var n = name.ToLowerInvariant();
        if (HeadsetRegex().IsMatch(n)) return "headset";
        if (PadRegex().IsMatch(n)) return "gamepad";
        if (KeyboardRegex().IsMatch(n)) return "keyboard";
        if (n.Contains("phone") || n.Contains("galaxy s") || n.Contains("iphone")) return "phone";
        return "mouse";
    }

    [GeneratedRegex(@"^(?<name>.+?)  \[(?<via>[^\]]*)\]  (?:\{(?<brand>[^}]*)\}  )?(?<status>.+?)   \((?<key>[^)]*)\)\s*$")]
    private static partial Regex LineRegex();
    [GeneratedRegex(@"^(\d{1,3})%")]
    private static partial Regex PctRegex();
    [GeneratedRegex(@", \d+ mV")]
    private static partial Regex MvRegex();
    [GeneratedRegex(@" \(.*\)$")]
    private static partial Regex DetailRegex();
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
