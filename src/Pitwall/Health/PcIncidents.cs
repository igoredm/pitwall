using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Pitwall.Health;

/// <summary>Como terminou a execução anterior, a partir do pc-ring.json dela.</summary>
public enum PcExitKind { None, Clean, AppExit, Abrupt }

/// <summary>Regras puras do Relatório do PC (testáveis, sem disco).</summary>
public static partial class PcIncidentRules
{
    public const int Keep = 20;
    public static readonly TimeSpan EventWindow = TimeSpan.FromMinutes(10);

    /// <summary>
    /// Sem buffer = nada. <c>cleanExit</c> = saída normal. Boot do Windows depois da última gravação = o PC desligou
    /// sem aviso (incidente). Boot antes = o Pitwall fechou sozinho/foi encerrado (não é queda do PC).
    /// </summary>
    public static PcExitKind Classify(PcRingFile? ring, DateTime bootTime)
    {
        if (ring == null || ring.SavedAt == default) return PcExitKind.None;
        if (ring.CleanExit) return PcExitKind.Clean;
        return bootTime > ring.SavedAt ? PcExitKind.Abrupt : PcExitKind.AppExit;
    }

    /// <summary>Id = hora local da última gravação, "yyyyMMdd-HHmmss" (ordenável e seguro como nome de arquivo).</summary>
    public static string IdFor(DateTime savedAt) => savedAt.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture);

    public static bool ValidId(string? id) => id != null && IdRx().IsMatch(id);

    /// <summary>Eventos de [última gravação − 10 min, boot + 10 min], mais novos primeiro.</summary>
    public static List<PcEvent> EventsNear(IEnumerable<PcEvent> events, DateTime savedAt, DateTime? bootTime)
    {
        var from = savedAt - EventWindow;
        var to = (bootTime is { } b && b > savedAt ? b : savedAt) + EventWindow;
        return [.. events.Where(e => e.Time >= from && e.Time <= to).OrderByDescending(e => e.Time)];
    }

    /// <summary>BugCheck por perto (evento 1001 ou Kernel-Power 41 com código) = tela azul.</summary>
    public static string KindFor(IEnumerable<PcEvent> near) =>
        near.Any(e => e.Kind == "bugcheck" || e.Kind == "kernelPower41" && e.Code != null) ? "bugcheck" : "abruptShutdown";

    /// <summary>Monta o incidente se a execução anterior terminou num desligamento abrupto.</summary>
    public static PcIncident? Build(PcRingFile? ring, DateTime bootTime, IEnumerable<PcEvent> events)
    {
        if (Classify(ring, bootTime) != PcExitKind.Abrupt) return null;
        var near = EventsNear(events, ring!.SavedAt, bootTime);
        return new PcIncident
        {
            Id = IdFor(ring.SavedAt),
            Kind = KindFor(near),
            Time = ring.SavedAt,
            BootTime = bootTime,
            Exe = ring.Exe,
            SessionStart = ring.Exe != null ? ring.SessionStart : null,
            UptimeSec = ring.BootTime != default && ring.SavedAt > ring.BootTime ? (long)(ring.SavedAt - ring.BootTime).TotalSeconds : null,
            Events = near,
            IntervalMs = ring.IntervalMs,
            Series = ring.Series,
            Last = ring.Last,
            CsvFile = ring.CsvFile,
        };
    }

    /// <summary>Reanexa eventos que chegaram depois (o BugCheck 1001 é gravado minutos após o boot). True = mudou.</summary>
    public static bool Refresh(PcIncidentSummary inc, IEnumerable<PcEvent> events)
    {
        var near = EventsNear(events, inc.Time, inc.BootTime);
        if (near.Count <= inc.Events.Count) return false;
        inc.Events = near;
        inc.Kind = KindFor(near);
        return true;
    }

    /// <summary>Ids que saem para ficar só com os <paramref name="keep"/> mais novos.</summary>
    public static List<string> ToDelete(IEnumerable<string> ids, int keep = Keep) =>
        [.. ids.OrderByDescending(i => i, StringComparer.Ordinal).Skip(keep)];

    [GeneratedRegex(@"^\d{8}-\d{6}$")]
    private static partial Regex IdRx();
}

/// <summary>Incidentes em %LOCALAPPDATA%\Pitwall\incidents\&lt;id&gt;.json, os 20 mais novos. Thread-safe.</summary>
public sealed class PcIncidentStore(string? dir = null)
{
    public static readonly string DefaultDir = Path.Combine(PcRing.Dir, "incidents");
    readonly string _dir = dir ?? DefaultDir;
    readonly Lock _gate = new();
    List<PcIncidentSummary>? _summaries;

    string PathOf(string id) => Path.Combine(_dir, id + ".json");

    /// <summary>Mais novos primeiro.</summary>
    public List<PcIncidentSummary> List()
    {
        lock (_gate) return [.. Summaries()];
    }

    public PcIncidentSummary? Pending
    {
        get { lock (_gate) return Summaries().FirstOrDefault(s => !s.Seen); }
    }

    public PcIncident? Get(string id)
    {
        if (!PcIncidentRules.ValidId(id)) return null;
        lock (_gate) return Load(PathOf(id));
    }

    public bool Exists(string id) => PcIncidentRules.ValidId(id) && File.Exists(PathOf(id));

    /// <summary>Grava (escrita atômica) e apaga os mais antigos além de 20.</summary>
    public void Save(PcIncident inc)
    {
        if (!PcIncidentRules.ValidId(inc.Id)) return;
        lock (_gate)
        {
            try
            {
                PcRing.Write(PathOf(inc.Id), inc);
                var ids = Directory.GetFiles(_dir, "*.json").Select(Path.GetFileNameWithoutExtension).Where(PcIncidentRules.ValidId);
                foreach (var old in PcIncidentRules.ToDelete(ids!)) File.Delete(PathOf(old!));
            }
            catch { }
            _summaries = null;
        }
    }

    public bool MarkSeen(string id) => Update(id, i => { if (i.Seen) return false; i.Seen = true; return true; });

    /// <summary>Carrega, aplica e regrava se <paramref name="change"/> retornar true.</summary>
    public bool Update(string id, Func<PcIncident, bool> change)
    {
        if (!PcIncidentRules.ValidId(id)) return false;
        lock (_gate)
        {
            var inc = Load(PathOf(id));
            if (inc == null || !change(inc)) return false;
            try { PcRing.Write(PathOf(id), inc); } catch { return false; }
            _summaries = null;
            return true;
        }
    }

    List<PcIncidentSummary> Summaries()
    {
        if (_summaries != null) return _summaries;
        var list = new List<PcIncidentSummary>();
        try
        {
            if (Directory.Exists(_dir))
                foreach (var f in Directory.GetFiles(_dir, "*.json"))
                    if (PcIncidentRules.ValidId(Path.GetFileNameWithoutExtension(f)) && Load(f) is { } inc) list.Add(inc.ToSummary());
        }
        catch { }
        return _summaries = [.. list.OrderByDescending(s => s.Id, StringComparer.Ordinal)];
    }

    static PcIncident? Load(string path)
    {
        try { return File.Exists(path) ? JsonSerializer.Deserialize<PcIncident>(File.ReadAllText(path), PcRing.Compact) : null; }
        catch { return null; }
    }
}
