using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Pitwall.Config;
using Pitwall.Localization;

namespace Pitwall.Server;

public enum PairError { None, Invalid, Expired, NoPending }

/// <summary>
/// Pareamento do celular/TV: a tela de configurações pede um código de 6 dígitos de uso único (2 min), mostrado grande
/// ao lado do QR para poder ser digitado; o aparelho troca o código por um token longo e aleatório, que fica no
/// localStorage dele. Aqui só fica o SHA-256 do token.
/// Força bruta: 10^6 códigos, no máximo <see cref="MaxFailuresPerCode"/> erros por código (somando todos os IPs) e
/// 5 erros/min por IP (<see cref="AttemptLimiter"/>) → no máximo 20 chutes em 1 milhão por código.
/// </summary>
public sealed class PairingManager
{
    public static readonly TimeSpan CodeTtl = TimeSpan.FromMinutes(2);
    public const int CodeLength = 6;
    /// <summary>Erros com o mesmo código (de qualquer IP) antes de ele ser invalidado (além do limite por IP).</summary>
    public const int MaxFailuresPerCode = 20;
    const string Alphabet = "0123456789";

    readonly Lock _gate = new();
    string? _code;
    DateTime _expiresUtc;
    int _failures;

    /// <summary>Código novo (CSPRNG). Invalida o anterior.</summary>
    public (string Code, DateTime ExpiresUtc) Start(DateTime nowUtc)
    {
        lock (_gate)
        {
            _code = RandomNumberGenerator.GetString(Alphabet, CodeLength);
            _expiresUtc = nowUtc + CodeTtl;
            _failures = 0;
            return (_code, _expiresUtc);
        }
    }

    public void Cancel()
    {
        lock (_gate) _code = null;
    }

    /// <summary>
    /// Troca o código por um dispositivo novo. O código vale uma vez só.
    /// <paramref name="userAgent"/> só define o tipo (ícone): phone | tv | desktop | unknown.
    /// </summary>
    public PairError Redeem(string? code, string? deviceName, DateTime nowUtc, out PairedDevice? device, out string? token,
        string? userAgent = null)
    {
        device = null;
        token = null;
        lock (_gate)
        {
            if (_code == null) return PairError.NoPending;
            if (nowUtc > _expiresUtc)
            {
                _code = null;
                return PairError.Expired;
            }
            var given = NormalizeCode(code);
            if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(given), Encoding.ASCII.GetBytes(_code)))
            {
                // Teto global por código: muitos IPs juntos também não conseguem varrer o espaço
                if (++_failures >= MaxFailuresPerCode) _code = null;
                return PairError.Invalid;
            }
            _code = null;
        }
        token = NewToken();
        device = new PairedDevice
        {
            Id = Convert.ToHexString(RandomNumberGenerator.GetBytes(8)).ToLowerInvariant(),
            Name = CleanName(deviceName),
            TokenHash = Hash(token),
            Created = DateTime.Now,
            LastSeen = DateTime.Now,
            Kind = DeviceKind.FromUserAgent(userAgent),
        };
        return PairError.None;
    }

    /// <summary>Código digitado → sem espaços e hífens ("123 456" e "123-456" valem). Texto longo demais = vazio (inválido).</summary>
    internal static string NormalizeCode(string? code)
    {
        if (string.IsNullOrEmpty(code) || code.Length > 32) return "";
        return new string(code.Where(c => c is not (' ' or '-' or ' ')).ToArray()).ToUpperInvariant();
    }

    /// <summary>Token do dispositivo: 256 bits, base64url (43 caracteres).</summary>
    public static string NewToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static string Hash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    /// <summary>Dispositivo dono do token, ou null. Compara os hashes em tempo constante.</summary>
    public static PairedDevice? Validate(string? token, IEnumerable<PairedDevice> devices)
    {
        if (string.IsNullOrEmpty(token) || token.Length is < 32 or > 128) return null;
        var hash = Encoding.ASCII.GetBytes(Hash(token));
        PairedDevice? found = null;
        foreach (var d in devices)
            if (CryptographicOperations.FixedTimeEquals(hash, Encoding.ASCII.GetBytes(d.TokenHash ?? ""))) found = d;
        return found;
    }

    public const int MaxNameLength = 40;

    /// <summary>
    /// Nome exibido na lista de dispositivos (vem do cliente): só caracteres imprimíveis — sem controle, formatação
    /// invisível (ex.: U+202E, que inverte o texto), surrogates soltos ou uso privado —, espaços em sequência viram um,
    /// até 40 caracteres sem partir um emoji no meio.
    /// </summary>
    public static string CleanName(string? name)
    {
        var sb = new StringBuilder(MaxNameLength);
        var space = false;
        foreach (var r in (name ?? "").EnumerateRunes())
        {
            var cat = Rune.GetUnicodeCategory(r);
            if (Rune.IsWhiteSpace(r))
            {
                space = sb.Length > 0;
                continue;
            }
            // EnumerateRunes troca surrogate solto por U+FFFD: descarta também
            if (r == Rune.ReplacementChar || cat is UnicodeCategory.Control or UnicodeCategory.Format or UnicodeCategory.Surrogate
                    or UnicodeCategory.PrivateUse or UnicodeCategory.OtherNotAssigned)
                continue;
            var needed = r.Utf16SequenceLength + (space ? 1 : 0);
            if (sb.Length + needed > MaxNameLength) break;
            if (space) sb.Append(' ');
            space = false;
            sb.Append(r.ToString());
        }
        return sb.Length == 0 ? L.T("Celular", "Phone") : sb.ToString();
    }
}

/// <summary>
/// Limite de tentativas erradas por chave (IP): mais de <see cref="MaxFailures"/> erros em 1 min bloqueia por 5 min.
/// </summary>
public sealed class AttemptLimiter
{
    public const int MaxFailures = 5;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    public static readonly TimeSpan Lockout = TimeSpan.FromMinutes(5);

    readonly Lock _gate = new();
    readonly Dictionary<string, (List<DateTime> Failures, DateTime BlockedUntil)> _state = [];

    public bool IsBlocked(string key, DateTime nowUtc)
    {
        lock (_gate) return _state.TryGetValue(key, out var s) && s.BlockedUntil > nowUtc;
    }

    public void Fail(string key, DateTime nowUtc)
    {
        lock (_gate)
        {
            if (!_state.TryGetValue(key, out var s)) s = ([], DateTime.MinValue);
            s.Failures.RemoveAll(t => nowUtc - t > Window);
            s.Failures.Add(nowUtc);
            if (s.Failures.Count >= MaxFailures)
            {
                s.BlockedUntil = nowUtc + Lockout;
                s.Failures.Clear();
            }
            _state[key] = s;
            // Não deixa crescer sem limite (muitos IPs diferentes)
            if (_state.Count > 1024)
                foreach (var k in _state.Where(kv => kv.Value.BlockedUntil < nowUtc && kv.Value.Failures.Count == 0).Select(kv => kv.Key).ToList())
                    _state.Remove(k);
        }
    }

    /// <summary>Quantos erros ainda cabem antes de bloquear esta chave (0 = bloqueada agora).</summary>
    public int AttemptsLeft(string key, DateTime nowUtc)
    {
        lock (_gate)
        {
            if (!_state.TryGetValue(key, out var s)) return MaxFailures;
            if (s.BlockedUntil > nowUtc) return 0;
            return Math.Max(0, MaxFailures - s.Failures.Count(t => nowUtc - t <= Window));
        }
    }

    /// <summary>Segundos até desbloquear (arredondado para cima); null = não está bloqueada.</summary>
    public int? RetryAfterSec(string key, DateTime nowUtc)
    {
        lock (_gate)
        {
            if (!_state.TryGetValue(key, out var s) || s.BlockedUntil <= nowUtc) return null;
            return (int)Math.Ceiling((s.BlockedUntil - nowUtc).TotalSeconds);
        }
    }

    public void Succeed(string key)
    {
        lock (_gate) _state.Remove(key);
    }
}
