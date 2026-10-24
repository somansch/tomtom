"""TomTom: the one client for everything this integration asks it.

Four of TomTom's APIs, one key:

- Traffic Incident Details v5 - the reports: what is on the road inside a
  box, each with its kind, its stretch of road, its delay and TomTom's own
  wording for it.
- Routing - the route between two places as the traffic makes it right now,
  with its travel time, its delay, and the stretches of it that traffic is
  slowing (the "sections").
- Geocoding and Reverse Geocoding - the addresses a route is set up with,
  and the one lookup that checks a key.
- Traffic Flow raster tiles - the colouring of the roads the card lays over
  its map, served on through tiles.py so the key never reaches a browser.

Every request that reaches TomTom is counted, per calendar month: for the
entry it was made for, by the API it went to, and in a total across all of
them - see TomTomUsage. TomTom bills, and caps a free key, by the requests
each API receives, and the one that matters most has 2,500 a month: the
Incident Details.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta
import logging
from math import ceil, cos, radians
from time import monotonic
from urllib.parse import quote

from aiohttp import ClientError

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import CAUSE_CATEGORIES, DOMAIN, MAX_BOX_AREA_KM2, QUOTA_MIN_DAYS, SECTION_CATEGORIES, TOMTOM_CATEGORIES

_LOGGER = logging.getLogger(__name__)

BASE_URL = "https://api.tomtom.com"
ROUTING_URL = f"{BASE_URL}/routing/1/calculateRoute/{{points}}/json"
GEOCODE_URL = f"{BASE_URL}/search/2/geocode/{{query}}.json"
SEARCH_URL = f"{BASE_URL}/search/2/search/{{query}}.json"
REVERSE_URL = f"{BASE_URL}/search/2/reverseGeocode/{{lat}},{{lon}}.json"
INCIDENTS_URL = f"{BASE_URL}/traffic/services/5/incidentDetails"
FLOW_TILE_URL = f"{BASE_URL}/traffic/map/4/tile/flow/{{style}}/{{z}}/{{x}}/{{y}}.png"

# The APIs, as the counts name them.
PRODUCT_INCIDENTS = "incidents"
PRODUCT_ROUTING = "routing"
PRODUCT_GEOCODING = "geocoding"
PRODUCT_REVERSE_GEOCODING = "reverse_geocoding"
# The fuzzy search behind the planner's address suggestions - TomTom's
# dashboard lists it apart from the geocoder, with a tier of its own.
PRODUCT_SEARCH = "search"
PRODUCT_TILES = "tiles"
# Not TomTom's: the requests to blitzer.de, the further source of reports
# - counted like the rest, with no tier to hold them against.
PRODUCT_BLITZER = "blitzer"
PRODUCT_LUFOP = "lufop"
PRODUCTS = (
    PRODUCT_INCIDENTS, PRODUCT_ROUTING, PRODUCT_GEOCODING, PRODUCT_REVERSE_GEOCODING, PRODUCT_SEARCH, PRODUCT_TILES,
    PRODUCT_BLITZER, PRODUCT_LUFOP,
)
# The ones an entry can be charged with: its own polls, and the flow
# tiles the card fetches while it shows that entry. The key check belongs
# to no entry.
ENTRY_PRODUCTS = (PRODUCT_INCIDENTS, PRODUCT_ROUTING, PRODUCT_GEOCODING, PRODUCT_TILES, PRODUCT_BLITZER, PRODUCT_LUFOP)
# Each API as TomTom's own dashboard names it - for a repair's text, which
# has no translation of its own to draw on.
PRODUCT_LABELS = {
    PRODUCT_INCIDENTS: "Incident Details",
    PRODUCT_ROUTING: "Routing",
    PRODUCT_GEOCODING: "Geocoding",
    PRODUCT_REVERSE_GEOCODING: "Reverse Geocoding",
    PRODUCT_SEARCH: "Search",
    PRODUCT_TILES: "Flow tiles",
    PRODUCT_BLITZER: "blitzer.de",
    PRODUCT_LUFOP: "Lufop",
}

# The service takes up to 150 points in one route; a commute's vias are a
# handful.
MAX_POINTS = 150

# What is asked of an incident, field by field. Everything Incident Details
# can say about one; the default is the geometry and the category alone.
INCIDENT_FIELDS = (
    "{incidents{type,geometry{type,coordinates},properties{id,iconCategory,"
    "magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,"
    "from,to,length,delay,roadNumbers,timeValidity,probabilityOfOccurrence,"
    "numberOfReports,lastReportTime}}}"
)

# The languages Incident Details speaks - its thirty-one, by Home
# Assistant's language code, so TomTom's own wording of a report (the
# description) comes in the instance's language where TomTom has it.
# Looked up by the full code first - "pt-BR", "zh-Hant" - then by its first
# two letters; a language TomTom does not speak is asked for in English,
# which is also what TomTom falls back to for an untranslated description.
# The place names a report runs between are the map's own and come as
# they are signposted, whatever this says.
INCIDENT_LANGUAGES = {
    "ar": "ar",
    "ca": "ca-ES",
    "cs": "cs-CZ",
    "da": "da-DK",
    "de": "de-DE",
    "el": "el-GR",
    "en": "en-US",
    "en-gb": "en-GB",
    "es": "es-ES",
    "et": "et-EE",
    "fi": "fi-FI",
    "fr": "fr-FR",
    "he": "he-IL",
    "hu": "hu-HU",
    "id": "id-ID",
    "it": "it-IT",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "lt": "lt-LT",
    "lv": "lv-LV",
    "nb": "nb-NO",
    "nn": "nb-NO",
    "no": "nb-NO",
    "nl": "nl-NL",
    "pl": "pl-PL",
    "pt": "pt-PT",
    "ro": "ro-RO",
    "ru": "ru-RU",
    "sk": "sk-SK",
    "sv": "sv-SE",
    "th": "th-TH",
    "tr": "tr-TR",
    "zh": "zh-TW",
}


def incident_language(language: str | None) -> str:
    """The language code Incident Details is asked for, from Home
    Assistant's: the full code where TomTom knows it, else its base."""
    code = (language or "en").lower().replace("_", "-")
    return INCIDENT_LANGUAGES.get(code) or INCIDENT_LANGUAGES.get(code[:2], "en-GB")

# How far a point of a stored route may move when it is thinned out. A route
# comes back with a vertex every few metres - 1217 of them for 82 km from
# Munich to Augsburg - while a report's distance along it is read to tens
# of metres. At 10 m the same route keeps a tenth of its points and loses
# nothing that distance could notice.
SIMPLIFY_TOLERANCE_M = 10

METERS_PER_DEGREE = 111320.0

# What the service's own error codes mean here. The message beside the code
# is free text and changes; the code is what is matched.
_ROUTING_ERRORS = {
    "MAP_MATCHING_FAILURE": "point_not_routable",
    "NO_ROUTE_FOUND": "no_route",
    "BAD_INPUT": "parameter",
    "COMPUTE_TIME_LIMIT_EXCEEDED": "limit",
}

# How long a flow tile is kept before TomTom is asked again: its flow data
# is refreshed every minute, and two cards on the same view - or one card
# panned and panned back - should not spend a tile each on the same picture.
TILE_CACHE_SECONDS = 120
TILE_CACHE_SIZE = 400
TILE_TIMEOUT = 20


class TomTomError(Exception):
    """Anything TomTom said no to, or did not say at all."""


class TomTomAuthError(TomTomError):
    """The key is missing, wrong, or not allowed to use this API."""


class TomTomQuotaError(TomTomError):
    """The key's quota is used up for now."""


class TomTomAddressNotFound(TomTomError):
    """The geocoder found nothing for the text given."""


class TomTomPointNotRoutable(TomTomError):
    """A start, destination or via point is nowhere near a road."""


class TomTomNoRoute(TomTomError):
    """The points are on roads, but no road connects them."""


class TomTomLimitExceeded(TomTomError):
    """Too long a route, too many points, or too large a box."""


class TomTomParameterError(TomTomError):
    """TomTom did not accept a parameter of the request."""


_ERROR_CLASSES = {
    "point_not_routable": TomTomPointNotRoutable,
    "no_route": TomTomNoRoute,
    "parameter": TomTomParameterError,
    "limit": TomTomLimitExceeded,
}


# --------------------------------------------------------------------- key

# The one key of this installation, in a store of its own rather than in
# every entry: typed once, it is not asked for again, and changed once, it
# changes for every entry. Private, so only Home Assistant can read the file
# - it is a credential.
_KEY_STORE = f"{DOMAIN}.key"
_KEY_STORE_VERSION = 1
_KEY_DATA = f"{DOMAIN}_key_store"


def _key_store(hass: HomeAssistant) -> Store:
    store = hass.data.get(_KEY_DATA)
    if store is None:
        store = hass.data[_KEY_DATA] = Store(
            hass, _KEY_STORE_VERSION, _KEY_STORE, private=True, atomic_writes=True
        )
    return store


async def async_load_key(hass: HomeAssistant) -> str | None:
    """The saved key, if one was."""
    data = await _key_store(hass).async_load()
    return (data or {}).get("api_key") or None


async def async_save_key(hass: HomeAssistant, api_key: str) -> None:
    await _key_store(hass).async_save({"api_key": api_key})


async def async_forget_key(hass: HomeAssistant) -> None:
    await _key_store(hass).async_remove()
    hass.data.pop(_KEY_DATA, None)


# ------------------------------------------------------------------- usage

USAGE_STORE_KEY = f"{DOMAIN}.usage"
USAGE_STORE_VERSION = 1
SIGNAL_USAGE = f"{DOMAIN}_usage"
_USAGE_DATA_KEY = f"{DOMAIN}_usage"


class TomTomUsage:
    """How many requests went to TomTom this calendar month: per entry, per
    API, and all of them together.

    Counted is every request that got an answer from TomTom, whatever the
    answer was; one that never reached it is not. The total also holds the
    lookups of a setup that no entry exists for yet, and the flow tiles,
    which belong to no entry. The month is the local calendar month; at its
    turn the counts start at nought and the month before is kept beside
    them, so the last full month can still be read. Kept in .storage, so a
    restart loses nothing.
    """

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store(hass, USAGE_STORE_VERSION, USAGE_STORE_KEY, atomic_writes=True)
        self._lock = asyncio.Lock()
        self._loaded = False
        self.month = ""
        # entry id -> product -> count; "" is the entry of what belongs to
        # none (a setup's lookups, the tiles).
        self.entries: dict[str, dict[str, int]] = {}
        self.previous: dict = {"month": "", "entries": {}}
        # The same, by the day: for a source whose free plan counts a day
        # at a time - Lufop's 200. Its day is UTC's: Lufop resets the
        # count at midnight UTC, so this one does too.
        self.day = ""
        self.day_entries: dict[str, dict[str, int]] = {}
        self.previous_day: dict = {"day": "", "entries": {}}

    async def async_load(self) -> None:
        async with self._lock:
            if self._loaded:
                return
            data = await self._store.async_load() or {}
            self.month = str(data.get("month") or "")
            self.entries = self._read_entries(data.get("entries"))
            previous = data.get("previous") or {}
            self.previous = {
                "month": str(previous.get("month") or ""),
                "entries": self._read_entries(previous.get("entries")),
            }
            self.day = str(data.get("day") or "")
            self.day_entries = self._read_entries(data.get("day_entries"))
            previous_day = data.get("previous_day") or {}
            self.previous_day = {
                "day": str(previous_day.get("day") or ""),
                "entries": self._read_entries(previous_day.get("entries")),
            }
            self._loaded = True
            self._roll()

    @staticmethod
    def _read_entries(raw) -> dict[str, dict[str, int]]:
        out: dict[str, dict[str, int]] = {}
        for entry_id, products in (raw or {}).items():
            if not isinstance(products, dict):
                continue
            out[str(entry_id)] = {
                str(product): int(count or 0) for product, count in products.items()
            }
        return out

    def _roll(self) -> bool:
        """Start a new month, and a new day, if the calendar has moved on;
        True if either did."""
        now = dt_util.now()
        changed = False
        month = now.strftime("%Y-%m")
        if month != self.month:
            if self.month:
                self.previous = {"month": self.month, "entries": self.entries}
            self.month = month
            self.entries = {}
            changed = True
        day = dt_util.utcnow().strftime("%Y-%m-%d")
        if day != self.day:
            if self.day:
                self.previous_day = {"day": self.day, "entries": self.day_entries}
            self.day = day
            self.day_entries = {}
            changed = True
        if changed:
            self._save()
        return changed

    def _data(self) -> dict:
        return {
            "month": self.month,
            "entries": self.entries,
            "previous": self.previous,
            "day": self.day,
            "day_entries": self.day_entries,
            "previous_day": self.previous_day,
        }

    def _save(self) -> None:
        self._store.async_delay_save(self._data, 10)

    @callback
    def count(self, entry_id: str | None, product: str) -> None:
        self._roll()
        products = self.entries.setdefault(entry_id or "", {})
        products[product] = products.get(product, 0) + 1
        today = self.day_entries.setdefault(entry_id or "", {})
        today[product] = today.get(product, 0) + 1
        self._save()
        async_dispatcher_send(self._hass, SIGNAL_USAGE)

    @staticmethod
    def _sum(entries: dict[str, dict[str, int]], entry_id: str | None) -> dict[str, int]:
        """The counts by product - of one entry, or of all of them for None."""
        totals: dict[str, int] = {}
        for owner, products in entries.items():
            if entry_id is not None and owner != entry_id:
                continue
            for product, count in products.items():
                totals[product] = totals.get(product, 0) + count
        return totals

    @callback
    def breakdown(self, entry_id: str | None) -> dict[str, int]:
        """This month's counts by product - of one entry, or of everything."""
        if self._roll():
            async_dispatcher_send(self._hass, SIGNAL_USAGE)
        return self._sum(self.entries, entry_id)

    @callback
    def breakdown_day(self, entry_id: str | None) -> dict[str, int]:
        """Today's counts by product - of one entry, or of everything."""
        if self._roll():
            async_dispatcher_send(self._hass, SIGNAL_USAGE)
        return self._sum(self.day_entries, entry_id)

    @callback
    def previous_day_for(self, entry_id: str | None, product: str) -> tuple[str, int]:
        """Yesterday - the last day anything was counted - and its count of
        one API, of one entry or of all of them."""
        day = self.previous_day.get("day") or ""
        counts = self._sum(self.previous_day.get("entries") or {}, entry_id)
        return day, counts.get(product, 0)

    @callback
    def for_entry(self, entry_id: str | None) -> int:
        """This month's count - of one entry, or of all of them for None."""
        return sum(self.breakdown(entry_id).values())

    @callback
    def previous_for(self, entry_id: str | None, product: str | None = None) -> tuple[str, int]:
        """The month before and its count - of one entry, or of all of them;
        of one API, or of every one."""
        month = self.previous.get("month") or ""
        counts = self._sum(self.previous.get("entries") or {}, entry_id)
        return month, counts.get(product, 0) if product else sum(counts.values())

    @callback
    def projection(self, product: str, now=None) -> int | None:
        """What this month's count of one API comes to by the month's end at
        the pace so far: the count divided by the share of the month gone,
        with the month's own length. None in the month's first week - a
        weekday-and-weekend pattern is in it from then on, and the first
        days alone say little."""
        now = now or dt_util.now()
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        gone = now - start
        if gone < timedelta(days=QUOTA_MIN_DAYS):
            return None
        end = (start + timedelta(days=32)).replace(day=1)
        used = self.breakdown(None).get(product, 0)
        return round(used * (end - start).total_seconds() / gone.total_seconds())

    @callback
    def forget(self, entry_id: str) -> None:
        """An entry that is gone has no count of its own any more; what it
        asked for stays in the total, since TomTom counted it all the same -
        it is moved to the unowned bucket."""
        changed = False
        for entries in (self.entries, self.previous.get("entries") or {}, self.day_entries, self.previous_day.get("entries") or {}):
            gone = entries.pop(entry_id, None)
            if gone:
                changed = True
                shared = entries.setdefault("", {})
                for product, count in gone.items():
                    shared[product] = shared.get(product, 0) + count
        if changed:
            self._save()


async def async_get_usage(hass: HomeAssistant) -> TomTomUsage:
    """The one TomTomUsage of this Home Assistant, loaded."""
    usage = hass.data.get(_USAGE_DATA_KEY)
    if usage is None:
        usage = hass.data[_USAGE_DATA_KEY] = TomTomUsage(hass)
    await usage.async_load()
    return usage


# ------------------------------------------------------------------ client

def _error_code(body) -> str:
    """The service's error code, whichever shape the answer came in:
    {"detailedError": {"code": ...}} from routing, {"error": ...} elsewhere."""
    if isinstance(body, dict):
        detailed = body.get("detailedError")
        if isinstance(detailed, dict):
            return str(detailed.get("code") or "")
        error = body.get("error")
        if isinstance(error, dict):
            return str(error.get("code") or "")
    return ""


class TomTomClient:
    """The calls this integration makes, and nothing else."""

    def __init__(self, hass: HomeAssistant, api_key: str | None, entry_id: str | None = None) -> None:
        self._hass = hass
        self._session = async_get_clientsession(hass)
        self._key = api_key or ""
        # Whose request this is, for the month's count - None for a setup
        # that has no entry yet, which only the total counts.
        self._entry_id = entry_id

    async def _call(self, url: str, params: dict, product: str, binary: bool = False, entry_id: str | None = None):
        if not self._key:
            raise TomTomAuthError("no TomTom API key")
        usage = await async_get_usage(self._hass)
        try:
            async with self._session.get(
                url, params={"key": self._key, **params}, timeout=30
            ) as response:
                # Answered, so TomTom has seen it: counted whatever it says.
                usage.count(entry_id or self._entry_id, product)
                status = response.status
                if binary and status < 400:
                    return await response.read()
                try:
                    body = await response.json(content_type=None)
                except ValueError:
                    body = None
        except (ClientError, TimeoutError) as err:
            raise TomTomError(f"TomTom could not be reached: {err}") from err

        if status < 400:
            return body
        if status in (401, 403):
            raise TomTomAuthError("TomTom refused the API key")
        if status == 429:
            raise TomTomQuotaError("TomTom quota used up")
        code = _error_code(body)
        if code in _ROUTING_ERRORS:
            raise _ERROR_CLASSES[_ROUTING_ERRORS[code]](f"TomTom: {code}")
        if status == 400:
            raise TomTomParameterError(f"TomTom rejected the request: {body}")
        raise TomTomError(f"TomTom answered {status}: {body}")

    # --- the key ----------------------------------------------------------

    async def async_check_key(self) -> None:
        """Spend one reverse lookup to find out whether the key works at all -
        and whether it covers the search API, which the addresses need.
        Asked about a fixed point, TomTom's own front door in Amsterdam,
        rather than about this house: nothing here sends the home
        position to TomTom."""
        await self._call(REVERSE_URL.format(lat=52.3765, lon=4.9075), {}, PRODUCT_REVERSE_GEOCODING)

    # --- addresses --------------------------------------------------------

    async def async_geocode(self, text: str) -> tuple[float, float, str]:
        """The best match for an address: latitude, longitude and its label.
        Sent as typed and nothing else - no position of this house to
        bias the match, since the house is not TomTom's business; a street
        that exists in two towns wants its town typed."""
        params = {"limit": 1}
        body = await self._call(
            GEOCODE_URL.format(query=quote(text, safe="")), params, PRODUCT_GEOCODING
        )
        results = (body or {}).get("results") or []
        if not results:
            raise TomTomAddressNotFound(text)
        result = results[0]
        position = result.get("position") or {}
        label = (result.get("address") or {}).get("freeformAddress") or text
        return float(position["lat"]), float(position["lon"]), label

    async def async_search(self, text: str, language: str | None, limit: int = 5) -> list[dict]:
        """Suggestions while an address is typed: TomTom's fuzzy search with
        typeahead on, the best few, the world over - a route may well end
        abroad, and a country limit turned "Rue Leblanc, Paris" into streets
        at home. Not biased towards any position either: as with the
        geocoder, no position of this house goes to TomTom."""
        params = {"limit": limit, "typeahead": "true", "language": incident_language(language)}
        body = await self._call(SEARCH_URL.format(query=quote(text, safe="")), params, PRODUCT_SEARCH)
        out = []
        for result in (body or {}).get("results") or []:
            position = result.get("position") or {}
            address = (result.get("address") or {}).get("freeformAddress") or ""
            name = (result.get("poi") or {}).get("name") or ""
            label = f"{name}, {address}" if name and address and name not in address else (address or name)
            if "lat" not in position or "lon" not in position or not label:
                continue
            out.append({"label": label, "latitude": float(position["lat"]), "longitude": float(position["lon"])})
        return out

    # --- routes -----------------------------------------------------------

    async def async_route(self, points: list[tuple[float, float]]) -> dict:
        """The fastest route through the points right now, in the order given.

        Each route carries its points thinned out, its length and travel
        time, and what only live traffic can say: the delay, the time it
        would take without any, and the stretches traffic is slowing - each
        with TomTom's kind for it, its delay, the speed traffic is moving at
        there, and its own points, for a card to colour the route with.
        """
        if len(points) > MAX_POINTS:
            raise TomTomLimitExceeded(f"{len(points)} points, TomTom takes {MAX_POINTS}")
        path = ":".join(f"{lat:.6f},{lon:.6f}" for lat, lon in points)
        params = {
            "traffic": "true",
            "travelMode": "car",
            "routeType": "fastest",
            "computeTravelTimeFor": "all",
            "departAt": "now",
            "maxAlternatives": 0,
            "sectionType": "traffic",
        }
        body = await self._call(ROUTING_URL.format(points=path), params, PRODUCT_ROUTING)
        routes = (body or {}).get("routes") or []
        if not routes:
            raise TomTomNoRoute("empty answer")
        route = routes[0]
        coords = []
        for leg in route.get("legs") or []:
            for point in leg.get("points") or []:
                coord = (float(point["latitude"]), float(point["longitude"]))
                # Legs meet on a via point, which both carry - but a
                # section's point indexes count every point of every leg,
                # so the raw list keeps them for the sections below.
                coords.append(coord)
        summary = route.get("summary") or {}
        duration = summary.get("travelTimeInSeconds")
        free = summary.get("noTrafficTravelTimeInSeconds")
        reported = summary.get("trafficDelayInSeconds")
        # The delay is what the way costs beyond a free road: the travel
        # time less the one without traffic. TomTom's own figure counts
        # jams only - roadworks at a crawl put minutes on the time while it
        # says nought - and a driver loses the minutes whatever stands in
        # the road.
        delay = reported
        if duration is not None and free is not None:
            delay = max(int(reported or 0), int(duration) - int(free), 0)
        sections = []
        for section in route.get("sections") or []:
            if section.get("sectionType") != "TRAFFIC":
                continue
            try:
                start = int(section.get("startPointIndex"))
                end = int(section.get("endPointIndex"))
            except (TypeError, ValueError):
                continue
            piece = coords[start : end + 1]
            if len(piece) < 2:
                continue
            sections.append(
                {
                    "category": str(section.get("simpleCategory") or "OTHER"),
                    "delay": section.get("delayInSeconds"),
                    "magnitude": section.get("magnitudeOfDelay"),
                    "speed": section.get("effectiveSpeedInKmh"),
                    "event_id": str(section.get("eventId") or ""),
                    # The TPEG-TEC main causes: what an "OTHER" section is.
                    "causes": [
                        c.get("mainCauseCode")
                        for c in ((section.get("tec") or {}).get("causes") or [])
                        if isinstance(c, dict)
                    ],
                    "points": simplify(_dedupe(piece), SIMPLIFY_TOLERANCE_M),
                }
            )
        return {
            "points": simplify(_dedupe(coords), SIMPLIFY_TOLERANCE_M),
            "distance": summary.get("lengthInMeters"),
            "duration": duration,
            "delay": delay,
            "duration_no_traffic": free,
            "duration_historic": summary.get("historicTrafficTravelTimeInSeconds"),
            "sections": sections,
        }

    # --- incidents --------------------------------------------------------

    async def async_incidents(
        self, box: tuple[float, float, float, float], categories, language: str | None
    ) -> list[dict]:
        """The incidents inside a box - south, west, north, east - of the
        given categories (the API's numbers), as the API sends them, each
        a GeoJSON feature. Up to 10,000 km² a box; see boxes_for()."""
        south, west, north, east = box
        params = {
            "bbox": f"{west:.5f},{south:.5f},{east:.5f},{north:.5f}",
            "fields": INCIDENT_FIELDS,
            "language": incident_language(language),
            "timeValidityFilter": "present",
            "categoryFilter": ",".join(str(c) for c in sorted(set(categories))),
        }
        body = await self._call(INCIDENTS_URL, params, PRODUCT_INCIDENTS)
        incidents = (body or {}).get("incidents")
        return [i for i in incidents or [] if isinstance(i, dict)]

    async def async_incident_details(self, ids: list[str], language: str | None) -> list[dict | None]:
        """The incidents with these ids - the full ids, "TTI-<model>-<event>"
        - as the API sends them, one per id in the order asked, None for an
        id it does not know. At most five per request."""
        params = {
            "ids": ",".join(ids[:5]),
            "fields": INCIDENT_FIELDS,
            "language": incident_language(language),
        }
        body = await self._call(INCIDENTS_URL, params, PRODUCT_INCIDENTS)
        incidents = (body or {}).get("incidents") or []
        return [i if isinstance(i, dict) else None for i in incidents]

    # --- flow tiles -------------------------------------------------------

    async def async_flow_tile(self, style: str, z: int, x: int, y: int, entry_id: str | None = None) -> bytes:
        """One raster tile of the traffic flow, as PNG - counted on the
        entry whose card asked for it, where the card said."""
        return await self._call(
            FLOW_TILE_URL.format(style=style, z=z, x=x, y=y),
            {},
            PRODUCT_TILES,
            binary=True,
            entry_id=entry_id,
        )


class FlowTileCache:
    """The flow tiles fetched lately, so that the same view asked for twice
    within TILE_CACHE_SECONDS costs one request - see tiles.py.

    A fetch runs as a task of its own, shielded from the request that
    started it: a browser drops a tile request whenever the map moves on,
    which cancels the handler, and the tile - already charged by TomTom -
    should still land in the cache for the next request, and still answer
    a second card waiting for it. The task's outcome is read in every case,
    so a fetch nobody waits for any more cannot leave an exception that was
    "never retrieved" in the log.
    """

    def __init__(self) -> None:
        self._tiles: dict[tuple, tuple[float, bytes]] = {}
        self._pending: dict[tuple, asyncio.Task] = {}

    async def async_get(self, client: TomTomClient, style: str, z: int, x: int, y: int, entry_id: str | None = None) -> bytes:
        key = (style, z, x, y)
        hit = self._tiles.get(key)
        if hit and monotonic() - hit[0] < TILE_CACHE_SECONDS:
            return hit[1]
        # Two cards asking for the same tile at once: one request, both
        # answered from it.
        task = self._pending.get(key)
        if task is None:
            task = asyncio.get_running_loop().create_task(self._async_fetch(client, key, entry_id))
            self._pending[key] = task
            task.add_done_callback(lambda done, key=key: self._done(key, done))
        return await asyncio.shield(task)

    async def _async_fetch(self, client: TomTomClient, key: tuple, entry_id: str | None) -> bytes:
        style, z, x, y = key
        data = await client.async_flow_tile(style, z, x, y, entry_id)
        self._tiles[key] = (monotonic(), data)
        while len(self._tiles) > TILE_CACHE_SIZE:
            oldest = min(self._tiles, key=lambda k: self._tiles[k][0])
            del self._tiles[oldest]
        return data

    def _done(self, key: tuple, task: asyncio.Task) -> None:
        self._pending.pop(key, None)
        if not task.cancelled():
            task.exception()


# ---------------------------------------------------------------- geometry

def _dedupe(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    out: list[tuple[float, float]] = []
    for point in points:
        if not out or out[-1] != point:
            out.append(point)
    return out


def simplify(points: list[tuple[float, float]], tolerance_m: float) -> list[tuple[float, float]]:
    """Douglas-Peucker, in metres, without recursion.

    Iterative because a long route is thousands of points, and the recursive
    form is one Python frame per split. The projection is flat - metres per
    degree of longitude taken at the route's mean latitude - which is exact
    enough for a tolerance of metres over a route of kilometres.
    """
    if len(points) < 3:
        return list(points)
    k = cos(radians(sum(p[0] for p in points) / len(points)))

    def xy(p):
        return (p[1] * METERS_PER_DEGREE * k, p[0] * METERS_PER_DEGREE)

    projected = [xy(p) for p in points]
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        ax, ay = projected[first]
        bx, by = projected[last]
        dx, dy = bx - ax, by - ay
        length2 = dx * dx + dy * dy
        worst, index = 0.0, 0
        for i in range(first + 1, last):
            px, py = projected[i]
            t = ((px - ax) * dx + (py - ay) * dy) / length2 if length2 else 0.0
            t = max(0.0, min(1.0, t))
            dist = ((px - ax - t * dx) ** 2 + (py - ay - t * dy) ** 2) ** 0.5
            if dist > worst:
                worst, index = dist, i
        if worst > tolerance_m:
            keep[index] = True
            stack.append((first, index))
            stack.append((index, last))
    return [p for p, kept in zip(points, keep) if kept]



def box_around(latitude: float, longitude: float, radius_m: float) -> tuple[float, float, float, float]:
    """The box - south, west, north, east - that holds a circle of this
    radius: a degree of latitude is 111320 m, a degree of longitude that
    times the cosine of the latitude, floored so a point near a pole cannot
    divide by something arbitrarily close to zero."""
    lat_delta = radius_m / METERS_PER_DEGREE
    lon_delta = radius_m / (METERS_PER_DEGREE * max(cos(radians(latitude)), 0.01))
    return (latitude - lat_delta, longitude - lon_delta, latitude + lat_delta, longitude + lon_delta)


def box_area_km2(box: tuple[float, float, float, float]) -> float:
    south, west, north, east = box
    mid = radians((south + north) / 2)
    height = (north - south) * METERS_PER_DEGREE / 1000
    width = (east - west) * METERS_PER_DEGREE * max(cos(mid), 0.01) / 1000
    return max(0.0, height) * max(0.0, width)


def split_box(box: tuple[float, float, float, float], limit_km2: float = MAX_BOX_AREA_KM2) -> list[tuple]:
    """A box cut into pieces of at most `limit_km2` each, along its longer
    side - as few as will do. One box when it fits as it is."""
    area = box_area_km2(box)
    if area <= limit_km2:
        return [box]
    pieces = int(ceil(area / limit_km2))
    south, west, north, east = box
    out = []
    if (north - south) >= (east - west):
        step = (north - south) / pieces
        for i in range(pieces):
            out.append((south + i * step, west, south + (i + 1) * step, east))
    else:
        step = (east - west) / pieces
        for i in range(pieces):
            out.append((south, west + i * step, north, west + (i + 1) * step))
    # Cut one way only; a box that is large on both sides is cut again.
    if any(box_area_km2(piece) > limit_km2 for piece in out):
        return [part for piece in out for part in split_box(piece, limit_km2)]
    return out



def encode_polyline(points: list[tuple[float, float]], precision: int = 5) -> str:
    """Google's encoded polyline format - the shape the card decodes."""
    factor = 10 ** precision
    out = []
    last_lat = last_lon = 0
    for lat, lon in points:
        ilat, ilon = int(round(lat * factor)), int(round(lon * factor))
        for delta in (ilat - last_lat, ilon - last_lon):
            value = ~(delta << 1) if delta < 0 else delta << 1
            while value >= 0x20:
                out.append(chr((0x20 | (value & 0x1F)) + 63))
                value >>= 5
            out.append(chr(value + 63))
        last_lat, last_lon = ilat, ilon
    return "".join(out)


def incident_item(raw: dict) -> dict | None:
    """One incident the way everything here reads it, out of the feature
    Incident Details sends - or None for one in a shape this does not know.

    Position is the first point of its line, which is where the incident
    starts in the direction of travel - what "from" names; the end and the
    whole line come along for the map.
    """
    properties = raw.get("properties") or {}
    geometry = raw.get("geometry") or {}
    coords = geometry.get("coordinates")
    points: list[tuple[float, float]] = []
    try:
        if geometry.get("type") == "Point":
            points = [(float(coords[1]), float(coords[0]))]
        elif geometry.get("type") == "LineString":
            points = [(float(c[1]), float(c[0])) for c in coords or []]
    except (TypeError, ValueError, IndexError):
        return None
    if not points:
        return None
    incident_id = str(properties.get("id") or "")
    if not incident_id:
        return None
    try:
        category = int(properties.get("iconCategory"))
    except (TypeError, ValueError):
        category = 0
    if category not in TOMTOM_CATEGORIES.values():
        category = 0
    events = [
        {
            "code": event.get("code"),
            "description": str(event.get("description") or ""),
            "category": event.get("iconCategory"),
        }
        for event in properties.get("events") or []
        if isinstance(event, dict)
    ]
    roads = [str(r) for r in properties.get("roadNumbers") or [] if r]
    return {
        "id": incident_id,
        # The tail of the id is what a route section names as its event.
        "short_id": incident_id.rsplit("-", 1)[-1],
        "category": category,
        "lat": points[0][0],
        "lng": points[0][1],
        "end_lat": points[-1][0],
        "end_lng": points[-1][1],
        "points": points,
        "polyline": encode_polyline(points) if len(points) > 1 else "",
        "magnitude": properties.get("magnitudeOfDelay"),
        "delay": properties.get("delay"),
        "length": properties.get("length"),
        "from": str(properties.get("from") or ""),
        "to": str(properties.get("to") or ""),
        "roads": roads,
        "start": str(properties.get("startTime") or ""),
        "end": str(properties.get("endTime") or ""),
        "probability": str(properties.get("probabilityOfOccurrence") or ""),
        "reports": properties.get("numberOfReports"),
        "last_report": str(properties.get("lastReportTime") or ""),
        "events": events,
        "description": "; ".join(
            dict.fromkeys(e["description"] for e in events if e["description"])
        ),
    }


# ----------------------------------------------------------------- details

# What a route's reports are first known by - the event id its traffic
# sections name - and what Incident Details knows them by: the event id
# behind a prefix that names TomTom's traffic model, "TTI-<uuid>-". The
# prefix is read off every Details answer and kept, so a route in another
# model's region learns its own; this one is Europe's as measured in
# October 2026, for the first route before any answer has been seen.
DEFAULT_ID_PREFIX = "TTI-ea156dbf-afea-4f87-ae84-c8e8c732be1e-"

DETAILS_STORE_KEY = f"{DOMAIN}.details"
DETAILS_STORE_VERSION = 1
_DETAILS_DATA_KEY = f"{DOMAIN}_details"
# How long a report's details are kept after it was last seen on a route,
# and how many at most: a commute sees a few dozen a week.
DETAILS_KEEP_DAYS = 14
DETAILS_MAX = 3000
# How many Details requests one poll may spend on lookups: five ids each,
# so twenty reports' worth. What is left waits for the next poll.
DETAILS_PER_POLL = 4



def id_tail(full_id: str) -> str:
    """The part of a TomTom incident id that names the incident: what a
    route's traffic section calls it, after the prefix of the source."""
    return str(full_id).rpartition("-")[2]


def id_prefix(full_id: str) -> str:
    head, sep, _tail = str(full_id).rpartition("-")
    return head + "-" if sep and head else ""


class DetailsCache:
    """What Incident Details said about a report, by the tail of its id,
    kept so that a report on a route costs one lookup in its life rather
    than one per poll - and the moment each was first seen, which is what
    "new" means for a report the sections name without a time.

    An id's prefix names the source TomTom took the incident from, and it
    differs between regions - a Berlin route and a New York area are not
    the same source. Every prefix seen is kept, the one that answered last
    for an entry is tried first for it, and the others after, so a lookup
    does not fail for the prefix another entry taught."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass
        self._store = Store(hass, DETAILS_STORE_VERSION, DETAILS_STORE_KEY, atomic_writes=True)
        self._lock = asyncio.Lock()
        self._loaded = False
        self.prefixes: list[str] = [DEFAULT_ID_PREFIX]
        self.entry_prefix: dict[str, str] = {}
        self.items: dict[str, dict] = {}

    @property
    def prefix(self) -> str:
        return self.prefixes[0]

    async def async_load(self) -> None:
        async with self._lock:
            if self._loaded:
                return
            data = await self._store.async_load() or {}
            prefixes = [str(p) for p in (data.get("prefixes") or []) if p]
            if data.get("prefix") and str(data["prefix"]) not in prefixes:
                prefixes.insert(0, str(data["prefix"]))
            if DEFAULT_ID_PREFIX not in prefixes:
                prefixes.append(DEFAULT_ID_PREFIX)
            self.prefixes = prefixes
            self.entry_prefix = {str(k): str(v) for k, v in (data.get("entry_prefix") or {}).items()}
            items: dict[str, dict] = {}
            for key, value in (data.get("items") or {}).items():
                if not isinstance(value, dict):
                    continue
                # Filed by the tail; an older file filed by the full id is
                # re-filed, and what it had asked for in vain is asked again.
                tail = id_tail(key)
                if value.get("details") is None:
                    value.pop("asked", None)
                    value.pop("asked_lang", None)
                items[tail] = value
            self.items = items
            self._loaded = True

    def _save(self) -> None:
        self._store.async_delay_save(
            lambda: {"prefixes": self.prefixes, "entry_prefix": self.entry_prefix, "items": self.items}, 10
        )

    def learn_prefix(self, full_id: str, entry_id: str | None = None) -> None:
        """The prefix off any full id Details answered with - the newest
        first, and remembered for the entry it answered."""
        prefix = id_prefix(full_id)
        if not prefix:
            return
        changed = False
        if prefix in self.prefixes:
            if self.prefixes[0] != prefix:
                self.prefixes.remove(prefix)
                self.prefixes.insert(0, prefix)
                changed = True
        else:
            self.prefixes.insert(0, prefix)
            changed = True
        if entry_id and self.entry_prefix.get(entry_id) != prefix:
            self.entry_prefix[entry_id] = prefix
            changed = True
        if changed:
            self._save()

    def prefix_for(self, entry_id: str | None) -> str:
        """The prefix that answered for this entry last, else the newest."""
        return self.entry_prefix.get(entry_id or "") or self.prefixes[0]

    def candidates(self, entry_id: str | None) -> list[str]:
        """The prefixes to try for an entry, its own first."""
        first = self.prefix_for(entry_id)
        return [first, *[p for p in self.prefixes if p != first]]

    def get(self, tail: str) -> dict | None:
        return self.items.get(tail)

    def details(self, tail: str) -> dict | None:
        """What Details said about this report, in whatever language it
        was asked - shown until an answer in the instance's language has
        replaced it (see needs_lookup)."""
        return (self.items.get(tail) or {}).get("details")

    def needs_lookup(self, tail: str, language: str, today: str) -> bool:
        """Whether to ask Details about this report now: nothing known yet,
        or known in another language - and not asked in this language
        today, so an id TomTom does not answer costs one request a day."""
        item = self.items.get(tail) or {}
        if item.get("details") is not None and item.get("lang") == language:
            return False
        return not (str(item.get("asked") or "")[:10] == today and item.get("asked_lang") == language)

    def first_seen(self, tail: str, now_iso: str) -> str:
        """When this report was first seen by any route - set now if never."""
        item = self.items.setdefault(tail, {})
        if not item.get("first_seen"):
            item["first_seen"] = now_iso
        item["seen"] = now_iso
        return item["first_seen"]

    def put(self, tail: str, details: dict | None, now_iso: str, language: str) -> None:
        """What Details said, and in which language - or that it said
        nothing, which leaves whatever was known as it was and only notes
        the asking, so the id is not asked for again this day."""
        item = self.items.setdefault(tail, {})
        item["seen"] = now_iso
        item["asked"] = now_iso
        item["asked_lang"] = language
        if details is not None:
            item["details"] = details
            item["lang"] = language
        self._prune(now_iso)
        self._save()

    def _prune(self, now_iso: str) -> None:
        cutoff = now_iso[:10]
        try:
            from datetime import date, timedelta  # noqa: PLC0415

            cutoff = (date.fromisoformat(now_iso[:10]) - timedelta(days=DETAILS_KEEP_DAYS)).isoformat()
        except ValueError:
            pass
        stale = [k for k, v in self.items.items() if str(v.get("seen") or "")[:10] < cutoff]
        for k in stale:
            del self.items[k]
        if len(self.items) > DETAILS_MAX:
            oldest = sorted(self.items, key=lambda k: str(self.items[k].get("seen") or ""))
            for k in oldest[: len(self.items) - DETAILS_MAX]:
                del self.items[k]


async def async_get_details_cache(hass: HomeAssistant) -> DetailsCache:
    cache = hass.data.get(_DETAILS_DATA_KEY)
    if cache is None:
        cache = hass.data[_DETAILS_DATA_KEY] = DetailsCache(hass)
    await cache.async_load()
    return cache


def section_category(section: dict) -> int:
    """The category a route's traffic section stands for: its own kind, or
    for "OTHER" the one its first TPEG-TEC cause names."""
    kind = str(section.get("category") or "")
    if kind in SECTION_CATEGORIES:
        return SECTION_CATEGORIES[kind]
    for cause in section.get("causes") or []:
        code = CAUSE_CATEGORIES.get(cause)
        if code is not None:
            return code
    return 0


def section_item(section: dict, prefix: str) -> dict | None:
    """A route's traffic section as a report, the way incident_item shapes
    one: what the section itself says - where it runs, what kind, how much
    it costs - with room for what Details adds later."""
    event = str(section.get("event_id") or "")
    points = [(float(lat), float(lon)) for lat, lon in section.get("points") or []]
    if not event or not points:
        return None
    delay = section.get("delay")
    return {
        "id": prefix + event,
        "short_id": event,
        "category": section_category(section),
        "lat": points[0][0],
        "lng": points[0][1],
        "end_lat": points[-1][0],
        "end_lng": points[-1][1],
        "points": points,
        "polyline": encode_polyline(points) if len(points) > 1 else "",
        "magnitude": section.get("magnitude"),
        "delay": delay,
        "length": None,
        "from": "",
        "to": "",
        "roads": [],
        "start": "",
        "end": "",
        "probability": "",
        "reports": None,
        "last_report": "",
        "events": [],
        "description": "",
        "speed": section.get("speed"),
    }


def merge_details(item: dict, details: dict) -> dict:
    """A section's report with what Incident Details knows about it: the
    whole stretch, its names, its times, TomTom's wording. The section's
    delay stays - it is the one measured on the route right now."""
    full = incident_item(details)
    if full is None:
        return item
    merged = {**full, **{k: item[k] for k in ("id", "short_id", "speed") if k in item}}
    merged["delay"] = item.get("delay") if item.get("delay") is not None else full.get("delay")
    merged["magnitude"] = item.get("magnitude") if item.get("magnitude") is not None else full.get("magnitude")
    if full.get("category") == 0 and item.get("category"):
        merged["category"] = item["category"]
    return merged
