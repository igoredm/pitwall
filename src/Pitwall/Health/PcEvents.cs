using System.Diagnostics.Eventing.Reader;
using System.Text.RegularExpressions;

namespace Pitwall.Health;

/// <summary>Dados crus de um registro do Event Log (o que <see cref="PcEvents.Parse"/> precisa; fácil de simular em teste).</summary>
public sealed record RawEvent(string Provider, int Id, byte? Level, DateTime Time, string? Description, IReadOnlyList<object?> Properties);

/// <summary>
/// Eventos do Windows que interessam ao Relatório do PC. Log System: Kernel-Power 41, EventLog 6008, BugCheck 1001,
/// WHEA-Logger, Display 4101 e nvlddmkm 13/14/153 (problemas, 30 dias); 1.3: Kernel-Power 42, Power-Troubleshooter 1,
/// Kernel-General 12/13 e User32 1074 (estado, 7 dias). Log Application (1.3): Application Error 1000 e Application Hang
/// 1002, só de jogos conhecidos (problemas, 30 dias). Leitura sob demanda (nunca na thread de telemetria).
/// </summary>
public static partial class PcEvents
{
    /// <summary>Até 200 problemas (30 dias) + até <see cref="MaxStateEvents"/> de estado (7 dias).</summary>
    public const int MaxEvents = 200;
    public const int MaxStateEvents = 150;
    public const int Days = 30;
    public const int StateDays = 7;
    /// <summary>Teto de registros do log Application percorridos (crashes de programas que não são jogos são pulados).</summary>
    const int MaxAppScan = 5_000;
    const int MaxMessage = 200;

    public const string CategoryProblem = "problem", CategoryState = "state";

    const string KernelPower = "Microsoft-Windows-Kernel-Power";
    const string KernelGeneral = "Microsoft-Windows-Kernel-General";
    const string PowerTroubleshooter = "Microsoft-Windows-Power-Troubleshooter";
    const string Wer = "Microsoft-Windows-WER-SystemErrorReporting";
    const string Whea = "Microsoft-Windows-WHEA-Logger";
    const string AppError = "Application Error";
    const string AppHang = "Application Hang";

    static string Within(int days) => $"TimeCreated[timediff(@SystemTime) <= {days * 86_400_000L}]";

    internal static readonly string XPath =
        "*[System[(" +
        $"(Provider[@Name='{KernelPower}'] and EventID=41) or " +
        "(Provider[@Name='EventLog'] and EventID=6008) or " +
        $"(Provider[@Name='{Wer}'] and EventID=1001) or " +
        "(Provider[@Name='BugCheck'] and EventID=1001) or " +
        $"Provider[@Name='{Whea}'] or " +
        "(Provider[@Name='Display'] and EventID=4101) or " +
        "(Provider[@Name='nvlddmkm'] and (EventID=13 or EventID=14 or EventID=153))" +
        $") and {Within(Days)}]]";

    /// <summary>1.3: suspensão/retomada, ligar/desligar (log System, 7 dias).</summary>
    internal static readonly string StateXPath =
        "*[System[(" +
        $"(Provider[@Name='{KernelPower}'] and EventID=42) or " +
        $"(Provider[@Name='{PowerTroubleshooter}'] and EventID=1) or " +
        $"(Provider[@Name='{KernelGeneral}'] and (EventID=12 or EventID=13)) or " +
        "(Provider[@Name='User32'] and EventID=1074)" +
        $") and {Within(StateDays)}]]";

    /// <summary>1.3: programa fechou com erro / parou de responder (log Application). O filtro por exe é no C#.</summary>
    internal static string AppXPath(int days = Days) =>
        "*[System[(" +
        $"(Provider[@Name='{AppError}'] and EventID=1000) or " +
        $"(Provider[@Name='{AppHang}'] and EventID=1002)" +
        $") and {Within(days)}]]";

    /// <summary>state = sleep/resume/boot/shutdown; o resto = problem.</summary>
    public static string CategoryOf(string kind) => kind is "sleep" or "resume" or "boot" or "shutdown" ? CategoryState : CategoryProblem;

    /// <summary>
    /// Converte um registro em <see cref="PcEvent"/> (regra pura). Null = não é um dos eventos acompanhados, ou é um
    /// appCrash/appHang de um exe fora de <paramref name="games"/> (sem lista = nenhum).
    /// </summary>
    public static PcEvent? Parse(RawEvent e, string? userName = null, IReadOnlySet<string>? games = null, string? machineName = null)
    {
        string? kind = (e.Provider, e.Id) switch
        {
            (KernelPower, 41) => "kernelPower41",
            ("EventLog", 6008) => "unexpectedShutdown",
            (Wer, 1001) or ("BugCheck", 1001) => "bugcheck",
            (Whea, _) => "whea",
            ("Display", 4101) or ("nvlddmkm", 13 or 14 or 153) => "gpuReset",
            (KernelPower, 42) => "sleep",
            (PowerTroubleshooter, 1) => "resume",
            (KernelGeneral, 12) => "boot",
            (KernelGeneral, 13) or ("User32", 1074) => "shutdown",
            (AppError, 1000) => "appCrash",
            (AppHang, 1002) => "appHang",
            _ => null,
        };
        if (kind == null) return null;
        var ev = new PcEvent
        {
            Time = e.Time,
            Kind = kind,
            Category = CategoryOf(kind),
            Source = $"{e.Provider} {e.Id}",
            EventId = e.Id,
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
            case "appCrash":
            case "appHang":
                ev.Exe = AppExe(e);
                if (ev.Exe == null || games == null || !games.Contains(ev.Exe)) return null;
                if (kind == "appCrash") ev.Code = Module(e);
                break;
        }
        // User32 1074 traz o usuário e o nome do PC no texto: a mensagem é só o processo e o tipo
        ev.Message = e.Provider == "User32" ? ShutdownMessage(e) : FirstLine(e.Description, userName, machineName);
        return ev;
    }

    /// <summary>Exe do appCrash/appHang: 1º dado (nome do aplicativo) ou o texto ("Faulting application name: X.exe").</summary>
    internal static string? AppExe(RawEvent e)
    {
        if (e.Properties.Count > 0 && ExeName(e.Properties[0]?.ToString()) is { } p) return p;
        return e.Description != null && AppExeRx().Match(e.Description) is { Success: true } m ? ExeName(m.Groups[1].Value) : null;
    }

    /// <summary>Módulo com falha do Application Error 1000: 4º dado, ou "Faulting module name:" / "Nome do módulo com falha:".</summary>
    static string? Module(RawEvent e)
    {
        if (e.Properties.Count > 3 && e.Properties[3]?.ToString()?.Trim() is { Length: > 0 } m) return Path.GetFileName(m);
        return Field(e.Description, ModuleRx()) is { } f ? Path.GetFileName(f.Trim().TrimEnd(',')) : null;
    }

    static string? ExeName(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        string name;
        try { name = Path.GetFileName(text.Trim().TrimEnd(',')); } catch { return null; }
        return name.Length > 4 && name.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? name : null;
    }

    /// <summary>User32 1074: "shutdown.exe · restart" (processo + tipo), nunca o usuário nem o nome do PC.</summary>
    internal static string? ShutdownMessage(RawEvent e)
    {
        string? process = null, type = null;
        if (e.Properties.Count > 0)
        {
            // "C:\Windows\System32\RuntimeBroker.exe (DESKTOP-ABC)"
            var raw = e.Properties[0]?.ToString() ?? "";
            var paren = raw.IndexOf(" (", StringComparison.Ordinal);
            process = ExeName(paren > 0 ? raw[..paren] : raw);
        }
        if (e.Properties.Count > 4 && e.Properties[4]?.ToString()?.Trim() is { Length: > 0 and <= 40 } t) type = t;
        process ??= e.Description != null && ProcessRx().Match(e.Description) is { Success: true } m ? ExeName(m.Groups[1].Value) : null;
        return (process, type) switch
        {
            (null, null) => null,
            (null, _) => type,
            (_, null) => process,
            _ => $"{process} · {type}",
        };
    }

    /// <summary>Primeira linha não vazia, sem caminhos de usuário nem o nome do usuário/PC, cortada em ~200 caracteres.</summary>
    internal static string? FirstLine(string? text, string? userName = null, string? machineName = null)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var line = text.Split('\n').Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0);
        if (line == null) return null;
        line = UserPathRx().Replace(line, @"$1\…");
        foreach (var name in new[] { userName, machineName })
            if (!string.IsNullOrWhiteSpace(name) && name.Length >= 2)
                line = Regex.Replace(line, $@"\b{Regex.Escape(name)}\b", "…", RegexOptions.IgnoreCase);
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
    // "Faulting application name: FC25.exe," / "Nome do aplicativo com falha: FC25.exe," / "The program FC25.exe version" / "O programa FC25.exe versão"
    [GeneratedRegex(@"(?:application name|aplicativo com falha|aplicativo falho|program|programa)\s*:?\s*([^\s,:]+\.exe)\b", RegexOptions.IgnoreCase)]
    private static partial Regex AppExeRx();
    [GeneratedRegex(@"^\s*(?:Faulting module name|Nome do módulo com falha|Nome do módulo falho)\s*:\s*([^,\r\n]+)", RegexOptions.Multiline | RegexOptions.IgnoreCase)]
    private static partial Regex ModuleRx();
    // "The process C:\...\x.exe (PC)" / "O processo C:\...\x.exe (PC)"
    [GeneratedRegex(@"\b(?:process|processo)\s+(\S+\.exe)", RegexOptions.IgnoreCase)]
    private static partial Regex ProcessRx();

    /// <summary>
    /// Lê os logs: até 200 problemas de 30 dias (System + Application dos <paramref name="games"/>) e até 150 eventos de
    /// estado de 7 dias, mais novos primeiro. Falha = o que deu para ler.
    /// </summary>
    public static List<PcEvent> Read(IReadOnlySet<string>? games = null)
    {
        var user = Environment.UserName;
        var machine = Environment.MachineName;
        var problems = ReadLog("System", XPath, MaxEvents, e => Parse(e, user, null, machine));
        if (games is { Count: > 0 }) problems.AddRange(ReadApp(games, Days, user, machine));
        var state = ReadLog("System", StateXPath, MaxStateEvents, e => Parse(e, user, null, machine));
        return Combine(problems, state);
    }

    /// <summary>Regra pura: até 200 problemas + até 150 de estado (os mais novos de cada), mais novos primeiro.</summary>
    internal static List<PcEvent> Combine(IEnumerable<PcEvent> problems, IEnumerable<PcEvent> state)
    {
        var list = problems.OrderByDescending(e => e.Time).Take(MaxEvents)
            .Concat(state.OrderByDescending(e => e.Time).Take(MaxStateEvents)).ToList();
        list.Sort((a, b) => b.Time.CompareTo(a.Time));
        return list;
    }

    /// <summary>1.3: só o log Application (appCrash/appHang dos <paramref name="games"/>) dos últimos <paramref name="days"/> dias.</summary>
    public static List<PcEvent> ReadApp(IReadOnlySet<string> games, int days = Days, string? user = null, string? machine = null)
    {
        user ??= Environment.UserName;
        machine ??= Environment.MachineName;
        // O exe vem no 1º dado: o que não é jogo é pulado antes de formatar o texto (a parte cara)
        return ReadLog("Application", AppXPath(days), MaxEvents, e => Parse(e, user, games, machine), MaxAppScan,
            props => props.Count == 0 || ExeName(props[0]?.ToString()) is not { } exe || games.Contains(exe));
    }

    static List<PcEvent> ReadLog(string log, string xpath, int max, Func<RawEvent, PcEvent?> parse, int maxScan = int.MaxValue,
        Func<IReadOnlyList<object?>, bool>? prefilter = null)
    {
        var list = new List<PcEvent>();
        try
        {
            var query = new EventLogQuery(log, PathType.LogName, xpath) { ReverseDirection = true };
            using var reader = new EventLogReader(query);
            for (int scanned = 0; list.Count < max && scanned < maxScan; scanned++)
            {
                using var rec = reader.ReadEvent();
                if (rec == null) break;
                IReadOnlyList<object?> props = [];
                try { props = rec.Properties.Select(p => p.Value).ToList(); } catch { }
                if (prefilter != null && !prefilter(props)) continue;
                string? desc = null;
                try { desc = rec.FormatDescription(); } catch { }
                var raw = new RawEvent(rec.ProviderName ?? "", rec.Id, rec.Level, rec.TimeCreated ?? DateTime.MinValue, desc, props);
                if (parse(raw) is { } ev) list.Add(ev);
            }
        }
        catch { }
        return list;
    }
}
