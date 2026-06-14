"""Unit tests for the carbon engine and API.

Run with:  pytest -q
These tests cover validation, the maths of the footprint estimate, the
prioritisation logic of the recommendations, and the HTTP contract.
"""

import sys
from pathlib import Path

import pytest

# Make the backend package importable without installing it.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from carbon_engine import (  # noqa: E402
    GLOBAL_AVERAGE_ANNUAL,
    UserContext,
    ValidationError,
    analyse,
    estimate_footprint,
    recommend,
)
import app as flask_app  # noqa: E402


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #

def test_defaults_are_valid():
    ctx = UserContext()
    assert ctx.transport_mode == "petrol_car"


@pytest.mark.parametrize(
    "kwargs",
    [
        {"transport_mode": "rocket"},
        {"diet": "carnivore"},
        {"heating": "campfire"},
        {"daily_commute_km": -5},
        {"daily_commute_km": 5000},
        {"flights_per_year": 1000},
        {"household_size": 0},
    ],
)
def test_invalid_inputs_raise(kwargs):
    with pytest.raises(ValidationError):
        UserContext(**kwargs)


def test_boolean_is_rejected_for_numeric_field():
    # bool is a subclass of int; the validator must still reject it.
    with pytest.raises(ValidationError):
        UserContext(daily_commute_km=True)


# --------------------------------------------------------------------------- #
# Footprint maths
# --------------------------------------------------------------------------- #

def test_zero_emission_transport_contributes_nothing():
    ctx = UserContext(transport_mode="bicycle", daily_commute_km=30)
    breakdown = estimate_footprint(ctx)
    assert breakdown["transport"] == 0.0


def test_household_sharing_halves_shared_sources():
    solo = estimate_footprint(UserContext(household_size=1, monthly_electricity_kwh=300))
    shared = estimate_footprint(UserContext(household_size=2, monthly_electricity_kwh=300))
    assert shared["electricity"] == pytest.approx(solo["electricity"] / 2)
    assert shared["home_heating"] == pytest.approx(solo["home_heating"] / 2)


def test_transport_scales_linearly_with_distance():
    near = estimate_footprint(UserContext(daily_commute_km=10))["transport"]
    far = estimate_footprint(UserContext(daily_commute_km=20))["transport"]
    assert far == pytest.approx(near * 2)


def test_recycling_reduces_waste_emissions():
    recycler = estimate_footprint(UserContext(recycles=True))["waste"]
    non = estimate_footprint(UserContext(recycles=False))["waste"]
    assert recycler < non


# --------------------------------------------------------------------------- #
# Recommendations & rating
# --------------------------------------------------------------------------- #

def test_recommendations_are_sorted_by_impact():
    ctx = UserContext(
        transport_mode="petrol_car",
        daily_commute_km=40,
        diet="meat_heavy",
        heating="oil",
        monthly_electricity_kwh=400,
        flights_per_year=4,
    )
    result = analyse(ctx)
    savings = [r.estimated_saving_kg for r in result.recommendations]
    assert savings == sorted(savings, reverse=True)


def test_cyclist_gets_no_transport_advice():
    ctx = UserContext(transport_mode="bicycle", daily_commute_km=30)
    recs = recommend(ctx, estimate_footprint(ctx))
    assert all(r.category != "transport" for r in recs)


def test_low_footprint_earns_top_rating():
    ctx = UserContext(
        transport_mode="walk",
        daily_commute_km=2,
        diet="vegan",
        heating="heat_pump",
        monthly_electricity_kwh=50,
        flights_per_year=0,
        household_size=2,  # Shared home reduces per-person heating/electricity.
    )
    assert analyse(ctx).rating == "A"


def test_total_matches_sum_of_breakdown():
    result = analyse(UserContext(daily_commute_km=15))
    assert result.total_annual_kg == pytest.approx(sum(result.breakdown.values()))


def test_comparison_percentage_is_relative_to_average():
    ctx = UserContext()
    result = analyse(ctx)
    expected = result.total_annual_kg / GLOBAL_AVERAGE_ANNUAL * 100
    assert result.vs_global_average_pct == pytest.approx(expected)


# --------------------------------------------------------------------------- #
# API contract
# --------------------------------------------------------------------------- #

@pytest.fixture
def client():
    flask_app.app.config["TESTING"] = True
    return flask_app.app.test_client()


def test_options_endpoint(client):
    res = client.get("/api/options")
    assert res.status_code == 200
    body = res.get_json()
    assert "petrol_car" in body["transport_modes"]


def test_analyse_happy_path(client):
    res = client.post("/api/analyse", json={"daily_commute_km": 10})
    assert res.status_code == 200
    body = res.get_json()
    assert body["total_annual_kg"] > 0
    assert "recommendations" in body


def test_analyse_rejects_bad_input(client):
    res = client.post("/api/analyse", json={"diet": "carnivore"})
    assert res.status_code == 400
    assert "error" in res.get_json()


def test_analyse_rejects_non_object_body(client):
    res = client.post("/api/analyse", json=[1, 2, 3])
    assert res.status_code == 400


def test_unknown_keys_are_ignored(client):
    res = client.post("/api/analyse", json={"daily_commute_km": 5, "evil": "rm -rf"})
    assert res.status_code == 200


def test_security_headers_present(client):
    res = client.get("/health")
    assert res.headers["X-Content-Type-Options"] == "nosniff"
    assert res.headers["X-Frame-Options"] == "DENY"
