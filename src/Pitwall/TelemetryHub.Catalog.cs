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

/// <summary>Mensagens de estado: catálogo, config, sessões, mín/máx e a lista de sensores.</summary>
public sealed partial class TelemetryHub
{
    /// <param name="remote">Versão do celular: sem ajuste da GPU, monitores, relatório de crash nem estado do servidor.</param>
    string CatalogMessage(bool remote = false)
    {
        var screens = Screen.AllScreens;
        var missingContext = MissingContextNow();
        var node = JsonSerializer.SerializeToNode(new
        {
            type = "catalog",
            lang = L.Lang,
            version = typeof(TelemetryHub).Assembly.GetName().Version?.ToString(3),
            admin = new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator),
            presentMon = _presentMon.Available,
            battery = _battery.Available,
            hardware = new
            {
                cpu = _sensors.CpuName,
                gpu = _sensors.GpuName,
                gpu2 = _sensors.Gpu2Name,
                ramGb = SystemInfo.RamGbTotal,
                os = SystemInfo.OsFriendly,
                gpuDriver = _tuner.DriverVersion,
            },
            hotkeys = remote ? null : _hotkeys,
            benchmark = remote ? null : CatalogBenchmark(),
            crashReport = _crashFeature ? _crashReport : null,
            pcPending = _crashFeature ? _health.Pending : null,
            remote = new { running = _remote.Running, port = _remote.Running ? _remote.Port : (int?)null, error = _remote.LastError },
            tuning = _tuner.Caps,
            update = Updater?.State,
            tuningPresets = new[] { "balanced", "cool" }.ToDictionary(p => p, p =>
            {
                var (pp, cp) = GpuTuner.Preset(p);
                return new { powerW = _tuner.Caps.PowerDefaultW * pp / 100, clockMhz = _tuner.Caps.MaxClockMhz * cp / 100 / 15 * 15 };
            }),
            monitors = screens.Select((s, i) => new
            {
                device = s.DeviceName,
                index = i + 1,
                x = s.Bounds.X,
                y = s.Bounds.Y,
                width = s.Bounds.Width,
                height = s.Bounds.Height,
                primary = s.Primary,
            }),
            metrics = _definitions.Select(d =>
            {
                var available = _available.Contains(d.Id);
                var missing = available ? null : MissingReasons.For(d.Id, missingContext);
                return new
                {
                    id = d.Id,
                    group = d.Group.ToString().ToLowerInvariant(),
                    name = L.MetricName(d),
                    unit = d.Unit,
                    isTemperature = d.IsTemperature,
                    available,
                    source = d.Group == MetricGroup.Fps ? (_presentMon.Available ? "PresentMon (ETW)" : null)
                        : d.Id == "gpu.perfcap" ? (available ? "NVML (clocks event reasons)" : null)
                        : _sensors.SourceOf(d.Id),
                    defaultWarn = d.DefaultWarn,
                    defaultCrit = d.DefaultCrit,
                    // 1.2: por que não há leitura, num texto que dá para entender
                    missing = missing?.Reason,
                    missingText = missing?.Text,
                };
            }),
        }, ConfigStore.Json)!.AsObject();
        // Sobre: componente ausente vai como null explícito (o resto do catálogo omite nulls)
        node["about"] = JsonSerializer.SerializeToNode(AboutInfo.Current, AboutJson);
        if (remote)
            foreach (var key in new[] { "admin", "crashReport", "pcPending", "remote", "tuning", "tuningPresets", "monitors", "update", "about" }) node.Remove(key);
        return node.ToJsonString(ConfigStore.Json);
    }

    static readonly JsonSerializerOptions AboutJson = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

    /// <summary>1.2: estado dos atalhos (catalog.hotkeys: ok | inUse | invalid | off), informado pela bandeja.</summary>
    public void SetHotkeyStatus(string toggleWidget, string marker, string benchmark)
    {
        _hotkeys = new { toggleWidget, marker, benchmark };
        _ws.Broadcast(CatalogMessage());
    }

    /// <summary>Config para a página local. Os hashes dos tokens dos celulares não saem do backend.</summary>
    string ConfigMessage()
    {
        var config = JsonSerializer.SerializeToNode(_config.Current, ConfigStore.Json)!;
        if (config["remote"]?["pairedDevices"] is JsonArray devices)
            foreach (var d in devices) (d as JsonObject)?.Remove("tokenHash");
        return new JsonObject { ["type"] = "config", ["config"] = config }.ToJsonString(ConfigStore.Json);
    }

    string SessionsMessage() => JsonSerializer.Serialize(new { type = "sessions", sessions = _sessions.Recent }, ConfigStore.Json);

    /// <summary>Mín/máx completos (cliente recém-conectado); depois disso vão só as mudanças no snapshot.</summary>
    string ExtremesMessage()
    {
        var (epoch, values) = _extremes.Snapshot();
        return JsonSerializer.Serialize(new { type = "extremes", epoch, values });
    }

    /// <summary>1.2: mín/máx desde que o app abriu, completos (cliente local recém-conectado), com a hora de abertura e do boot.</summary>
    string ExtremesAppMessage()
    {
        var (_, values) = _extremesApp.Snapshot();
        return JsonSerializer.Serialize(new { type = "extremesApp", since = new DateTimeOffset(_health.AppStart), bootTime = new DateTimeOffset(_health.BootTime), values });
    }

    MissingContext MissingContextNow() => new(
        _sensors.GpuVendor, _sensors.GpuName,
        PawnIO: AboutInfo.Current.PawnIO != null,
        Admin: new WindowsPrincipal(WindowsIdentity.GetCurrent()).IsInRole(WindowsBuiltInRole.Administrator),
        PresentMon: _presentMon.Available,
        HasDevice: _battery.Devices.Count > 0,
        Gpu2Vendor: _sensors.Gpu2Vendor, Gpu2Name: _sensors.Gpu2Name,
        BatteryOn: _config.Current.Battery.Enabled);

    /// <summary>Lista de sensores (getSensorDump, bandeja): sem nome do PC, usuário, caminhos ou números de série.</summary>
    public string SensorDump()
    {
        var ctx = MissingContextNow();
        var header = new List<(string, string)>
        {
            ("app", typeof(TelemetryHub).Assembly.GetName().Version?.ToString(3) ?? "-"),
            ("windows", SystemInfo.WindowsVersion()),
            ("gpuDriver", SystemInfo.GpuDriver(_sensors.GpuName) ?? "-"),
            ("pawnIO", ctx.PawnIO ? "yes" : "no"),
            ("admin", ctx.Admin ? "yes" : "no"),
            ("presentMon", ctx.PresentMon ? "yes" : "no"),
            ("generated", DateTime.Now.ToString("yyyy-MM-dd HH:mm")),
        };
        var data = _sensors.DumpData(header);
        foreach (var d in _definitions.Where(d => !_available.Contains(d.Id)))
        {
            var m = MissingReasons.For(d.Id, ctx);
            data.Missing.Add(new DumpMissing(d.Id, m.Reason, m.Text));
        }
        return SensorDumpText.Write(data);
    }
}
