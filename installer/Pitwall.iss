; Instalador do Pitwall (Inno Setup 6)
; Build: installer\build.ps1  (publica o app e compila este script)
;
; Inclui e instala junto:
;   - PresentMon (Intel, MIT)                      -> {app}\tools\PresentMon.exe (vem no publish)
;   - PawnIO (driver assinado usado pelo LibreHardwareMonitor para temperaturas da CPU) -> instalado em silêncio se faltar
;   - WebView2 Runtime (Microsoft)                 -> instalado em silêncio se faltar (Win11 já tem)

#define AppName "Pitwall"
#ifndef AppVersion
  #define AppVersion "1.4.0"
#endif
#define AppExe "Pitwall.exe"

[Setup]
AppId={{6F3C1E2A-9B7D-4C1B-A7C4-5E0B2D9A41F7}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=igoredm
AppCopyright=Copyright (c) 2026 igoredm
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
#ifdef Preview
; Prévia só do visual (installer\preview.ps1): sem admin e sem instalar nada
PrivilegesRequired=lowest
Uninstallable=no
CreateAppDir=no
#else
PrivilegesRequired=admin
#endif
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
#ifdef Preview
OutputDir=..\artifacts\preview
#else
OutputDir=..\artifacts\installer
#endif
OutputBaseFilename=Pitwall-Setup-{#AppVersion}
SetupIconFile=..\src\Pitwall\pitwall.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
; Visual com a identidade do Pitwall (requer Inno Setup 6.7+): estilo escuro, sem linhas divisórias,
; fundo no azul-noite do app e imagens com a logo (installer\art\make_art.py)
WizardStyle=modern dark hidebevels includetitlebar
WizardSizePercent=125,125
WizardBackColor=#0A0D13
WizardBackImageFile=art\back.png
WizardImageFile=art\wizard-100.png,art\wizard-125.png,art\wizard-150.png,art\wizard-200.png
WizardSmallImageFile=art\wizard-small-100.png,art\wizard-small-125.png,art\wizard-small-150.png,art\wizard-small-200.png
WizardImageBackColor=#0A0D13
WizardSmallImageBackColor=#0A0D13
ShowLanguageDialog=auto
LanguageDetectionMethod=uilanguage
CloseApplications=no
; Menos telas: a pasta só aparece na primeira instalação e não há "pronto para instalar"
DisableDirPage=auto
DisableReadyPage=yes
DisableWelcomePage=no

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Messages]
ptbr.ClickNext=
en.ClickNext=
ptbr.ClickFinish=
en.ClickFinish=
ptbr.WelcomeLabel1=Bem-vindo
ptbr.WelcomeLabel2=FPS, temperaturas e telemetria do seu PC num widget no segundo monitor — sem overlay e sem tocar no jogo.%n%nLeva menos de um minuto.
en.WelcomeLabel1=Welcome
en.WelcomeLabel2=FPS, temperatures and PC telemetry in a widget on your second screen — no overlay, nothing touches the game.%n%nTakes less than a minute.
ptbr.FinishedHeadingLabel=Tudo pronto
ptbr.FinishedLabelNoIcons=O Pitwall fica na bandeja, perto do relógio. Na primeira vez, um tour rápido mostra cada parte.
ptbr.FinishedLabel=O Pitwall fica na bandeja, perto do relógio. Na primeira vez, um tour rápido mostra cada parte.
en.FinishedHeadingLabel=All set
en.FinishedLabelNoIcons=Pitwall lives in the tray, next to the clock. The first time, a quick tour shows each part.
en.FinishedLabel=Pitwall lives in the tray, next to the clock. The first time, a quick tour shows each part.
ptbr.ButtonNext=&Continuar
en.ButtonNext=&Continue
ptbr.ButtonFinish=&Concluir
en.ButtonFinish=&Finish

[CustomMessages]
ptbr.AutostartTask=Iniciar o Pitwall junto com o Windows
ptbr.InstallingPawnIO=Instalando o driver de sensores (PawnIO)...
ptbr.InstallingWebView2=Instalando o Microsoft WebView2 Runtime...
ptbr.LaunchApp=Abrir o Pitwall agora
en.AutostartTask=Start Pitwall with Windows
en.InstallingPawnIO=Installing the sensor driver (PawnIO)...
en.InstallingWebView2=Installing the Microsoft WebView2 Runtime...
en.LaunchApp=Launch Pitwall now

[Tasks]
Name: "autostart"; Description: "{cm:AutostartTask}"
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

#ifndef Preview
[Files]
Source: "..\artifacts\publish\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "*.pdb"
Source: "THIRD-PARTY-NOTICES.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "redist\PawnIO_setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: not PawnIOInstalled
Source: "redist\MicrosoftEdgeWebview2Setup.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall; Check: not WebView2Installed

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "{cm:InstallingWebView2}"; Flags: waituntilterminated; Check: not WebView2Installed
Filename: "{tmp}\PawnIO_setup.exe"; Parameters: "-install -silent"; StatusMsg: "{cm:InstallingPawnIO}"; Flags: waituntilterminated; Check: not PawnIOInstalled
Filename: "{app}\{#AppExe}"; Parameters: "--set-autostart on"; Flags: runhidden waituntilterminated; Tasks: autostart
Filename: "{app}\{#AppExe}"; Parameters: "--set-autostart off"; Flags: runhidden waituntilterminated; Tasks: not autostart
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchApp}"; Flags: nowait postinstall skipifsilent shellexec
; Atualização silenciosa pelo próprio app (/VERYSILENT ... /RESTARTAPPLICATIONS): reabre o Pitwall no fim.
; Sem esse parâmetro (ex.: winget, instalação silenciosa manual) o app não é aberto.
Filename: "{app}\{#AppExe}"; Parameters: "--updated"; Flags: nowait; Check: RestartAfterSilentUpdate

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#AppExe} /F"; Flags: runhidden waituntilterminated; RunOnceId: "KillApp"
Filename: "{sys}\taskkill.exe"; Parameters: "/IM BatteryHub.exe /IM WirelessBattery.exe /IM headsetcontrol.exe /F"; Flags: runhidden waituntilterminated; RunOnceId: "KillHelpers"
Filename: "{app}\{#AppExe}"; Parameters: "--set-autostart off"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveAutostart"
Filename: "{app}\tools\PresentMon.exe"; Parameters: "--terminate_existing_session --session_name PitwallPresentMon"; Flags: runhidden waituntilterminated; RunOnceId: "StopEtw"
; Regra do firewall da visualização no celular (Remote.Enabled); some mesmo que o recurso tenha ficado ligado
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=Pitwall-PhoneView"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewallRule"

[InstallDelete]
; Leitor de bateria com o nome antigo (até a 1.2.1): virou BatteryHub.exe
Type: files; Name: "{app}\tools\battery\WirelessBattery.exe"
Type: files; Name: "{app}\tools\battery\WirelessBattery-source-*.zip"

[UninstallDelete]
; Cache do WebView2. Config (%APPDATA%\Pitwall) e logs (%LOCALAPPDATA%\Pitwall\logs) ficam, como a maioria dos apps.
Type: filesandordirs; Name: "{localappdata}\Pitwall\WebView2"
#endif

[Code]
function PawnIOInstalled: Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO');
end;

function WebView2Installed: Boolean;
var
  Version: String;
begin
  Result :=
    (RegQueryStringValue(HKLM, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

// Reabrir o app depois de uma atualização silenciosa iniciada pelo atualizador do Pitwall.
function RestartAfterSilentUpdate: Boolean;
begin
  Result := WizardSilent and (Pos('/RESTARTAPPLICATIONS', Uppercase(GetCmdTail)) > 0);
end;

#ifndef Preview
// Fecha BatteryHub/headsetcontrol/PresentMon iniciados da pasta do app (não mexe em cópias de outros lugares).
// Se algum sobrar rodando, o arquivo fica travado ("DeleteFile falhou; código 5").
procedure KillHelpers;
var
  Code, I: Integer;
  Cmd: String;
begin
  // Por nome (o filtro por caminho falhava: um PowerShell 32-bit não lê o caminho de processos 64-bit)
  Cmd := '/F /IM BatteryHub.exe /IM WirelessBattery.exe /IM headsetcontrol.exe /IM PresentMon.exe';
  for I := 1 to 3 do
  begin
    Exec(ExpandConstant('{sys}\taskkill.exe'), Cmd, '', SW_HIDE, ewWaitUntilTerminated, Code);
    Sleep(300);
  end;
end;

// Atualização por cima: fecha a instância em execução antes de copiar os arquivos.
// Em modo silencioso quem chamou costuma ser o atualizador do app, que já está saindo sozinho (e restaura o
// ajuste da GPU), então espera até 15 s o mutex de instância única sumir antes de recorrer ao taskkill.
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code, I: Integer;
begin
  if WizardSilent then
    for I := 1 to 75 do
    begin
      if not CheckForMutexes('Global\Pitwall.SingleInstance') then Break;
      Sleep(200);
    end;
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/IM {#AppExe} /F', '', SW_HIDE, ewWaitUntilTerminated, Code);
  // Os auxiliares (bateria a cada minuto, FPS) podem sobrar depois do taskkill do app
  KillHelpers();
  Sleep(500);
  Result := '';
end;
#endif
