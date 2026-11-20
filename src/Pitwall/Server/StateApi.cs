using System.Security.Cryptography;
using System.Text.Json.Nodes;
using Pitwall.Config;

namespace Pitwall.Server;

public enum ApiDecision { Ok, NotFound, MethodNotAllowed, Blocked, Unauthorized }

/// <summary>Uma leitura no /api/v1/state. Valor numérico (arredondado) ou texto (métricas "text", ex.: gpu.perfcap).</summary>
public sealed record StateValue(string Id, string Name, double? Number, string? Text, string Unit);

/// <summary>
/// GET /api/v1/state (Home Assistant e afins), no servidor da rede (<see cref="RemoteServer"/>). Somente leitura, desligado
/// por padrão (remote.enabled &amp;&amp; remote.apiEnabled), com token de integração (Authorization: Bearer).
/// Separação de tokens: token de integração não abre o WebSocket da visualização, e token de celular/TV não vale na API.
/// Assim cada um é revogado sem afetar o outro e um token vazado do Home Assistant (que fica num arquivo de configuração)
/// não abre a tela do PC, e o token do navegador do celular não vira acesso de máquina.
/// </summary>
public static class StateApi
{
    public const string Path = "/api/v1/state";
    public const int MaxTokens = 10;

    /// <summary>"Bearer &lt;token&gt;" (esquema sem diferenciar maiúsculas) → token; qualquer outra coisa → null.</summary>
    public static string? BearerToken(string? authorization)
    {
        if (string.IsNullOrWhiteSpace(authorization) || authorization.Length > 256) return null;
        var parts = authorization.Trim().Split(' ', 2, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (parts.Length != 2 || !parts[0].Equals("Bearer", StringComparison.OrdinalIgnoreCase)) return null;
        return parts[1];
    }

    /// <summary>Só tokens de integração valem na API.</summary>
    public static IEnumerable<PairedDevice> ApiDevices(IEnumerable<PairedDevice> devices) =>
        devices.Where(d => d.Kind == DeviceKind.Integration);

    /// <summary>Só celulares/TVs/PCs pareados abrem a visualização (WebSocket); integração não.</summary>
    public static IEnumerable<PairedDevice> ViewerDevices(IEnumerable<PairedDevice> devices) =>
        devices.Where(d => d.Kind != DeviceKind.Integration);

    /// <summary>
    /// Decisão de acesso (pura). Desligado = 404 (como se não existisse); só GET; IP bloqueado pelo limite de tentativas = 429;
    /// token ausente, malformado ou de outro tipo de aparelho = 401 (e o chamador conta um erro para o IP).
    /// </summary>
    public static (ApiDecision Decision, PairedDevice? Device) Authorize(bool enabled, string? method, string? authorization,
        bool ipBlocked, IEnumerable<PairedDevice> devices)
    {
        if (!enabled) return (ApiDecision.NotFound, null);
        if (method != "GET") return (ApiDecision.MethodNotAllowed, null);
        if (ipBlocked) return (ApiDecision.Blocked, null);
        var device = PairingManager.Validate(BearerToken(authorization), ApiDevices(devices));
        return device == null ? (ApiDecision.Unauthorized, null) : (ApiDecision.Ok, device);
    }

    public static int StatusCode(ApiDecision d) => d switch
    {
        ApiDecision.Ok => 200,
        ApiDecision.NotFound => 404,
        ApiDecision.MethodNotAllowed => 405,
        ApiDecision.Blocked => 429,
        _ => 401,
    };

    /// <summary>Token novo (256 bits) e o aparelho "integration" que guarda só o hash dele.</summary>
    public static (string Token, PairedDevice Device) NewToken(string? name, DateTime now)
    {
        var token = PairingManager.NewToken();
        var device = new PairedDevice
        {
            Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant(),
            Name = string.IsNullOrWhiteSpace(name) ? "Home Assistant" : PairingManager.CleanName(name),
            TokenHash = PairingManager.Hash(token),
            Created = now,
            LastSeen = null,
            Kind = DeviceKind.Integration,
        };
        return (token, device);
    }

    /// <summary>{ version, time, game: { exe } | null, values: { id: { name, value, unit } } }.</summary>
    public static JsonObject Build(string? version, DateTimeOffset time, string? gameExe, IEnumerable<StateValue> values)
    {
        var obj = new JsonObject();
        foreach (var v in values)
        {
            JsonNode? value = v.Text != null ? JsonValue.Create(v.Text)
                : v.Number is { } n && double.IsFinite(n) ? JsonValue.Create(Math.Round(n, 2)) : null;
            obj[v.Id] = new JsonObject { ["name"] = v.Name, ["value"] = value, ["unit"] = v.Unit };
        }
        return new JsonObject
        {
            ["version"] = version,
            ["time"] = time.ToString("yyyy-MM-ddTHH:mm:sszzz"),
            ["game"] = gameExe == null ? null : new JsonObject { ["exe"] = gameExe },
            ["values"] = obj,
        };
    }
}
