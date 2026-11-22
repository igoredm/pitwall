namespace Pitwall.Games;

/// <summary>1.3: um ponto da tendência = uma sessão.</summary>
public sealed class TrendPoint
{
    public DateTime Start { get; set; }
    public double DurationSec { get; set; }
    public double? AvgFps { get; set; }
    public double? Low1 { get; set; }
    public double? AvgGpuTemp { get; set; }
    public double? AvgHotspot { get; set; }
    public double? PeakHotspot { get; set; }
    public double? AvgGpuPower { get; set; }
    public int? Stutters { get; set; }
    public string? GpuDriver { get; set; }
    public double? EnergyWh { get; set; }
}

public sealed record TrendGame(string Exe, int Count, DateTime Last);

public sealed class Trend
{
    public string? Exe { get; set; }
    public List<TrendGame> Games { get; set; } = [];
    public List<TrendPoint> Points { get; set; } = [];
}

/// <summary>1.3: tendência por jogo (getTrend → trend). Regra pura, sobre o histórico de sessões.</summary>
public static class TrendBuilder
{
    public const double MinDurationSec = 120;
    public const int MinSessions = 2;

    /// <summary>Entra na tendência: ≥ 120 s e com FPS médio.</summary>
    public static bool Counts(GameSession s) => s.DurationSec >= MinDurationSec && s.AvgFps != null && !string.IsNullOrEmpty(s.Exe);

    /// <summary>
    /// <paramref name="sessions"/> = encerradas, em qualquer ordem. <c>games</c> = jogos com ≥ 2 sessões que contam
    /// (mais sessões primeiro; empate = jogado mais recentemente). <paramref name="exe"/> ausente = o primeiro de
    /// <c>games</c>. <c>points</c> = sessões do jogo que contam, da mais antiga para a mais nova.
    /// </summary>
    public static Trend Build(IEnumerable<GameSession> sessions, string? exe)
    {
        var counted = sessions.Where(Counts).ToList();
        var games = counted
            .GroupBy(s => s.Exe, StringComparer.OrdinalIgnoreCase)
            .Select(g => new TrendGame(g.OrderByDescending(s => s.Start).First().Exe, g.Count(), g.Max(s => s.Start)))
            .Where(g => g.Count >= MinSessions)
            .OrderByDescending(g => g.Count).ThenByDescending(g => g.Last)
            .ToList();
        exe = string.IsNullOrWhiteSpace(exe) ? games.FirstOrDefault()?.Exe : exe.Trim();
        var points = exe == null ? [] : counted
            .Where(s => string.Equals(s.Exe, exe, StringComparison.OrdinalIgnoreCase))
            .OrderBy(s => s.Start)
            .Select(s => new TrendPoint
            {
                Start = s.Start,
                DurationSec = s.DurationSec ?? 0,
                AvgFps = s.AvgFps,
                Low1 = s.Low1,
                AvgGpuTemp = s.AvgGpuTemp,
                AvgHotspot = s.AvgHotspot,
                PeakHotspot = s.PeakHotspot,
                AvgGpuPower = s.AvgGpuPower,
                Stutters = s.Stutters,
                GpuDriver = s.GpuDriver,
                EnergyWh = s.EnergyWh,
            })
            .ToList();
        // O exe com a grafia das sessões (o cliente pode mandar em outra caixa)
        if (exe != null && games.FirstOrDefault(g => string.Equals(g.Exe, exe, StringComparison.OrdinalIgnoreCase)) is { } known) exe = known.Exe;
        return new Trend { Exe = exe, Games = games, Points = points };
    }
}
