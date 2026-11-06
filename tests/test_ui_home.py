"""Accueil et catalogue de la nouvelle interface, dans un vrai navigateur."""
from datetime import datetime, timedelta, timezone

import pytest

from model import RefreshInfo
from refresh_task import PlaylistRefresh

from .test_ui import fill_default_playlist
from .test_ui_browser import browser, current_image, page, server_url, ui_app  # noqa: F401

playwright_api = pytest.importorskip("playwright.sync_api")
expect = playwright_api.expect

pytestmark = pytest.mark.browser

INFORMATION = {"weather", "calendar", "clock", "todo_list", "countdown", "year_progress", "rss", "newspaper", "comic", "github", "ai_text", "screenshot"}


def refreshed(device_config, minutes_ago=0, playlist="Default", instance="A", plugin_id="clock"):
    moment = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    device_config.refresh_info = RefreshInfo("Playlist", plugin_id, moment.isoformat(), "hash", playlist=playlist, plugin_instance=instance)


@pytest.fixture
def rotation(device_config):
    playlist = fill_default_playlist(device_config, ["A", "B", "C"])
    playlist.current_plugin_index = 0
    device_config.update_value("plugin_cycle_interval_seconds", 3600)
    refreshed(device_config, minutes_ago=10)
    return playlist


class TestStatus:
    def test_estimates_the_next_change(self, page, server_url, rotation):
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_text("Next change")).to_be_visible()
        expect(page.get_by_text("around ", exact=False)).to_be_visible()

    def test_never_claims_the_screen_is_connected(self, page, server_url, rotation):
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_role("heading", level=1)).to_be_visible()
        assert "connected" not in page.locator("body").inner_text().lower()

    def test_says_soon_once_the_time_has_passed(self, page, server_url, device_config, rotation):
        refreshed(device_config, minutes_ago=70)
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_text("soon", exact=True)).to_be_visible()
        expect(page.get_by_text("hasn't updated")).to_be_hidden()

    def test_warns_when_the_screen_stopped_updating(self, page, server_url, device_config, rotation):
        refreshed(device_config, minutes_ago=200)
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_text("The screen hasn't updated for a while.")).to_be_visible()

    def test_an_image_shown_with_no_rotation_is_not_late(self, page, server_url, device_config):
        device_config.get_playlist_manager().playlists = []
        refreshed(device_config, minutes_ago=5000)
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_role("heading", level=1)).to_be_visible()
        expect(page.get_by_text("hasn't updated")).to_be_hidden()
        expect(page.get_by_text("Next change")).to_be_hidden()

    def test_day_playlist_is_not_late_when_it_just_opened(self, page, server_url, device_config, rotation):
        device_config.update_value("timezone", "UTC")
        now = datetime.now(timezone.utc)
        rotation.start_time, rotation.end_time = (now - timedelta(minutes=5)).strftime("%H:%M"), "24:00"
        if now.hour == 0 and now.minute < 6:
            pytest.skip("La fenêtre chevaucherait minuit")
        refreshed(device_config, minutes_ago=600)
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_text("soon", exact=True)).to_be_visible()
        expect(page.get_by_text("hasn't updated")).to_be_hidden()

    def test_deleted_entry_offers_no_refresh(self, page, server_url, device_config, rotation):
        refreshed(device_config, instance="Gone")
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_role("button", name="Show next")).to_be_visible()
        expect(page.get_by_role("button", name="Refresh")).to_be_hidden()

    def test_warnings_lead_somewhere(self, page, server_url, device_config, rotation):
        refreshed(device_config, minutes_ago=200)
        page.goto(f"{server_url}/ui/")
        page.get_by_role("status").filter(has_text="hasn't updated").get_by_role("link", name="Settings").click()
        page.wait_for_url("**/ui/settings")

    def test_says_nothing_about_the_next_change_when_unreachable(self, page, server_url, rotation):
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_text("Next change")).to_be_visible()
        page.route("**/ui/api/state", lambda route: route.abort())
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        expect(page.get_by_text("Couldn't reach the device.")).to_be_visible()
        expect(page.get_by_text("Next change")).to_be_hidden()

    def test_empty_screen_has_an_illustration(self, page, server_url, device_config):
        device_config.refresh_info = RefreshInfo(None, None, None, None)
        page.goto(f"{server_url}/ui/")
        expect(page.locator("main svg")).to_be_visible()

    def test_says_when_updates_are_not_running(self, page, server_url, refresh_task, rotation):
        refresh_task.running = False
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_text("Automatic updates aren't running.")).to_be_visible()
        expect(page.get_by_text("Up next")).to_be_hidden()
        expect(page.get_by_role("button", name="Refresh")).to_be_hidden()
        expect(page.get_by_role("button", name="Show next")).to_be_hidden()


class TestUpNext:
    def test_lists_what_comes_after_the_current_entry(self, page, server_url, rotation):
        page.goto(f"{server_url}/ui/")
        items = page.get_by_role("list").filter(has_text="B").last.get_by_role("listitem")
        expect(items).to_have_count(3)
        expect(items.nth(0)).to_contain_text("B")
        expect(items.nth(2)).to_contain_text("A")

    def test_entry_opens_its_form(self, page, server_url, rotation):
        page.goto(f"{server_url}/ui/")
        page.get_by_role("link", name="B", exact=True).click()
        page.wait_for_url("**/ui/plugin/clock?instance=B")
        expect(page.get_by_role("heading", name="B", level=1)).to_be_visible()

    def test_entry_without_an_image_shows_an_illustration(self, page, server_url, rotation):
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_role("link", name="B", exact=True).locator("svg")).to_be_visible()
        assert page.errors == []

    def test_empty_playlist_points_to_the_playlists(self, page, server_url, device_config):
        fill_default_playlist(device_config, [])
        refreshed(device_config)
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_text("Nothing in Default yet.")).to_be_visible()
        expect(page.get_by_role("link", name="Open playlists")).to_have_attribute("href", "/ui/playlists")
        expect(page.get_by_role("button", name="Show next")).to_be_hidden()

    def test_no_active_playlist_is_said_plainly(self, page, server_url, device_config):
        device_config.get_playlist_manager().playlists = []
        refreshed(device_config)
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_text("No playlist is active right now.")).to_be_visible()

    def test_add_content_opens_the_catalogue(self, page, server_url, rotation):
        page.goto(f"{server_url}/ui/")
        page.get_by_role("link", name="Add content").click()
        page.wait_for_url("**/ui/plugins")


class TestActions:
    def test_show_next_advances_the_rotation(self, page, server_url, refresh_task, rotation):
        page.goto(f"{server_url}/ui/")
        page.get_by_role("button", name="Show next").click()
        expect(page.get_by_role("status").filter(has_text="On the screen")).to_be_visible()
        assert refresh_task.actions[0].plugin_instance.name == "B"
        assert rotation.current_plugin_index == 1
        items = page.get_by_role("link", name="C", exact=True)
        expect(items).to_be_visible()

    def test_refresh_renders_the_current_entry_again(self, page, server_url, refresh_task, rotation):
        page.goto(f"{server_url}/ui/")
        page.get_by_role("button", name="Refresh").click()
        expect(page.get_by_role("status").filter(has_text="On the screen")).to_be_visible()
        action = refresh_task.actions[0]
        assert isinstance(action, PlaylistRefresh)
        assert action.plugin_instance.name == "A"
        assert action.force is True
        assert rotation.current_plugin_index == 0

    def test_image_shown_by_hand_cannot_be_refreshed(self, page, server_url, device_config, rotation):
        device_config.refresh_info = RefreshInfo("Manual Update", "clock", datetime.now(timezone.utc).isoformat(), "hash")
        page.goto(f"{server_url}/ui/")
        expect(page.get_by_role("button", name="Show next")).to_be_visible()
        expect(page.get_by_role("button", name="Refresh")).to_be_hidden()

    def test_failure_is_explained(self, page, server_url, refresh_task, rotation, monkeypatch):
        def fail(action):
            raise RuntimeError("no network")

        monkeypatch.setattr(refresh_task, "manual_update", fail)
        page.goto(f"{server_url}/ui/")
        page.get_by_role("button", name="Show next").click()
        expect(page.get_by_role("alert").filter(has_text="no network")).to_be_visible()

    def test_unreachable_device_is_explained(self, page, server_url, rotation):
        page.route("**/ui/api/show-next", lambda route: route.abort())
        page.goto(f"{server_url}/ui/")
        page.get_by_role("button", name="Show next").click()
        expect(page.get_by_role("alert").filter(has_text="The device didn't answer")).to_be_visible()


class TestCatalogue:
    def open(self, page, server_url):
        page.goto(f"{server_url}/ui/plugins")
        expect(page.get_by_role("link", name="Clock")).to_be_visible()

    def test_groups_plugins_with_illustrations(self, page, server_url):
        self.open(page, server_url)
        expect(page.get_by_role("heading", name="Pictures")).to_be_visible()
        expect(page.get_by_role("heading", name="Information")).to_be_visible()
        expect(page.get_by_role("link", name="Clock").locator("svg")).to_be_visible()

    def test_flags_plugins_that_need_a_key(self, page, server_url):
        self.open(page, server_url)
        expect(page.get_by_role("link", name="Unsplash")).to_contain_text("API key")
        expect(page.get_by_role("link", name="Weather")).not_to_contain_text("API key")

    def test_search_uses_names_and_descriptions(self, page, server_url):
        self.open(page, server_url)
        search = page.get_by_label("Search plugins")
        search.fill("space")
        expect(page.get_by_role("link", name="NASA Astronomy Picture Of the Day")).to_be_visible()
        expect(page.get_by_role("link", name="Clock")).to_be_hidden()
        expect(page.get_by_role("heading", name="Information")).to_be_hidden()

    def test_search_without_result_offers_a_way_back(self, page, server_url):
        self.open(page, server_url)
        page.get_by_label("Search plugins").fill("zzz")
        expect(page.get_by_text("No plugin matches this search.")).to_be_visible()
        page.get_by_role("button", name="Show all plugins").click()
        expect(page.get_by_role("link", name="Clock")).to_be_visible()

    def test_filter_by_type(self, page, server_url):
        self.open(page, server_url)
        page.get_by_role("button", name="Pictures").click()
        expect(page.get_by_role("link", name="Unsplash")).to_be_visible()
        expect(page.get_by_role("link", name="Clock")).to_be_hidden()

    def test_search_works_in_the_interface_language(self, page, server_url):
        page.add_init_script("localStorage.setItem('inkypi-lang', 'fr')")
        page.goto(f"{server_url}/ui/plugins")
        page.get_by_label("Rechercher un plugin").fill("horloge")
        expect(page.get_by_role("link", name="Horloge")).to_be_visible()

    def test_plugin_the_interface_does_not_know_keeps_its_old_page(self, page, server_url):
        page.route("**/ui/api/plugins", lambda route: route.fulfill(json={"plugins": [{"id": "clock", "name": "Clock"}, {"id": "third_party", "name": "Third Party"}]}))
        self.open(page, server_url)
        expect(page.get_by_role("heading", name="Other")).to_be_visible()
        expect(page.get_by_role("link", name="Third Party")).to_have_attribute("href", "/plugin/third_party")

    def order(self, page):
        return page.locator("ol li").all_inner_texts()

    def test_reorder_with_the_keyboard_and_save(self, page, server_url, device_config):
        self.open(page, server_url)
        before = [plugin["id"] for plugin in device_config.get_plugins()]
        information = [plugin_id for plugin_id in before if plugin_id in INFORMATION]
        position = information.index("clock")
        page.get_by_role("button", name="Reorder").click()
        move = page.get_by_role("button", name="Move Clock up")
        move.focus()
        page.keyboard.press("Enter")
        expect(move).to_be_focused()
        expect(page.get_by_role("status").filter(has_text=f"Clock moved to position {position} of {len(information)}.")).to_be_attached()

        page.get_by_role("button", name="Save order").click()
        expect(page.get_by_text("Order saved")).to_be_visible()

        after = [plugin["id"] for plugin in device_config.get_plugins()]
        assert sorted(after) == sorted(before)
        moved = [plugin_id for plugin_id in after if plugin_id in INFORMATION]
        assert moved.index("clock") == position - 1

    def test_reorder_keeps_each_type_apart(self, page, server_url):
        self.open(page, server_url)
        page.get_by_role("button", name="Reorder").click()
        pictures = page.get_by_role("region", name="Pictures")
        expect(pictures.get_by_text("Unsplash")).to_be_visible()
        expect(pictures.get_by_text("Clock", exact=True)).to_be_hidden()
        expect(page.get_by_role("region", name="Information").get_by_text("Clock", exact=True)).to_be_visible()

    def test_focus_follows_entering_and_leaving_reorder(self, page, server_url):
        self.open(page, server_url)
        page.get_by_role("button", name="Reorder").click()
        expect(page.get_by_text("Drag the plugins")).to_be_focused()
        page.get_by_role("button", name="Cancel").click()
        expect(page.get_by_role("button", name="Reorder")).to_be_focused()

    def test_confirmation_is_on_screen_after_a_long_list(self, page, server_url):
        page.set_viewport_size({"width": 390, "height": 600})
        self.open(page, server_url)
        page.get_by_role("button", name="Reorder").click()
        page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
        page.get_by_role("button", name="Save order").click()
        expect(page.get_by_text("Order saved")).to_be_in_viewport()

    def test_order_shows_within_each_type(self, page, server_url, device_config):
        device_config.set_plugin_order(["year_progress", "weather"])
        self.open(page, server_url)
        first = page.get_by_role("region", name="Information").get_by_role("link").first
        expect(first).to_contain_text("Year Progress")

    def test_drag_reorders(self, page, server_url):
        self.open(page, server_url)
        page.get_by_role("button", name="Reorder").click()
        rows = page.locator("ol > li")
        first = rows.nth(0).inner_text()
        rows.nth(0).drag_to(rows.nth(2))
        expect(rows.nth(2)).to_contain_text(first)

    def test_cancel_changes_nothing(self, page, server_url, device_config):
        before = [plugin["id"] for plugin in device_config.get_plugins()]
        self.open(page, server_url)
        page.get_by_role("button", name="Reorder").click()
        page.get_by_role("button", name="Move Clock up").click()
        page.get_by_role("button", name="Cancel").click()
        expect(page.get_by_label("Search plugins")).to_be_visible()
        assert [plugin["id"] for plugin in device_config.get_plugins()] == before

    def test_failed_save_keeps_the_new_order_on_screen(self, page, server_url):
        page.route("**/api/plugin_order", lambda route: route.fulfill(status=500, json={"error": "disk full"}))
        self.open(page, server_url)
        page.get_by_role("button", name="Reorder").click()
        page.get_by_role("button", name="Save order").click()
        expect(page.get_by_role("alert").filter(has_text="Not saved: disk full")).to_be_visible()
        expect(page.get_by_role("button", name="Save order")).to_be_visible()

    def test_ends_of_the_list_do_nothing(self, page, server_url):
        self.open(page, server_url)
        page.get_by_role("button", name="Reorder").click()
        rows = page.locator("ol > li")
        first = rows.nth(0).inner_text()
        up = rows.nth(0).get_by_role("button").first
        expect(up).to_have_attribute("aria-disabled", "true")
        up.click(force=True)
        expect(rows.nth(0)).to_contain_text(first)


@pytest.mark.parametrize("width", [320, 390, 768, 1024, 1280])
@pytest.mark.parametrize("path", ["/ui/", "/ui/plugins"])
def test_no_horizontal_overflow(page, server_url, rotation, path, width):
    page.set_viewport_size({"width": width, "height": 800})
    page.goto(f"{server_url}{path}")
    expect(page.get_by_role("heading", level=1)).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
