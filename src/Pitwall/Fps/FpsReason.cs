namespace Pitwall.Fps;

/// <summary>1.2: por que não há FPS (snapshot.texts["fps.reason"], tipo FpsReason do front).</summary>
public static class FpsReason
{
    /// <summary>
    /// Regra pura, na ordem: sem PresentMon → sem admin → bloqueado pelo anti-cheat → outra captura ocupando o ETW →
    /// sem jogo → captura iniciando → jogo aberto mas sem frames. null = há FPS.
    /// </summary>
    /// <param name="lastError">Última linha de erro do PresentMon ("too many sessions"/"resources" = limite de sessões ETW,
    /// normalmente outro programa de captura/overlay ocupando).</param>
    public static string? For(bool hasFps, bool gameOpen, bool presentMonAvailable, bool admin, bool blocked, bool healthy, string? lastError)
    {
        if (hasFps) return null;
        if (!presentMonAvailable) return "noPresentMon";
        if (!admin) return "notAdmin";
        if (blocked) return "antiCheat";
        if (!healthy && lastError != null
            && (lastError.Contains("too many", StringComparison.OrdinalIgnoreCase) || lastError.Contains("resources", StringComparison.OrdinalIgnoreCase)))
            return "otherCapture";
        if (!gameOpen) return "noGame";
        if (!healthy) return "starting";
        return "noFrames";
    }
}
