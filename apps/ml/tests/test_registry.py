import pytest

from app.registry import InvalidTransition, Registry, VersionExists, VersionNotFound
from app.schemas import ModelCreate, Platform, Status


def meta(version: str, platforms=("android", "ios")) -> ModelCreate:
    return ModelCreate(version=version, platforms=list(platforms),
                       quantization="float16", accuracy=0.91)


def make_prod(reg: Registry, version: str, **kw):
    reg.add(meta(version, **kw))
    reg.set_status(version, Status.STAGED)
    return reg.set_status(version, Status.PRODUCTION)


def test_new_version_starts_as_draft():
    assert Registry().add(meta("1.0.0")).status is Status.DRAFT


def test_duplicate_version_rejected():
    reg = Registry()
    reg.add(meta("1.0.0"))
    with pytest.raises(VersionExists):
        reg.add(meta("1.0.0"))


def test_cannot_jump_draft_to_production():
    reg = Registry()
    reg.add(meta("1.0.0"))
    with pytest.raises(InvalidTransition):
        reg.set_status("1.0.0", Status.PRODUCTION)


def test_unknown_version():
    with pytest.raises(VersionNotFound):
        Registry().set_status("9.9.9", Status.STAGED)


def test_no_latest_before_any_production():
    reg = Registry()
    reg.add(meta("1.0.0"))
    with pytest.raises(VersionNotFound):
        reg.latest(Platform.ANDROID)


def test_promoting_changes_latest():
    reg = Registry()
    make_prod(reg, "1.0.0")
    assert reg.latest(Platform.ANDROID).version == "1.0.0"
    make_prod(reg, "1.1.0")
    assert reg.latest(Platform.ANDROID).version == "1.1.0"


def test_only_one_production_and_old_one_demoted():
    reg = Registry()
    make_prod(reg, "1.0.0")
    make_prod(reg, "1.1.0")
    prod = [m for m in reg.list() if m.status is Status.PRODUCTION]
    assert [m.version for m in prod] == ["1.1.0"]
    assert reg.get("1.0.0").status is Status.STAGED


def test_rollback_by_promoting_old_version_again():
    reg = Registry()
    make_prod(reg, "1.0.0")
    make_prod(reg, "1.1.0")
    reg.set_status("1.0.0", Status.PRODUCTION)
    assert reg.latest(Platform.IOS).version == "1.0.0"
    assert reg.get("1.1.0").status is Status.STAGED


def test_latest_respects_platform():
    reg = Registry()
    make_prod(reg, "1.0.0", platforms=("android",))
    assert reg.latest(Platform.ANDROID).version == "1.0.0"
    with pytest.raises(VersionNotFound):
        reg.latest(Platform.IOS)


def test_same_status_is_a_noop():
    reg = Registry()
    reg.add(meta("1.0.0"))
    assert reg.set_status("1.0.0", Status.DRAFT).status is Status.DRAFT


def test_list_sorted_by_semver_not_text():
    reg = Registry()
    for v in ("1.9.0", "1.10.0", "1.2.0"):
        reg.add(meta(v))
    assert [m.version for m in reg.list()] == ["1.10.0", "1.9.0", "1.2.0"]


def test_persistence_roundtrip(tmp_path):
    path = tmp_path / "registry.json"
    reg = Registry(path)
    make_prod(reg, "1.0.0")
    again = Registry(path)
    assert again.latest(Platform.ANDROID).version == "1.0.0"
