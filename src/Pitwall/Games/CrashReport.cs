using System.Diagnostics.Eventing.Reader;
using System.Text.Json;
using Pitwall.Config;

namespace Pitwall.Games;

/// <summary>Últimos 60 s das métricas-chave, gravados em disco durante o jogo (sobrevive a um desligamento).</summary>
public sealed class CrashRingFile
{
    public string Exe { get; set; } = "";
    public DateTime SessionStart { get; set; }
    /// <summary>Hora da última gravação (≈ hora do crash, com até ~5 s de erro).</summary>
    public DateTime SavedAt { get; set; }
    public int IntervalMs { get; set; } = 1000;
    /// <summary>Série por métrica, da mais antiga para a mais nova; null = sem leitura naquele segundo.</summary>
    public Dictionary<string, double?[]> Series { get; set; } = [];
    public string? CsvFile { get; set; }
}

/// <summary>Exposto no catálogo quando a última sessão não terminou ou houve Kernel-Power 41 depois dela.</summary>
public sealed class CrashReport
{
    /// <summary>unfinishedSession | kernelPower41 | both</summary>
    public string Reason { get; set; } = "";
    public GameSession Session { get; set; } = new();
    /// <summary>Hora estimada do crash: última gravação do buffer, senão o evento Kernel-Power, senão o início da sessão.</summary>
    public DateTime Time { get; set; }
    public DateTime? KernelPowerTime { get; set; }
    public int IntervalMs { get; set; } = 1000;
    /// <summary>Últimos ~60 s antes do crash (só quando a sessão não terminou e o buffer é dela).</summary>
    public Dictionary<string, double?[]>? Series { get; set; }
    public string? CsvFile { get; set; }
}

/// <summary>
/// Buffer circular de 60 s (1 amostra/s) de GPU temp, hot spot, consumo, clock, FPS e CPU temp.
/// Durante o jogo vai para %LOCALAPPDATA%\Pitwall\crash-ring.json a cada ~5 s, com escrita atômica
/// (arquivo temporário gravado direto no disco + rename).
/// </summary>
public sealed class CrashRing
{
    public static readonly string[] Ids = ["gpu.temp", "gpu.hotspot", "gpu.power", "gpu.clock", "fps.current", "cpu.temp"];
    const int Points = 60;
    const long SampleMs = 1_000, PersistMs = 5_000;

    public static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pitwall");
    public static readonly string FilePath = Path.Combine(Dir, "crash-ring.json");

    readonly double?[][] _data = Ids.Select(_ => new double?[Points]).ToArray();
    int _head, _count;
    long _lastSample, _lastPersist;

    public void Reset()
    {
        _head = _count = 0;
        _lastSample = _lastPersist = 0;
        foreach (var s in _data) Array.Clear(s);
    }

    public void Sample(IReadOnlyDictionary<string, double?> values, long nowMs)
    {
        if (_lastSample != 0 && nowMs - _lastSample < SampleMs - 50) return;
        _lastSample = nowMs;
        for (int i = 0; i < Ids.Length; i++)
            _data[i][_head] = values.TryGetValue(Ids[i], out var v) && v is { } d && double.IsFinite(d) ? Math.Round(d, 1) : null;
        _head = (_head + 1) % Points;
        if (_count < Points) _count++;
    }

    public Dictionary<string, double?[]> Series()
    {
        var result = new Dictionary<string, double?[]>();
        for (int i = 0; i < Ids.Length; i++)
        {
            var arr = new double?[_count];
            for (int k = 0; k < _count; k++) arr[k] = _data[i][(_head - _count + k + Points) % Points];
            result[Ids[i]] = arr;
        }
        return result;
    }

    /// <summary>Grava se passaram ~5 s desde a última vez.</summary>
    public void PersistIfDue(GameSession session, string? csvFile, long nowMs)
    {
        if (nowMs - _lastPersist < PersistMs) return;
        _lastPersist = nowMs;
        var file = new CrashRingFile
        {
            Exe = session.Exe,
            SessionStart = session.Start,
            SavedAt = DateTime.Now,
            IntervalMs = (int)SampleMs,
            Series = Series(),
            CsvFile = csvFile,
        };
        try
        {
            Directory.CreateDirectory(Dir);
            var tmp = FilePath + ".tmp";
            using (var fs = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
            {
                JsonSerializer.Serialize(fs, file, Compact);
                fs.Flush(flushToDisk: true);
            }
            File.Move(tmp, FilePath, overwrite: true);
        }
        catch { } // não é crítico
    }

    internal static readonly JsonSerializerOptions Compact = new(ConfigStore.Json) { WriteIndented = false };

    public static CrashRingFile? Load()
    {
        try
        {
            return File.Exists(FilePath) ? JsonSerializer.Deserialize<CrashRingFile>(File.ReadAllText(FilePath), Compact) : null;
        }
        catch { return null; }
    }
}

/// <summary>Decide se há relatório de crash ao abrir o app.</summary>
public static class CrashDetector
{
    static readonly string StatePath = Path.Combine(CrashRing.Dir, "crash-state.json");

    /// <summary>
    /// Regra (pura, testável): há relatório se a última sessão não terminou, ou se houve Kernel-Power 41 depois do
    /// início dela — e o usuário ainda não dispensou o relatório dessa sessão.
    /// </summary>
    public static CrashReport? Detect(GameSession? last, CrashRingFile? ring, DateTime? kernelPower41, DateTime? dismissedSessionStart)
    {
        if (last == null) return null;
        if (dismissedSessionStart is { } d && Math.Abs((d - last.Start).TotalSeconds) < 1) return null;
        var unfinished = last.End == null;
        var kp = kernelPower41 is { } k && k >= last.Start ? kernelPower41 : null;
        if (!unfinished && kp == null) return null;

        var ringMatches = ring != null && unfinished
            && string.Equals(ring.Exe, last.Exe, StringComparison.OrdinalIgnoreCase)
            && Math.Abs((ring.SessionStart - last.Start).TotalSeconds) < 1;
        return new CrashReport
        {
            Reason = unfinished && kp != null ? "both" : unfinished ? "unfinishedSession" : "kernelPower41",
            Session = last,
            Time = ringMatches ? ring!.SavedAt : kp ?? last.Start,
            KernelPowerTime = kp,
            IntervalMs = ringMatches ? ring!.IntervalMs : 1000,
            Series = ringMatches ? ring!.Series : null,
            CsvFile = last.CsvFile ?? (ringMatches ? ring!.CsvFile : null),
        };
    }

    /// <summary>Evento mais recente Kernel-Power 41 ("o sistema reiniciou sem desligar corretamente") desde <paramref name="since"/>.</summary>
    public static DateTime? LastKernelPower41(DateTime since)
    {
        try
        {
            var utc = since.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ");
            var query = new EventLogQuery("System", PathType.LogName,
                $"*[System[Provider[@Name='Microsoft-Windows-Kernel-Power'] and (EventID=41) and TimeCreated[@SystemTime>='{utc}']]]")
            { ReverseDirection = true };
            using var reader = new EventLogReader(query);
            using var ev = reader.ReadEvent();
            return ev?.TimeCreated;
        }
        catch { return null; }
    }

    public static DateTime? DismissedSessionStart()
    {
        try
        {
            if (!File.Exists(StatePath)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(StatePath));
            return doc.RootElement.GetProperty("dismissedSessionStart").GetDateTime();
        }
        catch { return null; }
    }

    public static void Dismiss(DateTime sessionStart)
    {
        try
        {
            Directory.CreateDirectory(CrashRing.Dir);
            File.WriteAllText(StatePath, JsonSerializer.Serialize(new { dismissedSessionStart = sessionStart }));
        }
        catch { }
    }
}
