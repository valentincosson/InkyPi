"""Nouvelle interface dans un vrai navigateur : états de l'écran, réglages, clés d'API, thème, langue et accessibilité."""
import os
import threading

import pytest
from dotenv import dotenv_values
from PIL import Image
from werkzeug.serving import make_server

import blueprints.main as main_module
import blueprints.settings as settings_module
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
        page.get_by_role("link", name="Playlists").click()
        page.wait_for_url("**/playlist")
        assert "/ui/" not in page.url

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


expect = playwright_api.expect


def path_is(request, path):
    return request.url.split("?")[0].endswith(path)


@pytest.mark.browser
class TestSettingsPage:
    @pytest.fixture
    def settings_page(self, page, server_url, device_config):
        device_config.update_config({
            "name": "Frame",
            "orientation": "horizontal",
            "inverted_image": None,
            "timezone": "Europe/Paris",
            "time_format": "24h",
            "plugin_cycle_interval_seconds": 5400,
            "image_settings": {"saturation": 1.2, "contrast": 1.0, "sharpness": 1.0, "brightness": 1.0, "inky_saturation": 0.65},
        })
        page.goto(f"{server_url}/ui/settings")
        expect(page.get_by_role("heading", name="Settings", level=1)).to_be_visible()
        expect(page.get_by_label("Name", exact=True)).to_have_value("Frame")
        return page

    def save(self, page):
        page.get_by_role("button", name="Save changes").click()
        expect(page.get_by_text("Saved. Display changes")).to_be_visible()

    def test_shows_the_stored_values(self, settings_page):
        expect(settings_page.get_by_role("combobox", name="Time zone")).to_have_value("Europe/Paris")
        expect(settings_page.get_by_role("combobox", name="Time format")).to_contain_text("24-hour")
        expect(settings_page.get_by_role("radio", name="Landscape")).to_be_checked()
        expect(settings_page.get_by_role("switch", name="Rotate 180°")).not_to_be_checked()
        expect(settings_page.get_by_role("slider", name="Saturation", exact=True)).to_have_value("1.2")

    def test_ninety_minutes_stay_ninety_minutes(self, settings_page, device_config):
        expect(settings_page.locator("#interval")).to_have_value("90")
        settings_page.get_by_label("Name", exact=True).fill("Renamed")
        self.save(settings_page)
        assert device_config.get_config("plugin_cycle_interval_seconds") == 5400

    def test_saves_every_change(self, settings_page, device_config, refresh_task):
        settings_page.get_by_label("Name", exact=True).fill("  Kitchen  ")
        settings_page.get_by_role("radio", name="Portrait").check()
        settings_page.get_by_role("switch", name="Rotate 180°").click()
        settings_page.get_by_role("switch", name="Log system stats").click()
        settings_page.locator("#interval").fill("45")
        settings_page.locator("#time-format").click()
        settings_page.get_by_role("option", name="12-hour").click()
        settings_page.get_by_role("combobox", name="Time zone").fill("tokyo")
        settings_page.get_by_role("option", name="Asia/Tokyo").click()
        contrast = settings_page.get_by_role("slider", name="Contrast")
        contrast.focus()
        contrast.press("ArrowRight")

        self.save(settings_page)

        assert device_config.get_config("name") == "Kitchen"
        assert device_config.get_config("orientation") == "vertical"
        assert device_config.get_config("inverted_image") == "on"
        assert device_config.get_config("log_system_stats") == "on"
        assert device_config.get_config("plugin_cycle_interval_seconds") == 2700
        assert device_config.get_config("time_format") == "12h"
        assert device_config.get_config("timezone") == "Asia/Tokyo"
        image = device_config.get_config("image_settings")
        assert image["contrast"] == pytest.approx(1.1)
        assert image["saturation"] == pytest.approx(1.2)
        assert image["inky_saturation"] == pytest.approx(0.65)
        assert refresh_task.config_changes == 1

        settings_page.reload()
        expect(settings_page.get_by_label("Name", exact=True)).to_have_value("Kitchen")
        expect(settings_page.get_by_role("switch", name="Rotate 180°")).to_be_checked()
        expect(settings_page.locator("#interval")).to_have_value("45")

    def test_typing_during_a_save_is_kept_and_still_unsaved(self, settings_page, device_config):
        pending = []
        settings_page.route("**/save_settings", lambda route: pending.append(route))
        name = settings_page.get_by_label("Name", exact=True)
        name.fill("First")
        settings_page.get_by_role("button", name="Save changes").click()
        expect(settings_page.get_by_text("Saving…")).to_be_visible()
        while not pending:
            settings_page.wait_for_timeout(10)

        name.fill("Second")
        pending[0].continue_()

        expect(settings_page.get_by_text("Unsaved changes")).to_be_visible()
        expect(name).to_have_value("Second")
        assert device_config.get_config("name") == "First"

    def test_saving_twice_turns_a_switch_off_again(self, settings_page, device_config):
        switch = settings_page.get_by_role("switch", name="Rotate 180°")
        switch.click()
        self.save(settings_page)
        switch.click()
        self.save(settings_page)
        assert not device_config.get_config("inverted_image")

    def test_invalid_fields_are_explained_and_not_sent(self, settings_page, device_config):
        posts = []
        settings_page.on("request", lambda request: posts.append(request.url) if path_is(request, "/save_settings") else None)
        name = settings_page.get_by_label("Name", exact=True)
        name.fill("")
        settings_page.locator("#interval").fill("1500")

        settings_page.get_by_role("button", name="Save changes").click()

        expect(settings_page.get_by_text("Enter a name.")).to_be_visible()
        expect(settings_page.get_by_text("Enter a whole number")).to_be_visible()
        expect(name).to_be_focused()
        expect(name).to_have_attribute("aria-describedby", "name-error")
        assert posts == []
        assert device_config.get_config("name") == "Frame"

        name.fill("Again")
        expect(settings_page.get_by_text("Enter a name.")).to_be_hidden()

    def test_time_zone_must_come_from_the_list(self, settings_page):
        settings_page.get_by_role("combobox", name="Time zone").fill("")
        settings_page.get_by_role("button", name="Save changes").click()
        expect(settings_page.get_by_text("Choose a time zone from the list.")).to_be_visible()

    def test_partial_time_zone_goes_back_to_the_stored_one(self, settings_page, device_config):
        zone = settings_page.get_by_role("combobox", name="Time zone")
        zone.fill("tok")
        name = settings_page.get_by_label("Name", exact=True)
        name.click()
        expect(zone).to_have_value("Europe/Paris")

        name.fill("Renamed")
        self.save(settings_page)
        assert device_config.get_config("timezone") == "Europe/Paris"

    def test_partial_time_zone_left_with_the_keyboard_is_not_kept(self, settings_page, device_config):
        zone = settings_page.get_by_role("combobox", name="Time zone")
        zone.fill("tok")
        zone.press("Tab")
        settings_page.keyboard.press("Tab")
        expect(zone).to_have_value("Europe/Paris")

    def test_no_change_sends_nothing(self, settings_page):
        posts = []
        settings_page.on("request", lambda request: posts.append(request.url) if path_is(request, "/save_settings") else None)
        settings_page.get_by_role("button", name="Save changes").click()
        expect(settings_page.get_by_text("No changes to save")).to_be_visible()
        assert posts == []

    def test_server_refusal_keeps_what_was_typed(self, settings_page):
        settings_page.route("**/save_settings", lambda route: route.fulfill(status=400, json={"error": "Time Zone is required"}))
        name = settings_page.get_by_label("Name", exact=True)
        name.fill("Typed")
        settings_page.get_by_role("button", name="Save changes").click()
        expect(settings_page.get_by_role("alert").filter(has_text="Not saved: Time Zone is required")).to_be_visible()
        expect(name).to_have_value("Typed")

    def test_unreachable_device_is_not_a_silent_failure(self, settings_page):
        settings_page.route("**/save_settings", lambda route: route.abort())
        settings_page.get_by_label("Name", exact=True).fill("Typed")
        settings_page.get_by_role("button", name="Save changes").click()
        expect(settings_page.get_by_role("alert").filter(has_text="The device didn't answer")).to_be_visible()

    def test_save_button_keeps_focus(self, settings_page):
        settings_page.get_by_label("Name", exact=True).fill("Typed")
        button = settings_page.get_by_role("button", name="Save changes")
        button.focus()
        settings_page.keyboard.press("Enter")
        expect(settings_page.get_by_text("Saved. Display changes")).to_be_visible()
        expect(button).to_be_focused()

    def test_leaving_with_unsaved_changes_asks_first(self, settings_page):
        settings_page.get_by_label("Name", exact=True).fill("Typed")
        settings_page.get_by_role("link", name="Screen").click()

        dialog = settings_page.get_by_role("alertdialog")
        expect(dialog).to_contain_text("Leave without saving?")
        dialog.get_by_role("button", name="Keep editing").click()
        expect(dialog).to_be_hidden()
        expect(settings_page.get_by_label("Name", exact=True)).to_have_value("Typed")
        assert settings_page.url.endswith("/ui/settings")

        settings_page.get_by_role("link", name="Screen").click()
        dialog.get_by_role("button", name="Leave").click()
        settings_page.wait_for_url("**/ui/")

    def test_leaving_for_the_old_interface_asks_only_once(self, settings_page):
        dialogs = []
        settings_page.on("dialog", lambda dialog: (dialogs.append(dialog.type), dialog.accept()))
        settings_page.get_by_label("Name", exact=True).fill("Typed")
        settings_page.get_by_role("link", name="Playlists").click()
        settings_page.get_by_role("alertdialog").get_by_role("button", name="Leave").click()
        settings_page.wait_for_url("**/playlist")
        assert dialogs == []

    def test_saved_changes_do_not_block_leaving(self, settings_page):
        settings_page.get_by_label("Name", exact=True).fill("Typed")
        self.save(settings_page)
        settings_page.get_by_role("link", name="Screen").click()
        settings_page.wait_for_url("**/ui/")

    def test_language_applies_at_once_and_is_kept(self, settings_page):
        settings_page.locator("#language").click()
        settings_page.get_by_role("option", name="Français").click()
        expect(settings_page.get_by_role("heading", name="Réglages", level=1)).to_be_visible()
        assert settings_page.evaluate("document.documentElement.lang") == "fr"
        settings_page.reload()
        expect(settings_page.get_by_role("heading", name="Réglages", level=1)).to_be_visible()

    def test_changing_language_does_not_lose_typed_values(self, settings_page):
        settings_page.get_by_label("Name", exact=True).fill("Typed")
        settings_page.locator("#language").click()
        settings_page.get_by_role("option", name="Français").click()
        expect(settings_page.get_by_label("Nom", exact=True)).to_have_value("Typed")

    @pytest.mark.parametrize(
        "button,command,message",
        [("Restart", "sudo reboot", "Restart requested"), ("Shut down", "sudo shutdown -h now", "Shutdown requested")],
    )
    def test_power_actions_ask_first(self, settings_page, monkeypatch, button, command, message):
        calls = []
        monkeypatch.setattr(settings_module.os, "system", calls.append)
        settings_page.get_by_role("button", name=button, exact=True).click()
        dialog = settings_page.get_by_role("alertdialog")
        expect(dialog).to_be_visible()
        dialog.get_by_role("button", name="Cancel").click()
        expect(dialog).to_be_hidden()
        assert calls == []

        settings_page.get_by_role("button", name=button, exact=True).click()
        with settings_page.expect_response("**/shutdown"):
            dialog.get_by_role("button", name=button, exact=True).click()
        expect(settings_page.get_by_text(message)).to_be_visible()
        assert calls == [command]

    def test_logs_download_without_leaving(self, settings_page):
        settings_page.get_by_label("Name", exact=True).fill("Typed")
        with settings_page.expect_download() as download:
            settings_page.get_by_role("link", name="Download logs").click()
        assert download.value.suggested_filename.endswith(".log")
        expect(settings_page.get_by_role("alertdialog")).to_be_hidden()

    def test_other_displays_do_not_show_the_inky_setting(self, page, server_url, device_config):
        device_config.update_value("display_type", "mock")
        page.goto(f"{server_url}/ui/settings")
        expect(page.get_by_role("slider", name="Contrast")).to_be_visible()
        expect(page.get_by_role("slider", name="Inky driver saturation")).to_have_count(0)

    def test_slider_shows_keyboard_focus(self, settings_page):
        settings_page.get_by_role("slider", name="Contrast").focus()
        thumb = settings_page.locator("[data-slot=slider-thumb]:has(input:focus-visible)")
        expect(thumb).to_have_css("outline-style", "solid")

    def test_save_bar_does_not_hide_the_focused_field(self, settings_page):
        settings_page.set_viewport_size({"width": 640, "height": 450})
        settings_page.get_by_label("Name", exact=True).fill("Typed")
        settings_page.locator("#interval").focus()
        box = settings_page.locator("#interval").bounding_box()
        bar = settings_page.get_by_role("button", name="Save changes").bounding_box()
        assert box["y"] + box["height"] <= bar["y"]

    def test_suggests_the_browser_time_zone_when_none_is_stored(self, browser, server_url, device_config):
        device_config.config.pop("timezone")
        context = browser.new_context(timezone_id="Asia/Tokyo")
        page = context.new_page()
        page.goto(f"{server_url}/ui/settings")
        expect(page.get_by_role("combobox", name="Time zone")).to_have_value("Asia/Tokyo")
        expect(page.get_by_text("Unsaved changes")).to_be_visible()
        page.get_by_role("button", name="Save changes").click()
        expect(page.get_by_text("Saved. Display changes")).to_be_visible()
        assert device_config.get_config("timezone") == "Asia/Tokyo"
        context.close()

    def test_dialog_keeps_a_margin_on_a_small_phone(self, settings_page):
        settings_page.set_viewport_size({"width": 320, "height": 568})
        settings_page.get_by_role("button", name="Restart").click()
        box = settings_page.get_by_role("alertdialog").bounding_box()
        assert box["x"] >= 8
        assert box["x"] + box["width"] <= 312

    def test_failed_load_offers_a_retry(self, page, server_url):
        page.route("**/ui/api/settings", lambda route: route.fulfill(status=500, json={"error": "x"}))
        page.goto(f"{server_url}/ui/settings")
        expect(page.get_by_role("alert").filter(has_text="Couldn't load the settings")).to_be_visible()

        page.unroute("**/ui/api/settings")
        page.get_by_role("button", name="Try again").click()
        expect(page.get_by_role("button", name="Save changes")).to_be_visible()

    @pytest.mark.parametrize("width", [320, 375, 768, 1024, 1100, 1280])
    def test_no_horizontal_overflow(self, settings_page, width):
        settings_page.set_viewport_size({"width": width, "height": 800})
        assert settings_page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")


@pytest.mark.browser
class TestApiKeysPage:
    @pytest.fixture(autouse=True)
    def restore_environment(self):
        saved = dict(os.environ)
        yield
        os.environ.clear()
        os.environ.update(saved)

    @pytest.fixture
    def env_file(self, tmp_path):
        return tmp_path / ".env"

    def open(self, page, server_url):
        page.goto(f"{server_url}/ui/api-keys")
        expect(page.get_by_role("heading", name="API keys", level=1)).to_be_visible()
        expect(page.get_by_role("heading", name="Other keys")).to_be_visible()

    def test_lists_the_keys_plugins_use(self, page, server_url):
        self.open(page, server_url)
        for service in ("OpenWeatherMap", "OpenAI", "Unsplash", "GitHub", "Immich"):
            expect(page.get_by_role("button", name=f"Add key for {service}")).to_be_visible()
        expect(page.get_by_text("Used by AI Image, AI Text")).to_be_visible()
        expect(page.get_by_role("list").first.get_by_text("NASA")).to_have_count(0)

    def test_values_never_reach_the_page(self, page, server_url, env_file):
        env_file.write_text("OPEN_AI_SECRET=super-secret\nCUSTOM=other-secret\n")
        self.open(page, server_url)
        expect(page.get_by_role("button", name="Replace OpenAI key")).to_be_visible()
        expect(page.get_by_role("button", name="Replace CUSTOM key")).to_be_visible()
        content = page.content()
        assert "super-secret" not in content
        assert "other-secret" not in content

    def test_adding_a_key_keeps_the_others(self, page, server_url, env_file):
        env_file.write_text("UNSPLASH_ACCESS_KEY=keep-me\n")
        self.open(page, server_url)

        page.get_by_role("button", name="Add key for OpenAI").click()
        value = page.locator("#key-value")
        expect(value).to_be_focused()
        assert value.get_attribute("type") == "password"
        value.fill("  new-secret ")
        value.press("Enter")

        replace = page.get_by_role("button", name="Replace OpenAI key")
        expect(replace).to_be_focused()
        assert "new-secret" not in page.content()
        saved = dotenv_values(env_file)
        assert saved["OPEN_AI_SECRET"] == "new-secret"
        assert saved["UNSPLASH_ACCESS_KEY"] == "keep-me"

    def test_replacing_a_key_changes_only_that_key(self, page, server_url, env_file):
        env_file.write_text("OPEN_AI_SECRET=old\nUNSPLASH_ACCESS_KEY=keep-me\n")
        self.open(page, server_url)

        page.get_by_role("button", name="Replace OpenAI key").click()
        page.locator("#key-value").fill("new")
        page.get_by_role("button", name="Save key").click()

        expect(page.locator("#key-value")).to_be_hidden()
        saved = dotenv_values(env_file)
        assert saved["OPEN_AI_SECRET"] == "new"
        assert saved["UNSPLASH_ACCESS_KEY"] == "keep-me"

    def test_saving_keeps_a_key_added_elsewhere_since_the_page_opened(self, page, server_url, env_file):
        env_file.write_text("UNSPLASH_ACCESS_KEY=old\n")
        self.open(page, server_url)
        env_file.write_text("UNSPLASH_ACCESS_KEY=old\nOPEN_AI_SECRET=added-elsewhere\n")

        page.get_by_role("button", name="Replace Unsplash key").click()
        page.locator("#key-value").fill("new")
        page.get_by_role("button", name="Save key").click()

        expect(page.get_by_role("button", name="Replace OpenAI key")).to_be_visible()
        saved = dotenv_values(env_file)
        assert saved["OPEN_AI_SECRET"] == "added-elsewhere"
        assert saved["UNSPLASH_ACCESS_KEY"] == "new"

    def test_removing_keeps_a_key_added_elsewhere_since_the_page_opened(self, page, server_url, env_file):
        env_file.write_text("UNSPLASH_ACCESS_KEY=old\n")
        self.open(page, server_url)
        env_file.write_text("UNSPLASH_ACCESS_KEY=old\nOPEN_AI_SECRET=added-elsewhere\n")

        page.get_by_role("button", name="Remove Unsplash key").click()
        page.get_by_role("alertdialog").get_by_role("button", name="Remove").click()

        expect(page.get_by_role("button", name="Replace OpenAI key")).to_be_visible()
        assert dotenv_values(env_file) == {"OPEN_AI_SECRET": "added-elsewhere"}

    def test_cancel_changes_nothing(self, page, server_url, env_file):
        env_file.write_text("OPEN_AI_SECRET=old\n")
        self.open(page, server_url)
        page.get_by_role("button", name="Replace OpenAI key").click()
        page.locator("#key-value").fill("new")
        page.get_by_role("button", name="Cancel").click()
        expect(page.get_by_role("button", name="Replace OpenAI key")).to_be_focused()
        assert dotenv_values(env_file)["OPEN_AI_SECRET"] == "old"

    def test_empty_value_is_refused(self, page, server_url):
        posts = []
        page.on("request", lambda request: posts.append(request.url) if path_is(request, "/api-keys/save") else None)
        self.open(page, server_url)
        page.get_by_role("button", name="Add key for OpenAI").click()
        page.locator("#key-value").fill("   ")
        page.get_by_role("button", name="Save key").click()
        expect(page.get_by_text("Enter the key.")).to_be_visible()
        assert posts == []

    def test_removal_asks_first_and_keeps_focus_in_the_page(self, page, server_url, env_file):
        env_file.write_text("OPEN_AI_SECRET=old\nUNSPLASH_ACCESS_KEY=keep-me\n")
        self.open(page, server_url)

        page.get_by_role("button", name="Remove OpenAI key").click()
        dialog = page.get_by_role("alertdialog")
        expect(dialog).to_contain_text("Remove the OpenAI key?")
        dialog.get_by_role("button", name="Cancel").click()
        expect(dialog).to_be_hidden()
        assert "OPEN_AI_SECRET" in dotenv_values(env_file)

        page.get_by_role("button", name="Remove OpenAI key").click()
        dialog.get_by_role("button", name="Remove").click()
        add = page.get_by_role("button", name="Add key for OpenAI")
        expect(add).to_be_focused()
        saved = dotenv_values(env_file)
        assert "OPEN_AI_SECRET" not in saved
        assert saved["UNSPLASH_ACCESS_KEY"] == "keep-me"

    def test_removal_failure_is_shown(self, page, server_url, env_file):
        env_file.write_text("OPEN_AI_SECRET=old\n")
        page.route("**/api-keys/save", lambda route: route.fulfill(status=500, json={"error": "Failed to write .env file"}))
        self.open(page, server_url)
        page.get_by_role("button", name="Remove OpenAI key").click()
        dialog = page.get_by_role("alertdialog")
        dialog.get_by_role("button", name="Remove").click()
        expect(dialog.get_by_role("alert")).to_contain_text("Failed to write .env file")
        expect(dialog).to_be_visible()

    def test_custom_key_is_validated_then_listed(self, page, server_url, env_file):
        env_file.write_text("TAKEN=x\n")
        self.open(page, server_url)
        page.get_by_role("button", name="Add another key").click()
        name = page.locator("#key-name")
        expect(name).to_be_focused()

        name.fill("MY KEY")
        page.locator("#key-value").fill("secret")
        page.get_by_role("button", name="Save key").click()
        expect(page.get_by_text("Use letters, numbers and underscores.")).to_be_visible()

        name.fill("TAKEN")
        page.get_by_role("button", name="Save key").click()
        expect(page.get_by_text("This key already exists.")).to_be_visible()
        assert dotenv_values(env_file) == {"TAKEN": "x"}

        name.fill("MY_KEY")
        page.get_by_role("button", name="Save key").click()
        expect(page.get_by_role("button", name="Replace MY_KEY key")).to_be_focused()
        assert dotenv_values(env_file) == {"TAKEN": "x", "MY_KEY": "secret"}

    def test_removing_the_last_custom_key_keeps_focus_in_the_page(self, page, server_url, env_file):
        env_file.write_text("CUSTOM=x\n")
        self.open(page, server_url)
        page.get_by_role("button", name="Remove CUSTOM key").click()
        page.get_by_role("alertdialog").get_by_role("button", name="Remove").click()
        expect(page.get_by_role("button", name="Add another key")).to_be_focused()

    def test_failed_save_keeps_the_form_open(self, page, server_url):
        page.route("**/api-keys/save", lambda route: route.abort())
        self.open(page, server_url)
        page.get_by_role("button", name="Add key for OpenAI").click()
        value = page.locator("#key-value")
        value.fill("typed")
        page.get_by_role("button", name="Save key").click()
        expect(page.get_by_role("alert").filter(has_text="The device didn't answer")).to_be_visible()
        expect(value).to_have_value("typed")
        page.get_by_role("button", name="Save key").click()

    def test_leaving_with_a_typed_key_asks_first(self, page, server_url):
        self.open(page, server_url)
        page.get_by_role("button", name="Add key for OpenAI").click()
        page.locator("#key-value").fill("typed")
        page.get_by_role("link", name="Screen").click()
        expect(page.get_by_role("alertdialog")).to_contain_text("Leave without saving?")

    def test_failed_load_offers_a_retry(self, page, server_url):
        page.route("**/ui/api/api-keys", lambda route: route.fulfill(status=500, json={"error": "x"}))
        page.goto(f"{server_url}/ui/api-keys")
        expect(page.get_by_role("alert").filter(has_text="Couldn't load the API keys")).to_be_visible()
        page.unroute("**/ui/api/api-keys")
        page.get_by_role("button", name="Try again").click()
        expect(page.get_by_role("button", name="Add key for OpenAI")).to_be_visible()

    @pytest.mark.parametrize("width", [320, 375, 768, 1024, 1280])
    def test_no_horizontal_overflow(self, page, server_url, env_file, width):
        env_file.write_text("A_VERY_LONG_CUSTOM_KEY_NAME_THAT_COULD_BREAK_THE_LAYOUT_ON_SMALL_SCREENS=x\n")
        page.set_viewport_size({"width": width, "height": 800})
        self.open(page, server_url)
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
