"""Curated YouTube learning resources for GreenCityAI.

Rather than hard-coding video IDs (which rot when videos are removed) or trusting
an LLM to invent them (which hallucinates dead links), every resource is a
**YouTube search URL**. Search links never 404 and always surface fresh, relevant
content — a deliberate reliability choice for a production app.

Queries are URL-encoded with ``urllib.parse.quote_plus`` so they are always
well-formed and safe to drop straight into an ``href``.
"""

from __future__ import annotations

from typing import Dict, List
from urllib.parse import quote_plus

_SEARCH_BASE = "https://www.youtube.com/results?search_query="


def _link(query: str) -> str:
    """Build a safe YouTube search URL for the given query."""
    return _SEARCH_BASE + quote_plus(query)


# One short, high-signal set of searches per emission category. Titles are what
# the dashboard shows; queries are tuned to return practical, how-to content.
_CATALOG: Dict[str, List[Dict[str, str]]] = {
    "transport": [
        {"title": "How to cut your commute emissions", "query": "how to reduce car commute carbon emissions"},
        {"title": "Are electric cars really greener?", "query": "are electric cars better for the environment explained"},
        {"title": "Cycling & public transport tips", "query": "switching to cycling and public transport sustainable commute"},
    ],
    "diet": [
        {"title": "Eating for a lower carbon footprint", "query": "low carbon footprint diet explained"},
        {"title": "Plant-based meals for beginners", "query": "easy plant based meals for beginners climate"},
        {"title": "The climate impact of food", "query": "carbon footprint of different foods comparison"},
    ],
    "home_heating": [
        {"title": "Heat pumps explained", "query": "how do heat pumps work home heating efficiency"},
        {"title": "Home insulation that pays off", "query": "best home insulation to save energy and money"},
        {"title": "Lower your heating bills sustainably", "query": "reduce home heating carbon footprint tips"},
    ],
    "electricity": [
        {"title": "Switching to renewable energy at home", "query": "how to switch to renewable energy tariff home"},
        {"title": "Cut your electricity use", "query": "easy ways to reduce home electricity consumption"},
        {"title": "Smart home energy saving", "query": "smart home devices to save electricity"},
    ],
    "flights": [
        {"title": "The carbon cost of flying", "query": "carbon footprint of flying explained"},
        {"title": "Train vs plane for travel", "query": "train versus plane carbon emissions travel"},
        {"title": "Flying less, traveling smarter", "query": "how to reduce flight emissions sustainable travel"},
    ],
    "waste": [
        {"title": "Recycling done right", "query": "how to recycle properly reduce waste"},
        {"title": "Composting at home", "query": "home composting for beginners reduce food waste"},
        {"title": "Living a low-waste life", "query": "zero waste lifestyle practical tips"},
    ],
    "general": [
        {"title": "Understand your carbon footprint", "query": "what is a carbon footprint explained simply"},
        {"title": "Small habits, big climate impact", "query": "everyday habits to reduce carbon footprint"},
    ],
}


def resources_for(category: str) -> List[Dict[str, str]]:
    """Return resource cards (title + url) for one category, or general tips."""
    entries = _CATALOG.get(category, _CATALOG["general"])
    return [{"title": e["title"], "url": _link(e["query"])} for e in entries]


def all_resources() -> Dict[str, List[Dict[str, str]]]:
    """Return the full catalog keyed by category, with ready-to-use URLs."""
    return {category: resources_for(category) for category in _CATALOG}
