using Pitwall.Config;

namespace Pitwall.Metrics;

/// <summary>
/// Mínimo/máximo de cada métrica desde o início da sessão (ou do último "zerar").
/// Atualizado a cada tick; o snapshot leva só o que mudou, no máximo uma vez por segundo.
/// </summary>
public sealed class MetricExtremes
{
    readonly Lock _gate = new();
    readonly Dictionary<string, (double Min, double Max)> _all = [];
    readonly HashSet<string> _dirty = [];

    /// <summary>Muda a cada reset: o cliente que vê um epoch diferente descarta o que tinha.</summary>
    public int Epoch { get; private set; }

    public void Reset()
    {
        lock (_gate)
        {
            _all.Clear();
            _dirty.Clear();
            Epoch++;
        }
    }

    public void Add(IReadOnlyDictionary<string, double?> values)
    {
        lock (_gate)
        {
            foreach (var (id, v) in values)
            {
                if (v is not { } d || !double.IsFinite(d)) continue;
                if (_all.TryGetValue(id, out var e))
                {
                    if (d >= e.Min && d <= e.Max) continue;
                    _all[id] = (Math.Min(e.Min, d), Math.Max(e.Max, d));
                }
                else _all[id] = (d, d);
                _dirty.Add(id);
            }
        }
    }

    /// <summary>Entradas que mudaram desde a última chamada ([min, max]); null se nada mudou.</summary>
    public (int Epoch, Dictionary<string, double[]> Values)? TakeChanges()
    {
        lock (_gate)
        {
            if (_dirty.Count == 0) return null;
            var result = _dirty.ToDictionary(id => id, id => Pair(_all[id]));
            _dirty.Clear();
            return (Epoch, result);
        }
    }

    /// <summary>Tudo (para cliente recém-conectado).</summary>
    public (int Epoch, Dictionary<string, double[]> Values) Snapshot()
    {
        lock (_gate) return (Epoch, _all.ToDictionary(kv => kv.Key, kv => Pair(kv.Value)));
    }

    static double[] Pair((double Min, double Max) e) => [Math.Round(e.Min, 2), Math.Round(e.Max, 2)];
}

/// <summary>
/// Histograma de frametimes da sessão inteira: memória fixa (~50 KB), sem guardar cada frame.
/// Resolução de 0,05 ms até 100 ms e de 1 ms até 1 s; acima disso, um balde só (com a soma exata).
/// </summary>
public sealed class FrametimeHistogram
{
    const double FineStep = 0.05, FineMax = 100, CoarseStep = 1, CoarseMax = 1000;
    const int FineBins = (int)(FineMax / FineStep);
    const int CoarseBins = (int)((CoarseMax - FineMax) / CoarseStep);
    const int Bins = FineBins + CoarseBins + 1;

    readonly long[] _count = new long[Bins];
    readonly double[] _sum = new double[Bins];

    public long Frames { get; private set; }
    public double TotalMs { get; private set; }

    public void Add(double ft)
    {
        if (!(ft > 0) || ft > 5_000) return;
        var bin = ft < FineMax ? (int)(ft / FineStep)
            : ft < CoarseMax ? FineBins + (int)((ft - FineMax) / CoarseStep)
            : Bins - 1;
        _count[bin]++;
        _sum[bin] += ft;
        Frames++;
        TotalMs += ft;
    }

    public double? AvgFps => Frames > 0 && TotalMs > 0 ? Frames * 1000.0 / TotalMs : null;

    /// <summary>Mesma definição do FrameStats: FPS médio dos x% piores frames; null com menos de 20 frames.</summary>
    public double? Low(double fraction)
    {
        var k = (long)Math.Ceiling(Frames * fraction);
        if (Frames < 20 || k < 1) return null;
        long left = k;
        double s = 0;
        for (int i = Bins - 1; i >= 0 && left > 0; i--)
        {
            if (_count[i] == 0) continue;
            var take = Math.Min(left, _count[i]);
            s += take == _count[i] ? _sum[i] : _sum[i] / _count[i] * take;
            left -= take;
        }
        return 1000.0 / (s / k);
    }
}

/// <summary>Estatísticas de uma sessão de jogo, acumuladas a cada tick (sem reler o CSV).</summary>
public sealed class SessionStatsAccumulator
{
    readonly FrametimeHistogram _frames = new();
    readonly Dictionary<string, double> _warnSec = [];
    readonly Dictionary<string, double> _critSec = [];
    double? _peakTemp, _peakHotspot, _peakDelta, _peakPower, _peakCpuTemp;

    /// <summary>1.2: métricas com média na sessão (soma + contagem por tick, sem alocar). Ordem = <see cref="ApplyTo"/>.</summary>
    internal static readonly string[] AverageIds =
        ["gpu.temp", "gpu.hotspot", "gpu.power", "gpu.clock", "gpu.load", "cpu.temp", "cpu.load", "fps.animError", "fps.pcLatency"];
    readonly double[] _avgSum = new double[AverageIds.Length];
    readonly int[] _avgCount = new int[AverageIds.Length];

    // 1.2: engasgos (features.stutters); null = desligado
    Fps.StutterDetector? _stutters;
    bool _primed;

    public SessionStatsAccumulator(bool countStutters = false) => CountStutters = countStutters;

    /// <summary>Liga/desliga a contagem de engasgos (desligar descarta a contagem; religar começa do zero, com novo aquecimento).</summary>
    public bool CountStutters
    {
        get => _stutters != null;
        set
        {
            if (value == (_stutters != null)) return;
            _stutters = value ? new Fps.StutterDetector() : null;
            _primed = false;
        }
    }

    /// <summary>Engasgos na sessão até agora; null com a contagem desligada.</summary>
    public int? Stutters => _stutters?.Count;

    public void AddFrames(ReadOnlySpan<float> frametimes)
    {
        foreach (var ft in frametimes) _frames.Add(ft);
        if (_stutters == null || frametimes.IsEmpty) return;
        // Primeiro lote = frames que o PresentMon já tinha antes da sessão: só enchem a janela da mediana
        if (!_primed)
        {
            _primed = true;
            _stutters.Prime(frametimes);
            return;
        }
        _stutters.Add(frametimes);
    }

    /// <param name="dtSec">Tempo desde o tick anterior (conta para "segundos acima do amarelo/vermelho").</param>
    public void AddTick(IReadOnlyDictionary<string, double?> values, IEnumerable<MetricSetting> settings, double dtSec)
    {
        Peak(ref _peakTemp, values, "gpu.temp");
        Peak(ref _peakHotspot, values, "gpu.hotspot");
        Peak(ref _peakDelta, values, "gpu.hotspotDelta");
        Peak(ref _peakPower, values, "gpu.power");
        Peak(ref _peakCpuTemp, values, "cpu.temp");
        for (int i = 0; i < AverageIds.Length; i++)
            if (values.TryGetValue(AverageIds[i], out var av) && av is { } a && double.IsFinite(a))
            {
                _avgSum[i] += a;
                _avgCount[i]++;
            }
        if (!(dtSec > 0)) return;
        AddEnergy(values, dtSec);
        foreach (var s in settings)
        {
            if (s.Warn == null && s.Crit == null) continue;
            if (!values.TryGetValue(s.Id, out var v) || v is not { } d || !double.IsFinite(d)) continue;
            // Mesma regra do widget: >= limite. "Acima do amarelo" inclui o tempo no vermelho.
            if (s.Warn is { } w && d >= w) _warnSec[s.Id] = _warnSec.GetValueOrDefault(s.Id) + dtSec;
            if (s.Crit is { } c && d >= c)
            {
                _critSec[s.Id] = _critSec.GetValueOrDefault(s.Id) + dtSec;
                if (s.Warn == null) _warnSec[s.Id] = _warnSec.GetValueOrDefault(s.Id) + dtSec;
            }
        }
    }

    // 1.3: energia (J) = Σ (gpu.power + cpu.power) × dt; só o que tiver leitura, nenhum dos dois = o tick não conta
    double _energyJ;
    bool _energyAny;

    void AddEnergy(IReadOnlyDictionary<string, double?> values, double dtSec)
    {
        double watts = 0;
        var any = false;
        foreach (var id in EnergyIds)
            if (values.TryGetValue(id, out var v) && v is { } w && double.IsFinite(w) && w >= 0)
            {
                watts += w;
                any = true;
            }
        if (!any) return;
        _energyJ += watts * dtSec;
        _energyAny = true;
    }

    static readonly string[] EnergyIds = ["gpu.power", "cpu.power"];

    /// <summary>1.3: energia estimada até agora (Wh, 1 casa); null sem nenhuma leitura de consumo.</summary>
    public double? EnergyWh => _energyAny ? Math.Round(_energyJ / 3600, 1) : null;

    /// <summary>
    /// 1.3 (benchmark): só enche a janela da mediana dos engasgos com frames de antes do início (não contam na média nem nos lows).
    /// </summary>
    public void Prime(ReadOnlySpan<float> frametimes)
    {
        if (_stutters == null || frametimes.IsEmpty) return;
        _primed = true;
        _stutters.Prime(frametimes);
    }

    readonly Dictionary<string, double> _reasonSec = [];

    /// <summary>
    /// Soma <paramref name="dtSec"/> ao motivo do limite de clock deste tick (valor de gpu.perfcap:
    /// thermal | power | voltage | idle | sync | none). null = sem leitura (não conta).
    /// </summary>
    public void AddClockReason(string? reason, double dtSec)
    {
        if (reason == null || !(dtSec > 0)) return;
        _reasonSec[reason] = _reasonSec.GetValueOrDefault(reason) + dtSec;
    }

    /// <summary>Segundos por motivo até agora (arredondados), ou null se ainda não há leitura.</summary>
    public Dictionary<string, double>? ClockReasonSeconds() =>
        _reasonSec.Count > 0 ? _reasonSec.ToDictionary(kv => kv.Key, kv => Math.Round(kv.Value)) : null;

    static void Peak(ref double? peak, IReadOnlyDictionary<string, double?> values, string id)
    {
        if (values.TryGetValue(id, out var v) && v is { } d && double.IsFinite(d) && (peak == null || d > peak)) peak = d;
    }

    public void ApplyTo(Games.GameSession s, DateTime now)
    {
        s.DurationSec = Math.Round(((s.End ?? now) - s.Start).TotalSeconds);
        s.AvgFps = R(_frames.AvgFps);
        s.Low1 = R(_frames.Low(0.01));
        s.Low01 = R(_frames.Low(0.001));
        s.PeakGpuTemp = R(_peakTemp);
        s.PeakHotspot = R(_peakHotspot);
        s.PeakHotspotDelta = R(_peakDelta);
        s.PeakGpuPower = R(_peakPower);
        s.SecondsAboveWarn = _warnSec.Count > 0 ? _warnSec.ToDictionary(kv => kv.Key, kv => Math.Round(kv.Value)) : null;
        s.SecondsAboveCrit = _critSec.Count > 0 ? _critSec.ToDictionary(kv => kv.Key, kv => Math.Round(kv.Value)) : null;
        s.ClockReasonSec = ClockReasonSeconds();
        s.AvgGpuTemp = Avg(0);
        s.AvgHotspot = Avg(1);
        s.AvgGpuPower = Avg(2);
        s.AvgGpuClock = Avg(3) is { } clk ? Math.Round(clk) : null;
        s.AvgGpuLoad = Avg(4);
        s.AvgCpuTemp = Avg(5);
        s.AvgCpuLoad = Avg(6);
        s.PeakCpuTemp = R(_peakCpuTemp);
        s.Stutters = Stutters;
        s.AnimErrorMs = _avgCount[7] > 0 ? Math.Round(_avgSum[7] / _avgCount[7], 2) : null;
        s.PcLatencyMs = Avg(8);
        s.EnergyWh = EnergyWh;
    }

    /// <summary>1.3: as mesmas regras da sessão num benchmark (<paramref name="b"/>.DurationSec fica com quem chamou).</summary>
    public void ApplyTo(Games.Benchmark b)
    {
        b.AvgFps = R(_frames.AvgFps);
        b.Low1 = R(_frames.Low(0.01));
        b.Low01 = R(_frames.Low(0.001));
        b.Stutters = Stutters;
        b.AvgGpuLoad = Avg(4);
        b.AvgCpuLoad = Avg(6);
        b.AvgGpuTemp = Avg(0);
        b.AvgHotspot = Avg(1);
        b.AvgGpuPower = Avg(2);
        b.AvgGpuClock = Avg(3) is { } clk ? Math.Round(clk) : null;
        b.AvgCpuTemp = Avg(5);
        b.EnergyWh = EnergyWh;
        b.ClockReasonSec = ClockReasonSeconds();
    }

    double? Avg(int i) => _avgCount[i] > 0 ? R(_avgSum[i] / _avgCount[i]) : null;

    static double? R(double? v) => v is { } d && double.IsFinite(d) ? Math.Round(d, 1) : null;
}

/// <summary>
/// Alerta de vermelho: dispara quando a métrica fica >= limite vermelho por <see cref="SustainMs"/> seguidos,
/// no máximo uma vez a cada intervalo mínimo por métrica.
/// </summary>
public sealed class AlertTracker
{
    public const long SustainMs = 5_000;

    readonly Dictionary<string, long> _aboveSince = [];
    readonly Dictionary<string, long> _lastFired = [];

    /// <summary>Alertas desligados: esquece quem estava no vermelho (ao religar, conta 5 s de novo).</summary>
    public void Clear() => _aboveSince.Clear();

    /// <returns>true = mostrar o aviso agora.</returns>
    public bool Step(string id, double? value, double? crit, long nowMs, long minIntervalMs, long sustainMs = SustainMs)
    {
        if (crit is not { } c || value is not { } v || !double.IsFinite(v) || v < c)
        {
            _aboveSince.Remove(id);
            return false;
        }
        if (!_aboveSince.TryGetValue(id, out var since))
        {
            _aboveSince[id] = nowMs;
            return false;
        }
        if (nowMs - since < sustainMs) return false;
        if (_lastFired.TryGetValue(id, out var last) && nowMs - last < minIntervalMs) return false;
        _lastFired[id] = nowMs;
        return true;
    }
}
