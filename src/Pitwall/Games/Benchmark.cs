using System.Globalization;
using System.Text.Json;
using Pitwall.Config;
using Pitwall.Metrics;

namespace Pitwall.Games;

/// <summary>1.3: resultado de um benchmark (trecho de 30/60/120/300 s), em %APPDATA%\Pitwall\benchmarks.json.</summary>
public sealed class Benchmark
{
    public string Id { get; set; } = "";
    public string Exe { get; set; } = "";
    public DateTime Start { get; set; }
    /// <summary>Duração medida (= a pedida quando completou; o trecho medido quando <see cref="Partial"/>).</summary>
    public double DurationSec { get; set; }
    /// <summary>O jogo fechou no meio (salvo porque passou de 10 s).</summary>
    public bool? Partial { get; set; }
    public string? Note { get; set; }
    public double? AvgFps { get; set; }
    public double? Low1 { get; set; }
    public double? Low01 { get; set; }
    public int? Stutters { get; set; }
    public double? AvgGpuLoad { get; set; }
    public double? AvgCpuLoad { get; set; }
    public double? AvgGpuTemp { get; set; }
    public double? AvgHotspot { get; set; }
    public double? AvgGpuPower { get; set; }
    public double? AvgGpuClock { get; set; }
    public double? AvgCpuTemp { get; set; }
    public double? EnergyWh { get; set; }
    public Dictionary<string, double>? ClockReasonSec { get; set; }
    public string? Gpu { get; set; }
    public string? Cpu { get; set; }
    public string? GpuDriver { get; set; }
    /// <summary>Início da sessão de jogo em que o benchmark rodou.</summary>
    public DateTime? SessionStart { get; set; }
}

/// <summary>1.3: estado do benchmark (broadcast benchmarkState e catalog.benchmark).</summary>
public sealed class BenchmarkState
{
    public const string Idle = "idle", Running = "running", Done = "done", Cancelled = "cancelled", Failed = "error";
    public const string NoGame = "noGame", NoFps = "noFps", GameEnded = "gameEnded";

    public string State { get; set; } = Idle;
    public string? Exe { get; set; }
    public DateTime? StartedAt { get; set; }
    public int? DurationSec { get; set; }
    public string? Error { get; set; }
    public Benchmark? Result { get; set; }
}

/// <summary>Hardware e sessão no início do benchmark (vão para o resultado).</summary>
public sealed record BenchmarkContext(string? Gpu, string? Cpu, string? GpuDriver, DateTime? SessionStart);

/// <summary>
/// 1.3: um benchmark por vez, alimentado pela thread de telemetria (o mesmo <see cref="SessionStatsAccumulator"/> da
/// sessão, só que próprio). Sem I/O: quem chama grava marcadores, arquivo e broadcast. Não é thread-safe.
/// </summary>
public sealed class BenchmarkRunner
{
    /// <summary>Jogo fechou antes disso = erro gameEnded; depois = salvo com partial.</summary>
    public const double MinPartialSec = 10;

    SessionStatsAccumulator? _acc;
    long _startMs;
    int _durationSec;
    string? _note;
    BenchmarkContext? _ctx;

    public BenchmarkState State { get; private set; } = new();
    public bool IsRunning => _acc != null;
    /// <summary>Pid do jogo medido (outro pid = o jogo fechou).</summary>
    public int? Pid { get; private set; }

    /// <summary>Começa; sem jogo → error noGame, sem FPS → error noFps. Já rodando = estado atual, sem mudar nada.</summary>
    public BenchmarkState Start(string? exe, int? pid, bool hasFps, int durationSec, string? note, bool countStutters,
        BenchmarkContext ctx, DateTime now, long nowMs)
    {
        if (IsRunning) return State;
        if (exe == null || pid == null) return State = new BenchmarkState { State = BenchmarkState.Failed, Error = BenchmarkState.NoGame };
        if (!hasFps) return State = new BenchmarkState { State = BenchmarkState.Failed, Error = BenchmarkState.NoFps, Exe = exe };
        _acc = new SessionStatsAccumulator(countStutters);
        _startMs = nowMs;
        _durationSec = BenchmarkConfig.Snap(durationSec);
        _note = CleanNote(note);
        _ctx = ctx;
        Pid = pid;
        return State = new BenchmarkState { State = BenchmarkState.Running, Exe = exe, StartedAt = now, DurationSec = _durationSec };
    }

    /// <summary>Nota com até 200 caracteres; vazia = null.</summary>
    public static string? CleanNote(string? note) =>
        string.IsNullOrWhiteSpace(note) ? null : note.Trim()[..Math.Min(note.Trim().Length, 200)];

    /// <summary>Frames do jogo de antes do início: só enchem a janela da mediana dos engasgos.</summary>
    public void Prime(ReadOnlySpan<float> frames) => _acc?.Prime(frames);

    public void AddFrames(ReadOnlySpan<float> frames) => _acc?.AddFrames(frames);

    public void AddTick(IReadOnlyDictionary<string, double?> values, IEnumerable<MetricSetting> settings, string? clockReason, double dtSec)
    {
        if (_acc == null) return;
        _acc.AddTick(values, settings, dtSec);
        _acc.AddClockReason(clockReason, dtSec);
    }

    /// <summary>Passou da duração pedida → done (com o resultado). Senão null.</summary>
    public BenchmarkState? Step(long nowMs)
    {
        if (_acc == null || nowMs - _startMs < _durationSec * 1000L) return null;
        return Finish(_durationSec, partial: false);
    }

    /// <summary>O jogo fechou: ≥ 10 s → done com partial; senão error gameEnded.</summary>
    public BenchmarkState? GameEnded(long nowMs)
    {
        if (_acc == null) return null;
        var sec = (nowMs - _startMs) / 1000.0;
        if (sec >= MinPartialSec) return Finish(Math.Round(sec), partial: true);
        var exe = State.Exe;
        Reset();
        return State = new BenchmarkState { State = BenchmarkState.Failed, Error = BenchmarkState.GameEnded, Exe = exe };
    }

    public BenchmarkState? Cancel()
    {
        if (_acc == null) return null;
        var prev = State;
        Reset();
        return State = new BenchmarkState { State = BenchmarkState.Cancelled, Exe = prev.Exe, StartedAt = prev.StartedAt, DurationSec = prev.DurationSec };
    }

    /// <summary>Segundos medidos até agora (0 parado).</summary>
    public double ElapsedSec(long nowMs) => _acc == null ? 0 : (nowMs - _startMs) / 1000.0;

    BenchmarkState Finish(double durationSec, bool partial)
    {
        var prev = State;
        var start = prev.StartedAt ?? DateTime.Now;
        var b = new Benchmark
        {
            Exe = prev.Exe ?? "",
            Start = start,
            DurationSec = durationSec,
            Partial = partial ? true : null,
            Note = _note,
            Gpu = _ctx?.Gpu,
            Cpu = _ctx?.Cpu,
            GpuDriver = _ctx?.GpuDriver,
            SessionStart = _ctx?.SessionStart,
        };
        _acc!.ApplyTo(b);
        Reset();
        return State = new BenchmarkState { State = BenchmarkState.Done, Exe = b.Exe, StartedAt = start, DurationSec = prev.DurationSec, Result = b };
    }

    void Reset()
    {
        _acc = null;
        _ctx = null;
        _note = null;
        Pid = null;
    }
}

/// <summary>1.3: %APPDATA%\Pitwall\benchmarks.json, os 200 mais novos primeiro. Thread-safe.</summary>
public sealed class BenchmarkStore
{
    public const int Max = 200;
    static readonly JsonSerializerOptions FileJson = new(ConfigStore.Json) { WriteIndented = false };

    readonly string _path;
    readonly Lock _gate = new();
    List<Benchmark>? _items;

    public BenchmarkStore(string? path = null) => _path = path ?? Path.Combine(ConfigStore.Dir, "benchmarks.json");

    public List<Benchmark> List()
    {
        lock (_gate) return [.. Items()];
    }

    /// <summary>Dá o id (hora local do início, "yyyyMMdd-HHmmss", com "-2"… se repetir), guarda no topo e corta em 200.</summary>
    public Benchmark Add(Benchmark b)
    {
        lock (_gate)
        {
            var items = Items();
            var id = b.Start.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);
            for (int n = 2; items.Any(x => x.Id == id) || string.IsNullOrEmpty(id); n++)
                id = $"{b.Start.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture)}-{n}";
            b.Id = id;
            items.Insert(0, b);
            items.Sort((x, y) => y.Start.CompareTo(x.Start));
            if (items.Count > Max) items.RemoveRange(Max, items.Count - Max);
            Save(items);
            return b;
        }
    }

    public bool Rename(string? id, string? note)
    {
        lock (_gate)
        {
            if (Items().FirstOrDefault(x => x.Id == id) is not { } b) return false;
            b.Note = BenchmarkRunner.CleanNote(note);
            Save(Items());
            return true;
        }
    }

    public bool Delete(string? id)
    {
        lock (_gate)
        {
            if (Items().RemoveAll(x => x.Id == id) == 0) return false;
            Save(Items());
            return true;
        }
    }

    List<Benchmark> Items()
    {
        if (_items != null) return _items;
        try
        {
            _items = File.Exists(_path) ? JsonSerializer.Deserialize<List<Benchmark>>(File.ReadAllText(_path), ConfigStore.Json) ?? [] : [];
        }
        catch { _items = []; }
        _items.RemoveAll(b => b == null || string.IsNullOrEmpty(b.Id));
        return _items;
    }

    void Save(List<Benchmark> items)
    {
        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_path)!);
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(items, FileJson));
            File.Move(tmp, _path, overwrite: true);
        }
        catch { }
    }
}
