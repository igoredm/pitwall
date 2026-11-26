namespace Pitwall;

/// <summary>1.4: "Não é um jogo" nos Relatórios de jogo.</summary>
public sealed partial class TelemetryHub
{
    /// <summary>
    /// O exe vai para a lista "ignorar" (e sai de "incluir"), e todas as sessões dele somem do histórico, inclusive a que
    /// está aberta. Só aceita um exe que tenha sessão (a página não ignora um exe qualquer).
    /// </summary>
    string? MarkNotGame(string? exe)
    {
        exe = exe?.Trim();
        if (string.IsNullOrEmpty(exe)) return null;
        var known = _sessions.Exes().Contains(exe) || string.Equals(CurrentGame?.Exe, exe, StringComparison.OrdinalIgnoreCase);
        if (!known) return null;
        _config.Update(c =>
        {
            if (!c.Games.Ignore.Contains(exe, StringComparer.OrdinalIgnoreCase)) c.Games.Ignore.Add(exe);
            c.Games.Include.RemoveAll(x => string.Equals(x, exe, StringComparison.OrdinalIgnoreCase));
        });
        if (string.Equals(_suggester.Suggestion, exe, StringComparison.OrdinalIgnoreCase)) _suggester.Clear();
        // A sessão aberta some aqui; no próximo tick o detector já ignora o exe e o fim dela não grava nada
        _sessions.RemoveExe(exe);
        _ws.Broadcast(SessionsMessage());
        return null;
    }
}
