'use strict';
// Ayudante persistente de PowerShell: volumen/silencio/brillo del sistema y colocación de ventanas de otras apps.
// Un solo proceso, órdenes por líneas, para no pagar el arranque de PowerShell cada vez.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');

const PS = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IAudioEndpointVolume {
  int RegisterControlChangeNotify(IntPtr p); int UnregisterControlChangeNotify(IntPtr p); int GetChannelCount(out uint c);
  int SetMasterVolumeLevel(float l, ref Guid g); int SetMasterVolumeLevelScalar(float l, ref Guid g);
  int GetMasterVolumeLevel(out float l); int GetMasterVolumeLevelScalar(out float l);
  int SetChannelVolumeLevel(uint n, float l, ref Guid g); int SetChannelVolumeLevelScalar(uint n, float l, ref Guid g);
  int GetChannelVolumeLevel(uint n, out float l); int GetChannelVolumeLevelScalar(uint n, out float l);
  int SetMute([MarshalAs(UnmanagedType.Bool)] bool m, ref Guid g); int GetMute(out bool m);
}
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDevice { int Activate(ref Guid id, uint ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
public interface IMMDeviceEnumerator { int EnumAudioEndpoints(int f, int s, out IntPtr d); int GetDefaultAudioEndpoint(int f, int r, out IMMDevice d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] public class MMDeviceEnumerator { }
public static class Aud {
  static IAudioEndpointVolume Ep() {
    var e = (IMMDeviceEnumerator)(new MMDeviceEnumerator()); IMMDevice d; e.GetDefaultAudioEndpoint(0, 1, out d);
    Guid iid = typeof(IAudioEndpointVolume).GUID; object o; d.Activate(ref iid, 23, IntPtr.Zero, out o); return (IAudioEndpointVolume)o;
  }
  public static int Vol { get { float v; Ep().GetMasterVolumeLevelScalar(out v); return (int)Math.Round(v * 100); } set { Guid g = Guid.Empty; Ep().SetMasterVolumeLevelScalar(Math.Max(0, Math.Min(100, value)) / 100f, ref g); } }
  public static bool Mute { get { bool m; Ep().GetMute(out m); return m; } set { Guid g = Guid.Empty; Ep().SetMute(value, ref g); } }
}
public static class Win {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern int GetWindowLong(IntPtr h, int i);
  [DllImport("user32.dll")] public static extern int SetWindowLong(IntPtr h, int i, int v);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr a, int x, int y, int w, int hh, uint f);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  public static string Title(IntPtr h) { var s = new StringBuilder(256); GetWindowText(h, s, 256); return s.ToString(); }
}
"@
[void][Win]::SetProcessDPIAware()
$self = $PID
function Place($h, $x, $y, $w, $hh) {
  $p = [IntPtr][int64]$h
  if (-not [Win]::IsWindow($p)) { return 0 }
  [void][Win]::ShowWindow($p, 9)
  $st = [Win]::GetWindowLong($p, -16)
  $st = $st -band (-bnot 0x00C00000) -band (-bnot 0x00040000)   # sin título ni borde de tamaño
  [void][Win]::SetWindowLong($p, -16, $st)
  [void][Win]::SetWindowPos($p, [IntPtr]::Zero, $x, $y, $w, $hh, 0x0044)   # SWP_NOZORDER|SWP_SHOWWINDOW -> luego al frente
  [void][Win]::SetWindowPos($p, [IntPtr](-1), $x, $y, $w, $hh, 0x0040)   # HWND_TOPMOST
  [void][Win]::SetWindowPos($p, [IntPtr](-2), $x, $y, $w, $hh, 0x0040)   # HWND_NOTOPMOST (queda arriba del resto)
  [void][Win]::SetForegroundWindow($p)
  return [int64]$h
}
function Brightness() { try { return [int](Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness | Select-Object -First 1).CurrentBrightness } catch { return $null } }
[Console]::Out.WriteLine('{"ready":true}')
while (($line = [Console]::In.ReadLine()) -ne $null) {
  $a = $line.Trim() -split '\s+'
  switch ($a[0]) {
    'get' {
      $o = @{ id = 'get' }
      try { $o.vol = [Aud]::Vol; $o.mute = [Aud]::Mute } catch {}
      $b = Brightness; if ($b -ne $null) { $o.bright = $b }
      [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress))
    }
    'vol' { try { [Aud]::Vol = [int]$a[1] } catch {} }
    'mute' { try { [Aud]::Mute = ($a[1] -eq '1') } catch {} }
    'bright' { try { Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = [byte][int]$a[1] } | Out-Null } catch {} }
    'findfg' {
      # espera la ventana que acaba de abrirse (la que toma el primer plano y no es de este proceso ni del radio)
      $tid = $a[1]; $found = 0
      for ($i = 0; $i -lt 40 -and $found -eq 0; $i++) {
        Start-Sleep -Milliseconds 200
        $h = [Win]::GetForegroundWindow(); if ($h -eq [IntPtr]::Zero) { continue }
        [uint32]$wp = 0; [void][Win]::GetWindowThreadProcessId($h, [ref]$wp)
        if ($wp -eq $self -or [string]$wp -eq $tid) { continue }
        if (-not [Win]::IsWindowVisible($h)) { continue }
        if ([Win]::Title($h).Length -eq 0) { continue }
        $found = [int64]$h
      }
      if ($found -ne 0) { [void](Place $found $a[2] $a[3] $a[4] $a[5]) }
      [Console]::Out.WriteLine((@{ id = 'findfg'; hwnd = $found } | ConvertTo-Json -Compress))
    }
    'place' { $r = Place $a[1] $a[2] $a[3] $a[4] $a[5]; [Console]::Out.WriteLine((@{ id = 'place'; hwnd = $r } | ConvertTo-Json -Compress)) }
    'monoff' { Add-Type -Name M -Namespace W -MemberDefinition '[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h,int m,IntPtr w,IntPtr l);'; [void][W.M]::SendMessage([IntPtr]0xffff, 0x112, [IntPtr]0xF170, [IntPtr]2) }
  }
}
`;

let proc = null, buf = '', waiters = {}, state = {}, ready = false, timer = null;

function start() {
  if (process.platform !== 'win32' || proc) return;
  try {
    const f = path.join(app.getPath('userData'), 'helper.ps1');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, '﻿' + PS, 'utf8');
    proc = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', f], { windowsHide: true });
  } catch (e) { proc = null; return; }
  proc.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line) continue;
      let o; try { o = JSON.parse(line); } catch (e) { continue; }
      if (o.ready) { ready = true; poll(); continue; }
      if (o.id === 'get') { delete o.id; state = Object.assign(state, o); continue; }
      const w = waiters[o.id]; if (w) { delete waiters[o.id]; w(o); }
    }
  });
  proc.on('exit', () => { proc = null; ready = false; clearTimeout(timer); });
  proc.stderr.on('data', () => {});
  proc.stdin.on('error', () => {});
}
function poll() { clearTimeout(timer); if (!proc) return; cmd('get'); timer = setTimeout(poll, 4000); }
function cmd(line) { if (proc && proc.stdin.writable) { try { proc.stdin.write(line + '\n'); return true; } catch (e) {} } return false; }
function ask(id, line, ms) {
  return new Promise((res) => {
    if (!cmd(line)) return res(null);
    const t = setTimeout(() => { delete waiters[id]; res(null); }, ms || 15000);
    waiters[id] = (o) => { clearTimeout(t); res(o); };
  });
}
function stop() { clearTimeout(timer); if (proc) { try { proc.stdin.end(); proc.kill(); } catch (e) {} proc = null; } }

module.exports = {
  start, stop,
  state: () => state,
  setVolume: (v) => { state.vol = Math.max(0, Math.min(100, Math.round(v))); cmd('vol ' + state.vol); },
  setMute: (m) => { state.mute = !!m; cmd('mute ' + (m ? 1 : 0)); },
  setBrightness: (b) => { if (typeof state.bright === 'number') { state.bright = Math.round(b); cmd('bright ' + state.bright); } },
  findAndPlace: (ourPid, r) => ask('findfg', ['findfg', ourPid, r.x, r.y, r.width, r.height].join(' '), 12000),
  place: (hwnd, r) => ask('place', ['place', hwnd, r.x, r.y, r.width, r.height].join(' '), 5000),
  monitorsOff: () => cmd('monoff')
};
