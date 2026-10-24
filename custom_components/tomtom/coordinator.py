"""One poll of TomTom per entry: the reports inside its search, filtered
and in order - and, for a live route, the route itself as the traffic
makes it right now, with the reports it runs through."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import logging
from time import monotonic

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import CONF_COUNT, CONF_LOCATION, CONF_NAME
from homeassistant.core import HomeAssistant
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util
from homeassistant.util import location as location_util

from .api import (
    async_get_usage,
    DETAILS_PER_POLL,
    TomTomAuthError,
    TomTomClient,
    TomTomError,
    async_get_details_cache,
    id_tail,
    async_load_key,
    box_around,
    incident_item,
    incident_language,
    merge_details,
    section_item,
    split_box,
)
from .const import (
    CATEGORIES,
    SOURCE_CATEGORIES,
    TOMTOM_CATEGORIES,
    CATEGORY_KEYS,
    CATEGORY_LABELS,
    CATEGORY_DEFAULTS,
    CERTAIN_PROBABILITIES,
    CONF_BLACKLIST,
    CONF_CATEGORIES,
    CONF_LIVE_DAYS,
    CONF_LIVE_FROM,
    CONF_LIVE_UNTIL,
    CONF_NEW_MINUTES,
    CONF_ONLY_CERTAIN,
    CONF_ROADS,
    CONF_ROUTE_DESTINATION,
    CONF_ROUTE_START,
    CONF_ROUTE_VIAS,
    CONF_SEARCH_MODE,
    CONF_TRACKER,
    CONF_TRACKER_RADIUS,
    CONF_UPDATE_INTERVAL,
    CONF_WAYPOINTS,
    DEFAULT_COUNT,
    DEFAULT_NEW_MINUTES,
    DEFAULT_TRACKER_RADIUS,
    DEFAULT_UPDATE_INTERVAL,
    DOMAIN,
    EVENT_ROUTE_CHANGED,
    LIVE_DAYS,
    MAGNITUDE_KEYS,
    MAGNITUDE_LABELS,
    SEARCH_MODE_AREA,
    SEARCH_MODE_ROUTE_LIVE,
    SEARCH_MODE_TRACKER,
    UPDATE_INTERVAL_MANUAL,
    tracker_position,
)
from .route_match import RouteLine
from .sources import SourceError, enabled_sources, merge_sources

_LOGGER = logging.getLogger(__name__)

# Polls that must fail in a row before a repair is raised. Three: at the
# default hour apart, a tracker that lost its fix is back before this; one
# whose entity is gone, a key that stopped working, or a TomTom that is
# down, is not.
FAILURES_FOR_REPAIR = 3

# The coordinator's timer can fire a fraction of a second early. Without a
# little slack, a fetch landing at 3599.98 s would be judged "not due".
DUE_TOLERANCE_SECONDS = 5

# The device models, by search mode - what the card reads for the line
# under its title, and what tells it a route from a radius.
MODELS = {
    SEARCH_MODE_AREA: "Radius",
    SEARCH_MODE_TRACKER: "Tracker",
    SEARCH_MODE_ROUTE_LIVE: "Route",
}


def category_key(item: dict) -> str:
    return CATEGORY_KEYS.get(item.get("category"), "unknown")


def _in_language(entry: dict, language: str | None) -> str:
    """A label in the given language: by its full code first ("zh-Hant",
    "pt-BR"), then by its first two letters, English for a language this
    has no wording for."""
    code = str(language or "en")
    return entry.get(code) or entry.get(code[:2].lower()) or entry["en"]


def category_label(item: dict, language: str | None = None) -> str:
    """What the category is called, in the given language."""
    entry = CATEGORY_LABELS.get(category_key(item)) or CATEGORY_LABELS["unknown"]
    return _in_language(entry, language)


def magnitude_key(item: dict) -> str:
    try:
        return MAGNITUDE_KEYS.get(int(item.get("magnitude")), "unknown")
    except (TypeError, ValueError):
        return "unknown"


def magnitude_label(item: dict, language: str | None = None) -> str:
    entry = MAGNITUDE_LABELS.get(magnitude_key(item)) or MAGNITUDE_LABELS["unknown"]
    if not entry.get("en"):
        return ""
    return _in_language(entry, language)


def _comma_set(raw, upper: bool = False) -> set[str]:
    """Split one of the comma-separated options into a set of entries."""
    if raw in (None, ""):
        return set()
    return {
        part.strip().upper().replace(" ", "") if upper else part.strip()
        for part in str(raw).split(",")
        if part.strip()
    }


@dataclass
class TomTomData:
    """What a poll brought: the reports, filtered and in order."""

    reports: list = field(default_factory=list)


class TomTomCoordinator(DataUpdateCoordinator):
    """One entry's poll."""

    data: TomTomData

    def __init__(self, hass: HomeAssistant, config_entry: ConfigEntry) -> None:
        data = config_entry.data
        self.displayname = data[CONF_NAME]
        # What every entity of this entry is identified by: the entry id,
        # which never changes - a renamed entry keeps its entities.
        self.entry_id = config_entry.entry_id
        self.entry = config_entry
        self._failures = 0
        # What that data looked like when this coordinator last read it -
        # see absorb_window() for what the comparison is for.
        self._entry_data = deepcopy(dict(data))
        self.search_mode = data.get(CONF_SEARCH_MODE, SEARCH_MODE_AREA)
        self.tracker_entity = None
        self.tracker_radius = DEFAULT_TRACKER_RADIUS
        self.location = None
        self.waypoints: list = []
        self._route_line = None
        # A live route as the traffic of the moment makes it, replacing the
        # stored one on every poll (see _refresh_live_route): its travel
        # time, delay, length and sections under self.live, and when the
        # fastest way last became a different one.
        self.live: dict | None = None
        self.route_changed_at: datetime | None = None
        self._route_signature = None
        # Whether a pass has ever tried to reach TomTom: a live route
        # outside its hours, or an entry set to manual only, polls nothing
        # on purpose, which setup must not take for a server not answering.
        self.attempted_fetch = False
        self.connected = False
        if self.is_live:
            self.waypoints = list(data.get(CONF_WAYPOINTS) or [])
            if self.waypoints:
                self._route_line = RouteLine([(p["latitude"], p["longitude"]) for p in self.waypoints])
        elif self.search_mode == SEARCH_MODE_TRACKER:
            self.tracker_entity = data[CONF_TRACKER]
            self.tracker_radius = int(data.get(CONF_TRACKER_RADIUS, DEFAULT_TRACKER_RADIUS))
        else:
            self.location = dict(data[CONF_LOCATION])
        # The route's own line, point by point: the stored one until the
        # live one arrives, then that - what a further source is asked
        # along. Not the ends: a corridor between start and destination
        # as the crow flies runs through fields the road never sees.
        self._route_points: list[tuple[float, float]] = [(p["latitude"], p["longitude"]) for p in self.waypoints]

        # Which kinds this entry reports.
        raw = data.get(CONF_CATEGORIES) or {}
        self.kinds = {key: bool(raw.get(key, default)) for key, default in CATEGORY_DEFAULTS.items()}
        self.count = int(data.get(CONF_COUNT, DEFAULT_COUNT))
        # Comma-separated road numbers, compared without case or spaces -
        # "A 8" and "a8" are TomTom's "A8"; and incident ids to leave out.
        self.roads = _comma_set(data.get(CONF_ROADS), upper=True)
        self.blacklist = _comma_set(data.get(CONF_BLACKLIST))
        self.only_certain = bool(data.get(CONF_ONLY_CERTAIN, True))
        self.update_minutes = int(data.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL))
        self.new_minutes = int(data.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES))

        # The categories asked of TomTom: every switched-on one of its own,
        # in one request. None at all means TomTom is not asked.
        self.categories = [code for key, code in TOMTOM_CATEGORIES.items() if self.kinds.get(key)]
        # What the last successful ask of a further source brought: kept
        # while the source does not answer, so its reports do not flicker
        # with its reachability.
        self._source_items: dict[str, list[dict]] = {}
        self._source_failed: set[str] = set()
        # What TomTom's last poll brought, and what the sources last brought
        # after this entry's filters - the two halves of the data, joined
        # whenever either changes. The sources are asked in a task of their
        # own after each poll; see _refresh_sources.
        self._tomtom_items: list[dict] = []
        self._source_reports: list[dict] = []
        self._sources_task: asyncio.Task | None = None

        polls = self.update_minutes != UPDATE_INTERVAL_MANUAL and (self.categories or self.is_live or self._wants_source())
        update_interval = timedelta(minutes=self.update_minutes) if polls else None

        # One device per entry, which every one of its entities belongs to.
        # The search mode goes in the model field, which the card reads.
        self.device_info = DeviceInfo(
            identifiers={(DOMAIN, config_entry.entry_id)},
            name=self.displayname,
            manufacturer="TomTom",
            model=MODELS.get(self.search_mode, "Radius"),
            entry_type=DeviceEntryType.SERVICE,
        )

        self._last_fetch: float | None = None
        self.last_update: datetime | None = None
        # The first pass fetches whatever the interval and a live route's
        # hours say: a new entry should show something right away, and a
        # restart should not leave it empty until its hours come round.
        self._forced = True
        self._client: TomTomClient | None = None
        # Reports TomTom has handed back since the entry was set up, before
        # this entry's own filters thin them out.
        self.item_count = 0

        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN} ({config_entry.unique_id or self.displayname})",
            update_method=self.async_update_data,
            update_interval=update_interval,
        )

    # --- settings ---------------------------------------------------------

    def absorb_window(self, config_entry: ConfigEntry) -> bool:
        """Take on a changed "new" window without a reload, when that is all
        that changed - it is settable from the device page one step at a
        time, and a reload for each step would tear down every entity and
        spend a request for a number that changes nothing fetched."""
        old, new = self._entry_data, deepcopy(dict(config_entry.data))

        def rest(data):
            return {k: v for k, v in data.items() if k != CONF_NEW_MINUTES}

        if rest(old) != rest(new):
            return False
        self._entry_data = new
        self.entry = config_entry
        self.new_minutes = int(new.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES))
        self.async_update_listeners()
        return True

    @property
    def repair_issue_id(self) -> str:
        return f"entry_failing_{self.entry_id}"

    @property
    def is_live(self) -> bool:
        return self.search_mode == SEARCH_MODE_ROUTE_LIVE

    async def async_refresh_all(self) -> None:
        """Fetch right now, whatever the interval and the hours say."""
        self._forced = True
        await self.async_refresh()

    async def client(self) -> TomTomClient:
        """The client, with the installation's key."""
        if self._client is None:
            key = await async_load_key(self.hass)
            self._client = TomTomClient(self.hass, key, self.entry_id)
        return self._client

    # --- the poll ---------------------------------------------------------

    def _is_due(self) -> bool:
        if self._forced:
            return True
        if self.update_minutes == UPDATE_INTERVAL_MANUAL:
            return False
        if self._last_fetch is None:
            return True
        return monotonic() - self._last_fetch >= self.update_minutes * 60 - DUE_TOLERANCE_SECONDS

    async def async_update_data(self):
        try:
            data = await self._update()
        except UpdateFailed as err:
            self._failures += 1
            if self._failures == FAILURES_FOR_REPAIR:
                ir.async_create_issue(
                    self.hass,
                    DOMAIN,
                    self.repair_issue_id,
                    is_fixable=False,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key="entry_failing",
                    translation_placeholders={
                        "name": self.displayname,
                        "count": str(self._failures),
                        "reason": str(err),
                    },
                )
            raise
        if self._failures >= FAILURES_FOR_REPAIR:
            ir.async_delete_issue(self.hass, DOMAIN, self.repair_issue_id)
        self._failures = 0
        return data

    async def _update(self) -> TomTomData:
        previous = self.data
        forced = self._forced
        self._forced = False
        if not self._is_due() and not forced:
            return previous or TomTomData()
        if not self.categories and not self.is_live and not self._source_on():
            return previous or TomTomData()
        # A live route: outside the hours set for it nothing polls at all -
        # the refresh action excepted - and inside them the route of the
        # moment is the whole of the poll: its sections are its reports.
        if self.is_live and not forced and not self._in_live_window(dt_util.now()):
            _LOGGER.debug("%s: outside its hours, nothing polled", self.displayname)
            return previous or TomTomData()
        self.attempted_fetch = True
        try:
            if self.is_live:
                await self._refresh_live_route()
                items = await self._route_reports()
            else:
                self._resolve_centre()
                items = await self._fetch_box()
        except TomTomAuthError as err:
            raise UpdateFailed(f"TomTom refused the key: {err}") from err
        except TomTomError as err:
            raise UpdateFailed(f"Error communicating with TomTom: {err}") from err
        self.connected = True
        self._last_fetch = monotonic()
        self.last_update = dt_util.now()
        _LOGGER.debug("%s: %d reports", self.displayname, len(items))
        self._tomtom_items = items
        if self._wants_source() and self._source_on():
            if self._sources_task is None or self._sources_task.done():
                self._sources_task = self.hass.async_create_task(self._refresh_sources())
        else:
            self._source_reports = []
        return TomTomData(reports=self._with_sources(items))

    def _with_sources(self, items: list[dict]) -> list[dict]:
        """TomTom's reports and the sources' together, nearest first - each
        side already filtered and measured by this entry."""
        if not self._source_reports:
            return items
        seen = {item["id"] for item in items}
        joined = items + [item for item in self._source_reports if item["id"] not in seen]
        joined.sort(key=lambda i: i.get("distance_m") if i.get("distance_m") is not None else float("inf"))
        return joined

    async def _refresh_sources(self) -> None:
        """Asks the further sources and, once they have answered, puts
        their reports beside TomTom's - through this entry's own filters,
        and inside its circle where it has one."""
        try:
            raw = await self._from_source()
            reports = self._filter(raw)
            if not self.is_live and self.location:
                reports = await self.hass.async_add_executor_job(self._within_circle, reports)
        except Exception as err:  # noqa: BLE001 - a source must never take the entry down
            _LOGGER.warning("%s: the further sources failed: %s", self.displayname, err)
            return
        self._source_reports = reports
        self.async_set_updated_data(TomTomData(reports=self._with_sources(self._tomtom_items)))

    def _in_live_window(self, now: datetime) -> bool:
        data = self.entry.data
        days = data.get(CONF_LIVE_DAYS) or []
        if days and LIVE_DAYS[now.weekday()] not in days:
            return False
        start, end = data.get(CONF_LIVE_FROM) or "", data.get(CONF_LIVE_UNTIL) or ""
        if not start or not end or start == end:
            return True
        try:
            minutes = lambda text: int(text[:2]) * 60 + int(text[3:5])  # noqa: E731
            begin, finish, current = minutes(start), minutes(end), now.hour * 60 + now.minute
        except (TypeError, ValueError):
            return True
        if begin < finish:
            return begin <= current < finish
        return current >= begin or current < finish

    def _live_points(self) -> list[tuple[float, float]]:
        data = self.entry.data
        ends = [data.get(CONF_ROUTE_START) or {}, *(data.get(CONF_ROUTE_VIAS) or []), data.get(CONF_ROUTE_DESTINATION) or {}]
        return [(float(p["latitude"]), float(p["longitude"])) for p in ends if p.get("latitude") is not None]

    async def _refresh_live_route(self) -> None:
        """Ask TomTom for the route as the traffic makes it right now. A
        failed request raises, so the poll fails as a whole: without the
        route there are no sections, and so no reports to show."""
        points = self._live_points()
        if len(points) < 2:
            raise TomTomError("the route has no ends")
        route = await (await self.client()).async_route(points)
        now = dt_util.now()
        self.live = {
            "duration": route.get("duration"),
            "delay": route.get("delay"),
            "duration_no_traffic": route.get("duration_no_traffic"),
            "duration_historic": route.get("duration_historic"),
            "distance": route.get("distance"),
            "sections": route.get("sections") or [],
            "at": now,
            "error": None,
        }
        signature = tuple((round(lat, 4), round(lon, 4)) for lat, lon in route["points"])
        if signature == self._route_signature:
            return
        first = self._route_signature is None
        self._route_signature = signature
        self.waypoints = [{"latitude": lat, "longitude": lon} for lat, lon in route["points"]]
        self._route_line = RouteLine(route["points"])
        self._route_points = [(float(lat), float(lon)) for lat, lon in route["points"]]
        self.route_changed_at = now
        if first:
            return
        self.hass.bus.async_fire(
            EVENT_ROUTE_CHANGED,
            {
                "config_entry_id": self.entry_id,
                "area": self.displayname,
                "distance": route.get("distance"),
                "duration": route.get("duration"),
                "delay": route.get("delay"),
            },
        )

    async def _route_reports(self) -> list[dict]:
        """A live route's reports: its traffic sections, each the report of
        what the route runs through there, with what Incident Details knows
        about it - looked up once per report, a few per poll, and kept.

        The sections carry the measured delay and the stretch on the route;
        Details adds the whole stretch, where it starts and ends, TomTom's
        wording, when it began and until when it lasts. A report whose
        lookup has not come round yet, or one Details does not know, shows
        what the section says."""
        cache = await async_get_details_cache(self.hass)
        now = dt_util.now()
        now_iso = now.isoformat()
        today = now_iso[:10]
        items: list[dict] = []
        seen: set[str] = set()
        for section in (self.live or {}).get("sections") or []:
            item = section_item(section, cache.prefix_for(self.entry_id))
            if item is None or item["short_id"] in seen:
                continue
            seen.add(item["short_id"])
            item["first_seen"] = cache.first_seen(item["short_id"], now_iso)
            items.append(item)
        self.item_count += len(items)
        # The lookups: the reports not yet asked about today, a few at a
        # time, nearest the start first - what a driver meets first.
        items.sort(key=lambda i: self._route_line.nearest((i["lat"], i["lng"]))[1] if self._route_line else 0)
        language = self.hass.config.language
        lang = incident_language(language)
        wanted = [i for i in items if cache.needs_lookup(i["short_id"], lang, today)]
        client = await self.client()
        requests = 0
        for start in range(0, min(len(wanted), DETAILS_PER_POLL * 5), 5):
            pending = wanted[start : start + 5]
            # Under the entry's own prefix first; what that finds nothing
            # for is asked again under the other prefixes seen - a route
            # near another source than the last answer came from.
            for prefix in cache.candidates(self.entry_id):
                if not pending or requests >= DETAILS_PER_POLL * 2:
                    break
                requests += 1
                answers = await client.async_incident_details([prefix + i["short_id"] for i in pending], language)
                # Matched by the id TomTom names, not by position: an id it
                # does not know may be left out rather than answered with
                # null.
                by_tail = {}
                for answer in answers:
                    if answer:
                        full = str((answer.get("properties") or {}).get("id") or "")
                        if full:
                            cache.learn_prefix(full, self.entry_id)
                            by_tail[id_tail(full)] = answer
                for item in pending:
                    if item["short_id"] in by_tail:
                        cache.put(item["short_id"], by_tail[item["short_id"]], now_iso, lang)
                pending = [i for i in pending if i["short_id"] not in by_tail]
            for item in pending:
                cache.put(item["short_id"], None, now_iso, lang)
        merged = []
        for item in items:
            details = cache.details(item["short_id"])
            merged.append(merge_details(item, details) if details else item)
            merged[-1]["first_seen"] = item["first_seen"]
        return self._filter(merged)

    # --- further sources ------------------------------------------------

    def _wants_source(self) -> bool:
        """Whether a kind is on that a further source answers - one of the
        seven that are theirs."""
        return any(self.kinds.get(kind) for kind in SOURCE_CATEGORIES)

    def _source_on(self) -> bool:
        """Whether a further source is switched on under TomTom Settings,
        and this entry has a kind it could answer."""
        return self._wants_source() and bool(enabled_sources(self.hass, None))

    async def _from_source(self) -> list[dict]:
        """The reports the further sources add - for the circle, or along
        the live route. A source that does not answer costs TomTom's poll
        nothing: what it last brought stays, and the log says so once."""
        if not self._wants_source():
            self._source_items = {}
            return []
        # The reports of a source are already measured by the entry when
        # they come back - a route's by the corridor, an area's by the
        # circle after - so TomTom's own filters below see them whole.
        sources = enabled_sources(self.hass, await async_get_usage(self.hass))
        for gone in set(self._source_items) - {source.key for source in sources}:
            self._source_items.pop(gone, None)
        language = self.hass.config.language
        found: list[dict] = []
        for source in sources:
            try:
                if self.is_live:
                    items = await source.fetch_route(self.entry_id, self._route_points, self.kinds, language)
                elif self.location:
                    items = await source.fetch_area(
                        self.entry_id,
                        float(self.location["latitude"]),
                        float(self.location["longitude"]),
                        float(self.location.get("radius") or 1000),
                        self.kinds,
                        language,
                    )
                else:
                    items = []
            except SourceError as err:
                if source.key not in self._source_failed:
                    _LOGGER.warning("%s: %s - keeping what it last brought", self.displayname, err)
                self._source_failed.add(source.key)
                found.extend(self._source_items.get(source.key, []))
                continue
            if source.key in self._source_failed:
                _LOGGER.info("%s: %s answers again", self.displayname, source.key)
                self._source_failed.discard(source.key)
            self.item_count += len(items)
            self._source_items[source.key] = items
            found.extend(items)
        return merge_sources(found)

    def _resolve_centre(self) -> None:
        """In tracker mode, put the tracker's current position into
        self.location - the same shape the area mode stores."""
        if self.search_mode != SEARCH_MODE_TRACKER:
            return
        state = self.hass.states.get(self.tracker_entity)
        if state is None:
            raise UpdateFailed(
                f"{self.tracker_entity} does not exist (any more) - pick another "
                f"tracker in this entry's options"
            )
        position = tracker_position(state)
        if position is None:
            raise UpdateFailed(
                f"{self.tracker_entity} reports no usable position "
                f"({state.state}) - only a tracker with coordinates can "
                f"centre a radius"
            )
        self.location = {"latitude": position[0], "longitude": position[1], "radius": self.tracker_radius}

    def _boxes(self) -> list[tuple]:
        """The boxes TomTom is asked for: one around the circle, cut up if
        it is too large."""
        if not self.location:
            return []
        return split_box(
            box_around(
                float(self.location["latitude"]),
                float(self.location["longitude"]),
                float(self.location.get("radius") or 1000),
            )
        )

    async def _fetch_box(self) -> list[dict]:
        """An area's or a tracker's reports: Incident Details for the box."""
        client = await self.client()
        cache = await async_get_details_cache(self.hass)
        language = self.hass.config.language
        found: list[dict] = []
        seen: set[str] = set()
        for box in self._boxes() if self.categories else []:
            for raw in await client.async_incidents(box, self.categories, language):
                item = incident_item(raw)
                if item is None or item["id"] in seen:
                    continue
                cache.learn_prefix(item["id"], self.entry_id)
                seen.add(item["id"])
                found.append(item)
        self.item_count += len(found)
        items = self._filter(found)
        return await self.hass.async_add_executor_job(self._within_circle, items)

    def _filter(self, items: list[dict]) -> list[dict]:
        kept = []
        for item in items:
            if not self.kinds.get(category_key(item), True):
                continue
            if self.only_certain and item.get("probability") and item["probability"] not in CERTAIN_PROBABILITIES:
                continue
            if self.roads:
                roads = {r.upper().replace(" ", "") for r in item.get("roads") or []}
                if not roads & self.roads:
                    continue
            if self.blacklist and (item["id"] in self.blacklist or item["short_id"] in self.blacklist):
                continue
            kept.append(item)
        if self._route_line is not None:
            for item in kept:
                item["distance_m"] = self._route_line.nearest((item["lat"], item["lng"]))[1]
            kept.sort(key=lambda i: i["distance_m"])
        return kept

    def _within_circle(self, items: list[dict]) -> list[dict]:
        """Only what lies inside the circle, nearest first - a box holds
        its corners too. Geometry over hundreds of items, so called in the
        executor."""
        if not self.location:
            return items
        lat0, lon0 = float(self.location["latitude"]), float(self.location["longitude"])
        radius = float(self.location.get("radius") or 1000)
        kept = []
        for item in items:
            nearest = min(
                location_util.distance(lat0, lon0, p[0], p[1]) or 0.0
                for p in _sampled(item["points"])
            )
            if nearest <= radius:
                item["distance_m"] = location_util.distance(lat0, lon0, item["lat"], item["lng"]) or 0.0
                kept.append(item)
        return sorted(kept, key=lambda i: i["distance_m"])

    # --- for the entities --------------------------------------------------

    def report_distance(self, lat: float, lng: float) -> float | None:
        """A report's own distance in metres, as its marker shows it: along
        the route from its start, or from the area's centre - which in
        tracker mode is wherever the tracker was at this search. None until
        a tracker entry has a position."""
        if self._route_line is not None:
            return self._route_line.nearest((lat, lng))[1]
        location = self.location
        if not location:
            return None
        return location_util.distance(location["latitude"], location["longitude"], lat, lng)


def _sampled(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    """A line's ends and a few points between, for a distance check."""
    if len(points) <= 5:
        return points
    step = max(1, len(points) // 5)
    return [*points[::step], points[-1]]
