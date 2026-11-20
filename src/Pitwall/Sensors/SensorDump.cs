using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Pitwall.Sensors;

public sealed record DumpSensor(string Type, string Name, string Identifier, double? Value, double? Min, double? Max);

public sealed record DumpHardware(string Type, string Name, string Identifier, int Depth, List<DumpSensor> Sensors);

/// <summary>Métrica → sensor de onde ela sai (ou "calculado: ...").</summary>
public sealed record DumpMapping(string Id, string Source);

public sealed record DumpMissing(string Id, string Reason, string Text);

/// <summary>Conteúdo da "lista de sensores" (getSensorDump, --dump-sensors, fixtures dos testes).</summary>
public sealed class SensorDumpData
{
    /// <summary>Cabeçalho chave: valor (app, windows, gpuDriver, gpu, gpu2, gpuVendor, pawnIO, admin, presentMon...).</summary>
    public Dictionary<string, string> Header { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<DumpHardware> Hardware { get; } = [];
    public List<DumpMapping> Mapping { get; } = [];
    public List<DumpMissing> Missing { get; } = [];

    public string? Get(string key) => Header.TryGetValue(key, out var v) && v != "-" ? v : null;
    public bool Flag(string key) => Get(key) is "yes" or "true" or "sim";
}

/// <summary>
/// Formato texto da lista de sensores. É o mesmo que o usuário cola na issue e o dos fixtures dos testes
/// (tests/Pitwall.Tests/Fixtures/*.txt): uma lista de outro PC pode ser jogada lá e testada como está.
/// <code>
/// app: 1.2.0
/// [GpuNvidia] NVIDIA GeForce RTX 3080 | /gpu-nvidia/0
///   Temperature | GPU Core | 61.0 | 35.0 | 74.0 | /gpu-nvidia/0/temperature/0
/// </code>
/// Valor/mín/máx com ponto decimal; "-" = sem leitura. Subhardware tem 2 espaços a mais de recuo.
/// Nada de nome do PC, usuário, caminhos ou números de série: tudo passa por <see cref="Scrub"/>.
/// </summary>
public static partial class SensorDumpText
{
    public const string HardwareSection = "== Hardware ==";
    public const string MappingSection = "== Mapeamento · Mapping ==";
    public const string MissingSection = "== Sem leitura · Missing ==";

    public static string Write(SensorDumpData d, IEnumerable<string>? secrets = null)
    {
        var sb = new StringBuilder();
        sb.AppendLine("# Pitwall · lista de sensores · sensor list");
        foreach (var (k, v) in d.Header) sb.AppendLine($"{k}: {Cell(v)}");
        sb.AppendLine();
        sb.AppendLine(HardwareSection);
        foreach (var hw in d.Hardware)
        {
            var pad = new string(' ', hw.Depth * 2);
            sb.AppendLine($"{pad}[{hw.Type}] {Cell(hw.Name)} | {Cell(hw.Identifier)}");
            foreach (var s in hw.Sensors)
                sb.AppendLine($"{pad}  {s.Type} | {Cell(s.Name)} | {Num(s.Value)} | {Num(s.Min)} | {Num(s.Max)} | {Cell(s.Identifier)}");
        }
        sb.AppendLine();
        sb.AppendLine(MappingSection);
        foreach (var m in d.Mapping) sb.AppendLine($"  {m.Id} <- {Cell(m.Source)}");
        if (d.Missing.Count > 0)
        {
            sb.AppendLine();
            sb.AppendLine(MissingSection);
            foreach (var m in d.Missing) sb.AppendLine($"  {m.Id} | {m.Reason} | {Cell(m.Text)}");
        }
        return Scrub(sb.ToString(), secrets ?? DefaultSecrets());
    }

    public static SensorDumpData Parse(string text)
    {
        var d = new SensorDumpData();
        var section = "";
        foreach (var raw in text.Replace("\r", "").Split('\n'))
        {
            var line = raw.TrimEnd();
            var trimmed = line.Trim();
            if (trimmed.Length == 0 || trimmed.StartsWith('#')) continue;
            if (trimmed.StartsWith("== "))
            {
                section = trimmed;
                continue;
            }
            if (section == "")
            {
                var colon = trimmed.IndexOf(':');
                if (colon > 0) d.Header[trimmed[..colon].Trim()] = trimmed[(colon + 1)..].Trim();
                continue;
            }
            if (section == HardwareSection)
            {
                var indent = line.Length - line.TrimStart().Length;
                if (trimmed.StartsWith('['))
                {
                    var close = trimmed.IndexOf(']');
                    if (close < 0) continue;
                    var type = trimmed[1..close];
                    var parts = trimmed[(close + 1)..].Split('|');
                    var hw = new DumpHardware(type, parts[0].Trim(), parts.Length > 1 ? parts[1].Trim() : "", indent / 2, []);
                    d.Hardware.Add(hw);
                    continue;
                }
                var cols = trimmed.Split('|').Select(c => c.Trim()).ToArray();
                if (cols.Length < 6 || d.Hardware.Count == 0) continue;
                d.Hardware[^1].Sensors.Add(new DumpSensor(cols[0], cols[1], cols[5], ParseNum(cols[2]), ParseNum(cols[3]), ParseNum(cols[4])));
                continue;
            }
            if (section == MappingSection)
            {
                var arrow = trimmed.IndexOf("<-", StringComparison.Ordinal);
                if (arrow > 0) d.Mapping.Add(new DumpMapping(trimmed[..arrow].Trim(), trimmed[(arrow + 2)..].Trim()));
                continue;
            }
            if (section == MissingSection)
            {
                var cols = trimmed.Split('|', 3).Select(c => c.Trim()).ToArray();
                if (cols.Length == 3) d.Missing.Add(new DumpMissing(cols[0], cols[1], cols[2]));
            }
        }
        return d;
    }

    static string Cell(string? s) => string.IsNullOrEmpty(s) ? "-" : s.Replace('|', '/').Replace('\r', ' ').Replace('\n', ' ');

    static string Num(double? v) => v is { } x && double.IsFinite(x) ? x.ToString("0.###", CultureInfo.InvariantCulture) : "-";

    static double? ParseNum(string s) =>
        double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : null;

    /// <summary>Nome do PC e do usuário (os textos que mais denunciam quem é) para <see cref="Scrub"/>.</summary>
    public static IEnumerable<string> DefaultSecrets()
    {
        string?[] list = [Environment.MachineName, Environment.UserName, Environment.UserDomainName];
        return list.Where(s => !string.IsNullOrWhiteSpace(s)).Select(s => s!);
    }

    /// <summary>
    /// Tira o que identifica o PC ou a pessoa: nome do PC/usuário (≥ 3 letras), caminhos (C:\..., \\servidor\...),
    /// GUIDs, MACs e o que parece número de série (sequência longa de letras e dígitos misturados, ou hex longo).
    /// </summary>
    public static string Scrub(string text, IEnumerable<string> secrets)
    {
        foreach (var s in secrets.Where(s => s.Trim().Length >= 3).OrderByDescending(s => s.Length))
            text = Regex.Replace(text, @"(?<![A-Za-z0-9])" + Regex.Escape(s.Trim()) + @"(?![A-Za-z0-9])", "<pc>", RegexOptions.IgnoreCase);
        text = PathRegex().Replace(text, "<path>");
        text = GuidRegex().Replace(text, "<id>");
        text = MacRegex().Replace(text, "<mac>");
        text = SerialRegex().Replace(text, m => LooksLikeSerial(m.Value) ? "<serial>" : m.Value);
        return text;
    }

    /// <summary>12+ caracteres com letras e dígitos (ou só hex com 12+): modelo de peça raramente é assim, série é.</summary>
    static bool LooksLikeSerial(string token)
    {
        if (token.Length < 12) return false;
        var digits = token.Count(char.IsDigit);
        var letters = token.Count(char.IsLetter);
        return (digits >= 4 && letters >= 2) || (digits == token.Length && token.Length >= 14);
    }

    [GeneratedRegex(@"(?:[A-Za-z]:\\|\\\\)[^\s|]*")]
    private static partial Regex PathRegex();

    [GeneratedRegex(@"(?:%7B|\{)?[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}(?:%7D|\})?")]
    private static partial Regex GuidRegex();

    [GeneratedRegex(@"\b[0-9A-Fa-f]{2}(?:[:-][0-9A-Fa-f]{2}){5}\b")]
    private static partial Regex MacRegex();

    [GeneratedRegex(@"(?<![A-Za-z0-9])[A-Za-z0-9]{12,}(?![A-Za-z0-9])")]
    private static partial Regex SerialRegex();
}
