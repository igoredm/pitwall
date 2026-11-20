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

    // Frames exibidos (tempo de tela de cada um): com geração de frames, exibidos ≠ renderizados.
    const int DisplayCapacity = 4096;
    readonly float[] _displayRing = new float[DisplayCapacity];
    int _displayHead;
    int _displayCount;
    // Renderizados: início na CPU do último frame do jogo, para medir o intervalo real quando há frames gerados no meio
    double _lastRenderedStart;
    bool _skippedSinceRendered;

    // 1.2: erro de animação (|AnimationError|) e latência do PC por frame, com o início na CPU para a janela de ~1 s
    const int ExtraCapacity = 2048;
    readonly LatencyRing _anim = new(ExtraCapacity);
    readonly LatencyRing _pcl = new(ExtraCapacity);
    double _lastStart;

    public FrameStats(string application) => Application = application;

    /// <summary>
    /// Linha do PresentMon: frames gerados/repetidos contam só como exibidos; o frametime "renderizado" de um frame do jogo
    /// que veio depois de frames gerados é a distância até o frame do jogo anterior (CPUStartTime), não até o Present anterior.
    /// </summary>
    public void AddPresent(in PresentRow r)
    {
        lock (_gate)
        {
            if (r.DisplayedMs is { } d and > 0 and <= 5_000)
            {
                _displayRing[_displayHead] = (float)d;
                _displayHead = (_displayHead + 1) % DisplayCapacity;
                if (_displayCount < DisplayCapacity) _displayCount++;
            }
            LastFrameTick = Environment.TickCount64;
            _lastStart = r.CpuStartMs;
            if (double.IsFinite(r.AnimErrorMs)) _anim.Add(r.CpuStartMs, Math.Abs(r.AnimErrorMs));
            if (double.IsFinite(r.PcLatencyMs) && r.PcLatencyMs >= 0) _pcl.Add(r.CpuStartMs, r.PcLatencyMs);
            if (r.Kind is FrameKind.Generated or FrameKind.Repeated)
            {
                _skippedSinceRendered = true;
                return;
            }
            var ft = r.FrametimeMs;
            if (_skippedSinceRendered && _lastRenderedStart > 0 && r.CpuStartMs > _lastRenderedStart)
                ft = r.CpuStartMs - _lastRenderedStart;
            _skippedSinceRendered = false;
            _lastRenderedStart = r.CpuStartMs;
            AddCore(ft);
        }
    }

    public void Add(double frametimeMs)
    {
        lock (_gate) AddCore(frametimeMs);
    }

    void AddCore(double frametimeMs)
    {
        if (frametimeMs <= 0 || frametimeMs > 5_000) return;
        _ring[_head] = (float)frametimeMs;
        _head = (_head + 1) % Capacity;
        if (_count < Capacity) _count++;
        SessionFrames++;
        SessionMs += frametimeMs;
        LastFrameTick = Environment.TickCount64;
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

    /// <summary>Só o FPS do último ~1 s (sem ordenar a janela dos lows) — barato para olhar processos que não são o jogo.</summary>
    public double CurrentFps()
    {
        lock (_gate)
        {
            double sum = 0; int n = 0;
            for (int i = 0; i < _count && sum < CurrentWindowMs; i++)
            {
                sum += _ring[(_head - 1 - i + Capacity) % Capacity];
                n++;
            }
            return sum > 0 ? n * 1000.0 / sum : 0;
        }
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
            var sorted = new ReadOnlySpan<double>(_scratch, 0, m);

            // FPS exibido: último ~1 s de tempo de tela
            double? displayed = null;
            double dsum = 0; int dn = 0;
            for (int i = 0; i < _displayCount && dsum < CurrentWindowMs; i++)
            {
                dsum += _displayRing[(_displayHead - 1 - i + DisplayCapacity) % DisplayCapacity];
                dn++;
            }
            if (dn > 0 && dsum > 0) displayed = dn * 1000.0 / dsum;

            return new FpsSnapshot(
                Current: 1000.0 / frametime,
                FrametimeMs: frametime,
                Low1: Low(sorted, 0.01),
                Low01: Low(sorted, 0.001),
                SessionAvg: SessionMs > 0 ? SessionFrames * 1000.0 / SessionMs : null,
                Displayed: displayed,
                AnimErrorMs: _anim.Average(_lastStart, CurrentWindowMs),
                PcLatencyMs: _pcl.Average(_lastStart, CurrentWindowMs));
        }
    }

    /// <summary>"x% low" = FPS médio dos x% piores frames (maiores frametimes). <paramref name="sortedAsc"/> = frametimes em ordem crescente.</summary>
    public static double? Low(ReadOnlySpan<double> sortedAsc, double fraction)
    {
        var m = sortedAsc.Length;
        var k = (int)Math.Ceiling(m * fraction);
        if (m < 20 || k < 1) return null;
        double s = 0;
        for (int i = m - k; i < m; i++) s += sortedAsc[i];
        return 1000.0 / (s / k);
    }
}

/// <param name="Current">FPS renderizado/apresentado (sem frames gerados quando o PresentMon sabe distingui-los).</param>
/// <param name="Displayed">FPS que chegou à tela (inclui geração de frames); null sem rastreio de tela.</param>
/// <param name="AnimErrorMs">1.2: média do |erro de animação| no último ~1 s (PresentMon 2.x); null sem a coluna.</param>
/// <param name="PcLatencyMs">1.2: média da latência do PC no último ~1 s; null sem a coluna.</param>
public readonly record struct FpsSnapshot(double Current, double FrametimeMs, double? Low1, double? Low01, double? SessionAvg, double? Displayed = null,
    double? AnimErrorMs = null, double? PcLatencyMs = null)
{
    public bool HasData => FrametimeMs > 0;
}

/// <summary>Valores por frame com o início do frame (ms), para a média de uma janela de tempo. Não é thread-safe (usa o lock do FrameStats).</summary>
sealed class LatencyRing(int capacity)
{
    readonly double[] _at = new double[capacity];
    readonly float[] _v = new float[capacity];
    int _head, _count;

    public void Add(double atMs, double value)
    {
        _at[_head] = atMs;
        _v[_head] = (float)value;
        _head = (_head + 1) % _at.Length;
        if (_count < _at.Length) _count++;
    }

    /// <summary>Média dos valores em (<paramref name="nowMs"/> − <paramref name="windowMs"/>, nowMs]; null sem valores nessa janela.</summary>
    public double? Average(double nowMs, double windowMs)
    {
        if (_count == 0) return null;
        var cap = _at.Length;
        var newest = Math.Max(nowMs, _at[(_head - 1 + cap) % cap]);
        double sum = 0; int n = 0;
        for (int i = 0; i < _count; i++)
        {
            var k = (_head - 1 - i + cap) % cap;
            if (newest - _at[k] >= windowMs) break;
            sum += _v[k];
            n++;
        }
        return n > 0 ? sum / n : null;
    }
}
