using Pitwall.Config;

namespace Pitwall.Games;

/// <summary>
/// "Marcar como jogo?": um processo em foco, em janela, apresentando frames (PresentMon) por 60 s seguidos,
/// que não está em incluir/ignorar/recusados e não é o jogo atual. Pausas curtas (até 5 s, ex.: alt+tab) não zeram a contagem.
/// </summary>
public sealed class GameSuggester
{
    public const long RequiredMs = 60_000;
    const long GraceMs = 5_000;
    /// <summary>Abaixo disso é interface parada redesenhando de vez em quando, não jogo.</summary>
    public const double MinFps = 20;

    readonly Lock _gate = new();
    string? _candidate;
    long _since, _lastSeen;
    string? _suggestion;

    public string? Suggestion
    {
        get { lock (_gate) return _suggestion; }
    }

    /// <param name="exe">Exe do processo em foco (null = nenhum).</param>
    /// <param name="windowedPresenting">Em foco, em janela (não tela cheia) e apresentando frames acima de <see cref="MinFps"/>.</param>
    /// <param name="currentGame">Exe do jogo detectado agora, se houver.</param>
    public string? Update(string? exe, bool windowedPresenting, string? currentGame, GamesConfig cfg, long nowMs)
    {
        lock (_gate)
        {
            if (_suggestion != null && Excluded(_suggestion, currentGame, cfg)) _suggestion = null;
            if (_suggestion != null) return _suggestion;

            var ok = exe != null && windowedPresenting && !Excluded(exe, currentGame, cfg);
            if (!ok)
            {
                if (_candidate != null && nowMs - _lastSeen > GraceMs) _candidate = null;
                return null;
            }
            if (!string.Equals(_candidate, exe, StringComparison.OrdinalIgnoreCase))
            {
                _candidate = exe;
                _since = nowMs;
            }
            _lastSeen = nowMs;
            if (nowMs - _since >= RequiredMs)
            {
                _suggestion = exe;
                _candidate = null;
            }
            return _suggestion;
        }
    }

    /// <summary>Aceita/recusa: some a sugestão (o config novo impede que ela volte).</summary>
    public void Clear()
    {
        lock (_gate)
        {
            _suggestion = null;
            _candidate = null;
        }
    }

    static bool Excluded(string exe, string? currentGame, GamesConfig cfg) =>
        string.Equals(exe, currentGame, StringComparison.OrdinalIgnoreCase)
        || cfg.Include.Contains(exe, StringComparer.OrdinalIgnoreCase)
        || cfg.Ignore.Contains(exe, StringComparer.OrdinalIgnoreCase)
        || cfg.DismissedSuggestions.Contains(exe, StringComparer.OrdinalIgnoreCase);
}

/// <summary>Perfis por jogo: o que vale enquanto o jogo roda (nada é gravado no config).</summary>
public static class GameProfiles
{
    /// <summary>Ajuste de GPU efetivo: o preset do perfil sobrepõe o geral só durante o jogo; sem perfil, o geral.</summary>
    public static GpuTuningConfig EffectiveTuning(GpuTuningConfig general, GameProfile? profile, bool gameActive)
    {
        if (!gameActive || profile?.TuningPreset is not { } preset) return general;
        return new GpuTuningConfig
        {
            Enabled = preset != "off",
            Preset = preset == "off" ? general.Preset : preset,
            PowerLimitW = general.PowerLimitW,
            MaxClockMhz = general.MaxClockMhz,
            OnlyInGames = true,
        };
    }
}
