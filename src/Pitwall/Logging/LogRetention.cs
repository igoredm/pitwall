using Pitwall.Config;

namespace Pitwall.Logging;

public readonly record struct LogFileInfo(string Path, DateTime LastWriteUtc, long Size);

/// <summary>Uso da pasta de logs e o que a retenção apagaria com os valores dados (prévia; nada é apagado).</summary>
public readonly record struct LogStats(long TotalBytes, int Files, DateTime? OldestUtc, int WouldDeleteFiles, long WouldDeleteBytes);

/// <summary>
/// Limpeza da pasta de logs: apaga CSVs do Pitwall mais velhos que KeepDays e, se o total passar de MaxTotalMb,
/// os mais antigos até caber. Nunca apaga o arquivo atual, o da sessão mais recente nem o mais novo da pasta,
/// e só mexe em arquivos "pitwall_*.csv" (a pasta pode ter outras coisas do usuário).
/// </summary>
public static class LogRetention
{
    public const string Pattern = "pitwall_*.csv";

    /// <summary>Escolhe o que apagar (função pura, testável).</summary>
    public static List<string> SelectForDeletion(IReadOnlyList<LogFileInfo> files, DateTime nowUtc, int keepDays, long maxTotalBytes,
        IEnumerable<string?> protectedNames)
    {
        var keep = protectedNames.Where(n => !string.IsNullOrEmpty(n)).Select(n => Path.GetFileName(n!))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        var ordered = files.OrderBy(f => f.LastWriteUtc).ToList();
        if (ordered.Count > 0) keep.Add(Path.GetFileName(ordered[^1].Path)); // o mais novo é a sessão mais recente

        var delete = new List<string>();
        var remaining = new List<LogFileInfo>();
        foreach (var f in ordered)
        {
            if (!keep.Contains(Path.GetFileName(f.Path)) && keepDays > 0 && nowUtc - f.LastWriteUtc > TimeSpan.FromDays(keepDays))
                delete.Add(f.Path);
            else
                remaining.Add(f);
        }

        if (maxTotalBytes > 0)
        {
            var total = remaining.Sum(f => f.Size);
            foreach (var f in remaining) // do mais antigo para o mais novo
            {
                if (total <= maxTotalBytes) break;
                if (keep.Contains(Path.GetFileName(f.Path))) continue;
                delete.Add(f.Path);
                total -= f.Size;
            }
        }
        return delete;
    }

    /// <summary>Prévia (função pura): totais da pasta e o que <see cref="SelectForDeletion"/> apagaria. Mesmas regras de proteção.</summary>
    public static LogStats Stats(IReadOnlyList<LogFileInfo> files, DateTime nowUtc, int keepDays, long maxTotalBytes,
        IEnumerable<string?> protectedNames)
    {
        var delete = SelectForDeletion(files, nowUtc, keepDays, maxTotalBytes, protectedNames).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var doomed = files.Where(f => delete.Contains(f.Path)).ToList();
        return new LogStats(
            files.Sum(f => f.Size),
            files.Count,
            files.Count == 0 ? null : files.Min(f => f.LastWriteUtc),
            doomed.Count,
            doomed.Sum(f => f.Size));
    }

    /// <summary>CSVs do Pitwall na pasta (sem subpastas). Pasta inexistente ou ilegível = lista vazia.</summary>
    public static List<LogFileInfo> ListFiles(string folder)
    {
        try
        {
            if (!Directory.Exists(folder)) return [];
            return new DirectoryInfo(folder).EnumerateFiles(Pattern, SearchOption.TopDirectoryOnly)
                .Select(f => new LogFileInfo(f.FullName, f.LastWriteTimeUtc, f.Length))
                .ToList();
        }
        catch { return []; }
    }

    /// <summary>Aplica a retenção na pasta. Retorna quantos arquivos foram apagados.</summary>
    public static int Run(LogConfig cfg, IEnumerable<string?> protectedNames)
    {
        if (cfg.KeepDays <= 0 && cfg.MaxTotalMb <= 0) return 0;
        var files = ListFiles(cfg.Folder);
        var deleted = 0;
        foreach (var path in SelectForDeletion(files, DateTime.UtcNow, cfg.KeepDays, cfg.MaxTotalMb * 1024L * 1024L, protectedNames))
        {
            try
            {
                File.Delete(path);
                deleted++;
            }
            catch { } // em uso/sem permissão: tenta de novo amanhã
        }
        return deleted;
    }
}
