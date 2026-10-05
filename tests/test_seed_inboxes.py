import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))
import outreach  # noqa: E402


class _DB:
    def __init__(self, value):
        self.value = value

    def select(self, table, params):
        assert table == "owner_settings"
        return [{"value": self.value}] if self.value is not None else []


def test_seed_inboxes_aus_secret_und_db(monkeypatch):
    monkeypatch.setenv("SEED_INBOXES", "a@x.de")
    assert outreach.seed_inboxes(_DB(["B@y.com", "a@x.de"])) == ["a@x.de", "b@y.com"]


def test_seed_inboxes_db_kommagetrennt(monkeypatch):
    monkeypatch.delenv("SEED_INBOXES", raising=False)
    assert outreach.seed_inboxes(_DB("c@z.fr, kein-mail")) == ["c@z.fr"]


def test_seed_inboxes_ohne_db(monkeypatch):
    monkeypatch.delenv("SEED_INBOXES", raising=False)
    assert outreach.seed_inboxes() == []
