using System.Globalization;

namespace Pitwall.Games;

/// <summary>
/// 1.2: séries de uma sessão para o relatório de jogo (getSessionSeries), lidas do CSV da sessão e reamostradas em
/// N baldes (média por balde). Roda sob demanda, fora da thread de telemetria; lê o arquivo em fluxo, até <see cref="MaxBytes"/>.
/// </summary>
public static class SessionSeries
{
    /// <summary>Colunas do CSV (ids das métricas) que viram série. Só vão as que existem no cabeçalho.</summary>
    public static readonly string[] Ids = ["fps.current", "fps.low1", "gpu.temp", "gpu.hotspot", "gpu.power", "gpu.clock", "cpu.temp", "cpu.load"];
    public const int DefaultPoints = 120;
    public const int MaxPoints = 1000;
    public const long MaxBytes = 50L * 1024 * 1024;

    public sealed record Result(double StepSec, Dictionary<string, double?[]> Series);

    /// <summary>Lê o CSV aberto (cabeçalho do Pitwall, com ou sem a linha "# pitwall-csv") e reamostra. null = sem cabeçalho/linhas.</summary>
    public static Result? Read(TextReader reader, int points, long maxBytes = MaxBytes)
    {
        points = Math.Clamp(points, 2, MaxPoints);
        string? line;
        string[]? header = null;
        while ((line = reader.ReadLine()) != null)
        {
            if (line.Length == 0 || line[0] == '#') continue;
            header = line.Split(',');
            break;
        }
        if (header == null || header.Length < 2 || header[0] != "timestamp") return null;

        // Coluna → posição na lista de séries (-1 = não interessa)
        var want = new int[header.Length];
        var ids = new List<string>();
        for (int i = 0; i < header.Length; i++)
        {
            var k = Array.IndexOf(Ids, header[i].Trim());
            want[i] = k < 0 ? -1 : ids.Count;
            if (k >= 0) ids.Add(Ids[k]);
        }
        var last = Array.FindLastIndex(want, w => w >= 0);

        var times = new List<double>(4096);
        var cols = ids.Select(_ => new List<float>(4096)).ToArray();
        DateTime? t0 = null;
        long read = 0;
        while ((line = reader.ReadLine()) != null && read < maxBytes)
        {
            read += line.Length + 2;
            ReadOnlySpan<char> span = line;
            var comma = span.IndexOf(',');
            if (comma <= 0 || !DateTime.TryParseExact(span[..comma], "yyyy-MM-dd HH:mm:ss.fff", CultureInfo.InvariantCulture, DateTimeStyles.None, out var ts))
                continue;
            t0 ??= ts;
            times.Add((ts - t0.Value).TotalSeconds);
            foreach (var c in cols) c.Add(float.NaN);
            span = span[(comma + 1)..];
            for (int col = 1; col <= last; col++)
            {
                comma = span.IndexOf(',');
                var field = comma < 0 ? span : span[..comma];
                if (want[col] >= 0 && float.TryParse(field, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) && float.IsFinite(v))
                    cols[want[col]][^1] = v;
                if (comma < 0) break;
                span = span[(comma + 1)..];
            }
        }
        if (times.Count == 0) return null;

        var span0 = times[^1];
        var buckets = Math.Min(points, times.Count);
        var series = new Dictionary<string, double?[]>();
        for (int i = 0; i < ids.Count; i++)
        {
            var s = Downsample(times.ToArray(), cols[i].ToArray(), buckets, span0);
            // Coluna inteira vazia (ex.: fps fora de jogo): não vai
            if (s.Any(x => x != null)) series[ids[i]] = s;
        }
        return new Result(buckets > 0 && span0 > 0 ? Math.Round(span0 / buckets, 3) : 0, series);
    }

    /// <summary>
    /// Regra pura: <paramref name="t"/> = segundos desde a primeira linha (crescente), <paramref name="v"/> = valor (NaN = sem leitura).
    /// Divide [0, span] em <paramref name="buckets"/> baldes iguais e tira a média de cada um; balde sem leitura = null.
    /// </summary>
    public static double?[] Downsample(ReadOnlySpan<double> t, ReadOnlySpan<float> v, int buckets, double span)
    {
        var result = new double?[Math.Max(0, buckets)];
        if (buckets <= 0) return result;
        var sum = new double[buckets];
        var n = new int[buckets];
        for (int i = 0; i < t.Length && i < v.Length; i++)
        {
            if (!float.IsFinite(v[i])) continue;
            var b = span > 0 ? (int)(t[i] / span * buckets) : 0;
            b = Math.Clamp(b, 0, buckets - 1);
            sum[b] += v[i];
            n[b]++;
        }
        for (int b = 0; b < buckets; b++)
            if (n[b] > 0) result[b] = Math.Round(sum[b] / n[b], 1);
        return result;
    }
}
