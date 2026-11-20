namespace Pitwall.Health;

// Tipos do Relatório do PC (1.2). Nomes em camelCase no JSON (ConfigStore.Json) = models.ts › PcEvent, PcIncident...

/// <summary>Evento do log System do Windows, só dados (sem diagnóstico).</summary>
public sealed class PcEvent
{
    public DateTime Time { get; set; }
    /// <summary>kernelPower41 | unexpectedShutdown | bugcheck | whea | gpuReset</summary>
    public string Kind { get; set; } = "";
    /// <summary>Provedor + id, ex.: "Microsoft-Windows-WHEA-Logger 17".</summary>
    public string Source { get; set; } = "";
    public int EventId { get; set; }
    /// <summary>WHEA com nível Erro/Crítico.</summary>
    public bool? Fatal { get; set; }
    /// <summary>BugCheck: "0x00000124"; WHEA: componente.</summary>
    public string? Code { get; set; }
    /// <summary>Primeira linha do texto do evento, sem caminhos/nomes de usuário (até ~200 caracteres).</summary>
    public string? Message { get; set; }
}

/// <summary>Uma leitura de "últimas medições".</summary>
public sealed class PcReading
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    /// <summary>fps | gpu | cpu | ram | other</summary>
    public string Group { get; set; } = "";
    public double? Value { get; set; }
    public string Unit { get; set; } = "";
}

public class PcIncidentSummary
{
    /// <summary>Hora local da última gravação do buffer, "yyyyMMdd-HHmmss" (serve de nome de arquivo).</summary>
    public string Id { get; set; } = "";
    /// <summary>abruptShutdown | bugcheck</summary>
    public string Kind { get; set; } = "";
    /// <summary>Hora estimada (última gravação do buffer).</summary>
    public DateTime Time { get; set; }
    /// <summary>Hora em que o PC voltou (boot).</summary>
    public DateTime? BootTime { get; set; }
    public string? Exe { get; set; }
    public DateTime? SessionStart { get; set; }
    /// <summary>Ligado há N s quando caiu.</summary>
    public long? UptimeSec { get; set; }
    public List<PcEvent> Events { get; set; } = [];
    public bool Seen { get; set; }

    public PcIncidentSummary ToSummary() => new()
    {
        Id = Id, Kind = Kind, Time = Time, BootTime = BootTime, Exe = Exe, SessionStart = SessionStart,
        UptimeSec = UptimeSec, Events = Events, Seen = Seen,
    };
}

public sealed class PcIncident : PcIncidentSummary
{
    public int IntervalMs { get; set; } = 1000;
    /// <summary>Últimos 120 s por série, do mais antigo para o mais novo; null = sem leitura.</summary>
    public Dictionary<string, double?[]> Series { get; set; } = [];
    /// <summary>Todas as métricas na última gravação antes da queda.</summary>
    public List<PcReading> Last { get; set; } = [];
    public string? CsvFile { get; set; }
}

/// <summary>%LOCALAPPDATA%\Pitwall\pc-ring.json: o que sobrevive a um desligamento abrupto.</summary>
public sealed class PcRingFile
{
    /// <summary>Hora da última gravação (≈ hora da queda, com até ~10 s de erro).</summary>
    public DateTime SavedAt { get; set; }
    /// <summary>Boot do Windows visto por este processo.</summary>
    public DateTime BootTime { get; set; }
    /// <summary>Hora em que o Pitwall abriu.</summary>
    public DateTime AppStart { get; set; }
    /// <summary>Jogo aberto na gravação (null fora de jogo).</summary>
    public string? Exe { get; set; }
    public DateTime? SessionStart { get; set; }
    public string? CsvFile { get; set; }
    public int IntervalMs { get; set; } = 1000;
    public Dictionary<string, double?[]> Series { get; set; } = [];
    public List<PcReading> Last { get; set; } = [];
    /// <summary>Saída normal (sair, logoff, desligar pelo Windows).</summary>
    public bool CleanExit { get; set; }
    public DateTime? CleanExitAt { get; set; }
    /// <summary>Última saída normal conhecida (vem da execução anterior quando esta ainda não saiu).</summary>
    public DateTime? LastCleanExit { get; set; }
}
