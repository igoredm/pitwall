namespace Pitwall.Logging;

/// <summary>
/// O CSV mais recente da pasta de logs: depois de um desligamento abrupto, são os últimos dados gravados
/// (cada linha vai para o disco na hora, então o arquivo tem tudo até o último instante).
/// </summary>
public static class LatestLog
{
    public static string? Find(string folder)
    {
        try
        {
            if (!Directory.Exists(folder)) return null;
            return new DirectoryInfo(folder).EnumerateFiles("*.csv")
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .FirstOrDefault()?.FullName;
        }
        catch { return null; }
    }

    /// <summary>Seleciona o CSV mais recente no Explorer (ou abre a pasta, se ainda não houver nenhum).</summary>
    public static void Reveal(string folder)
    {
        if (Find(folder) is { } path) System.Diagnostics.Process.Start("explorer.exe", $"/select,\"{path}\"");
        else
        {
            Directory.CreateDirectory(folder);
            System.Diagnostics.Process.Start("explorer.exe", folder);
        }
    }
}
