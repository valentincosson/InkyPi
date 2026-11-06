"""L'aperçu dans le formulaire d'un plugin, dans un vrai navigateur."""
import io
import os

import pytest
from PIL import Image

import utils.app_utils as app_utils
from .test_ui_browser import browser, current_image, page, server_url, ui_app  # noqa: F401

playwright_api = pytest.importorskip("playwright.sync_api")
expect = playwright_api.expect

pytestmark = pytest.mark.browser

UP_TO_DATE = "Preview up to date"
OUT_OF_DATE = "Preview out of date"
NONE = "No preview yet"


def png(color="red", size=(800, 480)):
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def open_form(page, server_url, plugin_id="clock", instance=None):
    query = f"?instance={instance}" if instance else ""
    page.goto(f"{server_url}/ui/plugin/{plugin_id}{query}")
    expect(page.locator("#plugin-form")).to_be_visible()


def update(page):
    page.get_by_role("button", name="Update preview").click()


def preview_status(page):
    return page.locator("#action-preview").locator("xpath=preceding-sibling::p")


def preview_image(page):
    return page.locator(".device img")


@pytest.fixture
def renders(page):
    """Répond aux aperçus sans lancer de rendu, et garde ce qui a été demandé."""
    requests = []

    def answer(route):
        requests.append(route.request)
        route.fulfill(status=200, content_type="image/png", body=png())

    page.route("**/ui/api/preview", answer)
    return requests


@pytest.fixture
def held(page):
    """Garde les réponses en attente, le temps d'observer ce qui se passe pendant le rendu."""
    routes = []
    page.route("**/ui/api/preview", lambda route: routes.append(route))
    return routes


def add_instance(device_config, plugin_id="countdown", name="Hall", settings=None, ran=True):
    manager = device_config.get_playlist_manager()
    manager.add_plugin_to_playlist(
        "Default", {"plugin_id": plugin_id, "name": name, "plugin_settings": settings if settings is not None else {"title": "Trip", "date": "2030-01-01"}, "refresh": {"interval": 3600}},
    )
    instance = manager.find_plugin(plugin_id, name)
    if ran:
        instance.latest_refresh_time = "2026-01-01T08:00:00+00:00"
        Image.new("RGB", (800, 480), "green").save(os.path.join(device_config.plugin_image_dir, instance.get_image_path()))
    return instance


class TestNewItem:
    def test_starts_without_an_image_and_asks_for_nothing(self, page, server_url):
        sent = []
        page.on("request", lambda request: sent.append(request.url) if "/ui/api/preview" in request.url else None)
        open_form(page, server_url)
        expect(preview_status(page)).to_have_text(NONE)
        expect(preview_image(page)).to_have_count(0)
        assert sent == []

    def test_typing_never_starts_a_render(self, page, server_url):
        sent = []
        page.on("request", lambda request: sent.append(request.url) if "/ui/api/preview" in request.url else None)
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Trip")
        page.wait_for_timeout(200)
        assert sent == []

    def test_shows_the_image_the_plugin_generated(self, page, server_url, renders):
        open_form(page, server_url)
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        expect(preview_image(page)).to_have_attribute("alt", "Preview of Clock")
        assert preview_image(page).evaluate("image => image.naturalWidth") == 800

    def test_sends_the_form_but_never_to_the_screen(self, page, server_url, renders):
        screen = []
        page.on("request", lambda request: screen.append(request.url) if "/update_now" in request.url else None)
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Trip")
        page.get_by_label("Date").fill("2030-01-01")
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        body = renders[0].post_data
        assert 'name="plugin_id"' in body and "countdown" in body and "Trip" in body
        assert screen == []

    def test_an_invalid_form_is_explained_and_nothing_is_rendered(self, page, server_url, renders):
        open_form(page, server_url, "rss")
        update(page)
        expect(page.get_by_text("This is required.")).to_be_visible()
        expect(page.get_by_label("Feed address")).to_be_focused()
        assert renders == []

    def test_the_check_message_leaves_once_the_form_is_valid(self, page, server_url, renders):
        open_form(page, server_url, "rss")
        update(page)
        expect(page.get_by_text("Check the highlighted fields.")).to_be_visible()
        page.get_by_label("Feed address").fill("https://example.test/feed")
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        expect(page.get_by_text("Check the highlighted fields.")).to_be_hidden()


class TestOutOfDate:
    @pytest.fixture
    def previewed(self, page, server_url, renders):
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Trip")
        page.get_by_label("Date").fill("2030-01-01")
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)

    def test_a_change_marks_it_out_of_date_and_keeps_the_image(self, page, previewed):
        expect(preview_image(page)).to_have_css("opacity", "1")
        page.get_by_label("Title").fill("Holidays")
        expect(preview_status(page)).to_have_text(OUT_OF_DATE)
        expect(preview_image(page)).to_be_visible()
        expect(preview_image(page)).to_have_css("opacity", "0.6")

    def test_going_back_to_the_same_value_makes_it_true_again(self, page, previewed):
        page.get_by_label("Title").fill("Holidays")
        expect(preview_status(page)).to_have_text(OUT_OF_DATE)
        page.get_by_label("Title").fill("Trip")
        expect(preview_status(page)).to_have_text(UP_TO_DATE)

    def test_updating_again_makes_it_up_to_date(self, page, previewed, renders):
        page.get_by_label("Title").fill("Holidays")
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        assert len(renders) == 2

    def test_a_change_during_the_render_is_not_called_up_to_date(self, page, server_url, held):
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Trip")
        page.get_by_label("Date").fill("2030-01-01")
        update(page)
        expect(preview_status(page)).to_contain_text("Generating the preview")
        page.get_by_label("Title").fill("Holidays")
        held[0].fulfill(status=200, content_type="image/png", body=png())
        expect(preview_status(page)).to_have_text(OUT_OF_DATE)
        expect(preview_image(page)).to_be_visible()

    def test_choosing_another_file_marks_it_out_of_date(self, page, server_url, renders, tmp_path):
        first, second = tmp_path / "first.png", tmp_path / "second.png"
        first.write_bytes(png("red"))
        second.write_bytes(png("blue"))
        open_form(page, server_url, "image_upload")
        files = page.locator("input[type=file]")
        files.set_input_files(str(first))
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        page.get_by_role("button", name="Remove first.png").click()
        expect(preview_status(page)).to_have_text(OUT_OF_DATE)
        files.set_input_files(str(second))
        expect(preview_status(page)).to_have_text(OUT_OF_DATE)


class TestDuringTheRender:
    def test_says_what_it_is_doing_and_blocks_the_other_actions(self, page, server_url, held):
        screen = []
        page.on("request", lambda request: screen.append(request.url) if "/update_now" in request.url else None)
        open_form(page, server_url)
        update(page)
        expect(preview_status(page)).to_contain_text("Generating the preview")
        expect(page.locator("#action-preview")).to_have_attribute("aria-busy", "true")
        expect(page.locator(".device-progress")).to_be_visible()

        show = page.get_by_role("button", name="Show on screen")
        expect(show).to_have_attribute("aria-disabled", "true")
        show.click(force=True)
        page.locator("#action-add").click(force=True)
        expect(page.get_by_role("dialog")).to_be_hidden()
        page.locator("#action-preview").click(force=True)
        assert len(held) == 1
        assert screen == []

        held[0].fulfill(status=200, content_type="image/png", body=png())
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        expect(show).not_to_have_attribute("aria-disabled", "true")
        expect(page.locator(".device-progress")).to_have_count(0)

    def test_cannot_start_while_sending_to_the_screen(self, page, server_url):
        sent = []
        page.route("**/update_now", lambda route: None)
        page.on("request", lambda request: sent.append(request.url) if "/ui/api/preview" in request.url else None)
        open_form(page, server_url)
        page.get_by_role("button", name="Show on screen").click()
        expect(page.locator("#action-preview")).to_have_attribute("aria-disabled", "true")
        page.locator("#action-preview").click(force=True)
        page.wait_for_timeout(100)
        assert sent == []

    def test_leaving_the_page_stays_quiet(self, page, server_url, held):
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        open_form(page, server_url)
        update(page)
        expect(preview_status(page)).to_contain_text("Generating the preview")
        page.get_by_role("link", name="Plugins", exact=True).first.click()
        expect(page.get_by_role("heading", name="Plugins", level=1)).to_be_visible()
        expect(page.get_by_role("alert")).to_have_count(0)
        assert errors == []


class TestFailures:
    def test_a_refusal_is_explained_and_the_previous_image_stays(self, page, server_url):
        answers = [
            {"status": 200, "content_type": "image/png", "body": png()},
            {"status": 500, "json": {"error": "OPEN AI API Key not configured."}},
        ]
        page.route("**/ui/api/preview", lambda route: route.fulfill(**answers.pop(0)))
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Trip")
        page.get_by_label("Date").fill("2030-01-01")
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        page.get_by_label("Title").fill("Holidays")
        update(page)
        expect(page.get_by_role("alert")).to_have_text("Couldn't update the preview: OPEN AI API Key not configured.")
        expect(preview_image(page)).to_be_visible()
        expect(preview_status(page)).to_have_text(OUT_OF_DATE)
        expect(page.locator("#action-preview")).not_to_have_attribute("aria-disabled", "true")

    def test_a_silent_device_is_explained(self, page, server_url):
        page.route("**/ui/api/preview", lambda route: route.abort())
        open_form(page, server_url)
        update(page)
        expect(page.get_by_role("alert")).to_have_text("The device didn't answer. Check that it's on, then try again.")
        expect(preview_status(page)).to_have_text(NONE)

    def test_the_message_leaves_with_the_next_change(self, page, server_url):
        page.route("**/ui/api/preview", lambda route: route.fulfill(status=500, json={"error": "no"}))
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Trip")
        page.get_by_label("Date").fill("2030-01-01")
        update(page)
        expect(page.get_by_role("alert")).to_be_visible()
        page.get_by_label("Title").fill("Holidays")
        expect(page.get_by_role("alert")).to_have_count(0)


    @pytest.mark.parametrize("width", [320, 390, 1280])
    def test_a_long_message_never_widens_the_page(self, page, server_url, width):
        message = "Failed to fetch https://example.test/" + "a" * 300
        page.set_viewport_size({"width": width, "height": 800})
        page.route("**/ui/api/preview", lambda route: route.fulfill(status=500, json={"error": message}))
        open_form(page, server_url)
        update(page)
        expect(page.get_by_role("alert")).to_contain_text(message)
        assert page.evaluate("document.documentElement.scrollWidth") <= width


class TestExistingItem:
    def test_starts_from_its_last_image_with_its_date(self, page, server_url, ui_app):
        add_instance(ui_app.config["DEVICE_CONFIG"])
        open_form(page, server_url, "countdown", "Hall")
        expect(preview_status(page)).to_contain_text("Last image:")
        expect(preview_status(page)).to_contain_text("Jan")
        expect(preview_image(page)).to_be_visible()
        assert preview_image(page).evaluate("image => image.naturalWidth") == 800

    def test_a_change_marks_its_last_image_out_of_date(self, page, server_url, ui_app):
        add_instance(ui_app.config["DEVICE_CONFIG"])
        open_form(page, server_url, "countdown", "Hall")
        page.get_by_label("Title").fill("Holidays")
        expect(preview_status(page)).to_have_text(OUT_OF_DATE)

    def test_never_ran_means_no_image(self, page, server_url, ui_app):
        add_instance(ui_app.config["DEVICE_CONFIG"], ran=False)
        open_form(page, server_url, "countdown", "Hall")
        expect(preview_status(page)).to_have_text(NONE)
        expect(preview_image(page)).to_have_count(0)

    def test_a_missing_file_falls_back_to_no_image(self, page, server_url, ui_app):
        config = ui_app.config["DEVICE_CONFIG"]
        instance = add_instance(config)
        os.remove(os.path.join(config.plugin_image_dir, instance.get_image_path()))
        open_form(page, server_url, "countdown", "Hall")
        expect(preview_status(page)).to_have_text(NONE)
        expect(preview_image(page)).to_have_count(0)

    def test_saving_keeps_a_preview_of_the_same_settings_up_to_date(self, page, server_url, ui_app, renders):
        add_instance(ui_app.config["DEVICE_CONFIG"])
        open_form(page, server_url, "countdown", "Hall")
        page.get_by_label("Title").fill("Holidays")
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        page.get_by_role("button", name="Save", exact=True).click()
        expect(page.get_by_text("Saved", exact=True)).to_be_visible()
        expect(preview_status(page)).to_have_text(UP_TO_DATE)

    def test_saving_does_not_pretend_the_old_image_has_changed(self, page, server_url, ui_app):
        add_instance(ui_app.config["DEVICE_CONFIG"])
        open_form(page, server_url, "countdown", "Hall")
        page.get_by_label("Title").fill("Holidays")
        page.get_by_role("button", name="Save", exact=True).click()
        expect(page.get_by_text("Saved", exact=True)).to_be_visible()
        expect(preview_status(page)).to_have_text(OUT_OF_DATE)

    def test_a_saved_file_keeps_the_preview_up_to_date(self, page, server_url, ui_app, renders, tmp_path, monkeypatch):
        """Le fichier revient du serveur avec son adresse : ce sont pourtant les mêmes réglages."""
        monkeypatch.setattr(app_utils, "resolve_path", lambda path: str(tmp_path))
        add_instance(ui_app.config["DEVICE_CONFIG"], "image_upload", settings={"padImage": "false"}, ran=False)
        picture = tmp_path / "chosen.png"
        picture.write_bytes(png())
        open_form(page, server_url, "image_upload", "Hall")
        page.locator("input[type=file]").set_input_files(str(picture))
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        page.get_by_role("button", name="Save", exact=True).click()
        expect(page.get_by_text("Saved", exact=True)).to_be_visible()
        expect(preview_status(page)).to_have_text(UP_TO_DATE)

    def test_a_restored_draft_is_out_of_date_at_once(self, page, server_url, ui_app):
        add_instance(ui_app.config["DEVICE_CONFIG"])
        open_form(page, server_url, "countdown", "Hall")
        page.get_by_label("Title").fill("Holidays")
        page.reload()
        expect(page.get_by_text("Draft restored.")).to_be_visible()
        expect(preview_status(page)).to_have_text(OUT_OF_DATE)


class TestShownOnScreen:
    def test_shows_what_just_went_on_the_screen_without_a_second_render(self, page, server_url, current_image):
        sent = []
        page.on("request", lambda request: sent.append(request.url) if "/ui/api/preview" in request.url else None)
        open_form(page, server_url)
        page.get_by_role("button", name="Show on screen").click()
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        expect(page.get_by_role("status").filter(has_text="On the screen")).to_have_count(1)
        assert "/api/current_image" in preview_image(page).get_attribute("src")
        assert sent == []


class TestSharpness:
    def test_a_sharper_preview_of_the_same_settings_stays_after_showing_it(self, page, server_url, renders):
        open_form(page, server_url)
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        source = preview_image(page).get_attribute("src")
        page.get_by_role("button", name="Show on screen").click()
        expect(page.get_by_role("status").filter(has_text="On the screen")).to_be_visible()
        assert preview_image(page).get_attribute("src") == source

    def test_showing_other_settings_replaces_the_preview(self, page, server_url, renders):
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Trip")
        page.get_by_label("Date").fill("2030-01-01")
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        page.get_by_label("Title").fill("Holidays")
        page.get_by_role("button", name="Show on screen").click()
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        assert "/api/current_image" in preview_image(page).get_attribute("src")

    def test_a_double_density_image_keeps_the_shape_of_the_frame(self, page, server_url):
        page.route("**/ui/api/preview", lambda route: route.fulfill(status=200, content_type="image/png", body=png(size=(1600, 960))))
        open_form(page, server_url)
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        assert preview_image(page).evaluate("image => image.naturalWidth") == 1600
        box = preview_image(page).bounding_box()
        assert box["width"] / box["height"] == pytest.approx(800 / 480, abs=0.01)


class TestRealRoute:
    def test_a_real_plugin_and_a_chosen_file(self, page, server_url, ui_app, tmp_path):
        """Tout le trajet, avec le vrai plugin Image Upload : rien ne doit rester."""
        config = ui_app.config["DEVICE_CONFIG"]
        saved = os.path.join(config.BASE_DIR, "static", "images", "saved")
        before = sorted(os.listdir(saved))
        with open(config.config_file, "rb") as file:
            device_before = file.read()
        picture = tmp_path / "from-the-test.png"
        picture.write_bytes(png("blue", (1600, 960)))

        open_form(page, server_url, "image_upload")
        page.locator("input[type=file]").set_input_files(str(picture))
        update(page)

        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        assert preview_image(page).evaluate("image => [image.naturalWidth, image.naturalHeight]") == [800, 480]
        assert sorted(os.listdir(saved)) == before
        with open(config.config_file, "rb") as file:
            assert file.read() == device_before
        assert not os.path.exists(config.current_image_file)


class TestLayout:
    def test_on_a_phone_the_preview_comes_before_the_form(self, page, server_url):
        page.set_viewport_size({"width": 390, "height": 844})
        open_form(page, server_url)
        frame = page.locator(".device").bounding_box()
        form = page.locator("#plugin-form").bounding_box()
        assert frame["y"] + frame["height"] <= form["y"]
        assert frame["width"] <= 390

    def test_on_a_computer_it_sits_beside_the_form(self, page, server_url):
        page.set_viewport_size({"width": 1280, "height": 800})
        open_form(page, server_url)
        frame = page.locator(".device").bounding_box()
        form = page.locator("#plugin-form").bounding_box()
        assert frame["x"] >= form["x"] + form["width"]

    def test_a_portrait_screen_gets_a_portrait_frame(self, page, server_url, ui_app):
        ui_app.config["DEVICE_CONFIG"].update_value("orientation", "vertical")
        page.set_viewport_size({"width": 1280, "height": 900})
        open_form(page, server_url)
        frame = page.locator(".device").bounding_box()
        assert frame["height"] > frame["width"]
        assert frame["width"] <= 280


class TestOutOfSightOnAPhone:
    @pytest.fixture
    def stale_on_a_phone(self, page, server_url, renders):
        page.set_viewport_size({"width": 390, "height": 844})
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Trip")
        page.get_by_label("Date").fill("2030-01-01")
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        page.get_by_label("Title").fill("Holidays")

    def test_the_bar_says_it_is_out_of_date_and_can_update_it(self, page, stale_on_a_phone, renders):
        bar = page.locator("#plugin-actions")
        expect(bar).to_contain_text(OUT_OF_DATE)
        bar.get_by_role("button", name="Update preview").click()
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        expect(bar).not_to_contain_text(OUT_OF_DATE)
        assert len(renders) == 2
        expect(page.locator("#action-preview")).to_be_focused()
        expect(page.locator(".device")).to_be_in_viewport()

    def test_the_bar_stays_quiet_on_a_computer(self, page, server_url, renders):
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Trip")
        page.get_by_label("Date").fill("2030-01-01")
        update(page)
        expect(preview_status(page)).to_have_text(UP_TO_DATE)
        page.get_by_label("Title").fill("Holidays")
        expect(page.locator("#plugin-actions").get_by_text(OUT_OF_DATE)).to_be_hidden()

    def test_the_bar_never_covers_the_footer(self, page, stale_on_a_phone):
        page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        box = page.get_by_role("link", name="Third-party licences").bounding_box()
        bar = page.locator("#plugin-actions").bounding_box()
        assert box["y"] + box["height"] <= bar["y"]


class TestNotes:
    @pytest.mark.parametrize("plugin_id", ["ai_text", "ai_image"])
    def test_a_billed_plugin_says_so_before_the_click(self, page, server_url, plugin_id):
        open_form(page, server_url, plugin_id)
        expect(page.get_by_text("Each preview is billed by OpenAI")).to_be_visible()

    def test_other_plugins_stay_quiet(self, page, server_url):
        open_form(page, server_url)
        expect(page.get_by_text("Each preview is billed by OpenAI")).to_have_count(0)

    def test_it_is_translated(self, page, server_url):
        page.add_init_script("localStorage.setItem('inkypi-lang', 'fr')")
        open_form(page, server_url)
        expect(page.get_by_role("button", name="Mettre à jour l'aperçu")).to_be_visible()
        expect(preview_status(page)).to_have_text("Pas encore d'aperçu")
