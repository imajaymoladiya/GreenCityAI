"""Smart-city data layer for GreenCityAI.

This module supplies the city-wide intelligence that turns GreenCityAI from a
single-user calculator into a *platform*: gamified profiles, leaderboards,
area-level emission heatmaps, a community challenge, rewards, monthly trends and
an AI forecast.

There is no database — this is demonstration data, generated **deterministically**
(no randomness at request time) so the dashboard is stable and reproducible. All
of it is served through ``bootstrap()`` as plain JSON-friendly types.

To turn this into a real product you would back these functions with a database
and per-user rows; the API contract the frontend consumes would not change.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# Gamification: levels
# --------------------------------------------------------------------------- #

# (name, points required to reach this level), ascending.
LEVELS = [
    ("Seedling", 0),
    ("Green Starter", 250),
    ("Eco Warrior", 750),
    ("Green Hero", 1250),
    ("Climate Champion", 2000),
    ("Planet Guardian", 3500),
]


def _level_for(points: int) -> dict[str, object]:
    """Resolve a points total into a level, plus progress to the next one."""
    current_name, current_min = LEVELS[0]
    next_name, next_min = LEVELS[-1][0], LEVELS[-1][1]
    for i, (name, threshold) in enumerate(LEVELS):
        if points >= threshold:
            current_name, current_min = name, threshold
            if i + 1 < len(LEVELS):
                next_name, next_min = LEVELS[i + 1]
            else:
                next_name, next_min = name, threshold
    # Progress is measured toward the next level's threshold (e.g. 1250/2000),
    # which reads more naturally on the rewards bar than within-level progress.
    progress = min(100, round(points / max(1, next_min) * 100))
    return {
        "level": current_name,
        "next_level": next_name,
        "points_in_level": points - current_min,
        "points_for_next": next_min,
        "level_progress_pct": progress,
    }


# --------------------------------------------------------------------------- #
# The signed-in citizen (demo profile)
# --------------------------------------------------------------------------- #

USER_POINTS = 1250
USER_NAME = "John Doe"
USER_STREAK_DAYS = 14
USER_RANK = 45


def profile() -> dict[str, object]:
    """Return the current user's gamified profile."""
    level = _level_for(USER_POINTS)
    return {
        "name": USER_NAME,
        "initials": "".join(part[0] for part in USER_NAME.split()[:2]).upper(),
        "points": USER_POINTS,
        "streak_days": USER_STREAK_DAYS,
        "rank": USER_RANK,
        **level,
    }


# --------------------------------------------------------------------------- #
# Rewards
# --------------------------------------------------------------------------- #

_REWARDS = [
    ("Metro Pass", 500, "🚇", "Free 1-month city metro travel pass"),
    ("Shopping Coupon", 1000, "🛍️", "₹500 voucher at partner eco-stores"),
    ("Tree Plantation Certificate", 1500, "🌳", "Plant a tree in your name"),
    ("Eco Merchandise", 2000, "👕", "Sustainable GreenCity merchandise kit"),
]


def rewards() -> list[dict[str, object]]:
    """Reward catalogue with unlock status based on the user's points."""
    return [
        {
            "name": name,
            "cost": cost,
            "icon": icon,
            "description": desc,
            "unlocked": cost <= USER_POINTS,
        }
        for name, cost, icon, desc in _REWARDS
    ]


# --------------------------------------------------------------------------- #
# City analytics: areas (heatmap), leaderboard, index, challenge
# --------------------------------------------------------------------------- #

# (area, emission score 0-100 where lower is greener)
_AREAS = [
    ("Maninagar", 28), ("Gota", 33), ("Bopal", 35),
    ("Chandkheda", 38), ("Vastrapur", 40), ("Navrangpura", 44),
    ("Paldi", 45), ("Bodakdev", 48), ("Naroda", 58), ("Satellite", 63),
]


def _emission_level(score: int) -> str:
    """Bucket an emission score into a heatmap colour band."""
    if score <= 38:
        return "low"
    if score <= 50:
        return "moderate"
    return "high"


def areas() -> list[dict[str, object]]:
    """Area-level emission data for the smart-city heatmap."""
    return [
        {"name": name, "score": score, "level": _emission_level(score)}
        for name, score in _AREAS
    ]


# Top of the city leaderboard (name, points, carbon score, badge).
_LEADERBOARD = [
    ("Aarav Shah", 3820, 12, "Planet Guardian"),
    ("Diya Patel", 3510, 14, "Planet Guardian"),
    ("Vivaan Mehta", 2980, 17, "Climate Champion"),
    ("Anaya Iyer", 2640, 19, "Climate Champion"),
    ("Kabir Rao", 2330, 21, "Climate Champion"),
    ("Saanvi Nair", 2110, 22, "Climate Champion"),
    ("Reyansh Jain", 1890, 23, "Green Hero"),
    ("Ira Desai", 1640, 24, "Green Hero"),
    ("Aditya Kumar", 1420, 24, "Green Hero"),
]


def leaderboard() -> list[dict[str, object]]:
    """Top citizens plus the current user, flagged with ``is_you``."""
    board = [
        {
            "rank": i + 1,
            "name": name,
            "points": pts,
            "carbon_score": score,
            "badge": badge,
            "is_you": False,
        }
        for i, (name, pts, score, badge) in enumerate(_LEADERBOARD)
    ]
    board.append(
        {
            "rank": USER_RANK,
            "name": USER_NAME + " (You)",
            "points": USER_POINTS,
            "carbon_score": 24,
            "badge": _level_for(USER_POINTS)["level"],
            "is_you": True,
        }
    )
    return board


def city_index() -> dict[str, object]:
    """Headline city sustainability metrics."""
    ranked = areas()
    best = min(ranked, key=lambda a: a["score"])
    worst = max(ranked, key=lambda a: a["score"])
    return {
        "sustainability_index": 68,  # 0-100, higher is better
        "total_citizens": 15420,
        "avg_carbon_score": 41,
        "total_co2_saved_tons": 250,
        "best_area": best["name"],
        "worst_area": worst["name"],
    }


def challenge() -> dict[str, object]:
    """The active community challenge."""
    goal, completed = 10.0, 7.5
    return {
        "name": "Ahmedabad Green Challenge",
        "goal_tons": goal,
        "completed_tons": completed,
        "progress_pct": round(completed / goal * 100),
        "participants": 3240,
        "days_left": 12,
    }


# --------------------------------------------------------------------------- #
# Trends & AI forecast
# --------------------------------------------------------------------------- #

# Demo "carbon journey" — monthly score, lower is better (improving over time).
MONTHLY_TREND = [
    {"month": "Jan", "score": 62},
    {"month": "Feb", "score": 58},
    {"month": "Mar", "score": 51},
    {"month": "Apr", "score": 42},
    {"month": "May", "score": 34},
    {"month": "Jun", "score": 24},
]

FORECAST_THRESHOLD = 50  # Above this, warn the user.


def forecast(trend: list[dict[str, object]] | None = None) -> dict[str, object]:
    """Project next period's carbon score with a simple linear fit.

    A transparent least-squares slope over the recent points — explainable and
    dependency-free, which suits an advisory forecast.
    """
    series = trend or MONTHLY_TREND
    scores = [pt["score"] for pt in series][-4:]
    n = len(scores)
    xs = list(range(n))
    mean_x = sum(xs) / n
    mean_y = sum(scores) / n
    denom = sum((x - mean_x) ** 2 for x in xs) or 1
    slope = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, scores, strict=True)) / denom
    predicted = round(max(0, min(100, scores[-1] + slope)))
    direction = "down" if slope < -0.5 else "up" if slope > 0.5 else "flat"
    return {
        "predicted_score": predicted,
        "direction": direction,
        "exceeds_threshold": predicted > FORECAST_THRESHOLD,
        "threshold": FORECAST_THRESHOLD,
    }


# --------------------------------------------------------------------------- #
# Default ("demo") personal dashboard, used until the user runs the tracker
# --------------------------------------------------------------------------- #

DEMO_BREAKDOWN = [
    {"category": "Transport", "pct": 45},
    {"category": "Electricity", "pct": 25},
    {"category": "Food", "pct": 20},
    {"category": "Waste", "pct": 10},
]

DEMO_RECOMMENDATIONS = [
    {"title": "Use the metro twice a week", "impact_kg_month": 30,
     "difficulty": "Easy", "savings_inr_month": 600, "category": "transport"},
    {"title": "Raise AC temperature by 2°C", "impact_kg_month": 15,
     "difficulty": "Easy", "savings_inr_month": 350, "category": "electricity"},
    {"title": "One meat-free day each week", "impact_kg_month": 20,
     "difficulty": "Easy", "savings_inr_month": 0, "category": "diet"},
    {"title": "Switch remaining bulbs to LED", "impact_kg_month": 8,
     "difficulty": "Easy", "savings_inr_month": 180, "category": "electricity"},
]

DEMO_ALERTS = [
    {"severity": "warning", "title": "Transport emissions above average",
     "detail": "Your transport footprint is 22% higher than citizens in your area."},
    {"severity": "success", "title": "Great progress this month",
     "detail": "You cut emissions by 8% versus last month — keep the streak going!"},
    {"severity": "info", "title": "Eco streak active",
     "detail": f"You're on a {USER_STREAK_DAYS}-day sustainable streak."},
]


def bootstrap() -> dict[str, object]:
    """One payload powering the whole dashboard on first load."""
    return {
        "profile": profile(),
        "rewards": rewards(),
        "city": {
            "index": city_index(),
            "areas": areas(),
            "leaderboard": leaderboard(),
            "challenge": challenge(),
        },
        "insights": {
            "demo_score": 24,
            "demo_breakdown": DEMO_BREAKDOWN,
            "trend": MONTHLY_TREND,
            "forecast": forecast(),
            "recommendations": DEMO_RECOMMENDATIONS,
            "alerts": DEMO_ALERTS,
        },
        "cities": ["Ahmedabad", "Mumbai", "Delhi", "Bengaluru", "Surat"],
    }
