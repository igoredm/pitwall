using System.Text.Json;
using Pitwall.Config;

namespace Pitwall.Health;

/// <summary>
/// Buffer circular do PC: 1 amostra/s, 120 s, das séries <see cref="Ids"/> (models.ts › PcSeriesId). Sempre ligado com
/// features.crashReport, com ou sem jogo. Amostrar não aloca; o JSON só é montado na gravação.
/// </summary>
public sealed class PcRing
{
    public static readonly string[] Ids =
    [
        "gpu.temp", "gpu.hotspot", "gpu.memjunction", "gpu.power", "gpu.clock", "gpu.load", "gpu.fan",
        "cpu.temp", "cpu.power", "cpu.load", "ram.load", "fps.current",
    ];
    public const int Points = 120;
    public const long SampleMs = 1_000;

    readonly double?[][] _data;
    readonly string[] _ids;
    int _head, _count;
    long _lastSample;

    /// <param name="ids">Séries a guardar (as de <see cref="Ids"/> que existem neste PC); null = todas.</param>
    public PcRing(IEnumerable<string>? ids = null)
    {
        _ids = ids?.ToArray() ?? Ids;
        _data = _ids.Select(_ => new double?[Points]).ToArray();
    }

    public int Count => _count;

    public void Reset()
    {
        _head = _count = 0;
        _lastSample = 0;
        foreach (var s in _data) Array.Clear(s);
    }

    /// <summary>Guarda uma amostra se passou ~1 s desde a última.</summary>
    public bool Sample(IReadOnlyDictionary<string, double?> values, long nowMs)
    {
        if (_lastSample != 0 && nowMs - _lastSample < SampleMs - 50) return false;
        _lastSample = nowMs;
        for (int i = 0; i < _ids.Length; i++)
            _data[i][_head] = values.TryGetValue(_ids[i], out var v) && v is { } d && double.IsFinite(d) ? Math.Round(d, 1) : null;
        _head = (_head + 1) % Points;
        if (_count < Points) _count++;
        return true;
    }

    /// <summary>Séries da mais antiga para a mais nova (no máximo <paramref name="last"/> pontos, das ids pedidas).</summary>
    public Dictionary<string, double?[]> Series(int last = Points, IEnumerable<string>? only = null)
    {
        var want = only?.ToHashSet();
        var n = Math.Min(last, _count);
        var result = new Dictionary<string, double?[]>();
        for (int i = 0; i < _ids.Length; i++)
        {
            if (want != null && !want.Contains(_ids[i])) continue;
            var arr = new double?[n];
            for (int k = 0; k < n; k++) arr[k] = _data[i][(_head - n + k + Points * 2) % Points];
            result[_ids[i]] = arr;
        }
        return result;
    }

    // --- Arquivo ---

    public static readonly string Dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Pitwall");
    public static readonly string FilePath = Path.Combine(Dir, "pc-ring.json");
    internal static readonly JsonSerializerOptions Compact = new(ConfigStore.Json) { WriteIndented = false };

    /// <summary>Escrita atômica: temporário gravado direto no disco (WriteThrough) + rename.</summary>
    public static void Write(string path, object value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + ".tmp";
        using (var fs = new FileStream(tmp, FileMode.Create, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough))
        {
            JsonSerializer.Serialize(fs, value, value.GetType(), Compact);
            fs.Flush(flushToDisk: true);
        }
        File.Move(tmp, path, overwrite: true);
    }

    public static PcRingFile? Load(string? path = null)
    {
        path ??= FilePath;
        try
        {
            return File.Exists(path) ? JsonSerializer.Deserialize<PcRingFile>(File.ReadAllText(path), Compact) : null;
        }
        catch { return null; }
    }

    public static void Delete()
    {
        try { File.Delete(FilePath); } catch { }
    }
}
