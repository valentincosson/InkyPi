"""Fixtures communes : application et configuration isolées dans un dossier temporaire."""
import copy
import json
import os
import threading

import pytest
from flask import Flask
from jinja2 import ChoiceLoader, FileSystemLoader

import blueprints.apikeys as apikeys_module
from blueprints.apikeys import apikeys_bp
from blueprints.main import main_bp
from blueprints.playlist import playlist_bp
from blueprints.plugin import plugin_bp
from blueprints.settings import settings_bp
from config import Config
from plugins.plugin_registry import load_plugins

SRC_DIR = Config.BASE_DIR

DEVICE_CONFIG = {
    "name": "InkyPi Test",
    "display_type": "mock",
    "resolution": [800, 480],
    "orientation": "horizontal",
    "inverted_image": None,
    "log_system_stats": None,
    "timezone": "Europe/Paris",
    "time_format": "24h",
    "plugin_cycle_interval_seconds": 3600,
    "image_settings": {"saturation": 1.0, "brightness": 1.0, "sharpness": 1.0, "contrast": 1.0},
    "plugin_order": ["weather", "clock"],
    "future_top_level_key": {"kept": True},
    "playlist_config": {
        "playlists": [
            {
                "name": "Default",
                "start_time": "00:00",
                "end_time": "24:00",
                "plugins": [
                    {
                        "plugin_id": "clock",
                        "name": "Living room",
                        "plugin_settings": {"selectedClockFace": "Gradient", "primaryColor": "#db3246"},
                        "refresh": {"interval": 3600},
                        "latest_refresh_time": "2026-01-01T08:00:00+01:00",
                    },
                    {
                        "plugin_id": "countdown",
                        "name": "Holidays",
                        "plugin_settings": {"title": "Holidays", "date": "2030-12-25"},
                        "refresh": {"scheduled": "06:30"},
                        "latest_refresh_time": None,
                    },
                ],
                "current_plugin_index": 1,
            },
            {
                "name": "Night",
                "start_time": "21:00",
                "end_time": "03:00",
                "plugins": [],
                "current_plugin_index": None,
            },
        ],
        "active_playlist": "Default",
    },
    "refresh_info": {
        "refresh_time": "2026-01-01T08:00:00+01:00",
        "image_hash": "abc",
        "refresh_type": "Playlist",
        "plugin_id": "clock",
        "playlist": "Default",
        "plugin_instance": "Living room",
    },
}


class FakeRefreshTask:
    """Remplace le thread de rafraîchissement : les tests lisent ce qui lui est demandé."""

    def __init__(self):
        self.running = True
        self.actions = []
        self.config_changes = 0
        self.lock = threading.Lock()

    def manual_update(self, action):
        self.actions.append(action)

    def signal_config_change(self):
        self.config_changes += 1


@pytest.fixture
def device_data():
    return copy.deepcopy(DEVICE_CONFIG)


@pytest.fixture
def device_file(tmp_path, device_data):
    path = tmp_path / "device.json"
    path.write_text(json.dumps(device_data))
    return path


@pytest.fixture
def device_config(tmp_path, monkeypatch, device_file):
    images = tmp_path / "images"
    (images / "plugins").mkdir(parents=True)
    monkeypatch.setattr(Config, "config_file", str(device_file))
    monkeypatch.setattr(Config, "current_image_file", str(images / "current_image.png"))
    monkeypatch.setattr(Config, "plugin_image_dir", str(images / "plugins"))
    config = Config()
    config.update_value("output_dir", str(tmp_path / "mock_display_output"))
    load_plugins(config.get_plugins())
    return config


@pytest.fixture
def refresh_task():
    return FakeRefreshTask()


@pytest.fixture
def app(tmp_path, monkeypatch, device_config, refresh_task):
    """Même assemblage que src/inkypi.py, qui ne peut pas être importé : il lit sys.argv au chargement."""
    env_file = tmp_path / ".env"
    monkeypatch.setattr(apikeys_module, "get_env_path", lambda: str(env_file))

    flask_app = Flask("inkypi_test", root_path=SRC_DIR)
    flask_app.jinja_loader = ChoiceLoader(
        [FileSystemLoader(os.path.join(SRC_DIR, name)) for name in ("templates", "plugins")]
    )
    flask_app.config["DEVICE_CONFIG"] = device_config
    flask_app.config["DISPLAY_MANAGER"] = None
    flask_app.config["REFRESH_TASK"] = refresh_task
    flask_app.config["MAX_FORM_PARTS"] = 10_000
    for blueprint in (main_bp, settings_bp, plugin_bp, playlist_bp, apikeys_bp):
        flask_app.register_blueprint(blueprint)
    return flask_app


@pytest.fixture
def client(app):
    return app.test_client()
