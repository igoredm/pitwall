using System.Text.Json;
using Pitwall.Config;

namespace Pitwall.Games;

public sealed class GameSession
{
    public string Exe { get; set; } = "";
    public DateTime Start { get; set; }
    public DateTime? End { get; set; }
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
    }

    public IReadOnlyList<GameSession> Recent
    {
        get { lock (_gate) return [.. _sessions]; }
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

    public void End(GameInfo? game)
    {
        lock (_gate)
        {
            if (_open == null) return;
            _open.End = DateTime.Now;
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
            File.WriteAllText(FilePath, JsonSerializer.Serialize(_sessions, ConfigStore.Json));
        }
        catch
        {
            // não é crítico
        }
    }
}
