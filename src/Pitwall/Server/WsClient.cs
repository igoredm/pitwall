using System.Net.WebSockets;
using System.Text;

namespace Pitwall.Server;

/// <summary>Um cliente WebSocket com envio serializado (usado pelo socket local e pelo da rede).</summary>
internal sealed class WsClient(WebSocket ws)
{
    readonly SemaphoreSlim _send = new(1, 1);

    public WebSocket Socket => ws;

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
