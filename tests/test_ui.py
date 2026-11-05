"""Nouvelle interface : le bundle livré sur le Pi, ses données et son repli sur l'ancienne interface."""
import ast
import gzip
import hashlib
import os
import re

import pytest
import ui.blueprint as ui_module

from model import RefreshInfo
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
        for path in ("/", "/playlist", "/settings", "/api-keys", "/plugin/clock"):
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
