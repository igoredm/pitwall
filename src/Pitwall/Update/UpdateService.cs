using System.Diagnostics;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pitwall.Config;
using Pitwall.Localization;

namespace Pitwall.Update;

/// <summary>Estado exposto à interface (catálogo + mensagem "update").</summary>
public sealed record UpdateState
{
    /// <summary>idle | checking | available | downloading | ready | error</summary>
    public string Status { get; init; } = "idle";
    public string Current { get; init; } = "";
    public string? Version { get; init; }
    public string? NotesUrl { get; init; }
    /// <summary>Notas da release em markdown, truncadas. Texto vindo da internet: a interface deve sanitizar.</summary>
    public string? Notes { get; init; }
    /// <summary>Tamanho do instalador (bytes).</summary>
    public long? Size { get; init; }
    public string Channel { get; init; } = "stable";
    /// <summary>0–100 durante o download.</summary>
    public int? Progress { get; init; }
    public string? Error { get; init; }
    /// <summary>O usuário escolheu "atualizar ao sair".</summary>
    public bool InstallOnExit { get; init; }
    /// <summary>O usuário pediu "atualizar agora", mas há um jogo aberto: instala quando ele fechar.</summary>
    public bool WaitingForGame { get; init; }
    public DateTimeOffset? LastCheck { get; init; }
}

/// <summary>
/// Atualizador: consulta o GitHub Releases, baixa e verifica o instalador e o executa em silêncio.
/// Ordem das verificações e motivos em docs/updater.md. Nunca instala com um jogo aberto.
/// </summary>
public sealed class UpdateService : IDisposable
{
    /// <summary>
    /// Liga a exigência de assinatura Authenticode mesmo quando o build atual não é assinado.
    /// Quando as releases passarem a ser assinadas (SignPath), troque para true e preencha <see cref="ExpectedSubject"/>.
    /// </summary>
    internal const bool RequireSignature = false;
    /// <summary>Subject esperado do certificado quando <see cref="RequireSignature"/> = true e o exe atual não é assinado. null = só "válido".</summary>
    internal const string? ExpectedSubject = null;

    static readonly TimeSpan FirstCheck = TimeSpan.FromMinutes(2);
    static readonly TimeSpan Interval = TimeSpan.FromHours(24);
    static readonly TimeSpan AfterGameDelay = TimeSpan.FromSeconds(15);

    readonly ConfigStore _config;
    readonly TelemetryHub _hub;
    readonly ReleaseClient _client = new();
    readonly CancellationTokenSource _cts = new();
    readonly SemaphoreSlim _busy = new(1, 1);
    readonly Lock _gate = new();
    readonly SemVer? _current;
    System.Threading.Timer? _timer;

    UpdateState _state;
    ReleaseInfo? _release;
    string? _installerPath;
    FileStream? _installerLock;   // aberto só para leitura, sem compartilhar escrita: ninguém troca o arquivo depois de verificado
    bool _installNow, _installOnExit, _launched;
    string? _notifiedVersion;

    /// <summary>Estado mudou (a mensagem WebSocket sai de <see cref="StateMessage"/>).</summary>
    public event Action<UpdateState>? Changed;
    /// <summary>Uma versão nova foi encontrada (uma vez por versão por execução) — balão na bandeja.</summary>
    public event Action<string>? UpdateAvailable;
    /// <summary>Aviso para o usuário (texto já traduzido, é erro?) — resultado de uma verificação manual etc.</summary>
    public event Action<string, bool>? Notice;
    /// <summary>O instalador foi iniciado: o app precisa fechar para ele continuar.</summary>
    public event Action? ExitRequested;

    public UpdateService(ConfigStore config, TelemetryHub hub)
    {
        _config = config;
        _hub = hub;
        var info = typeof(UpdateService).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion;
        if (SemVer.TryParse(info?.Split('+')[0], out var v)) _current = v;
        _state = new UpdateState { Current = _current?.ToString() ?? info ?? "?", Channel = ChannelOf(config.Current) };
        hub.GameChanged += OnGameChanged;
        config.Changed += c =>
        {
            var ch = ChannelOf(c);
            if (ch != State.Channel) Set(s => s with { Channel = ch });
        };
    }

    public UpdateState State { get { lock (_gate) return _state; } }

    public string StateMessage() => JsonSerializer.Serialize(new { type = "update", update = State }, ConfigStore.Json);

    static string ChannelOf(AppConfig c) => c.Update?.Channel == "beta" ? "beta" : "stable";

    public void Start()
    {
        if (_current == null) { UpdateLog.Write("versão atual não é SemVer; atualizador desligado"); return; }
        _timer = new System.Threading.Timer(_ =>
        {
            UpdateFolder.DeleteInstallers(); // sobras da atualização anterior
            if (_config.Current.Update?.AutoCheck != false) _ = CheckAsync(manual: false);
        }, null, FirstCheck, Interval);
    }

    // ---------- verificação ----------

    public async Task CheckAsync(bool manual)
    {
        if (_current == null) return;
        var st = State.Status;
        if (st is "downloading" or "ready")
        {
            if (manual) Notice?.Invoke(L.T($"Pitwall {State.Version} já está sendo preparado.", $"Pitwall {State.Version} is already being prepared."), false);
            return;
        }
        if (!await _busy.WaitAsync(0)) return;
        try
        {
            var channel = ChannelOf(_config.Current);
            Set(s => s with { Status = "checking", Error = null, Channel = channel });
            var release = await _client.FindNewerAsync(_current, channel == "beta", _cts.Token);
            var skipped = _config.Current.Update?.SkippedVersion;
            var now = DateTimeOffset.Now;

            if (release == null || (!manual && skipped != null && SemVer.TryParse(skipped, out var sk) && sk.Equals(release.Version)))
            {
                lock (_gate) _release = null;
                Set(s => s with { Status = "idle", Version = null, NotesUrl = null, Notes = null, Size = null, LastCheck = now });
                UpdateLog.Write(release == null ? $"sem atualização ({channel})" : $"{release.Version} disponível, mas foi pulada");
                if (manual) Notice?.Invoke(L.T($"Você está na versão mais recente ({_current}).", $"You are on the latest version ({_current})."), false);
                return;
            }

            lock (_gate) _release = release;
            var ver = release.Version.ToString();
            Set(s => s with { Status = "available", Version = ver, NotesUrl = release.NotesUrl, Notes = release.Notes, Size = release.InstallerSize, LastCheck = now });
            UpdateLog.Write($"{ver} disponível ({channel})");
            if (_notifiedVersion != ver || manual)
            {
                _notifiedVersion = ver;
                UpdateAvailable?.Invoke(ver);
            }
        }
        catch (OperationCanceledException) when (_cts.IsCancellationRequested) { }
        catch (Exception ex)
        {
            UpdateLog.Write("falha ao verificar: " + ex.Message);
            Set(s => s with { Status = "error", Error = L.T("Não foi possível verificar atualizações.", "Could not check for updates.") });
            if (manual) Notice?.Invoke(L.T("Não foi possível verificar atualizações. Tente de novo mais tarde.", "Could not check for updates. Try again later."), true);
        }
        finally
        {
            _busy.Release();
        }
    }

    // ---------- download + verificação ----------

    /// <summary>"Atualizar agora" (<paramref name="now"/> = true) ou "atualizar ao sair".</summary>
    public void RequestInstall(bool now)
    {
        lock (_gate)
        {
            if (_release == null) return;
            if (now) _installNow = true; else _installOnExit = true;
        }
        Set(s => s with { InstallOnExit = _installOnExit });
        if (State.Status == "ready") { if (now) TryInstallNow(); }
        else if (State.Status is "available" or "error") _ = DownloadAsync();
    }

    async Task DownloadAsync()
    {
        if (!await _busy.WaitAsync(0)) return;
        ReleaseInfo? release;
        lock (_gate) release = _release;
        if (release == null) { _busy.Release(); return; }
        var ver = release.Version.ToString();
        try
        {
            Set(s => s with { Status = "downloading", Progress = 0, Error = null });
            ReleaseLock();
            UpdateFolder.EnsureSecure();
            UpdateFolder.DeleteInstallers();

            var name = $"Pitwall-Setup-{ver}.exe";
            var path = Path.Combine(UpdateFolder.Dir, name);

            // 1) hash esperado (SHA256SUMS.txt da mesma release)
            var expected = Convert.FromHexString(await _client.GetChecksumAsync(release, name, _cts.Token));

            // 2) download (hosts conferidos a cada redirecionamento, tamanho conferido)
            byte[] downloaded;
            await using (var fs = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, FileOptions.Asynchronous))
                downloaded = await _client.DownloadAsync(release, fs, p => Set(s => s with { Progress = p }), _cts.Token);
            if (!CryptographicOperations.FixedTimeEquals(downloaded, expected))
                throw new InvalidDataException("SHA-256 não confere com o SHA256SUMS.txt");

            // 3) trava o arquivo (leitura apenas, sem compartilhar escrita/exclusão) e confere de novo O QUE ESTÁ TRAVADO
            var locked = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read);
            try
            {
                if (!string.Equals(UpdateFolder.FinalPath(locked.SafeFileHandle), Path.GetFullPath(path), StringComparison.OrdinalIgnoreCase))
                    throw new IOException("o caminho do instalador mudou");
                var again = await SHA256.HashDataAsync(locked, _cts.Token);
                if (!CryptographicOperations.FixedTimeEquals(again, expected))
                    throw new InvalidDataException("SHA-256 mudou depois do download");

                // 4) assinatura Authenticode
                CheckSignature(path, locked);
            }
            catch
            {
                locked.Dispose();
                throw;
            }

            lock (_gate) { _installerLock = locked; _installerPath = path; }
            Set(s => s with { Status = "ready", Progress = null });
            UpdateLog.Write($"{ver} baixado e verificado: {path}");
        }
        catch (OperationCanceledException) when (_cts.IsCancellationRequested) { }
        catch (Exception ex)
        {
            UpdateLog.Write($"falha ao baixar/verificar {ver}: {ex.Message}");
            ReleaseLock();
            UpdateFolder.DeleteInstallers();
            lock (_gate) { _installNow = false; _installOnExit = false; }
            Set(s => s with
            {
                Status = "error", Progress = null, InstallOnExit = false, WaitingForGame = false,
                Error = L.T("A atualização baixada não passou na verificação de segurança e foi descartada.",
                            "The downloaded update failed the security check and was discarded."),
            });
            Notice?.Invoke(L.T("A atualização não pôde ser preparada. Tente de novo mais tarde.", "The update could not be prepared. Try again later."), true);
            return;
        }
        finally
        {
            _busy.Release();
        }

        if (_installNow) TryInstallNow();
        else Notice?.Invoke(L.T($"Pitwall {ver} será instalado quando você sair do app.", $"Pitwall {ver} will be installed when you exit the app."), false);
    }

    /// <summary>
    /// Se o exe atual é assinado, o instalador novo TEM que ser assinado validamente pelo mesmo subject.
    /// Build atual sem assinatura (hoje): basta o hash, com aviso no log — a menos que <see cref="RequireSignature"/>.
    /// </summary>
    static void CheckSignature(string installer, FileStream locked)
    {
        var self = Environment.ProcessPath is { } exe ? Authenticode.Verify(exe) : new Authenticode.Signature(Authenticode.Result.Unsigned, null, "");
        var neu = Authenticode.Verify(installer, locked.SafeFileHandle);

        if (self.Result != Authenticode.Result.Unsigned || RequireSignature)
        {
            if (neu.Result != Authenticode.Result.Valid)
                throw new InvalidDataException($"instalador sem assinatura válida ({neu.Detail})");
            var expected = self.Result != Authenticode.Result.Unsigned ? self.Subject : ExpectedSubject;
            if (self.Result != Authenticode.Result.Unsigned && expected == null)
                throw new InvalidDataException("não foi possível ler o certificado do app atual");
            if (expected != null && !string.Equals(neu.Subject, expected, StringComparison.Ordinal))
                throw new InvalidDataException($"assinado por outro certificado: {neu.Subject}");
            // Certificados compartilhados (ex.: SignPath Foundation assina vários projetos com o mesmo subject): o
            // recurso de versão faz parte do que foi assinado, então exige também que o binário seja um instalador do Pitwall.
            var product = FileVersionInfo.GetVersionInfo(installer).ProductName?.Trim(' ', '\0'); // o Inno completa com espaços
            if (!string.Equals(product, "Pitwall", StringComparison.Ordinal))
                throw new InvalidDataException($"binário assinado não é do Pitwall (ProductName={product})");
            UpdateLog.Write($"assinatura ok: {neu.Subject}");
            return;
        }

        // Uma assinatura presente mas quebrada é suspeita mesmo sem exigência
        if (neu.Result == Authenticode.Result.Invalid)
            throw new InvalidDataException($"assinatura inválida no instalador ({neu.Detail})");
        UpdateLog.Write("AVISO: o build atual não é assinado; o instalador foi aceito só pelo SHA-256 " +
                        (neu.Result == Authenticode.Result.Valid ? $"(está assinado por {neu.Subject})" : "(também sem assinatura)"));
    }

    // ---------- instalação ----------

    void OnGameChanged(Games.GameInfo? game)
    {
        if (game != null || !_installNow || State.Status != "ready") return;
        // Espera um pouco: o jogo pode estar só reiniciando, ou o launcher abrindo outro executável
        _ = Task.Delay(AfterGameDelay, _cts.Token).ContinueWith(t => { if (!t.IsCanceled) TryInstallNow(); }, TaskScheduler.Default);
    }

    void TryInstallNow()
    {
        if (State.Status != "ready") return;
        if (_hub.CurrentGame != null)
        {
            Set(s => s with { WaitingForGame = true });
            UpdateLog.Write($"jogo aberto ({_hub.CurrentGame.Exe}); instalação adiada");
            return;
        }
        if (Launch(restart: true)) ExitRequested?.Invoke();
    }

    /// <summary>Chamado depois que a janela principal fechou: instala se o usuário escolheu "ao sair" (ou pediu "agora" e havia jogo).</summary>
    public void InstallOnExitIfPending()
    {
        if (!(_installOnExit || _installNow) || State.Status != "ready") return;
        if (_hub.CurrentGame != null) { UpdateLog.Write("saída com jogo aberto; atualização fica para depois"); return; }
        Launch(restart: false);
    }

    bool Launch(bool restart)
    {
        string path;
        lock (_gate)
        {
            if (_launched || _installerPath == null || _installerLock == null) return false;
            // O handle travado garante que o arquivo (e as pastas acima) não foram trocados desde a verificação
            if (!string.Equals(UpdateFolder.FinalPath(_installerLock.SafeFileHandle), Path.GetFullPath(_installerPath), StringComparison.OrdinalIgnoreCase))
            {
                UpdateLog.Write("caminho do instalador mudou; cancelado");
                return false;
            }
            _launched = true;
            path = _installerPath;
        }
        try
        {
            var psi = new ProcessStartInfo(path)
            {
                UseShellExecute = false,
                WorkingDirectory = UpdateFolder.Dir,
            };
            foreach (var a in new[] { "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART" }) psi.ArgumentList.Add(a);
            // O .iss reabre o app no fim quando recebe /RESTARTAPPLICATIONS (ver installer/Pitwall.iss)
            if (restart) psi.ArgumentList.Add("/RESTARTAPPLICATIONS");
            psi.ArgumentList.Add("/LOG=" + Path.Combine(UpdateFolder.Dir, "install.log"));
            using var p = Process.Start(psi);
            UpdateLog.Write($"instalador iniciado (pid {p?.Id}, reabrir={restart})");
            return p != null;
        }
        catch (Exception ex)
        {
            lock (_gate) _launched = false;
            UpdateLog.Write("falha ao iniciar o instalador: " + ex.Message);
            Set(s => s with { Status = "error", Error = L.T("Não foi possível iniciar o instalador.", "Could not start the installer.") });
            return false;
        }
    }

    public void Skip()
    {
        var ver = State.Version;
        if (ver == null) return;
        _config.Update(c => (c.Update ??= new UpdateConfig()).SkippedVersion = ver);
        ReleaseLock();
        UpdateFolder.DeleteInstallers();
        lock (_gate) { _release = null; _installNow = false; _installOnExit = false; }
        Set(s => s with { Status = "idle", Version = null, NotesUrl = null, Notes = null, Progress = null, InstallOnExit = false, WaitingForGame = false });
        UpdateLog.Write($"{ver} pulada");
    }

    public void SetChannel(string? channel)
    {
        var ch = channel == "beta" ? "beta" : "stable";
        _config.Update(c => (c.Update ??= new UpdateConfig()).Channel = ch);
        if (State.Status is "idle" or "available" or "error") _ = CheckAsync(manual: false);
    }

    /// <summary>Mensagens WebSocket do atualizador. true = tratada (resposta opcional em <paramref name="reply"/>).</summary>
    public bool TryHandle(JsonNode node, out string? reply)
    {
        reply = null;
        switch (node["type"]?.GetValue<string>())
        {
            case "checkUpdate":
                _ = CheckAsync(manual: true);
                return true;
            case "installUpdate":
                // { when: "now" | "exit" }
                RequestInstall(node["when"]?.GetValue<string>() != "exit");
                return true;
            case "skipUpdate":
                Skip();
                return true;
            case "setUpdateChannel":
                SetChannel(node["channel"]?.GetValue<string>());
                return true;
            case "getUpdate":
                reply = StateMessage();
                return true;
        }
        return false;
    }

    void ReleaseLock()
    {
        lock (_gate)
        {
            _installerLock?.Dispose();
            _installerLock = null;
            _installerPath = null;
        }
    }

    void Set(Func<UpdateState, UpdateState> change)
    {
        UpdateState s;
        lock (_gate) s = _state = change(_state);
        Changed?.Invoke(s);
    }

    public void Dispose()
    {
        _cts.Cancel();
        _timer?.Dispose();
        _client.Dispose();
        // O handle do instalador fica aberto até aqui de propósito; ao sair, o instalador (se iniciado) já carregou a imagem.
        ReleaseLock();
    }
}
