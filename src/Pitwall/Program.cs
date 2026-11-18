using Pitwall.Localization;
using Pitwall.Config;
using Pitwall.Fps;
using Pitwall.Sensors;
using Pitwall.Ui;

namespace Pitwall;

static class Program
{
    [STAThread]
    static int Main(string[] args)
    {
        // Diagnóstico: Pitwall.exe --dump-sensors [arquivo]
        if (args.Length > 0 && args[0] == "--dump-sensors")
        {
            var cfg = new ConfigStore().Current;
            using var sensors = new SensorService(cfg.PrimaryGpu);
            var path = args.Length > 1 ? args[1] : Path.Combine(ConfigStore.Dir, "sensores.txt");
            Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(path))!);
            File.WriteAllText(path, sensors.Dump());
            return 0;
        }

        // Diagnóstico do ajuste de GPU: Pitwall.exe --gpu-tuning-test [arquivo] — aplica "equilibrado" por 3 s e desfaz.
        if (args.Length > 0 && args[0] == "--gpu-tuning-test")
        {
            var cfg = new ConfigStore().Current;
            using var sensors = new SensorService(cfg.PrimaryGpu);
            var log = new System.Text.StringBuilder();
            using (var testTuner = new Pitwall.Gpu.GpuTuner(sensors.GpuName))
            {
                log.AppendLine($"caps: {testTuner.Caps}");
                Pitwall.Gpu.Nvml.GetPowerLimit(GetDev(), out var before);
                testTuner.Update(new GpuTuningConfig { Enabled = true, Preset = "balanced", OnlyInGames = false }, false);
                log.AppendLine($"aplicado: {testTuner.Status}");
                Thread.Sleep(1500);
                sensors.Read(new Dictionary<string, double?>());
                var v = new Dictionary<string, double?>();
                sensors.Read(v);
                Pitwall.Gpu.Nvml.GetPowerLimit(GetDev(), out var during);
                log.AppendLine($"limite antes {before / 1000} W, durante {during / 1000} W; clock agora {v.GetValueOrDefault("gpu.clock")} MHz");
                testTuner.Update(new GpuTuningConfig { Enabled = false }, false);
                Pitwall.Gpu.Nvml.GetPowerLimit(GetDev(), out var after);
                log.AppendLine($"restaurado: {testTuner.Status}; limite depois {after / 1000} W");
            }
            File.WriteAllText(args.Length > 1 ? args[1] : Path.Combine(ConfigStore.Dir, "gpu-tuning-test.txt"), log.ToString());
            return 0;

            static IntPtr GetDev()
            {
                Pitwall.Gpu.Nvml.Init();
                Pitwall.Gpu.Nvml.GetHandle(0, out var d);
                return d;
            }
        }

        // Usado pelo instalador/desinstalador: Pitwall.exe --set-autostart on|off
        if (args.Length > 1 && args[0] == "--set-autostart")
        {
            var on = args[1] == "on";
            var store = new ConfigStore();
            if (!Autostart.Set(on)) return 1;
            store.Update(c => c.StartWithWindows = on);
            return 0;
        }

        using var mutex = new Mutex(true, @"Global\Pitwall.SingleInstance", out var first);
        if (!first) return 0;

        ApplicationConfiguration.Initialize();

        var config = new ConfigStore();
        // Idioma primeiro: os handlers de Changed abaixo (bandeja, hub) já leem o idioma novo
        L.Set(config.Current.Language);
        config.Changed += c => L.Set(c.Language);
        using var sensorService = new SensorService(config.Current.PrimaryGpu);
        using var presentMon = new PresentMonService();
        presentMon.Start();
        using var tuner = new Pitwall.Gpu.GpuTuner(sensorService.GpuName);
        using var battery = new Pitwall.Battery.BatteryService();
        battery.Start(() => config.Current.Battery.Enabled);
        config.Changed += c => { if (c.Battery.Enabled && battery.Devices.Count == 0) battery.RefreshNow(); };
        using var hub = new TelemetryHub(config, sensorService, presentMon, tuner, battery);
        hub.Start();

        Application.Run(new TrayApp(config, hub, sensorService.Dump));
        return 0;
    }
}
