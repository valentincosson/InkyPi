"""Formulaires de plugins de la nouvelle interface, dans un vrai navigateur et avec les vraies routes."""
import json
import os

import pytest

import utils.app_utils as app_utils
from refresh_task import ManualRefresh
from .test_ui_browser import browser, current_image, page, server_url, ui_app  # noqa: F401

playwright_api = pytest.importorskip("playwright.sync_api")
expect = playwright_api.expect

pytestmark = pytest.mark.browser

SNAPSHOTS = os.path.join(os.path.dirname(__file__), "snapshots")
PLUGIN_IDS = sorted(name.removesuffix(".json") for name in os.listdir(os.path.join(SNAPSHOTS, "plugin_forms")))


def plugin_params():
    with open(os.path.join(SNAPSHOTS, "plugin_params.json")) as snapshot:
        return json.load(snapshot)


def realistic_settings(plugin_id):
    """Les captures remplissent les champs avec du texte de test : on le remplace là où une vraie adresse est exigée."""
    with open(os.path.join(SNAPSHOTS, "plugin_forms", f"{plugin_id}.json")) as snapshot:
        stored = json.load(snapshot)["stored_settings"]
    stored = {
        name: [item for item in value if item != "file:"] if isinstance(value, list) else value
        for name, value in stored.items()
        if value != "file:"
    }
    stored = {name: value for name, value in stored.items() if value != []}
    if "url" in stored:
        stored["url"] = "https://example.test/path"
    if "feedUrl" in stored:
        stored["feedUrl"] = "https://example.test/feed"
    if "calendarURLs[]" in stored:
        stored["calendarURLs[]"] = ["https://example.test/a.ics"]
    if plugin_id == "image_upload":
        stored["imageFiles[]"] = ["/saved/a.png"]
    if plugin_id == "newspaper":
        newspaper = plugin_params()["newspaper"]["newspapers"][0]
        stored.update(newspaperName=newspaper["name"], newspaperSlug=newspaper["slug"], locationSearch=f"{newspaper['city']}, {newspaper['country']}")
    return stored


@pytest.fixture(autouse=True)
def no_outside_requests(page):
    """Rien ne doit sortir vers internet pendant les tests ; ils déclarent ce qu'ils simulent."""
    page.outside = []

    def block(route):
        if route.request.url.startswith("http://127.0.0.1"):
            route.fallback()
        else:
            page.outside.append(route.request.url)
            route.abort()

    page.route("**/*", block)


def add_instance(device_config, plugin_id, settings, name="Snapshot", refresh=None):
    device_config.get_playlist_manager().add_plugin_to_playlist(
        "Default",
        {"plugin_id": plugin_id, "name": name, "plugin_settings": settings, "refresh": refresh or {"interval": 3600}},
    )
    return device_config.get_playlist_manager().find_plugin(plugin_id, name)


def open_form(page, server_url, plugin_id, instance=None):
    query = f"?instance={instance}" if instance else ""
    page.goto(f"{server_url}/ui/plugin/{plugin_id}{query}")
    expect(page.locator("#plugin-form")).to_be_visible()


def press(page, name):
    page.get_by_role("button", name=name, exact=True).click()


class TestContract:
    @pytest.mark.parametrize("plugin_id", PLUGIN_IDS)
    def test_saving_unchanged_keeps_every_setting(self, page, server_url, device_config, plugin_id):
        stored = realistic_settings(plugin_id)
        instance = add_instance(device_config, plugin_id, dict(stored))
        open_form(page, server_url, plugin_id, "Snapshot")

        press(page, "Save")

        expect(page.get_by_role("status").filter(has_text="Saved")).to_be_visible()
        assert instance.settings == stored
        assert page.errors == []

    @pytest.mark.parametrize("plugin_id", PLUGIN_IDS)
    @pytest.mark.parametrize("language", ["en", "fr"])
    def test_every_label_is_translated(self, page, server_url, plugin_id, language):
        page.add_init_script(f"localStorage.setItem('inkypi-lang', '{language}')")
        open_form(page, server_url, plugin_id)
        for details in page.locator("#plugin-form details").all():
            details.locator("summary").click()
        text = page.locator("body").inner_text()
        assert "pf." not in text
        assert "form." not in text
        assert page.outside == []


class TestActions:
    def test_show_on_screen_sends_the_form(self, page, server_url, refresh_task):
        open_form(page, server_url, "clock")
        page.get_by_text("Digital", exact=True).click()
        press(page, "Show on screen")
        expect(page.get_by_role("status").filter(has_text="On the screen")).to_be_visible()
        action = refresh_task.actions[0]
        assert isinstance(action, ManualRefresh)
        assert action.plugin_id == "clock"
        assert action.plugin_settings["selectedClockFace"] == "Digital Clock"

    def test_failure_keeps_the_form_and_says_why(self, page, server_url):
        page.route("**/update_now", lambda route: route.fulfill(status=500, json={"error": "An error occurred: no network"}))
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Holidays")
        page.get_by_label("Date").fill("2031-03-14")
        press(page, "Show on screen")
        expect(page.get_by_role("alert").filter(has_text="Couldn't show this on the screen: An error occurred: no network")).to_be_visible()
        expect(page.get_by_label("Title")).to_have_value("Holidays")

    def test_unreachable_device_is_explained(self, page, server_url):
        open_form(page, server_url, "year_progress")
        page.route("**/update_now", lambda route: route.abort())
        press(page, "Show on screen")
        expect(page.get_by_role("alert").filter(has_text="The device didn't answer")).to_be_visible()

    def test_add_to_playlist(self, page, server_url, device_config):
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Holidays")
        page.get_by_label("Date").fill("2031-03-14")
        press(page, "Add to playlist")

        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_label("Name")).to_be_focused()
        dialog.get_by_label("Name").fill("Summer")
        dialog.get_by_role("textbox", name="Every").fill("2")
        dialog.get_by_role("button", name="Add to playlist").click()

        expect(page.get_by_role("status").filter(has_text="Summer added to Default")).to_be_visible()
        instance = device_config.get_playlist_manager().find_plugin("countdown", "Summer")
        assert instance.settings["date"] == "2031-03-14"
        assert instance.refresh == {"interval": 7200}

    def test_suggested_name_is_accepted(self, page, server_url, device_config):
        open_form(page, server_url, "wpotd")
        press(page, "Add to playlist")
        page.get_by_role("dialog").get_by_role("button", name="Add to playlist").click()
        expect(page.get_by_role("status").filter(has_text="added to Default")).to_be_visible()
        assert device_config.get_playlist_manager().find_plugin("wpotd", "Wikipedia Picture of the day")

    def test_daily_refresh(self, page, server_url, device_config):
        open_form(page, server_url, "year_progress")
        press(page, "Add to playlist")
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("Name").fill("Year")
        dialog.get_by_role("button", name="Daily at").click()
        dialog.locator("#add-time").fill("06:15")
        dialog.get_by_role("button", name="Add to playlist").click()
        expect(dialog).to_be_hidden()
        assert device_config.get_playlist_manager().find_plugin("year_progress", "Year").refresh == {"scheduled": "06:15"}

    @pytest.mark.parametrize(
        "name,message",
        [("", "Enter a name."), ("L'heure", "Use only letters"), ("Living room", "already exists")],
    )
    def test_refused_names_keep_the_dialog_open(self, page, server_url, name, message):
        open_form(page, server_url, "clock")
        press(page, "Add to playlist")
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("Name").fill(name)
        dialog.get_by_role("button", name="Add to playlist").click()
        expect(dialog.get_by_role("alert")).to_contain_text(message)
        expect(dialog.get_by_label("Name")).to_have_value(name)

    def test_save_as_makes_a_copy_and_keeps_the_original(self, page, server_url, device_config):
        original = add_instance(device_config, "countdown", {"title": "Old", "date": "2031-03-14"})
        open_form(page, server_url, "countdown", "Snapshot")
        page.get_by_label("Title").fill("New")
        press(page, "Save as…")
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("Name").fill("Copy")
        dialog.get_by_role("button", name="Save").click()
        expect(dialog).to_be_hidden()
        assert device_config.get_playlist_manager().find_plugin("countdown", "Copy").settings["title"] == "New"
        assert original.settings["title"] == "Old"

    @pytest.mark.parametrize("stored,shown", [({"interval": 5400}, "90"), ({"interval": 86400}, "1")])
    def test_refresh_schedule_shows_the_stored_value(self, page, server_url, device_config, stored, shown):
        add_instance(device_config, "clock", {"selectedClockFace": "Digital Clock"}, refresh=stored)
        open_form(page, server_url, "clock", "Snapshot")
        press(page, "Refresh schedule")
        expect(page.locator("#edit-interval")).to_have_value(shown)

    def test_refresh_schedule_keeps_the_settings(self, page, server_url, device_config):
        instance = add_instance(device_config, "clock", {"selectedClockFace": "Digital Clock"})
        open_form(page, server_url, "clock", "Snapshot")
        press(page, "Refresh schedule")
        dialog = page.get_by_role("dialog")
        dialog.get_by_role("button", name="Daily at").click()
        dialog.locator("#edit-time").fill("05:30")
        dialog.get_by_role("button", name="Save").click()
        expect(page.get_by_role("status").filter(has_text="Refresh schedule saved")).to_be_visible()
        assert instance.refresh == {"scheduled": "05:30"}
        assert instance.settings == {"selectedClockFace": "Digital Clock"}


class TestFocusAndLayout:
    @pytest.mark.parametrize("how", ["cancel", "escape"])
    def test_focus_returns_to_the_opener_after_closing(self, page, server_url, how):
        open_form(page, server_url, "clock")
        opener = page.get_by_role("button", name="Add to playlist")
        opener.click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_label("Name")).to_be_focused()
        if how == "cancel":
            dialog.get_by_role("button", name="Cancel").click()
        else:
            page.keyboard.press("Escape")
        expect(dialog).to_be_hidden()
        expect(opener).to_be_focused()

    def test_focus_returns_to_the_opener_after_adding(self, page, server_url):
        open_form(page, server_url, "clock")
        opener = page.get_by_role("button", name="Add to playlist")
        opener.click()
        page.get_by_role("dialog").get_by_role("button", name="Add to playlist").click()
        expect(page.get_by_role("dialog")).to_be_hidden()
        expect(opener).to_be_focused()

    def test_skip_link_reaches_the_actions(self, page, server_url):
        open_form(page, server_url, "weather")
        link = page.get_by_role("link", name="Skip to the actions")
        link.focus()
        link.press("Enter")
        expect(page.get_by_role("button", name="Update preview")).to_be_focused()
        page.keyboard.press("Tab")
        expect(page.get_by_role("button", name="Show on screen")).to_be_focused()

    def test_colour_palette_is_one_tab_stop(self, page, server_url):
        open_form(page, server_url, "countdown")
        page.get_by_role("radio", name="Background colour: White").focus()
        page.keyboard.press("Tab")
        focused = page.evaluate("document.activeElement.getAttribute('aria-label')")
        assert focused == "Background colour: Other colour"

    def test_status_does_not_outlive_what_it_describes(self, page, server_url):
        open_form(page, server_url, "rss")
        press(page, "Show on screen")
        message = page.get_by_role("alert").filter(has_text="Check the highlighted fields.")
        expect(message).to_be_visible()
        page.get_by_label("Feed address").fill("https://example.test/feed")
        expect(message).to_be_hidden()

    @pytest.mark.parametrize("size", [(320, 568), (390, 844), (768, 1024)])
    def test_action_bar_never_covers_the_footer(self, page, server_url, size):
        page.set_viewport_size({"width": size[0], "height": size[1]})
        open_form(page, server_url, "clock")
        page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        link = page.get_by_role("link", name="Third-party licences")
        box = link.bounding_box()
        bar = page.locator("#plugin-actions").bounding_box()
        assert box["y"] + box["height"] <= bar["y"]

    def test_frames_and_names_are_translated(self, page, server_url):
        page.add_init_script("localStorage.setItem('inkypi-lang', 'fr')")
        open_form(page, server_url, "countdown")
        expect(page.get_by_role("heading", name="Compte à rebours", level=1)).to_be_visible()
        expect(page.get_by_text("Haut et bas")).to_be_visible()


class TestValidation:
    def test_missing_field_is_explained_and_nothing_is_sent(self, page, server_url):
        sent = []
        page.on("request", lambda request: sent.append(request.url) if "/update_now" in request.url else None)
        open_form(page, server_url, "rss")
        press(page, "Show on screen")
        field = page.get_by_label("Feed address")
        expect(page.get_by_text("This is required.")).to_be_visible()
        expect(field).to_be_focused()
        assert sent == []

    def test_error_clears_while_typing(self, page, server_url):
        open_form(page, server_url, "rss")
        press(page, "Show on screen")
        field = page.get_by_label("Feed address")
        field.fill("example.com")
        expect(page.get_by_text("Enter an address starting with")).to_be_visible()
        field.fill("https://example.com/feed")
        expect(page.get_by_text("Enter an address starting with")).to_be_hidden()

    def test_dialog_waits_for_a_valid_form(self, page, server_url):
        open_form(page, server_url, "rss")
        press(page, "Add to playlist")
        expect(page.get_by_role("dialog")).to_be_hidden()
        expect(page.get_by_text("This is required.")).to_be_visible()

    def test_error_inside_a_closed_section_opens_it(self, page, server_url):
        open_form(page, server_url, "year_progress")
        page.locator("details summary").click()
        page.get_by_label("Top", exact=True).fill("500")
        page.locator("details summary").click()
        press(page, "Show on screen")
        expect(page.get_by_label("Top", exact=True)).to_be_focused()


class TestDrafts:
    def test_draft_comes_back_after_leaving_and_can_be_discarded(self, page, server_url):
        open_form(page, server_url, "countdown")
        page.get_by_label("Title").fill("Typed")
        page.get_by_role("link", name="Screen").click()
        page.wait_for_url("**/ui/")
        page.go_back()

        expect(page.get_by_text("Draft restored.")).to_be_visible()
        expect(page.get_by_label("Title")).to_have_value("Typed")

        press(page, "Discard it")
        expect(page.get_by_label("Title")).to_have_value("")
        page.reload()
        expect(page.locator("#plugin-form")).to_be_visible()
        expect(page.get_by_text("Draft restored.")).to_be_hidden()

    def test_saving_clears_the_draft(self, page, server_url, device_config):
        add_instance(device_config, "countdown", {"title": "Old", "date": "2031-03-14"})
        open_form(page, server_url, "countdown", "Snapshot")
        page.get_by_label("Title").fill("New")
        press(page, "Save")
        expect(page.get_by_role("status").filter(has_text="Saved")).to_be_visible()
        page.reload()
        expect(page.get_by_label("Title")).to_have_value("New")
        expect(page.get_by_text("Draft restored.")).to_be_hidden()

    def test_each_instance_has_its_own_draft(self, page, server_url, device_config):
        add_instance(device_config, "countdown", {"title": "One", "date": "2031-03-14"}, name="First")
        add_instance(device_config, "countdown", {"title": "Two", "date": "2031-03-14"}, name="Second")
        open_form(page, server_url, "countdown", "First")
        page.get_by_label("Title").fill("Typed")
        open_form(page, server_url, "countdown", "Second")
        expect(page.get_by_label("Title")).to_have_value("Two")

    def test_moving_between_entries_never_mixes_their_settings(self, page, server_url, device_config):
        first = add_instance(device_config, "countdown", {"title": "AAA", "date": "2031-03-14"}, name="Alpha")
        second = add_instance(device_config, "countdown", {"title": "BBB", "date": "2032-04-15"}, name="Beta")
        open_form(page, server_url, "countdown", "Alpha")
        expect(page.get_by_label("Title")).to_have_value("AAA")

        page.evaluate("history.pushState({}, '', '/ui/plugin/countdown?instance=Beta')")

        expect(page.get_by_role("heading", name="Beta", level=1)).to_be_visible()
        expect(page.get_by_label("Title")).to_have_value("BBB")
        press(page, "Save")
        expect(page.get_by_role("status").filter(has_text="Saved")).to_be_visible()
        assert second.settings["title"] == "BBB"
        assert second.settings["date"] == "2032-04-15"
        assert first.settings["title"] == "AAA"

    def test_corrupted_draft_is_ignored(self, page, server_url):
        page.add_init_script("localStorage.setItem('inkypi-draft:countdown:', '{not json')")
        open_form(page, server_url, "countdown")
        expect(page.get_by_label("Title")).to_have_value("")
        assert page.errors == []

    def test_chosen_files_are_protected_by_a_confirmation(self, page, server_url):
        open_form(page, server_url, "image_upload")
        page.locator("input[type=file]").set_input_files({"name": "a.png", "mimeType": "image/png", "buffer": b"png"})
        page.get_by_role("link", name="Screen").click()
        expect(page.get_by_role("alertdialog")).to_contain_text("Leave without saving?")


class TestFields:
    def test_the_other_colour_button_is_the_colour_field_itself(self, page, server_url):
        """Certains navigateurs n'ouvrent le sélecteur que si le clic tombe sur le champ, partout sur le bouton."""
        open_form(page, server_url, "year_progress")
        field = page.get_by_label("Background colour: Other colour")
        hits = field.evaluate("""input => {
            const box = input.closest("label").getBoundingClientRect()
            const points = [[.5, .5], [.2, .5], [.8, .5], [.5, .2], [.5, .8]]
            return points.map(([x, y]) => document.elementFromPoint(box.x + box.width * x, box.y + box.height * y) === input)
        }""")
        assert all(hits)

    def test_choosing_another_colour_replaces_the_plus(self, page, server_url, refresh_task):
        open_form(page, server_url, "year_progress")
        control = page.locator("label[title='Other colour']").first
        expect(control.locator("svg")).to_have_count(1)
        page.get_by_label("Background colour: Other colour").fill("#123456")
        expect(control.locator("svg")).to_have_count(0)
        expect(control.locator("span")).to_have_css("background-color", "rgb(18, 52, 86)")
        press(page, "Show on screen")
        expect(page.get_by_role("status").filter(has_text="On the screen")).to_be_visible()
        assert "#123456" in refresh_task.actions[0].plugin_settings.values()

    def test_conditional_fields(self, page, server_url):
        open_form(page, server_url, "github")
        expect(page.get_by_label("Repository")).to_be_hidden()
        page.locator("#field-githubType").click()
        page.get_by_role("option", name="Stars").click()
        expect(page.get_by_label("Repository")).to_be_visible()

    def test_clock_face_sets_its_colours(self, page, server_url):
        faces = plugin_params()["clock"]["clock_faces"]
        open_form(page, server_url, "clock")
        page.get_by_text("Digital", exact=True).click()
        expect(page.locator("#field-primaryColor")).to_have_value(faces[1]["primary_color"])

    def test_empty_option_keeps_its_label(self, page, server_url):
        open_form(page, server_url, "unsplash")
        expect(page.locator("#field-color")).to_contain_text("Any")

    def test_low_contrast_is_flagged(self, page, server_url):
        open_form(page, server_url, "countdown")
        warning = page.get_by_text("may be hard to read")
        expect(warning).to_be_hidden()
        page.get_by_role("radio", name="Text colour: White").check(force=True)
        expect(warning).to_be_visible()

    def test_lists_can_grow_to_their_limit_and_shrink(self, page, server_url):
        open_form(page, server_url, "todo_list")
        add = page.get_by_role("button", name="Add a list")
        add.click()
        expect(page.locator("#field-lists-1-list-title")).to_be_focused()
        add.click()
        expect(add).to_be_hidden()
        page.get_by_role("button", name="Remove item 2").click()
        expect(add).to_be_focused()
        expect(page.get_by_label("List title")).to_have_count(2)

    def test_calendar_rows_are_validated_one_by_one(self, page, server_url):
        open_form(page, server_url, "calendar")
        page.get_by_label("Calendar address").fill("https://example.test/a.ics")
        page.get_by_role("button", name="Add a calendar").click()
        press(page, "Show on screen")
        expect(page.locator("#field-calendars-1-calendarURLs")).to_be_focused()
        expect(page.get_by_text("This is required.")).to_have_count(1)

    def test_shared_icloud_calendar_can_be_saved(self, page, server_url, device_config):
        stored = {**realistic_settings("calendar"), "calendarURLs[]": ["webcal://p01.icloud.com/a.ics"]}
        instance = add_instance(device_config, "calendar", dict(stored))
        open_form(page, server_url, "calendar", "Snapshot")
        press(page, "Save")
        expect(page.get_by_role("status").filter(has_text="Saved")).to_be_visible()
        assert instance.settings["calendarURLs[]"] == ["webcal://p01.icloud.com/a.ics"]

    def test_calendar_layout_changes_the_options(self, page, server_url, refresh_task):
        open_form(page, server_url, "calendar")
        now = page.get_by_role("switch", name="Current time line")
        expect(now).to_be_hidden()
        page.get_by_role("button", name="Day", exact=True).click()
        expect(now).to_be_visible()

    def test_uploaded_image_is_saved_and_listed(self, page, server_url, device_config, monkeypatch, tmp_path):
        saved = tmp_path / "static" / "images" / "saved"
        saved.mkdir(parents=True)
        monkeypatch.setattr(app_utils, "resolve_path", lambda path: str(tmp_path / path))
        instance = add_instance(device_config, "image_upload", {"imageFiles[]": ["/saved/old.png"], "padImage": "true", "backgroundOption": "blur", "backgroundColor": "#ffffff"})
        open_form(page, server_url, "image_upload", "Snapshot")
        expect(page.get_by_text("old.png")).to_be_visible()

        page.locator("input[type=file]").set_input_files({"name": "new.png", "mimeType": "image/png", "buffer": b"png"})
        press(page, "Save")
        expect(page.get_by_role("status").filter(has_text="Saved")).to_be_visible()

        assert instance.settings["imageFiles[]"] == ["/saved/old.png", str(saved / "new.png")]
        press(page, "Save")
        expect(page.get_by_role("status").filter(has_text="Saved")).to_be_visible()
        assert instance.settings["imageFiles[]"] == ["/saved/old.png", str(saved / "new.png")]

    def test_unsupported_file_is_refused_before_sending(self, page, server_url):
        open_form(page, server_url, "image_upload")
        page.locator("input[type=file]").set_input_files({"name": "notes.txt", "mimeType": "text/plain", "buffer": b"x"})
        press(page, "Show on screen")
        expect(page.get_by_text("Use PNG, JPEG")).to_be_visible()

    def test_newspaper_search_finds_by_city(self, page, server_url):
        newspaper = plugin_params()["newspaper"]["newspapers"][0]
        open_form(page, server_url, "newspaper")
        field = page.get_by_role("combobox", name="Newspaper")
        field.fill(newspaper["city"])
        page.get_by_role("option", name=newspaper["name"]).first.click()
        expect(field).to_have_value(newspaper["name"])

    def test_newspaper_location_is_restored(self, page, server_url, device_config):
        stored = realistic_settings("newspaper")
        instance = add_instance(device_config, "newspaper", dict(stored))
        open_form(page, server_url, "newspaper", "Snapshot")
        expect(page.get_by_role("combobox", name="Newspaper")).to_have_value(stored["newspaperName"])
        press(page, "Save")
        expect(page.get_by_role("status").filter(has_text="Saved")).to_be_visible()
        assert instance.settings["locationSearch"] == stored["locationSearch"]


class TestApiKeyNotice:
    def test_missing_key_points_to_the_page(self, page, server_url):
        open_form(page, server_url, "ai_text")
        expect(page.get_by_text("This needs an API key from OpenAI.")).to_be_visible()
        page.get_by_role("link", name="Add it").click()
        page.wait_for_url("**/ui/api-keys")

    def test_notice_warns_without_blocking(self, page, server_url, refresh_task):
        """La clé peut venir de l'environnement du service : seul le plugin sait si elle manque."""
        open_form(page, server_url, "unsplash")
        press(page, "Show on screen")
        expect(page.get_by_role("status").filter(has_text="On the screen")).to_be_visible()
        assert refresh_task.actions

    def test_github_stars_need_no_key(self, page, server_url):
        open_form(page, server_url, "github")
        notice = page.get_by_text("This needs an API key")
        expect(notice).to_be_visible()
        page.locator("#field-githubType").click()
        page.get_by_role("option", name="Stars").click()
        expect(notice).to_be_hidden()

    def test_adding_to_a_playlist_still_works_without_the_key(self, page, server_url, device_config):
        open_form(page, server_url, "unsplash")
        press(page, "Add to playlist")
        page.get_by_role("dialog").get_by_role("button", name="Add to playlist").click()
        expect(page.get_by_role("status").filter(has_text="added to Default")).to_be_visible()

    def test_no_notice_with_a_key(self, page, server_url, tmp_path):
        (tmp_path / ".env").write_text("OPEN_AI_SECRET=secret\n")
        open_form(page, server_url, "ai_text")
        expect(page.get_by_text("This needs an API key")).to_be_hidden()

    def test_weather_only_needs_a_key_for_openweathermap(self, page, server_url):
        open_form(page, server_url, "weather")
        expect(page.get_by_text("This needs an API key")).to_be_hidden()
        page.get_by_text("Weather source").click()
        page.locator("#field-weatherProvider").click()
        page.get_by_role("option", name="OpenWeatherMap").click()
        expect(page.get_by_text("This needs an API key from OpenWeatherMap.")).to_be_visible()


class TestWeather:
    def test_search_fills_the_coordinates(self, page, server_url):
        def geocode(route):
            assert "name=Paris" in route.request.url
            route.fulfill(json={"results": [{"id": 1, "name": "Paris", "admin1": "Île-de-France", "country": "France", "latitude": 48.85, "longitude": 2.35}]})

        page.route("https://geocoding-api.open-meteo.com/**", geocode)
        open_form(page, server_url, "weather")
        page.get_by_role("combobox", name="Place").fill("Paris")
        page.get_by_role("option", name="Paris, Île-de-France, France").click()
        expect(page.get_by_label("Latitude")).to_have_value("48.85")
        expect(page.get_by_label("Longitude")).to_have_value("2.35")

    def test_search_credits_its_sources(self, page, server_url):
        open_form(page, server_url, "weather")
        expect(page.get_by_role("link", name="Open-Meteo", exact=True)).to_have_attribute("href", "https://open-meteo.com/")
        expect(page.get_by_role("link", name="GeoNames")).to_have_attribute("href", "https://www.geonames.org/")

    def test_search_failure_offers_the_alternatives(self, page, server_url):
        page.route("https://geocoding-api.open-meteo.com/**", lambda route: route.abort())
        open_form(page, server_url, "weather")
        page.get_by_role("combobox", name="Place").fill("Paris")
        expect(page.get_by_text("Search isn't available right now.")).to_be_visible()

    def test_coordinates_are_required_and_checked(self, page, server_url):
        open_form(page, server_url, "weather")
        press(page, "Show on screen")
        message = page.get_by_text("Choose a place, or enter")
        expect(message).to_be_visible()
        page.get_by_label("Latitude").fill("100")
        page.get_by_label("Longitude").fill("2")
        expect(message).to_be_visible()
        page.get_by_label("Latitude").fill("48.85")
        expect(message).to_be_hidden()

    def test_map_is_loaded_on_demand_and_can_be_cancelled(self, page, server_url):
        open_form(page, server_url, "weather")
        assert not [url for url in page.outside if "openstreetmap" in url]
        page.get_by_label("Latitude").fill("48.85")
        page.get_by_label("Longitude").fill("2.35")
        press(page, "Pick on a map")
        dialog = page.get_by_role("dialog")
        expect(dialog.locator(".leaflet-container")).to_be_visible()
        dialog.get_by_role("button", name="Cancel").click()
        expect(dialog).to_be_hidden()
        expect(page.get_by_label("Latitude")).to_have_value("48.85")

    def test_map_click_picks_a_place(self, page, server_url):
        open_form(page, server_url, "weather")
        press(page, "Pick on a map")
        dialog = page.get_by_role("dialog")
        map_area = dialog.locator(".leaflet-container")
        expect(map_area).to_be_visible()
        page.wait_for_timeout(250)
        map_area.click(position={"x": 200, "y": 120})
        dialog.get_by_role("button", name="Use this place").click()
        expect(dialog).to_be_hidden()
        assert page.get_by_label("Latitude").input_value() != ""


class TestCatalogue:
    def test_lists_every_plugin_and_opens_a_form(self, page, server_url):
        page.goto(f"{server_url}/ui/plugins")
        expect(page.get_by_role("listitem")).to_have_count(len(PLUGIN_IDS))
        page.get_by_role("link", name="Clock").click()
        page.wait_for_url("**/ui/plugin/clock")
        expect(page.get_by_role("heading", name="Clock", level=1)).to_be_visible()

    def test_navigation_reaches_the_catalogue(self, page, server_url):
        page.goto(f"{server_url}/ui/")
        page.get_by_role("link", name="Plugins").click()
        page.wait_for_url("**/ui/plugins")

    def test_plugin_without_a_description_opens_the_old_form(self, page, server_url):
        page.goto(f"{server_url}/ui/plugin/not_described")
        page.wait_for_url(lambda url: url.endswith("/plugin/not_described") and "/ui/" not in url)

    def test_unknown_instance_is_explained(self, page, server_url):
        page.goto(f"{server_url}/ui/plugin/clock?instance=Nope")
        expect(page.get_by_role("alert").filter(has_text="Couldn't load this plugin")).to_be_visible()


@pytest.mark.parametrize("plugin_id", ["weather", "calendar", "todo_list", "clock"])
@pytest.mark.parametrize("width", [320, 390, 768, 1024, 1280])
def test_no_horizontal_overflow(page, server_url, plugin_id, width):
    page.set_viewport_size({"width": width, "height": 800})
    open_form(page, server_url, plugin_id)
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
