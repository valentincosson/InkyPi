"""Fige les routes et leurs réponses, sur lesquelles la nouvelle interface va s'appuyer.

Certains tests décrivent des comportements discutables : ils protègent l'existant, ils ne le valident pas.
"""
import io
import json
import os

import pytest

import blueprints.main as main_module
import blueprints.settings as settings_module
import utils.app_utils as app_utils
from refresh_task import ManualRefresh, PlaylistRefresh

EXPECTED_ROUTES = {
    ("/", ("GET",), "main.main_page"),
    ("/add_plugin", ("POST",), "playlist.add_plugin"),
    ("/api-keys", ("GET",), "apikeys.apikeys_page"),
    ("/api-keys/save", ("POST",), "apikeys.save_apikeys"),
    ("/api/current_image", ("GET",), "main.get_current_image"),
    ("/api/plugin_order", ("POST",), "main.save_plugin_order"),
    ("/create_playlist", ("POST",), "playlist.create_playlist"),
    ("/delete_playlist/<string:playlist_name>", ("DELETE",), "playlist.delete_playlist"),
    ("/delete_plugin_instance", ("POST",), "plugin.delete_plugin_instance"),
    ("/display_plugin_instance", ("POST",), "plugin.display_plugin_instance"),
    ("/download-logs", ("GET",), "settings.download_logs"),
    ("/images/<plugin_id>/<path:filename>", ("GET",), "plugin.image"),
    ("/playlist", ("GET",), "playlist.playlists"),
    ("/plugin/<plugin_id>", ("GET",), "plugin.plugin_page"),
    (
        "/plugin_instance_image/<path:playlist_name>/<path:plugin_id>/<path:instance_name>",
        ("GET",),
        "plugin.plugin_instance_image",
    ),
    ("/save_settings", ("POST",), "settings.save_settings"),
    ("/settings", ("GET",), "settings.settings_page"),
    ("/shutdown", ("POST",), "settings.shutdown"),
    ("/static/<path:filename>", ("GET",), "static"),
    ("/update_now", ("POST",), "plugin.update_now"),
    ("/update_playlist/<string:playlist_name>", ("PUT",), "playlist.update_playlist"),
    ("/update_plugin_instance/<string:instance_name>", ("PUT",), "plugin.update_plugin_instance"),
}


def refresh_settings(**overrides):
    values = {
        "playlist": "Default",
        "instance_name": "Kitchen",
        "refreshType": "interval",
        "unit": "hour",
        "interval": "2",
    }
    values.update(overrides)
    return json.dumps(values)


def settings_form(**overrides):
    values = {
        "deviceName": "Frame",
        "orientation": "vertical",
        "timezoneName": "Europe/Paris",
        "timeFormat": "24h",
        "unit": "minute",
        "interval": "30",
        "saturation": "1.2",
        "brightness": "1.1",
        "sharpness": "1.3",
        "contrast": "1.4",
    }
    values.update(overrides)
    return values


def find_instance(device_config, plugin_id, name):
    return device_config.get_playlist_manager().find_plugin(plugin_id, name)


def test_route_map_is_stable(app):
    routes = {
        (rule.rule, tuple(sorted(rule.methods - {"HEAD", "OPTIONS"})), rule.endpoint)
        for rule in app.url_map.iter_rules()
    }
    assert routes == EXPECTED_ROUTES


@pytest.mark.parametrize(
    "path",
    ["/", "/playlist", "/settings", "/api-keys", "/plugin/clock?instance=Living room", "/plugin/countdown?instance=Holidays"],
)
def test_pages_render(client, path):
    assert client.get(path).status_code == 200


def test_every_plugin_page_renders(client, device_config):
    plugins = device_config.get_plugins()
    assert len(plugins) == 20
    for plugin in plugins:
        response = client.get(f"/plugin/{plugin['id']}")
        page = response.get_data(as_text=True)
        assert response.status_code == 200, plugin["id"]
        assert 'id = "settingsForm"' in page, plugin["id"]
        assert page.index("const pluginSettings") < page.index('id = "settingsForm"'), plugin["id"]


def test_unknown_plugin_and_instance(client):
    assert client.get("/plugin/nope").status_code == 404
    response = client.get("/plugin/clock?instance=Nope")
    assert response.status_code == 500
    assert "error" in response.get_json()


def test_plugin_icon_is_served(client):
    assert client.get("/images/clock/icon.png").status_code == 200


def test_plugin_image_route_rejects_traversal(client):
    assert client.get("/images/clock/..%2F..%2Fconfig.py").status_code in (403, 404)


class TestPlaylists:
    def test_create(self, client, device_config):
        response = client.post(
            "/create_playlist", json={"playlist_name": "Morning", "start_time": "06:00", "end_time": "09:00"}
        )
        assert response.status_code == 200
        assert response.get_json()["success"] is True
        assert device_config.get_playlist_manager().get_playlist("Morning").start_time == "06:00"

    @pytest.mark.parametrize(
        "payload",
        [
            {"playlist_name": " ", "start_time": "06:00", "end_time": "09:00"},
            {"playlist_name": "Morning", "start_time": "", "end_time": "09:00"},
            {"playlist_name": "Default", "start_time": "06:00", "end_time": "09:00"},
        ],
    )
    def test_create_rejects_invalid(self, client, payload):
        response = client.post("/create_playlist", json=payload)
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_update(self, client, device_config):
        response = client.put(
            "/update_playlist/Night", json={"new_name": "Late", "start_time": "22:00", "end_time": "04:00"}
        )
        assert response.status_code == 200
        playlist = device_config.get_playlist_manager().get_playlist("Late")
        assert (playlist.start_time, playlist.end_time) == ("22:00", "04:00")

    def test_delete_removes_instance_images(self, client, device_config):
        image = os.path.join(device_config.plugin_image_dir, "clock_Living_room.png")
        open(image, "w").close()

        assert client.delete("/delete_playlist/Default").status_code == 200

        assert not os.path.exists(image)
        assert device_config.get_playlist_manager().get_playlist("Default") is None

    def test_page_exposes_special_characters_unescaped_for_javascript(self, client):
        """Bug connu à corriger au lot 6 : l'apostrophe casse le bouton de modification."""
        client.post("/create_playlist", json={"playlist_name": "Salon d'hiver", "start_time": "06:00", "end_time": "09:00"})
        page = client.get("/playlist").get_data(as_text=True)
        assert "openEditModal('Salon d&#39;hiver'" in page


class TestAddPlugin:
    def post(self, client, **form):
        form.setdefault("plugin_id", "clock")
        form.setdefault("refresh_settings", refresh_settings())
        return client.post("/add_plugin", data=form, content_type="multipart/form-data")

    def test_interval(self, client, device_config):
        response = self.post(client, selectedClockFace="Word")
        assert response.status_code == 200
        instance = find_instance(device_config, "clock", "Kitchen")
        assert instance.refresh == {"interval": 7200}
        assert instance.settings == {"selectedClockFace": "Word"}

    def test_scheduled(self, client, device_config):
        response = self.post(client, refresh_settings=refresh_settings(refreshType="scheduled", refreshTime="07:15"))
        assert response.status_code == 200
        assert find_instance(device_config, "clock", "Kitchen").refresh == {"scheduled": "07:15"}

    def test_array_fields_stay_arrays(self, client, device_config):
        client.post(
            "/add_plugin",
            data={"plugin_id": "clock", "refresh_settings": refresh_settings(), "items[]": ["a", "b"]},
            content_type="multipart/form-data",
        )
        assert find_instance(device_config, "clock", "Kitchen").settings == {"items[]": ["a", "b"]}

    @pytest.mark.parametrize(
        "overrides",
        [
            {"playlist": ""},
            {"instance_name": " "},
            {"instance_name": "Salon d'hiver"},
            {"refreshType": "weekly"},
            {"unit": "second"},
            {"interval": ""},
            {"refreshType": "scheduled", "refreshTime": ""},
        ],
    )
    def test_rejects_invalid(self, client, overrides):
        response = self.post(client, refresh_settings=refresh_settings(**overrides))
        assert response.status_code == 400
        assert "error" in response.get_json()

    def test_instance_names_are_global_across_playlists(self, client):
        response = self.post(client, refresh_settings=refresh_settings(playlist="Night", instance_name="Living room"))
        assert response.status_code == 400

    def test_accented_names_are_accepted(self, client, device_config):
        response = self.post(client, refresh_settings=refresh_settings(instance_name="Météo été"))
        assert response.status_code == 200
        assert find_instance(device_config, "clock", "Météo été") is not None


class TestPluginInstances:
    def test_refresh_only_update_keeps_settings(self, client, device_config):
        before = dict(find_instance(device_config, "clock", "Living room").settings)
        response = client.put(
            "/update_plugin_instance/Living room",
            data={"plugin_id": "clock", "refresh_settings": refresh_settings(refreshType="scheduled", refreshTime="05:00")},
            content_type="multipart/form-data",
        )
        assert response.status_code == 200
        instance = find_instance(device_config, "clock", "Living room")
        assert instance.settings == before
        assert instance.refresh == {"scheduled": "05:00"}

    def test_settings_update_replaces_all_settings(self, client, device_config):
        client.put(
            "/update_plugin_instance/Living room",
            data={"plugin_id": "clock", "primaryColor": "#000000"},
            content_type="multipart/form-data",
        )
        assert find_instance(device_config, "clock", "Living room").settings == {"primaryColor": "#000000"}

    def test_existing_file_path_is_kept_and_new_file_saved(self, client, device_config, monkeypatch, tmp_path):
        saved = tmp_path / "static" / "images" / "saved"
        saved.mkdir(parents=True)
        monkeypatch.setattr(app_utils, "resolve_path", lambda path: str(tmp_path / path))

        client.put(
            "/update_plugin_instance/Living room",
            data={
                "plugin_id": "clock",
                "backgroundImageFile": (io.BytesIO(b"png"), "fond.png"),
            },
            content_type="multipart/form-data",
        )
        path = find_instance(device_config, "clock", "Living room").settings["backgroundImageFile"]
        assert path == str(saved / "fond.png")
        assert os.path.exists(path)

    def test_delete(self, client, device_config):
        response = client.post(
            "/delete_plugin_instance",
            json={"playlist_name": "Default", "plugin_id": "clock", "plugin_instance": "Living room"},
        )
        assert response.status_code == 200
        assert find_instance(device_config, "clock", "Living room") is None

    @pytest.mark.parametrize("route", ["/delete_plugin_instance", "/display_plugin_instance"])
    def test_not_found_errors_use_message_not_error(self, client, route):
        """Incohérence connue : ces routes renvoient `message`, alors que la page lit `error`."""
        response = client.post(route, json={"playlist_name": "Nope", "plugin_id": "x", "plugin_instance": "y"})
        body = response.get_json()
        assert response.status_code == 400
        assert body["success"] is False
        assert "message" in body and "error" not in body

    def test_display_forces_playlist_refresh(self, client, refresh_task):
        response = client.post(
            "/display_plugin_instance",
            json={"playlist_name": "Default", "plugin_id": "clock", "plugin_instance": "Living room"},
        )
        action = refresh_task.actions[0]
        assert response.status_code == 200
        assert isinstance(action, PlaylistRefresh) and action.force is True

    def test_update_now_sends_settings_without_plugin_id(self, client, refresh_task):
        response = client.post(
            "/update_now",
            data={"plugin_id": "clock", "primaryColor": "#fff", "list[]": ["a", "b"]},
            content_type="multipart/form-data",
        )
        action = refresh_task.actions[0]
        assert response.status_code == 200
        assert isinstance(action, ManualRefresh)
        assert action.plugin_id == "clock"
        assert action.plugin_settings == {"primaryColor": "#fff", "list[]": ["a", "b"]}

    def test_update_now_reports_plugin_errors(self, client, refresh_task, monkeypatch):
        def fail(action):
            raise RuntimeError("clé manquante")

        monkeypatch.setattr(refresh_task, "manual_update", fail)
        response = client.post("/update_now", data={"plugin_id": "clock"}, content_type="multipart/form-data")
        assert response.status_code == 500
        assert "clé manquante" in response.get_json()["error"]


class TestSettings:
    def test_save(self, client, device_config, refresh_task):
        response = client.post("/save_settings", data=settings_form(invertImage="on", logSystemStats="on"))
        assert response.status_code == 200
        assert device_config.get_config("name") == "Frame"
        assert device_config.get_config("orientation") == "vertical"
        assert device_config.get_config("inverted_image") == "on"
        assert device_config.get_config("log_system_stats") == "on"
        assert device_config.get_config("timezone") == "Europe/Paris"
        assert device_config.get_config("plugin_cycle_interval_seconds") == 1800
        assert device_config.get_config("image_settings") == {
            "saturation": 1.2,
            "brightness": 1.1,
            "sharpness": 1.3,
            "contrast": 1.4,
        }
        assert refresh_task.config_changes == 1

    def test_unchecked_boxes_become_none(self, client, device_config):
        client.post("/save_settings", data=settings_form(invertImage="on"))
        client.post("/save_settings", data=settings_form())
        assert device_config.get_config("inverted_image") is None

    def test_unchanged_interval_does_not_wake_refresh_thread(self, client, refresh_task):
        client.post("/save_settings", data=settings_form(unit="hour", interval="1"))
        assert refresh_task.config_changes == 0

    def test_inky_saturation_must_be_sent_to_be_kept(self, client, device_config):
        client.post("/save_settings", data=settings_form(inky_saturation="0.7"))
        assert device_config.get_config("image_settings")["inky_saturation"] == 0.7

        client.post("/save_settings", data=settings_form())
        assert "inky_saturation" not in device_config.get_config("image_settings")

    @pytest.mark.parametrize(
        "overrides",
        [
            {"unit": "day"},
            {"interval": "abc"},
            {"timezoneName": ""},
            {"timeFormat": "8h"},
            {"unit": "hour", "interval": "25"},
            {"interval": "0"},
        ],
    )
    def test_rejects_invalid(self, client, overrides):
        response = client.post("/save_settings", data=settings_form(**overrides))
        assert response.status_code == 400
        assert "error" in response.get_json()

    @pytest.mark.parametrize(
        "payload,command",
        [({"reboot": True}, "sudo reboot"), ({}, "sudo shutdown -h now")],
    )
    def test_shutdown_runs_system_command(self, client, monkeypatch, payload, command):
        calls = []
        monkeypatch.setattr(settings_module.os, "system", calls.append)
        response = client.post("/shutdown", json=payload)
        assert response.status_code == 200
        assert calls == [command]


class TestApiKeys:
    def test_page_never_exposes_values(self, client, tmp_path):
        (tmp_path / ".env").write_text("OPEN_AI_SECRET=super-secret\n")
        page = client.get("/api-keys").get_data(as_text=True)
        assert "OPEN_AI_SECRET" in page
        assert "super-secret" not in page

    def test_save_keeps_existing_values(self, client, tmp_path, monkeypatch):
        (tmp_path / ".env").write_text("OPEN_AI_SECRET=super-secret\nOLD=removed\n")
        monkeypatch.setitem(os.environ, "OPEN_AI_SECRET", "")
        monkeypatch.setitem(os.environ, "NEW_KEY", "")

        response = client.post(
            "/api-keys/save",
            json={
                "entries": [
                    {"key": "OPEN_AI_SECRET", "keepExisting": True},
                    {"key": "NEW_KEY", "value": "avec espace"},
                ]
            },
        )

        content = (tmp_path / ".env").read_text()
        assert response.status_code == 200
        assert "OPEN_AI_SECRET=super-secret\n" in content
        assert 'NEW_KEY="avec espace"\n' in content
        assert "OLD" not in content

    def test_rejects_invalid_key(self, client):
        response = client.post("/api-keys/save", json={"entries": [{"key": "1 bad", "value": "x"}]})
        assert response.status_code == 400


class TestHome:
    def test_plugin_order(self, client, device_config):
        response = client.post("/api/plugin_order", json={"order": ["clock", "weather"]})
        assert response.status_code == 200
        assert [plugin["id"] for plugin in device_config.get_plugins()][:2] == ["clock", "weather"]

    def test_plugin_order_must_be_a_list(self, client):
        assert client.post("/api/plugin_order", json={"order": "clock"}).status_code == 400

    def test_current_image(self, client, monkeypatch, tmp_path):
        monkeypatch.setattr(main_module, "__file__", str(tmp_path / "blueprints" / "main.py"))
        assert client.get("/api/current_image").status_code == 404

        image = tmp_path / "static" / "images" / "current_image.png"
        image.parent.mkdir(parents=True)
        image.write_bytes(b"png")

        first = client.get("/api/current_image")
        assert first.status_code == 200
        assert first.headers["Cache-Control"] == "no-cache"

        second = client.get("/api/current_image", headers={"If-Modified-Since": first.headers["Last-Modified"]})
        assert second.status_code == 304
