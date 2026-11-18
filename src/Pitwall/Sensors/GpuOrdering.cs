using System.Management;
using System.Text;
using System.Text.RegularExpressions;
using LibreHardwareMonitor.Hardware;
using Microsoft.Win32;

namespace Pitwall.Sensors;

/// <summary>
/// Ordena GPUs pelo slot PCIe: a de menor número de barramento (o x16 ligado à CPU) é a principal.
/// O LHM não expõe o barramento, então cruzamos pelo nome com Win32_VideoController + LocationInformation do registro.
/// </summary>
public static partial class GpuOrdering
{
    sealed record Adapter(string Name, int Bus, string Location);

    static List<Adapter>? _adapters;

    public static List<IHardware> Order(List<IHardware> gpus, string preference)
    {
        if (preference != "auto")
        {
            var chosen = gpus.FirstOrDefault(g => g.Identifier.ToString() == preference);
            if (chosen != null) return gpus.OrderBy(g => g == chosen ? 0 : 1).ToList();
        }

        var adapters = Adapters();
        return gpus
            .OrderBy(g => adapters.FirstOrDefault(a => NameMatches(a.Name, g.Name))?.Bus ?? int.MaxValue)
            .ThenBy(g => g.HardwareType == HardwareType.GpuIntel ? 1 : 0) // integrada por último
            .ToList();
    }

    public static string Describe()
    {
        var sb = new StringBuilder();
        foreach (var a in Adapters().OrderBy(a => a.Bus))
            sb.AppendLine($"  bus {a.Bus,3}  {a.Name}  ({a.Location})");
        return sb.ToString();
    }

    static bool NameMatches(string wmiName, string lhmName) =>
        lhmName.Contains(wmiName, StringComparison.OrdinalIgnoreCase) ||
        wmiName.Contains(lhmName, StringComparison.OrdinalIgnoreCase) ||
        Normalize(lhmName).Contains(Normalize(wmiName)) ||
        Normalize(wmiName).Contains(Normalize(lhmName));

    static string Normalize(string s) =>
        Regex.Replace(s.ToLowerInvariant().Replace("nvidia", "").Replace("amd", "").Replace("(tm)", "").Replace("series", ""), @"\s+", "");

    static List<Adapter> Adapters()
    {
        if (_adapters != null) return _adapters;
        var list = new List<Adapter>();
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Name, PNPDeviceID FROM Win32_VideoController");
            foreach (var mo in searcher.Get())
            {
                var name = mo["Name"] as string ?? "";
                var pnp = mo["PNPDeviceID"] as string ?? "";
                var location = Registry.LocalMachine
                    .OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\" + pnp)?
                    .GetValue("LocationInformation") as string ?? "";
                var m = TupleRegex().Match(location);
                if (!m.Success) m = FirstNumberRegex().Match(location);
                var bus = m.Success ? int.Parse(m.Groups[1].Value) : int.MaxValue;
                list.Add(new Adapter(name, bus, location));
            }
        }
        catch
        {
            // WMI indisponível: fica a ordem do LHM
        }
        return _adapters = list;
    }

    // Texto pronto ("PCI bus 1, device 0, function 0", ou localizado) ou recurso indireto
    // ("@System32\drivers\pci.sys,#65536;PCI bus %1, ...;(1,0,0)"): o barramento é o 1º número da tupla, senão o 1º número.
    [GeneratedRegex(@"\((\d+),\d+,\d+\)$")]
    private static partial Regex TupleRegex();

    [GeneratedRegex(@"(\d+)")]
    private static partial Regex FirstNumberRegex();
}
