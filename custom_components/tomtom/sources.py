"""Further sources of reports beside TomTom's own, each optional and each
switched on under ⚙ TomTom Settings -> Configure -> Data sources.

A source answers the same two questions the TomTom client does - what is
in this box, what is along this route - with reports in the shape
incident_item() gives TomTom's, so that everything downstream (the
filters, the entities, the card, the blueprint) reads them without
knowing where they came from. What a source adds of its own is a kind or
two of report TomTom has not got, under keys of their own in CATEGORIES,
and the "provider" every report names.

The first source is blitzer.de: speed cameras and traffic checks, under
seven kinds by what is measured - and only those. The second is Lufop,
whose radar database answers four of those seven. The community's reports of jams, accidents,
roadworks and closures it has too, but TomTom reports the same kinds, and
the two would stand side by side in the list as one thing twice; so each
source keeps to what the other has not got.
"""

from __future__ import annotations

import asyncio
import logging
from math import ceil, cos, radians
import re

from aiohttp import ClientError, ClientTimeout

from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util
from homeassistant.util import location as location_util

from .api import PRODUCT_BLITZER, PRODUCT_LUFOP, TomTomUsage
from .const import (
    CATEGORIES,
    CONF_LUFOP_API_KEY,
    CONF_LUFOP_COUNTRY,
    CONF_SEARCH_MODE,
    CONF_SOURCE_BLITZER,
    CONF_SOURCE_LUFOP,
    DOMAIN,
    SEARCH_MODE_SETTINGS,
    SOURCE_BLITZER,
    SOURCE_LUFOP,
)

_LOGGER = logging.getLogger(__name__)

METERS_PER_DEGREE = 111320.0

# blitzer.de's own map reads its site at /karte/api/markers, with the type
# list, the box (south, west, north, east) and a zoom; z=18 asks for the
# markers themselves rather than clusters, which the answer falls back to
# above a few hundred entries - a cluster carries a type of 1000 or more,
# and is asked for again in a smaller box. See the Blitzer integration,
# where this was measured.
BLITZER_HOST = "www.blitzer.de"
BLITZER_MARKERS = "/karte/api/markers"
BLITZER_TIMEOUT = ClientTimeout(total=15)
BLITZER_ZOOM = 18
# How deep a cluster is followed, each step a tenth of the box: three
# steps take a 50 km box down to 50 m.
BLITZER_CLUSTER_DEPTH = 3
# blitzer.de's stamps are Berlin time, written "2026-10-18 09:25:30".
BLITZER_TZ = "Europe/Berlin"

# blitzer.de's type codes, each under the kind it belongs to here - by
# what is measured, not by how it is mounted. The weight and height
# checks (3, 108, 109) are left out on purpose: lorry matters.
BLITZER_KIND_CODES = {
    "camera_fixed": [107, 114, 106, 115, 104, 105, 103, 102],
    "camera_mobile": [1, 7, 0],
    "camera_trailer": ["ts"],
    "camera_redlight": [2, 11, 111, 110],
    "camera_section": [12, 112, 113],
    "check_distance": [6, 101],
    "check_police": [4, 5, 117],
}
BLITZER_CODE_KINDS = {str(code): kind for kind, codes in BLITZER_KIND_CODES.items() for code in codes}
# What is mounted for good, as blitzer.de's own map tells them apart.
BLITZER_FIXED_CODES = {"107", "114", "106", "115", "104", "105", "103", "102", "111", "110", "112", "113", "101", "117"}
BLITZER_CODE_LABELS = {
    "0": {"en": "Unknown check", "de": "Unbekannte Kontrolle"},
    "1": {"en": "Mobile speed camera", "de": "Mobiler Geschwindigkeitsblitzer"},
    "2": {"en": "Red-light camera", "de": "Ampelblitzer"},
    "4": {"en": "Traffic check", "de": "Allgemeine Verkehrskontrolle"},
    "5": {"en": "Alcohol check", "de": "Alkoholkontrolle"},
    "6": {"en": "Distance check, mobile", "de": "Abstandskontrolle, mobil"},
    "7": {"en": "Mobile speed camera", "de": "Mobiler Geschwindigkeitsblitzer"},
    "11": {"en": "Red-light camera", "de": "Ampelblitzer"},
    "12": {"en": "Section control", "de": "Section Control"},
    "ts": {"en": "Speed camera trailer", "de": "Anhängerblitzer"},
    "101": {"en": "Distance check, fixed", "de": "Abstandskontrolle, fest"},
    "102": {"en": "Dummy camera", "de": "Attrappe"},
    "103": {"en": "Access check", "de": "Auffahrtskontrolle"},
    "104": {"en": "Lane check", "de": "Spurkontrolle"},
    "105": {"en": "Entrance check", "de": "Einfahrtskontrolle"},
    "106": {"en": "Pedestrian crossing camera", "de": "Fußgängerüberweg"},
    "107": {"en": "Speed camera", "de": "Geschwindigkeitsblitzer"},
    "110": {"en": "Red-light and speed camera", "de": "Ampel- und Geschwindigkeitsblitzer"},
    "111": {"en": "Red-light camera", "de": "Ampelblitzer"},
    "112": {"en": "Section control, start", "de": "Abschnittskontrolle, Beginn"},
    "113": {"en": "Section control, end", "de": "Abschnittskontrolle, Ende"},
    "114": {"en": "Speed camera in a tunnel", "de": "Blitzer im Tunnel"},
    "115": {"en": "Overtaking ban camera", "de": "Überholverbot"},
    "117": {"en": "Stationary police check", "de": "Stationäre Polizeikontrolle"},
}
# Along a route the source is asked box by box: boxes of this radius,
# this far apart (they overlap), and at most this many per poll - a long
# route gets its first stretch covered rather than blitzer.de flooded.
ROUTE_BOX_RADIUS_M = 4000.0
ROUTE_BOX_SPACING_M = 6000.0
ROUTE_BOXES_MAX = 40
# How far from the route's line a camera may stand and still count as on
# it: the tolerance the Blitzer integration keeps for a route TomTom
# worked out. The line runs down the road itself, so 60 m holds the road
# and its verges and leaves out the parallel street and the junction
# behind the corner.
ROUTE_CORRIDOR_M = 60.0

_ROAD_NUMBER = re.compile(r"^[ABDELNS]\s?\d{1,4}[a-z]?$", re.IGNORECASE)


class SourceError(Exception):
    """A source did not answer."""


class LufopKeyError(SourceError):
    """Lufop's answer to the key check, as the form's error key: the key
    refused, the request refused, the minute's cap, or no answer at all."""

    def __init__(self, reason: str, message: str) -> None:
        super().__init__(message)
        self.reason = reason


def _label(table: dict, code, language: str | None) -> str:
    entry = table.get(str(code))
    if not entry:
        return ""
    return entry.get(str(language or "en")[:2].lower()) or entry["en"]


def _stamp(raw) -> str:
    """A blitzer.de stamp as ISO 8601 with its zone, the way TomTom's
    arrive - "" for none."""
    if not raw or not isinstance(raw, str):
        return ""
    parsed = dt_util.parse_datetime(raw.replace(" ", "T"))
    if parsed is None:
        return ""
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.get_time_zone(BLITZER_TZ))
    return parsed.isoformat()


def _info(poi: dict) -> dict:
    info = poi.get("info")
    return info if isinstance(info, dict) else {}


def _box(latitude: float, longitude: float, radius_m: float) -> tuple[float, float, float, float]:
    lat_delta = radius_m / METERS_PER_DEGREE
    lon_delta = radius_m / (METERS_PER_DEGREE * max(cos(radians(latitude)), 0.01))
    return (latitude - lat_delta, longitude - lon_delta, latitude + lat_delta, longitude + lon_delta)


def _is_cluster(poi: dict) -> bool:
    kind = poi.get("type")
    if kind == "cluster":
        return True
    try:
        return int(kind) >= 1000
    except (TypeError, ValueError):
        return False


def blitzer_item(poi: dict, language: str | None) -> dict | None:
    """One of blitzer.de's cameras or checks as a report, the way
    incident_item shapes TomTom's - or None for one in a shape this does
    not know, and for anything that is not a camera or a check."""
    try:
        lat = float(poi["lat"])
        lng = float(poi["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    backend = str(poi.get("backend") or "")
    if not backend:
        return None
    code = str(poi.get("type", ""))
    info = _info(poi)
    address = poi.get("address") if isinstance(poi.get("address"), dict) else {}
    street = str(address.get("street") or poi.get("street") or "").strip()
    city = str(address.get("city") or "").strip()
    # A street that is a road number goes under "roads", where the card
    # and the road filter look for one; the town stays as the place.
    roads = [street.upper().replace(" ", "")] if street and _ROAD_NUMBER.match(street) else []
    place = city if roads else ", ".join(part for part in (street, city) if part)

    key = BLITZER_CODE_KINDS.get(code)
    if key is None:
        return None
    points = [(lat, lng)]
    start = _stamp(poi.get("create_date"))
    end = ""
    fixed = str(info.get("fixed", "")) == "1" or code in BLITZER_FIXED_CODES
    try:
        speed_limit = int(str(poi.get("vmax") or info.get("vmax") or "0").strip() or 0) or None
    except ValueError:
        speed_limit = None
    # A distance check measures the gap between cars, not their speed;
    # blitzer.de fills in the road's limit there all the same, and after
    # the name it would read as what is enforced.
    if key == "check_distance":
        speed_limit = None
    # blitzer.de's own note on it - a fixed camera's written-out one
    # ("Einbahnstr. in Rtg. Velbert, 7-17 Uhr 30 km/h, sonst 50 km/h"),
    # which most mobile ones have not got.
    description = " ".join(str(info.get("desc") or "").split())
    # A fixed installation is permanent, not reported: as sure as it gets.
    # A mobile one is as sure as the community has made it.
    confirmed = fixed or str(info.get("confirmed", "1")) == "1"
    try:
        confirmations = int(str(poi.get("counter") or "0").strip() or 0)
    except ValueError:
        confirmations = 0
    confirmed_at = _stamp(poi.get("confirm_date"))
    if confirmed_at.startswith("1970"):
        confirmed_at = ""
    category = CATEGORIES.get(key, 0)
    return {
        "id": f"{SOURCE_BLITZER}-{backend}",
        "short_id": backend.split("-")[-1],
        "category": category,
        "lat": points[0][0],
        "lng": points[0][1],
        "end_lat": points[-1][0],
        "end_lng": points[-1][1],
        "points": points,
        "polyline": str(poi.get("polyline") or "") if len(points) > 1 else "",
        "magnitude": None,
        "delay": None,
        "length": None,
        "from": place,
        "to": "",
        "roads": roads,
        "start": start,
        "end": end,
        "probability": "certain" if confirmed else "probable",
        "reports": poi.get("counter"),
        "last_report": _stamp(poi.get("confirm_date")),
        "events": [],
        "description": description,
        "provider": SOURCE_BLITZER,
        "speed_limit": speed_limit,
        # What exactly it is, as blitzer.de names it - the row's title in
        # place of the kind's name, which the symbol says already.
        "type_label": _label(BLITZER_CODE_LABELS, code, language),
        # The community's confirmations: when the last was, and how many -
        # the stars on the row. A fixed installation has neither.
        "confirmed_at": "" if fixed else confirmed_at,
        "confirmations": None if fixed else confirmations,
    }


# ---------------------------------------------------------------- Lufop

# Lufop's read API: one request answers the radars within a margin of a
# point, in one country, up to 200 of them on the free plan - which also
# allows 200 requests a day and 10 a minute. The spacing below keeps every
# request of this installation under the minute's cap, whichever entry
# makes it; the day's budget is the reason a route is asked in a few wide
# circles rather than many narrow ones.
LUFOP_URL = "https://api.lufop.net/api"
LUFOP_TIMEOUT = ClientTimeout(total=20)
LUFOP_MAX_RESULTS = 200
LUFOP_MIN_SECONDS = 6.5
LUFOP_ROUTE_BOX_RADIUS_M = 5000.0
LUFOP_ROUTE_BOX_SPACING_M = 8000.0
LUFOP_ROUTE_BOXES_MAX = 12
_lufop_lock = asyncio.Lock()
_lufop_last = 0.0
# After Lufop has refused, nothing is asked of it for a while - every
# further request would only be refused too, and counted against the same
# cap. The minute's cap (429) lifts after 60 s; the day's (403) not
# before the day turns, so that one is tried again every 15 minutes.
LUFOP_BACKOFF_MINUTE = 60.0
LUFOP_BACKOFF_DAY = 900.0
_lufop_blocked_until = 0.0

# What a Lufop radar is, read off its name - the one field that says: the
# read API's "type" is an internal model number with no published meaning.
# "Chantier" is a mobile unit in a roadwork zone, "tronçon" a section
# control; a carpool-lane camera measures no speed and is left out.
LUFOP_KIND_LABELS = {
    "camera_fixed": {"en": "Speed camera", "de": "Geschwindigkeitsblitzer"},
    "camera_mobile": {"en": "Mobile speed camera", "de": "Mobiler Geschwindigkeitsblitzer"},
    "roadworks": {"en": "Mobile speed camera at roadworks", "de": "Mobiler Blitzer an einer Baustelle"},
    "camera_redlight": {"en": "Red-light camera", "de": "Ampelblitzer"},
    "camera_section": {"en": "Section control", "de": "Abschnittskontrolle"},
}


def lufop_kind(radar: dict) -> tuple[str, str] | None:
    """The kind a Lufop radar goes under, and the label for what it is -
    or None for one that is not a speed camera at all."""
    name = str(radar.get("name") or "").lower()
    if "covoiturage" in name and not radar.get("vitesse"):
        return None
    if "feu" in name:
        return "camera_redlight", "camera_redlight"
    if "tronçon" in name or "troncon" in name or "moyenne" in name:
        return "camera_section", "camera_section"
    if "chantier" in name:
        return "camera_mobile", "roadworks"
    if "mobile" in name:
        return "camera_mobile", "camera_mobile"
    return "camera_fixed", "camera_fixed"


def lufop_item(radar: dict, language: str | None) -> dict | None:
    """One of Lufop's radars as a report, the way incident_item shapes
    TomTom's - or None for one in a shape this does not know."""
    try:
        lat = float(radar["lat"])
        lng = float(radar["lng"])
    except (KeyError, TypeError, ValueError):
        return None
    radar_id = str(radar.get("ID") or radar.get("id") or "")
    kind = lufop_kind(radar)
    if not radar_id or kind is None:
        return None
    key, label_key = kind
    street = str(radar.get("voie") or "").strip()
    city = str(radar.get("commune") or "").strip()
    roads = [street.upper().replace(" ", "")] if street and _ROAD_NUMBER.match(street) else []
    place = city if roads else ", ".join(part for part in (street, city) if part)
    try:
        speed_limit = int(str(radar.get("vitesse") or "0").strip() or 0) or None
    except ValueError:
        speed_limit = None
    return {
        "id": f"{SOURCE_LUFOP}-{radar_id}",
        "short_id": radar_id,
        "category": CATEGORIES.get(key, 0),
        "lat": lat,
        "lng": lng,
        "end_lat": lat,
        "end_lng": lng,
        "points": [(lat, lng)],
        "polyline": "",
        "magnitude": None,
        "delay": None,
        "length": None,
        "from": place,
        "to": "",
        "roads": roads,
        "start": "",
        "end": "",
        # A database entry, not a report: as sure as it gets.
        "probability": "certain",
        "reports": None,
        "last_report": "",
        "events": [],
        "description": "",
        "provider": SOURCE_LUFOP,
        "speed_limit": speed_limit,
        "type_label": _label(LUFOP_KIND_LABELS, label_key, language),
        "confirmed_at": "",
        "confirmations": None,
    }


async def _lufop_wait() -> None:
    """Keeps every request of this installation at least the free plan's
    spacing apart, whichever entry makes it."""
    global _lufop_last  # noqa: PLW0603 - one clock for the whole installation
    async with _lufop_lock:
        loop = asyncio.get_event_loop()
        wait = _lufop_last + LUFOP_MIN_SECONDS - loop.time()
        if wait > 0:
            await asyncio.sleep(wait)
        _lufop_last = loop.time()


async def async_check_lufop_key(hass: HomeAssistant, api_key: str) -> dict:
    """Lufop's own word on a key - "format=meta" is the one call that looks
    at it, and costs no quota. Raises LufopKeyError with the reason, so the
    form calls a key wrong only when Lufop says it is: 401 is a refused key
    (Lufop's documented answer to a wrong one). A 403 refuses the request
    rather than the key - seen once on a day whose requests were used up -
    and a 429 is the minute's cap; neither says anything about the key.
    No answer at all is a Lufop that cannot be reached."""
    await _lufop_wait()
    session = async_get_clientsession(hass)
    try:
        async with session.get(LUFOP_URL, params={"key": api_key, "format": "meta"}, timeout=LUFOP_TIMEOUT) as response:
            if response.status == 401:
                raise LufopKeyError("invalid_lufop_key", "Lufop refused the key")
            if response.status == 403:
                raise LufopKeyError("lufop_refused", "Lufop refused the request (HTTP 403)")
            if response.status == 429:
                raise LufopKeyError("lufop_busy", "Lufop's limit of requests a minute was reached")
            if response.status >= 400:
                raise LufopKeyError("lufop_cannot_connect", f"Lufop answered HTTP {response.status} to the key check")
            data = await response.json(content_type=None)
    except (ClientError, asyncio.TimeoutError, ValueError) as err:
        raise LufopKeyError("lufop_cannot_connect", f"Lufop did not answer: {err}") from err
    if not isinstance(data, dict):
        raise LufopKeyError("lufop_cannot_connect", "Lufop said nothing about the key")
    return data


async def async_lufop_usage(hass: HomeAssistant, api_key: str) -> dict:
    """What Lufop itself says about the key's day, from the key document
    "format=meta" answers - a call that costs no quota. Per Lufop's
    documentation it carries the plan under "plan_actuel" and the day's
    figures under "usage": calls_today, calls_per_day_limit and
    calls_remaining_today. Lufop refuses that document too once the day
    is used up - measured: HTTP 403 with the day's requests spent."""
    await _lufop_wait()
    session = async_get_clientsession(hass)
    try:
        async with session.get(LUFOP_URL, params={"key": api_key, "format": "meta"}, timeout=LUFOP_TIMEOUT) as response:
            if response.status == 403:
                return {"used": None, "limit": None, "remaining": None, "plan": None, "used_up": True}
            if response.status >= 400:
                raise SourceError(f"Lufop answered HTTP {response.status} to the key document")
            data = await response.json(content_type=None)
    except (ClientError, asyncio.TimeoutError, ValueError) as err:
        raise SourceError(f"Lufop did not answer: {err}") from err
    if not isinstance(data, dict):
        raise SourceError("Lufop said nothing about the key")
    usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}

    def number(key):
        value = usage.get(key)
        return int(value) if isinstance(value, (int, float)) and not isinstance(value, bool) else None

    out = {
        "used": number("calls_today"),
        "limit": number("calls_per_day_limit"),
        "remaining": number("calls_remaining_today"),
        "plan": str(data.get("plan_actuel") or "") or None,
    }
    out["used_up"] = out["remaining"] is not None and out["remaining"] <= 0
    return out


class LufopSource:
    """Lufop as a source of reports: the radars of one country around a
    point, or along a route in a few wide circles; each request counted
    on the entry under the "lufop" product."""

    key = SOURCE_LUFOP
    # The kinds Lufop can answer - the others are blitzer.de's alone.
    KINDS = ("camera_fixed", "camera_mobile", "camera_redlight", "camera_section")

    def __init__(self, hass: HomeAssistant, usage: TomTomUsage, api_key: str, country: str) -> None:
        self._hass = hass
        self._session = async_get_clientsession(hass)
        self._usage = usage
        self._api_key = api_key
        self._country = country

    def wanted(self, kinds: dict) -> bool:
        return any(kinds.get(kind) for kind in self.KINDS)

    async def _request(self, entry_id: str, lat: float, lng: float, radius_m: float) -> list[dict]:
        global _lufop_blocked_until  # noqa: PLW0603 - one clock for the whole installation
        loop = asyncio.get_event_loop()
        blocked = "Lufop refused the last request (its cap), waiting before asking again"
        if loop.time() < _lufop_blocked_until:
            raise SourceError(blocked)
        await _lufop_wait()
        # Checked again after the wait: the refusal may have come to another
        # entry's request while this one stood in line.
        if loop.time() < _lufop_blocked_until:
            raise SourceError(blocked)
        params = {
            "key": self._api_key,
            "format": "json",
            "pays": self._country,
            "nbr": str(LUFOP_MAX_RESULTS),
            "q": f"{lat},{lng}",
            # Lufop's margin counts in tenths of a kilometre, rounded up so
            # a narrow search never asks for less ground than it meant to.
            "m": str(max(1, ceil(radius_m / 100))),
        }
        self._usage.count(entry_id, PRODUCT_LUFOP)
        try:
            async with self._session.get(LUFOP_URL, params=params, timeout=LUFOP_TIMEOUT) as response:
                if response.status == 429:
                    _lufop_blocked_until = loop.time() + LUFOP_BACKOFF_MINUTE
                    raise SourceError("Lufop answered HTTP 429 - its cap of 10 requests a minute; asked again in a minute")
                if response.status == 403:
                    _lufop_blocked_until = loop.time() + LUFOP_BACKOFF_DAY
                    raise SourceError("Lufop answered HTTP 403 - its cap for the day, or a key it refuses; asked again in 15 minutes")
                if response.status >= 400:
                    raise SourceError(f"Lufop answered HTTP {response.status}")
                data = await response.json(content_type=None)
        except (ClientError, asyncio.TimeoutError, ValueError) as err:
            raise SourceError(f"Lufop did not answer: {err}") from err
        # Nothing in range comes back as a bare null; an error as an object.
        if data is None:
            return []
        if not isinstance(data, list):
            message = data.get("message") if isinstance(data, dict) else data
            raise SourceError(f"Lufop answered with an error: {message}")
        if len(data) >= LUFOP_MAX_RESULTS:
            _LOGGER.debug("Lufop: the answer is capped at %d radars, a wider search is cut", LUFOP_MAX_RESULTS)
        return [r for r in data if isinstance(r, dict)]

    async def fetch_area(self, entry_id: str, lat: float, lng: float, radius: float, kinds: dict, language: str | None) -> list[dict]:
        if not self.wanted(kinds):
            return []
        return self._items(await self._request(entry_id, lat, lng, radius), kinds, language)

    async def fetch_route(self, entry_id: str, points: list[tuple[float, float]], kinds: dict, language: str | None) -> list[dict]:
        if not self.wanted(kinds) or len(points) < 2:
            return []
        centres = _along(points, LUFOP_ROUTE_BOX_SPACING_M)
        if len(centres) > LUFOP_ROUTE_BOXES_MAX:
            _LOGGER.debug("Lufop: route needs %d circles, asking the first %d", len(centres), LUFOP_ROUTE_BOXES_MAX)
            centres = centres[:LUFOP_ROUTE_BOXES_MAX]
        radars: list[dict] = []
        for lat, lng in centres:
            radars.extend(await self._request(entry_id, lat, lng, LUFOP_ROUTE_BOX_RADIUS_M))
        items = self._items(radars, kinds, language)
        return await self._hass.async_add_executor_job(_near_route, items, points, ROUTE_CORRIDOR_M)

    @staticmethod
    def _items(radars: list[dict], kinds: dict, language: str | None) -> list[dict]:
        """The radars as reports, the kinds not switched on left out here -
        Lufop answers everything in range, whatever is asked."""
        items: list[dict] = []
        seen: set[str] = set()
        for radar in radars:
            item = lufop_item(radar, language)
            if item is None or item["id"] in seen:
                continue
            kind = next((k for k, code in CATEGORIES.items() if code == item["category"]), None)
            if not kinds.get(kind):
                continue
            seen.add(item["id"])
            items.append(item)
        return items


# Two sources that both list a camera stand this close to each other on
# it, measured on the Zurich cameras blitzer.de and Lufop both have.
SAME_CAMERA_M = 40.0


def merge_sources(items: list[dict]) -> list[dict]:
    """One camera once: where blitzer.de and Lufop both report one - the
    same kind, within a few dozen metres - blitzer.de's report is kept,
    with its note and its confirmations, and names Lufop among its
    providers. Lufop's reports that blitzer.de has not got stay."""
    kept = [item for item in items if item.get("provider") != SOURCE_LUFOP]
    for item in kept:
        item.setdefault("providers", [item.get("provider") or "tomtom"])
    for candidate in items:
        if candidate.get("provider") != SOURCE_LUFOP:
            continue
        twin = next(
            (
                item for item in kept
                if item.get("provider") == SOURCE_BLITZER
                and item["category"] == candidate["category"]
                and (location_util.distance(item["lat"], item["lng"], candidate["lat"], candidate["lng"]) or 0.0) <= SAME_CAMERA_M
            ),
            None,
        )
        if twin is None:
            candidate.setdefault("providers", [SOURCE_LUFOP])
            kept.append(candidate)
        elif SOURCE_LUFOP not in twin["providers"]:
            twin["providers"].append(SOURCE_LUFOP)
    return kept


def enabled_sources(hass: HomeAssistant, usage: TomTomUsage) -> list:
    """The further sources switched on under TomTom Settings, ready to ask."""
    settings = next(
        (e for e in hass.config_entries.async_entries(DOMAIN) if e.data.get(CONF_SEARCH_MODE) == SEARCH_MODE_SETTINGS),
        None,
    )
    options = dict(settings.options) if settings else {}
    sources: list = []
    if options.get(CONF_SOURCE_BLITZER):
        sources.append(BlitzerSource(hass, usage))
    key = str(options.get(CONF_LUFOP_API_KEY) or "").strip()
    if options.get(CONF_SOURCE_LUFOP) and key:
        country = str(options.get(CONF_LUFOP_COUNTRY) or hass.config.country or "fr").lower()
        sources.append(LufopSource(hass, usage, key, country))
    return sources


class BlitzerSource:
    """blitzer.de as a source of reports: what the kinds switched on ask
    for, in a box or along a route, each request counted on the entry
    under the "blitzer" product."""

    key = SOURCE_BLITZER

    def __init__(self, hass: HomeAssistant, usage: TomTomUsage) -> None:
        self._hass = hass
        self._session = async_get_clientsession(hass)
        self._usage = usage

    @staticmethod
    def types_for(kinds: dict) -> list:
        """blitzer.de's type codes for the kinds switched on."""
        types: list = []
        for kind, codes in BLITZER_KIND_CODES.items():
            if kinds.get(kind):
                types += codes
        return types

    async def _request(self, entry_id: str, box: tuple, types: list) -> list[dict]:
        south, west, north, east = box
        query = ",".join(str(t) for t in types)
        url = f"https://{BLITZER_HOST}{BLITZER_MARKERS}?type={query}&box={south},{west},{north},{east}&z={BLITZER_ZOOM}"
        self._usage.count(entry_id, PRODUCT_BLITZER)
        try:
            async with self._session.get(url, timeout=BLITZER_TIMEOUT) as response:
                response.raise_for_status()
                body = await response.json(content_type=None)
        except (ClientError, asyncio.TimeoutError, ValueError) as err:
            raise SourceError(f"blitzer.de did not answer: {err}") from err
        pois = (body or {}).get("pois") if isinstance(body, dict) else None
        return [p for p in pois or [] if isinstance(p, dict)]

    async def _fetch_box(self, entry_id: str, lat: float, lng: float, radius: float, types: list, depth: int = 0) -> list[dict]:
        found: list[dict] = []
        for poi in await self._request(entry_id, _box(lat, lng, radius), types):
            if _is_cluster(poi):
                if depth >= BLITZER_CLUSTER_DEPTH:
                    continue
                try:
                    clat, clng = float(poi["lat"]), float(poi["lng"])
                except (KeyError, TypeError, ValueError):
                    continue
                found.extend(await self._fetch_box(entry_id, clat, clng, radius / 10, types, depth + 1))
                continue
            found.append(poi)
        return found

    async def fetch_area(self, entry_id: str, lat: float, lng: float, radius: float, kinds: dict, language: str | None) -> list[dict]:
        """The cameras and checks in a circle: one request, more where the
        answer came back grouped."""
        types = self.types_for(kinds)
        if not types:
            return []
        return self._items(await self._fetch_box(entry_id, lat, lng, radius, types), language)

    async def fetch_route(self, entry_id: str, points: list[tuple[float, float]], kinds: dict, language: str | None) -> list[dict]:
        """The reports along a route: boxes along its line, their answers
        merged, and only what lies within the corridor kept."""
        types = self.types_for(kinds)
        if not types or len(points) < 2:
            return []
        centres = _along(points, ROUTE_BOX_SPACING_M)
        if len(centres) > ROUTE_BOXES_MAX:
            _LOGGER.debug("blitzer.de: route needs %d boxes, asking the first %d", len(centres), ROUTE_BOXES_MAX)
            centres = centres[:ROUTE_BOXES_MAX]
        pois: list[dict] = []
        for lat, lng in centres:
            pois.extend(await self._fetch_box(entry_id, lat, lng, ROUTE_BOX_RADIUS_M, types))
        items = self._items(pois, language)
        return await self._hass.async_add_executor_job(_near_route, items, points, ROUTE_CORRIDOR_M)

    @staticmethod
    def _items(pois: list[dict], language: str | None) -> list[dict]:
        items: list[dict] = []
        seen: set[str] = set()
        for poi in pois:
            item = blitzer_item(poi, language)
            if item is None or item["id"] in seen:
                continue
            seen.add(item["id"])
            items.append(item)
        return items


def _along(points: list[tuple[float, float]], spacing: float) -> list[tuple[float, float]]:
    """Points every `spacing` metres along the line, its two ends included."""
    out = [points[0]]
    carried = 0.0
    for (lat1, lng1), (lat2, lng2) in zip(points, points[1:]):
        length = location_util.distance(lat1, lng1, lat2, lng2) or 0.0
        position = spacing - carried
        while position <= length:
            f = position / length
            out.append((lat1 + (lat2 - lat1) * f, lng1 + (lng2 - lng1) * f))
            position += spacing
        carried = length - (position - spacing)
    if carried > 1.0:
        out.append(points[-1])
    return out


def _near_route(items: list[dict], points: list[tuple[float, float]], within: float) -> list[dict]:
    """Only the reports within `within` metres of the line. In the
    executor: arithmetic over every report against every segment."""
    from .route_match import RouteLine  # noqa: PLC0415 - geometry only where it is needed

    line = RouteLine(points)
    kept = []
    for item in items:
        nearest = line.nearest((item["lat"], item["lng"]), within=within)
        if nearest is not None and nearest[0] <= within:
            kept.append(item)
    return kept
