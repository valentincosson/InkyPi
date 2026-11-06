"""Une installation existante ne doit rien perdre lorsque sa configuration est réécrite."""
import json
import os
import stat

import pytest

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


def test_failed_write_keeps_previous_file(device_config, device_file, monkeypatch):
    before = device_file.read_text()

    def interrupted_dump(data, outfile, **options):
        outfile.write('{"partial": ')
        raise OSError("écriture interrompue")

    monkeypatch.setattr(json, "dump", interrupted_dump)
    with pytest.raises(OSError):
        device_config.write_config()

    assert device_file.read_text() == before
    assert [path.name for path in device_file.parent.glob("*.tmp")] == []


def test_write_keeps_file_permissions(device_config, device_file):
    device_file.chmod(0o640)

    device_config.write_config()

    assert stat.S_IMODE(device_file.stat().st_mode) == 0o640
    assert [path.name for path in device_file.parent.glob("*.tmp")] == []


def test_write_keeps_file_owner(device_config, device_file, monkeypatch):
    calls = []
    monkeypatch.setattr(os, "chown", lambda path, uid, gid: calls.append((uid, gid)))

    device_config.write_config()

    current = device_file.stat()
    assert calls == [(current.st_uid, current.st_gid)]


def test_write_succeeds_when_owner_cannot_be_kept(device_config, device_file, monkeypatch):
    def refuse(path, uid, gid):
        raise PermissionError("pas root")

    monkeypatch.setattr(os, "chown", refuse)
    device_config.update_value("name", "Renommé")

    device_config.write_config()

    assert read_file(device_file)["name"] == "Renommé"


def test_write_works_without_chown(device_config, device_file, monkeypatch):
    """os.chown n'existe pas sous Windows, annoncé comme compatible en mode développement."""
    monkeypatch.delattr(os, "chown")
    device_config.update_value("name", "Renommé")

    device_config.write_config()

    assert read_file(device_file)["name"] == "Renommé"


def test_write_follows_symlink(device_config, device_file, tmp_path, monkeypatch):
    elsewhere = tmp_path / "data"
    elsewhere.mkdir()
    real_file = elsewhere / "device.json"
    real_file.write_text(device_file.read_text())
    device_file.unlink()
    device_file.symlink_to(real_file)
    device_config.update_value("name", "Renommé")

    device_config.write_config()

    assert device_file.is_symlink()
    assert read_file(real_file)["name"] == "Renommé"
    assert [path.name for path in elsewhere.glob("*.tmp")] == []


def test_cleanup_failure_does_not_hide_original_error(device_config, monkeypatch):
    def interrupted_dump(data, outfile, **options):
        raise ValueError("erreur d'origine")

    def failing_remove(path):
        raise OSError("suppression impossible")

    monkeypatch.setattr(json, "dump", interrupted_dump)
    monkeypatch.setattr(os, "remove", failing_remove)

    with pytest.raises(ValueError, match="erreur d'origine"):
        device_config.write_config()


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
