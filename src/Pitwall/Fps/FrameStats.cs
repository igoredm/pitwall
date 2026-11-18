namespace Pitwall.Fps;

/// <summary>Estatísticas de frames de um processo. Janelas definidas pela soma dos frametimes, não pelo relógio.</summary>
public sealed class FrameStats
{
    const int Capacity = 16384;
    const double LowsWindowMs = 30_000;
    const double CurrentWindowMs = 1_000;

    readonly Lock _gate = new();
    readonly float[] _ring = new float[Capacity];
    int _head;
    int _count;
    double[] _scratch = new double[1024];

    public string Application { get; }
    public long LastFrameTick { get; private set; }
    public long SessionFrames { get; private set; }
    public double SessionMs { get; private set; }

    public FrameStats(string application) => Application = application;

    public void Add(double frametimeMs)
    {
        if (frametimeMs <= 0 || frametimeMs > 5_000) return;
        lock (_gate)
        {
            _ring[_head] = (float)frametimeMs;
            _head = (_head + 1) % Capacity;
            if (_count < Capacity) _count++;
            SessionFrames++;
            SessionMs += frametimeMs;
            LastFrameTick = Environment.TickCount64;
        }
    }

    /// <summary>Frametimes dos frames novos desde <paramref name="sinceFrame"/> (contador de sessão), no máximo <paramref name="max"/>.</summary>
    public float[] FramesSince(ref long sinceFrame, int max)
    {
        lock (_gate)
        {
            var n = (int)Math.Clamp(SessionFrames - sinceFrame, 0, Math.Min(max, _count));
            sinceFrame = SessionFrames;
            var result = new float[n];
            for (int i = 0; i < n; i++)
                result[i] = _ring[(_head - n + i + Capacity) % Capacity];
            return result;
        }
    }

    public void ResetSession()
    {
        lock (_gate) { SessionFrames = 0; SessionMs = 0; }
    }

    public FpsSnapshot Snapshot()
    {
        lock (_gate)
        {
            if (_count == 0) return default;

            // FPS atual e frametime: último ~1 s
            double sum = 0; int n = 0;
            for (int i = 0; i < _count && sum < CurrentWindowMs; i++)
            {
                sum += _ring[(_head - 1 - i + Capacity) % Capacity];
                n++;
            }
            var frametime = sum / n;

            // Lows: últimos ~30 s
            if (_scratch.Length < _count) _scratch = new double[Capacity];
            double wsum = 0; int m = 0;
            for (int i = 0; i < _count && wsum < LowsWindowMs; i++)
            {
                var ft = _ring[(_head - 1 - i + Capacity) % Capacity];
                _scratch[m++] = ft;
                wsum += ft;
            }
            Array.Sort(_scratch, 0, m);

            return new FpsSnapshot(
                Current: 1000.0 / frametime,
                FrametimeMs: frametime,
                Low1: Low(m, 0.01),
                Low01: Low(m, 0.001),
                SessionAvg: SessionMs > 0 ? SessionFrames * 1000.0 / SessionMs : null);
        }
    }

    /// <summary>"x% low" = FPS médio dos x% piores frames (maiores frametimes).</summary>
    double? Low(int m, double fraction)
    {
        var k = (int)Math.Ceiling(m * fraction);
        if (m < 20 || k < 1) return null;
        double s = 0;
        for (int i = m - k; i < m; i++) s += _scratch[i];
        return 1000.0 / (s / k);
    }
}

public readonly record struct FpsSnapshot(double Current, double FrametimeMs, double? Low1, double? Low01, double? SessionAvg)
{
    public bool HasData => FrametimeMs > 0;
}
