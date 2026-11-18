using System.Text.Json;
using System.Text.Json.Serialization;
using Pitwall.Metrics;

namespace Pitwall.Config;

public sealed class ConfigStore
{
    public static readonly string Dir = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "Pitwall");

    static readonly string FilePath = Path.Combine(Dir, "config.json");

    public static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    readonly Lock _gate = new();
    AppConfig _current;

    public event Action<AppConfig>? Changed;

    public ConfigStore()
    {
        _current = Load();
    }

    public AppConfig Current { get { lock (_gate) return _current; } }

    public void Update(Action<AppConfig> mutate)
    {
        AppConfig snapshot;
        lock (_gate)
        {
            mutate(_current);
            snapshot = _current;
            Save(snapshot);
        }
        Changed?.Invoke(snapshot);
    }

    public void Replace(AppConfig config)
    {
        MetricCatalog.Normalize(config);
        lock (_gate)
        {
            _current = config;
            Save(config);
        }
        Changed?.Invoke(config);
    }

    public void RestoreDefaults()
    {
        var fresh = new AppConfig();
        // Mantém a posição do widget: restaurar padrão não deve jogar a janela para outro monitor.
        fresh.Widget = Current.Widget;
        Replace(fresh);
    }

    static AppConfig Load()
    {
        AppConfig config;
        try
        {
            config = File.Exists(FilePath)
                ? JsonSerializer.Deserialize<AppConfig>(File.ReadAllText(FilePath), Json) ?? new AppConfig()
                : new AppConfig();
        }
        catch
        {
            config = new AppConfig();
        }
        if (config.Version < 2)
        {
            // v0.1.0 salvava o azul do Lumen como cor fixa; agora vazio = "padrão do tema".
            if (config.Accent.Equals("#4C8DFF", StringComparison.OrdinalIgnoreCase)) config.Accent = "";
            config.Version = 2;
        }
        if (config.Version < 3)
        {
            // v0.3: "compacto" antigo virou "médio"; a RAM mostra GB usados/total por padrão
            if (config.Widget.Layout == "compact") config.Widget.Layout = "mid";
            var used = config.Metrics.FirstOrDefault(m => m.Id == "ram.used");
            if (used != null) used.Enabled = true;
            config.Version = 3;
        }
        MetricCatalog.Normalize(config);
        return config;
    }

    static void Save(AppConfig config)
    {
        Directory.CreateDirectory(Dir);
        var tmp = FilePath + ".tmp";
        File.WriteAllText(tmp, JsonSerializer.Serialize(config, Json));
        File.Move(tmp, FilePath, overwrite: true);
    }
}
