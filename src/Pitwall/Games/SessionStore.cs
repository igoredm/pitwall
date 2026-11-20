using System.Text.Json;
using Pitwall.Config;

namespace Pitwall.Games;

/// <summary>
/// Uma sessão de jogo. Os campos de estatística são novos na 0.7 e opcionais: o sessions.json antigo (só exe/start/end)
/// continua sendo lido, e quem só conhece os campos antigos ignora os novos.
/// </summary>
public sealed class GameSession
{
    public string Exe { get; set; } = "";
    public DateTime Start { get; set; }
    public DateTime? End { get; set; }

    // Estatísticas (0.7+). Atualizadas durante a sessão (a cada ~30 s) e no fim.
    public double? DurationSec { get; set; }
    public double? AvgFps { get; set; }
    public double? Low1 { get; set; }
    public double? Low01 { get; set; }
    public double? PeakGpuTemp { get; set; }
    public double? PeakHotspot { get; set; }
    public double? PeakHotspotDelta { get; set; }
    public double? PeakGpuPower { get; set; }
    /// <summary>Segundos com a métrica >= limite amarelo (inclui o tempo no vermelho), por id.</summary>
    public Dictionary<string, double>? SecondsAboveWarn { get; set; }
    /// <summary>Segundos com a métrica >= limite vermelho, por id.</summary>
    public Dictionary<string, double>? SecondsAboveCrit { get; set; }
    /// <summary>
    /// 1.0: segundos por motivo do limite de clock da GPU (thermal | power | voltage | idle | sync | none) durante a
    /// sessão. Ausente sem NVML ou com features.clockReason desligado. Base do "Por que o clock caiu".
    /// </summary>
    public Dictionary<string, double>? ClockReasonSec { get; set; }
    // 1.2: médias (por tick), engasgos, marcadores e hardware. Opcionais: sessões antigas não têm.
    public double? AvgGpuTemp { get; set; }
    public double? AvgHotspot { get; set; }
    public double? AvgGpuPower { get; set; }
    public double? AvgGpuClock { get; set; }
    public double? AvgGpuLoad { get; set; }
    public double? AvgCpuTemp { get; set; }
    public double? AvgCpuLoad { get; set; }
    public double? PeakCpuTemp { get; set; }
    /// <summary>Engasgos (docs/v12-contract.md › Engasgo). null = não contado (features.stutters desligado).</summary>
    public int? Stutters { get; set; }
    /// <summary>Marcadores (atalho ou addMarker). Lista trocada a cada marcador (nunca alterada no lugar).</summary>
    public List<SessionMarker>? Markers { get; set; }
    /// <summary>Média do |erro de animação| (PresentMon 2.x), ms.</summary>
    public double? AnimErrorMs { get; set; }
    /// <summary>Média da latência do PC (PresentMon), ms, se a coluna existir.</summary>
    public double? PcLatencyMs { get; set; }
    /// <summary>GPU e CPU no início da sessão (card de compartilhar).</summary>
    public string? Gpu { get; set; }
    public string? Cpu { get; set; }
    /// <summary>Nome do arquivo CSV da sessão (sem a pasta).</summary>
    public string? CsvFile { get; set; }
    /// <summary>1.2: a sessão terminou num desligamento abrupto do PC (Relatório do PC).</summary>
    public bool? EndedByCrash { get; set; }
    /// <summary>1.2: id do incidente do Relatório do PC (incidents\&lt;id&gt;.json).</summary>
    public string? IncidentId { get; set; }
}

/// <summary>1.2: marcador de uma sessão. <see cref="T"/> = segundos desde o início da sessão.</summary>
public sealed class SessionMarker
{
    public double T { get; set; }
    public DateTime At { get; set; }
    public string? Note { get; set; }
}

/// <summary>1.2: marcador gravado (TelemetryHub.MarkerAdded). <paramref name="Exe"/> = jogo da sessão aberta; null fora de jogo.</summary>
public sealed record MarkerEvent(int Index, DateTime At, string? Exe, string? Note);

/// <summary>
/// Histórico de sessões de jogo (tela Sessões), persistido em %APPDATA%\Pitwall\sessions.json, mais recente primeiro.
/// Guarda até <see cref="Max"/>; a mensagem "sessions" leva só as <see cref="RecentCount"/> mais recentes e o resto vem
/// paginado por getSessions.
/// </summary>
public sealed class SessionStore
{
    public const int Max = 500;
    /// <summary>Quantas vão no broadcast "sessions" (o tamanho antigo da lista, para compatibilidade).</summary>
    public const int RecentCount = 20;
    /// <summary>Teto de uma página de getSessions.</summary>
    public const int MaxPageSize = 100;
    static readonly string FilePath = Path.Combine(ConfigStore.Dir, "sessions.json");
    // Sem indentação: com 500 sessões o arquivo é regravado a cada ~30 s durante o jogo
    static readonly JsonSerializerOptions FileJson = new(ConfigStore.Json) { WriteIndented = false };

    readonly Lock _gate = new();
    readonly List<GameSession> _sessions;
    GameSession? _open;

    public SessionStore()
    {
        try
        {
            _sessions = File.Exists(FilePath)
                ? JsonSerializer.Deserialize<List<GameSession>>(File.ReadAllText(FilePath), ConfigStore.Json) ?? []
                : [];
        }
        catch
        {
            _sessions = [];
        }
        // Sessão sem fim = o PC desligou/travou no meio do jogo; fica registrada assim mesmo.
        LastAtStartup = _sessions.FirstOrDefault();
    }

    /// <summary>Sessão mais recente do arquivo, como estava ao abrir o app (base do relatório de crash).</summary>
    public GameSession? LastAtStartup { get; }

    /// <summary>Sessão em andamento (null fora de jogo).</summary>
    public GameSession? Open
    {
        get { lock (_gate) return _open; }
    }

    /// <summary>As <see cref="RecentCount"/> mais recentes (broadcast "sessions").</summary>
    public IReadOnlyList<GameSession> Recent
    {
        get { lock (_gate) return [.. _sessions.Take(RecentCount)]; }
    }

    /// <summary>Página do histórico (getSessions).</summary>
    public (int Total, List<GameSession> Sessions) Page(int offset, int limit, string? exe)
    {
        lock (_gate) return Page(_sessions, offset, limit, exe);
    }

    /// <summary>
    /// Regra pura: filtra por exe (igual, sem diferenciar maiúsculas; vazio = todos), mantém a ordem (mais recente primeiro)
    /// e corta [offset, offset+limit). limit fica em 1–100 e offset ≥ 0. Total = depois do filtro.
    /// </summary>
    internal static (int Total, List<GameSession> Sessions) Page(IEnumerable<GameSession> all, int offset, int limit, string? exe)
    {
        offset = Math.Max(0, offset);
        limit = Math.Clamp(limit, 1, MaxPageSize);
        exe = exe?.Trim();
        var filtered = string.IsNullOrEmpty(exe) ? all.ToList()
            : all.Where(s => string.Equals(s.Exe, exe, StringComparison.OrdinalIgnoreCase)).ToList();
        return (filtered.Count, filtered.Skip(offset).Take(limit).ToList());
    }

    /// <summary>1.2: sessão pelo início (tolerância de 1 s: o ISO da página pode vir sem as frações).</summary>
    public GameSession? Find(DateTime start)
    {
        lock (_gate) return _sessions.FirstOrDefault(s => Math.Abs((s.Start - start).TotalSeconds) < 1);
    }

    /// <summary>1.2: acrescenta um marcador à sessão aberta e salva. Retorna o número dele (1, 2, …) ou null fora de jogo.</summary>
    public int? AddMarker(DateTime at, string? note)
    {
        lock (_gate)
        {
            if (_open == null) return null;
            var m = new SessionMarker { T = Math.Round(Math.Max(0, (at - _open.Start).TotalSeconds), 1), At = at, Note = note };
            _open.Markers = [.. _open.Markers ?? [], m];
            Save();
            return _open.Markers.Count;
        }
    }

    /// <summary>Atualiza a sessão aberta (estatísticas) e salva.</summary>
    public void UpdateOpen(Action<GameSession> update)
    {
        lock (_gate)
        {
            if (_open == null) return;
            update(_open);
            Save();
        }
    }

    public void Start(GameInfo? game)
    {
        if (game == null) return;
        lock (_gate)
        {
            _open = new GameSession { Exe = game.Exe, Start = DateTime.Now };
            _sessions.Insert(0, _open);
            if (_sessions.Count > Max) _sessions.RemoveRange(Max, _sessions.Count - Max);
            Save();
        }
    }

    /// <returns>A sessão encerrada, ou null se não havia sessão ou ela foi curta demais para ficar no histórico.</returns>
    public GameSession? End(GameInfo? game, Action<GameSession>? final = null)
    {
        lock (_gate)
        {
            if (_open == null) return null;
            _open.End = DateTime.Now;
            final?.Invoke(_open);
            // Detecções de poucos segundos (alt+tab em algo em tela cheia) não viram sessão
            var kept = _open.End - _open.Start >= TimeSpan.FromSeconds(30) ? _open : null;
            if (kept == null) _sessions.Remove(_open);
            _open = null;
            Save();
            return kept;
        }
    }

    /// <summary>1.2: marca a sessão (exe + início) que terminou numa queda do PC. False = não encontrada.</summary>
    public bool MarkCrashed(string exe, DateTime start, string incidentId)
    {
        lock (_gate)
        {
            var s = _sessions.FirstOrDefault(x => string.Equals(x.Exe, exe, StringComparison.OrdinalIgnoreCase)
                && Math.Abs((x.Start - start).TotalSeconds) < 1);
            if (s == null) return false;
            s.EndedByCrash = true;
            s.IncidentId = incidentId;
            Save();
            return true;
        }
    }

    void Save()
    {
        try
        {
            Directory.CreateDirectory(ConfigStore.Dir);
            var tmp = FilePath + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_sessions, FileJson));
            File.Move(tmp, FilePath, overwrite: true);
        }
        catch
        {
            // não é crítico
        }
    }
}
