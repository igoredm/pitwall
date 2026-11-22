using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pitwall.Config;
using Pitwall.Fps;
using Pitwall.Games;
using Pitwall.Health;
using Pitwall.Localization;

namespace Pitwall;

/// <summary>1.3: benchmark por atalho, tendência por jogo, driver da GPU e "o jogo fechou com erro" nas sessões.</summary>
public sealed partial class TelemetryHub
{
    readonly BenchmarkRunner _bench = new();
    readonly BenchmarkStore _benchStore = new();
    /// <summary>Pedidos de start/cancel (socket, atalho) — aplicados no próximo tick, na thread de telemetria.</summary>
    readonly ConcurrentQueue<(string Kind, int? DurationSec, string? Note)> _benchCommands = new();
    long _benchCursor;

    /// <summary>1.3: o estado do benchmark mudou (início, fim, cancelado, erro). Disparado na thread de telemetria.</summary>
    public event Action<BenchmarkState>? BenchmarkChanged;

    /// <summary>Atalho: sem benchmark rodando começa (duração da config); rodando cancela.</summary>
    public void ToggleBenchmark() => _benchCommands.Enqueue(("toggle", null, null));

    void StartBenchmark(int? durationSec, string? note) => _benchCommands.Enqueue(("start", durationSec, note));

    void CancelBenchmark() => _benchCommands.Enqueue(("cancel", null, null));

    /// <summary>catalog.benchmark: rodando ou o último resultado; erro/cancelado antigo vira idle (não reaparece para quem conecta).</summary>
    BenchmarkState CatalogBenchmark() =>
        _bench.State.State is BenchmarkState.Failed or BenchmarkState.Cancelled ? new BenchmarkState() : _bench.State;

    string BenchmarkStateMessage(BenchmarkState s)
    {
        var node = JsonSerializer.SerializeToNode(s, ConfigStore.Json)!.AsObject();
        node.Insert(0, "type", "benchmarkState");
        return node.ToJsonString(ConfigStore.Json);
    }

    string BenchmarksMessage() => JsonSerializer.Serialize(new { type = "benchmarks", items = _benchStore.List() }, ConfigStore.Json);

    /// <summary>Tick: aplica os pedidos e alimenta o benchmark com os frames e as leituras deste tick (barato: sem I/O).</summary>
    void BenchmarkTick(AppConfig cfg, GameInfo? game, FrameStats? frames, bool hasFps, string? clockReason, double dt, long now)
    {
        while (_benchCommands.TryDequeue(out var cmd))
        {
            var start = cmd.Kind == "start" || cmd.Kind == "toggle" && !_bench.IsRunning;
            if (!start)
            {
                if (_bench.Cancel() is { } cancelled) OnBenchmark(cancelled, now);
                continue;
            }
            if (_bench.IsRunning)
            {
                _ws.Broadcast(BenchmarkStateMessage(_bench.State));
                continue;
            }
            var open = _sessions.Open;
            var ctx = new BenchmarkContext(_sensors.GpuName, _sensors.CpuName, GpuDriverNow(), open?.Start);
            var st = _bench.Start(game?.Exe, game?.Pid, hasFps, cmd.DurationSec ?? cfg.Benchmark.DurationSec, cmd.Note,
                cfg.Features.Stutters, ctx, DateTime.Now, now);
            if (st.State == BenchmarkState.Running && frames != null) _bench.Prime(frames.FramesSince(ref _benchCursor, 16_384));
            OnBenchmark(st, now);
        }
        if (!_bench.IsRunning) return;
        if (frames != null) _bench.AddFrames(frames.FramesSince(ref _benchCursor, 16_384));
        _bench.AddTick(_values, cfg.Metrics, clockReason, dt);
        if (_bench.Step(now) is { } done) OnBenchmark(done, now);
    }

    /// <summary>O jogo medido fechou (chamado antes de encerrar a sessão, para o marcador de fim entrar nela).</summary>
    void BenchmarkGameEnded(long now)
    {
        if (_bench.GameEnded(now) is { } st) OnBenchmark(st, now);
    }

    void OnBenchmark(BenchmarkState st, long now)
    {
        try
        {
            switch (st.State)
            {
                case BenchmarkState.Running:
                    BenchmarkMarker(L.T("Benchmark: início", "Benchmark: start"));
                    break;
                case BenchmarkState.Done when st.Result is { } r:
                    BenchmarkMarker(L.T($"Benchmark: fim ({r.DurationSec:0} s)", $"Benchmark: end ({r.DurationSec:0} s)"));
                    _benchStore.Add(r);
                    _ws.Broadcast(BenchmarksMessage());
                    break;
                case BenchmarkState.Cancelled:
                    BenchmarkMarker(L.T("Benchmark: cancelado", "Benchmark: cancelled"));
                    break;
            }
        }
        catch { }
        _ws.Broadcast(BenchmarkStateMessage(st));
        BenchmarkChanged?.Invoke(st);
    }

    /// <summary>Marcador na sessão aberta (via "benchmark") e no CSV; sem o aviso "Marcador N" da bandeja.</summary>
    void BenchmarkMarker(string note)
    {
        var at = DateTime.Now;
        if (_sessions.AddMarker(at, note, SessionMarker.ViaBenchmark) is not { } index) return;
        _log.MarkNext();
        _ws.Broadcast(JsonSerializer.Serialize(new { type = "marker", index, at, exe = CurrentGame?.Exe, via = SessionMarker.ViaBenchmark }, ConfigStore.Json));
    }

    /// <summary>startBenchmark / cancelBenchmark / getBenchmarks / renameBenchmark / deleteBenchmark.</summary>
    string? BenchmarkMessage(string type, JsonNode node)
    {
        switch (type)
        {
            case "startBenchmark":
                StartBenchmark(Int(node["durationSec"]), Str(node["note"]));
                return null;
            case "cancelBenchmark":
                CancelBenchmark();
                return null;
            case "getBenchmarks":
                return BenchmarksMessage();
            case "renameBenchmark":
                if (_benchStore.Rename(Str(node["id"]), Str(node["note"]))) _ws.Broadcast(BenchmarksMessage());
                return null;
            case "deleteBenchmark":
                if (_benchStore.Delete(Str(node["id"]))) _ws.Broadcast(BenchmarksMessage());
                return null;
        }
        return null;
    }

    // ---- tendência

    /// <summary>getTrend { exe? } → trend (só para quem pediu). Lê só a memória (o sessions.json já está carregado).</summary>
    string TrendMessage(JsonNode node) => TrendJson(TrendBuilder.Build(_sessions.Closed(), Str(node["exe"])));

    /// <summary>Regra pura do JSON do trend: <c>exe: null</c> explícito; dentro dos pontos, null não vai.</summary>
    internal static string TrendJson(Trend trend)
    {
        var node = new JsonObject
        {
            ["type"] = "trend",
            ["exe"] = trend.Exe,
            ["games"] = JsonSerializer.SerializeToNode(trend.Games, ConfigStore.Json),
            ["points"] = JsonSerializer.SerializeToNode(trend.Points, ConfigStore.Json),
        };
        return node.ToJsonString(ConfigStore.Json);
    }

    // ---- driver da GPU e saída do jogo

    string? _gpuDriver;
    bool _gpuDriverRead;

    /// <summary>Versão do driver da GPU (NVML; senão o registro, só a parte amigável). Lida uma vez.</summary>
    string? GpuDriverNow()
    {
        if (_gpuDriverRead) return _gpuDriver;
        _gpuDriverRead = true;
        try { _gpuDriver = _tuner.DriverVersion ?? SystemInfo.GpuDriver(_sensors.GpuName)?.Split(" (")[0]; } catch { }
        return _gpuDriver;
    }

    /// <summary>Exes de jogos conhecidos: sessões + games.include (filtro do log Application).</summary>
    IReadOnlySet<string> KnownGameExes()
    {
        var set = _sessions.Exes();
        foreach (var e in _config.Current.Games.Include) if (!string.IsNullOrWhiteSpace(e)) set.Add(e.Trim());
        return set;
    }

    /// <summary>~20 s depois do fim da sessão, numa thread de fundo: o jogo fechou com erro / parou de responder?</summary>
    void ScheduleGameExitCheck(GameSession ended)
    {
        if (!_crashFeature) return;
        var exe = ended.Exe;
        var days = Math.Clamp((int)Math.Ceiling((DateTime.Now - ended.Start).TotalDays) + 1, 1, PcEvents.Days);
        _ = Task.Delay(TimeSpan.FromSeconds(20)).ContinueWith(_ =>
        {
            try
            {
                var events = PcEvents.ReadApp(new HashSet<string>(StringComparer.OrdinalIgnoreCase) { exe }, days);
                if (_sessions.ApplyGameExits(events)) _ws.Broadcast(SessionsMessage());
            }
            catch { }
        }, TaskScheduler.Default);
    }

    /// <summary>getPcReport: aproveita os eventos lidos para marcar gameExit nas sessões.</summary>
    void ApplyGameExitsFromReport()
    {
        try
        {
            if (_sessions.ApplyGameExits(_health.Events())) _ws.Broadcast(SessionsMessage());
        }
        catch { }
    }
}
