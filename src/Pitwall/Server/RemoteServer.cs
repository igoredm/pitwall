using System.Collections.Concurrent;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Pitwall.Config;

namespace Pitwall.Server;

/// <summary>
/// Visualização no celular pela rede local (desligada por padrão). É um SEGUNDO HttpListener, separado do socket
/// de controle (que continua só em localhost): serve os arquivos estáticos do wwwroot e um WebSocket /ws
/// SOMENTE LEITURA — manda snapshot, catálogo e config sanitizados e ignora qualquer mensagem do cliente
/// além de ping. Para receber dados o celular precisa de um token de dispositivo (pareamento por código).
/// </summary>
public sealed class RemoteServer : IDisposable
{
    const int MaxConnections = 8;
    const int MaxMessageBytes = 4 * 1024;
    static readonly TimeSpan AuthTimeout = TimeSpan.FromSeconds(10);

    readonly Func<IReadOnlyList<PairedDevice>> _devices;
    readonly PairingManager _pairing;
    readonly AttemptLimiter _limiter = new();
    readonly ConcurrentDictionary<Guid, (WsClient Client, string DeviceId)> _clients = new();
    readonly string _root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "wwwroot"));
    readonly Lock _gate = new();
    HttpListener? _listener;
    CancellationTokenSource? _cts;
    int _connections;

    /// <summary>Mensagens enviadas a um celular recém-autenticado (catálogo e config sanitizados).</summary>
    public Func<IEnumerable<string>>? OnAuthenticated { get; set; }
    /// <summary>Celular novo pareado (o hub grava no config).</summary>
    public event Action<PairedDevice>? Paired;

    public int Port { get; private set; }
    public bool Running => _listener != null;
    public string? LastError { get; private set; }
    public bool HasClients => !_clients.IsEmpty;

    public RemoteServer(Func<IReadOnlyList<PairedDevice>> devices, PairingManager pairing)
    {
        _devices = devices;
        _pairing = pairing;
    }

    /// <summary>Escuta em todas as interfaces (o app é elevado, então http://+:porta/ não precisa de urlacl).</summary>
    public bool Start(int port)
    {
        lock (_gate)
        {
            StopCore();
            var listener = new HttpListener();
            listener.Prefixes.Add($"http://+:{port}/");
            try
            {
                listener.Start();
            }
            catch (Exception ex)
            {
                LastError = ex.Message;
                try { listener.Close(); } catch { }
                return false;
            }
            LastError = null;
            Port = port;
            _listener = listener;
            _cts = new CancellationTokenSource();
            _ = AcceptLoop(listener, _cts.Token);
            return true;
        }
    }

    public void Stop()
    {
        lock (_gate) StopCore();
    }

    void StopCore()
    {
        _cts?.Cancel();
        try { _listener?.Stop(); _listener?.Close(); } catch { }
        _listener = null;
        foreach (var (id, c) in _clients)
        {
            _clients.TryRemove(id, out _);
            try { c.Client.Socket.Abort(); } catch { }
        }
    }

    async Task AcceptLoop(HttpListener listener, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try { ctx = await listener.GetContextAsync(); }
            catch { break; }
            _ = Handle(ctx, ct);
        }
    }

    async Task Handle(HttpListenerContext ctx, CancellationToken ct)
    {
        var req = ctx.Request;
        var res = ctx.Response;
        var ip = req.RemoteEndPoint?.Address.ToString() ?? "?";
        try
        {
            if (_limiter.IsBlocked(ip, DateTime.UtcNow)) { Close(res, 429); return; }
            // Defesa contra DNS rebinding: só aceita o IP (como no QR) ou o nome deste PC no Host
            if (!HostAllowed(req.Url?.Host)) { Close(res, 421); return; }

            if (req.Url?.AbsolutePath == "/ws")
            {
                if (!req.IsWebSocketRequest || !SameOrigin(req)) { Close(res, 403); return; }
                if (Interlocked.Increment(ref _connections) > MaxConnections)
                {
                    Interlocked.Decrement(ref _connections);
                    Close(res, 503);
                    return;
                }
                try { await HandleSocket(ctx, ip, ct); }
                finally { Interlocked.Decrement(ref _connections); }
                return;
            }
            if (req.HttpMethod is not ("GET" or "HEAD")) { Close(res, 405); return; }
            await ServeStatic(req, res);
        }
        catch
        {
            try { res.Abort(); } catch { }
        }
    }

    static void Close(HttpListenerResponse res, int status)
    {
        res.StatusCode = status;
        res.Close();
    }

    internal static bool HostAllowed(string? host)
    {
        if (string.IsNullOrEmpty(host)) return false;
        if (IPAddress.TryParse(host.Trim('[', ']'), out _)) return true;
        var name = Environment.MachineName;
        return host.Equals(name, StringComparison.OrdinalIgnoreCase)
            || host.Equals(name + ".local", StringComparison.OrdinalIgnoreCase)
            || host.Equals(name + ".lan", StringComparison.OrdinalIgnoreCase)
            || host.Equals(name + ".home", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>WebSocket só da própria página (Origin = http://Host): outra página aberta no celular não conecta.</summary>
    static bool SameOrigin(HttpListenerRequest req)
    {
        var origin = req.Headers["Origin"];
        var host = req.Headers["Host"];
        return origin != null && host != null && origin.Equals("http://" + host, StringComparison.OrdinalIgnoreCase);
    }

    async Task HandleSocket(HttpListenerContext ctx, string ip, CancellationToken ct)
    {
        WebSocket ws;
        try { ws = (await ctx.AcceptWebSocketAsync(null)).WebSocket; }
        catch { return; }
        var client = new WsClient(ws);
        var id = Guid.NewGuid();
        try
        {
            // 1) Primeira mensagem: auth (token) ou pair (código), em até 10 s
            string? first;
            using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct))
            {
                timeout.CancelAfter(AuthTimeout);
                first = await Receive(ws, timeout.Token);
            }
            var device = first == null ? null : await Authenticate(first, client, ip);
            if (device == null)
            {
                await CloseSocket(ws, WebSocketCloseStatus.PolicyViolation, "unauthorized");
                return;
            }

            // 2) Autenticado: recebe o fluxo; do cliente só aceita ping
            _clients[id] = (client, device.Id);
            if (OnAuthenticated != null)
                foreach (var msg in OnAuthenticated()) await client.SendAsync(msg);
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var raw = await Receive(ws, ct);
                if (raw == null) break;
                if (TypeOf(raw) == "ping")
                    await client.SendAsync(JsonSerializer.Serialize(new { type = "pong", t = DateTimeOffset.Now.ToUnixTimeMilliseconds() }));
                // qualquer outra mensagem é ignorada (este socket é somente leitura)
            }
        }
        catch { }
        finally
        {
            _clients.TryRemove(id, out _);
            try { ws.Dispose(); } catch { }
        }
    }

    async Task<PairedDevice?> Authenticate(string raw, WsClient client, string ip)
    {
        var now = DateTime.UtcNow;
        JsonNode? node;
        try { node = JsonNode.Parse(raw); }
        catch { node = null; }
        var type = Str(node, "type");
        if (type == "auth")
        {
            var device = PairingManager.Validate(Str(node, "token"), _devices());
            if (device == null)
            {
                _limiter.Fail(ip, now);
                await client.SendAsync(JsonSerializer.Serialize(new { type = "auth", ok = false, error = "invalidToken" }));
                return null;
            }
            await client.SendAsync(JsonSerializer.Serialize(new { type = "auth", ok = true, deviceId = device.Id, name = device.Name }));
            return device;
        }
        if (type == "pair")
        {
            var err = _pairing.Redeem(Str(node, "code"), Str(node, "name"), now, out var device, out var token);
            if (err != PairError.None || device == null)
            {
                _limiter.Fail(ip, now);
                await client.SendAsync(JsonSerializer.Serialize(new
                {
                    type = "paired",
                    ok = false,
                    error = err switch { PairError.Expired => "expired", PairError.NoPending => "noPending", _ => "invalidCode" },
                }));
                return null;
            }
            _limiter.Succeed(ip);
            Paired?.Invoke(device);
            await client.SendAsync(JsonSerializer.Serialize(new { type = "paired", ok = true, deviceId = device.Id, name = device.Name, token }));
            return device;
        }
        _limiter.Fail(ip, now);
        return null;
    }

    static string? Str(JsonNode? node, string key)
    {
        try { return node?[key]?.GetValue<string>(); }
        catch { return null; }
    }

    static string? TypeOf(string raw)
    {
        try { return Str(JsonNode.Parse(raw), "type"); }
        catch { return null; }
    }

    /// <summary>Uma mensagem de texto inteira (até 4 KB); null = fechou, erro ou grande demais.</summary>
    static async Task<string?> Receive(WebSocket ws, CancellationToken ct)
    {
        var buffer = new byte[MaxMessageBytes];
        var used = 0;
        while (true)
        {
            if (used >= buffer.Length) return null;
            var result = await ws.ReceiveAsync(new ArraySegment<byte>(buffer, used, buffer.Length - used), ct);
            if (result.MessageType == WebSocketMessageType.Close) return null;
            used += result.Count;
            if (result.EndOfMessage) break;
        }
        return Encoding.UTF8.GetString(buffer, 0, used);
    }

    static async Task CloseSocket(WebSocket ws, WebSocketCloseStatus status, string reason)
    {
        try
        {
            using var cts = new CancellationTokenSource(2_000);
            await ws.CloseAsync(status, reason, cts.Token);
        }
        catch { }
    }

    public void Broadcast(string json)
    {
        if (_clients.IsEmpty) return;
        var bytes = Encoding.UTF8.GetBytes(json);
        foreach (var (id, c) in _clients)
            if (!c.Client.TrySend(bytes)) _clients.TryRemove(id, out _);
    }

    /// <summary>Derruba as conexões de um dispositivo revogado.</summary>
    public void Disconnect(string deviceId)
    {
        foreach (var (id, c) in _clients)
        {
            if (c.DeviceId != deviceId) continue;
            _clients.TryRemove(id, out _);
            _ = CloseSocket(c.Client.Socket, WebSocketCloseStatus.PolicyViolation, "revoked");
        }
    }

    static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".webmanifest"] = "application/manifest+json",
        [".ico"] = "image/x-icon",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".svg"] = "image/svg+xml",
        [".webp"] = "image/webp",
        [".woff"] = "font/woff",
        [".woff2"] = "font/woff2",
        [".ttf"] = "font/ttf",
        [".txt"] = "text/plain; charset=utf-8",
    };

    async Task ServeStatic(HttpListenerRequest req, HttpListenerResponse res)
    {
        var full = ResolveStatic(_root, req.Url?.AbsolutePath);
        if (full == null || !File.Exists(full) || !ContentTypes.TryGetValue(Path.GetExtension(full), out var type))
        {
            Close(res, 404);
            return;
        }
        res.ContentType = type;
        res.Headers["X-Content-Type-Options"] = "nosniff";
        res.Headers["X-Frame-Options"] = "DENY";
        res.Headers["Referrer-Policy"] = "no-referrer";
        res.Headers["Content-Security-Policy"] = "frame-ancestors 'none'";
        res.Headers["Cache-Control"] = "no-cache";
        await using var fs = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read, 16 * 1024, useAsync: true);
        res.ContentLength64 = fs.Length;
        if (req.HttpMethod == "GET") await fs.CopyToAsync(res.OutputStream);
        res.Close();
    }

    /// <summary>Caminho da URL → arquivo dentro do wwwroot; null se tentar sair da pasta ou for estranho.</summary>
    internal static string? ResolveStatic(string root, string? urlPath)
    {
        if (string.IsNullOrEmpty(urlPath)) return null;
        string path;
        try { path = Uri.UnescapeDataString(urlPath); }
        catch { return null; }
        if (path == "/") path = "/index.html";
        if (path.Contains("..") || path.Contains('\\') || path.Contains(':') || path.Contains('\0') || path.Contains("/.")) return null;
        var rootFull = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(Path.Combine(rootFull, path.TrimStart('/')));
        return full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase) ? full : null;
    }

    /// <summary>IPv4 da rede local para o QR: adaptadores com gateway primeiro, virtuais (Hyper-V, VPN...) por último.</summary>
    public static List<string> LanAddresses()
    {
        var found = new List<(string Ip, int Rank)>();
        try
        {
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (nic.OperationalStatus != OperationalStatus.Up) continue;
                if (nic.NetworkInterfaceType is NetworkInterfaceType.Loopback or NetworkInterfaceType.Tunnel) continue;
                var props = nic.GetIPProperties();
                var gateway = props.GatewayAddresses.Any(g => g.Address.AddressFamily == AddressFamily.InterNetwork && !g.Address.Equals(IPAddress.Any));
                var desc = nic.Description + " " + nic.Name;
                var isVirtual = new[] { "Virtual", "Hyper-V", "VMware", "VirtualBox", "WSL", "vEthernet", "VPN", "TAP", "Tailscale", "ZeroTier" }
                    .Any(v => desc.Contains(v, StringComparison.OrdinalIgnoreCase));
                foreach (var a in props.UnicastAddresses)
                {
                    if (a.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    var b = a.Address.GetAddressBytes();
                    if (b[0] == 169 && b[1] == 254) continue; // link-local
                    found.Add((a.Address.ToString(), (gateway ? 0 : 2) + (isVirtual ? 1 : 0)));
                }
            }
        }
        catch { }
        return found.OrderBy(f => f.Rank).Select(f => f.Ip).Distinct().ToList();
    }

    public void Dispose() => Stop();
}
