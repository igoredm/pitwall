using LibreHardwareMonitor.Hardware;

namespace Pitwall.Sensors;

/// <summary>De qual hardware uma métrica fixa sai.</summary>
public enum HardwareRole { Cpu, Gpu, Gpu2, Ram, VirtualRam }

/// <summary>Métrica fixa → tipo de sensor e nomes aceitos (o primeiro que existir no hardware ganha).</summary>
public sealed record SensorRule(string Id, HardwareRole Role, SensorType Type, params string[] Names);

/// <summary>
/// Tabela de mapeamento das métricas fixas (as que não dependem de quantos núcleos/discos o PC tem) e as derivadas.
/// Fica separada do <see cref="SensorService"/> para os testes rodarem o mesmo mapeamento sobre um dump de sensores
/// (tests/Pitwall.Tests/Fixtures) sem precisar do hardware.
/// </summary>
public static class SensorMapping
{
    public static readonly IReadOnlyList<SensorRule> Rules =
    [
        new("cpu.load", HardwareRole.Cpu, SensorType.Load, "CPU Total"),
        new("cpu.temp", HardwareRole.Cpu, SensorType.Temperature, "CPU Package", "Core (Tctl/Tdie)", "Core Max"),
        new("cpu.power", HardwareRole.Cpu, SensorType.Power, "CPU Package", "Package"),

        new("gpu.load", HardwareRole.Gpu, SensorType.Load, "GPU Core", "D3D 3D"),
        new("gpu.temp", HardwareRole.Gpu, SensorType.Temperature, "GPU Core"),
        new("gpu.hotspot", HardwareRole.Gpu, SensorType.Temperature, "GPU Hot Spot", "GPU Hotspot"),
        new("gpu.memjunction", HardwareRole.Gpu, SensorType.Temperature, "GPU Memory Junction", "GPU Memory"),
        new("gpu.clock", HardwareRole.Gpu, SensorType.Clock, "GPU Core"),
        new("gpu.memclock", HardwareRole.Gpu, SensorType.Clock, "GPU Memory"),
        new("gpu.power", HardwareRole.Gpu, SensorType.Power, "GPU Package", "GPU Board Power", "GPU Power"),
        new("gpu.powerLimit", HardwareRole.Gpu, SensorType.Load, "GPU Power", "GPU Board Power"),
        new("gpu.vramUsedMb", HardwareRole.Gpu, SensorType.SmallData, "GPU Memory Used", "D3D Dedicated Memory Used"),
        new("gpu.vramTotalMb", HardwareRole.Gpu, SensorType.SmallData, "GPU Memory Total", "D3D Dedicated Memory Total"),
        new("gpu.fan", HardwareRole.Gpu, SensorType.Control, "GPU Fan 1", "GPU Fan"),
        new("gpu.fanRpm", HardwareRole.Gpu, SensorType.Fan, "GPU Fan 1", "GPU Fan"),
        new("gpu.voltage", HardwareRole.Gpu, SensorType.Voltage, "GPU Core Voltage", "GPU Core"),

        new("gpu2.load", HardwareRole.Gpu2, SensorType.Load, "GPU Core", "D3D 3D"),
        new("gpu2.temp", HardwareRole.Gpu2, SensorType.Temperature, "GPU Core"),

        // RAM — "Total Memory" (/ram) é a física; "Virtual Memory" (/vram) é o commit.
        new("ram.load", HardwareRole.Ram, SensorType.Load, "Memory"),
        new("ram.used", HardwareRole.Ram, SensorType.Data, "Memory Used"),
        new("ram.available", HardwareRole.Ram, SensorType.Data, "Memory Available"),
        new("ram.virtualLoad", HardwareRole.VirtualRam, SensorType.Load, "Memory"),
    ];

    public static IEnumerable<SensorRule> For(HardwareRole role) => Rules.Where(r => r.Role == role);

    /// <summary>Nome do sensor escolhido pela regra entre os sensores do hardware (null = nenhum).</summary>
    public static string? Pick(SensorRule rule, IEnumerable<(SensorType Type, string Name)> sensors)
    {
        var list = sensors as IList<(SensorType Type, string Name)> ?? sensors.ToList();
        foreach (var name in rule.Names)
            foreach (var s in list)
                if (s.Type == rule.Type && string.Equals(s.Name, name, StringComparison.OrdinalIgnoreCase))
                    return s.Name;
        return null;
    }

    /// <summary>
    /// Ids com leitura a partir dos sensores mapeados: soma as derivadas (Δ hot spot, total da RAM, VRAM) e tira os
    /// auxiliares que não são métricas (MB da VRAM, RAM disponível).
    /// </summary>
    public static HashSet<string> Available(IEnumerable<string> mapped, bool hasCoreClocks = false, bool hasNics = false)
    {
        var ids = mapped.ToHashSet();
        if (hasNics) { ids.Add("net.up"); ids.Add("net.down"); }
        if (ids.Contains("gpu.temp") && ids.Contains("gpu.hotspot")) ids.Add("gpu.hotspotDelta");
        if (ids.Contains("ram.used") && ids.Contains("ram.available")) ids.Add("ram.total");
        if (hasCoreClocks) ids.Add("cpu.clockAvg");
        if (ids.Contains("gpu.vramUsedMb")) ids.Add("gpu.vramUsed");
        if (ids.Contains("gpu.vramUsedMb") && ids.Contains("gpu.vramTotalMb")) ids.Add("gpu.vramLoad");
        ids.Remove("gpu.vramUsedMb");
        ids.Remove("gpu.vramTotalMb");
        ids.Remove("ram.available");
        return ids;
    }

    /// <summary>
    /// O mesmo mapeamento das métricas fixas aplicado a uma lista de sensores (dump colado numa issue / fixture):
    /// GPU principal e segunda pelos nomes do cabeçalho (gpu, gpu2), RAM por /ram e /vram.
    /// </summary>
    public static Dictionary<string, DumpSensor> MapDump(SensorDumpData d)
    {
        var gpus = d.Hardware.Where(h => h.Type.StartsWith("Gpu", StringComparison.Ordinal)).ToList();
        DumpHardware? ByName(string? name) => name == null ? null : gpus.FirstOrDefault(h => h.Name.Trim() == name.Trim());
        var gpu = ByName(d.Get("gpu")) ?? gpus.FirstOrDefault();
        var gpu2 = ByName(d.Get("gpu2")) ?? (d.Get("gpu2") == null ? null : gpus.FirstOrDefault(g => g != gpu));
        var hw = new Dictionary<HardwareRole, DumpHardware?>
        {
            [HardwareRole.Cpu] = d.Hardware.FirstOrDefault(h => h.Type == nameof(HardwareType.Cpu)),
            [HardwareRole.Gpu] = gpu,
            [HardwareRole.Gpu2] = gpu2 == gpu ? null : gpu2,
            [HardwareRole.Ram] = d.Hardware.FirstOrDefault(h => h.Type == nameof(HardwareType.Memory) && h.Identifier == "/ram"),
            [HardwareRole.VirtualRam] = d.Hardware.FirstOrDefault(h => h.Type == nameof(HardwareType.Memory) && h.Identifier == "/vram"),
        };
        var map = new Dictionary<string, DumpSensor>();
        foreach (var rule in Rules)
        {
            if (hw[rule.Role] is not { } h) continue;
            var sensors = h.Sensors
                .Select(s => (Sensor: s, Ok: Enum.TryParse<SensorType>(s.Type, out var t), Type: t))
                .Where(x => x.Ok).ToList();
            if (Pick(rule, sensors.Select(x => (x.Type, x.Sensor.Name))) is not { } name) continue;
            map[rule.Id] = sensors.First(x => x.Type == rule.Type && x.Sensor.Name == name).Sensor;
        }
        return map;
    }

    /// <summary>Fabricante pelo tipo de hardware do LibreHardwareMonitor: nvidia | amd | intel | null.</summary>
    public static string? Vendor(HardwareType type) => type switch
    {
        HardwareType.GpuNvidia => "nvidia",
        HardwareType.GpuAmd => "amd",
        HardwareType.GpuIntel => "intel",
        _ => null,
    };
}
