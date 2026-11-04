"""Une mise à jour par git doit conserver les données locales d'une installation."""
import os
import shutil
import subprocess

import pytest

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

USER_DATA = [
    "src/config/device.json",
    ".env",
    "src/static/images/current_image.png",
    "src/static/images/plugins/clock_Living_room.png",
    "src/static/images/saved/photo.jpg",
]


def git(cwd, *args):
    return subprocess.run(
        ["git", "-c", "user.name=test", "-c", "user.email=test@example.invalid", *args],
        cwd=cwd,
        check=True,
        capture_output=True,
        text=True,
    ).stdout


@pytest.mark.parametrize("path", USER_DATA)
def test_user_data_is_ignored_by_git(path):
    assert git(REPO_ROOT, "check-ignore", path).strip() == path


def test_pull_and_clean_keep_user_data(tmp_path):
    origin = tmp_path / "origin"
    origin.mkdir()
    shutil.copy(os.path.join(REPO_ROOT, ".gitignore"), origin / ".gitignore")
    for relative in ("src/static/images/plugins/.gitignore", "src/static/images/saved/.gitignore"):
        target = origin / relative
        target.parent.mkdir(parents=True)
        shutil.copy(os.path.join(REPO_ROOT, relative), target)
    (origin / "src" / "config").mkdir(parents=True)
    (origin / "src" / "config" / "device_dev.json").write_text("{}")
    git(origin, "init", "-q", "-b", "main")
    git(origin, "add", "-A")
    git(origin, "commit", "-qm", "initial")

    installed = tmp_path / "installed"
    git(tmp_path, "clone", "-q", str(origin), str(installed))
    for relative in USER_DATA:
        path = installed / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"donnée locale {relative}")

    (origin / "nouveau.txt").write_text("mise à jour")
    git(origin, "add", "-A")
    git(origin, "commit", "-qm", "update")

    git(installed, "pull", "-q")
    git(installed, "clean", "-fdq")

    assert (installed / "nouveau.txt").exists()
    for relative in USER_DATA:
        assert (installed / relative).read_text() == f"donnée locale {relative}"
    assert git(installed, "status", "--short") == ""
