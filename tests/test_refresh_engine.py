"""Fige le comportement du moteur : choix du plugin, rotation, affichage et remontée d'erreur."""
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image

from display.display_manager import DisplayManager
from model import Playlist, PlaylistManager, PluginInstance, RefreshInfo
from plugins.plugin_registry import PLUGIN_CLASSES
from refresh_task import ManualRefresh, RefreshTask

NOW = datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc)


class FakePlugin:
    config = {}

    def __init__(self):
        self.color = "white"
        self.error = None
        self.settings_seen = []

    def generate_image(self, settings, device_config):
        self.settings_seen.append(settings)
        if self.error:
            raise self.error
        return Image.new("RGB", (800, 480), self.color)


def instance(name="Instance", refresh=None, latest=None):
    return PluginInstance("fake", name, {}, refresh or {"interval": 3600}, latest)


@pytest.fixture
def fake_plugin(device_config, monkeypatch):
    plugin = FakePlugin()
    monkeypatch.setitem(PLUGIN_CLASSES, "fake", plugin)
    device_config.plugins_list.append({"id": "fake", "class": "FakePlugin", "display_name": "Fake"})
    return plugin


@pytest.fixture
def engine(device_config, fake_plugin):
    display_manager = DisplayManager(device_config)
    shown = []
    original = display_manager.display.display_image

    def spy(image, image_settings=[]):
        shown.append(image)
        original(image, image_settings)

    display_manager.display.display_image = spy
    task = RefreshTask(device_config, display_manager)
    task.shown = shown
    task.start()
    yield task
    task.stop()


class TestManualUpdate:
    def test_displays_and_records_refresh(self, engine, device_config, fake_plugin):
        engine.manual_update(ManualRefresh("fake", {"a": "1"}))

        assert len(engine.shown) == 1
        assert fake_plugin.settings_seen == [{"a": "1"}]
        info = device_config.get_refresh_info()
        assert info.refresh_type == "Manual Update"
        assert info.plugin_id == "fake"
        assert info.image_hash

    def test_identical_image_is_not_displayed_twice(self, engine):
        engine.manual_update(ManualRefresh("fake", {}))
        engine.manual_update(ManualRefresh("fake", {}))

        assert len(engine.shown) == 1

    def test_changed_image_is_displayed(self, engine, fake_plugin):
        engine.manual_update(ManualRefresh("fake", {}))
        fake_plugin.color = "black"
        engine.manual_update(ManualRefresh("fake", {}))

        assert len(engine.shown) == 2

    def test_plugin_error_reaches_caller_and_display_is_untouched(self, engine, fake_plugin):
        fake_plugin.error = RuntimeError("clé manquante")

        with pytest.raises(RuntimeError, match="clé manquante"):
            engine.manual_update(ManualRefresh("fake", {}))

        assert engine.shown == []

    def test_engine_survives_a_plugin_error(self, engine, fake_plugin):
        fake_plugin.error = RuntimeError("panne")
        with pytest.raises(RuntimeError):
            engine.manual_update(ManualRefresh("fake", {}))

        fake_plugin.error = None
        engine.manual_update(ManualRefresh("fake", {}))

        assert len(engine.shown) == 1


class TestPlaylistSelection:
    def test_shortest_active_window_wins(self):
        manager = PlaylistManager(
            playlists=[Playlist("All day", "00:00", "24:00"), Playlist("Lunch", "11:00", "14:00")]
        )
        assert manager.determine_active_playlist(NOW).name == "Lunch"

    def test_no_active_playlist(self):
        manager = PlaylistManager(playlists=[Playlist("Night", "21:00", "03:00")])
        assert manager.determine_active_playlist(NOW) is None

    def test_rotation_starts_at_first_then_wraps(self):
        playlist = Playlist("P", "00:00", "24:00")
        playlist.plugins = [instance("a"), instance("b")]
        assert [playlist.get_next_plugin().name for _ in range(3)] == ["a", "b", "a"]

    def test_determine_next_plugin_respects_cycle_interval(self, device_config, fake_plugin):
        task = RefreshTask(device_config, None)
        manager = device_config.get_playlist_manager()
        recent = RefreshInfo("Playlist", "fake", (NOW - timedelta(minutes=5)).isoformat(), "h")
        old = RefreshInfo("Playlist", "fake", (NOW - timedelta(hours=2)).isoformat(), "h")

        assert task._determine_next_plugin(manager, recent, NOW) == (None, None)

        playlist, plugin = task._determine_next_plugin(manager, old, NOW)
        assert playlist.name == "Default"
        assert plugin.name == "Living room"
        assert manager.active_playlist == "Default"

    def test_empty_active_playlist_shows_nothing(self, device_config):
        task = RefreshTask(device_config, None)
        manager = PlaylistManager(playlists=[Playlist("Empty", "00:00", "24:00")])
        assert task._determine_next_plugin(manager, RefreshInfo(None, None, None, None), NOW) == (None, None)
        assert manager.active_playlist == "Empty"


class TestInstanceRefresh:
    def test_never_refreshed(self):
        assert instance().should_refresh(NOW) is True

    def test_interval(self):
        assert instance(latest=(NOW - timedelta(minutes=59)).isoformat()).should_refresh(NOW) is False
        assert instance(latest=(NOW - timedelta(minutes=60)).isoformat()).should_refresh(NOW) is True

    def test_scheduled_after_time_passes(self):
        latest = (NOW - timedelta(days=1)).isoformat()
        assert instance(refresh={"scheduled": "11:00"}, latest=latest).should_refresh(NOW) is True

    def test_image_name_stays_stable_for_existing_installations(self):
        assert PluginInstance("clock", "Living room", {}, {}).get_image_path() == "clock_Living_room.png"
