"""Curated YouTube learning resources for GreenCityAI.

Rather than hard-coding video IDs (which rot when videos are removed) or trusting
an LLM to invent them (which hallucinates dead links), every resource is a
**YouTube search URL**. Search links never 404 and always surface fresh, relevant
content — a deliberate reliability choice for a production app.

Queries are URL-encoded with ``urllib.parse.quote_plus`` so they are always
well-formed and safe to drop straight into an ``href``.
"""

from __future__ import annotations

from urllib.parse import quote_plus

_SEARCH_BASE = "https://www.youtube.com/results?search_query="


def _link(query: str) -> str:
    """Build a safe YouTube search URL for the given query."""
    return _SEARCH_BASE + quote_plus(query)


# One short, high-signal set of searches per emission category, stored as
# (display title, search query) pairs. Titles are shown in the dashboard;
# queries are tuned to surface practical, how-to content.
_CATALOG: dict[str, list[tuple[str, str]]] = {
    "transport": [
        ("How to cut your commute emissions", "how to reduce car commute carbon emissions"),
        ("Are electric cars really greener?", "are electric cars better for the environment"),
        ("Cycling & public transport tips", "switching to cycling and public transport commute"),
    ],
    "diet": [
        ("Eating for a lower carbon footprint", "low carbon footprint diet explained"),
        ("Plant-based meals for beginners", "easy plant based meals for beginners climate"),
        ("The climate impact of food", "carbon footprint of different foods comparison"),
    ],
    "home_heating": [
        ("Heat pumps explained", "how do heat pumps work home heating efficiency"),
        ("Home insulation that pays off", "best home insulation to save energy and money"),
        ("Lower your heating bills sustainably", "reduce home heating carbon footprint tips"),
    ],
    "electricity": [
        ("Switching to renewable energy at home", "how to switch to renewable energy tariff home"),
        ("Cut your electricity use", "easy ways to reduce home electricity consumption"),
        ("Smart home energy saving", "smart home devices to save electricity"),
    ],
    "flights": [
        ("The carbon cost of flying", "carbon footprint of flying explained"),
        ("Train vs plane for travel", "train versus plane carbon emissions travel"),
        ("Flying less, traveling smarter", "how to reduce flight emissions sustainable travel"),
    ],
    "waste": [
        ("Recycling done right", "how to recycle properly reduce waste"),
        ("Composting at home", "home composting for beginners reduce food waste"),
        ("Living a low-waste life", "zero waste lifestyle practical tips"),
    ],
    "general": [
        ("Understand your carbon footprint", "what is a carbon footprint explained simply"),
        ("Small habits, big climate impact", "everyday habits to reduce carbon footprint"),
    ],
}


def resources_for(category: str) -> list[dict[str, str]]:
    """Return resource cards (title + url) for one category, or general tips."""
    entries = _CATALOG.get(category, _CATALOG["general"])
    return [{"title": title, "url": _link(query)} for title, query in entries]


def all_resources() -> dict[str, list[dict[str, str]]]:
    """Return the full catalog keyed by category, with ready-to-use URLs."""
    return {category: resources_for(category) for category in _CATALOG}
