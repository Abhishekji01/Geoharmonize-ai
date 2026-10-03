import pytest
from fastapi.testclient import TestClient

from app.pipeline import iou, norm_key, owner_sim, run_pipeline
from app.synthetic import generate_ward


@pytest.fixture(scope="module")
def result():
    return run_pipeline(generate_ward(7, "small"), "small")


def test_generation_is_deterministic():
    a, b = generate_ward(3, "small"), generate_ward(3, "small")
    assert list(a.truth) == list(b.truth)
    assert a.truth["KH-0001"]["owner"] == b.truth["KH-0001"]["owner"]


def test_plot_reference_variants_normalise():
    assert {norm_key(x) for x in ["KH-0012", "KH 12", "12/KH", "kh-0012", "KH/12"]} == {"KH-0012"}


def test_owner_similarity_separates_spelling_from_different_people():
    assert owner_sim("Ramesh Sharma", "R. Sharma") >= 0.9
    assert owner_sim("Ramesh Sharma", "SHRI RAMESH SHARMA") >= 0.9
    assert owner_sim("Sharma, Ramesh", "Ramesh Sharma") >= 0.9
    assert owner_sim("Sunita Sharma", "Anita Sharma") < 0.9
    assert owner_sim("Ramesh Sharma", "Deepak Verma") < 0.9


def test_cadastral_shift_is_recovered(result):
    dx, dy = result.offset
    assert dx == pytest.approx(-1.9, abs=0.3) and dy == pytest.approx(1.3, abs=0.3)


def test_harmonised_geometry_is_valid_and_closer_to_truth(result):
    assert all(e.final_geom.is_valid for e in result.entities)
    b = result.benchmark
    assert b["geometry_iou_harmonised"] > b["geometry_iou_as_received"] + 0.15


def test_every_entity_has_score_and_status(result):
    for e in result.entities:
        assert 0 <= e.confidence <= 1
        assert e.status in {"auto_accepted", "needs_review"}


def test_owner_conflicts_are_never_auto_settled(result):
    for e in result.entities:
        for c in e.conflicts:
            if c["field"] == "owner":
                assert c["status"] == "flagged"
                assert e.status == "needs_review"


def test_api_review_round_trip(monkeypatch):
    from app import main
    from app.store import DecisionStore
    monkeypatch.setattr(main, "store", DecisionStore(":memory:"))
    c = TestClient(main.app)
    rid = c.post("/api/runs", json={"seed": 7, "size": "small"}).json()["id"]
    queue = c.get(f"/api/runs/{rid}/review").json()
    assert queue
    first = queue[0]
    r = c.post(f"/api/runs/{rid}/review/{first['id']}", json={"decision": "accept"})
    assert r.status_code == 200 and r.json()["status"] == "validated"
    summary = c.get(f"/api/runs/{rid}").json()
    assert summary["status_counts"]["validated"] == 1
    auto = next(f for f in c.get(f"/api/runs/{rid}/layers/harmonized").json()["features"] if f["properties"]["status"] == "auto_accepted")
    assert c.post(f"/api/runs/{rid}/review/{auto['id']}", json={"decision": "accept"}).status_code == 409
    export = c.get(f"/api/runs/{rid}/export.geojson").json()
    assert len(export["features"]) == summary["parcels"]
    assert c.get("/api/runs/bogus").status_code == 404


def test_audit_chain_detects_tampering():
    from app.store import DecisionStore
    st = DecisionStore(":memory:")
    st.put("small-7", "P-0001", "accept", {"owner": "revenue"}, "ok")
    st.put("small-7", "P-0002", "reject", {}, "")
    st.delete("small-7", "P-0001")
    a = st.audit()
    assert a["ok"] and a["length"] == 3 and a["head"]
    st._db.execute("UPDATE audit SET payload='{\"note\": \"edited\", \"resolutions\": {}}' WHERE seq=1")
    broken = st.audit()
    assert not broken["ok"] and broken["broken_at"] == 1


def test_parcel_detail_reports_which_sources_agree(monkeypatch):
    from app import main
    from app.store import DecisionStore
    monkeypatch.setattr(main, "store", DecisionStore(":memory:"))
    c = TestClient(main.app)
    rid = c.post("/api/runs", json={"seed": 7, "size": "small"}).json()["id"]
    pid = c.get(f"/api/runs/{rid}/review").json()[0]["id"]
    d = c.get(f"/api/runs/{rid}/parcels/{pid}").json()
    assert set(d["owner_agrees"]) == set(d["values"]["owner"])
    assert c.get(f"/api/runs/{rid}").json()["origin_utm"][0] > 400000
    assert c.get("/api/audit").json()["ok"]
