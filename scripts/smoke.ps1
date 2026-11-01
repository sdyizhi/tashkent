$ErrorActionPreference = 'Stop'
$base = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { 'http://localhost:8080' }

Write-Host '1) 健康检查'
$health = Invoke-RestMethod "$base/api/health"
if ($health.db.ok -ne $true) { throw '数据库不可用' }
Write-Host "   status=$($health.status) version=$($health.version)"

Write-Host '2) Agent 列表'
$agents = Invoke-RestMethod "$base/api/agents"
if ($agents.agents.Count -lt 1) { throw '没有加载任何 Agent' }
Write-Host "   agents=$($agents.agents.Count)"

Write-Host '3) 工具列表'
$tools = Invoke-RestMethod "$base/api/tools"
Write-Host "   tools=$($tools.tools.Count)"
$dangerous = @($tools.tools | Where-Object { $_.permission -eq 'dangerous' })
Write-Host "   dangerous=$($dangerous.Count)"

Write-Host '4) 创建会话'
$session = Invoke-RestMethod "$base/api/sessions" -Method Post -ContentType 'application/json' -Body '{"agentId":"chat"}'
Write-Host "   sessionId=$($session.id)"

Write-Host '5) SSE 事件流'
# 用 curl.exe 订阅全局事件流：PowerShell 5.1 的 Invoke-WebRequest 不会流式返回，
# 而 Start-Job 里加载 System.Net.Http 需要显式 Add-Type，两者都容易在 CI 上踩坑。
# SSE 是长连接，服务端不会主动结束；Hono 的 streamSSE 会等首个事件才刷出响应头，
# 因此这里先建立订阅，再通过桌面窗口 API 触发一个事件，用「是否收到该事件」判定连通。
# curl 放在后台进程里，避免阻塞当前脚本。
$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if ($curl) {
  $sseOut = Join-Path $env:TEMP 'tashkent-smoke-sse.txt'
  $sseErr = Join-Path $env:TEMP 'tashkent-smoke-sse.err'
  Remove-Item $sseOut, $sseErr -ErrorAction SilentlyContinue
  $sseProc = Start-Process -FilePath 'curl.exe' `
    -ArgumentList @('-sS', '-N', '--max-time', '10', "$base/api/events") `
    -PassThru -NoNewWindow -RedirectStandardOutput $sseOut -RedirectStandardError $sseErr
  Start-Sleep -Seconds 1

  # 触发一个会广播到事件流的桌面事件
  $trigger = Invoke-RestMethod "$base/api/desktop/windows" -Method Post -ContentType 'application/json' -Body '{"appId":"chat"}'
  Write-Host "   触发事件 windowId=$($trigger.id)"

  $received = ''
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Path $sseOut) {
      $received = Get-Content $sseOut -Raw -ErrorAction SilentlyContinue
      if ($received -match 'desktop_window_opened') { break }
    }
  }
  Stop-Process -Id $sseProc.Id -Force -ErrorAction SilentlyContinue

  if ($received -notmatch 'desktop_window_opened') {
    $err = if (Test-Path $sseErr) { Get-Content $sseErr -Raw } else { '' }
    throw "SSE 未收到 desktop_window_opened 事件。收到内容：$received 错误输出：$err"
  }
  Write-Host '   SSE 可建立连接并收到 desktop_window_opened 事件'
} else {
  Write-Warning '未找到 curl.exe，跳过 SSE 连接检查'
}

Write-Host '6) 桌面窗口 API'
$list = Invoke-RestMethod "$base/api/desktop/windows"
if ($list.windows.Count -lt 1) { throw '窗口未创建' }
$win = $list.windows[0]
Write-Host "   windowId=$($win.id) x=$($win.x)"

Write-Host '7) 前端静态资源托管'
$index = Invoke-WebRequest "$base/" -UseBasicParsing
if ($index.StatusCode -ne 200) { throw "根路径未返回前端 index.html，status=$($index.StatusCode)" }
if ($index.Content -notmatch 'Tashkent') { throw '根路径返回的内容不是前端 index.html' }
Write-Host "   GET / -> 200, content-type=$($index.Headers['Content-Type'])"
$asset = [regex]::Match($index.Content, 'src="([^"]+)"').Groups[1].Value
if ($asset) {
  $r = Invoke-WebRequest "$base$asset" -UseBasicParsing
  if ($r.StatusCode -ne 200) { throw "静态资源 $asset 未返回 200" }
  Write-Host "   GET $asset -> $($r.StatusCode)"
}

Write-Host ''
Write-Host 'SMOKE PASSED'
