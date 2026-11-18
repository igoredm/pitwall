using System.Text;
using System.Text.RegularExpressions;
using LibreHardwareMonitor.Hardware;
using Pitwall.Metrics;

namespace Pitwall.Sensors;

/// <summary>
/// Lê sensores via LibreHardwareMonitorLib (0.9.6+, driver PawnIO — sem WinRing0).
/// Os nomes de sensores mapeados abaixo foram conferidos com o dump real (Pitwall.exe --dump-sensors).
/// </summary>
public sealed partial class SensorService : IDisposable
{
    readonly Computer _computer;
    /// <summary>Hardware a atualizar e a cada quantos ticks (sensores lentos/estáveis atualizam menos).</summary>
    readonly List<(IHardware Hardware, int Every)> _toUpdate = [];
    long _tick;
    readonly Dictionary<string, ISensor> _map = [];
    readonly List<ISensor> _coreClocks = [];
    readonly Dictionary<string, ISensor[]> _coreLoads = [];
    readonly List<MetricDefinition> _dynamic = [];
    /// <summary>Hardware de "Outros" (discos, placa-mãe, rede): só atualiza se alguma métrica dele estiver ativa.</summary>
    readonly List<(IHardware Hardware, int Every, string[] Ids)> _optional = [];
    List<(IHardware Hardware, int Every)> _activeOptional = [];
    readonly List<(IHardware Hardware, ISensor Up, ISensor Down)> _nics = [];
    bool _netActive;

    public string CpuName { get; private set; } = "CPU";
    public string? GpuName { get; private set; }
    public string? Gpu2Name { get; private set; }
    public string? GpuIdentifier { get; private set; }

    /// <summary>Métricas que dependem do hardware detectado (por núcleo etc.).</summary>
    public IReadOnlyList<MetricDefinition> DynamicDefinitions => _dynamic;

    public SensorService(string primaryGpuPreference)
    {
        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            // "Outros": só são atualizados se alguma métrica deles estiver ativa (ver SetActive)
            IsStorageEnabled = true,
            IsNetworkEnabled = true,
            IsMotherboardEnabled = true,
        };
        _computer.Open();
        UpdateHardware(_computer.Hardware);
        BuildMap(primaryGpuPreference);
    }

    /// <summary>IDs de métricas com sensor real (ou derivadas cujas fontes existem).</summary>
    public HashSet<string> AvailableIds()
    {
        var ids = _map.Keys.ToHashSet();
        ids.UnionWith(_coreLoads.Keys);
        if (_nics.Count > 0) { ids.Add("net.up"); ids.Add("net.down"); }
        if (ids.Contains("gpu.temp") && ids.Contains("gpu.hotspot")) ids.Add("gpu.hotspotDelta");
        if (ids.Contains("ram.used") && _map.ContainsKey("ram.available")) ids.Add("ram.total");
        if (_coreClocks.Count > 0) ids.Add("cpu.clockAvg");
        if (_map.ContainsKey("gpu.vramUsedMb")) ids.Add("gpu.vramUsed");
        if (_map.ContainsKey("gpu.vramUsedMb") && _map.ContainsKey("gpu.vramTotalMb")) ids.Add("gpu.vramLoad");
        ids.Remove("gpu.vramUsedMb");
        ids.Remove("gpu.vramTotalMb");
        ids.Remove("ram.available");
        return ids;
    }

    readonly Lock _gate = new();

    public void Read(Dictionary<string, double?> values)
    {
        lock (_gate) ReadCore(values);
    }

    void ReadCore(Dictionary<string, double?> values)
    {
        _tick++;
        foreach (var (hw, every) in _toUpdate)
            if (_tick % every == 0 || _tick == 1) hw.Update();
        foreach (var (hw, every) in _activeOptional)
            if (_tick % every == 0 || _tick == 1) hw.Update();

        foreach (var (id, sensor) in _map)
        {
            // Hardware opcional desligado não é atualizado: não publicar valor congelado
            if (_inactive.Contains(id)) values.Remove(id);
            else values[id] = sensor.Value;
        }
        if (!_netActive) { values.Remove("net.up"); values.Remove("net.down"); }

        values["gpu.hotspotDelta"] = values.GetValueOrDefault("gpu.hotspot") - values.GetValueOrDefault("gpu.temp");

        if (_map.ContainsKey("ram.available"))
            values["ram.total"] = values.GetValueOrDefault("ram.used") + values.GetValueOrDefault("ram.available");
        values.Remove("ram.available");

        if (_coreClocks.Count > 0)
        {
            double sum = 0; int n = 0;
            foreach (var s in _coreClocks)
                if (s.Value is { } v && v > 0) { sum += v; n++; }
            values["cpu.clockAvg"] = n > 0 ? sum / n : null;
        }

        foreach (var (id, sensors) in _coreLoads)
        {
            double sum = 0; int n = 0;
            foreach (var s in sensors)
                if (s.Value is { } v) { sum += v; n++; }
            values[id] = n > 0 ? sum / n : null;
        }

        // Rede: adaptador físico com mais tráfego agora (evita somar VPN/filtros duas vezes)
        if (_netActive)
        {
            (double Up, double Down)? best = null;
            foreach (var (hw, up, down) in _nics)
            {
                hw.Update();
                var u = up.Value ?? 0; var d = down.Value ?? 0;
                if (best == null || u + d > best.Value.Up + best.Value.Down) best = (u, d);
            }
            values["net.up"] = best?.Up / 1_048_576.0;
            values["net.down"] = best?.Down / 1_048_576.0;
        }

        if (values.Remove("gpu.vramUsedMb", out var usedMb))
        {
            values["gpu.vramUsed"] = usedMb / 1024.0;
            if (values.Remove("gpu.vramTotalMb", out var totalMb) && totalMb > 0)
                values["gpu.vramLoad"] = usedMb / totalMb * 100.0;
        }
    }

    void BuildMap(string primaryGpuPreference)
    {
        var all = _computer.Hardware.SelectMany(h => h.SubHardware.Prepend(h)).ToList();

        // CPU — nomes reais no 12600K: temperatura/clock "P-Core #n"/"E-Core #n";
        // uso "CPU Core #n Thread #m" (P-cores, com HT) e "CPU Core #n" (E-cores, numeração contínua).
        var cpu = all.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu);
        if (cpu != null)
        {
            CpuName = cpu.Name;
            Map("cpu.load", cpu, SensorType.Load, "CPU Total");
            Map("cpu.temp", cpu, SensorType.Temperature, "CPU Package", "Core (Tctl/Tdie)", "Core Max");
            Map("cpu.power", cpu, SensorType.Power, "CPU Package", "Package");

            var cores = new List<(string Key, string Label)>();
            foreach (var s in cpu.Sensors.Where(s => s.SensorType == SensorType.Temperature).OrderBy(s => s.Index))
            {
                var m = CoreRegex().Match(s.Name);
                if (!m.Success) continue;
                var (key, label) = m.Groups[1].Value switch
                {
                    "P-" => ($"p{m.Groups[2].Value}", $"P-Core {m.Groups[2].Value}"),
                    "E-" => ($"e{m.Groups[2].Value}", $"E-Core {m.Groups[2].Value}"),
                    _ => ($"c{m.Groups[2].Value}", $"Core {m.Groups[2].Value}"),
                };
                cores.Add((key, label));
                AddDynamic($"cpu.{key}.temp", s, MetricGroup.Cpu, $"{label} · temperatura", "°C", 85, 95);
                var clock = cpu.Sensors.FirstOrDefault(c => c.SensorType == SensorType.Clock && c.Name == s.Name);
                if (clock != null)
                {
                    AddDynamic($"cpu.{key}.clock", clock, MetricGroup.Cpu, $"{label} · clock", "MHz");
                    _coreClocks.Add(clock);
                }
            }

            // Uso por núcleo: índice global n → n-ésimo núcleo da lista acima; threads do mesmo núcleo são somadas em média.
            foreach (var group in cpu.Sensors
                         .Where(s => s.SensorType == SensorType.Load)
                         .Select(s => (Sensor: s, Match: LoadRegex().Match(s.Name)))
                         .Where(x => x.Match.Success)
                         .GroupBy(x => int.Parse(x.Match.Groups[1].Value)))
            {
                var n = group.Key;
                var (key, label) = n - 1 < cores.Count ? cores[n - 1] : ($"c{n}", $"Core {n}");
                var id = $"cpu.{key}.load";
                _coreLoads[id] = group.Select(x => x.Sensor).ToArray();
                _dynamic.Add(new MetricDefinition(id, MetricGroup.Cpu, $"{label} · uso", "%"));
            }
            _toUpdate.Add((cpu, 1));
        }

        // GPUs: principal = slot PCIe principal (menor número de barramento)
        var gpus = all.Where(h => h.HardwareType is HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel).ToList();
        var ordered = GpuOrdering.Order(gpus, primaryGpuPreference);
        if (ordered.Count > 0)
        {
            var g = ordered[0];
            GpuName = g.Name;
            GpuIdentifier = g.Identifier.ToString();
            Map("gpu.load", g, SensorType.Load, "GPU Core", "D3D 3D");
            Map("gpu.temp", g, SensorType.Temperature, "GPU Core");
            Map("gpu.hotspot", g, SensorType.Temperature, "GPU Hot Spot", "GPU Hotspot");
            Map("gpu.memjunction", g, SensorType.Temperature, "GPU Memory Junction", "GPU Memory");
            Map("gpu.clock", g, SensorType.Clock, "GPU Core");
            Map("gpu.memclock", g, SensorType.Clock, "GPU Memory");
            Map("gpu.power", g, SensorType.Power, "GPU Package", "GPU Board Power", "GPU Power");
            Map("gpu.powerLimit", g, SensorType.Load, "GPU Power", "GPU Board Power");
            Map("gpu.vramUsedMb", g, SensorType.SmallData, "GPU Memory Used", "D3D Dedicated Memory Used");
            Map("gpu.vramTotalMb", g, SensorType.SmallData, "GPU Memory Total", "D3D Dedicated Memory Total");
            Map("gpu.fan", g, SensorType.Control, "GPU Fan 1", "GPU Fan");
            Map("gpu.fanRpm", g, SensorType.Fan, "GPU Fan 1", "GPU Fan");
            Map("gpu.voltage", g, SensorType.Voltage, "GPU Core Voltage", "GPU Core");
            _toUpdate.Add((g, 1));
        }
        if (ordered.Count > 1)
        {
            var g2 = ordered[1];
            Gpu2Name = g2.Name;
            Map("gpu2.load", g2, SensorType.Load, "GPU Core", "D3D 3D");
            Map("gpu2.temp", g2, SensorType.Temperature, "GPU Core");
            _toUpdate.Add((g2, 1));
        }

        // RAM — "Total Memory" (/ram) é a física; "Virtual Memory" (/vram) é o commit.
        var ram = all.FirstOrDefault(h => h.HardwareType == HardwareType.Memory && h.Identifier.ToString() == "/ram");
        if (ram != null)
        {
            Map("ram.load", ram, SensorType.Load, "Memory");
            Map("ram.used", ram, SensorType.Data, "Memory Used");
            Map("ram.available", ram, SensorType.Data, "Memory Available");
            _toUpdate.Add((ram, 2));
        }
        var vram = all.FirstOrDefault(h => h.HardwareType == HardwareType.Memory && h.Identifier.ToString() == "/vram");
        if (vram != null)
        {
            Map("ram.virtualLoad", vram, SensorType.Load, "Memory");
            _toUpdate.Add((vram, 4));
        }
        // Temperatura dos pentes (SPD) — "DIMM #n"
        foreach (var dimm in all.Where(h => h.HardwareType == HardwareType.Memory && h.Name.StartsWith("DIMM #")))
        {
            var t = dimm.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Temperature && s.Name == dimm.Name);
            if (t == null) continue;
            var n = dimm.Name["DIMM #".Length..];
            AddDynamic($"ram.dimm{n}.temp", t, MetricGroup.Other, $"RAM · pente {n}", "°C", 55, 65);
            _toUpdate.Add((dimm, 10)); // SPD via SMBus: lento, e temperatura de pente muda devagar
        }

        BuildOptional(all);
        _inactive = _optional.SelectMany(o => o.Ids).ToHashSet();
    }

    void BuildOptional(List<IHardware> all)
    {
        // Placa-mãe (SuperIO: nomes reais "Temperature #n" / "Fan #n"; na TUF Z690 é um NCT6798D)
        foreach (var sio in all.Where(h => h.HardwareType == HardwareType.SuperIO))
        {
            var ids = new List<string>();
            foreach (var t in sio.Sensors.Where(s => s.SensorType == SensorType.Temperature).OrderBy(s => s.Index))
            {
                var id = $"mb.temp{t.Index}";
                AddDynamic(id, t, MetricGroup.Other, $"Placa-mãe · {Translate(t.Name)}", "°C", 70, 85);
                ids.Add(id);
            }
            // Só fans que estão girando (as outras entradas não têm nada ligado)
            foreach (var f in sio.Sensors.Where(s => s.SensorType == SensorType.Fan && s.Value > 0).OrderBy(s => s.Index))
            {
                var id = $"mb.fan{f.Index}";
                AddDynamic(id, f, MetricGroup.Other, $"Fan do gabinete · {Translate(f.Name)}", "RPM");
                ids.Add(id);
            }
            _optional.Add((sio, 2, [.. ids]));
        }

        // Discos
        var n = 0;
        foreach (var disk in all.Where(h => h.HardwareType == HardwareType.Storage))
        {
            n++;
            var ids = new List<string>();
            var temp = disk.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Temperature && s.Name is "Composite Temperature" or "Temperature");
            if (temp != null) { AddDynamic($"disk{n}.temp", temp, MetricGroup.Other, $"{disk.Name.Trim()} · temperatura", "°C", 60, 70); ids.Add($"disk{n}.temp"); }
            var used = disk.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Load && s.Name == "Used Space");
            if (used != null) { AddDynamic($"disk{n}.used", used, MetricGroup.Other, $"{disk.Name.Trim()} · espaço usado", "%", 90, 97); ids.Add($"disk{n}.used"); }
            var act = disk.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Load && s.Name == "Total Activity");
            if (act != null) { AddDynamic($"disk{n}.activity", act, MetricGroup.Other, $"{disk.Name.Trim()} · atividade", "%"); ids.Add($"disk{n}.activity"); }
            _optional.Add((disk, 10, [.. ids])); // SMART é lento; temperatura de disco muda devagar
        }

        // Rede: ignora filtros/drivers intermediários ("…-0000") e adaptadores virtuais do Wi-Fi Direct ("Conexão Local* n")
        foreach (var nic in all.Where(h => h.HardwareType == HardwareType.Network))
        {
            if (nic.Name.EndsWith("-0000") || nic.Name.Contains('*')) continue;
            var up = nic.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Throughput && s.Name == "Upload Speed");
            var down = nic.Sensors.FirstOrDefault(s => s.SensorType == SensorType.Throughput && s.Name == "Download Speed");
            if (up != null && down != null) _nics.Add((nic, up, down));
        }
        if (_nics.Count > 0)
        {
            _dynamic.Add(new MetricDefinition("net.down", MetricGroup.Other, "Rede · download", "MB/s"));
            _dynamic.Add(new MetricDefinition("net.up", MetricGroup.Other, "Rede · upload", "MB/s"));
        }
    }

    static string Translate(string name) => name
        .Replace("Temperature", "Temperatura")
        .Replace("CPU Core", "CPU (socket)");

    /// <summary>Nome real do sensor (para a coluna "Sensor" da configuração).</summary>
    public string? SourceOf(string id)
    {
        if (_map.TryGetValue(id, out var s)) return $"{s.Hardware.Name} · {s.Name}";
        if (_map.TryGetValue(id + "Mb", out s)) return $"{s.Hardware.Name} · {s.Name}";
        if (_coreLoads.TryGetValue(id, out var loads)) return $"{loads[0].Hardware.Name} · {string.Join(" + ", loads.Select(l => l.Name))}";
        return id switch
        {
            "gpu.hotspotDelta" => "calculado: hot spot − núcleo",
            "ram.total" => "calculado: usada + disponível",
            "cpu.clockAvg" => "calculado: média dos núcleos",
            "gpu.vramLoad" => "calculado: usada / total",
            "net.up" or "net.down" => "adaptador com mais tráfego",
            _ => null,
        };
    }

    /// <summary>Define quais métricas estão ativas; hardware opcional sem métricas ativas deixa de ser consultado.</summary>
    public void SetActive(IReadOnlySet<string> active)
    {
        lock (_gate)
        {
            _activeOptional = _optional.Where(o => o.Ids.Any(active.Contains)).Select(o => (o.Hardware, o.Every)).ToList();
            _netActive = active.Contains("net.up") || active.Contains("net.down");
            _inactive = _optional.Where(o => !o.Ids.Any(active.Contains)).SelectMany(o => o.Ids).ToHashSet();
        }
    }

    HashSet<string> _inactive = [];

    public IReadOnlyCollection<string> OptionalIds => _optional.SelectMany(o => o.Ids).Concat(_nics.Count > 0 ? ["net.up", "net.down"] : []).ToArray();

    void AddDynamic(string id, ISensor sensor, MetricGroup group, string name, string unit, double? warn = null, double? crit = null)
    {
        if (_map.ContainsKey(id)) return;
        _map[id] = sensor;
        _dynamic.Add(new MetricDefinition(id, group, name, unit, false, warn, crit));
    }

    void Map(string id, IHardware hw, SensorType type, params string[] names)
    {
        foreach (var name in names)
        {
            var s = hw.Sensors.FirstOrDefault(x => x.SensorType == type && string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
            if (s != null) { _map[id] = s; return; }
        }
    }

    static void UpdateHardware(IEnumerable<IHardware> hardware)
    {
        foreach (var hw in hardware)
        {
            hw.Update();
            UpdateHardware(hw.SubHardware);
        }
    }

    /// <summary>Lista todos os sensores expostos pelo LibreHardwareMonitor neste PC.</summary>
    public string Dump()
    {
        lock (_gate) return DumpCore();
    }

    string DumpCore()
    {
        UpdateHardware(_computer.Hardware);
        var sb = new StringBuilder();
        sb.AppendLine($"Pitwall sensor dump — {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
        sb.AppendLine($"GPU principal: {GpuName ?? "-"} ({GpuIdentifier ?? "-"}) · GPU 2: {Gpu2Name ?? "-"}");
        sb.AppendLine();
        foreach (var hw in _computer.Hardware) DumpHardware(sb, hw, 0);
        sb.AppendLine();
        sb.AppendLine("Mapeamento:");
        foreach (var (id, s) in _map.OrderBy(k => k.Key))
            sb.AppendLine($"  {id,-22} <- {s.Hardware.Name} / {s.SensorType} / {s.Name}");
        sb.AppendLine();
        sb.AppendLine("Ordem das GPUs:");
        sb.AppendLine(GpuOrdering.Describe());
        return sb.ToString();
    }

    static void DumpHardware(StringBuilder sb, IHardware hw, int depth)
    {
        var pad = new string(' ', depth * 2);
        sb.AppendLine($"{pad}[{hw.HardwareType}] {hw.Name}  ({hw.Identifier})");
        foreach (var s in hw.Sensors.OrderBy(s => s.SensorType).ThenBy(s => s.Index))
            sb.AppendLine($"{pad}  {s.SensorType,-12} {s.Name,-36} {(s.Value is { } v ? v.ToString("0.##") : "null"),10}   {s.Identifier}");
        foreach (var sub in hw.SubHardware) DumpHardware(sb, sub, depth + 1);
    }

    public void Dispose() => _computer.Close();

    [GeneratedRegex(@"^(?:CPU )?(P-|E-)?Core #(\d+)$")]
    private static partial Regex CoreRegex();

    [GeneratedRegex(@"^CPU Core #(\d+)(?: Thread #\d+)?$")]
    private static partial Regex LoadRegex();
}
