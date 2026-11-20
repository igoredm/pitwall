using System.Globalization;
using System.Text;
using Pitwall.Config;

namespace Pitwall.Logging;

/// <summary>
/// Log CSV de todas as métricas disponíveis (visíveis ou não no widget).
/// Cada linha é gravada com FlushFileBuffers para sobreviver a um desligamento abrupto.
/// A primeira linha é um comentário com a versão do formato ("# pitwall-csv v2"); o cabeçalho vem logo depois.
/// v1 (até 0.6): sem a linha de versão. v2 (0.7): fps.current = renderizado, fps.displayed novo, gpu.perfcap em texto.
/// v3 (1.2): coluna <c>marker</c> no fim (1 = um marcador foi gravado logo antes desta linha; vazio nas outras). Quem lê
/// pelo nome das colunas do cabeçalho continua funcionando.
/// </summary>
public sealed class CsvLogger : IDisposable
{
    public const int FormatVersion = 3;
    public const string MarkerColumn = "marker";
    public static string VersionLine => $"# pitwall-csv v{FormatVersion}";
    volatile bool _markPending;

    /// <summary>1.2: a próxima linha gravada leva marker = 1 (chamado de qualquer thread).</summary>
    public void MarkNext() => _markPending = true;

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

        var marker = _markPending;
        _markPending = false;
        var bytes = Encoding.UTF8.GetBytes(Row(DateTime.Now, game, _columns, values, texts, marker));
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
        _file.Write(Encoding.UTF8.GetBytes(Header(_columns)));
        _file.Flush(true);
    }

    /// <summary>Linha de versão + cabeçalho: timestamp, game, métricas…, marker.</summary>
    internal static string Header(IReadOnlyList<string> columns) =>
        VersionLine + "\r\ntimestamp,game," + string.Join(',', columns) + "," + MarkerColumn + "\r\n";

    internal static string Row(DateTime time, string? game, IReadOnlyList<string> columns, IReadOnlyDictionary<string, double?> values,
        IReadOnlyDictionary<string, string?> texts, bool marker)
    {
        var sb = new StringBuilder(512);
        sb.Append(time.ToString("yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture));
        sb.Append(',').Append(game ?? "");
        foreach (var c in columns)
        {
            sb.Append(',');
            if (values.TryGetValue(c, out var v) && v is { } d && double.IsFinite(d))
                sb.Append(d.ToString("0.##", CultureInfo.InvariantCulture));
            else if (texts.TryGetValue(c, out var t) && t != null)
                sb.Append(t.Replace(',', ' ')); // métricas de texto (gpu.perfcap): palavras fixas, sem vírgula
        }
        sb.Append(',');
        if (marker) sb.Append('1');
        sb.Append("\r\n");
        return sb.ToString();
    }

    void Close()
    {
        try { _file?.Dispose(); } catch { }
        _file = null;
    }

    public void Dispose() => Close();
}
