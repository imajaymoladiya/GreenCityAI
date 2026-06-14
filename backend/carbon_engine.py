"""Core carbon-footprint engine for GreenCityAI.

This module is intentionally framework-agnostic: it has **no** Flask or web
dependencies so it can be unit-tested in isolation and reused from a CLI, a
notebook, or any other Python program.

The engine does two things:

1. ``estimate_footprint`` converts a user's lifestyle context into an annual
   CO2-equivalent (CO2e) estimate, broken down by category.
2. ``recommend`` applies rule-based "decision making" on top of that breakdown
   to return a *prioritised*, context-aware list of actions. The biggest
   contributor to a person's footprint is always addressed first, which is what
   makes the assistant feel smart rather than generic.

All emission factors are expressed in kilograms of CO2e and are sourced from
publicly published averages (UK DEFRA / EPA / IPCC ranges). They live in plain
dictionaries so they are easy to audit, tweak, or localise.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List

# --------------------------------------------------------------------------- #
# Emission factors (kg CO2e). Kept as data, not code, so they are auditable.
# --------------------------------------------------------------------------- #

# Transport: kg CO2e per passenger-kilometre.
TRANSPORT_FACTORS: Dict[str, float] = {
    "petrol_car": 0.192,
    "diesel_car": 0.171,
    "electric_car": 0.053,
    "motorbike": 0.114,
    "bus": 0.103,
    "train": 0.041,
    "bicycle": 0.0,
    "walk": 0.0,
}

# Diet: annual kg CO2e attributable to food for one person.
DIET_FACTORS: Dict[str, float] = {
    "meat_heavy": 3300.0,
    "average": 2500.0,
    "low_meat": 2300.0,
    "vegetarian": 1700.0,
    "vegan": 1500.0,
}

# Home heating: annual kg CO2e for a typical household, divided per occupant.
HEATING_FACTORS: Dict[str, float] = {
    "natural_gas": 2000.0,
    "oil": 2700.0,
    "electric": 1500.0,
    "heat_pump": 600.0,
    "none": 0.0,
}

# Grid electricity: kg CO2e per kWh (world average; configurable for locality).
ELECTRICITY_FACTOR_PER_KWH: float = 0.475

# A single short-haul return flight (~kg CO2e), used as the per-flight unit.
FLIGHT_FACTOR_PER_TRIP: float = 500.0

# Reference points for contextual feedback (annual kg CO2e per person).
GLOBAL_AVERAGE_ANNUAL: float = 4800.0
PARIS_TARGET_ANNUAL: float = 2300.0  # ~2-tonne lifestyle needed by 2030.

# Validation bounds keep inputs sane and protect against abuse / typos.
MAX_DAILY_KM: float = 1000.0
MAX_MONTHLY_KWH: float = 10000.0
MAX_FLIGHTS_PER_YEAR: int = 100
MAX_HOUSEHOLD_SIZE: int = 20

DAYS_PER_YEAR: int = 365
MONTHS_PER_YEAR: int = 12


class ValidationError(ValueError):
    """Raised when user-supplied context fails validation."""


@dataclass
class UserContext:
    """Validated lifestyle inputs for a single person.

    Using a dataclass gives us free ``repr``/equality for tests and a single
    place to enforce the domain rules via ``__post_init__``.
    """

    transport_mode: str = "petrol_car"
    daily_commute_km: float = 0.0
    diet: str = "average"
    heating: str = "natural_gas"
    monthly_electricity_kwh: float = 0.0
    flights_per_year: int = 0
    household_size: int = 1
    recycles: bool = True

    def __post_init__(self) -> None:
        self._validate_choice("transport_mode", self.transport_mode, TRANSPORT_FACTORS)
        self._validate_choice("diet", self.diet, DIET_FACTORS)
        self._validate_choice("heating", self.heating, HEATING_FACTORS)
        self._validate_range("daily_commute_km", self.daily_commute_km, 0, MAX_DAILY_KM)
        self._validate_range(
            "monthly_electricity_kwh", self.monthly_electricity_kwh, 0, MAX_MONTHLY_KWH
        )
        self._validate_range(
            "flights_per_year", self.flights_per_year, 0, MAX_FLIGHTS_PER_YEAR
        )
        self._validate_range(
            "household_size", self.household_size, 1, MAX_HOUSEHOLD_SIZE
        )

    @staticmethod
    def _validate_choice(field_name: str, value: object, allowed: Dict[str, float]) -> None:
        if value not in allowed:
            options = ", ".join(sorted(allowed))
            raise ValidationError(
                f"{field_name!r} must be one of: {options} (got {value!r})"
            )

    @staticmethod
    def _validate_range(field_name: str, value: object, low: float, high: float) -> None:
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            raise ValidationError(f"{field_name!r} must be a number (got {value!r})")
        if not low <= value <= high:
            raise ValidationError(
                f"{field_name!r} must be between {low} and {high} (got {value})"
            )


@dataclass
class Recommendation:
    """A single, actionable suggestion with its estimated annual saving."""

    category: str
    message: str
    estimated_saving_kg: float


@dataclass
class FootprintResult:
    """The full result returned by the engine."""

    breakdown: Dict[str, float]
    total_annual_kg: float
    vs_global_average_pct: float
    vs_paris_target_pct: float
    rating: str
    recommendations: List[Recommendation] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Serialise to plain JSON-friendly types for the API layer."""
        return {
            "breakdown": {k: round(v, 1) for k, v in self.breakdown.items()},
            "total_annual_kg": round(self.total_annual_kg, 1),
            "total_annual_tonnes": round(self.total_annual_kg / 1000, 2),
            "vs_global_average_pct": round(self.vs_global_average_pct, 1),
            "vs_paris_target_pct": round(self.vs_paris_target_pct, 1),
            "rating": self.rating,
            "recommendations": [
                {
                    "category": r.category,
                    "message": r.message,
                    "estimated_saving_kg": round(r.estimated_saving_kg, 1),
                }
                for r in self.recommendations
            ],
        }


def estimate_footprint(ctx: UserContext) -> Dict[str, float]:
    """Return annual CO2e (kg) broken down by category for the given context."""
    transport = (
        TRANSPORT_FACTORS[ctx.transport_mode] * ctx.daily_commute_km * DAYS_PER_YEAR
    )
    diet = DIET_FACTORS[ctx.diet]
    # Household-shared sources are divided across occupants.
    heating = HEATING_FACTORS[ctx.heating] / ctx.household_size
    electricity = (
        ELECTRICITY_FACTOR_PER_KWH
        * ctx.monthly_electricity_kwh
        * MONTHS_PER_YEAR
        / ctx.household_size
    )
    flights = FLIGHT_FACTOR_PER_TRIP * ctx.flights_per_year
    # Recycling avoids a portion of waste-related emissions.
    waste = 200.0 if ctx.recycles else 400.0

    return {
        "transport": transport,
        "diet": diet,
        "home_heating": heating,
        "electricity": electricity,
        "flights": float(flights),
        "waste": waste,
    }


def _rate(total_annual_kg: float) -> str:
    """Map an annual total to a simple A-E sustainability rating."""
    if total_annual_kg <= PARIS_TARGET_ANNUAL:
        return "A"
    if total_annual_kg <= GLOBAL_AVERAGE_ANNUAL * 0.75:
        return "B"
    if total_annual_kg <= GLOBAL_AVERAGE_ANNUAL:
        return "C"
    if total_annual_kg <= GLOBAL_AVERAGE_ANNUAL * 1.5:
        return "D"
    return "E"


def recommend(ctx: UserContext, breakdown: Dict[str, float]) -> List[Recommendation]:
    """Produce prioritised, context-aware suggestions.

    The decision logic targets the user's *largest* emission sources first and
    only suggests changes that actually apply to their situation (for example,
    it will not tell a cyclist to drive less). Each suggestion carries an
    estimated annual saving so the dashboard can sort and quantify impact.
    """
    recs: List[Recommendation] = []

    # --- Transport: only relevant if they already emit from travel. ---------
    transport_kg = breakdown["transport"]
    if transport_kg > 0 and ctx.transport_mode in {
        "petrol_car",
        "diesel_car",
        "motorbike",
    }:
        train_kg = (
            TRANSPORT_FACTORS["train"] * ctx.daily_commute_km * DAYS_PER_YEAR
        )
        recs.append(
            Recommendation(
                category="transport",
                message=(
                    "Switch your commute to train or bus where possible — it can "
                    "cut your travel emissions by around "
                    f"{round((transport_kg - train_kg) / transport_kg * 100)}%."
                ),
                estimated_saving_kg=transport_kg - train_kg,
            )
        )

    # --- Diet: scale the suggestion to how meat-heavy they are. -------------
    if ctx.diet in {"meat_heavy", "average", "low_meat"}:
        target = "vegetarian" if ctx.diet != "low_meat" else "vegan"
        saving = DIET_FACTORS[ctx.diet] - DIET_FACTORS[target]
        if saving > 0:
            recs.append(
                Recommendation(
                    category="diet",
                    message=(
                        f"Shifting toward a {target.replace('_', ' ')} diet a few "
                        "days a week meaningfully lowers food emissions."
                    ),
                    estimated_saving_kg=saving,
                )
            )

    # --- Home heating: only if a cleaner option exists. ---------------------
    if ctx.heating in {"oil", "natural_gas", "electric"}:
        saving = (
            HEATING_FACTORS[ctx.heating] - HEATING_FACTORS["heat_pump"]
        ) / ctx.household_size
        recs.append(
            Recommendation(
                category="home_heating",
                message=(
                    "Upgrading to a heat pump (or improving insulation) is one of "
                    "the highest-impact home changes you can make."
                ),
                estimated_saving_kg=saving,
            )
        )

    # --- Electricity: practical, low-effort wins. ---------------------------
    if breakdown["electricity"] > 600:
        saving = breakdown["electricity"] * 0.20
        recs.append(
            Recommendation(
                category="electricity",
                message=(
                    "Switch to a renewable energy tariff and LED lighting — "
                    "roughly a fifth of your electricity emissions are avoidable."
                ),
                estimated_saving_kg=saving,
            )
        )

    # --- Flights: frequent flyers get the biggest single lever. -------------
    if ctx.flights_per_year >= 2:
        saving = FLIGHT_FACTOR_PER_TRIP  # Replacing one trip with rail/virtual.
        recs.append(
            Recommendation(
                category="flights",
                message=(
                    "Replacing one flight a year with rail or a virtual meeting "
                    "saves about half a tonne of CO2e."
                ),
                estimated_saving_kg=saving,
            )
        )

    # --- Waste: nudge non-recyclers. ----------------------------------------
    if not ctx.recycles:
        recs.append(
            Recommendation(
                category="waste",
                message="Start separating recyclables and composting food waste.",
                estimated_saving_kg=200.0,
            )
        )

    # Highest-impact suggestions first — this is the "smart" ordering.
    recs.sort(key=lambda r: r.estimated_saving_kg, reverse=True)
    return recs


def analyse(ctx: UserContext) -> FootprintResult:
    """End-to-end: estimate the footprint and attach prioritised advice."""
    breakdown = estimate_footprint(ctx)
    total = sum(breakdown.values())
    recs = recommend(ctx, breakdown)
    return FootprintResult(
        breakdown=breakdown,
        total_annual_kg=total,
        vs_global_average_pct=(total / GLOBAL_AVERAGE_ANNUAL) * 100,
        vs_paris_target_pct=(total / PARIS_TARGET_ANNUAL) * 100,
        rating=_rate(total),
        recommendations=recs,
    )
