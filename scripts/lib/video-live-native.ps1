param([string]$Action, [int]$ProcessIdValue, [string]$FilesJson='[]', [int]$TargetX=0, [int]$TargetY=0)
$ErrorActionPreference="Stop"
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()
# 这份测试辅助只操作本轮 Electron 的系统对话框，不改生产 IPC 返回值。
# UI Automation 设置的是原生文件名字段，ffprobe 和浏览器仍读取真实磁盘文件。
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class LiveNative {
 [DllImport("user32.dll")] public static extern IntPtr GetDlgItem(IntPtr parent,int id);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindowEx(IntPtr parent,IntPtr after,string cls,string text);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr hwnd,uint msg,IntPtr w,string text);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int command);
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr info);
}
'@
$automationRoot=[System.Windows.Automation.AutomationElement]::RootElement
if($Action -eq 'drop') {
 $files=ConvertFrom-Json $FilesJson
 $folder=[IO.Path]::GetDirectoryName($files[0])
 $shell=New-Object -ComObject Shell.Application
 $shell.Open($folder)
 $shellWindow=$null
 $deadline=[DateTime]::UtcNow.AddSeconds(12)
 while([DateTime]::UtcNow -lt $deadline) {
  $shellWindow=@($shell.Windows()) | Where-Object { $_.Document.Folder.Self.Path -eq $folder } | Select-Object -First 1
  if($shellWindow) { break }
  Start-Sleep -Milliseconds 150
 }
 if(-not $shellWindow) { throw 'Test Explorer window not found' }
 try {
  [LiveNative]::ShowWindow([IntPtr]$shellWindow.HWND,9) | Out-Null
  [LiveNative]::SetWindowPos([IntPtr]$shellWindow.HWND,[IntPtr](-1),0,50,440,640,0x0040) | Out-Null
  [LiveNative]::SetForegroundWindow([IntPtr]$shellWindow.HWND) | Out-Null
  $item=$shellWindow.Document.Folder.ParseName([IO.Path]::GetFileName($files[0]))
  $shellWindow.Document.SelectItem($item,29)
  Start-Sleep -Milliseconds 400
  $explorer=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$shellWindow.HWND)
  $items=$explorer.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
  $row=$items | Where-Object { $_.Current.Name -like ([IO.Path]::GetFileNameWithoutExtension($files[0])+'*') -and $_.Current.BoundingRectangle.Width -gt 0 } | Select-Object -First 1
  if(-not $row) { throw 'Explorer file row unavailable' }
  $rectangle=$row.Current.BoundingRectangle
  $startX=[int]($rectangle.Left+[Math]::Min($rectangle.Width/2,48))
  $startY=[int]($rectangle.Top+[Math]::Min($rectangle.Height/2,48))
  Write-Output ("Explorer row "+$rectangle.ToString())
  Write-Output ("OLE coordinates "+$startX+","+$startY+" -> "+$TargetX+","+$TargetY)
  [LiveNative]::SetCursorPos($startX,$startY) | Out-Null
  [LiveNative]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  for($step=1;$step -le 18;$step++) { [LiveNative]::SetCursorPos([int]($startX+($TargetX-$startX)*$step/18),[int]($startY+($TargetY-$startY)*$step/18)) | Out-Null; Start-Sleep -Milliseconds 45 }
  Write-Output "OLE_TARGET"
  Start-Sleep -Milliseconds 1200
  [LiveNative]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  Write-Output 'Explorer OLE drag released'
 } finally { $shellWindow.Quit() }
 exit 0
}
$targetCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$ProcessIdValue)
$deadline=[DateTime]::UtcNow.AddSeconds(18)
$dialogElement=$null
while([DateTime]::UtcNow -lt $deadline) {
 $windows=$automationRoot.FindAll([System.Windows.Automation.TreeScope]::Children,$targetCondition)
 foreach($window in $windows) { if($window.Current.ClassName -eq '#32770') { $dialogElement=$window; break } }
 if($dialogElement) { break }
 Start-Sleep -Milliseconds 120
}
if(-not $dialogElement) { throw 'No native picker for test process' }
$dialogHandle=[IntPtr]$dialogElement.Current.NativeWindowHandle
if($Action -eq 'cancel') {
 [LiveNative]::SendMessage([LiveNative]::GetDlgItem($dialogHandle,2),0x00F5,[IntPtr]::Zero,$null) | Out-Null
 Write-Output 'Native picker cancelled'
 exit 0
}
$files=ConvertFrom-Json $FilesJson
$quoted=($files | ForEach-Object { '"'+$_+'"' }) -join ' '
$combo=[LiveNative]::GetDlgItem($dialogHandle,1148)
$inner=[LiveNative]::FindWindowEx($combo,[IntPtr]::Zero,'ComboBox',$null)
if($inner -ne [IntPtr]::Zero) { $combo=$inner }
$editHandle=[LiveNative]::FindWindowEx($combo,[IntPtr]::Zero,'Edit',$null)
if($editHandle -eq [IntPtr]::Zero) { throw 'Native filename Edit HWND unavailable' }
[LiveNative]::SendMessage($editHandle,0x000C,[IntPtr]::Zero,$quoted) | Out-Null
[LiveNative]::SendMessage([LiveNative]::GetDlgItem($dialogHandle,1),0x00F5,[IntPtr]::Zero,$null) | Out-Null
Write-Output ('Native picker confirmed '+$files.Count+' files')
