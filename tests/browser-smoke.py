"""Optional real-browser smoke check. Requires Python Playwright + Chromium.
Run after `npm start`: AX_BASE_URL=http://127.0.0.1:4318 python3 tests/browser-smoke.py
This environment could not launch Chromium; see docs/VERIFICATION.ko.md.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
base=os.environ.get('AX_BASE_URL','http://127.0.0.1:4318')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000})
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(base+'/admin.html')
    page.get_by_role('heading',name='오늘의 운영 현황').wait_for()
    Path('screenshots').mkdir(exist_ok=True)
    page.screenshot(path='screenshots/admin-dashboard.png',full_page=True)
    page.get_by_role('button',name='프로젝트 등록',exact=True).click()
    page.get_by_label('프로젝트명 *',exact=True).fill('가상 브라우저 QA 프로젝트')
    page.get_by_label('고객사명 *',exact=True).fill('가상 QA 고객사')
    page.get_by_label('가상 프로젝트로 표시',exact=True).check()
    page.get_by_role('button',name='저장',exact=True).click()
    page.get_by_role('heading',name='가상 브라우저 QA 프로젝트',exact=True).wait_for()
    page.reload()
    page.get_by_role('heading',name='가상 브라우저 QA 프로젝트',exact=True).wait_for()
    page.get_by_role('button',name='정보 수정',exact=True).click()
    page.get_by_role('button',name='취소',exact=True).click()
    assert page.locator('dialog[open]').count()==0
    page.get_by_role('button',name='프로젝트 삭제',exact=True).click()
    page.get_by_role('button',name='삭제',exact=True).click()
    page.get_by_role('heading',name='프로젝트',exact=True).wait_for()
    for width in [1440,1024,768,390]:
        page.set_viewport_size({'width':width,'height':900})
        for route in ['dashboard','projects','compare','suppliers','crm','programs','investments','tasks','settings']:
            page.goto(base+'/admin.html#'+route)
            page.locator('.page-head').wait_for()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(route,width)
    page.goto(base+'/admin.html#dashboard')
    page.screenshot(path='screenshots/mobile-dashboard.png',full_page=True)
    for route in ['/buyer.html','/supplier.html','/signup.html']:
        page.goto(base+route)
        page.wait_for_load_state('networkidle')
        assert page.locator('body').inner_text().strip()
    assert not errors,errors
    browser.close()
print('Browser smoke passed: CRUD/reload/cancel, routes, viewport overflow, portals')
