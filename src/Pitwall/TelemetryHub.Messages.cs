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

/// <summary>Mensagens do cliente local (WebSocket): o switch de HandleMessage e as respostas sob demanda.</summary>
public sealed partial class TelemetryHub
{
    string? HandleMessage(string raw)
    {
        try
        {
            var node = JsonNode.Parse(raw);
            if (node != null && Updater?.TryHandle(node, out var updateReply) == true) return updateReply;
            switch (node?["type"]?.GetValue<string>())
            {
                case "setConfig":
                    var cfg = node["config"].Deserialize<AppConfig>(ConfigStore.Json);
                    if (cfg != null)
                    {
                        // Posição/tamanho da janela são do host; não deixar um config antigo da página sobrescrever.
                        var cur = _config.Current.Widget;
                        if (cfg.Widget.Monitor == cur.Monitor)
                            (cfg.Widget.X, cfg.Widget.Y, cfg.Widget.Width, cfg.Widget.Height) = (cur.X, cur.Y, cur.Width, cur.Height);
                        ConfigStore.Sanitize(cfg);
                        if (!LogFolderAllowed(cfg.Log.Folder)) cfg.Log.Folder = _config.Current.Log.Folder;
                        // Celulares pareados só mudam por startPairing/revokeDevice, nunca pelo config da página.
                        cfg.Remote.PairedDevices = _config.Current.Remote.PairedDevices;
                        // Tour: cliente antigo que só conhece tutorialDone continua funcionando (tutorialDone = tour.done)
                        ConfigStore.SyncTour(cfg, _config.Current, node["config"]?["tour"] is JsonObject);
                        _config.Replace(cfg);
                    }
                    return null;
                case "placeTopRight":
                    PlaceTopRightRequested?.Invoke(node["layout"]?.GetValue<string>() == "mid" ? "mid" : "compact",
                        node["corner"]?.GetValue<string>() is "tl" or "bl" or "br" ? node["corner"]!.GetValue<string>() : "tr");
                    return null;
                case "fillMonitor":
                    FillMonitorRequested?.Invoke();
                    return null;
                case "refreshBatteries":
                    _battery.RefreshNow();
                    return null;
                case "restoreDefaults":
                    _config.RestoreDefaults();
                    return null;
                case "getState":
                    return CatalogMessage();
                case "startPairing":
                    return StartPairing();
                case "listDevices":
                    return DevicesMessage();
                case "revokeDevice":
                {
                    var id = node["id"]?.GetValue<string>();
                    if (string.IsNullOrEmpty(id)) return null;
                    _config.Update(c => c.Remote.PairedDevices = [.. c.Remote.PairedDevices.Where(d => d.Id != id)]);
                    _remote.Disconnect(id);
                    _ws.Broadcast(DevicesMessage());
                    return null;
                }
                // 1.2: só neste socket local (o da rede ignora mensagens do cliente)
                case "createApiToken":
                    return CreateApiToken(node);
                case "getSensorDump":
                    // Thread do socket, não a do tick: o tick só espera o lock enquanto o hardware parado é lido
                    return JsonSerializer.Serialize(new { type = "sensorDump", text = SensorDump() });
                case "dismissCrashReport":
                    if (_crashReport is { } report)
                    {
                        CrashDetector.Dismiss(report.Session.Start);
                        _crashReport = null;
                        _ws.Broadcast(CatalogMessage());
                    }
                    return null;
                case "getPcReport":
                {
                    var pcReport = _health.ReportMessage(_crashFeature);
                    ApplyGameExitsFromReport();
                    return pcReport;
                }
                // 1.3
                case "getTrend":
                    return TrendMessage(node);
                case "startBenchmark":
                case "cancelBenchmark":
                case "getBenchmarks":
                case "renameBenchmark":
                case "deleteBenchmark":
                    return BenchmarkMessage(node["type"]!.GetValue<string>(), node);
                case "getPcIncident":
                    return _health.IncidentMessage(Str(node["id"]));
                case "dismissPcIncident":
                    if (_health.Dismiss(Str(node["id"]))) _ws.Broadcast(CatalogMessage());
                    return _health.ReportMessage(_crashFeature);
                case "acceptGameSuggestion":
                case "dismissGameSuggestion":
                {
                    // Só vale para a sugestão atual (a página não escolhe um exe qualquer)
                    if (_suggester.Suggestion is not { } exe) return null;
                    var sent = node["exe"]?.GetValue<string>();
                    if (sent != null && !string.Equals(sent, exe, StringComparison.OrdinalIgnoreCase)) return null;
                    var accept = node["type"]!.GetValue<string>() == "acceptGameSuggestion";
                    _suggester.Clear();
                    _config.Update(c =>
                    {
                        var list = accept ? c.Games.Include : c.Games.DismissedSuggestions;
                        if (!list.Contains(exe, StringComparer.OrdinalIgnoreCase)) list.Add(exe);
                    });
                    return null;
                }
                case "testAlert":
                    AlertRaised?.Invoke(L.T("Pitwall · aviso de teste", "Pitwall · test alert"),
                        L.T("É assim que o aviso aparece quando uma métrica fica no vermelho.", "This is how the alert looks when a metric stays in the red."));
                    return null;
                case "replayTutorial":
                    // A página recebe tour = { step: 0, done: false, dismissed: false } (e tutorialDone = false) e abre o tour
                    _config.Update(ConfigStore.ResetTour);
                    return null;
                case "getSessions":
                    return SessionsPageMessage(node);
                case "getLogStats":
                    return LogStatsMessage(node);
                case "getSessionSeries":
                    return SessionSeriesMessage(node);
                case "addMarker":
                {
                    string? note = null;
                    try { note = node["note"]?.GetValue<string>(); } catch { }
                    AddMarker(note, SessionMarker.ViaButton);
                    return null;
                }
                case "resetExtremes":
                    if (!_config.Current.Features.SessionPeaks) return null;
                    _extremes.Reset();
                    _ws.Broadcast(ExtremesMessage());
                    return null;
#if DEBUG
                case "quit":
                    QuitRequested?.Invoke();
                    return null;
#endif
            }
        }
        catch (Exception ex)
        {
            return JsonSerializer.Serialize(new { type = "error", message = ex.Message });
        }
        return null;
    }

    /// <summary>
    /// 1.2: grava um marcador. Em jogo: na sessão aberta (markers) e no CSV (coluna marker); fora: só o CSV atual, o
    /// broadcast e o aviso. Pode ser chamado de qualquer thread (salva o sessions.json: não chamar na thread da interface).
    /// <paramref name="via"/> = <see cref="SessionMarker.ViaHotkey"/> (atalho) ou <see cref="SessionMarker.ViaButton"/> (addMarker).
    /// </summary>
    public MarkerEvent AddMarker(string? note, string? via = null)
    {
        note = string.IsNullOrWhiteSpace(note) ? null : note.Trim()[..Math.Min(note.Trim().Length, 200)];
        var at = DateTime.Now;
        var exe = CurrentGame?.Exe;
        var index = _sessions.AddMarker(at, note, via) ?? Interlocked.Increment(ref _pcMarkers);
        _log.MarkNext();
        var ev = new MarkerEvent(index, at, _sessions.Open != null ? exe : null, note);
        _ws.Broadcast(JsonSerializer.Serialize(new { type = "marker", index, at, exe = ev.Exe, via }, ConfigStore.Json));
        MarkerAdded?.Invoke(ev);
        return ev;
    }

    /// <summary>getSessionSeries → sessionSeries. Lê o CSV da sessão (na thread do cliente do WebSocket, não na de telemetria).</summary>
    string SessionSeriesMessage(JsonNode node)
    {
        string? startText = null;
        try { startText = node["start"]?.GetValue<string>(); } catch { }
        var points = Math.Clamp(Int(node["points"]) ?? SessionSeries.DefaultPoints, 2, SessionSeries.MaxPoints);
        string Reply(double stepSec, object? series, bool available) =>
            JsonSerializer.Serialize(new { type = "sessionSeries", start = startText, stepSec, series = series ?? new { }, available }, ConfigStore.Json);
        if (startText == null || !DateTimeOffset.TryParse(startText, System.Globalization.CultureInfo.InvariantCulture,
                System.Globalization.DateTimeStyles.AssumeLocal, out var start))
            return Reply(0, null, false);
        var session = _sessions.Find(start.LocalDateTime);
        var file = session?.CsvFile;
        if (session != null && file == null && ReferenceEquals(session, _sessions.Open)) file = _log.CurrentPath;
        if (file == null) return Reply(0, null, false);
        // Só o nome: o arquivo tem que estar na pasta de logs
        var path = Path.Combine(_config.Current.Log.Folder, Path.GetFileName(file));
        try
        {
            if (!File.Exists(path)) return Reply(0, null, false);
            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete, 64 * 1024, FileOptions.SequentialScan);
            using var reader = new StreamReader(stream);
            var result = SessionSeries.Read(reader, points);
            return result == null ? Reply(0, null, false) : Reply(result.StepSec, result.Series, true);
        }
        catch
        {
            return Reply(0, null, false);
        }
    }

    /// <summary>getSessions → sessionsPage (só para quem pediu).</summary>
    string SessionsPageMessage(JsonNode node)
    {
        var offset = Int(node["offset"]) ?? 0;
        var limit = Int(node["limit"]) ?? SessionStore.MaxPageSize;
        string? exe = null;
        try { exe = node["exe"]?.GetValue<string>(); } catch { }
        var (total, sessions) = _sessions.Page(offset, limit, exe);
        return JsonSerializer.Serialize(new { type = "sessionsPage", total, offset = Math.Max(0, offset), sessions }, ConfigStore.Json);
    }

    /// <summary>
    /// getLogStats → logStats (só para quem pediu): uso da pasta de logs e o que a retenção apagaria com os valores dados
    /// (ausentes = os da config). Nada é apagado aqui.
    /// </summary>
    string LogStatsMessage(JsonNode node)
    {
        var log = _config.Current.Log;
        var keepDays = Int(node["keepDays"]) is { } k ? ConfigStore.SnapKeepDays(k) : log.KeepDays;
        var maxTotalMb = Int(node["maxTotalMb"]) is { } m ? Math.Clamp(m, 0, 1_000_000) : log.MaxTotalMb;
        var stats = LogRetention.Stats(LogRetention.ListFiles(log.Folder), DateTime.UtcNow, keepDays, maxTotalMb * 1024L * 1024L,
            RetentionProtected());
        return JsonSerializer.Serialize(new
        {
            type = "logStats",
            totalBytes = stats.TotalBytes,
            files = stats.Files,
            oldest = stats.OldestUtc?.ToLocalTime(),
            wouldDeleteFiles = stats.WouldDeleteFiles,
            wouldDeleteBytes = stats.WouldDeleteBytes,
        }); // sem ConfigStore.Json: oldest vai como null explícito
    }

    static string? Str(JsonNode? n)
    {
        try { return n?.GetValue<string>(); } catch { return null; }
    }

    /// <summary>Número inteiro de um campo JSON (aceita 30 ou 30.0); ausente/inválido = null.</summary>
    static int? Int(JsonNode? n)
    {
        try
        {
            if (n is not JsonValue v) return null;
            if (v.TryGetValue<int>(out var i)) return i;
            if (v.TryGetValue<double>(out var d) && double.IsFinite(d)) return (int)Math.Clamp(Math.Round(d), int.MinValue, int.MaxValue);
        }
        catch { }
        return null;
    }

    /// <summary>O processo é elevado: não deixa a config apontar o log para pastas do sistema ou de rede.</summary>
    internal static bool LogFolderAllowed(string? folder)
    {
        if (string.IsNullOrWhiteSpace(folder) || !Path.IsPathFullyQualified(folder) || folder.StartsWith(@"\\")) return false;
        var full = Path.GetFullPath(folder).TrimEnd('\\') + "\\";
        string[] blocked =
        [
            Environment.GetFolderPath(Environment.SpecialFolder.Windows),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
        ];
        return !blocked.Where(b => b.Length > 0).Any(b => full.StartsWith(b.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase));
    }
}
