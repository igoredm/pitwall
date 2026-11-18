using Pitwall.Config;

namespace Pitwall.Metrics;

public enum MetricGroup { Fps, Gpu, Cpu, Ram, Other }

public sealed record MetricDefinition(
    string Id,
    MetricGroup Group,
    string Name,
    string Unit,
    bool DefaultEnabled = false,
    double? DefaultWarn = null,
    double? DefaultCrit = null,
    bool DefaultSparkline = false)
{
    public bool IsTemperature => Unit == "°C";
}

/// <summary>Catálogo de métricas conhecidas. As que dependem do hardware (por núcleo, discos...) são adicionadas em runtime.</summary>
public static class MetricCatalog
{
    public static readonly IReadOnlyList<MetricDefinition> Static =
    [
        // FPS (PresentMon)
        new("fps.current", MetricGroup.Fps, "FPS", "fps", true),
        new("fps.low1", MetricGroup.Fps, "1% low", "fps", true),
        new("fps.frametime", MetricGroup.Fps, "Frametime", "ms", true),
        new("fps.low01", MetricGroup.Fps, "0.1% low", "fps"),
        new("fps.avg", MetricGroup.Fps, "FPS médio da sessão", "fps"),
        new("fps.graph", MetricGroup.Fps, "Gráfico de frametime", "graph"),

        // GPU principal
        new("gpu.load", MetricGroup.Gpu, "Uso", "%", true),
        new("gpu.temp", MetricGroup.Gpu, "Núcleo", "°C", true, 80, 87, true),
        new("gpu.hotspot", MetricGroup.Gpu, "Hot spot", "°C", true, 95, 105, true),
        new("gpu.memjunction", MetricGroup.Gpu, "Memory junction", "°C", true, 95, 104, true),
        new("gpu.hotspotDelta", MetricGroup.Gpu, "Δ hot spot − núcleo", "°C", true, 20, 25),
        new("gpu.clock", MetricGroup.Gpu, "Clock do núcleo", "MHz"),
        new("gpu.memclock", MetricGroup.Gpu, "Clock da memória", "MHz"),
        new("gpu.power", MetricGroup.Gpu, "Consumo", "W"),
        new("gpu.powerLimit", MetricGroup.Gpu, "% do power limit", "%"),
        new("gpu.vramUsed", MetricGroup.Gpu, "VRAM usada", "GB"),
        new("gpu.vramLoad", MetricGroup.Gpu, "Ocupação da VRAM", "%"),
        new("gpu.fan", MetricGroup.Gpu, "Fan", "%"),
        new("gpu.fanRpm", MetricGroup.Gpu, "Fan", "RPM"),
        new("gpu.voltage", MetricGroup.Gpu, "Voltagem do núcleo", "V"),
        // O LibreHardwareMonitor não expõe o motivo de limitação (PerfCap) da NVIDIA; aparece como "não disponível".
        new("gpu.perfcap", MetricGroup.Gpu, "Motivo de limitação do clock", "text"),

        // CPU
        new("cpu.load", MetricGroup.Cpu, "Uso total", "%", true),
        new("cpu.temp", MetricGroup.Cpu, "Package", "°C", true, 85, 95, true),
        new("cpu.power", MetricGroup.Cpu, "Consumo do pacote", "W"),
        new("cpu.clockAvg", MetricGroup.Cpu, "Clock médio", "MHz"),

        // RAM
        new("ram.load", MetricGroup.Ram, "Uso", "%", true, 85, 95),
        new("ram.used", MetricGroup.Ram, "Usada / total", "GB", true),
        new("ram.total", MetricGroup.Ram, "Total", "GB"),
        new("ram.virtualLoad", MetricGroup.Other, "Memória virtual (commit)", "%"),

        // GPU 2
        new("gpu2.load", MetricGroup.Other, "GPU 2 · uso", "%"),
        new("gpu2.temp", MetricGroup.Other, "GPU 2 · núcleo", "°C", false, 80, 90),
    ];

    /// <summary>Garante uma entrada de configuração para cada métrica estática, com defaults de fábrica.</summary>
    public static void Normalize(AppConfig config)
    {
        EnsureSettings(config, Static);
    }

    public static void EnsureSettings(AppConfig config, IEnumerable<MetricDefinition> defs)
    {
        var known = config.Metrics.Select(m => m.Id).ToHashSet();
        var order = config.Metrics.Count == 0 ? 0 : config.Metrics.Max(m => m.Order) + 1;
        foreach (var def in defs)
        {
            if (known.Contains(def.Id)) continue;
            config.Metrics.Add(new MetricSetting
            {
                Id = def.Id,
                Enabled = def.DefaultEnabled,
                Order = order++,
                Unit = def.IsTemperature ? "C" : null,
                Warn = def.DefaultWarn,
                Crit = def.DefaultCrit,
                Sparkline = def.DefaultSparkline,
            });
        }
    }
}
