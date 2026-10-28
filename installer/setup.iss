; RBX Cursor Studio — Windows kurulum betiği (Inno Setup 6)
;
; Kullanıcı başına kurulum yapar (yönetici izni istemez): %LOCALAPPDATA%\Programs\RBX Cursor Studio
; Başlat menüsü kısayolu, isteğe bağlı masaüstü kısayolu, .rbxcursor dosya ilişkilendirmesi ve
; "Programlar ve Özellikler"den kaldırma ekler. Kullanıcı verileri (%APPDATA%\RBXCursorStudio)
; kaldırırken SİLİNMEZ; paketler ve ayarlar korunur.
;
; Derleme (sürüm ve exe yolu dışarıdan verilir):
;   iscc /DMyAppVersion=6.0.0 /DSourceExe=..\RBXCursorStudio\bin\Release\net48\RBXCursorStudio.exe installer\setup.iss
; Çıktı: installer\Output\RBX Cursor Studio Setup <sürüm>.exe
; (Ad, uygulamanın güncelleme denetleyicisinin aradığı biçimdedir.)

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif
#ifndef SourceExe
  #define SourceExe "..\RBXCursorStudio\bin\Release\net48\RBXCursorStudio.exe"
#endif

#define MyAppName "RBX Cursor Studio"
#define MyAppExe "RBXCursorStudio.exe"
#define MyAppPublisher "Demhat Dayan"
#define MyAppUrl "https://github.com/Carl00-mpeek/Roblox-Cursor-Studio"

[Setup]
AppId={{6B876C94-F80A-4BFE-A310-F7F13BFCAC90}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppUrl}
AppSupportURL={#MyAppUrl}/issues
AppUpdatesURL={#MyAppUrl}/releases
AppCopyright=Copyright (c) 2026 Demhat Dayan
VersionInfoVersion={#MyAppVersion}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename={#MyAppName} Setup {#MyAppVersion}
SetupIconFile=..\assets\backgrounds\logo.ico
UninstallDisplayIcon={app}\{#MyAppExe}
UninstallDisplayName={#MyAppName}
LicenseFile=..\LICENSE.md
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Uygulama açıksa (ör. güncelleme sırasında) kapatılıp kurulumdan sonra yeniden açılır.
CloseApplications=yes
RestartApplications=no
ChangesAssociations=yes
MinVersion=6.1sp1

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
turkish.NeedNet48=Bu uygulama .NET Framework 4.8 gerektirir (Windows 10/11 ile birlikte gelir).%n%nİndirme sayfası açılsın mı?
english.NeedNet48=This app requires .NET Framework 4.8 (included with Windows 10/11).%n%nOpen the download page?
turkish.PackFileType=RBX Cursor Studio Paketi
english.PackFileType=RBX Cursor Studio Pack

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; DestName: "{#MyAppExe}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Registry]
; .rbxcursor dosya ilişkilendirmesi (kullanıcı başına)
Root: HKCU; Subkey: "Software\Classes\.rbxcursor"; ValueType: string; ValueName: ""; ValueData: "RBXCursorStudio.Pack"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Classes\RBXCursorStudio.Pack"; ValueType: string; ValueName: ""; ValueData: "{cm:PackFileType}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\RBXCursorStudio.Pack\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExe}"",0"
Root: HKCU; Subkey: "Software\Classes\RBXCursorStudio.Pack\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\{#MyAppExe}"" ""%1"""
; Uygulamanın kendisinin eklediği "Windows başlangıcında aç" kaydı kaldırırken temizlensin
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: none; ValueName: "{#MyAppName}"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

[Code]
// .NET Framework 4.8 yüklü mü? (Release >= 528040)
function IsNet48Installed(): Boolean;
var
  release: Cardinal;
begin
  Result := RegQueryDWordValue(HKLM, 'SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full', 'Release', release) and (release >= 528040);
end;

function InitializeSetup(): Boolean;
var
  code: Integer;
begin
  Result := True;
  if not IsNet48Installed() then
  begin
    if MsgBox(CustomMessage('NeedNet48'), mbConfirmation, MB_YESNO) = IDYES then
      ShellExec('open', 'https://dotnet.microsoft.com/download/dotnet-framework/net48', '', '', SW_SHOWNORMAL, ewNoWait, code);
    Result := False;
  end;
end;
