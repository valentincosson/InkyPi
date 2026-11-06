"""Nouvelle interface : le bundle livré sur le Pi, ses données et son repli sur l'ancienne interface."""
import ast
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
import json
import os
import re

import pytest
import ui.blueprint as ui_module

from model import RefreshInfo
from refresh_task import PlaylistRefresh
from ui.blueprint import BUNDLE_DIR, ui_bp

FRONTEND_DIR = os.path.join(os.path.dirname(BUNDLE_DIR), "..", "frontend")


@pytest.fixture
def ui_app(app):
    app.register_blueprint(ui_bp)
    return app


@pytest.fixture
def ui_client(ui_app):
    return ui_app.test_client()


def asset_name(extension):
    names = os.listdir(os.path.join(BUNDLE_DIR, "assets"))
    return next(name for name in names if name.endswith(extension))


def source_hash():
    """Même calcul que frontend/scripts/postbuild.mjs."""
    sources = ["index.html", "package.json", "package-lock.json", "tsconfig.json", "tsconfig.app.json", "tsconfig.node.json", "vite.config.ts"]
    for folder in ("scripts", "src"):
        for directory, _, names in os.walk(os.path.join(FRONTEND_DIR, folder)):
            sources += [os.path.relpath(os.path.join(directory, name), FRONTEND_DIR) for name in names if not name.startswith(".")]
    digest = hashlib.sha256()
    for relative in sorted(path.replace(os.sep, "/") for path in sources):
        digest.update(relative.encode())
        digest.update(b"\0")
        with open(os.path.join(FRONTEND_DIR, relative), "rb") as source:
            digest.update(source.read())
        digest.update(b"\0")
    return digest.hexdigest()


def test_bundle_matches_sources():
    with open(os.path.join(BUNDLE_DIR, "source-hash.txt")) as stamp:
        assert stamp.read().strip() == source_hash(), "Bundle périmé : lancez npm run build dans src/ui/frontend"


def test_bundle_does_not_need_node_at_runtime(ui_client):
    page = ui_client.get("/ui/").get_data(as_text=True)
    for path in re.findall(r'(?:src|href)="(/ui/static/[^"]+)"', page):
        assert ui_client.get(path).status_code == 200, path


def test_app_registers_the_interface():
    with open(os.path.join(os.path.dirname(BUNDLE_DIR), "..", "..", "inkypi.py")) as source:
        calls = [node for node in ast.walk(ast.parse(source.read())) if isinstance(node, ast.Call)]
    registered = [call.args[0].id for call in calls if getattr(call.func, "attr", "") == "register_blueprint"]
    assert "ui_bp" in registered
    assert {"main_bp", "settings_bp", "plugin_bp", "playlist_bp", "apikeys_bp"} <= set(registered)


class TestShell:
    @pytest.mark.parametrize("path", ["/ui/", "/ui/any/deep/link"])
    def test_serves_the_application(self, ui_client, path):
        response = ui_client.get(path)
        assert response.status_code == 200
        assert 'id="root"' in response.get_data(as_text=True)
        assert response.cache_control.no_cache or response.cache_control.max_age == 0

    def test_explains_a_missing_bundle(self, ui_client, monkeypatch, tmp_path):
        monkeypatch.setattr(ui_module, "BUNDLE_DIR", str(tmp_path))
        assert ui_client.get("/ui/").status_code == 503

    def test_old_pages_stay_available(self, ui_client):
        for path in ("/playlist", "/settings", "/api-keys", "/plugin/clock"):
            assert ui_client.get(path).status_code == 200, path


class TestAssets:
    def test_compressed_when_accepted(self, ui_client):
        name = asset_name(".js")
        response = ui_client.get(f"/ui/static/assets/{name}", headers={"Accept-Encoding": "gzip, br"})
        assert response.status_code == 200
        assert response.headers["Content-Encoding"] == "gzip"
        assert "javascript" in response.mimetype
        assert "Accept-Encoding" in response.headers["Vary"]
        with open(os.path.join(BUNDLE_DIR, "assets", name), "rb") as original:
            assert gzip.decompress(response.get_data()) == original.read()

    @pytest.mark.parametrize("headers", [{}, {"Accept-Encoding": "gzip;q=0"}, {"Accept-Encoding": "br"}])
    def test_plain_otherwise(self, ui_client, headers):
        response = ui_client.get(f"/ui/static/assets/{asset_name('.css')}", headers=headers)
        assert "Content-Encoding" not in response.headers
        assert response.mimetype == "text/css"
        assert "Accept-Encoding" in response.headers["Vary"]

    def test_fingerprinted_files_are_cached_for_long(self, ui_client):
        response = ui_client.get(f"/ui/static/assets/{asset_name('.css')}")
        assert response.cache_control.max_age == 31_536_000

    def test_licences_are_served_without_long_cache(self, ui_client):
        response = ui_client.get("/ui/static/THIRD_PARTY_LICENSES.txt")
        text = response.get_data(as_text=True)
        assert response.status_code == 200
        assert not response.cache_control.max_age
        for package in ("react ", "@base-ui/react ", "@fontsource-variable/geist ", "lucide-react ", "wouter "):
            assert package in text

    @pytest.mark.parametrize("path", ["/ui/static/../blueprint.py", "/ui/static/..%2fblueprint.py", "/ui/static/missing.js"])
    @pytest.mark.parametrize("headers", [{}, {"Accept-Encoding": "gzip"}])
    def test_rejects_paths_outside_the_bundle(self, ui_client, path, headers):
        assert ui_client.get(path, headers=headers).status_code == 404


class TestState:
    def test_describes_a_playlist_refresh(self, ui_client):
        body = ui_client.get("/ui/api/state").get_json()
        assert body["device"] == {"name": "InkyPi Test", "timezone": "Europe/Paris", "time_format": "24h"}
        assert body["screen"] == {
            "refreshed_at": "2026-01-01T08:00:00+01:00",
            "plugin_id": "clock",
            "plugin_name": "Clock",
            "instance": "Living room",
            "playlist": "Default",
            "image_url": "/api/current_image?v=2026-01-01T08%3A00%3A00%2B01%3A00",
        }

    def test_describes_a_manual_update(self, ui_client, device_config):
        device_config.refresh_info = RefreshInfo("Manual Update", "weather", "2026-06-15T12:00:00+00:00", "hash")
        screen = ui_client.get("/ui/api/state").get_json()["screen"]
        assert screen["plugin_name"] == "Weather"
        assert screen["playlist"] is None and screen["instance"] is None

    def test_survives_a_fresh_install(self, ui_client, device_config):
        device_config.refresh_info = RefreshInfo(None, None, None, None)
        screen = ui_client.get("/ui/api/state").get_json()["screen"]
        assert screen["plugin_name"] is None and screen["refreshed_at"] is None

    def test_keeps_a_removed_plugin_readable(self, ui_client, device_config):
        device_config.refresh_info = RefreshInfo("Manual Update", "gone", "2026-06-15T12:00:00+00:00", "hash")
        assert ui_client.get("/ui/api/state").get_json()["screen"]["plugin_name"] == "gone"

    def test_accepts_a_plugin_without_display_name(self, ui_client, device_config):
        device_config.plugins_list.append({"id": "third_party", "class": "ThirdParty"})
        device_config.refresh_info = RefreshInfo("Manual Update", "third_party", "2026-06-15T12:00:00+00:00", "hash")
        assert ui_client.get("/ui/api/state").get_json()["screen"]["plugin_name"] == "third_party"

    def test_unknown_api_route_is_json_not_the_application(self, ui_client):
        response = ui_client.get("/ui/api/nope")
        assert response.status_code == 404
        assert response.get_json() == {"error": "Not found"}


class TestSettingsData:
    def test_describes_the_device(self, ui_client, device_config):
        device_config.update_config({
            "orientation": "vertical",
            "inverted_image": "on",
            "log_system_stats": None,
            "timezone": "Europe/Paris",
            "time_format": "24h",
            "plugin_cycle_interval_seconds": 5400,
            "image_settings": {"saturation": 1.2, "contrast": 0.8, "sharpness": 1.4, "brightness": 0.9, "inky_saturation": 0.65},
        })

        body = ui_client.get("/ui/api/settings").get_json()

        assert body["orientation"] == "vertical"
        assert body["rotated"] is True
        assert body["log_system_stats"] is False
        assert body["timezone"] == "Europe/Paris"
        assert body["time_format"] == "24h"
        assert body["interval_seconds"] == 5400
        assert body["image"] == {"saturation": 1.2, "contrast": 0.8, "sharpness": 1.4, "brightness": 0.9, "inky_saturation": 0.65}
        assert "Europe/Paris" in body["timezones"]

    def test_fresh_install_has_usable_defaults(self, ui_client, device_config, device_file):
        """Le fichier livré par l'installation ne contient ni fuseau ni réglages d'image."""
        for key in ("timezone", "time_format", "plugin_cycle_interval_seconds", "image_settings", "display_type", "log_system_stats"):
            device_config.config.pop(key, None)

        body = ui_client.get("/ui/api/settings").get_json()

        assert body["timezone"] is None
        assert body["time_format"] == "12h"
        assert body["interval_seconds"] == 3600
        assert body["image"]["brightness"] == 1.0
        assert body["image"]["inky_saturation"] is None
        assert body["inky_display"] is True

    def test_other_displays_have_no_inky_setting(self, ui_client, device_config):
        device_config.update_value("display_type", "mock")
        assert ui_client.get("/ui/api/settings").get_json()["inky_display"] is False


class TestApiKeysData:
    def test_never_exposes_values(self, ui_client, tmp_path):
        (tmp_path / ".env").write_text("OPEN_AI_SECRET=super-secret\nEMPTY=\nNO_VALUE\n")

        response = ui_client.get("/ui/api/api-keys")

        assert "super-secret" not in response.get_data(as_text=True)
        assert response.get_json()["keys"] == [
            {"key": "OPEN_AI_SECRET", "has_value": True},
            {"key": "EMPTY", "has_value": False},
            {"key": "NO_VALUE", "has_value": False},
        ]

    def test_no_file_means_no_keys(self, ui_client):
        assert ui_client.get("/ui/api/api-keys").get_json() == {"keys": []}


PLUGIN_PARAMS_SNAPSHOT = os.path.join(os.path.dirname(__file__), "snapshots", "plugin_params.json")


class TestPluginData:
    def test_lists_plugins_in_the_chosen_order(self, ui_client, device_config):
        ui_client.post("/api/plugin_order", json={"order": ["clock", "weather"]})
        plugins = ui_client.get("/ui/api/plugins").get_json()["plugins"]
        assert plugins[:2] == [{"id": "clock", "name": "Clock"}, {"id": "weather", "name": "Weather"}]

    def test_describes_a_new_form(self, ui_client):
        body = ui_client.get("/ui/api/plugins/clock").get_json()
        assert body["id"] == "clock"
        assert body["name"] == "Clock"
        assert body["instance"] is None
        assert body["settings"] is None
        assert "Default" in body["playlists"]
        assert body["params"]["clock_faces"][0]["name"]
        assert "settings_template" not in body["params"]

    def test_describes_an_existing_instance(self, ui_client, device_config):
        instance = device_config.get_playlist_manager().find_plugin("clock", "Living room")
        instance.refresh = {"interval": 7200}
        body = ui_client.get("/ui/api/plugins/clock?instance=Living room").get_json()
        assert body["instance"] == "Living room"
        assert body["settings"] == instance.settings
        assert body["refresh"] == {"interval": 7200}

    def test_unknown_plugin_or_instance(self, ui_client):
        assert ui_client.get("/ui/api/plugins/nope").status_code == 404
        assert ui_client.get("/ui/api/plugins/clock?instance=Nope").status_code == 404

    def test_reports_key_names_without_values(self, ui_client, tmp_path):
        (tmp_path / ".env").write_text("OPEN_AI_SECRET=super-secret\nEMPTY=\n")
        response = ui_client.get("/ui/api/plugins/ai_text")
        assert "super-secret" not in response.get_data(as_text=True)
        assert response.get_json()["keys_set"] == ["OPEN_AI_SECRET"]

    def test_every_plugin_can_describe_its_form(self, ui_client, device_config):
        """Sert aussi de référence aux tests du moteur de formulaires, côté front."""
        actual = {}
        for plugin in device_config.get_plugins():
            response = ui_client.get(f"/ui/api/plugins/{plugin['id']}")
            assert response.status_code == 200, plugin["id"]
            actual[plugin["id"]] = response.get_json()["params"]

        if os.environ.get("UPDATE_PLUGIN_FORM_SNAPSHOTS"):
            with open(PLUGIN_PARAMS_SNAPSHOT, "w") as snapshot:
                json.dump(actual, snapshot, indent=2, ensure_ascii=False, sort_keys=True)
                snapshot.write("\n")
        with open(PLUGIN_PARAMS_SNAPSHOT) as snapshot:
            assert actual == json.load(snapshot)


def fill_default_playlist(device_config, names):
    playlist = device_config.get_playlist_manager().get_playlist("Default")
    playlist.start_time, playlist.end_time = "00:00", "24:00"
    playlist.plugins = []
    for name in names:
        playlist.add_plugin({"plugin_id": "clock", "name": name, "plugin_settings": {}, "refresh": {"interval": 60}})
    return playlist


class TestRotation:
    def rotation(self, ui_client):
        return ui_client.get("/ui/api/state").get_json()["rotation"]

    def test_starts_after_the_current_entry_and_wraps_around(self, ui_client, device_config):
        playlist = fill_default_playlist(device_config, ["A", "B", "C"])
        playlist.current_plugin_index = 1
        rotation = self.rotation(ui_client)
        assert rotation["playlist"] == "Default"
        assert [item["instance"] for item in rotation["upcoming"]] == ["C", "A", "B"]
        assert playlist.current_plugin_index == 1

    def test_starts_at_the_first_entry_when_nothing_has_run(self, ui_client, device_config):
        fill_default_playlist(device_config, ["A", "B"]).current_plugin_index = None
        assert [item["instance"] for item in self.rotation(ui_client)["upcoming"]] == ["A", "B"]

    def test_never_lists_more_than_four(self, ui_client, device_config):
        fill_default_playlist(device_config, list("ABCDEF")).current_plugin_index = 0
        assert [item["instance"] for item in self.rotation(ui_client)["upcoming"]] == list("BCDE")

    def test_survives_an_index_beyond_the_list(self, ui_client, device_config):
        fill_default_playlist(device_config, ["A", "B"]).current_plugin_index = 7
        assert [item["instance"] for item in self.rotation(ui_client)["upcoming"]] == ["A", "B"]

    def test_watches_from_the_start_of_the_playlist_window(self, ui_client, device_config):
        """Une playlist de jour n'est pas en retard le matin : le moteur ne faisait rien la nuit."""
        device_config.update_value("timezone", "UTC")
        playlist = fill_default_playlist(device_config, ["A"])
        playlist.current_plugin_index = 0
        now = datetime.now(timezone.utc)
        playlist.start_time, playlist.end_time = (now - timedelta(minutes=5)).strftime("%H:%M"), "24:00"
        if now.hour == 0 and now.minute < 6:
            pytest.skip("La fenêtre chevaucherait minuit")
        since = datetime.fromisoformat(self.rotation(ui_client)["watching_since"])
        assert timedelta(0) <= now - since <= timedelta(minutes=6)

    def test_watches_from_yesterday_in_a_window_past_midnight(self, ui_client, device_config):
        device_config.update_value("timezone", "UTC")
        playlist = fill_default_playlist(device_config, ["A"])
        playlist.current_plugin_index = 0
        now = datetime.now(timezone.utc)
        start = now + timedelta(minutes=30)
        if start.date() != now.date():
            pytest.skip("La fenêtre chevaucherait minuit dans l'autre sens")
        playlist.start_time = start.strftime("%H:%M")
        playlist.end_time = (start - timedelta(minutes=1)).strftime("%H:%M")
        since = datetime.fromisoformat(self.rotation(ui_client)["watching_since"])
        assert timedelta(hours=23) < now - since < timedelta(hours=24)

    def test_a_playlist_that_never_ran_is_not_late(self, ui_client, device_config):
        fill_default_playlist(device_config, ["A"]).current_plugin_index = None
        since = datetime.fromisoformat(self.rotation(ui_client)["watching_since"])
        assert datetime.now(timezone.utc) - since < timedelta(minutes=1)

    def test_an_all_day_playlist_has_no_window(self, ui_client, device_config):
        """Sinon, un moteur bloqué depuis la veille paraîtrait normal après minuit."""
        fill_default_playlist(device_config, ["A"]).current_plugin_index = 0
        assert self.rotation(ui_client)["watching_since"] is None

    def test_nothing_to_watch_without_a_playlist(self, ui_client, device_config):
        device_config.get_playlist_manager().playlists = []
        assert self.rotation(ui_client)["watching_since"] is None

    def test_can_refresh_the_entry_on_the_screen(self, ui_client, device_config):
        fill_default_playlist(device_config, ["A"])
        device_config.refresh_info = RefreshInfo("Playlist", "clock", "2026-01-01T08:00:00+01:00", "x", playlist="Default", plugin_instance="A")
        assert self.rotation(ui_client)["can_refresh"] is True

    @pytest.mark.parametrize(
        "playlist,plugin_id,instance",
        [("Gone", "clock", "A"), ("Default", "clock", "Gone"), (None, "clock", None), ("Default", "not_installed", "A")],
    )
    def test_cannot_refresh_what_no_longer_exists(self, ui_client, device_config, playlist, plugin_id, instance):
        fill_default_playlist(device_config, ["A"])
        device_config.refresh_info = RefreshInfo("Playlist", plugin_id, "2026-01-01T08:00:00+01:00", "x", playlist=playlist, plugin_instance=instance)
        assert self.rotation(ui_client)["can_refresh"] is False

    def test_encodes_names_in_image_addresses(self, ui_client, device_config):
        fill_default_playlist(device_config, ["Météo été"]).current_plugin_index = None
        url = self.rotation(ui_client)["upcoming"][0]["image_url"]
        assert url == "/plugin_instance_image/Default/clock/M%C3%A9t%C3%A9o%20%C3%A9t%C3%A9"

    def test_no_active_playlist(self, ui_client, device_config):
        manager = device_config.get_playlist_manager()
        manager.playlists = []
        rotation = self.rotation(ui_client)
        assert rotation["playlist"] is None
        assert rotation["upcoming"] == []

    def test_invalid_time_zone_does_not_break_the_page(self, ui_client, device_config):
        device_config.update_value("timezone", "Nowhere/Land")
        assert ui_client.get("/ui/api/state").status_code == 200

    def test_reports_when_updates_are_not_running(self, ui_client, refresh_task):
        refresh_task.running = False
        assert self.rotation(ui_client)["running"] is False


class TestShowNext:
    def test_advances_the_rotation_and_forces_a_render(self, ui_client, device_config, refresh_task):
        playlist = fill_default_playlist(device_config, ["A", "B"])
        playlist.current_plugin_index = 0
        response = ui_client.post("/ui/api/show-next")
        assert response.status_code == 200
        action = refresh_task.actions[0]
        assert isinstance(action, PlaylistRefresh)
        assert action.plugin_instance.name == "B"
        assert action.force is True
        assert playlist.current_plugin_index == 1

    def test_a_failure_does_not_skip_an_entry(self, ui_client, device_config, refresh_task, monkeypatch):
        playlist = fill_default_playlist(device_config, ["A", "B"])
        playlist.current_plugin_index = 0

        def fail(action):
            raise RuntimeError("no network")

        monkeypatch.setattr(refresh_task, "manual_update", fail)
        response = ui_client.post("/ui/api/show-next")
        assert response.status_code == 500
        assert response.get_json()["error"] == "no network"
        assert playlist.current_plugin_index == 0

    def test_plugin_that_no_longer_exists_is_not_a_success(self, ui_client, device_config, refresh_task):
        """Le moteur l'ignorerait sans rien dire : la page annoncerait un affichage qui n'a pas eu lieu."""
        playlist = fill_default_playlist(device_config, ["A"])
        playlist.plugins[0].plugin_id = "not_installed"
        playlist.current_plugin_index = None
        assert ui_client.post("/ui/api/show-next").status_code == 409
        assert refresh_task.actions == []
        assert playlist.current_plugin_index is None

    def test_refuses_when_nothing_can_be_shown(self, ui_client, device_config, refresh_task):
        device_config.get_playlist_manager().playlists = []
        assert ui_client.post("/ui/api/show-next").status_code == 409
        assert refresh_task.actions == []

    def test_refuses_when_updates_are_not_running(self, ui_client, device_config, refresh_task):
        """manual_update se contenterait de ne rien faire : la page croirait à un succès."""
        fill_default_playlist(device_config, ["A"])
        refresh_task.running = False
        assert ui_client.post("/ui/api/show-next").status_code == 409

    def test_a_simple_visit_changes_nothing(self, ui_client, device_config, refresh_task):
        fill_default_playlist(device_config, ["A"])
        assert ui_client.get("/ui/api/show-next").status_code != 200
        assert refresh_task.actions == []
