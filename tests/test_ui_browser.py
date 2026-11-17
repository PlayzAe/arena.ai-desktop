"""Opt-in browser integration tests. Run with RUN_BROWSER_TESTS=1 python -m pytest tests/test_ui_browser.py.
Requires Playwright and its Chromium runtime; no live Arena account is used.
"""
import json
import os
import threading
import pytest

pytestmark = pytest.mark.skipif(os.environ.get('RUN_BROWSER_TESTS') != '1', reason='optional browser tests')


@pytest.fixture(scope='module')
def site():
    from werkzeug.serving import make_server
    from arena.web.app import app, load_config, save_config
    cfg = load_config()
    cfg['setup_done'] = True
    save_config(cfg)
    server = make_server('127.0.0.1', 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f'http://127.0.0.1:{server.server_port}'
    server.shutdown()
    thread.join(timeout=3)


def choose_mode(page, label):
    page.locator('#modeButton').click()
    page.locator('.popover-menu .popover-option', has_text=label).first.click()
    page.wait_for_function(
        "(label) => document.querySelector('#modeLabel')?.textContent.trim() === label",
        arg=label, timeout=10000)


def choose_modality(page, label):
    page.locator('#modalityButton').click()
    page.locator('.popover-menu .popover-option', has_text=label).first.click()
    page.wait_for_function(
        "(label) => document.querySelector('#modalityLabel')?.textContent.trim() === label",
        arg=label, timeout=10000)


def current_mode(page):
    return page.locator('#modeLabel').inner_text().strip()


def current_modality(page):
    return page.locator('#modalityLabel').inner_text().strip()


def test_demo_and_real_history_contract(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1300, 'height': 900})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')
        assert 'Demo mode' in page.locator('body').inner_text()
        page.locator('#prompt').fill('Hello, demo')
        page.locator('#prompt').press('Enter')
        page.wait_for_timeout(3500)
        assert 'Hello, demo' in page.locator('body').inner_text()
        assert not errors
        page.close()

        page = browser.new_page(viewport={'width': 1300, 'height': 900})
        page.on('pageerror', lambda err: errors.append(str(err)))
        chat_id = '12345678-1234-1234-1234-123456789abc'
        messages = [
            {'role': 'user', 'text': 'Historical question'},
            {'role': 'assistant', 'text': 'Saved answer A', 'text_b': 'Saved answer B',
             'names': {'a': 'Model One', 'b': 'Model Two'},
             'tools': [{'lane': 'b', 'tool': 'read_file', 'summary': 'Read sample.txt', 'status': 'ok', 'ok': True}]},
        ]
        chat = {'id': chat_id, 'title': 'Test chat', 'mode': 'side-by-side', 'modality': 'text',
                'model_a': 'm1', 'model_b': 'm2', 'messages': messages}
        def api(route):
            path = route.request.url.split('?', 1)[0].split('/api/', 1)[1]
            values = {
                'status': {'authenticated': True, 'mode': 'side-by-side', 'modality': 'text', 'desktop': True,
                           'permission_mode': 'default', 'workspace': 'C:\\test'},
                'chats': [chat], 'chats/' + chat_id: chat, 'history': messages,
                'models': [{'id': 'm1', 'name': 'Model One'}, {'id': 'm2', 'name': 'Model Two'}],
                'permissions': [], 'permission-mode': {'ok': True, 'mode': 'default'},
                'workspace': {'workspace': 'C:\\test', 'projects': []},
            }
            if path == 'chat' and route.request.method == 'POST':
                body = route.request.post_data_json
                assert (body['model_id'], body['model_id_b'], body['chat_id']) == ('m1', 'm2', chat_id)
                events = [
                    {'type': 'meta', 'chat_id': chat_id, 'dual': True, 'names': {'a': 'Model One', 'b': 'Model Two'}},
                    {'type': 'text', 'model': 'a', 'text': 'Stream A'},
                    {'type': 'text', 'model': 'b', 'text': 'Stream B'},
                    {'type': 'done', 'text_a': 'Stream A', 'text_b': 'Stream B', 'chat_id': chat_id},
                ]
                stream = ''.join('data: ' + json.dumps(event, ensure_ascii=False) + '\n\n' for event in events)
                return route.fulfill(status=200, content_type='text/event-stream; charset=utf-8', body=stream)
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(values.get(path, {'ok': True})))
        page.route('**/api/**', api)
        page.goto(site, wait_until='networkidle')
        page.get_by_role('button', name='Open chat: Test chat').click()
        page.get_by_text('Saved answer A').wait_for()
        page.get_by_text('Saved answer B').wait_for()
        body = page.locator('body').inner_text()
        assert 'Model One' in body and 'Model Two' in body and 'Read' in body
        page.locator('#prompt').fill('Stream check')
        page.locator('#prompt').press('Enter')
        page.get_by_text('Stream A').wait_for(timeout=10000)
        page.get_by_text('Stream B').wait_for(timeout=10000)
        assert not errors
        browser.close()


def test_supported_selection_matrix_in_demo(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1300, 'height': 900})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        def modality_option(name):
            return page.locator('.popover-menu .popover-option', has_text=name)

        # The old segmented bars are gone; Arena-style dropdowns are used.
        assert page.locator('#modeBar').count() == 0
        assert page.locator('#modalityBar').count() == 0
        assert current_mode(page) == 'Direct'

        # Video and Auto are Battle-only and are not offered for Direct.
        page.locator('#modalityButton').click()
        assert modality_option('Video').count() == 0
        assert modality_option('Auto').count() == 0
        page.keyboard.press('Escape')

        # In Battle both appear, and Video has no manual model picker.
        choose_mode(page, 'Battle Mode')
        page.locator('#modalityButton').click()
        assert modality_option('Video').first.is_enabled()
        assert modality_option('Auto').first.is_enabled()
        page.keyboard.press('Escape')
        choose_modality(page, 'Video')
        assert page.locator('[data-model-picker]').count() == 0
        assert page.locator('#modelsNavBtn').is_disabled()

        # Agent can be picked directly from Battle + Video: there is no
        # "choose Text first" ordering error. The work-type selector hides.
        choose_mode(page, 'Agent Mode')
        assert page.locator('#modalityButton').is_hidden()
        assert page.locator('.model-pill-auto').count() == 0
        assert page.locator('.agent-kind-switch').count() == 0
        assert 'Auto' not in page.locator('#modelStrip').inner_text()
        assert 'Max Router' not in page.locator('#modelStrip').inner_text()
        assert page.locator('[data-model-picker]').count() == 0
        assert page.locator('#modelsNavBtn').is_disabled()

        # Leaving Agent restores the pre-Agent work type (Video in Battle).
        choose_mode(page, 'Battle Mode')
        assert page.locator('#modalityButton').is_visible()
        assert current_modality(page) == 'Video'
        assert not errors
        browser.close()


def test_login_window_and_cookie_ui(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])

        def run_case(cookie_case=False):
            page = browser.new_page(viewport={'width': 1300, 'height': 900})
            errors, login_bodies = [], []
            state = {'authenticated': False, 'polls': 0, 'window_open': False}
            email = 'cookie@example.test' if cookie_case else 'window@example.test'
            page.on('pageerror', lambda err: errors.append(str(err)))

            def fulfill(route, value, status=200):
                return route.fulfill(status=status, content_type='application/json',
                                     body=json.dumps(value, ensure_ascii=False))

            def api(route):
                path = route.request.url.split('?', 1)[0].split('/api/', 1)[1]
                if path == 'status':
                    return fulfill(route, {
                        'authenticated': state['authenticated'],
                        'email': email if state['authenticated'] else None,
                        'mode': 'direct', 'modality': 'text', 'desktop': True,
                        'engine': {'open': state['window_open'], 'separate_window': True, 'ready': True},
                        'permission_mode': 'default', 'workspace': 'C:\\test', 'pending_permissions': 0,
                    })
                if path == 'login' and route.request.method == 'POST':
                    body = route.request.post_data_json or {}
                    login_bodies.append(body)
                    if body.get('method') == 'window':
                        state['window_open'] = True
                        return fulfill(route, {'ok': True, 'pending': True})
                    if body.get('method') == 'manual':
                        state['authenticated'] = True
                        return fulfill(route, {'ok': True, 'email': email})
                if path == 'login/poll':
                    state['polls'] += 1
                    if state['polls'] < 2:
                        return fulfill(route, {'ok': False, 'done': False, 'hint': 'waiting'})
                    state['authenticated'] = True
                    state['window_open'] = False  # the native window hides itself on success
                    return fulfill(route, {'ok': True, 'done': True, 'email': email})
                values = {
                    'chats': [], 'models': [{'id': 'm1', 'name': 'Model One'}],
                    'permissions': [], 'permission-mode': {'ok': True, 'mode': 'default'},
                    'workspace': {'workspace': 'C:\\test', 'projects': []},
                }
                return fulfill(route, values.get(path, {'ok': True}))

            page.route('**/api/**', api)
            page.goto(site, wait_until='networkidle')
            assert page.locator('#dockPane').is_hidden()
            page.locator('#accountButton').click()
            page.locator('.account-menu').wait_for()
            page.get_by_role('button', name='Sign in', exact=True).click()
            if cookie_case:
                page.get_by_role('button', name='Use cookies', exact=True).click()
                cookie_text = ('arena-auth-prod-v1.0\tfake-a\tarena.ai\t/\n'
                               'arena-auth-prod-v1.1\tfake-b\tarena.ai\t/')
                field = page.locator('textarea[aria-label="Arena cookies"]')
                field.fill(cookie_text)
                page.get_by_role('button', name='Sign in with cookies', exact=True).click()
                assert login_bodies[-1] == {'method': 'manual', 'cookie': cookie_text}
            else:
                page.get_by_role('button', name='Sign-in window', exact=True).click()
                assert login_bodies[-1] == {'method': 'window'}
            page.locator('#accountName', has_text=email).wait_for(timeout=10000)
            assert page.locator('#dockPane').is_hidden()
            assert not errors
            page.close()
            return state

        window_state = run_case(cookie_case=False)
        assert window_state['polls'] >= 2 and window_state['window_open'] is False
        run_case(cookie_case=True)
        browser.close()


def test_v4_workspace_connectors_cloud_chats_and_agent_reasoning(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        # This scenario exercises the local Agent loop (v4.2 defaults Agent to
        # the native Arena Agent handover).
        page.add_init_script("localStorage.setItem('ap-agent-kind', 'local')")
        page.goto(site + '/?demo=1', wait_until='networkidle')

        assert page.locator('#stopButton').is_hidden()
        assert page.locator('#workspacePanel').is_visible()
        page.locator('#workspaceTree').get_by_text('README.md').wait_for()
        page.locator('#workspaceTree').get_by_text('README.md').click()
        page.locator('.file-preview-markdown').get_by_text('The real local folder was not read').wait_for()
        page.get_by_role('button', name='Close', exact=True).click()
        page.locator('#connectorList').get_by_text('filesystem').first.wait_for()

        sidebar = page.locator('#chatList').inner_text()
        assert 'Recent' in sidebar and 'Only on arena.ai' in sidebar
        assert page.locator('.cloud-chat-badge').count() == 0
        assert 'Dialogue from the arena.ai website · demo' in sidebar

        def option(name):
            return page.locator('.popover-option', has_text=name).first

        choose_mode(page, 'Agent Mode')
        assert page.locator('.model-pill-auto').count() == 0
        page.locator('#prompt').fill('Check the project in demo')
        page.locator('#prompt').press('Enter')
        reasoning = page.locator('.reasoning-content').last
        reasoning.wait_for(state='attached', timeout=10000)
        expected = ('Demo mode: response and events are generated locally. '
                    'No real request to the models was sent.')
        page.wait_for_function(
            "(expected) => [...document.querySelectorAll('.reasoning-content')].some((el) => el.textContent === expected)",
            arg=expected, timeout=10000,
        )

        page.get_by_role('button', name='Deny').last.click()
        page.locator('#stopButton').wait_for(state='hidden', timeout=15000)
        assert not errors
        browser.close()


def test_v41_stale_status_cannot_flip_agent_back_to_direct(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors, chat_bodies, mode_posts = [], [], []
        page.on('pageerror', lambda err: errors.append(str(err)))
        chat_id = '12345678-1234-1234-1234-123456789abc'

        def fulfill(route, value, status=200):
            return route.fulfill(status=status, content_type='application/json',
                                 body=json.dumps(value, ensure_ascii=False))

        def api(route):
            url = route.request.url
            path = url.split('?', 1)[0].split('/api/', 1)[1]
            if path == 'status':
                # Stale by design: status keeps reporting Direct even after the
                # user picked Agent (slow/raced status answers on desktop).
                return fulfill(route, {
                    'authenticated': True, 'email': 'race@example.test',
                    'mode': 'direct', 'modality': 'auto', 'desktop': True,
                    'engine': {'open': False, 'ready': True},
                    'permission_mode': 'default', 'workspace': 'C:\\test',
                    'pending_permissions': 0, 'generating': False})
            if path == 'mode' and route.request.method == 'POST':
                body = route.request.post_data_json or {}
                mode_posts.append(body.get('mode'))
                return fulfill(route, {'ok': True, 'mode': body.get('mode', 'battle')})
            if path == 'modality' and route.request.method == 'POST':
                body = route.request.post_data_json or {}
                return fulfill(route, {'ok': True, 'modality': body.get('modality', 'text')})
            if path == 'models':
                if 'mode=agent' in url or 'mode=battle' in url:
                    return fulfill(route, [])
                return fulfill(route, [{'id': 'm1', 'name': 'Argon Test Model'},
                                       {'id': 'm2', 'name': 'Model Two'}])
            if path == 'new' and route.request.method == 'POST':
                return fulfill(route, {'ok': True, 'chat_id': chat_id})
            if path == 'chat' and route.request.method == 'POST':
                chat_bodies.append(route.request.post_data_json or {})
                events = [
                    {'type': 'meta', 'chat_id': chat_id, 'dual': False, 'mode': 'agent',
                     'names': {'a': 'Agent', 'b': None}},
                    {'type': 'text', 'model': 'a', 'text': 'Agent answer after the race'},
                    {'type': 'done', 'text_a': 'Agent answer after the race', 'text_b': '', 'chat_id': chat_id},
                ]
                stream = ''.join('data: ' + json.dumps(e, ensure_ascii=False) + '\n\n' for e in events)
                return route.fulfill(status=200, content_type='text/event-stream; charset=utf-8', body=stream)
            if path == 'arena-connectors':
                return fulfill(route, {'ok': True, 'connectors': [
                    {'slug': 'github', 'name': 'GitHub', 'description': 'Repos', 'logo_url': None,
                     'auth_status': 'disconnected', 'connected': False},
                    {'slug': 'notion', 'name': 'Notion', 'description': 'Docs', 'logo_url': None,
                     'auth_status': 'connected', 'connected': True}]})
            if path == 'connectors':
                return fulfill(route, {'ok': True, 'config_path': 'C:\\test\\mcp.json',
                                       'config_error': None, 'servers': [], 'presets': [],
                                       'transports': {'stdio': True, 'http': False}})
            values = {
                'chats': [], 'history': [], 'permissions': [],
                'permission-mode': {'ok': True, 'mode': 'default'},
                'workspace': {'workspace': 'C:\\test', 'projects': []},
                'arena-chats': {'ok': True, 'entries': []},
                'workspace/tree': {'root': 'C:\\test', 'entries': []},
            }
            return fulfill(route, values.get(path, {'ok': True}))

        page.route('**/api/**', api)
        # The race regression targets the local Agent send path (v4.2 defaults
        # Agent to the native Arena Agent handover).
        page.add_init_script("localStorage.setItem('ap-agent-kind', 'local')")
        page.goto(site, wait_until='networkidle')
        page.wait_for_function("document.querySelector('#modeLabel')?.textContent.trim() === 'Direct'", timeout=10000)

        page.locator('#connectorList').get_by_text('GitHub').first.wait_for()
        panel = page.locator('#connectorList').inner_text()
        assert 'arena connectors' in panel.lower()
        assert 'Notion' in panel and 'Connected to account' in panel

        def option(name):
            return page.locator('.popover-option', has_text=name).first

        choose_mode(page, 'Agent Mode')
        assert page.locator('.model-pill-auto').count() == 0

        # The Settings window no longer has a manual refresh button; the app
        # still refreshes status by itself (after sends, engine changes...).
        # Those answers keep reporting Direct and must not flip the picker.
        page.wait_for_timeout(500)
        assert current_mode(page) == 'Agent Mode'

        page.locator('#prompt').fill('Do the task as an agent')
        page.locator('#prompt').press('Enter')
        page.get_by_text('Agent answer after the race').wait_for(timeout=10000)
        assert mode_posts == ['agent']
        assert chat_bodies and chat_bodies[-1].get('mode') == 'agent'
        assert chat_bodies[-1].get('modality') == 'text'
        assert 'model_id' not in chat_bodies[-1] and 'model_id_b' not in chat_bodies[-1]
        # The post-send status refresh (still stale Direct) must not flip back.
        page.wait_for_timeout(1200)
        assert current_mode(page) == 'Agent Mode'
        assert not errors
        browser.close()


def test_v41_demo_arena_connectors_connect_flow(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')
        page.locator('#connectorList').get_by_text('GitHub').first.wait_for()
        assert 'Drive' in page.locator('#connectorList').inner_text()
        assert 'Supabase' in page.locator('#connectorList').inner_text()

        row = page.locator('.arena-connector-row', has_text='Notion')
        row.get_by_role('button', name='Connect').click()
        row.get_by_text('Connected to account').wait_for(timeout=10000)

        page.locator('#addConnectorButton').click()
        page.get_by_role('heading', name='Official Arena connectors').wait_for()
        page.get_by_role('heading', name='Ready local MCP servers').wait_for()
        page.keyboard.press('Escape')
        assert not errors
        browser.close()


def test_v42_demo_agent_kinds_and_direct_tools_toggle(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        page.locator('#modeButton').wait_for()
        assert page.locator('#modeBar').count() == 0
        assert page.locator('.status-bar').count() == 0

        # Agent shows no model pill and no backend switch in the composer
        # (arena.ai/agent look); the default backend for NEW chats lives in
        # Settings -> Permissions.
        choose_mode(page, 'Agent Mode')
        assert page.locator('.agent-kind-switch').count() == 0
        assert page.locator('.model-pill-auto').count() == 0
        assert page.locator('#modelStrip').inner_text().strip() == ''

        page.get_by_role('button', name='Settings', exact=True).first.click()
        page.locator('#settings-tab-permissions').click()
        page.get_by_text('Agent for new chats').wait_for()
        native_radio = page.locator('input[name="agent-kind"][value="native"]')
        local_radio = page.locator('input[name="agent-kind"][value="local"]')
        assert native_radio.is_checked()
        page.locator('label.radio-card', has_text='Local Agent').click()
        assert local_radio.is_checked()
        page.locator('label.radio-card', has_text='cloud workspace').click()
        assert native_radio.is_checked()
        page.keyboard.press('Escape')

        page.locator('#prompt').fill('Task for the native agent')
        page.locator('#prompt').press('Enter')
        # Native kind now streams in-app (demo stream), no site handover.
        page.get_by_text('interface simulation').first.wait_for(timeout=10000)
        assert page.locator('#prompt').input_value() == ''
        # The demo agent then waits on a permission card; let it finish.
        page.get_by_role('button', name='Allow once').click(timeout=10000)
        page.locator('#stopButton').wait_for(state='hidden', timeout=20000)

        # Like on arena.ai, the mode menu stays usable in a started chat:
        # picking another mode opens a new chat in that mode.
        assert page.locator('#modeButton').is_enabled()
        choose_mode(page, 'Direct')
        page.wait_for_function("document.querySelectorAll('.message-turn').length === 0", timeout=5000)
        # Workspace Sync: the switch next to the permission chip controls
        # whether Direct gets the folder-tools loop on this computer, and it
        # is visible right away (not only after a mode is picked).
        chip = page.locator('#workspaceSyncChip')
        chip.wait_for(state='visible')
        assert 'Workspace Sync' in chip.inner_text()
        assert page.locator('#workspaceSyncToggle').is_checked()
        chip.click()
        page.wait_for_function(
            "() => !document.querySelector('#workspaceSyncToggle').checked", timeout=5000)
        chip.click()
        page.wait_for_function(
            "() => document.querySelector('#workspaceSyncToggle').checked", timeout=5000)
        # The switch stays in the toolbar in Agent Mode too.
        choose_mode(page, 'Agent Mode')
        chip.wait_for(state='visible')
        assert page.locator('#workspaceSyncToggle').is_checked()
        assert not errors
        browser.close()


def test_v46_demo_battle_vote_reveals_models_and_locks_chat(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1400, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        choose_mode(page, 'Battle Mode')
        page.locator('#prompt').fill('Which answer is better in the demo?')
        page.locator('#prompt').press('Enter')

        # The vote bar appears once both lanes are complete.
        page.locator('.vote-bar').wait_for(timeout=30000)
        assert page.locator('.vote-btn', has_text='A is better').is_enabled()

        # Mode/work-type menus stay available (they open a new chat).
        assert page.locator('#modeButton').is_enabled()
        assert page.locator('#modalityButton').is_enabled()

        page.locator('.vote-btn', has_text='A is better').click()
        page.locator('.vote-bar.is-done').wait_for(timeout=10000)
        assert 'Demo model A' in page.locator('.assistant-lane').first.inner_text()
        assert page.locator('.lane-winner', has_text='best').count() == 1
        assert not errors
        browser.close()


def test_v461_new_chat_unlocks_model_selection_without_typing(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1400, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        page.wait_for_function("document.querySelector('#modeLabel')?.textContent.trim() === 'Direct'", timeout=10000)
        page.locator('#prompt').fill('First chat to check locking')
        page.locator('#prompt').press('Enter')
        page.get_by_text('Demonstration Response').wait_for(timeout=30000)
        page.locator('#stopButton').wait_for(state='hidden', timeout=30000)

        # Direct may swap models between messages, like on arena.ai.
        assert page.locator('[data-model-picker]').first.is_enabled()
        assert page.locator('#modelsNavBtn').is_enabled()

        # ...but a freshly created chat must be editable immediately, before
        # the user types into the composer or clicks anywhere else.
        page.locator('#newChatBtn').click()
        page.wait_for_timeout(300)
        assert page.locator('[data-model-picker]').first.is_enabled()
        assert page.locator('#modelsNavBtn').is_enabled()
        page.locator('[data-model-picker]').first.click()
        page.locator('.popover-option').first.wait_for(timeout=10000)
        assert page.locator('.popover-option').count() > 0
        page.keyboard.press('Escape')

        # Work type inside a started chat: arena.ai asks, then opens a new chat.
        page.locator('#prompt').fill('Second chat to check the work type rule')
        page.locator('#prompt').press('Enter')
        page.wait_for_function("document.querySelectorAll('.message-turn').length >= 1", timeout=30000)
        page.locator('#stopButton').wait_for(state='hidden', timeout=30000)
        page.locator('#modalityButton').click()
        page.locator('.popover-menu .popover-option', has_text='Code').first.click()
        page.get_by_text('Start new chat session?').wait_for(timeout=5000)
        assert 'Your current session will be saved in your chat history.' in page.locator('.modal-copy').first.inner_text()
        page.get_by_role('button', name='Continue').click()
        page.wait_for_function("document.querySelector('#modalityLabel')?.textContent.trim() === 'Code'", timeout=10000)
        page.wait_for_function("document.querySelectorAll('.message-turn').length === 0", timeout=5000)
        # First Code message with Workspace Sync unable to save files: explain and ask.
        page.locator('#workspaceSyncChip').click()
        page.wait_for_function("() => !document.querySelector('#workspaceSyncToggle').checked", timeout=5000)
        page.locator('#prompt').fill('Build a landing page')
        page.locator('#prompt').press('Enter')
        page.get_by_text('Save the generated files on this computer?').wait_for(timeout=5000)
        page.get_by_role('button', name='Cancel').click()
        assert not errors
        browser.close()


def test_v462_ui_cleanup_and_workspace_cards(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        # Tiny composer/footer captions and the dead shortcut chip are gone.
        assert page.locator('.composer-hint').count() == 0
        assert page.locator('.status-bar').count() == 0
        assert page.locator('.new-chat-key').count() == 0
        assert 'Ctrl N' not in page.locator('#newChatBtn').inner_text()

        # The standalone left-nav Connectors button is gone; connector/MCP
        # management remains inside the Workspace panel.
        assert page.locator('#connectorsNavBtn').count() == 0

        legal = page.locator('.sidebar-legal a')
        assert [legal.nth(i).inner_text() for i in range(legal.count())] == [
            'Terms of Use', 'Privacy Policy', 'Cookies'
        ]
        assert 'terms-of-use' in (legal.nth(0).get_attribute('href') or '')
        assert 'privacy-policy' in (legal.nth(1).get_attribute('href') or '')
        assert 'cookie-policy' in (legal.nth(2).get_attribute('href') or '')

        if not page.locator('#workspacePanel').is_visible():
            page.locator('#workspacePanelNavBtn').click()
        page.locator('.workspace-card').wait_for(timeout=10000)
        page.locator('.workspace-tree-root').wait_for(timeout=10000)
        assert page.locator('#workspaceTree .workspace-tree-size').count() == 0
        assert page.locator('#connectorsPane').is_visible()
        assert page.locator('#addConnectorButton').is_visible()
        assert not errors
        browser.close()


def test_v47_resize_layout_and_local_mcp_add(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        assert page.locator('#accountName').inner_text().strip() == 'Demo User'
        if not page.locator('#workspacePanel').is_visible():
            page.locator('#workspacePanelNavBtn').click()
        page.locator('#sidebarResize').wait_for()
        page.locator('#workspaceResize').wait_for()
        page.locator('#workspaceSplitResize').wait_for()

        before = page.evaluate(
            "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'))")
        box = page.locator('#sidebarResize').bounding_box()
        assert box
        page.mouse.move(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
        page.mouse.down()
        page.mouse.move(box['x'] + box['width'] / 2 + 54, box['y'] + box['height'] / 2, steps=8)
        page.mouse.up()
        page.wait_for_timeout(500)
        after = page.evaluate(
            "parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width'))")
        assert after > before
        saved = page.evaluate("JSON.parse(localStorage.getItem('arenaDesktop.layout.v1') || '{}')")
        assert saved.get('sidebarWidth') == after

        add = page.locator('.connector-group-row button', has_text='Add').first
        add.wait_for(timeout=10000)
        add.click()
        page.get_by_role('heading', name='Add MCP server').wait_for(timeout=10000)
        modal = page.locator('.modal').inner_text()
        assert 'Playwright' in modal and 'CLI command' in modal and 'JSON' in modal
        page.keyboard.press('Escape')
        assert not errors
        browser.close()


def test_v47_battle_lane_error_avatar_and_model_logo(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors, chat_bodies = [], []
        page.on('pageerror', lambda err: errors.append(str(err)))
        chat_id = '12345678-1234-1234-1234-123456789abc'
        avatar = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

        def fulfill(route, value, status=200):
            return route.fulfill(status=status, content_type='application/json',
                                 body=json.dumps(value, ensure_ascii=False))

        def api(route):
            url = route.request.url
            path = url.split('?', 1)[0].split('/api/', 1)[1]
            if path == 'status':
                return fulfill(route, {
                    'authenticated': True, 'email': 'casey@example.test',
                    'full_name': 'Casey Example', 'avatar_url': avatar,
                    'mode': 'battle', 'modality': 'text', 'desktop': True,
                    'engine': {'open': False, 'ready': True},
                    'permission_mode': 'default', 'workspace': 'C:\\test',
                    'pending_permissions': 0, 'generating': False,
                    'app_version': '5.5.0'})
            if path == 'mode' and route.request.method == 'POST':
                body = route.request.post_data_json or {}
                return fulfill(route, {'ok': True, 'mode': body.get('mode', 'battle'), 'modality': 'text'})
            if path == 'modality' and route.request.method == 'POST':
                body = route.request.post_data_json or {}
                return fulfill(route, {'ok': True, 'modality': body.get('modality', 'text')})
            if path == 'models':
                if 'mode=direct' in url:
                    return fulfill(route, [{'id': 'gpt-test', 'name': 'GPT Test', 'org': 'OpenAI'}])
                return fulfill(route, [])
            if path == 'new' and route.request.method == 'POST':
                return fulfill(route, {'ok': True, 'chat_id': chat_id})
            if path == 'chat' and route.request.method == 'POST':
                chat_bodies.append(route.request.post_data_json or {})
                events = [
                    {'type': 'meta', 'chat_id': chat_id, 'dual': True, 'mode': 'battle',
                     'modality': 'text', 'names': {'a': None, 'b': None}},
                    {'type': 'error', 'code': 'model', 'model': 'a', 'retry': True,
                     'message': 'Model A stopped with an error: account rate limit'},
                    {'type': 'text', 'model': 'b', 'text': 'Surviving Battle answer'},
                    {'type': 'done', 'text_a': '', 'text_b': 'Surviving Battle answer',
                     'dual': True, 'chat_id': chat_id},
                ]
                stream = ''.join('data: ' + json.dumps(e, ensure_ascii=False) + '\n\n' for e in events)
                return route.fulfill(status=200, content_type='text/event-stream; charset=utf-8', body=stream)
            if path == 'arena-connectors':
                return fulfill(route, {'ok': True, 'connectors': [
                    {'slug': 'github', 'name': 'GitHub', 'description': 'Repos', 'logo_url': None,
                     'auth_status': 'connected', 'connected': True}]})
            if path == 'connectors':
                return fulfill(route, {'ok': True, 'config_path': 'C:\\test\\mcp.json',
                                       'config_error': None, 'servers': [], 'presets': [],
                                       'transports': {'stdio': True, 'http': False}})
            values = {
                'chats': [], 'history': [], 'permissions': [], 'settings': {'settings': {}},
                'permission-mode': {'ok': True, 'mode': 'default'},
                'workspace': {'workspace': 'C:\\test', 'projects': []},
                'arena-chats': {'ok': True, 'entries': []},
                'workspace/tree': {'root': 'C:\\test', 'entries': []},
            }
            return fulfill(route, values.get(path, {'ok': True}))

        page.route('**/api/**', api)
        page.goto(site, wait_until='networkidle')
        page.wait_for_function("document.querySelector('#modeLabel')?.textContent.trim() === 'Battle Mode'", timeout=10000)
        assert page.locator('#accountName').inner_text().strip() == 'Casey Example'
        page.locator('#accountAvatar img').wait_for(timeout=10000)

        page.locator('#prompt').fill('Compare answers')
        page.locator('#prompt').press('Enter')
        page.get_by_text('Surviving Battle answer').wait_for(timeout=10000)
        page.locator('#stopButton').wait_for(state='hidden', timeout=10000)
        lanes = page.locator('.assistant-lane')
        assert lanes.count() == 2
        assert 'account rate limit' in lanes.nth(0).inner_text()
        assert 'Surviving Battle answer' in lanes.nth(1).inner_text()
        assert 'account rate limit' not in lanes.nth(1).inner_text()
        body = page.locator('body').inner_text()
        assert 'interrupted by an error in another answer' not in body
        assert chat_bodies and chat_bodies[-1].get('mode') == 'battle'

        # A new Direct chat uses the OpenAI organization logo in the model pill.
        page.locator('#newChatBtn').click()
        choose_mode(page, 'Direct')
        page.locator('[data-model-picker] .model-org-logo').first.wait_for(timeout=10000)
        assert not errors
        browser.close()


def test_v48_attachments_minimal_menus_and_settings(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        # The removed chrome stays removed.
        assert page.locator('#connectionPill').count() == 0
        assert page.locator('#artifactsButton').count() == 0

        # Attach an image in Battle/Text: chip appears, then the sent user
        # message shows the image.
        png = (b'\x89PNG\r\n\x1a\n' + b'\x00' * 64)
        page.locator('#fileInput').set_input_files(
            {'name': 'cat.png', 'mimeType': 'image/png', 'buffer': png})
        page.locator('.attachment-chip', has_text='cat.png').wait_for()
        page.locator('.attachment-chip .mini-spinner').wait_for(state='detached', timeout=10000)
        page.locator('#prompt').fill('What is in this image?')
        page.locator('#prompt').press('Enter')
        page.locator('.user-attachment-image').first.wait_for(timeout=10000)
        page.locator('#stopButton').wait_for(state='hidden', timeout=30000)

        # New chat: markdown is refused in Battle, accepted in Agent Mode.
        page.locator('#newChatBtn').click()
        page.wait_for_timeout(400)
        page.locator('#fileInput').set_input_files(
            {'name': 'notes.md', 'mimeType': 'text/markdown', 'buffer': b'# notes'})
        page.wait_for_timeout(700)
        assert page.locator('.attachment-chip').count() == 0
        choose_mode(page, 'Agent Mode')
        page.locator('#fileInput').set_input_files(
            {'name': 'notes.md', 'mimeType': 'text/markdown', 'buffer': b'# notes'})
        page.locator('.attachment-chip', has_text='notes.md').wait_for()
        page.locator('.attachment-chip .mini-spinner').wait_for(state='detached', timeout=10000)
        page.locator('.attachment-remove').first.click()
        assert page.locator('.attachment-chip').count() == 0

        # Minimalist workspace + permissions menus (same list as the modes).
        page.locator('#workspaceButton').click()
        page.locator('.popover-menu .popover-option', has_text='Change folder').first.wait_for()
        page.keyboard.press('Escape')
        page.locator('#permissionButton').click()
        popover = page.locator('.popover-menu')
        popover.get_by_text('Accept edits').wait_for()
        assert 'until the end of the current session' not in popover.inner_text()
        page.keyboard.press('Escape')

        # Settings: four plain sections, no diagnostics/technical page.
        page.locator('[data-action="settings"]').first.click()
        for tab in ('Account', 'Permissions', 'Folder', 'About'):
            assert page.locator('.settings-tab', has_text=tab).count() == 1
        assert page.locator('#settings-tab-diagnostics').count() == 0
        panel_text = page.locator('.settings-panels').inner_text()
        assert 'pywebview' not in panel_text and 'State' not in panel_text
        page.keyboard.press('Escape')
        assert not errors
        browser.close()


def test_v49_centered_composer_uniform_chips_resize_and_connector_switches(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        # The four big suggestion cards are gone; the composer sits in the
        # center of the welcome screen instead.
        assert page.locator('.quick-card').count() == 0
        assert page.locator('#welcomeComposerSlot .composer-shell').count() == 1
        composer_box = page.locator('#composerForm').bounding_box()
        # The hero + composer block is centered: the input sits in the
        # middle band of the window with clear space below it, not docked
        # to the bottom edge as in chat view.
        composer_center = composer_box['y'] + composer_box['height'] / 2
        assert 950 * 0.45 < composer_center < 950 * 0.78, composer_box
        assert 950 - (composer_box['y'] + composer_box['height']) > 120, composer_box

        # Every composer control is the same 32px rounded-rectangle height.
        choose_mode(page, 'Direct')
        heights = page.evaluate("""() => {
          const sels = ['#attachButton', '#workspaceButton', '#modalityButton',
                        '#modeButton', '#permissionButton', '.model-strip .model-pill'];
          const out = {};
          for (const sel of sels) {
            const n = document.querySelector(sel);
            if (n) out[sel] = Math.round(n.getBoundingClientRect().height);
          }
          return out;
        }""")
        assert heights and set(heights.values()) == {32}, heights
        radius = page.evaluate(
            "() => getComputedStyle(document.querySelector('#modeButton')).borderRadius")
        assert radius == '8px', radius

        # Resize really resizes: sidebar and workspace panel pixel widths move.
        sidebar_before = page.locator('#sidebar').bounding_box()['width']
        handle = page.locator('#sidebarResize').bounding_box()
        page.mouse.move(handle['x'] + handle['width'] / 2, handle['y'] + 200)
        page.mouse.down()
        page.mouse.move(handle['x'] + handle['width'] / 2 + 70, handle['y'] + 200, steps=8)
        page.mouse.up()
        page.wait_for_timeout(250)
        sidebar_after = page.locator('#sidebar').bounding_box()['width']
        assert sidebar_after > sidebar_before + 50, (sidebar_before, sidebar_after)

        panel_before = page.locator('#workspacePanel').bounding_box()['width']
        handle = page.locator('#workspaceResize').bounding_box()
        page.mouse.move(handle['x'] + handle['width'] / 2, handle['y'] + 200)
        page.mouse.down()
        page.mouse.move(handle['x'] + handle['width'] / 2 - 60, handle['y'] + 200, steps=8)
        page.mouse.up()
        page.wait_for_timeout(250)
        panel_after = page.locator('#workspacePanel').bounding_box()['width']
        assert panel_after > panel_before + 40, (panel_before, panel_after)

        # Connected official connectors carry an on/off switch and the
        # Agent-Mode-only note; flipping the switch marks the row Off.
        panel = page.locator('#connectorList')
        panel.get_by_text('Agent Mode only').wait_for()
        github = page.locator('.arena-connector-row', has_text='GitHub').first
        toggle = github.locator('.switch-input')
        assert toggle.is_checked()
        github.locator('.switch').click()
        page.locator('.arena-connector-row', has_text='GitHub').locator('text=Off').first.wait_for()
        github = page.locator('.arena-connector-row', has_text='GitHub').first
        assert not github.locator('.switch-input').is_checked()
        github.locator('.switch').click()
        page.wait_for_timeout(300)
        github = page.locator('.arena-connector-row', has_text='GitHub').first
        assert github.locator('.switch-input').is_checked()

        # Sending moves the composer back to the bottom of the chat view.
        page.locator('#prompt').fill('Hello from the centered composer')
        page.locator('#prompt').press('Enter')
        page.locator('#chatView').wait_for(state='visible', timeout=10000)
        page.wait_for_timeout(400)
        assert page.locator('#welcomeComposerSlot .composer-shell').count() == 0
        assert page.locator('.main-area > .composer-shell').count() == 1
        page.locator('#stopButton').wait_for(state='hidden', timeout=30000)
        assert not errors
        browser.close()


def test_v410_parallel_chats_status_marks_and_account_switching(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')
        page.locator('.chat-row', has_text='Landing page for a photo studio').wait_for(timeout=10000)

        # Minimalist list: plain group headers, no green badges.
        list_text = page.locator('#chatList').inner_text()
        assert 'Recent' in list_text and 'Only on arena.ai' in list_text
        assert page.locator('.cloud-chat-badge:visible').count() == 0

        # --- Accounts menu: current account, second account, expired card.
        page.locator('#accountButton').click()
        menu = page.locator('.account-menu')
        menu.wait_for()
        menu_text = menu.inner_text()
        assert 'demo@local.invalid' in menu_text and 'current' in menu_text.lower()
        assert 'second@local.invalid' in menu_text
        assert 'Session expired: sign in' in menu_text
        assert 'Add account' in menu_text and 'Sign out' in menu_text
        assert 'Settings' in menu_text
        # No capsule buttons: the topbar buttons use the 8px chip shape.
        radius = page.evaluate(
            "() => getComputedStyle(document.querySelector('#workspacePanelTopButton')).borderTopLeftRadius")
        assert radius == '8px', radius

        # Switch to the second account: its chats replace the first one's.
        menu.locator('.account-menu-main', has_text='second@local.invalid').click()
        page.locator('#accountName', has_text='Second User').wait_for(timeout=10000)
        page.locator('.chat-row', has_text='Second account notes').wait_for(timeout=10000)
        assert page.locator('.chat-row', has_text='Landing page for a photo studio').count() == 0

        # Switch back.
        page.locator('#accountButton').click()
        page.locator('.account-menu-main', has_text='demo@local.invalid').click()
        page.locator('#accountName', has_text='Demo User').wait_for(timeout=10000)
        page.locator('.chat-row', has_text='Landing page for a photo studio').wait_for(timeout=10000)

        # --- Parallel chats.  Agent Mode demo generations pause on a
        # permission request, which makes the overlap fully deterministic:
        # both chats stay "running" until the test answers them.
        choose_mode(page, 'Agent Mode')
        rows = page.locator('#chatList .chat-row')
        page.locator('#prompt').fill('Check the first project in demo and report back')
        page.locator('#prompt').press('Enter')
        rows.nth(0).locator('.run-dot').wait_for(timeout=10000)
        page.get_by_role('button', name='Deny').last.wait_for(timeout=15000)

        page.locator('#newChatBtn').click()
        # The new empty chat is the active one and is not generating (the
        # running first chat's row also says "New chat" in demo, so wait for
        # the active row to stop being the running one).
        page.wait_for_function(
            "() => { const a = document.querySelector('.chat-row.is-active'); return a && !a.classList.contains('is-running'); }",
            timeout=10000)
        page.locator('#prompt').fill('Check the second project in demo and summarize it')
        page.locator('#prompt').press('Enter')
        page.wait_for_function(
            "() => document.querySelectorAll('.chat-row .run-dot').length === 2",
            timeout=10000)
        # The second chat types its answer before asking; both are paused
        # once two permission requests are pending.
        page.wait_for_function(
            "() => document.querySelector('#pendingPermissionsBadge')?.textContent.trim() === '2'",
            timeout=30000)

        # Going back to the first chat shows its live turn (the pending
        # permission is still there), not the server's saved snapshot.
        # force=True: the sidebar re-renders while chats work.
        rows.nth(1).locator('.chat-row-main').click(force=True)
        page.locator('.message-user', has_text='first project').wait_for(timeout=10000)
        page.get_by_role('button', name='Deny').last.wait_for(timeout=10000)

        # Answer the FIRST chat's permission from Settings while the second
        # chat is open: the first chat then finishes in the background and
        # earns the green check.
        rows.nth(0).locator('.chat-row-main').click(force=True)
        page.locator('.message-user', has_text='second project').wait_for(timeout=10000)
        page.locator('[data-action="settings"]').first.click()
        page.locator('.settings-tab', has_text='Permissions').click()
        minis = page.locator('.permission-mini')
        page.wait_for_function(
            "() => document.querySelectorAll('.permission-mini').length >= 2", timeout=10000)
        minis.nth(0).locator('.button-deny').click()
        page.keyboard.press('Escape')
        page.wait_for_function(
            "() => document.querySelectorAll('.chat-row .run-dot').length === 1",
            timeout=30000)
        rows.nth(1).locator('.done-dot').wait_for(timeout=10000)

        # Finish the second chat from its own view.
        page.get_by_role('button', name='Deny').last.click()
        page.wait_for_function(
            "() => document.querySelectorAll('.chat-row .run-dot').length === 0",
            timeout=30000)

        # Opening the finished chat clears its check.
        row1 = page.locator('.chat-row', has_text='first project')
        row1.locator('.chat-row-main').click(force=True)
        page.wait_for_function(
            "() => document.querySelectorAll('.chat-row .done-dot').length === 0",
            timeout=10000)
        assert not errors, errors
        browser.close()


def test_v415_compact_button_and_memory_settings(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1400, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        # No Compact chip before a chat exists; it appears in a started chat.
        assert page.locator('#compactButton').is_hidden()
        choose_mode(page, 'Battle Mode')
        page.locator('#prompt').fill('Write a haiku about autumn')
        page.locator('#prompt').press('Enter')
        page.locator('#stopButton').wait_for(state='hidden', timeout=30000)
        page.locator('#compactButton').wait_for(state='visible', timeout=10000)

        # Confirm dialog explains the fresh session; compacting drops a
        # divider into the transcript.
        page.locator('#compactButton').click()
        page.locator('.modal', has_text='Compact conversation').wait_for()
        modal_text = page.locator('.modal').inner_text()
        assert 'fresh Arena session' in modal_text
        assert 'vote' in modal_text  # Battle caveat
        page.locator('.modal .button', has_text='Compact').click()
        page.locator('.chat-divider').wait_for(timeout=10000)
        assert 'Context compacted' in page.locator('.chat-divider').inner_text()

        # Settings → Memory: two editable memory files and a save round-trip.
        page.locator('[data-action="settings"]').first.click()
        page.locator('#settings-tab-memory').click()
        page.locator('.memory-field').first.wait_for()
        assert page.locator('.memory-field').count() == 2
        page.locator('.memory-field').first.fill('- demo fact: keep answers short')
        page.locator('.settings-panels .button', has_text='Save memory').click()
        page.wait_for_timeout(600)
        assert page.locator('.memory-field').first.input_value() == '- demo fact: keep answers short'
        page.keyboard.press('Escape')
        assert not errors
        browser.close()


def test_v416_about_updates_backup_and_tray_settings(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1400, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        page.locator('[data-action="settings"]').first.click()
        page.locator('#settings-tab-about').click()
        panel = page.locator('.settings-panels')
        panel.locator('.button', has_text='Check for updates').wait_for()
        assert panel.locator('.button', has_text='Export settings').count() == 1
        assert panel.locator('.button', has_text='Copy diagnostics').count() == 1
        # tray + auto-check switches render
        assert panel.locator('.setting-toggle-row', has_text='system tray').count() == 1
        assert panel.locator('.setting-toggle-row', has_text='updates automatically').count() == 1
        panel.locator('.button', has_text='Check for updates').click()
        page.wait_for_timeout(700)
        assert panel.locator('.button', has_text='Check for updates').is_enabled()
        page.keyboard.press('Escape')
        assert not errors
        browser.close()


def test_v516_queue_drafts_find_and_recent_models(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1400, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        # Queue: a message typed during generation sends itself afterwards.
        page.locator('#prompt').fill('First queued-flow message')
        page.locator('#prompt').press('Enter')
        page.wait_for_timeout(400)
        page.locator('#prompt').fill('Second queued-flow message')
        page.locator('#prompt').press('Enter')
        page.locator('#queuedBar').wait_for(timeout=5000)
        assert 'Queued' in page.locator('#queuedBar').inner_text()
        page.wait_for_function(
            "() => !document.querySelector('#queuedBar')"
            " && document.querySelector('#messageList')?.innerText.includes('Second queued-flow message')",
            timeout=30000)

        # Find in chat highlights matches and closes cleanly.
        page.keyboard.press('Control+f')
        page.locator('#findBar .find-input').fill('queued-flow')
        page.wait_for_function(
            "() => document.querySelectorAll('#messageList mark.find-hit').length >= 2",
            timeout=5000)
        page.keyboard.press('Escape')
        page.wait_for_function("() => !document.querySelector('#findBar')", timeout=5000)

        # Drafts survive switching chats.
        page.locator('#prompt').fill('draft that must survive')
        page.wait_for_timeout(250)
        page.locator('#newChatBtn').click()
        page.wait_for_function("() => document.querySelector('#prompt').value === ''", timeout=10000)
        page.locator('#chatList .chat-row', has_text='First queued-flow').first.locator('.chat-row-main').click(force=True)
        page.wait_for_function(
            "() => document.querySelector('#prompt').value === 'draft that must survive'",
            timeout=10000)

        # Recent models group appears after picking a model once.
        page.locator('#newChatBtn').click()
        page.wait_for_timeout(600)
        choose_mode(page, 'Direct')
        page.locator('#modelsNavBtn').click()
        page.locator('.popover-option', has_text='Sable R1').first.click()
        page.locator('#modelsNavBtn').click()
        page.locator('.popover-group-label', has_text='Recent').wait_for(timeout=5000)
        page.keyboard.press('Escape')
        assert not errors
        browser.close()


def test_v55_gateway_and_components_panels(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1400, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        page.locator('[data-action="settings"]').first.click()
        # Components: cloudflared installs via the demo flow and flips to Installed.
        page.locator('#settings-tab-components').click()
        panel = page.locator('.settings-panels')
        cf_row = panel.locator('.component-row', has_text='cloudflared')
        cf_row.wait_for(timeout=8000)
        assert 'Not installed' in cf_row.inner_text()
        cf_row.locator('.button', has_text='Install').click()
        page.locator('.install-progress-fill').wait_for(timeout=8000)
        page.wait_for_function(
            "() => [...document.querySelectorAll('.component-row')]"
            ".some((r) => r.innerText.includes('cloudflared') && r.innerText.includes('Installed'))",
            timeout=10000)

        # Gateway: enable -> start -> demo URL shows with recent calls.
        page.locator('#settings-tab-gateway').click()
        panel.locator('.setting-toggle-row', has_text='Enable Agent Gateway').locator('input').check()
        panel.locator('.button', has_text='Start session now').click()
        page.wait_for_function(
            "() => document.querySelector('.settings-panels').innerText.includes('demo-gateway.trycloudflare.com')",
            timeout=10000)
        assert 'Stop & revoke' in panel.inner_text()
        page.keyboard.press('Escape')
        assert not errors
        browser.close()


def test_v551_workspace_rich_previews(site):
    sync_api = pytest.importorskip('playwright.sync_api')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1500, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.goto(site + '/?demo=1', wait_until='networkidle')

        tree = page.locator('#workspaceTree')
        tree.get_by_text('README.md').wait_for(timeout=10000)
        # Markdown renders as a document, not raw text.
        tree.get_by_text('README.md').click()
        page.locator('.file-preview-markdown h1', has_text='Photo Studio').wait_for(timeout=8000)
        page.get_by_role('button', name='Close', exact=True).click()
        # HTML renders in a sandboxed frame.
        tree.get_by_text('page.html').click()
        iframe = page.locator('iframe.file-preview-frame')
        iframe.wait_for(timeout=8000)
        assert iframe.get_attribute('sandbox') is not None
        page.keyboard.press('Escape')
        # Plain text keeps the classic <pre> preview.
        tree.get_by_text('notes.txt').click()
        page.locator('.file-preview-pre').get_by_text('Demo notes').wait_for(timeout=8000)
        page.keyboard.press('Escape')
        assert not errors
        browser.close()


def test_v56_refresh_native_question_and_image_choice(site):
    sync_api = pytest.importorskip('playwright.sync_api')

    def svg(label, color):
        return (
            "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' "
            f"width='320' height='200'%3E%3Crect width='320' height='200' fill='{color}'/%3E"
            f"%3Ctext x='24' y='105' fill='white' font-family='Arial' font-size='24'%3E{label}%3C/text%3E%3C/svg%3E"
        )

    chat_id = '12345678-1234-4234-8234-123456789abc'
    eval_id = '87654321-4321-4321-8321-cba987654321'
    saved_choice = {
        'id': 'saved-choice', 'tool_call_id': 'img-old', 'kind': 'image',
        'status': 'completed', 'prompt': 'A saved poster', 'file_path': 'poster.png',
        'selected_index': 0, 'selection_method': 'user',
        'candidates': [
            {'index': 0, 'url': svg('Saved One', '%23365f46'), 'hash': 'a' * 43},
            {'index': 1, 'url': svg('Saved Two', '%234b4f7a'), 'hash': 'b' * 43},
        ],
        'attribution': [
            {'index': 0, 'model_name': 'Saved Model One', 'organization': 'Org Alpha'},
            {'index': 1, 'model_name': 'Saved Model Two', 'organization': 'Org Beta'},
        ],
    }
    messages = [
        {'role': 'user', 'text': 'Make a poster and ask me about the tone.'},
        {
            'role': 'assistant', 'text': 'The poster is ready.', 'text_b': '',
            'names': {'a': 'Agent', 'b': None},
            'tools': [
                {'lane': 'a', 'tool': 'ask_user', 'summary': 'Question: Which tone?',
                 'question': 'Which tone?', 'answer': 'Calm', 'status': 'ok', 'ok': True},
                {'lane': 'a', 'tool': 'generate_image', 'summary': 'Generate image: A saved poster',
                 'status': 'ok', 'ok': True, 'media_choice': saved_choice},
            ],
        },
    ]
    chat = {
        'id': chat_id, 'title': 'Native Agent choices', 'mode': 'agent', 'modality': 'text',
        'model_a': None, 'model_b': None, 'eval_id': eval_id, 'source': 'arena',
        'agent_backend': 'arena', 'messages': messages,
    }
    pending_question = {
        'id': 'q-native-1', 'chat_id': chat_id, 'lane': 'a', 'kind': 'question',
        'question': 'Which color should Arena Agent use?',
        'options': ['Red — Warm', 'Blue'], 'custom': True,
    }
    pending_choice = {
        'id': 'choice-native-1', 'chat_id': chat_id, 'tool_call_id': 'img-new',
        'kind': 'image', 'status': 'awaiting_user_response',
        'prompt': 'Pick the live poster', 'file_path': 'live-poster.png',
        'selected_index': None, 'selection_method': '',
        'candidates': [
            {'index': 0, 'url': svg('Live One', '%237a4b35'), 'hash': 'c' * 43},
            {'index': 1, 'url': svg('Live Two', '%23355f7a'), 'hash': 'd' * 43},
        ],
        'attribution': [],
    }
    calls = {'refresh': 0, 'question_answers': [], 'media_answers': []}

    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1400, 'height': 950})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))

        def api(route):
            path = route.request.url.split('?', 1)[0].split('/api/', 1)[1]
            if path == f'chats/{chat_id}/refresh' and route.request.method == 'POST':
                calls['refresh'] += 1
                return route.fulfill(status=200, content_type='application/json', body=json.dumps(
                    {'ok': True, 'added': 0, 'total': len(messages), 'title': chat['title']}))
            if path.startswith('questions/') and route.request.method == 'POST':
                calls['question_answers'].append(route.request.post_data_json)
                return route.fulfill(status=200, content_type='application/json', body='{"ok": true}')
            if path.startswith('media-choices/') and route.request.method == 'POST':
                body = route.request.post_data_json
                calls['media_answers'].append(body)
                return route.fulfill(status=200, content_type='application/json', body=json.dumps(
                    {'ok': True, 'selected_index': body.get('selected_index'), 'selection_method': 'user'}))
            values = {
                'status': {'authenticated': True, 'mode': 'agent', 'modality': 'text', 'desktop': True,
                           'permission_mode': 'default', 'workspace': 'C:\\\\test'},
                'chats': [chat],
                'chats/' + chat_id: chat,
                'history': messages,
                'models': [],
                'permissions': [],
                'permission-mode': {'ok': True, 'mode': 'default'},
                'questions': [pending_question],
                'media-choices': [pending_choice],
                'workspace': {'workspace': 'C:\\\\test', 'projects': []},
            }
            return route.fulfill(status=200, content_type='application/json',
                                 body=json.dumps(values.get(path, {'ok': True})))

        page.route('**/api/**', api)
        page.goto(site, wait_until='networkidle')
        page.get_by_role('button', name='Open chat: Native Agent choices').click()

        saved_card = page.locator('[data-media-choice-card="saved-choice"]')
        saved_card.wait_for(timeout=10000)
        saved_text = saved_card.inner_text()
        assert 'Saved Model One' in saved_text and 'Saved Model Two' in saved_text
        assert 'Org Alpha' in saved_text and 'Org Beta' in saved_text
        assert saved_card.locator('.media-choice-preview img').count() == 2
        assert saved_card.locator('a', has_text='Full size').count() == 2
        body_text = page.locator('body').inner_text()
        assert 'Which tone?' in body_text and 'Calm' in body_text

        question_card = page.locator('[data-question-card="q-native-1"]')
        question_card.wait_for(timeout=10000)
        assert 'Which color should Arena Agent use?' in question_card.inner_text()
        question_card.locator('button', has_text='Blue').click()
        page.wait_for_function(
            "() => !document.querySelector('[data-question-card=\"q-native-1\"]')", timeout=10000)
        assert calls['question_answers'] == [{'answer': 'Blue'}]

        live_card = page.locator('[data-media-choice-card="choice-native-1"]')
        live_card.wait_for(timeout=10000)
        assert live_card.locator('.media-choice-preview img').count() == 2
        assert 'Saved Model' not in live_card.inner_text()
        live_card.locator('.media-choice-option').nth(1).locator('button', has_text='Use this image').click()
        page.wait_for_function(
            "() => document.querySelector('[data-media-choice-card=\"choice-native-1\"]')?.innerText.includes('Selected')",
            timeout=10000)
        assert calls['media_answers'] == [{'selected_index': 1}]
        assert live_card.locator('.media-choice-preview img').count() == 2

        refresh = page.get_by_role('button', name='Refresh this chat from arena.ai')
        refresh.wait_for(timeout=10000)
        before = calls['refresh']
        refresh.click()
        page.wait_for_function(
            f"() => document.body.innerText.includes('already up to date')", timeout=10000)
        assert calls['refresh'] > before
        assert not errors, errors
        browser.close()


def test_human_check_modal_appears_and_points_to_the_arena_window(site):
    """Arena answered `recaptcha validation failed`: the desktop asks the user to tick the box (it never ticks it)."""
    sync_api = pytest.importorskip('playwright.sync_api')
    shot = os.path.join(os.path.dirname(__file__), '..', 'docs', 'screenshots', 'human-check.png')
    with sync_api.sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox'])
        page = browser.new_page(viewport={'width': 1200, 'height': 760})
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))

        def api(route):
            path = route.request.url.split('?', 1)[0].split('/api/', 1)[1]
            if path == 'chat' and route.request.method == 'POST':
                events = [{'type': 'meta', 'chat_id': '12345678-1234-1234-1234-123456789abc', 'dual': False, 'names': {}},
                          {'type': 'challenge', 'kind': 'recaptcha',
                           'message': 'arena.ai wants a quick human check ("I\'m not a robot"). Tick the box in the arena.ai window.'}]
                body = ''.join('data: ' + json.dumps(e) + '\n\n' for e in events)
                return route.fulfill(status=200, content_type='text/event-stream; charset=utf-8', body=body)
            if path.endswith('new') or path == 'new-chat':
                return route.fulfill(status=200, content_type='application/json',
                                     body=json.dumps({'ok': True, 'chat_id': '12345678-1234-1234-1234-123456789abc'}))
            values = {'status': {'authenticated': True, 'mode': 'direct', 'modality': 'text', 'desktop': True,
                                 'permission_mode': 'default', 'workspace': 'C:\test'},
                      'chats': [], 'history': [], 'models': [{'id': 'm1', 'name': 'Model One'}], 'permissions': [],
                      'permission-mode': {'ok': True, 'mode': 'default'}, 'workspace': {'workspace': 'C:\test', 'projects': []},
                      'settings': {'setup_done': True}}
            return route.fulfill(status=200, content_type='application/json', body=json.dumps(values.get(path, {'ok': True})))

        page.route('**/api/**', api)
        page.goto(site, wait_until='networkidle')
        page.locator('#prompt').fill('hello')
        page.locator('#prompt').press('Enter')
        dialog = page.get_by_role('dialog')
        dialog.wait_for(timeout=10000)
        text = dialog.inner_text()
        assert 'Human check needed' in text and 'Show the check window' in text
        assert 'Nothing is sent until you finish' in text
        page.screenshot(path=shot)
        assert not errors
        browser.close()
