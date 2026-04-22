; ============================================================
; Restro POS - Single Installer (Inno Setup Script)
;
; Bundles: Flutter App + Node Backend + Portable MariaDB
; Creates a single setup .exe that installs everything.
;
; BUILD PREREQUISITES:
;   1. Flutter desktop build:  flutter build windows --release
;   2. Backend build:          node free-version/scripts/build.js --platform=win64 --skip-zip
;   3. Inno Setup 6:          https://jrsoftware.org/isinfo.php
;
; COMPILE:
;   Open this .iss in Inno Setup Compiler and hit Build.
;   Or CLI: iscc.exe restro-pos-setup.iss
;
; OUTPUT:
;   dist/RestroPOS-Setup.exe  (single installer ~150-200MB)
; ============================================================

#define MyAppName "Restro POS"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "iMaker"
#define MyAppExeName "restro.exe"

; ── PATHS: Adjust these to match your build output ──────────
; Flutter build output (after: flutter build windows --release)
#define FlutterBuildDir "..\..\..\free-verison-application\restropos-application\build\windows\x64\runner\Release"
; Backend build output (after: node free-version/scripts/build.js --platform=win64 --skip-zip)
#define BackendBuildDir "..\..\dist\restro-pos-win64"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\RestroPOS
DefaultGroupName={#MyAppName}
; No admin required — installs to user's AppData if no admin
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\..\dist
OutputBaseFilename=RestroPOS-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
SetupIconFile=..\..\docs\icon.ico
; Minimum Windows 10
MinVersion=10.0
WizardStyle=modern
; Show install progress
ShowLanguageDialog=auto
; Uninstall will stop processes first
CloseApplications=yes
CloseApplicationsFilter=*.exe

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "startup"; Description: "Start Restro POS when Windows starts"; GroupDescription: "Startup:"

[Files]
; ── Flutter App ──
Source: "{#FlutterBuildDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

; ── Backend ──
Source: "{#BackendBuildDir}\restro-pos.exe"; DestDir: "{app}\backend"; Flags: ignoreversion
Source: "{#BackendBuildDir}\.env"; DestDir: "{app}\backend"; Flags: ignoreversion
Source: "{#BackendBuildDir}\mariadb\*"; DestDir: "{app}\backend\mariadb"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#BackendBuildDir}\license\*"; DestDir: "{app}\backend\license"; Flags: ignoreversion recursesubdirs createallsubdirs

; ── Create empty directories ──
[Dirs]
Name: "{app}\backend\data"
Name: "{app}\backend\uploads"
Name: "{app}\backend\logs"

[Icons]
; Start Menu
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
; Desktop shortcut (optional)
Name: "{commondesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: desktopicon
; Startup folder (optional — starts Flutter app on login, which starts backend)
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Tasks: startup

[Run]
; Add firewall rule for LAN access (port 3000)
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Restro POS Backend"" dir=in action=allow protocol=TCP localport=3000"; Flags: runhidden; StatusMsg: "Configuring firewall for LAN access..."
; Launch app after install
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Stop backend processes before uninstall
Filename: "taskkill"; Parameters: "/F /IM restro-pos.exe"; Flags: runhidden; RunOnceId: "KillBackend"
Filename: "taskkill"; Parameters: "/F /IM mariadbd.exe"; Flags: runhidden; RunOnceId: "KillMariaDB"
Filename: "taskkill"; Parameters: "/F /IM mysqld.exe"; Flags: runhidden; RunOnceId: "KillMySQL"
; Remove firewall rule
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""Restro POS Backend"""; Flags: runhidden; RunOnceId: "RemoveFirewall"

[UninstallDelete]
; Clean up generated files (but NOT data/ and uploads/ — user data)
Type: files; Name: "{app}\backend\my.ini"
Type: files; Name: "{app}\backend\logs\*"
Type: dirifempty; Name: "{app}\backend\logs"

[Code]
// ── First-time MariaDB initialization ──────────────────────
// Runs after files are copied, before the app launches.
procedure InitializeMariaDB;
var
  DataDir: String;
  InstallDbExe: String;
  ResultCode: Integer;
begin
  DataDir := ExpandConstant('{app}\backend\data\mysql');

  // Only initialize if data\mysql doesn't exist (first install)
  if not DirExists(DataDir) then
  begin
    Log('First time setup: initializing MariaDB data directory...');

    // Try mariadb-install-db.exe first, fall back to mysql_install_db.exe
    InstallDbExe := ExpandConstant('{app}\backend\mariadb\bin\mariadb-install-db.exe');
    if not FileExists(InstallDbExe) then
      InstallDbExe := ExpandConstant('{app}\backend\mariadb\bin\mysql_install_db.exe');

    if FileExists(InstallDbExe) then
    begin
      Exec(InstallDbExe,
        '--datadir="' + ExpandConstant('{app}\backend\data') + '" --verbose-bootstrap',
        ExpandConstant('{app}\backend'),
        SW_HIDE, ewWaitUntilTerminated, ResultCode);

      if ResultCode <> 0 then
        Log('MariaDB init returned code: ' + IntToStr(ResultCode))
      else
        Log('MariaDB data directory initialized successfully.');
    end else
      Log('WARNING: MariaDB install-db executable not found!');
  end else
    Log('MariaDB data directory already exists, skipping init.');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    InitializeMariaDB;
  end;
end;

// ── Uninstall: Ask about keeping user data ────────────────
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
  begin
    if MsgBox('Do you want to keep your database and uploaded files?' + #13#10 +
              '(Click Yes to keep data for reinstall, No to delete everything)',
              mbConfirmation, MB_YESNO) = IDNO then
    begin
      DelTree(ExpandConstant('{app}\backend\data'), True, True, True);
      DelTree(ExpandConstant('{app}\backend\uploads'), True, True, True);
    end;
  end;
end;
