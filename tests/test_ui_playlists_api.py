"""Données de la page Playlists : la journée vient du calcul du moteur, et l'ordre des entrées survit à un redémarrage."""
import json
import os

import pytest

from model import Playlist, RefreshInfo
from ui.blueprint import ui_bp


@pytest.fixture
def ui_client(app):
    app.register_blueprint(ui_bp)
    return app.test_client()


def set_playlists(device_config, *windows):
    """Chaque fenêtre est (nom, début, fin, noms des entrées)."""
    device_config.get_playlist_manager().playlists = [
        Playlist(name, start, end, [{"plugin_id": "clock", "name": entry, "plugin_settings": {}, "refresh": {"interval": 3600}} for entry in entries])
        for name, start, end, entries in windows
    ]


def day(ui_client):
    return [(item["start"], item["end"], item["playlist"]) for item in ui_client.get("/ui/api/playlists").get_json()["day"]]


class TestDay:
    def test_an_all_day_playlist_fills_the_day(self, ui_client, device_config):
        set_playlists(device_config, ("Default", "00:00", "24:00", ["A"]))
        assert day(ui_client) == [("00:00", "24:00", "Default")]

    def test_the_shorter_playlist_wins_an_overlap(self, ui_client, device_config):
        set_playlists(device_config, ("Default", "00:00", "24:00", ["A"]), ("Morning", "08:00", "12:00", ["B"]))
        assert day(ui_client) == [("00:00", "08:00", "Default"), ("08:00", "12:00", "Morning"), ("12:00", "24:00", "Default")]

    def test_the_first_playlist_wins_when_lengths_are_equal(self, ui_client, device_config):
        set_playlists(device_config, ("One", "08:00", "12:00", ["A"]), ("Two", "08:00", "12:00", ["B"]))
        assert day(ui_client) == [("00:00", "08:00", None), ("08:00", "12:00", "One"), ("12:00", "24:00", None)]

    def test_a_window_can_cross_midnight(self, ui_client, device_config):
        set_playlists(device_config, ("Night", "21:00", "03:00", ["A"]))
        assert day(ui_client) == [("00:00", "03:00", "Night"), ("03:00", "21:00", None), ("21:00", "24:00", "Night")]

    def test_a_window_with_no_length_never_shows(self, ui_client, device_config):
        set_playlists(device_config, ("Never", "09:00", "09:00", ["A"]))
        assert day(ui_client) == [("00:00", "24:00", None)]

    def test_an_empty_playlist_still_takes_over_as_it_does_in_the_engine(self, ui_client, device_config):
        set_playlists(device_config, ("Default", "00:00", "24:00", ["A"]), ("Morning", "08:00", "12:00", []))
        assert ("08:00", "12:00", "Morning") in day(ui_client)

    def test_every_moment_matches_the_engine(self, ui_client, device_config):
        from datetime import datetime
        set_playlists(device_config, ("Default", "00:00", "24:00", ["A"]), ("Night", "21:30", "06:15", ["B"]), ("Lunch", "12:00", "13:45", ["C"]), ("Short", "05:00", "07:00", ["D"]))
        manager = device_config.get_playlist_manager()
        segments = day(ui_client)
        for hour in range(24):
            for minute in range(0, 60, 15):
                time = f"{hour:02d}:{minute:02d}"
                expected = manager.determine_active_playlist(datetime(2026, 1, 1, hour, minute)).name
                assert next(name for start, end, name in segments if start <= time < end) == expected, time


class TestStartAtMidnightEnd:
    """L'ancienne page propose 24:00 comme début, et le calcul de priorité du moteur le refuse."""

    @pytest.fixture
    def broken(self, device_config):
        set_playlists(device_config, ("Default", "00:00", "24:00", ["A"]), ("Odd", "24:00", "05:00", ["B"]))

    def test_the_page_still_opens_to_fix_it(self, ui_client, broken):
        response = ui_client.get("/ui/api/playlists")
        assert response.status_code == 200
        assert ("00:00", "05:00", None) in day(ui_client)
        assert ("05:00", "24:00", "Default") in day(ui_client)
        assert [item["name"] for item in response.get_json()["playlists"]] == ["Default", "Odd"]

    def test_the_home_page_still_opens(self, ui_client, device_config, broken, monkeypatch):
        import ui.blueprint as ui_module
        from datetime import datetime
        monkeypatch.setattr(ui_module, "_now", lambda _config: datetime(2026, 1, 1, 3, 0))
        response = ui_client.get("/ui/api/state")
        assert response.status_code == 200
        assert response.get_json()["rotation"]["playlist"] is None


class TestEntries:
    def payload(self, ui_client):
        return ui_client.get("/ui/api/playlists").get_json()

    def test_describes_each_entry(self, ui_client, device_config):
        set_playlists(device_config, ("My list", "00:00", "24:00", ["Big clock"]))
        entry = device_config.get_playlist_manager().get_playlist("My list").plugins[0]
        entry.latest_refresh_time = "2026-01-01T10:00:00+00:00"
        listed = self.payload(ui_client)["playlists"][0]
        assert (listed["name"], listed["start_time"], listed["end_time"]) == ("My list", "00:00", "24:00")
        assert listed["entries"] == [{
            "plugin_id": "clock",
            "plugin_name": "Clock",
            "instance": "Big clock",
            "installed": True,
            "refresh": {"interval": 3600},
            "refreshed_at": "2026-01-01T10:00:00+00:00",
            "image_url": "/plugin_instance_image/My%20list/clock/Big%20clock?v=2026-01-01T10%3A00%3A00%2B00%3A00",
        }]

    def test_an_entry_never_shown_has_no_image(self, ui_client, device_config):
        set_playlists(device_config, ("Default", "00:00", "24:00", ["A"]))
        assert self.payload(ui_client)["playlists"][0]["entries"][0]["image_url"] is None

    def test_says_when_a_plugin_is_gone(self, ui_client, device_config):
        set_playlists(device_config, ("Default", "00:00", "24:00", ["A"]))
        device_config.get_playlist_manager().get_playlist("Default").plugins[0].plugin_id = "gone"
        entry = self.payload(ui_client)["playlists"][0]["entries"][0]
        assert entry["installed"] is False
        assert entry["plugin_name"] == "gone"

    def test_tells_what_is_on_the_screen(self, ui_client, device_config):
        set_playlists(device_config, ("Default", "00:00", "24:00", ["A"]))
        device_config.refresh_info = RefreshInfo("Playlist", "clock", "2026-01-01T10:00:00+00:00", "hash", playlist="Old name", plugin_instance="A")
        assert self.payload(ui_client)["on_screen"] == {"plugin_id": "clock", "instance": "A"}

    def test_an_image_shown_by_hand_is_no_entry(self, ui_client, device_config):
        device_config.refresh_info = RefreshInfo("Manual Update", "clock", "2026-01-01T10:00:00+00:00", "hash")
        assert self.payload(ui_client)["on_screen"] is None

    def test_reports_the_device_and_the_engine(self, ui_client, device_config, refresh_task):
        device_config.update_value("timezone", "Europe/Paris")
        device_config.update_value("time_format", "24h")
        refresh_task.running = False
        payload = self.payload(ui_client)
        assert payload["device"] == {"timezone": "Europe/Paris", "time_format": "24h"}
        assert payload["running"] is False


class TestOrder:
    @pytest.fixture
    def playlist(self, device_config):
        set_playlists(device_config, ("Default", "00:00", "24:00", ["A", "B", "C"]))
        return device_config.get_playlist_manager().get_playlist("Default")

    def send(self, ui_client, names, playlist="Default"):
        return ui_client.post("/ui/api/playlist-order", json={"playlist": playlist, "entries": [{"plugin_id": "clock", "instance": name} for name in names]})

    def names(self, playlist):
        return [entry.name for entry in playlist.plugins]

    def test_saves_the_new_order(self, ui_client, device_config, playlist):
        assert self.send(ui_client, ["C", "A", "B"]).status_code == 200
        assert self.names(playlist) == ["C", "A", "B"]
        with open(device_config.config_file) as stored:
            saved = json.load(stored)["playlist_config"]["playlists"][0]["plugins"]
        assert [entry["name"] for entry in saved] == ["C", "A", "B"]

    def test_keeps_every_setting_of_an_entry(self, ui_client, playlist):
        playlist.plugins[0].settings = {"imageFiles[]": ["a.png"]}
        playlist.plugins[0].latest_refresh_time = "2026-01-01T10:00:00+00:00"
        self.send(ui_client, ["B", "C", "A"])
        moved = playlist.plugins[2]
        assert moved.settings == {"imageFiles[]": ["a.png"]}
        assert moved.latest_refresh_time == "2026-01-01T10:00:00+00:00"

    def test_the_rotation_stays_on_the_entry_it_was_showing(self, ui_client, playlist):
        playlist.current_plugin_index = 0
        self.send(ui_client, ["B", "C", "A"])
        assert playlist.plugins[playlist.current_plugin_index].name == "A"
        assert playlist.get_next_plugin().name == "B"

    def test_a_rotation_that_has_not_started_stays_unstarted(self, ui_client, playlist):
        self.send(ui_client, ["B", "C", "A"])
        assert playlist.current_plugin_index is None

    def test_an_index_past_the_end_after_a_deletion_is_handled(self, ui_client, playlist):
        playlist.current_plugin_index = 7
        assert self.send(ui_client, ["B", "C", "A"]).status_code == 200
        assert playlist.current_plugin_index == 7

    @pytest.mark.parametrize("names", [["A", "B"], ["A", "B", "C", "D"], ["A", "A", "B"], ["A", "B", "Z"], []])
    def test_refuses_a_list_that_does_not_match(self, ui_client, playlist, names):
        response = self.send(ui_client, names)
        assert response.status_code == 409
        assert "error" in response.get_json()
        assert self.names(playlist) == ["A", "B", "C"]

    def test_restores_everything_when_the_file_cannot_be_written(self, ui_client, device_config, playlist, monkeypatch):
        playlist.current_plugin_index = 0

        def fail():
            raise OSError("Disk full")

        monkeypatch.setattr(device_config, "write_config", fail)
        response = self.send(ui_client, ["B", "C", "A"])
        assert response.status_code == 500
        assert response.get_json()["error"] == "Disk full"
        assert self.names(playlist) == ["A", "B", "C"]
        assert playlist.current_plugin_index == 0

    def test_never_loses_an_entry_of_a_list_with_duplicates(self, ui_client, playlist):
        playlist.plugins[1].name = "A"
        assert self.send(ui_client, ["A", "A", "C"]).status_code == 409
        assert self.names(playlist) == ["A", "A", "C"]

    def test_refuses_an_unknown_playlist(self, ui_client, playlist):
        assert self.send(ui_client, ["A"], playlist="Nope").status_code == 404

    def test_refuses_a_request_without_entries(self, ui_client, playlist):
        assert ui_client.post("/ui/api/playlist-order", json={"playlist": "Default"}).status_code == 400
        assert ui_client.post("/ui/api/playlist-order", data="nope", content_type="application/json").status_code == 400


class TestSharedFiles:
    """Une copie d'entrée Image Upload pointe vers les mêmes fichiers que l'original."""

    @pytest.fixture
    def picture(self, tmp_path):
        path = tmp_path / "shared.png"
        path.write_bytes(b"image")
        return str(path)

    @pytest.fixture
    def copies(self, device_config, picture):
        def entry(name, files):
            return {"plugin_id": "image_upload", "name": name, "plugin_settings": {"imageFiles[]": files}, "refresh": {"interval": 3600}}

        device_config.get_playlist_manager().playlists = [Playlist("Default", "00:00", "24:00", [entry("Original", [picture]), entry("Copy", [picture])])]

    def delete(self, client, name):
        return client.post("/delete_plugin_instance", json={"playlist_name": "Default", "plugin_id": "image_upload", "plugin_instance": name})

    def test_deleting_a_copy_keeps_the_files_of_the_other(self, client, copies, picture):
        assert self.delete(client, "Copy").status_code == 200
        assert os.path.exists(picture)

    def test_deleting_the_last_entry_removes_the_files(self, client, copies, picture):
        self.delete(client, "Copy")
        self.delete(client, "Original")
        assert not os.path.exists(picture)

    def test_files_used_by_one_entry_only_are_removed(self, client, device_config, copies, picture, tmp_path):
        own = tmp_path / "own.png"
        own.write_bytes(b"image")
        device_config.get_playlist_manager().get_playlist("Default").find_plugin("image_upload", "Copy").settings["imageFiles[]"].append(str(own))
        self.delete(client, "Copy")
        assert os.path.exists(picture)
        assert not own.exists()

    def test_deleting_a_playlist_keeps_files_used_by_another(self, client, device_config, picture):
        def entry(name):
            return {"plugin_id": "image_upload", "name": name, "plugin_settings": {"imageFiles[]": [picture]}, "refresh": {"interval": 3600}}

        device_config.get_playlist_manager().playlists = [Playlist("Keep", "00:00", "24:00", [entry("Kept")]), Playlist("Drop", "08:00", "12:00", [entry("Dropped")])]
        assert client.delete("/delete_playlist/Drop").status_code == 200
        assert os.path.exists(picture)
