using System.Text.Json;
using System.Text.Json.Nodes;
using Pitwall.Config;
using Pitwall.Games;
using Pitwall.Localization;
using Pitwall.Metrics;

namespace Pitwall.Health;

/// <summary>
/// Relatório do PC: buffer de 120 s sempre ligado (com features.crashReport), marcador de saída normal, detecção de
/// desligamento abrupto ao abrir, eventos do Windows e incidentes gravados.
/// </summary>
public sealed class PcHealth
{
    const long PersistGameMs = 5_000, PersistIdleMs = 10_000;
    static readonly TimeSpan EventsMaxAge = TimeSpan.FromMinutes(10);

    readonly IReadOnlyList<MetricDefinition> _definitions;
    readonly IReadOnlySet<string> _available;
    readonly PcRing _ring;
    readonly PcIncidentStore _store = new();
    readonly Lock _fileGate = new();
    long _lastPersist;
    int _writing;
    bool _closed;
    volatile bool _active;
    PcRingFile? _lastFile;
    DateTime? _lastCleanExit;

    readonly Lock _eventsGate = new();
    List<PcEvent> _events = [];
    DateTime _eventsAt;

    /// <summary>pc-ring.json da execução anterior (lido antes de este processo gravar o seu).</summary>
    public PcRingFile? Previous { get; private set; }
    public DateTime BootTime { get; } = DateTime.Now - TimeSpan.FromMilliseconds(Environment.TickCount64);
    public DateTime AppStart { get; } = DateTime.Now;
    public bool Active => _active;
    public PcIncidentStore Store => _store;

    public PcHealth(IReadOnlyList<MetricDefinition> definitions, IReadOnlySet<string> available)
    {
        _definitions = definitions;
        _available = available;
        _ring = new PcRing(PcRing.Ids.Where(available.Contains));
        Previous = PcRing.Load();
        _lastCleanExit = Previous is { CleanExit: true } p ? p.CleanExitAt : Previous?.LastCleanExit;
    }

    /// <summary>Thread de telemetria: amostra (1/s) e, a cada 5 s em jogo / 10 s fora, grava em segundo plano.</summary>
    public void Tick(IReadOnlyDictionary<string, double?> values, GameSession? open, string? csvFile, long nowMs)
    {
        _active = true;
        _ring.Sample(values, nowMs);
        if (nowMs - _lastPersist < (open != null ? PersistGameMs : PersistIdleMs) || _ring.Count == 0) return;
        if (Interlocked.CompareExchange(ref _writing, 1, 0) != 0) return; // gravação anterior ainda em andamento
        _lastPersist = nowMs;
        var file = new PcRingFile
        {
            SavedAt = DateTime.Now,
            BootTime = BootTime,
            AppStart = AppStart,
            Exe = open?.Exe,
            SessionStart = open?.Start,
            CsvFile = open != null ? csvFile : null,
            IntervalMs = (int)PcRing.SampleMs,
            Series = _ring.Series(),
            Last = Readings(values),
            LastCleanExit = _lastCleanExit,
        };
        _ = Task.Run(() =>
        {
            try
            {
                lock (_fileGate)
                {
                    if (_closed || !_active) return;
                    _lastFile = file;
                    PcRing.Write(PcRing.FilePath, file);
                }
            }
            catch { }
            finally { Volatile.Write(ref _writing, 0); }
        });
    }

    /// <summary>features.crashReport desligado: nada na memória nem no disco.</summary>
    public void Stop()
    {
        if (!_active) return;
        _active = false;
        _ring.Reset();
        _lastPersist = 0;
        lock (_fileGate)
        {
            _lastFile = null;
            PcRing.Delete();
        }
    }

    /// <summary>Recurso desligado ao abrir: o buffer antigo não vale mais (não vira incidente se for ligado depois).</summary>
    public void DiscardPrevious()
    {
        Previous = null;
        lock (_fileGate) PcRing.Delete();
    }

    /// <summary>Todas as métricas numéricas disponíveis, com o nome no idioma atual.</summary>
    List<PcReading> Readings(IReadOnlyDictionary<string, double?> values)
    {
        var list = new List<PcReading>(_definitions.Count);
        foreach (var d in _definitions)
        {
            if (d.Unit is "text" or "graph" || !_available.Contains(d.Id)) continue;
            var v = values.TryGetValue(d.Id, out var x) && x is { } n && double.IsFinite(n) ? Math.Round(n, 2) : (double?)null;
            list.Add(new PcReading { Id = d.Id, Name = L.MetricName(d), Group = d.Group.ToString().ToLowerInvariant(), Value = v, Unit = d.Unit });
        }
        return list;
    }

    /// <summary>Sair, logoff ou desligar pelo Windows: grava cleanExit e para de gravar.</summary>
    public void MarkCleanExit()
    {
        lock (_fileGate)
        {
            if (_closed || !_active) { _closed = true; return; }
            _closed = true;
            var now = DateTime.Now;
            var file = _lastFile ?? new PcRingFile { BootTime = BootTime, AppStart = AppStart };
            file.SavedAt = now;
            file.CleanExit = true;
            file.CleanExitAt = now;
            file.LastCleanExit = now;
            try { PcRing.Write(PcRing.FilePath, file); } catch { }
        }
    }

    /// <summary>O Windows cancelou o logoff/desligamento: volta a gravar (a próxima gravação tira o cleanExit).</summary>
    public void ResumeAfterCancel()
    {
        lock (_fileGate) _closed = false;
        _lastPersist = 0;
    }

    /// <summary>Ao abrir (fora da thread de telemetria): incidente novo se a execução anterior terminou numa queda do PC.</summary>
    public PcIncident? DetectAtStartup()
    {
        var prev = Previous;
        if (PcIncidentRules.Classify(prev, BootTime) != PcExitKind.Abrupt) return null;
        var inc = PcIncidentRules.Build(prev, BootTime, Events(force: true));
        if (inc == null || _store.Exists(inc.Id)) return null; // já registrado (o app caiu antes de regravar o buffer)
        _store.Save(inc);
        return inc;
    }

    /// <summary>Eventos dos últimos 30 dias (cache de até 10 min). Reanexa os que chegaram depois aos incidentes.</summary>
    public List<PcEvent> Events(bool force = false)
    {
        lock (_eventsGate)
        {
            if (!force && _eventsAt != default && DateTime.Now - _eventsAt < EventsMaxAge) return _events;
            _events = PcEvents.Read();
            _eventsAt = DateTime.Now;
            foreach (var s in _store.List())
                if (s.BootTime is { } b && DateTime.Now - b < TimeSpan.FromDays(PcEvents.Days))
                    _store.Update(s.Id, inc => PcIncidentRules.Refresh(inc, _events));
            return _events;
        }
    }

    public PcIncidentSummary? Pending => _store.Pending;

    public string ReportMessage(bool ringActive)
    {
        var events = Events();
        return JsonSerializer.Serialize(new
        {
            type = "pcReport",
            bootTime = BootTime,
            uptimeSec = (long)(DateTime.Now - BootTime).TotalSeconds,
            lastCleanExit = _lastCleanExit,
            incidents = _store.List(),
            events,
            ringActive,
        }, ConfigStore.Json);
    }

    public string? IncidentMessage(string? id)
    {
        if (id == null || _store.Get(id) is not { } inc) return null;
        return IncidentJson(inc);
    }

    internal static string IncidentJson(PcIncident inc)
    {
        var node = new JsonObject { ["type"] = "pcIncident" };
        foreach (var (k, v) in JsonSerializer.SerializeToNode(inc, ConfigStore.Json)!.AsObject().ToList())
            node[k] = v?.DeepClone();
        return node.ToJsonString(ConfigStore.Json);
    }

    public bool Dismiss(string? id) => id != null && _store.MarkSeen(id);
}
