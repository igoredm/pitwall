using Pitwall.Localization;
using System.Security.Principal;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pitwall.Battery;
using Pitwall.Config;
using Pitwall.Fps;
using Pitwall.Games;
using Pitwall.Gpu;
using Pitwall.Health;
using Pitwall.Logging;
using Pitwall.Metrics;
using Pitwall.Native;
using Pitwall.Sensors;
using Pitwall.Server;

namespace Pitwall;

/// <summary>Loop principal: lê sensores + FPS, detecta jogo, publica no WebSocket e grava o CSV.</summary>
public sealed partial class TelemetryHub : IDisposable
{
    readonly ConfigStore _config;
    readonly SensorService _sensors;
    readonly PresentMonService _presentMon;
    readonly GameDetector _games;
    readonly GpuTuner _tuner;
    readonly BatteryService _battery;
    readonly SessionStore _sessions = new();
    readonly CsvLogger _log = new();
    readonly WsServer _ws;
    readonly CancellationTokenSource _cts = new();
    readonly Dictionary<string, double?> _values = [];
    /// <summary>Métricas de texto (unit "text"), ex.: gpu.perfcap.</summary>
    readonly Dictionary<string, string?> _texts = [];
    readonly List<MetricDefinition> _definitions;
    readonly HashSet<string> _available;
    readonly HashSet<string> _optionalIds;
    string[] _logColumns = [];
    long _graphCursor;

    // Sessão: mín/máx por métrica, estatísticas e alertas de vermelho
    readonly MetricExtremes _extremes = new();
    readonly AlertTracker _alerts = new();
    SessionStatsAccumulator? _stats;
    long _statsCursor;
    long _lastTickMs;
    long _extremesSentAt;
    // 1.2 (Monitor): mín/máx desde que o app abriu. Nunca zera; só no socket local, mudanças no máximo a cada 5 s
    readonly MetricExtremes _extremesApp = new();
    long _extremesAppSentAt;
    long _sessionSavedAt;

    // Relatório do PC (1.2): buffer de 120 s em disco, com ou sem jogo; o relatório de crash do jogo sai dele
    readonly PcHealth _health;
    /// <summary>1.2: desligamento abrupto do PC detectado ao abrir (thread de fundo).</summary>
    public event Action<PcIncidentSummary>? PcIncidentDetected;
    /// <summary>Incidente do PC ainda não visto (null com features.crashReport desligado).</summary>
    public PcIncidentSummary? PendingPcIncident => _crashFeature ? _health.Pending : null;
    /// <summary>Saída normal (sair, logoff, desligar pelo Windows): grava cleanExit no buffer.</summary>
    public void MarkCleanExit() => _health.MarkCleanExit();
    /// <summary>O Windows cancelou o logoff/desligamento: o buffer volta a gravar.</summary>
    public void ResumeAfterCancel() => _health.ResumeAfterCancel();
    volatile CrashReport? _crashReport;
    /// <summary>Relatório pendente (null com features.crashReport desligado).</summary>
    public CrashReport? PendingCrashReport => _crashFeature ? _crashReport : null;
    volatile bool _crashFeature;
    int _crashDetectStarted;
    /// <summary>Relatório de crash detectado ao abrir (thread de fundo).</summary>
    public event Action<CrashReport>? CrashReportDetected;

    public event Action<GameInfo?>? GameChanged;
    /// <summary>Uma sessão de jogo terminou e entrou no histórico (>= 30 s).</summary>
    public event Action<GameSession>? SessionEnded;
    /// <summary>Métrica no vermelho por 5 s ou mais (título, texto). Disparado na thread de telemetria.</summary>
    public event Action<string, string>? AlertRaised;
    /// <summary>"Compacto no canto superior direito" (tela de configurações). 1.2: (layout, canto tl|tr|bl|br).</summary>
    public event Action<string, string>? PlaceTopRightRequested;
    /// <summary>1.2: o widget ocupa o monitor inteiro (telinhas e faixas dedicadas).</summary>
    public event Action? FillMonitorRequested;
    /// <summary>Só em Debug: permite reiniciar o app a partir do dev tooling (o processo é elevado).</summary>
#pragma warning disable CS0067 // disparado só em Debug
    public event Action? QuitRequested;
#pragma warning restore CS0067
    /// <summary>A GPU aceita o ajuste (NVIDIA com NVML). O menu da bandeja desabilita o item sem isso.</summary>
    public bool TuningSupported => _tuner.Caps.Supported;
    public GameInfo? CurrentGame { get; private set; }
    public string? LogPath => _log.CurrentPath;

    // 1.2: marcadores, motivo de não haver FPS e estado dos atalhos
    /// <summary>Um marcador foi gravado (atalho ou addMarker), com ou sem jogo. Disparado na thread de quem pediu.</summary>
    public event Action<MarkerEvent>? MarkerAdded;
    int _pcMarkers;
    readonly bool _admin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator);
    volatile object? _hotkeys;

    public TelemetryHub(ConfigStore config, SensorService sensors, PresentMonService presentMon, GpuTuner tuner, BatteryService battery)
    {
        _tuner = tuner;
        _battery = battery;
        _config = config;
        _sensors = sensors;
        _presentMon = presentMon;
        _games = new GameDetector(presentMon);

        _definitions = [.. MetricCatalog.Static, .. sensors.DynamicDefinitions];
        _available = sensors.AvailableIds();
        _optionalIds = sensors.OptionalIds.ToHashSet();
        if (presentMon.Available)
            foreach (var d in MetricCatalog.Static.Where(d => d.Group == MetricGroup.Fps)) _available.Add(d.Id);
        if (tuner.ClockReasonsMask() != null) _available.Add("gpu.perfcap");
        _health = new PcHealth(_definitions, _available, KnownGameExes);

        var dynamicMissing = sensors.DynamicDefinitions.Where(d => config.Current.Metrics.All(m => m.Id != d.Id)).ToList();
        if (dynamicMissing.Count > 0) config.Update(c => MetricCatalog.EnsureSettings(c, dynamicMissing));

        ApplyActive(config.Current);

        _ws = new WsServer(config.Current.WebSocketPort)
        {
            // Mín/máx desligado (features.sessionPeaks): nem a mensagem completa vai
            OnConnect = () => _config.Current.Features.SessionPeaks
                ? [CatalogMessage(), ConfigMessage(), SessionsMessage(), ExtremesMessage(), ExtremesAppMessage()]
                : [CatalogMessage(), ConfigMessage(), SessionsMessage(), ExtremesAppMessage()],
            OnMessage = HandleMessage,
        };
        // Celular na rede local: servidor separado, somente leitura, com dados sanitizados
        _remote = new RemoteServer(() => _config.Current.Remote.PairedDevices, _pairing)
        {
            OnAuthenticated = () => [CatalogMessage(remote: true), RemoteConfigMessage()],
        };
        _remote.Paired += d =>
        {
            // Lista nova em vez de Add: o servidor da rede pode estar lendo a antiga em outra thread.
            // O "devices" vai no Authenticated logo depois (aí o aparelho já conta como online).
            _config.Update(c => c.Remote.PairedDevices = [.. c.Remote.PairedDevices, d]);
        };
        _remote.Authenticated += (id, paired) =>
        {
            TouchDevices(new HashSet<string> { id });
            _ws.Broadcast(DevicesMessage(paired ? id : null));
        };
        _remote.Disconnected += _ => _ws.Broadcast(DevicesMessage());
        // 1.2: Home Assistant (GET /api/v1/state), desligado por padrão
        _remote.ApiEnabled = () => _config.Current.Remote is { Enabled: true, ApiEnabled: true };
        _remote.StateJson = StateJson;
        _remote.ApiAuthorized += TouchApiDevice;

        _crashFeature = config.Current.Features.CrashReport;
        _peaksOn = config.Current.Features.SessionPeaks;
        RefreshLastReasons();
        _retentionKey = RetentionKey(config.Current.Log);
        config.Changed += c =>
        {
            ApplyActive(c);
            // Relatório de crash ligado/desligado: some/volta no catálogo (e, se ainda não rodou, a detecção roda agora)
            if (c.Features.CrashReport != _crashFeature)
            {
                _crashFeature = c.Features.CrashReport;
                if (_crashFeature && Interlocked.Exchange(ref _crashDetectStarted, 1) == 0) _ = Task.Run(DetectCrash);
                _ws.Broadcast(CatalogMessage());
            }
            // Mudou a retenção (ou a pasta): roda de novo daqui a pouco, sem esperar o ciclo diário
            var key = RetentionKey(c.Log);
            if (key != _retentionKey)
            {
                _retentionKey = key;
                Interlocked.Exchange(ref _retentionAt, Environment.TickCount64 + RetentionDebounceMs);
            }
            if (_lang != L.Lang)
            {
                _lang = L.Lang;
                _ws.Broadcast(CatalogMessage());
                if (_remote.HasClients) _remote.Broadcast(CatalogMessage(remote: true));
            }
            _ws.Broadcast(ConfigMessage());
            if (_remote.HasClients) _remote.Broadcast(RemoteConfigMessage());
            ApplyRemote(c.Remote);
        };
    }

    string _lang = L.Lang;

    public int Port => _ws.Port;

    /// <summary>Atualizador (Update/UpdateService): estado no catálogo e mensagens próprias no WebSocket.</summary>
    public Update.UpdateService? Updater { get; set; }
    public void Broadcast(string json) => _ws.Broadcast(json);

    /// <summary>
    /// Log = tudo que o hardware principal (CPU/GPU/RAM/FPS) expõe, visível ou não no widget,
    /// + os "Outros" (discos, placa-mãe, rede) que estiverem habilitados — esses só são lidos quando ativos.
    /// </summary>
    void ApplyActive(AppConfig c)
    {
        var enabled = c.Metrics.Where(m => m.Enabled).Select(m => m.Id).ToHashSet();
        _sensors.SetActive(enabled);
        _logColumns = _definitions
            .Where(d => _available.Contains(d.Id) && d.Unit != "graph")
            .Where(d => !_optionalIds.Contains(d.Id) || enabled.Contains(d.Id))
            .Select(d => d.Id)
            .ToArray();
    }

    public void Start()
    {
        _ws.Start();
        new Thread(Loop) { IsBackground = true, Name = "Telemetry", Priority = ThreadPriority.BelowNormal }.Start();
        // Relatório de crash desligado: nem olha o sessions.json/log do Windows (roda se for ligado depois)
        if (_config.Current.Features.CrashReport && Interlocked.Exchange(ref _crashDetectStarted, 1) == 0) _ = Task.Run(DetectCrash);
        else if (!_config.Current.Features.CrashReport) _health.DiscardPrevious();
        ApplyRemote(_config.Current.Remote);
    }

    /// <summary>A última sessão não terminou, ou o Windows registrou Kernel-Power 41 depois dela?</summary>
    void DetectCrash()
    {
        DetectPcIncident();
        try
        {
            var last = _sessions.LastAtStartup;
            if (last == null) return;
            var kp41 = _health.Events().Where(e => e.Kind == "kernelPower41" && e.Time >= last.Start).Select(e => (DateTime?)e.Time).FirstOrDefault();
            var report = CrashDetector.Detect(last, CrashRing.FromPcRing(_health.Previous), kp41, CrashDetector.DismissedSessionStart());
            if (report == null) return;
            _crashReport = report;
            _ws.Broadcast(CatalogMessage());
            if (_crashFeature) CrashReportDetected?.Invoke(report);
        }
        catch { }
    }

    /// <summary>1.2: a execução anterior terminou num desligamento abrupto? Vira incidente (e marca a sessão de jogo).</summary>
    void DetectPcIncident()
    {
        try
        {
            var inc = _health.DetectAtStartup();
            if (inc == null) return;
            if (inc.Exe != null && inc.SessionStart is { } start && _sessions.MarkCrashed(inc.Exe, start, inc.Id))
                _ws.Broadcast(SessionsMessage());
            _ws.Broadcast(CatalogMessage());
            if (_crashFeature) PcIncidentDetected?.Invoke(inc.ToSummary());
            // O BugCheck 1001 costuma ser gravado alguns minutos depois do boot: relê uma vez daqui a 10 min
            _ = Task.Delay(TimeSpan.FromMinutes(10)).ContinueWith(_ =>
            {
                try { _health.Events(force: true); _ws.Broadcast(CatalogMessage()); } catch { }
            });
        }
        catch { }
    }

    /// <summary>Próxima limpeza de logs (TickCount64). Antecipada quando a config de retenção muda.</summary>
    long _retentionAt = Environment.TickCount64 + 15_000;
    string _retentionKey;
    /// <summary>Espera depois de mudar a retenção (o usuário pode estar clicando entre as opções).</summary>
    const long RetentionDebounceMs = 5_000;

    static string RetentionKey(LogConfig l) => $"{l.KeepDays}|{l.MaxTotalMb}|{l.Folder}";

    void Loop()
    {
        var cleanupAt = Environment.TickCount64 + 30_000;
        // Retenção de logs: logo depois de abrir (o CSV atual já existe), 1x por dia e ~5 s depois de mudar a config
        while (!_cts.IsCancellationRequested)
        {
            var retentionAt = Interlocked.Read(ref _retentionAt);
            if (Environment.TickCount64 > retentionAt)
            {
                Interlocked.CompareExchange(ref _retentionAt, Environment.TickCount64 + 24 * 3600_000L, retentionAt);
                var logCfg = _config.Current.Log;
                var keep = RetentionProtected();
                _ = Task.Run(() => { try { LogRetention.Run(logCfg, keep); } catch { } });
            }
            var started = Environment.TickCount64;
            var cfg = _config.Current;
            try
            {
                Tick(cfg);
            }
            catch (Exception ex)
            {
                _ws.Broadcast(JsonSerializer.Serialize(new { type = "error", message = ex.Message }));
            }
            if (started > cleanupAt)
            {
                _presentMon.CleanupStale();
                cleanupAt = started + 30_000;
            }
            // "Visto por último" dos aparelhos conectados: no máximo 1x por minuto
            if (started - _lastSeenAt >= LastSeenEveryMs)
            {
                _lastSeenAt = started;
                if (_remote.HasClients) TouchDevices(_remote.OnlineDeviceIds());
            }
            var wait = Math.Max(50, cfg.RefreshMs - (int)(Environment.TickCount64 - started));
            _cts.Token.WaitHandle.WaitOne(wait);
        }
        EndSession();
    }

    /// <summary>Arquivos que a retenção nunca apaga: o atual e o da sessão mais recente.</summary>
    List<string?> RetentionProtected() =>
        [_log.CurrentPath, _sessions.Recent.FirstOrDefault(s => s.CsvFile != null)?.CsvFile, _crashReport?.CsvFile];

    /// <summary>Fecha a sessão aberta gravando as estatísticas finais.</summary>
    void EndSession()
    {
        var stats = _stats;
        var csv = _log.CurrentPath;
        var ended = _sessions.End(CurrentGame, s =>
        {
            try
            {
                stats?.ApplyTo(s, DateTime.Now);
                if (csv != null) s.CsvFile ??= Path.GetFileName(csv);
            }
            catch { }
        });
        RefreshLastReasons();
        if (ended != null)
        {
            ScheduleGameExitCheck(ended);
            SessionEnded?.Invoke(ended);
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _health.MarkCleanExit();
        EndSession();
        _ws.Dispose();
        _remote.Dispose(); // a regra do firewall fica enquanto o recurso estiver ligado; sai ao desligar ou desinstalar
        _log.Dispose();
    }
}
