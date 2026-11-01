$ErrorActionPreference = 'Stop'

# 在没有 Docker 的环境中，用等价路径验证 Dockerfile 的 runtime 阶段。
#
# 复刻 Dockerfile 的关键步骤：
#   1. build 阶段：pnpm install --frozen-lockfile → 构建 shared/desktop/server
#   2. runtime 阶段：pnpm install --prod --frozen-lockfile --filter @tashkent/server
#      （只装运行期依赖，剔除 devDependencies）
#   3. 拷贝编译产物：server/dist、desktop/dist、packages/shared/src
#   4. 用 node apps/server/dist/index.js 启动并跑 scripts/smoke.ps1
#
# 与 Dockerfile 的唯一差异：Windows 宿主没有 libstdc++6 / tini，
# better-sqlite3 的 win32-x64 prebuild 不依赖 libstdc++，故运行时无需额外系统库；
# 容器内 glibc + libstdc++6 的组合已通过静态审查（prebuilds/linux-x64.node 链接
# libstdc++ 与 GLIBCXX_3.4.29），但镜像构建本身未经实机验证。
#
# 用法：powershell -ExecutionPolicy Bypass -File scripts\simulate-runtime.ps1

$repo = Split-Path -Parent $PSScriptRoot
$sim = Join-Path $repo '.runtime-sim'
$simPackages = Join-Path $sim 'packages'
$simApps = Join-Path $sim 'apps'
$simServer = Join-Path $simApps 'server'
$simDesktop = Join-Path $simApps 'desktop'
$simShared = Join-Path $simPackages 'shared'

if (Test-Path $sim) { Remove-Item -Recurse -Force $sim }
New-Item -ItemType Directory -Force $simShared, $simServer, $simDesktop | Out-Null

Write-Host '== 1. 准备 runtime 目录骨架 =='
foreach ($f in @('package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'tsconfig.base.json')) {
  Copy-Item (Join-Path $repo $f) (Join-Path $sim $f) -Force
}
Copy-Item (Join-Path $repo 'packages\shared\package.json') (Join-Path $simShared 'package.json') -Force
Copy-Item (Join-Path $repo 'apps\server\package.json') (Join-Path $simServer 'package.json') -Force
Copy-Item (Join-Path $repo 'apps\desktop\package.json') (Join-Path $simDesktop 'package.json') -Force

Write-Host '== 2. 安装运行期生产依赖（对应 Dockerfile 的 pnpm install --prod --filter @tashkent/server）=='
Push-Location $sim
try {
  & pnpm install --prod --frozen-lockfile --filter '@tashkent/server'
  if ($LASTEXITCODE -ne 0) { throw "pnpm install 失败，exit=$LASTEXITCODE" }
} finally {
  Pop-Location
}

Write-Host '== 3. 拷贝编译产物与共享类型（对应 Dockerfile 的 COPY --from=build）=='
Copy-Item -Recurse -Force (Join-Path $repo 'packages\shared\src') (Join-Path $simShared 'src')
Copy-Item -Recurse -Force (Join-Path $repo 'apps\server\dist') (Join-Path $simServer 'dist')
Copy-Item -Recurse -Force (Join-Path $repo 'apps\desktop\dist') (Join-Path $simDesktop 'dist')

# schema.sql 是运行时读取的资源，由 server 的 build 脚本拷进 dist
$schemaDst = Join-Path $simServer 'dist\db\schema.sql'
if (-not (Test-Path $schemaDst)) { throw "dist 中缺少 schema.sql：$schemaDst" }
Write-Host "   schema.sql -> $schemaDst"

Write-Host '== 4. 启动 runtime 服务 =='
$port = if ($env:SMOKE_PORT) { $env:SMOKE_PORT } else { '8080' }
$env:PORT = $port
$env:HOST = '127.0.0.1'
$env:NODE_ENV = 'production'
$env:WORKSPACE_DIR = 'data/workspace'
$env:ARTIFACTS_DIR = 'data/artifacts'
$env:DB_FILE = 'data/tashkent.db'

$proc = Start-Process -FilePath 'node' -ArgumentList 'apps/server/dist/index.js' `
  -WorkingDirectory $sim -PassThru -NoNewWindow `
  -RedirectStandardOutput (Join-Path $sim 'server.out.log') `
  -RedirectStandardError (Join-Path $sim 'server.err.log')

$base = "http://127.0.0.1:$port"
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Milliseconds 500
  if ($proc.HasExited) { break }
  try {
    $h = Invoke-RestMethod "$base/api/health" -TimeoutSec 3
    if ($h.db.ok -eq $true) { $ready = $true; break }
  } catch { }
}

try {
  if (-not $ready) {
    Write-Host '--- server stdout ---'
    if (Test-Path (Join-Path $sim 'server.out.log')) { Get-Content (Join-Path $sim 'server.out.log') }
    Write-Host '--- server stderr ---'
    if (Test-Path (Join-Path $sim 'server.err.log')) { Get-Content (Join-Path $sim 'server.err.log') }
    throw '服务未在预期时间内就绪'
  }
  Write-Host "   服务已就绪：$base"

  Write-Host '== 5. 运行冒烟脚本 =='
  $env:SMOKE_BASE = $base
  & (Join-Path $repo 'scripts\smoke.ps1')
} finally {
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Write-Host ''
  Write-Host '--- server stdout ---'
  if (Test-Path (Join-Path $sim 'server.out.log')) { Get-Content (Join-Path $sim 'server.out.log') }
}
