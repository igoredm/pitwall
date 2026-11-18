using System.Security.Cryptography;
using System.Text;
using Pitwall.Config;
using Pitwall.Localization;

namespace Pitwall.Server;

public enum PairError { None, Invalid, Expired, NoPending }

/// <summary>
/// Pareamento do celular: a tela de configurações pede um código de uso único (2 min); o celular troca o código
/// por um token longo e aleatório, que fica no localStorage dele. Aqui só fica o SHA-256 do token.
/// </summary>
public sealed class PairingManager
{
    public static readonly TimeSpan CodeTtl = TimeSpan.FromMinutes(2);
    public const int CodeLength = 8;
    /// <summary>Erros com o mesmo código antes de ele ser invalidado (além do limite por IP).</summary>
    public const int MaxFailuresPerCode = 5;
    // Sem caracteres ambíguos (0/O, 1/I/L, U)
    const string Alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";

    readonly Lock _gate = new();
    string? _code;
    DateTime _expiresUtc;
    int _failures;

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

    /// <summary>Troca o código por um dispositivo novo. O código vale uma vez só.</summary>
    public PairError Redeem(string? code, string? deviceName, DateTime nowUtc, out PairedDevice? device, out string? token)
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
            var given = (code ?? "").Trim().ToUpperInvariant();
            if (!CryptographicOperations.FixedTimeEquals(Encoding.ASCII.GetBytes(given), Encoding.ASCII.GetBytes(_code)))
            {
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
        };
        return PairError.None;
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

    /// <summary>Nome exibido na lista de dispositivos: sem caracteres de controle, até 40 caracteres.</summary>
    public static string CleanName(string? name)
    {
        var clean = new string((name ?? "").Where(c => !char.IsControl(c)).ToArray()).Trim();
        if (clean.Length > 40) clean = clean[..40];
        return clean.Length == 0 ? L.T("Celular", "Phone") : clean;
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

    public void Succeed(string key)
    {
        lock (_gate) _state.Remove(key);
    }
}
