using System.Diagnostics.Eventing.Reader;
using System.Text.Json;
using Pitwall.Health;

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
/// 1.2: o buffer em disco agora é o do Relatório do PC (Health/PcRing, 120 s, com ou sem jogo). O relatório de crash
/// do jogo continua com o mesmo formato: as 6 séries antigas e os últimos 60 s.
/// </summary>
public static class CrashRing
{
    public static readonly string[] Ids = ["gpu.temp", "gpu.hotspot", "gpu.power", "gpu.clock", "fps.current", "cpu.temp"];
    public const int Points = 60;
    /// <summary>%LOCALAPPDATA%Pitwall (pasta dos arquivos que sobrevivem a um desligamento).</summary>
    public static readonly string Dir = PcRing.Dir;

    /// <summary>pc-ring.json → formato antigo (só se a gravação era de um jogo).</summary>
    public static CrashRingFile? FromPcRing(PcRingFile? pc)
    {
        if (pc?.Exe == null || pc.SessionStart is not { } start) return null;
        return new CrashRingFile
        {
            Exe = pc.Exe,
            SessionStart = start,
            SavedAt = pc.SavedAt,
            IntervalMs = pc.IntervalMs,
            Series = Ids.Where(pc.Series.ContainsKey).ToDictionary(id => id, id => pc.Series[id].TakeLast(Points).ToArray()),
            CsvFile = pc.CsvFile,
        };
    }
}

/// <summary>Decide se há relatório de crash ao abrir o app.</summary>
public static class CrashDetector
{
    static readonly string StatePath = Path.Combine(PcRing.Dir, "crash-state.json");

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
            Directory.CreateDirectory(PcRing.Dir);
            File.WriteAllText(StatePath, JsonSerializer.Serialize(new { dismissedSessionStart = sessionStart }));
        }
        catch { }
    }
}
