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
    /// <summary>Nome do arquivo CSV da sessão (sem a pasta).</summary>
    public string? CsvFile { get; set; }
}

/// <summary>Sessões de jogo recentes (tela Jogos), persistidas em %APPDATA%\Pitwall\sessions.json.</summary>
public sealed class SessionStore
{
    const int Max = 20;
    static readonly string FilePath = Path.Combine(ConfigStore.Dir, "sessions.json");

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

    public IReadOnlyList<GameSession> Recent
    {
        get { lock (_gate) return [.. _sessions]; }
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

    public void End(GameInfo? game, Action<GameSession>? final = null)
    {
        lock (_gate)
        {
            if (_open == null) return;
            _open.End = DateTime.Now;
            final?.Invoke(_open);
            // Detecções de poucos segundos (alt+tab em algo em tela cheia) não viram sessão
            if (_open.End - _open.Start < TimeSpan.FromSeconds(30)) _sessions.Remove(_open);
            _open = null;
            Save();
        }
    }

    void Save()
    {
        try
        {
            Directory.CreateDirectory(ConfigStore.Dir);
            var tmp = FilePath + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_sessions, ConfigStore.Json));
            File.Move(tmp, FilePath, overwrite: true);
        }
        catch
        {
            // não é crítico
        }
    }
}
