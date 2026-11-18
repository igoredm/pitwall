using System.Collections.Concurrent;
using System.Net;
using System.Net.WebSockets;
using System.Text;

namespace Pitwall.Server;

/// <summary>
/// WebSocket em localhost (HttpListener/http.sys, sem ASP.NET para manter o processo leve).
/// Só aceita a origem do próprio app (WebView2) e o dev server do Angular.
/// </summary>
public sealed class WsServer : IDisposable
{
    static readonly string[] AllowedOrigins = ["https://pitwall.local", "http://localhost:4200"];

    readonly HttpListener _listener = new();
    readonly ConcurrentDictionary<Guid, Client> _clients = new();
    readonly CancellationTokenSource _cts = new();

    public int Port { get; }

    /// <summary>Mensagem recebida de um cliente (JSON bruto). Retorno opcional é enviado só para ele.</summary>
    public Func<string, string?>? OnMessage { get; set; }
    /// <summary>Mensagens enviadas a cada cliente recém-conectado (catálogo, config).</summary>
    public Func<IEnumerable<string>>? OnConnect { get; set; }

    public WsServer(int port)
    {
        Port = port;
        _listener.Prefixes.Add($"http://localhost:{port}/");
        _listener.Prefixes.Add($"http://127.0.0.1:{port}/");
    }

    public void Start()
    {
        _listener.Start();
        _ = AcceptLoop();
    }

    async Task AcceptLoop()
    {
        while (!_cts.IsCancellationRequested)
        {
            HttpListenerContext ctx;
            try { ctx = await _listener.GetContextAsync(); }
            catch { break; }

            var origin = ctx.Request.Headers["Origin"];
            if (!ctx.Request.IsWebSocketRequest || ctx.Request.Url?.AbsolutePath != "/ws" ||
                (origin != null && !AllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase)))
            {
                ctx.Response.StatusCode = 403;
                ctx.Response.Close();
                continue;
            }
            _ = Handle(ctx);
        }
    }

    async Task Handle(HttpListenerContext ctx)
    {
        WebSocket ws;
        try { ws = (await ctx.AcceptWebSocketAsync(null)).WebSocket; }
        catch { return; }

        var client = new Client(ws);
        var id = Guid.NewGuid();
        _clients[id] = client;
        try
        {
            if (OnConnect != null)
                foreach (var msg in OnConnect()) await client.SendAsync(msg);

            var buffer = new byte[64 * 1024];
            var sb = new StringBuilder();
            while (ws.State == WebSocketState.Open && !_cts.IsCancellationRequested)
            {
                var result = await ws.ReceiveAsync(buffer, _cts.Token);
                if (result.MessageType == WebSocketMessageType.Close) break;
                sb.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                if (!result.EndOfMessage) continue;
                var reply = OnMessage?.Invoke(sb.ToString());
                sb.Clear();
                if (reply != null) await client.SendAsync(reply);
            }
        }
        catch { }
        finally
        {
            _clients.TryRemove(id, out _);
            try { ws.Dispose(); } catch { }
        }
    }

    public void Broadcast(string json)
    {
        if (_clients.IsEmpty) return;
        var bytes = Encoding.UTF8.GetBytes(json);
        foreach (var (id, c) in _clients)
            if (!c.TrySend(bytes)) _clients.TryRemove(id, out _);
    }

    public void Dispose()
    {
        _cts.Cancel();
        try { _listener.Stop(); _listener.Close(); } catch { }
    }

    sealed class Client(WebSocket ws)
    {
        readonly SemaphoreSlim _send = new(1, 1);

        public Task SendAsync(string json) => SendAsync(Encoding.UTF8.GetBytes(json));

        async Task SendAsync(byte[] bytes)
        {
            await _send.WaitAsync();
            try { await ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None); }
            finally { _send.Release(); }
        }

        /// <summary>Envio sem bloquear o loop de telemetria; se o cliente estiver atrasado, descarta o frame.</summary>
        public bool TrySend(byte[] bytes)
        {
            if (ws.State != WebSocketState.Open) return false;
            if (!_send.Wait(0)) return true;
            _ = ws.SendAsync(bytes, WebSocketMessageType.Text, true, CancellationToken.None)
                .ContinueWith(_ => _send.Release());
            return true;
        }
    }
}
