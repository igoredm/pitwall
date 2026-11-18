; Instalador do Pitwall (Inno Setup 6)
; Build: installer\build.ps1  (publica o app e compila este script)
;
; Inclui e instala junto:
;   - PresentMon (Intel, MIT)                      -> {app}\tools\PresentMon.exe (vem no publish)
;   - PawnIO (driver assinado usado pelo LibreHardwareMonitor para temperaturas da CPU) -> instalado em silêncio se faltar
;   - WebView2 Runtime (Microsoft)                 -> instalado em silêncio se faltar (Win11 já tem)

#define AppName "Pitwall"
#ifndef AppVersion
  #define AppVersion "1.0.0"
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
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir=..\artifacts\installer
OutputBaseFilename=Pitwall-Setup-{#AppVersion}
SetupIconFile=..\src\Pitwall\pitwall.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=auto
LanguageDetectionMethod=uilanguage
CloseApplications=no

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

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
Filename: "{app}\{#AppExe}"; Flags: nowait; Check: RestartAfterSilentUpdate

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/IM {#AppExe} /F"; Flags: runhidden waituntilterminated; RunOnceId: "KillApp"
Filename: "{app}\{#AppExe}"; Parameters: "--set-autostart off"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveAutostart"
Filename: "{app}\tools\PresentMon.exe"; Parameters: "--terminate_existing_session --session_name PitwallPresentMon"; Flags: runhidden waituntilterminated; RunOnceId: "StopEtw"
; Regra do firewall da visualização no celular (Remote.Enabled); some mesmo que o recurso tenha ficado ligado
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=Pitwall-PhoneView"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewallRule"

[UninstallDelete]
; Cache do WebView2. Config (%APPDATA%\Pitwall) e logs (%LOCALAPPDATA%\Pitwall\logs) ficam, como a maioria dos apps.
Type: filesandordirs; Name: "{localappdata}\Pitwall\WebView2"

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
  Sleep(800);
  Result := '';
end;
