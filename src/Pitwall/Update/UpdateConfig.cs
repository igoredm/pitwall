namespace Pitwall.Config;

/// <summary>Atualização automática (GitHub Releases). Ver docs/updater.md.</summary>
public sealed class UpdateConfig
{
    /// <summary>Verifica sozinho 2 min depois de abrir e a cada 24 h. Desligado = só pelo menu "Verificar atualizações".</summary>
    public bool AutoCheck { get; set; } = true;
    /// <summary>stable (só releases publicadas) | beta (inclui pré-lançamentos, tags vX.Y.Z-beta.N)</summary>
    public string Channel { get; set; } = "stable";
    /// <summary>Versão que o usuário mandou pular: não avisa de novo por ela (uma mais nova volta a avisar).</summary>
    public string? SkippedVersion { get; set; }
}
