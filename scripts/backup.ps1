<#
.SYNOPSIS
    Tashkent 数据备份脚本：把 data 目录（SQLite + workspace + artifacts）打包成 tar.gz。

.DESCRIPTION
    备份内容：DB_FILE 所在的 data 目录（默认 data/），包含
      - tashkent.db（SQLite 主库，WAL 模式下的 -wal / -shm 文件一并打包）
      - workspace/（Agent 可读写的沙箱）
      - artifacts/（产物目录）

    Windows 自带的 tar 不在 PATH 上（PowerShell 5.1 环境常见），
    因此脚本会依次尝试 tar.exe 与 Compress-Archive 作为打包器。

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
    powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -DataDir data -OutDir backups
#>
param(
  [string]$DataDir = 'data',
  [string]$OutDir = 'backups'
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$dataPath = if ([System.IO.Path]::IsPathRooted($DataDir)) { $DataDir } else { Join-Path $repoRoot $DataDir }
$outPath = if ([System.IO.Path]::IsPathRooted($OutDir)) { $OutDir } else { Join-Path $repoRoot $OutDir }

if (-not (Test-Path $dataPath)) {
  throw "数据目录不存在: $dataPath"
}

New-Item -ItemType Directory -Force -Path $outPath | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd-HHmmss'
$baseName = "tashkent-backup-$stamp"

# 优先用 tar（跨平台、压缩率高），回退到 Compress-Archive（Windows 内置）
$tarExe = $null
$tarCmd = Get-Command tar.exe -ErrorAction SilentlyContinue
if ($tarCmd) {
  $tarExe = $tarCmd.Source
} else {
  # Git for Windows 自带 tar，但不一定在 PATH 上。
  # 用 List 而不是数组 +=：PowerShell 里 `@() += 'x'` 会退化成字符串拼接。
  $tarCandidates = New-Object System.Collections.Generic.List[string]
  if ($env:ProgramFiles) { $tarCandidates.Add((Join-Path $env:ProgramFiles 'Git\usr\bin\tar.exe')) }
  if ($env:LOCALAPPDATA) { $tarCandidates.Add((Join-Path $env:LOCALAPPDATA 'Programs\Git\usr\bin\tar.exe')) }
  foreach ($candidate in $tarCandidates) {
    if (Test-Path $candidate) { $tarExe = $candidate; break }
  }
}

if ($tarExe) {
  $outFile = Join-Path $outPath "$baseName.tar.gz"
  Write-Host "使用 tar 打包: $tarExe"
  # Git 自带的 tar 有三个坑：
  #   1. `D:\...` 会被当成「远程主机:路径」→ 需要 --force-local（必须放在选项之后）
  #   2. 压缩时它会调 sh 里的 gzip → 需要把 Git 的 bin 目录加进 PATH
  #   3. -C 后的路径必须用正斜杠；反斜杠会被它当成转义符
  $env:PATH = (Split-Path -Parent $tarExe) + ';' + $env:PATH
  $dataPathUnix = $dataPath -replace '\\', '/'
  $outFileUnix = $outFile -replace '\\', '/'
  & $tarExe czf $outFileUnix --force-local -C $dataPathUnix .
  if ($LASTEXITCODE -ne 0) { throw "tar 打包失败，exit=$LASTEXITCODE" }
  Write-Host "备份完成: $outFile"
} else {
  $outFile = Join-Path $outPath "$baseName.zip"
  Write-Host '未找到 tar.exe，改用 Compress-Archive 打包'
  Compress-Archive -Path (Join-Path $dataPath '*') -DestinationPath $outFile -Force
  Write-Host "备份完成: $outFile"
}

$sizeMb = [math]::Round((Get-Item $outFile).Length / 1MB, 2)
Write-Host ("备份大小: {0} MB" -f $sizeMb)
