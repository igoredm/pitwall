namespace Pitwall.Fps;

/// <summary>
/// Engasgos (docs/v12-contract.md › Engasgo): frame renderizado com ft ≥ max(2,5 × mediana dos últimos 120 frames,
/// mediana + 10 ms), ignorando os primeiros 10 s da sessão.
/// Memória fixa (2 × 120 floats) e sem alocação por frame: a mediana é recalculada a cada <see cref="MedianEvery"/>
/// frames ordenando uma cópia de 120 elementos (~0,5 µs/frame medido, ~0,015% de um núcleo a 300 fps).
/// Não é thread-safe: usado só pela thread de telemetria (SessionStatsAccumulator).
/// </summary>
public sealed class StutterDetector
{
    public const int Window = 120;
    public const double WarmupMs = 10_000;
    public const int MedianEvery = 16;
    /// <summary>Com menos frames que isso na janela a mediana ainda não vale (só no começo).</summary>
    const int MinFrames = 30;

    readonly float[] _ring = new float[Window];
    readonly float[] _scratch = new float[Window];
    int _head, _count, _sinceMedian = MedianEvery;
    double _median, _elapsedMs;

    /// <summary>Engasgos contados até agora.</summary>
    public int Count { get; private set; }

    /// <summary>Mediana atual da janela (ms); 0 antes de ter frames suficientes.</summary>
    public double Median => _count >= MinFrames ? _median : 0;

    /// <summary>
    /// Enche a janela sem contar nem avançar o aquecimento (frames de antes da sessão, que o PresentMon já tinha).
    /// </summary>
    public void Prime(ReadOnlySpan<float> frametimes)
    {
        var start = Math.Max(0, frametimes.Length - Window);
        for (int i = start; i < frametimes.Length; i++) Push(frametimes[i]);
    }

    /// <returns>true = este frame foi um engasgo.</returns>
    public bool Add(float ft)
    {
        if (!(ft > 0) || ft > 5_000) return false;
        var stutter = false;
        if (_elapsedMs >= WarmupMs && _count >= MinFrames)
        {
            if (_sinceMedian >= MedianEvery) UpdateMedian();
            if (ft >= Math.Max(2.5 * _median, _median + 10))
            {
                Count++;
                stutter = true;
            }
        }
        _elapsedMs += ft;
        Push(ft);
        return stutter;
    }

    public void Add(ReadOnlySpan<float> frametimes)
    {
        foreach (var ft in frametimes) Add(ft);
    }

    void Push(float ft)
    {
        if (!(ft > 0) || ft > 5_000) return;
        _ring[_head] = ft;
        _head = (_head + 1) % Window;
        if (_count < Window) _count++;
        _sinceMedian++;
    }

    void UpdateMedian()
    {
        Array.Copy(_ring, _scratch, _count);
        Array.Sort(_scratch, 0, _count);
        var mid = _count / 2;
        _median = _count % 2 == 1 ? _scratch[mid] : (_scratch[mid - 1] + _scratch[mid]) / 2.0;
        _sinceMedian = 0;
    }
}
