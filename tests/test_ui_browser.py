"""Nouvelle interface dans un vrai navigateur : états de l'écran, thème, langue et accessibilité."""
import threading

import pytest
from PIL import Image
from werkzeug.serving import make_server

import blueprints.main as main_module
from model import RefreshInfo
from ui.blueprint import ui_bp

playwright_api = pytest.importorskip("playwright.sync_api")


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
def ui_app(app):
    app.register_blueprint(ui_bp)
    return app


@pytest.fixture(autouse=True)
def current_image(monkeypatch, tmp_path):
    """Isole les tests de l'image restée sur le disque après un lancement réel."""
    image = tmp_path / "static" / "images" / "current_image.png"
    image.parent.mkdir(parents=True)
    Image.new("RGB", (800, 480), "white").save(image)
    monkeypatch.setattr(main_module, "__file__", str(tmp_path / "blueprints" / "main.py"))
    return image


@pytest.fixture
def server_url(ui_app):
    server = make_server("127.0.0.1", 0, ui_app, threaded=True)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}"
    server.shutdown()
    thread.join()


@pytest.fixture
def page(browser):
    context = browser.new_context(viewport={"width": 1280, "height": 800}, color_scheme="light")
    page = context.new_page()
    page.errors = []
    page.on("pageerror", lambda error: page.errors.append(error.message))
    yield page
    context.close()


@pytest.mark.browser
class TestInBrowser:
    def test_explains_an_empty_screen(self, page, server_url, device_config):
        device_config.refresh_info = RefreshInfo(None, None, None, None)
        page.goto(f"{server_url}/ui/")
        heading = page.get_by_role("heading", level=1)
        playwright_api.expect(heading).to_have_text("Nothing on the screen yet")
        assert page.errors == []

    def test_shows_the_current_image_and_details(self, page, server_url):
        page.goto(f"{server_url}/ui/")
        playwright_api.expect(page.get_by_role("heading", level=1)).to_have_text("Living room")
        playwright_api.expect(page.get_by_text("Default playlist")).to_be_visible()
        playwright_api.expect(page.get_by_text("08:00")).to_be_visible()
        playwright_api.expect(page.get_by_role("img", name="Living room, on the screen")).to_be_visible()
        assert page.errors == []

    def test_missing_image_is_not_an_empty_screen(self, page, server_url, current_image):
        current_image.unlink()
        page.goto(f"{server_url}/ui/")
        playwright_api.expect(page.get_by_role("heading", level=1)).to_have_text("Living room")
        playwright_api.expect(page.get_by_text("Couldn't load the image")).to_be_visible()
        playwright_api.expect(page.get_by_role("button", name="Try again")).to_be_visible()

    def test_server_failure_offers_a_retry(self, page, server_url):
        page.route("**/ui/api/state", lambda route: route.abort())
        page.goto(f"{server_url}/ui/")
        playwright_api.expect(page.get_by_role("heading", level=1)).to_have_text("Couldn't load the screen")
        page.unroute("**/ui/api/state")
        page.get_by_role("button", name="Try again").click()
        playwright_api.expect(page.get_by_role("heading", level=1)).to_have_text("Living room")
        assert page.evaluate("document.activeElement.id") == "main"

    def test_portrait_image_is_not_squashed(self, page, server_url, current_image):
        Image.new("RGB", (480, 800), "white").save(current_image)
        page.goto(f"{server_url}/ui/")
        shown = page.get_by_role("img", name="Living room, on the screen")
        playwright_api.expect(shown).to_be_visible()
        page.wait_for_function("document.querySelector('.device img').style.aspectRatio !== ''")
        box = shown.bounding_box()
        assert box["height"] / box["width"] == pytest.approx(800 / 480, rel=0.02)

    @pytest.mark.parametrize("width", [1024, 1100, 1132, 1140, 1280])
    def test_no_horizontal_overflow(self, page, server_url, width):
        page.set_viewport_size({"width": width, "height": 800})
        page.goto(f"{server_url}/ui/")
        playwright_api.expect(page.get_by_role("heading", level=1)).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth") == width
        assert page.get_by_role("link", name="InkyPi").first.bounding_box()["x"] >= 16

    def test_focus_follows_internal_navigation(self, page, server_url):
        page.goto(f"{server_url}/ui/nope")
        page.get_by_role("link", name="Back to the screen").click()
        page.wait_for_url("**/ui/")
        playwright_api.expect(page.get_by_role("heading", level=1)).to_have_text("Living room")
        assert page.evaluate("document.activeElement.id") == "main"

    def test_theme_follows_the_system_until_chosen(self, page, server_url):
        page.goto(f"{server_url}/ui/")
        assert page.evaluate("localStorage.getItem('inkypi-theme')") is None
        page.emulate_media(color_scheme="dark")
        page.wait_for_function("document.documentElement.className === 'dark'")

    def test_language_comes_from_the_catalogue(self, page, server_url):
        page.add_init_script("localStorage.setItem('inkypi-lang', 'fr')")
        page.goto(f"{server_url}/ui/")
        playwright_api.expect(page.get_by_role("link", name="Réglages")).to_be_visible()
        assert page.evaluate("document.documentElement.lang") == "fr"

    def test_theme_choice_is_kept_and_shared_with_the_old_interface(self, page, server_url):
        page.goto(f"{server_url}/ui/")
        page.get_by_role("button", name="Switch to dark mode").click()
        assert page.evaluate("document.documentElement.className") == "dark"
        assert page.evaluate("localStorage.getItem('inkypi-theme')") == "dark"
        page.reload()
        assert page.evaluate("document.documentElement.className") == "dark"

    def test_pages_not_ported_open_the_old_interface(self, page, server_url):
        page.goto(f"{server_url}/ui/")
        page.get_by_role("link", name="Settings").click()
        page.wait_for_url("**/settings")
        playwright_api.expect(page.locator("#saveSettingsForm, form").first).to_be_visible()

    def test_unknown_page_offers_a_way_back(self, page, server_url):
        page.goto(f"{server_url}/ui/nope")
        playwright_api.expect(page.get_by_role("heading", level=1)).to_have_text("Page not found")
        page.get_by_role("link", name="Back to the screen").click()
        page.wait_for_url("**/ui/")
        playwright_api.expect(page.get_by_role("heading", level=1)).not_to_have_text("Page not found")

    def test_recovers_from_an_unexpected_error(self, page, server_url):
        page.route("**/ui/api/state", lambda route: route.fulfill(json={"device": {"timezone": "Nowhere/Invalid", "time_format": "24h", "name": "x"}, "screen": {"plugin_id": "clock", "plugin_name": "Clock", "instance": None, "playlist": None, "refreshed_at": "2026-01-01T08:00:00+01:00", "image_url": "/api/current_image"}}))
        page.goto(f"{server_url}/ui/")
        playwright_api.expect(page.get_by_role("heading", level=1)).to_have_text("Something went wrong")
        playwright_api.expect(page.get_by_role("button", name="Reload the page")).to_be_visible()

    def test_credits_the_original_project(self, page, server_url):
        page.goto(f"{server_url}/ui/")
        credit = page.locator("footer p")
        playwright_api.expect(credit).to_have_text("Based on InkyPi by fatihak. Modified version.")
        assert credit.get_by_role("link", name="InkyPi").get_attribute("href") == "https://github.com/fatihak/InkyPi"
        playwright_api.expect(page.get_by_role("link", name="GPL-3.0 licence")).to_be_visible()
