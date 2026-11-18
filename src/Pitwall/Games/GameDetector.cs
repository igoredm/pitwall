using Pitwall.Localization;
using Pitwall.Config;
using Pitwall.Fps;
using Pitwall.Native;

namespace Pitwall.Games;

public sealed record GameInfo(int Pid, string Exe, string Mode);

/// <summary>
/// Jogo = processo em foco que ocupa o monitor inteiro (tela cheia ou borderless) e está apresentando frames,
/// ou um exe da lista "incluir". O jogo continua "detectado" enquanto apresentar frames, mesmo sem foco
/// (ex.: você clicou no widget no outro monitor).
/// Sem captura de FPS (PresentMon bloqueado por anti-cheat), cai para "tela cheia em foco" — o jogo ainda é
/// detectado (log por sessão, ajuste de GPU "só em jogos"), só sem FPS.
/// </summary>
public sealed class GameDetector(PresentMonService presentMon)
{
    GameInfo? _current;

    public GameInfo? Current => _current;

    public GameInfo? Update(GamesConfig cfg)
    {
        var ignore = cfg.Ignore.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var include = cfg.Include.ToHashSet(StringComparer.OrdinalIgnoreCase);

        // Jogo atual ainda vivo e apresentando? mantém. Sem captura de FPS: mantém enquanto o processo existir.
        if (_current != null && !ignore.Contains(_current.Exe))
        {
            if (presentMon.Get(_current.Pid, 5_000) != null) return _current;
            if (!presentMon.Healthy && Win32.ProcessName((uint)_current.Pid) != null) return _current;
        }

        GameInfo? found = null;

        // 1) Processo em foco
        var fg = Win32.GetForegroundWindow();
        Win32.GetWindowThreadProcessId(fg, out var fgPid);
        if (fgPid != 0 && fgPid != Environment.ProcessId)
        {
            var exe = presentMon.Get((int)fgPid)?.Application ?? Win32.ProcessName(fgPid);
            if (exe != null && !ignore.Contains(exe))
            {
                var fullscreen = Win32.IsFullscreen(fg, out _);
                var presenting = presentMon.Get((int)fgPid) != null;
                var blind = !presentMon.Healthy;
                if (include.Contains(exe) || (cfg.AutoDetect && fullscreen && (presenting || blind)))
                    found = new GameInfo((int)fgPid, exe, (fullscreen ? L.T("tela cheia", "fullscreen") : L.T("janela", "windowed")) + (blind ? L.T(" · sem FPS", " · no FPS") : ""));
            }
        }

        // 2) Algum exe da lista "incluir" apresentando frames em segundo plano
        if (found == null && include.Count > 0)
        {
            foreach (var (pid, app) in presentMon.ActivePresenters())
                if (include.Contains(app)) { found = new GameInfo(pid, app, "segundo plano"); break; }
        }

        // Processo em foco sem frames mas outro processo do mesmo exe apresentando (launcher + render): segue o que desenha.
        if (found != null && presentMon.Get(found.Pid) == null)
        {
            foreach (var (pid, app) in presentMon.ActivePresenters())
                if (string.Equals(app, found.Exe, StringComparison.OrdinalIgnoreCase)) { found = found with { Pid = pid }; break; }
        }

        if (found?.Pid != _current?.Pid && found != null)
            presentMon.Get(found.Pid)?.ResetSession();

        _current = found;
        return found;
    }
}
