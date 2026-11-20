using System.Globalization;

namespace Pitwall.Fps;

/// <summary>Tipo do frame (coluna FrameType do PresentMon 2.x, com --track_frame_type).</summary>
public enum FrameKind
{
    /// <summary>Sem informação (v1, NotSet/Unspecified): tratado como frame do jogo.</summary>
    Unknown,
    /// <summary>Renderizado pelo jogo.</summary>
    Application,
    /// <summary>Gerado (Intel XeFG, AMD AFMF etc.): conta como exibido, não como renderizado.</summary>
    Generated,
    /// <summary>Frame repetido pela composição.</summary>
    Repeated,
}

/// <summary>Uma linha do CSV do PresentMon, já normalizada entre v1 e v2.</summary>
/// <param name="FrametimeMs">Intervalo entre Presents (v1 msBetweenPresents, v2 FrameTime).</param>
/// <param name="DisplayedMs">Quanto tempo o frame ficou na tela; null = não foi exibido (descartado) ou sem rastreio de tela.</param>
/// <param name="CpuStartMs">Início do frame na CPU (ms desde o início da captura).</param>
/// <param name="AnimErrorMs">1.2: erro de animação (2.x AnimationError/MsAnimationError); NaN = sem coluna ou NA.</param>
/// <param name="PcLatencyMs">1.2: latência do PC (MsPCLatency/PCLatency); NaN = sem coluna ou NA.</param>
public readonly record struct PresentRow(string App, int Pid, double FrametimeMs, double? DisplayedMs, double CpuStartMs, FrameKind Kind,
    double AnimErrorMs = double.NaN, double PcLatencyMs = double.NaN);

/// <summary>
/// Leitor do CSV do PresentMon. O cabeçalho define as colunas; aceita as métricas v1 (--v1_metrics) e v2 (padrão do 2.x).
/// v1: msBetweenPresents, msBetweenDisplayChange, Dropped, TimeInSeconds.
/// v2: FrameTime, DisplayedTime (NA = não exibido), CPUStartTime, FrameType.
/// 1.2: AnimationError (2.6 com --v2_metrics; "MsAnimationError" no formato padrão do 2.x) e MsPCLatency/PCLatency, se
/// existirem no cabeçalho. Só índices de coluna: linhas sem essas colunas custam o mesmo de antes.
/// </summary>
public sealed class PresentMonCsv
{
    readonly int _app, _pid, _ft, _disp, _dropped, _start, _type, _anim = -1, _pcl = -1, _last;
    readonly bool _startInSeconds;

    public int Version { get; }
    /// <summary>O CSV traz quando o frame chegou à tela (exibidos ≠ apresentados).</summary>
    public bool HasDisplay => _disp >= 0;
    public bool HasFrameType => _type >= 0;
    public bool HasAnimationError => _anim >= 0;
    public bool HasPcLatency => _pcl >= 0;

    PresentMonCsv(string[] h)
    {
        int Col(string name) => Array.FindIndex(h, x => x.Trim().Equals(name, StringComparison.OrdinalIgnoreCase));
        _app = Col("Application");
        _pid = Col("ProcessID");
        _ft = Col("msBetweenPresents");
        if (_ft >= 0)
        {
            Version = 1;
            _disp = Col("msBetweenDisplayChange");
            _dropped = Col("Dropped");
            _start = Col("TimeInSeconds");
            _startInSeconds = true;
            _type = -1;
        }
        else
        {
            Version = 2;
            _ft = Col("FrameTime");
            _disp = Col("DisplayedTime");
            if (_disp < 0) _disp = Col("MsBetweenDisplayChange");
            _dropped = -1;
            _start = Col("CPUStartTime");
            _type = Col("FrameType");
        }
        _anim = Col("AnimationError");
        if (_anim < 0) _anim = Col("MsAnimationError");
        _pcl = Col("MsPCLatency");
        if (_pcl < 0) _pcl = Col("PCLatency");
        // Última coluna que interessa: o resto da linha nem é percorrido
        _last = new[] { _app, _pid, _ft, _disp, _dropped, _start, _type, _anim, _pcl }.Max();
    }

    /// <summary>Interpreta o cabeçalho. null se não for um cabeçalho do PresentMon (sem pid ou frametime).</summary>
    public static PresentMonCsv? FromHeader(string header)
    {
        var csv = new PresentMonCsv(header.Split(','));
        return csv._pid >= 0 && csv._ft >= 0 ? csv : null;
    }

    /// <summary>CSV simples (sem aspas) — split manual para não alocar um array por linha.</summary>
    public bool TryParse(string line, out PresentRow row)
    {
        row = default;
        ReadOnlySpan<char> span = line;
        string? app = null;
        int pid = -1;
        double ft = -1, disp = double.NaN, start = 0, anim = double.NaN, pcl = double.NaN;
        var dropped = false;
        var kind = FrameKind.Unknown;
        int col = 0;
        while (true)
        {
            var comma = span.IndexOf(',');
            var field = comma < 0 ? span : span[..comma];
            if (col == _app) app = field.ToString();
            else if (col == _pid) int.TryParse(field, NumberStyles.Integer, CultureInfo.InvariantCulture, out pid);
            else if (col == _ft) ft = Num(field);
            else if (col == _disp) disp = Num(field);
            else if (col == _dropped) dropped = field.Length == 1 && field[0] == '1';
            else if (col == _start) start = Num(field);
            else if (col == _type) kind = Kind(field);
            else if (col == _anim) anim = Num(field);
            else if (col == _pcl) pcl = Num(field);
            if (comma < 0 || col >= _last) break;
            span = span[(comma + 1)..];
            col++;
        }
        if (pid <= 0 || !(ft > 0)) return false;
        if (_startInSeconds) start *= 1000;
        double? displayed = !dropped && disp > 0 ? disp : null;
        row = new PresentRow(app ?? "?", pid, ft, displayed, double.IsFinite(start) ? start : 0, kind, anim, pcl);
        return true;
    }

    // "NA" e vazio viram NaN
    static double Num(ReadOnlySpan<char> s) =>
        double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v) ? v : double.NaN;

    static FrameKind Kind(ReadOnlySpan<char> s) =>
        s.Length == 0 || s.Equals("NotSet", StringComparison.OrdinalIgnoreCase) || s.Equals("Unspecified", StringComparison.OrdinalIgnoreCase) ? FrameKind.Unknown
        : s.Equals("Application", StringComparison.OrdinalIgnoreCase) ? FrameKind.Application
        : s.Equals("Repeated", StringComparison.OrdinalIgnoreCase) ? FrameKind.Repeated
        : FrameKind.Generated;
}
