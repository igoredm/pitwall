using Pitwall.Localization;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.Globalization;
using Pitwall.Native;

namespace Pitwall.Fps;

/// <summary>
/// Roda o PresentMon (console) escondido e lê o CSV do stdout. O PresentMon consome eventos ETW
/// do DXGI/D3D/DxgKrnl — nada é injetado no processo do jogo.
/// </summary>
public sealed class PresentMonService : IDisposable
{
    const string SessionName = "PitwallPresentMon";

    readonly string _exe = Path.Combine(AppContext.BaseDirectory, "tools", "PresentMon.exe");
    readonly ConcurrentDictionary<int, FrameStats> _byPid = new();
    readonly JobObject _job = new();
    readonly CancellationTokenSource _cts = new();
    Process? _process;

    public bool Available => File.Exists(_exe);
    public string? LastError { get; private set; }

    volatile bool _capturing;
    volatile bool _blocked;

    /// <summary>Sessão ETW aberta e lendo frames agora.</summary>
    public bool Healthy => _capturing;

    /// <summary>Motivo legível quando não está capturando (null = tudo certo).</summary>
    public string? StatusText =>
        _capturing ? null
        : !Available ? L.T("PresentMon não encontrado", "PresentMon not found")
        : _blocked ? L.T("Captura de FPS bloqueada — provavelmente pelo anti-cheat do jogo aberto (ex.: EA FC). Feche o jogo e abra de novo para voltar a medir FPS.",
              "FPS capture blocked — most likely by the running game's anti-cheat (e.g. EA FC). Close the game and open it again to measure FPS.")
        : "Iniciando captura de FPS…";

    public void Start()
    {
        if (!Available)
        {
            LastError = L.T("PresentMon.exe não encontrado em tools/", "PresentMon.exe not found in tools/");
            return;
        }
        new Thread(RunLoop) { IsBackground = true, Name = "PresentMon reader", Priority = ThreadPriority.BelowNormal }.Start();
    }

    /// <summary>Stats do processo, se ele apresentou frames nos últimos <paramref name="staleMs"/> ms.</summary>
    public FrameStats? Get(int pid, int staleMs = 2_000) =>
        _byPid.TryGetValue(pid, out var s) && Environment.TickCount64 - s.LastFrameTick < staleMs ? s : null;

    /// <summary>Processos apresentando frames agora (pid → nome do exe).</summary>
    public IEnumerable<(int Pid, string App)> ActivePresenters(int staleMs = 2_000)
    {
        var now = Environment.TickCount64;
        foreach (var (pid, s) in _byPid)
            if (now - s.LastFrameTick < staleMs) yield return (pid, s.Application);
    }

    void RunLoop()
    {
        var backoff = 1_000;
        while (!_cts.IsCancellationRequested)
        {
            try
            {
                RunOnce();
                backoff = 1_000;
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
            }
            if (_cts.IsCancellationRequested) break;
            Thread.Sleep(backoff);
            // Teto curto: quando o jogo que bloqueia a captura fecha, volta a medir em ~10 s
            backoff = Math.Min(backoff * 2, 10_000);
        }
    }

    void RunOnce()
    {
        var psi = new ProcessStartInfo(_exe)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        foreach (var arg in new[]
                 {
                     "--output_stdout", "--no_console_stats", "--v1_metrics",
                     "--stop_existing_session", "--session_name", SessionName,
                     "--no_track_input", "--no_track_gpu", "--no_track_display",
                     "--exclude", "dwm.exe", "--exclude", "Pitwall.exe", "--exclude", "msedgewebview2.exe",
                 })
            psi.ArgumentList.Add(arg);

        using var p = Process.Start(psi) ?? throw new InvalidOperationException(L.T("Falha ao iniciar PresentMon", "Failed to start PresentMon"));
        _process = p;
        _job.Assign(p);
        p.PriorityClass = ProcessPriorityClass.BelowNormal;
        p.ErrorDataReceived += (_, e) =>
        {
            if (string.IsNullOrWhiteSpace(e.Data)) return;
            // "error: failed to start trace session: access denied." — mesmo como admin: algum anti-cheat (EA Javelin)
            // impede abrir sessões ETW novas enquanto o jogo está rodando.
            if (e.Data.Contains("access denied", StringComparison.OrdinalIgnoreCase)) _blocked = true;
            if (e.Data.StartsWith("error", StringComparison.OrdinalIgnoreCase)) LastError = e.Data.Trim();
        };
        p.BeginErrorReadLine();

        int colApp = -1, colPid = -1, colFt = -1;
        string? line;
        while ((line = p.StandardOutput.ReadLine()) != null)
        {
            if (colFt < 0)
            {
                var header = line.Split(',');
                colApp = Array.FindIndex(header, h => h.Equals("Application", StringComparison.OrdinalIgnoreCase));
                colPid = Array.FindIndex(header, h => h.Equals("ProcessID", StringComparison.OrdinalIgnoreCase));
                colFt = Array.FindIndex(header, h => h.Equals("msBetweenPresents", StringComparison.OrdinalIgnoreCase));
                if (colFt < 0) colFt = Array.FindIndex(header, h => h.Equals("FrameTime", StringComparison.OrdinalIgnoreCase));
                // Cabeçalho do CSV = sessão ETW aberta com sucesso
                _capturing = true;
                _blocked = false;
                LastError = null;
                continue;
            }
            ParseRow(line, colApp, colPid, colFt);
        }
        p.WaitForExit();
        _capturing = false;
        LastError ??= L.T($"PresentMon saiu (código {p.ExitCode})", $"PresentMon exited (code {p.ExitCode})");
    }

    void ParseRow(string line, int colApp, int colPid, int colFt)
    {
        // CSV simples (sem aspas) — split manual para não alocar um array por linha
        ReadOnlySpan<char> span = line;
        string? app = null; int pid = -1; double ft = -1;
        int col = 0;
        while (true)
        {
            var comma = span.IndexOf(',');
            var field = comma < 0 ? span : span[..comma];
            if (col == colApp) app = field.ToString();
            else if (col == colPid) int.TryParse(field, NumberStyles.Integer, CultureInfo.InvariantCulture, out pid);
            else if (col == colFt) double.TryParse(field, NumberStyles.Float, CultureInfo.InvariantCulture, out ft);
            if (comma < 0) break;
            span = span[(comma + 1)..];
            col++;
        }
        if (pid <= 0 || ft <= 0) return;
        _byPid.GetOrAdd(pid, _ => new FrameStats(app ?? "?")).Add(ft);
    }

    public void CleanupStale()
    {
        var now = Environment.TickCount64;
        foreach (var (pid, s) in _byPid)
            if (now - s.LastFrameTick > 60_000) _byPid.TryRemove(pid, out _);
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _process?.Kill(); } catch { }
        // Encerra a sessão ETW para não deixar lixo
        try
        {
            if (Available)
            {
                using var stop = Process.Start(new ProcessStartInfo(_exe, $"--terminate_existing_session --session_name {SessionName}")
                { CreateNoWindow = true, UseShellExecute = false });
                stop?.WaitForExit(3_000);
            }
        }
        catch { }
        _job.Dispose();
    }
}
