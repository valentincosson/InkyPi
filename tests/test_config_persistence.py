"""Une installation existante ne doit rien perdre lorsque sa configuration est réécrite."""
import json

from config import Config
from model import RefreshInfo


def read_file(path):
    return json.loads(path.read_text())


def test_rewrite_keeps_everything(device_config, device_file, device_data):
    device_config.write_config()

    saved = read_file(device_file)
    device_data["output_dir"] = device_config.get_config("output_dir")
    assert saved == device_data


def test_rewrite_is_stable_across_restarts(device_config, device_file):
    device_config.write_config()
    first = read_file(device_file)

    Config().write_config()

    assert read_file(device_file) == first


def test_changes_in_memory_reach_the_file(device_config, device_file):
    device_config.refresh_info = RefreshInfo("Manual Update", "weather", "2026-06-15T12:00:00+00:00", "hash")
    device_config.get_playlist_manager().add_playlist("Morning", "06:00", "09:00")

    device_config.write_config()

    saved = read_file(device_file)
    assert saved["refresh_info"]["plugin_id"] == "weather"
    assert "Morning" in [playlist["name"] for playlist in saved["playlist_config"]["playlists"]]


def test_unknown_top_level_key_survives(device_config, device_file):
    device_config.write_config()

    assert read_file(device_file)["future_top_level_key"] == {"kept": True}


def test_unknown_playlist_and_instance_fields_are_dropped(device_config, device_file, device_data):
    """Limite connue : toute donnée de l'interface doit aller dans une clé de premier niveau."""
    playlist = device_data["playlist_config"]["playlists"][0]
    playlist["color"] = "red"
    playlist["plugins"][0]["favorite"] = True
    device_file.write_text(json.dumps(device_data))

    Config().write_config()

    saved = read_file(device_file)["playlist_config"]["playlists"][0]
    assert "color" not in saved
    assert "favorite" not in saved["plugins"][0]
