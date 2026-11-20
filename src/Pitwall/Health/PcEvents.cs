using System.Diagnostics.Eventing.Reader;
using System.Text.RegularExpressions;

namespace Pitwall.Health;

/// <summary>Dados crus de um registro do Event Log (o que <see cref="PcEvents.Parse"/> precisa; fácil de simular em teste).</summary>
public sealed record RawEvent(string Provider, int Id, byte? Level, DateTime Time, string? Description, IReadOnlyList<object?> Properties);

/// <summary>
/// Eventos do log System que interessam ao Relatório do PC: Kernel-Power 41, EventLog 6008, BugCheck 1001, WHEA-Logger,
/// Display 4101 e nvlddmkm 13/14/153. Leitura sob demanda (nunca na thread de telemetria).
/// </summary>
public static partial class PcEvents
{
    public const int MaxEvents = 200;
    public const int Days = 30;
    const int MaxMessage = 200;

    const string KernelPower = "Microsoft-Windows-Kernel-Power";
    const string Wer = "Microsoft-Windows-WER-SystemErrorReporting";
    const string Whea = "Microsoft-Windows-WHEA-Logger";

    internal static readonly string XPath =
        "*[System[(" +
        $"(Provider[@Name='{KernelPower}'] and EventID=41) or " +
        "(Provider[@Name='EventLog'] and EventID=6008) or " +
        $"(Provider[@Name='{Wer}'] and EventID=1001) or " +
        "(Provider[@Name='BugCheck'] and EventID=1001) or " +
        $"Provider[@Name='{Whea}'] or " +
        "(Provider[@Name='Display'] and EventID=4101) or " +
        "(Provider[@Name='nvlddmkm'] and (EventID=13 or EventID=14 or EventID=153))" +
        $") and TimeCreated[timediff(@SystemTime) <= {Days * 86_400_000L}]]]";

    /// <summary>Converte um registro em <see cref="PcEvent"/> (regra pura). Null = não é um dos eventos acompanhados.</summary>
    public static PcEvent? Parse(RawEvent e, string? userName = null)
    {
        string? kind = (e.Provider, e.Id) switch
        {
            (KernelPower, 41) => "kernelPower41",
            ("EventLog", 6008) => "unexpectedShutdown",
            (Wer, 1001) or ("BugCheck", 1001) => "bugcheck",
            (Whea, _) => "whea",
            ("Display", 4101) or ("nvlddmkm", 13 or 14 or 153) => "gpuReset",
            _ => null,
        };
        if (kind == null) return null;
        var ev = new PcEvent
        {
            Time = e.Time,
            Kind = kind,
            Source = $"{e.Provider} {e.Id}",
            EventId = e.Id,
            Message = FirstLine(e.Description, userName),
        };
        switch (kind)
        {
            case "bugcheck":
                ev.Code = HexCode(e.Description) ?? HexCode(string.Join(" ", e.Properties.Select(p => p?.ToString())));
                break;
            case "kernelPower41":
                // BugcheckCode (1º dado) ≠ 0 = o Windows registrou uma tela azul antes do reinício
                if (e.Properties.Count > 0 && ToLong(e.Properties[0]) is { } bc and not 0) ev.Code = $"0x{bc:X8}";
                break;
            case "whea":
                ev.Fatal = e.Level is 1 or 2;
                ev.Code = Field(e.Description, ComponentRx()) ?? Field(e.Description, SourceRx());
                break;
        }
        return ev;
    }

    /// <summary>Primeira linha não vazia, sem caminhos de usuário nem o nome do usuário, cortada em ~200 caracteres.</summary>
    internal static string? FirstLine(string? text, string? userName = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var line = text.Split('\n').Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0);
        if (line == null) return null;
        line = UserPathRx().Replace(line, @"$1\…");
        if (!string.IsNullOrWhiteSpace(userName) && userName.Length >= 2)
            line = Regex.Replace(line, $@"\b{Regex.Escape(userName)}\b", "…", RegexOptions.IgnoreCase);
        return line.Length > MaxMessage ? line[..(MaxMessage - 1)].TrimEnd() + "…" : line;
    }

    static string? HexCode(string? text) =>
        text != null && HexRx().Match(text) is { Success: true } m ? "0x" + m.Groups[1].Value.ToUpperInvariant().PadLeft(8, '0')[^8..] : null;

    static string? Field(string? text, Regex rx) =>
        text != null && rx.Match(text) is { Success: true } m && m.Groups[1].Value.Trim() is { Length: > 0 } v ? v : null;

    static long? ToLong(object? o)
    {
        try { return o == null ? null : Convert.ToInt64(o); } catch { return null; }
    }

    [GeneratedRegex(@"0x0*([0-9a-fA-F]{1,16})\b")]
    private static partial Regex HexRx();
    // "Component:", "Reported by component:", "Componente:", "Componente relatado:"
    [GeneratedRegex(@"^[^:\n]*\bcomponente?\b[^:\n]*:\s*(.+?)\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase)]
    private static partial Regex ComponentRx();
    [GeneratedRegex(@"^\s*(?:Error Source|Origem do erro|Fonte do erro|Fonte de erro)\s*:\s*(.+?)\s*$", RegexOptions.Multiline | RegexOptions.IgnoreCase)]
    private static partial Regex SourceRx();
    [GeneratedRegex(@"([A-Za-z]:\\Users)\\[^\\\s""']+", RegexOptions.IgnoreCase)]
    private static partial Regex UserPathRx();

    /// <summary>Lê o log System (30 dias, até 200, mais novos primeiro). Falha = lista vazia.</summary>
    public static List<PcEvent> Read()
    {
        var list = new List<PcEvent>();
        try
        {
            var query = new EventLogQuery("System", PathType.LogName, XPath) { ReverseDirection = true };
            using var reader = new EventLogReader(query);
            var user = Environment.UserName;
            while (list.Count < MaxEvents)
            {
                using var rec = reader.ReadEvent();
                if (rec == null) break;
                string? desc = null;
                try { desc = rec.FormatDescription(); } catch { }
                IReadOnlyList<object?> props = [];
                try { props = rec.Properties.Select(p => p.Value).ToList(); } catch { }
                var raw = new RawEvent(rec.ProviderName ?? "", rec.Id, rec.Level, rec.TimeCreated ?? DateTime.MinValue, desc, props);
                if (Parse(raw, user) is { } ev) list.Add(ev);
            }
        }
        catch { }
        list.Sort((a, b) => b.Time.CompareTo(a.Time));
        return list;
    }
}
