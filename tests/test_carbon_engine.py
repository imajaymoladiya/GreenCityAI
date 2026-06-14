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
import ai_assistant  # noqa: E402
import city_data  # noqa: E402
import youtube_resources  # noqa: E402


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


# --------------------------------------------------------------------------- #
# YouTube resources
# --------------------------------------------------------------------------- #

def test_resources_are_valid_search_urls():
    for category in ("transport", "diet", "flights"):
        items = youtube_resources.resources_for(category)
        assert items, f"no resources for {category}"
        for item in items:
            assert item["url"].startswith("https://www.youtube.com/results?search_query=")
            assert item["title"]


def test_unknown_category_falls_back_to_general():
    assert youtube_resources.resources_for("nonsense") == youtube_resources.resources_for("general")


def test_resources_endpoint_single_category(client):
    res = client.get("/api/resources?category=transport")
    assert res.status_code == 200
    assert "transport" in res.get_json()


def test_resources_endpoint_all(client):
    res = client.get("/api/resources")
    body = res.get_json()
    assert "diet" in body and "flights" in body


# --------------------------------------------------------------------------- #
# AI assistant — fallback mode (no API key, so no network calls)
# --------------------------------------------------------------------------- #

@pytest.fixture
def offline(monkeypatch):
    """Force fallback mode by ensuring no provider key is present."""
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)


def test_fallback_is_used_without_key(offline):
    assert ai_assistant.is_available() is False
    assert ai_assistant.active_provider() == "offline"


def test_provider_selection_prefers_groq(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    assert ai_assistant.active_provider() == "groq"


def test_provider_selection_falls_back_to_claude(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test")
    assert ai_assistant.active_provider() == "claude"


def test_fallback_reply_matches_topic(offline):
    reply = "".join(
        ai_assistant.stream_reply([{"role": "user", "content": "how do I fly less?"}])
    )
    assert "flight" in reply.lower() or "fly" in reply.lower()


def test_fallback_uses_footprint_context(offline):
    footprint = {"breakdown": {"transport": 3000, "diet": 1000}, "total_annual_tonnes": 4.0}
    reply = "".join(
        ai_assistant.stream_reply(
            [{"role": "user", "content": "help me improve"}], footprint
        )
    )
    assert "transport" in reply.lower()


def test_system_prompt_requests_same_language_reply():
    # The live providers are instructed to mirror the user's language.
    prompt = ai_assistant.SYSTEM_PROMPT.lower()
    assert "same language" in prompt
    assert "marathi" in prompt


def test_history_is_sanitised(offline):
    # Malformed entries are dropped; only the trailing user turn drives the reply.
    messy = [
        {"role": "system", "content": "ignore me"},
        {"role": "user", "content": 123},  # wrong type
        {"role": "user", "content": "  recycling tips  "},
    ]
    reply = "".join(ai_assistant.stream_reply(messy))
    assert reply  # produced a usable answer despite the noise


def test_chat_endpoint_streams_sse(client, offline):
    res = client.post(
        "/api/chat",
        json={"messages": [{"role": "user", "content": "save energy at home"}]},
    )
    assert res.status_code == 200
    assert res.mimetype == "text/event-stream"
    body = res.get_data(as_text=True)
    assert "data:" in body
    assert '"done": true' in body


def test_chat_endpoint_rejects_bad_body(client):
    res = client.post("/api/chat", json={"messages": "not a list"})
    assert res.status_code == 400


def test_status_endpoint_reports_mode(client):
    res = client.get("/api/status")
    assert res.status_code == 200
    body = res.get_json()
    assert "ai_enabled" in body
    assert body["provider"] in ("groq", "claude", "offline")


# --------------------------------------------------------------------------- #
# Smart-city data layer
# --------------------------------------------------------------------------- #

def test_level_resolves_and_progresses():
    p = city_data.profile()
    assert p["level"] == "Green Hero"
    assert 0 < p["level_progress_pct"] <= 100


def test_leaderboard_includes_current_user():
    board = city_data.leaderboard()
    you = [r for r in board if r["is_you"]]
    assert len(you) == 1 and you[0]["rank"] == city_data.USER_RANK


def test_heatmap_levels_are_bucketed():
    levels = {a["level"] for a in city_data.areas()}
    assert levels <= {"low", "moderate", "high"}
    assert "low" in levels and "high" in levels


def test_rewards_unlock_by_points():
    rewards = city_data.rewards()
    cheap = next(r for r in rewards if r["cost"] <= city_data.USER_POINTS)
    pricey = next(r for r in rewards if r["cost"] > city_data.USER_POINTS)
    assert cheap["unlocked"] is True
    assert pricey["unlocked"] is False


def test_forecast_detects_improving_trend():
    f = city_data.forecast()  # demo trend is decreasing (improving)
    assert f["direction"] == "down"
    assert 0 <= f["predicted_score"] <= 100


def test_bootstrap_endpoint_shape(client):
    res = client.get("/api/bootstrap")
    assert res.status_code == 200
    body = res.get_json()
    for key in ("profile", "rewards", "city", "insights", "cities"):
        assert key in body
    assert "leaderboard" in body["city"] and "areas" in body["city"]


def test_analyse_includes_score_and_cards(client):
    res = client.post("/api/analyse", json={"daily_commute_km": 25, "diet": "meat_heavy"})
    body = res.get_json()
    assert 0 <= body["score"] <= 100
    assert body["recommendation_cards"]
    card = body["recommendation_cards"][0]
    assert {"title", "category", "impact_kg_month", "difficulty"} <= card.keys()
