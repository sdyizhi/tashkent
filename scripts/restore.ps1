<#
.SYNOPSIS
    Tashkent 数据恢复脚本：从备份包还原 data 目录。

.DESCRIPTION
    恢复前必须停服（SQLite 正在写入时覆盖文件会损坏数据库）。
    脚本会：
      1. 校验备份文件存在且可读；
      2. 把现有 data 目录另存为 .bak-<时间戳>（可回退）；
      3. 解压覆盖。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 -Backup backups\tashkent-backup-2026-11-02-101500.tar.gz
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$Backup,
  [string]$DataDir = 'data'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataPath = if ([System.IO.Path]::IsPathRooted($DataDir)) { $DataDir } else { Join-Path $repoRoot $DataDir }
$backupPath = if ([System.IO.Path]::IsPathRooted($Backup)) { $Backup } else { Join-Path $repoRoot $Backup }

if (-not (Test-Path $backupPath)) {
  throw "备份文件不存在: $backupPath"
}

$backupItem = Get-Item $backupPath
if ($backupItem.PSIsContainer) {
  throw "备份必须是一个文件，而不是目录: $backupPath"
}
if ($backupItem.Length -eq 0) {
  throw "备份文件为空: $backupPath"
}

Write-Host "备份文件: $backupPath ($([math]::Round($backupItem.Length / 1MB, 2)) MB)"

# 停服提示：SQLite 在写入时覆盖文件会导致数据库损坏
Write-Host ''
Write-Host '⚠️  恢复前请确认 Tashkent 服务已停止（否则 SQLite 文件可能被写坏）。'
Write-Host ''

$isZip = $backupItem.Extension -eq '.zip'
$tarExe = $null
if (-not $isZip) {
  $tarCmd = Get-Command tar.exe -ErrorAction SilentlyContinue
  if ($tarCmd) {
    $tarExe = $tarCmd.Source
  } else {
    $tarCandidates = New-Object System.Collections.Generic.List[string]
    if ($env:ProgramFiles) { $tarCandidates.Add((Join-Path $env:ProgramFiles 'Git\usr\bin\tar.exe')) }
    if ($env:LOCALAPPDATA) { $tarCandidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\Git\usr\bin\tar.exe')) }
    foreach ($candidate in $tarCandidates) {
      if (Test-Path $candidate) { $tarExe = $candidate; break }
    }
  }
  if (-not $tarExe) {
    throw '未找到 tar.exe，且备份不是 zip 包，无法解压。请改用 zip 备份或安装 tar。'
  }
}

# 现有数据另存一份，出问题可手工回退
if (Test-Path $dataPath) {
  $bakPath = "$dataPath.bak-$(Get-Date -Format 'yyyy-MM-dd-HHmmss')"
  Write-Host "把现有数据目录另存为: $bakPath"
  Move-Item -Path $dataPath -Destination $bakPath
}

New-Item -ItemType Directory -Force -Path $dataPath | Out-Null

try {
  if ($isZip) {
    Expand-Archive -Path $backupPath -DestinationPath $dataPath -Force
  } else {
    # Git 自带的 tar 有三个坑：
    #   1. `D:\...` 会被当成「远程主机:路径」→ 需要 --force-local（放在选项之后）
    #   2. 解压时它会调 sh 里的 gzip → 需要把 Git 的 bin 目录加进 PATH
    #   3. -C 后的路径必须用正斜杠；反斜杠会被它当成转义符
    $env:PATH = (Split-Path -Parent $tarExe) + ';' + $env:PATH
    $dataPathUnix = $dataPath -replace '\\', '/'
    $backupPathUnix = $backupPath -replace '\\', '/'
    & $tarExe xzf $backupPathUnix --force-local -C $dataPathUnix .
    if ($LASTEXITCODE -ne 0) { throw "解压失败，exit=$LASTEXITCODE" }
  }
} catch {
  # 解压失败时把旧数据放回去，避免留下空目录
  if (Test-Path $bakPath) {
    if (Test-Path $dataPath) { Remove-Item -Recurse -Force $dataPath }
    Move-Item -Path $bakPath -Destination $dataPath
  }
  throw
}

Write-Host "恢复完成: $dataPath"
Get-ChildItem -Path $dataPath | ForEach-Object { Write-Host "   $($_.Name)" }
Write-Host ''
Write-Host '请重新启动 Tashkent 服务。'
