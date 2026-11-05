"""Page Playlists de la nouvelle interface, dans un vrai navigateur."""
import re

import pytest

from model import Playlist, RefreshInfo
from refresh_task import PlaylistRefresh

from .test_ui_browser import browser, current_image, page, server_url, ui_app  # noqa: F401

playwright_api = pytest.importorskip("playwright.sync_api")
expect = playwright_api.expect

pytestmark = pytest.mark.browser


def entry(name, plugin_id="clock", refresh=None, **extra):
    return {"plugin_id": plugin_id, "name": name, "plugin_settings": {}, "refresh": refresh or {"interval": 3600}, **extra}


@pytest.fixture
def lists(device_config):
    device_config.update_value("timezone", "UTC")
    device_config.update_value("time_format", "24h")
    device_config.get_playlist_manager().playlists = [
        Playlist("Default", "00:00", "24:00", [entry("A"), entry("B"), entry("C")]),
        Playlist("Morning", "08:00", "12:00", [entry("Sunrise", refresh={"scheduled": "07:00"})]),
    ]
    return device_config.get_playlist_manager()


def open_page(page, server_url):
    page.goto(f"{server_url}/ui/playlists")
    expect(page.get_by_role("heading", level=1, name="Playlists")).to_be_visible()


def section(page, name):
    return page.get_by_role("region", name=name, exact=True)


def open_menu(page, name):
    page.get_by_role("button", name=f"More for {name}").click()


def show_now(page, name):
    open_menu(page, name)
    page.get_by_role("menuitem", name="Show now").click()


class TestNavigation:
    def test_the_menu_opens_the_new_page(self, page, server_url, lists):
        page.goto(f"{server_url}/ui/")
        page.get_by_role("navigation").get_by_role("link", name="Playlists").click()
        page.wait_for_url("**/ui/playlists")
        expect(page.get_by_role("heading", level=1, name="Playlists")).to_be_visible()

    def test_marks_the_current_page(self, page, server_url, lists):
        open_page(page, server_url)
        expect(page.get_by_role("navigation").get_by_role("link", name="Playlists")).to_have_attribute("aria-current", "page")


class TestDay:
    def test_describes_who_shows_when(self, page, server_url, lists):
        open_page(page, server_url)
        day = page.get_by_role("region", name="Each day")
        expect(day.get_by_text("Default: on the screen from 00:00 to 08:00, from 12:00 to 24:00. Hidden from 08:00 to 12:00.")).to_be_attached()
        expect(day.get_by_text("Morning: on the screen from 08:00 to 12:00.", exact=True)).to_be_attached()

    def test_explains_the_priority_only_when_it_matters(self, page, server_url, device_config, lists):
        open_page(page, server_url)
        expect(page.get_by_text("the shorter playlist shows")).to_be_visible()
        lists.playlists = [Playlist("Default", "00:00", "24:00", [entry("A")])]
        open_page(page, server_url)
        expect(page.get_by_text("the shorter playlist shows")).to_be_hidden()

    def test_warns_about_a_playlist_that_never_shows(self, page, server_url, lists):
        lists.playlists.append(Playlist("Inside", "09:00", "12:00", [entry("D")]))
        lists.playlists.append(Playlist("Shorter", "09:00", "11:00", [entry("E")]))
        lists.playlists.append(Playlist("Longer", "08:00", "12:00", [entry("F")]))
        open_page(page, server_url)
        expect(page.get_by_text("Longer never shows: another playlist takes all its hours.")).to_be_visible()

    def test_warns_about_a_playlist_with_no_length(self, page, server_url, lists):
        lists.playlists.append(Playlist("Stuck", "09:00", "09:00", [entry("D")]))
        open_page(page, server_url)
        expect(page.get_by_text("Stuck never shows: it starts and ends at the same time.")).to_be_visible()

    def test_warns_that_an_empty_playlist_freezes_the_screen(self, page, server_url, lists):
        lists.get_playlist("Morning").plugins = []
        open_page(page, server_url)
        expect(page.get_by_text("Morning is empty, so the screen keeps its last image from 08:00 to 12:00.")).to_be_visible()

    def test_explains_the_outline_of_an_empty_playlist(self, page, server_url, lists):
        open_page(page, server_url)
        expect(page.get_by_text("Empty, the screen doesn't change")).to_be_hidden()
        lists.get_playlist("Morning").plugins = []
        open_page(page, server_url)
        expect(page.get_by_text("Empty, the screen doesn't change")).to_be_visible()
        expect(page.get_by_text("Morning: empty, nothing changes on the screen from 08:00 to 12:00.")).to_be_attached()
        expect(section(page, "Morning")).to_contain_text("the screen keeps its last image during these hours")

    def test_an_empty_playlist_that_takes_no_hours_freezes_nothing(self, page, server_url, lists):
        lists.playlists.append(Playlist("Never", "09:00", "09:00", []))
        open_page(page, server_url)
        expect(section(page, "Never")).to_contain_text("Nothing in this playlist yet.")
        expect(section(page, "Never")).not_to_contain_text("keeps its last image")

    def test_explains_a_start_the_engine_cannot_read_and_lets_it_be_fixed(self, page, server_url, lists):
        lists.playlists.append(Playlist("Odd", "24:00", "05:00", [entry("D")]))
        open_page(page, server_url)
        expect(page.get_by_text("Odd starts at 24:00, which stops all updates during its hours.")).to_be_visible()
        expect(page.get_by_text("Odd never shows")).to_have_count(0)
        page.get_by_role("button", name="Edit Odd").click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_role("button", name="Save").click()
        expect(dialog).to_contain_text("Choose a start time before 24:00.")
        dialog.get_by_role("combobox", name="From").click()
        option = page.get_by_role("option", name="01:00", exact=True)
        option.evaluate("element => element.scrollIntoView({ block: 'center' })")
        option.click()
        expect(page.get_by_role("listbox")).to_have_count(0)
        dialog.get_by_role("button", name="Save").click()
        expect(dialog).to_be_hidden()
        assert lists.get_playlist("Odd").start_time == "01:00"
        expect(page.get_by_text("Odd starts at 24:00")).to_have_count(0)

    def test_says_when_nothing_is_planned(self, page, server_url, lists):
        lists.playlists = [Playlist("Night", "21:00", "06:00", [entry("A")])]
        open_page(page, server_url)
        expect(page.get_by_text("Nothing planned from 06:00 to 21:00")).to_be_visible()

    def test_follows_the_time_format_of_the_device(self, page, server_url, device_config, lists):
        device_config.update_value("time_format", "12h")
        open_page(page, server_url)
        expect(page.get_by_text(re.compile(r"Morning: on the screen from 8:00\sAM to 12:00\sPM"))).to_be_attached()

    def test_marks_the_active_playlist_on_the_device_clock(self, page, server_url, device_config, lists):
        lists.playlists = [Playlist("Always", "00:00", "24:00", [entry("A")]), Playlist("Never", "09:00", "09:00", [entry("B")])]
        open_page(page, server_url)
        expect(section(page, "Always").get_by_text("Active now")).to_be_visible()
        expect(section(page, "Never").get_by_text("Active now")).to_be_hidden()


class TestEntries:
    def test_lists_entries_in_order_with_their_rule(self, page, server_url, lists):
        open_page(page, server_url)
        expect(section(page, "Default").get_by_role("listitem")).to_have_count(3)
        expect(section(page, "Default").get_by_text("Clock, refreshes every hour").first).to_be_visible()
        expect(section(page, "Morning").get_by_text("Clock, refreshes daily at 07:00")).to_be_visible()

    def test_a_daily_time_follows_the_format_of_the_device(self, page, server_url, device_config, lists):
        device_config.update_value("time_format", "12h")
        open_page(page, server_url)
        expect(section(page, "Morning").get_by_text(re.compile(r"refreshes daily at 7:00\sAM"))).to_be_visible()

    def test_an_entry_opens_its_form(self, page, server_url, lists):
        open_page(page, server_url)
        section(page, "Default").get_by_role("link", name=re.compile("^A")).click()
        page.wait_for_url("**/ui/plugin/clock?instance=A")

    def test_never_asks_for_the_image_of_an_entry_that_never_ran(self, page, server_url, lists):
        requested = []
        page.on("request", lambda request: requested.append(request.url) if "plugin_instance_image" in request.url else None)
        open_page(page, server_url)
        expect(section(page, "Default").get_by_role("listitem")).to_have_count(3)
        assert requested == []

    def test_shows_the_illustration_when_the_image_is_missing(self, page, server_url, lists):
        lists.get_playlist("Morning").plugins[0].latest_refresh_time = "2026-01-01T10:00:00+00:00"
        open_page(page, server_url)
        expect(section(page, "Morning").locator("svg[viewBox='0 0 200 120']")).to_be_visible()

    def test_marks_what_is_on_the_screen(self, page, server_url, device_config, lists):
        device_config.refresh_info = RefreshInfo("Playlist", "clock", "2026-01-01T10:00:00+00:00", "hash", playlist="Default", plugin_instance="B")
        open_page(page, server_url)
        expect(section(page, "Default").get_by_role("listitem").filter(has_text="On the screen")).to_contain_text("B")
        expect(section(page, "Default").get_by_text("On the screen")).to_have_count(1)

    def test_an_entry_of_a_removed_plugin_can_still_be_deleted(self, page, server_url, lists):
        lists.get_playlist("Morning").plugins[0].plugin_id = "gone"
        open_page(page, server_url)
        row = section(page, "Morning").get_by_role("listitem")
        expect(row.get_by_text("Plugin no longer installed")).to_be_visible()
        expect(row.get_by_role("link")).to_have_count(0)
        open_menu(page, "Sunrise")
        expect(page.get_by_role("menuitem")).to_have_count(1)
        expect(page.get_by_role("menuitem", name="Delete")).to_be_visible()

    def test_opens_an_empty_list_on_a_way_forward(self, page, server_url, lists):
        lists.get_playlist("Morning").plugins = []
        open_page(page, server_url)
        section(page, "Morning").get_by_role("link", name="Add a plugin").click()
        page.wait_for_url("**/ui/plugins")


class TestShowNow:
    def test_sends_the_entry_to_the_screen(self, page, server_url, device_config, refresh_task, lists):
        def done(action):
            refresh_task.actions.append(action)
            device_config.refresh_info = RefreshInfo("Playlist", "clock", "2026-01-01T10:00:00+00:00", "hash", playlist="Default", plugin_instance="B")

        refresh_task.manual_update = done
        open_page(page, server_url)
        show_now(page, "B")
        expect(section(page, "Default").get_by_role("listitem").filter(has_text="B").get_by_role("status")).to_contain_text("On the screen")
        action = refresh_task.actions[0]
        assert isinstance(action, PlaylistRefresh)
        assert (action.playlist.name, action.plugin_instance.name, action.force) == ("Default", "B", True)

    def test_stops_saying_on_the_screen_once_it_is_no_longer_true(self, page, server_url, device_config, refresh_task, lists):
        def done(_action):
            device_config.refresh_info = RefreshInfo("Playlist", "clock", "2026-01-01T10:00:00+00:00", "hash", playlist="Default", plugin_instance="B")

        refresh_task.manual_update = done
        open_page(page, server_url)
        show_now(page, "B")
        row = section(page, "Default").get_by_role("listitem").filter(has_text="Clock").nth(1)
        expect(row.get_by_role("status")).to_contain_text("On the screen")
        device_config.refresh_info = RefreshInfo("Playlist", "clock", "2026-01-01T11:00:00+00:00", "hash", playlist="Default", plugin_instance="C")
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        expect(row.get_by_role("status")).to_have_count(0)
        expect(section(page, "Default").get_by_text("On the screen")).to_have_count(1)

    def test_confirms_the_sending_even_if_the_list_cannot_be_read_again(self, page, server_url, lists):
        open_page(page, server_url)
        page.route("**/ui/api/playlists", lambda route: route.abort())
        show_now(page, "B")
        expect(page.get_by_text("Couldn't reach the device.")).to_be_visible()
        expect(section(page, "Default").get_by_role("status")).to_contain_text("On the screen")

    def test_says_why_the_screen_did_not_change(self, page, server_url, refresh_task, lists):
        def fail(_action):
            raise RuntimeError("Chromium crashed")

        refresh_task.manual_update = fail
        open_page(page, server_url)
        show_now(page, "B")
        expect(page.get_by_role("alert")).to_contain_text("Chromium crashed")

    def test_is_not_offered_when_the_engine_is_stopped(self, page, server_url, refresh_task, lists):
        refresh_task.running = False
        open_page(page, server_url)
        expect(page.get_by_text("Automatic updates aren't running")).to_be_visible()
        expect(page.get_by_text("Active now")).to_have_count(0)
        open_menu(page, "A")
        expect(page.get_by_role("menuitem", name="Edit")).to_be_visible()
        expect(page.get_by_role("menuitem", name="Show now")).to_have_count(0)


class TestSchedule:
    def test_changes_the_refresh_rule_without_opening_the_form(self, page, server_url, lists):
        lists.get_playlist("Default").plugins[0].settings = {"keep": "me"}
        open_page(page, server_url)
        open_menu(page, "A")
        page.get_by_role("menuitem", name="Refresh schedule").click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("Every").fill("2")
        dialog.get_by_role("button", name="Save").click()
        expect(dialog).to_be_hidden()
        entry_a = section(page, "Default").get_by_role("listitem").filter(has=page.get_by_text("A", exact=True))
        expect(entry_a).to_contain_text("refreshes every 2 hours")
        stored = lists.get_playlist("Default").plugins[0]
        assert stored.refresh == {"interval": 7200}
        assert stored.settings == {"keep": "me"}


class TestDeleteEntry:
    def test_asks_first(self, page, server_url, lists):
        open_page(page, server_url)
        open_menu(page, "B")
        page.get_by_role("menuitem", name="Delete").click()
        dialog = page.get_by_role("alertdialog")
        expect(dialog).to_contain_text("Delete B?")
        dialog.get_by_role("button", name="Cancel").click()
        expect(section(page, "Default").get_by_role("listitem")).to_have_count(3)
        assert len(lists.get_playlist("Default").plugins) == 3

    def test_says_the_image_stays_on_the_screen(self, page, server_url, device_config, lists):
        device_config.refresh_info = RefreshInfo("Playlist", "clock", "2026-01-01T10:00:00+00:00", "hash", playlist="Default", plugin_instance="B")
        open_page(page, server_url)
        open_menu(page, "A")
        page.get_by_role("menuitem", name="Delete").click()
        expect(page.get_by_role("alertdialog")).not_to_contain_text("stays on the screen")
        page.get_by_role("alertdialog").get_by_role("button", name="Cancel").click()
        open_menu(page, "B")
        page.get_by_role("menuitem", name="Delete").click()
        expect(page.get_by_role("alertdialog")).to_contain_text("Its image stays on the screen until the next change.")

    def test_deletes_and_keeps_the_focus_nearby(self, page, server_url, lists):
        open_page(page, server_url)
        open_menu(page, "B")
        page.get_by_role("menuitem", name="Delete").click()
        page.get_by_role("alertdialog").get_by_role("button", name="Delete").click()
        expect(section(page, "Default").get_by_role("listitem")).to_have_count(2)
        expect(page.get_by_text("B deleted")).to_be_visible()
        assert [item.name for item in lists.get_playlist("Default").plugins] == ["A", "C"]
        expect(page.get_by_role("heading", name="Default")).to_be_focused()

    def test_reads_the_refusal_of_the_old_route(self, page, server_url, lists):
        open_page(page, server_url)
        open_menu(page, "B")
        lists.get_playlist("Default").plugins = [p for p in lists.get_playlist("Default").plugins if p.name != "B"]
        page.get_by_role("menuitem", name="Delete").click()
        page.get_by_role("alertdialog").get_by_role("button", name="Delete").click()
        expect(page.get_by_role("alertdialog").get_by_role("alert")).to_contain_text("Plugin instance not found")


class TestReorder:
    def rows(self, page, name="Default"):
        return section(page, name).get_by_role("listitem")

    def test_is_offered_only_with_several_entries(self, page, server_url, lists):
        open_page(page, server_url)
        expect(page.get_by_role("button", name="Reorder Default")).to_be_visible()
        expect(page.get_by_role("button", name="Reorder Morning")).to_have_count(0)

    def test_saves_with_the_keyboard_path(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="Reorder Default").click()
        page.get_by_role("button", name="Move C up").click()
        expect(page.get_by_role("button", name="Move C up")).to_be_focused()
        page.get_by_role("button", name="Save order").click()
        expect(page.get_by_text("Order saved")).to_be_visible()
        assert [item.name for item in lists.get_playlist("Default").plugins] == ["A", "C", "B"]
        expect(page.get_by_role("button", name="Reorder Default")).to_be_focused()

    def test_cancel_changes_nothing(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="Reorder Default").click()
        page.get_by_role("button", name="Move C up").click()
        page.get_by_role("button", name="Cancel").click()
        assert [item.name for item in lists.get_playlist("Default").plugins] == ["A", "B", "C"]
        expect(page.get_by_role("button", name="Reorder Default")).to_be_focused()

    def test_refuses_when_the_list_changed_meanwhile(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="Reorder Default").click()
        lists.get_playlist("Default").plugins.pop()
        page.get_by_role("button", name="Save order").click()
        expect(page.get_by_role("alert")).to_contain_text("This playlist has changed")


class TestPlaylistDialog:
    def choose(self, page, label, option):
        page.get_by_role("dialog").get_by_role("combobox", name=label).click()
        target = page.get_by_role("option", name=option, exact=True)
        target.evaluate("element => element.scrollIntoView({ block: 'center' })")
        target.click()
        expect(page.get_by_role("dialog").get_by_role("combobox", name=label)).to_contain_text(option)
        expect(page.get_by_role("listbox")).to_have_count(0)

    def test_creates_a_playlist(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="New playlist").click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_label("Name")).to_be_focused()
        dialog.get_by_label("Name").fill("  Soirée d'hiver  ")
        self.choose(page, "From", "21:00")
        self.choose(page, "To", "03:00")
        dialog.get_by_role("button", name="Create").click()
        expect(section(page, "Soirée d'hiver")).to_be_visible()
        created = lists.get_playlist("Soirée d'hiver")
        assert (created.start_time, created.end_time) == ("21:00", "03:00")

    def test_warns_that_a_new_playlist_starts_empty_and_leads_to_it(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="New playlist").click()
        dialog = page.get_by_role("dialog")
        expect(dialog).to_contain_text("It starts empty")
        dialog.get_by_label("Name").fill("Evening")
        dialog.get_by_role("button", name="Create").click()
        expect(section(page, "Evening").get_by_role("link", name="Add a plugin")).to_be_focused()

    def test_cancelling_keeps_the_focus_on_the_button(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="New playlist").click()
        page.get_by_role("dialog").get_by_role("button", name="Cancel").click()
        expect(page.get_by_role("button", name="New playlist")).to_be_focused()

    def test_the_long_list_of_times_shows_the_current_one(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="Edit Morning").click()
        page.get_by_role("dialog").get_by_role("combobox", name="From").click()
        expect(page.get_by_role("option", name="08:00", exact=True)).to_be_in_viewport()

    def test_giving_up_on_a_deletion_returns_to_the_playlist(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="Edit Default").click()
        page.get_by_role("dialog").get_by_role("button", name="Delete").click()
        page.get_by_role("alertdialog").get_by_role("button", name="Cancel").click()
        expect(page.get_by_role("dialog").get_by_label("Name")).to_have_value("Default")
        assert len(lists.playlists) == 2

    def test_opens_on_a_playlist_named_with_an_apostrophe(self, page, server_url, lists):
        """L'ancienne page ne pouvait pas ouvrir celle-ci : l'apostrophe cassait son JavaScript."""
        lists.playlists.append(Playlist("L'été", "13:00", "14:00", [entry("D")]))
        open_page(page, server_url)
        page.get_by_role("button", name="Edit L'été").click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_label("Name")).to_have_value("L'été")
        dialog.get_by_label("Name").fill("L'été indien")
        dialog.get_by_role("button", name="Save").click()
        expect(section(page, "L'été indien")).to_be_visible()
        assert lists.get_playlist("L'été indien").plugins[0].name == "D"

    @pytest.mark.parametrize("name, message", [
        ("", "Enter a name."),
        ("Morning", "Another playlist already has this name."),
        ("a/b", "can't contain a slash"),
    ])
    def test_refuses_a_bad_name(self, page, server_url, lists, name, message):
        open_page(page, server_url)
        page.get_by_role("button", name="New playlist").click()
        dialog = page.get_by_role("dialog")
        dialog.get_by_label("Name").fill(name)
        dialog.get_by_role("button", name="Create").click()
        expect(dialog).to_contain_text(message)
        assert len(lists.playlists) == 2

    def test_keeping_its_own_name_is_fine(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="Edit Morning").click()
        dialog = page.get_by_role("dialog")
        self.choose(page, "To", "13:00")
        dialog.get_by_role("button", name="Save").click()
        expect(dialog).to_be_hidden()
        assert lists.get_playlist("Morning").end_time == "13:00"

    def test_refuses_a_window_with_no_length(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="Edit Morning").click()
        self.choose(page, "To", "08:00")
        page.get_by_role("dialog").get_by_role("button", name="Save").click()
        expect(page.get_by_role("dialog")).to_contain_text("Choose a different start and end time.")
        assert lists.get_playlist("Morning").end_time == "12:00"

    def test_keeps_a_time_written_by_hand(self, page, server_url, lists):
        lists.get_playlist("Morning").start_time = "08:07"
        open_page(page, server_url)
        page.get_by_role("button", name="Edit Morning").click()
        dialog = page.get_by_role("dialog")
        expect(dialog.get_by_role("combobox", name="From")).to_contain_text("08:07")
        dialog.get_by_role("button", name="Save").click()
        expect(dialog).to_be_hidden()
        assert lists.get_playlist("Morning").start_time == "08:07"

    def test_a_time_written_by_hand_can_be_replaced(self, page, server_url, lists):
        lists.get_playlist("Morning").start_time = "08:07"
        open_page(page, server_url)
        page.get_by_role("button", name="Edit Morning").click()
        self.choose(page, "From", "09:00")
        dialog = page.get_by_role("dialog")
        dialog.get_by_role("button", name="Save").click()
        expect(dialog).to_be_hidden()
        assert lists.get_playlist("Morning").start_time == "09:00"

    def test_deleting_a_playlist_tells_what_goes_with_it(self, page, server_url, lists):
        open_page(page, server_url)
        page.get_by_role("button", name="Edit Default").click()
        page.get_by_role("dialog").get_by_role("button", name="Delete").click()
        confirm = page.get_by_role("alertdialog")
        expect(confirm).to_contain_text("Its 3 entries go with it")
        confirm.get_by_role("button", name="Delete").click()
        expect(section(page, "Default")).to_have_count(0)
        assert [item.name for item in lists.playlists] == ["Morning"]
        expect(page.get_by_role("heading", level=1)).to_be_focused()

    def test_with_no_playlist_left_it_offers_to_create_one(self, page, server_url, lists):
        lists.playlists = []
        open_page(page, server_url)
        expect(page.get_by_text("No playlists yet")).to_be_visible()
        expect(page.get_by_role("link", name="Add a plugin")).to_have_count(0)
        page.get_by_role("button", name="New playlist").click()
        expect(page.get_by_role("dialog").get_by_role("combobox", name="To")).to_contain_text("24:00")


class TestFailures:
    def test_says_when_the_list_cannot_load(self, page, server_url, lists):
        page.route("**/ui/api/playlists", lambda route: route.abort())
        page.goto(f"{server_url}/ui/playlists")
        expect(page.get_by_text("Couldn't load the playlists.")).to_be_visible()

    def test_keeps_the_list_and_says_it_may_be_old(self, page, server_url, lists):
        open_page(page, server_url)
        page.route("**/ui/api/playlists", lambda route: route.abort())
        page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
        expect(page.get_by_text("Couldn't reach the device.")).to_be_visible()
        expect(section(page, "Default")).to_be_visible()
