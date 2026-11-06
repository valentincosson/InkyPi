"""Capture le comportement réel des formulaires de plugins dans un navigateur.

Ces captures servent de référence aux futurs formulaires : pour les mêmes saisies, ils devront
envoyer les mêmes champs. Elles décrivent l'existant, défauts compris.

Pour les régénérer : UPDATE_PLUGIN_FORM_SNAPSHOTS=1 pytest tests/test_plugin_forms.py
"""
import json
import os
import threading

import pytest
from werkzeug.serving import make_server

from config import Config

playwright_api = pytest.importorskip("playwright.sync_api")

pytestmark = pytest.mark.browser

SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), "snapshots", "plugin_forms")
PLUGIN_IDS = sorted(
    name
    for name in os.listdir(os.path.join(Config.BASE_DIR, "plugins"))
    if os.path.isfile(os.path.join(Config.BASE_DIR, "plugins", name, "plugin-info.json"))
)

CAPTURE_FETCH = """() => {
    window.__originalFetch = window.fetch;
    window.__sent = [];
    window.fetch = async (url, options = {}) => {
        window.__sent.push({
            url: String(url),
            method: options.method || 'GET',
            fields: [...options.body.entries()].map(([key, value]) =>
                [key, value instanceof File ? `file:${value.name}` : value]),
        });
        return new Response(JSON.stringify({ success: true, message: 'captured' }), { status: 200 });
    };
}"""

READ_FORM = """() => [...new FormData(document.getElementById('settingsForm')).entries()]
    .map(([key, value]) => [key, value instanceof File ? `file:${value.name}` : value])"""

# Modifie chaque champ de façon déterministe, en déclenchant les scripts du formulaire.
FILL_FORM = """() => {
    const known = { latitude: '48.85', longitude: '2.35' };
    const form = document.getElementById('settingsForm');
    const notify = (element) => {
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const groups = new Set();
    for (const element of form.querySelectorAll('input, select, textarea')) {
        if (element.disabled || ['hidden', 'file', 'button', 'submit'].includes(element.type)) continue;
        if (element.type === 'checkbox') {
            element.click();
        } else if (element.type === 'radio') {
            if (groups.has(element.name)) continue;
            groups.add(element.name);
            const options = form.querySelectorAll(`input[type="radio"][name="${element.name}"]`);
            options[options.length - 1].click();
        } else if (element.tagName === 'SELECT') {
            const options = [...element.options].filter((option) => !option.disabled && option.value);
            if (options.length) element.value = options[options.length - 1].value;
            notify(element);
        } else {
            const byType = {
                number: String(Math.max(Number(element.min || 0), 10)),
                range: element.max || '1',
                date: '2031-03-14',
                time: '07:30',
                color: '#123456',
                url: `https://example.test/${element.name}`,
            };
            element.value = known[element.name] ?? byType[element.type] ?? `sample ${element.name}`;
            notify(element);
        }
    }
}"""


@pytest.fixture(scope="module")
def browser():
    with playwright_api.sync_playwright() as playwright:
        try:
            instance = playwright.chromium.launch(channel="chrome", headless=True)
        except playwright_api.Error as error:
            pytest.skip(f"Google Chrome indisponible : {error}")
        yield instance
        instance.close()


@pytest.fixture
def server_url(app):
    server = make_server("127.0.0.1", 0, app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    thread.join()


@pytest.fixture
def page(browser):
    context = browser.new_context(viewport={"width": 1280, "height": 900}, locale="en-US", timezone_id="Europe/Paris")

    def local_only(route):
        if route.request.url.startswith("http://127.0.0.1"):
            route.continue_()
        else:
            route.abort()

    context.route("**/*", local_only)
    page = context.new_page()
    page.clock.set_fixed_time("2030-01-15T12:00:00")
    page.errors = []
    page.on("pageerror", lambda error: page.errors.append(error.message))
    yield page
    context.close()


def click_and_capture(page, selector):
    """Clique sur l'action du formulaire et renvoie ce qui partirait vers le serveur, sans l'envoyer."""
    page.evaluate(CAPTURE_FETCH)
    page.locator(selector).first.click()
    try:
        page.wait_for_function("() => window.__sent.length > 0", timeout=5000)
    except playwright_api.TimeoutError:
        return None
    return page.evaluate("() => window.__sent[0]")


def capture_form(page, base_url, device_config, plugin_id):
    page.goto(f"{base_url}/plugin/{plugin_id}", wait_until="load")
    defaults = page.evaluate(READ_FORM)

    page.evaluate(FILL_FORM)
    filled = page.evaluate(READ_FORM)
    update_now = click_and_capture(page, "#settingsForm .buttons-container button.left")

    refresh = {"playlist": "Default", "instance_name": "Snapshot", "refreshType": "interval", "unit": "hour", "interval": "1"}
    added = page.evaluate(
        """async ([fields, refresh]) => {
            const body = new FormData();
            fields.forEach(([key, value]) => body.append(key, value));
            body.append('refresh_settings', JSON.stringify(refresh));
            const response = await window.__originalFetch('/add_plugin', { method: 'POST', body });
            return response.status;
        }""",
        [filled, refresh],
    )
    assert added == 200, f"{plugin_id}: /add_plugin a répondu {added}"
    stored = device_config.get_playlist_manager().find_plugin(plugin_id, "Snapshot").settings

    page.goto(f"{base_url}/plugin/{plugin_id}?instance=Snapshot", wait_until="load")
    prefilled = page.evaluate(READ_FORM)
    save = click_and_capture(page, "#settingsForm .buttons-container button:not(.right)")

    return {
        "defaults": defaults,
        "filled": filled,
        "update_now_request": update_now,
        "stored_settings": stored,
        "edit_prefilled": prefilled,
        "edit_save_request": save,
        "page_errors": sorted(set(page.errors)),
    }


@pytest.mark.parametrize("plugin_id", PLUGIN_IDS)
def test_plugin_form_matches_snapshot(page, server_url, device_config, plugin_id):
    actual = capture_form(page, server_url, device_config, plugin_id)
    path = os.path.join(SNAPSHOT_DIR, f"{plugin_id}.json")

    if os.environ.get("UPDATE_PLUGIN_FORM_SNAPSHOTS"):
        os.makedirs(SNAPSHOT_DIR, exist_ok=True)
        with open(path, "w") as snapshot:
            json.dump(actual, snapshot, indent=2, ensure_ascii=False, sort_keys=True)
            snapshot.write("\n")

    assert os.path.exists(path), f"Capture absente pour {plugin_id} : voir l'en-tête de ce fichier"
    with open(path) as snapshot:
        assert actual == json.load(snapshot)
