using System.Globalization;
using Pitwall.Metrics;

namespace Pitwall.Localization;

/// <summary>
/// Idioma da interface (pt-BR | en). "auto" segue o idioma de exibição do Windows: português → pt-BR, o resto → inglês.
/// Os textos ficam lado a lado no código (L.T("pt", "en")) — são poucos e assim nenhum fica sem tradução.
/// </summary>
public static class L
{
    public static string Lang { get; private set; } = Resolve("auto");
    public static bool En => Lang == "en";

    /// <summary>Aplica a preferência da config. Retorna true se o idioma efetivo mudou.</summary>
    public static bool Set(string? preference)
    {
        var lang = Resolve(preference);
        if (lang == Lang) return false;
        Lang = lang;
        return true;
    }

    public static string Resolve(string? preference) => preference switch
    {
        "pt-BR" or "en" => preference,
        _ => CultureInfo.CurrentUICulture.TwoLetterISOLanguageName == "pt" ? "pt-BR" : "en",
    };

    public static string T(string pt, string en) => En ? en : pt;

    /// <summary>Nome da métrica no idioma atual. Estáticas por id; dinâmicas (núcleos, discos...) por partes.</summary>
    public static string MetricName(MetricDefinition d)
    {
        if (!En) return d.Name;
        if (StaticEn.TryGetValue(d.Id, out var en)) return en;
        var s = d.Name;
        foreach (var (pt, e) in Parts) s = s.Replace(pt, e);
        return s;
    }

    static readonly Dictionary<string, string> StaticEn = new()
    {
        ["fps.avg"] = "Session average FPS",
        ["fps.displayed"] = "Displayed FPS",
        ["fps.graph"] = "Frametime graph",
        ["fps.stutters"] = "Stutters this session",
        ["fps.animError"] = "Animation error",
        ["fps.pcLatency"] = "PC latency",
        ["gpu.load"] = "Load",
        ["gpu.temp"] = "Core",
        ["gpu.hotspotDelta"] = "Δ hot spot − core",
        ["gpu.clock"] = "Core clock",
        ["gpu.memclock"] = "Memory clock",
        ["gpu.power"] = "Power",
        ["gpu.powerLimit"] = "% of power limit",
        ["gpu.vramUsed"] = "VRAM used",
        ["gpu.vramLoad"] = "VRAM usage",
        ["gpu.voltage"] = "Core voltage",
        ["gpu.perfcap"] = "Clock limit reason",
        ["cpu.load"] = "Total load",
        ["cpu.power"] = "Package power",
        ["cpu.clockAvg"] = "Average clock",
        ["ram.load"] = "Load",
        ["ram.used"] = "Used / total",
        ["ram.virtualLoad"] = "Virtual memory (commit)",
        ["gpu2.load"] = "GPU 2 · load",
        ["gpu2.temp"] = "GPU 2 · core",
    };

    static readonly (string Pt, string En)[] Parts =
    [
        ("· temperatura", "· temperature"),
        ("· uso", "· load"),
        ("· espaço usado", "· used space"),
        ("· atividade", "· activity"),
        ("Placa-mãe", "Motherboard"),
        ("Fan do gabinete", "Case fan"),
        ("RAM · pente", "RAM · DIMM"),
        ("Rede ·", "Network ·"),
        ("Temperatura", "Temperature"),
        ("CPU (socket)", "CPU socket"),
    ];
}
