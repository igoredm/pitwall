using System.Globalization;
using System.Text;
using Pitwall.Config;

namespace Pitwall.Logging;

/// <summary>
/// Log CSV de todas as métricas disponíveis (visíveis ou não no widget).
/// Cada linha é gravada com FlushFileBuffers para sobreviver a um desligamento abrupto.
/// A primeira linha é um comentário com a versão do formato ("# pitwall-csv v2"); o cabeçalho vem logo depois.
/// v1 (até 0.6): sem a linha de versão. v2 (0.7): fps.current = renderizado, fps.displayed novo, gpu.perfcap em texto.
/// </summary>
public sealed class CsvLogger : IDisposable
{
    public const int FormatVersion = 2;
    public static string VersionLine => $"# pitwall-csv v{FormatVersion}";

    FileStream? _file;
    string[] _columns = [];
    string? _folder;
    long _lastWriteTick;

    public string? CurrentPath => _file?.Name;
    public long CurrentSize => _file?.Length ?? 0;

    string? _tag;

    /// <summary>Começa um arquivo novo no próximo registro (um arquivo por sessão de jogo).</summary>
    public void Rotate(string? tag)
    {
        _tag = tag;
        Close();
    }

    public void Write(LogConfig cfg, IReadOnlyList<string> columns, IReadOnlyDictionary<string, double?> values,
        IReadOnlyDictionary<string, string?> texts, string? game)
    {
        if (!cfg.Enabled)
        {
            Close();
            return;
        }
        var now = Environment.TickCount64;
        if (now - _lastWriteTick < cfg.IntervalMs - 50) return;
        _lastWriteTick = now;

        if (_file == null || _folder != cfg.Folder || !_columns.SequenceEqual(columns))
            Open(cfg.Folder, columns);

        var sb = new StringBuilder(512);
        sb.Append(DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture));
        sb.Append(',').Append(game ?? "");
        foreach (var c in _columns)
        {
            sb.Append(',');
            if (values.TryGetValue(c, out var v) && v is { } d && double.IsFinite(d))
                sb.Append(d.ToString("0.##", CultureInfo.InvariantCulture));
            else if (texts.TryGetValue(c, out var t) && t != null)
                sb.Append(t.Replace(',', ' ')); // métricas de texto (gpu.perfcap): palavras fixas, sem vírgula
        }
        sb.Append("\r\n");
        var bytes = Encoding.UTF8.GetBytes(sb.ToString());
        try
        {
            _file!.Write(bytes);
            _file.Flush(flushToDisk: true);
        }
        catch
        {
            Close();
        }
    }

    void Open(string folder, IReadOnlyList<string> columns)
    {
        Close();
        Directory.CreateDirectory(folder);
        var suffix = _tag == null ? "" : "_" + string.Concat(Path.GetFileNameWithoutExtension(_tag).Split(Path.GetInvalidFileNameChars()));
        var path = Path.Combine(folder, $"pitwall_{DateTime.Now:yyyy-MM-dd_HH-mm-ss}{suffix}.csv");
        _file = new FileStream(path, FileMode.Append, FileAccess.Write, FileShare.Read, 4096, FileOptions.WriteThrough);
        _folder = folder;
        _columns = [.. columns];
        var header = VersionLine + "\r\ntimestamp,game," + string.Join(',', _columns) + "\r\n";
        _file.Write(Encoding.UTF8.GetBytes(header));
        _file.Flush(true);
    }

    void Close()
    {
        try { _file?.Dispose(); } catch { }
        _file = null;
    }

    public void Dispose() => Close();
}
