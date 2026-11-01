# verify_visual.py — 视觉验证：真实渲染 XP 桌面并截图
import asyncio
import os
import subprocess
import sys
import time
import urllib.request
from playwright.async_api import async_playwright

ROOT = r'd:\TraeSOLO\tashkent'
OUT = os.path.join(ROOT, 'assets', 'shots')
os.makedirs(OUT, exist_ok=True)


def wait(url, timeout=30):
    for _ in range(int(timeout * 4)):
        try:
            urllib.request.urlopen(url, timeout=1).read()
            return True
        except Exception:
            time.sleep(0.25)
    return False


async def main():
    server = subprocess.Popen(
        [sys.executable, '-c',
         "import http.server,functools,os;"
         "os.chdir(r'd:\\TraeSOLO\\tashkent\\apps\\desktop\\dist');"
         "http.server.HTTPServer(('127.0.0.1',8799),"
         "functools.partial(http.server.SimpleHTTPRequestHandler)).serve_forever()"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    api = subprocess.Popen(
        ['node', os.path.join(ROOT, 'apps', 'server', 'dist', 'index.js')],
        cwd=os.path.join(ROOT, 'apps', 'server'),
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        if not wait('http://127.0.0.1:8799/'):
            print('静态服务未就绪')
            return
        if not wait('http://localhost:8080/api/health'):
            print('后端未就绪')
            return

        async with async_playwright() as p:
            browser = await p.chromium.launch()
            page = await browser.new_page(viewport={"width": 1280, "height": 800},
                                          device_scale_factor=2)
            # SSE 长连接会让 networkidle 永不触发，改用 domcontentloaded
            await page.goto('http://localhost:8080/', wait_until='domcontentloaded')
            await page.wait_for_timeout(3000)

            await page.screenshot(path=os.path.join(OUT, '01-desktop.png'))

            # 双击「对话」图标开窗口
            icon = page.get_by_test_id('desktop-icon-chat')
            if await icon.count() > 0:
                await icon.dblclick()
                await page.wait_for_timeout(1200)
                await page.screenshot(path=os.path.join(OUT, '02-chat-window.png'))

            # 开始菜单
            start = page.get_by_test_id('start-button')
            if await start.count() > 0:
                await start.click()
                await page.wait_for_timeout(700)
                await page.screenshot(path=os.path.join(OUT, '03-start-menu.png'))
                await page.keyboard.press('Escape')
                await page.mouse.click(640, 400)
                await page.wait_for_timeout(400)

            # 打开「我的文档」窗口
            files = page.get_by_test_id('desktop-icon-files')
            if await files.count() > 0:
                await files.dblclick()
                await page.wait_for_timeout(1200)
                await page.screenshot(path=os.path.join(OUT, '04-files-window.png'))

            print('截图完成 ->', OUT)
            print('页面标题:', await page.title())
            await browser.close()
    finally:
        for proc in (server, api):
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()


asyncio.run(main())
