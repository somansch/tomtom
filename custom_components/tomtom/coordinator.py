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
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util
from homeassistant.util import location as location_util

from .api import (
    async_get_usage,
    DETAILS_PER_POLL,
    TomTomAuthError,
    TomTomBudgetError,
    TomTomParameterError,
    TomTomQuotaError,
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
    SOURCE_BLITZER,
    SOURCE_CATEGORIES,
    SOURCE_LUFOP,
    source_flag,
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
    CONF_DETAILS,
    CONF_DETAILS_INTERVAL,
    CONF_JAM_MIN_DELAY,
    DEFAULT_JAM_MIN_DELAY,
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
from .sources import SourceError, enabled_source_keys, enabled_sources, merge_sources

_LOGGER = logging.getLogger(__name__)

# Polls that must fail in a row before a repair is raised. Three: at the
# default hour apart, a tracker that lost its fix is back before this; one
# whose entity is gone, a key that stopped working, or a TomTom that is
# down, is not.
FAILURES_FOR_REPAIR = 3
# A further source that has not answered this many polls in a row: what it
# last brought is dropped rather than shown as current, and a repair says
# so - one per source, whichever entry gets there first.
SOURCE_FAILURES_FOR_REPAIR = 3
SOURCE_NAMES = {SOURCE_BLITZER: "blitzer.de", SOURCE_LUFOP: "Lufop"}


def source_issue_id(key: str) -> str:
    return f"source_failing_{key}"

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


def _seconds(value) -> float:
    """TomTom's delay as a number of seconds - 0 where it sends none."""
    try:
        return float(value) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


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
        # Whether this entry is going without Incident Details for want of
        # requests - see incident_details_ok.
        self._details_used_up = False
        # Whether the further sources have had their say since this
        # coordinator was made: answered, failed, or not asked at all. They
        # are asked in a task after the first poll, so until then the data
        # holds TomTom's reports alone - and the markers must not be
        # tidied, or announced as new, against half a list (see
        # geo_location._sync).
        self.sources_settled = False
        # Set for the poll in which an area's TomTom reports come back after
        # Incident Details had none to give: everything in it is back, not
        # new, and is not announced (see take_quiet_sync).
        self._quiet_sync = False
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
        # Minutes of delay a jam has to cost before it is reported; 0 is
        # every jam. Minutes here, seconds in TomTom's figure.
        self.jam_min_delay = int(data.get(CONF_JAM_MIN_DELAY, DEFAULT_JAM_MIN_DELAY) or 0)
        # Whether a live route looks its reports up in Incident Details (see
        # CONF_DETAILS), and how many minutes lie between two rounds of it -
        # 0 for a round with every poll.
        self.details = bool(data.get(CONF_DETAILS, True))
        try:
            self.details_minutes = max(0, int(data.get(CONF_DETAILS_INTERVAL) or 0))
        except (TypeError, ValueError):
            self.details_minutes = 0
        # When the last round of lookups went out - see _details_due.
        self._last_details: float | None = None
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
        self._source_failures: dict[str, int] = {}
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
            self.sources_settled = True
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
                items = await self._route_reports(forced)
            else:
                self._resolve_centre()
                items = await self._fetch_box()
        except TomTomAuthError as err:
            raise UpdateFailed(f"TomTom refused the key: {err}") from err
        except TomTomQuotaError as err:
            # An API this poll cannot do without - the route itself. What an
            # entry can do without is caught where it is asked: see
            # _fetch_box and _route_reports.
            raise UpdateFailed(f"TomTom's quota is used up: {err}") from err
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
            self.sources_settled = True
            self._forget_sources(set())
        return TomTomData(reports=self._with_sources(items))

    @property
    def incident_details_ok(self) -> bool:
        """False while this entry goes without Incident Details for want of
        requests - TomTom has none left for the key, or the day's own limit
        is reached (see TomTomQuotaError and TomTomBudgetError). An area or
        a tracker has no TomTom reports meanwhile; a route's new reports
        come as its sections say. A route with nothing left to look up is
        missing nothing and reads True."""
        return not self._details_used_up

    def _details_refused(self, err: TomTomQuotaError) -> None:
        """No Incident Details for now: said once per entry, in the name of
        whoever said no, and the entry goes on with what it still gets."""
        if not self._details_used_up:
            self._details_used_up = True
            until = (
                "until the day turns at midnight UTC"
                if isinstance(err, TomTomBudgetError)
                else "until TomTom answers again"
            )
            _LOGGER.warning(
                "%s: %s - %s %s",
                self.displayname,
                err,
                "its new reports come without their details" if self.is_live else "no TomTom reports",
                until,
            )

    def _details_answered(self) -> None:
        if self._details_used_up:
            self._details_used_up = False
            _LOGGER.info("%s: Incident Details requests go out again", self.displayname)
            if not self.is_live:
                # An area's reports were gone meanwhile and are all back in
                # this poll - known ones, not new ones.
                self._quiet_sync = True

    @callback
    def take_quiet_sync(self) -> bool:
        """Whether the reports of this poll are to be taken in without
        announcing any as new - asked once per sync, and then forgotten."""
        quiet, self._quiet_sync = self._quiet_sync, False
        return quiet

    def _wants_details(self, item: dict) -> bool:
        """Whether a route's report is worth an Incident Details request:
        the lookups are on (see CONF_DETAILS), and the report is one this
        entry shows at all. A kind switched off, a jam under the delay set,
        an id on the blacklist never reach a card - looking them up spent
        requests on reports nobody saw. What only Details itself can say -
        the road numbers, how sure TomTom is - cannot be asked beforehand."""
        key = category_key(item)
        if not self.details:
            return False
        # A section that names no kind of its own is "unknown" only until
        # Details has said what it is - and Details' word is what the filter
        # afterwards goes by. Judged by the placeholder, with "Unknown"
        # switched off, it was never asked about and never shown.
        if key != "unknown" and not self.kinds.get(key, True):
            return False
        if self.jam_min_delay and key == "jam" and _seconds(item.get("delay")) < self.jam_min_delay * 60:
            return False
        if self.blacklist and (item["id"] in self.blacklist or item["short_id"] in self.blacklist):
            return False
        return True

    def _details_due(self, forced: bool) -> bool:
        """Whether this poll may look details up: always without an
        interval of their own (see CONF_DETAILS_INTERVAL) and on a refresh
        somebody asked for, otherwise once that interval has passed since
        the last round TomTom answered - a round that was refused, here or
        there, or never arrived, is no round."""
        if forced or not self.details_minutes or self._last_details is None:
            return True
        return monotonic() - self._last_details >= self.details_minutes * 60 - DUE_TOLERANCE_SECONDS

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
            if not self.sources_settled:
                # Said all the same: the markers wait for this before they
                # are tidied (see sources_settled).
                self.sources_settled = True
                self.async_update_listeners()
            return
        self._source_reports = reports
        self.sources_settled = True
        self.async_set_updated_data(TomTomData(reports=self._with_sources(self._tomtom_items)))

    def _in_live_window(self, now: datetime) -> bool:
        data = self.entry.data
        days = data.get(CONF_LIVE_DAYS) or []
        on_day = lambda when: not days or LIVE_DAYS[when.weekday()] in days  # noqa: E731
        start, end = data.get(CONF_LIVE_FROM) or "", data.get(CONF_LIVE_UNTIL) or ""
        if not start or not end or start == end:
            return on_day(now)
        try:
            minutes = lambda text: int(text[:2]) * 60 + int(text[3:5])  # noqa: E731
            begin, finish, current = minutes(start), minutes(end), now.hour * 60 + now.minute
        except (TypeError, ValueError):
            return on_day(now)
        if begin < finish:
            return on_day(now) and begin <= current < finish
        # Over midnight. The hours after it belong to the day the window
        # began on: Monday to Friday from 22:00 to 06:00 runs into Saturday
        # morning, and does not start on Monday at midnight.
        if current >= begin:
            return on_day(now)
        return current < finish and on_day(now - timedelta(days=1))

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

    async def _route_reports(self, forced: bool = False) -> list[dict]:
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
        wanted = (
            [i for i in items if self._wants_details(i) and cache.needs_lookup(i["short_id"], lang, today)]
            if self._details_due(forced)
            else []
        )
        client = await self.client()
        requests = 0
        left_open = False
        for start in range(0, min(len(wanted), DETAILS_PER_POLL * 5), 5):
            pending = wanted[start : start + 5]
            asked = False
            # Under the entry's own prefix first; what that finds nothing
            # for is asked again under the other prefixes seen - a route
            # near another source than the last answer came from.
            for prefix in cache.candidates(self.entry_id):
                if not pending or requests >= DETAILS_PER_POLL * 2:
                    break
                requests += 1
                asked = True
                try:
                    answers = await client.async_incident_details([prefix + i["short_id"] for i in pending], language)
                except TomTomAuthError:
                    # A key that may not use this API at all is the user's
                    # to know about, as it always was.
                    raise
                except TomTomQuotaError as err:
                    # No requests left for Details. The route and its
                    # sections are Routing's and are here already: the
                    # reports stand as the sections tell them, and the
                    # lookups are left open - not marked as asked - for the
                    # poll that finds Details answering again.
                    self._details_refused(err)
                    left_open = True
                    break
                except TomTomParameterError as err:
                    # TomTom will not take these ids as they are. Asking the
                    # same again with every poll changes nothing: noted as
                    # asked, like an id it does not know.
                    _LOGGER.debug("%s: Incident Details rejected a lookup: %s", self.displayname, err)
                    answers = []
                except TomTomError as err:
                    # Not reached, or answered with an error of its own. The
                    # route is here and paid for - it used to be thrown away
                    # with the poll, travel time and all. The details wait
                    # for the next one.
                    _LOGGER.debug("%s: Incident Details did not answer, asked again later: %s", self.displayname, err)
                    left_open = True
                    break
                self._last_details = monotonic()
                self._details_answered()
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
            if left_open:
                break
            if not asked:
                # The poll's requests were spent before this batch had one.
                # It waits for the next poll - noted as asked, it would have
                # waited until tomorrow for a question nobody put.
                break
            for item in pending:
                cache.put(item["short_id"], None, now_iso, lang)
        if self._details_used_up and not left_open:
            # Refused in an earlier poll, and nothing refused in this one:
            # the flag stands only while a report still waits for its
            # details. One that has left the route waits for nothing.
            if not any(
                self._wants_details(i) and cache.needs_lookup(i["short_id"], lang, today) for i in items
            ):
                self._details_answered()
        merged = []
        for item in items:
            details = cache.details(item["short_id"])
            merged.append(merge_details(item, details) if details else item)
            merged[-1]["first_seen"] = item["first_seen"]
        return self._filter(merged)

    # --- further sources ------------------------------------------------

    @property
    def sources_ok(self) -> bool:
        """Whether every further source answered its last ask."""
        return not self._source_failed

    def kinds_for(self, source: str) -> dict[str, bool]:
        """The kinds one source is asked for: each kind's own switch, and
        under a kind both sources answer, the switch for this source."""
        return {
            kind: bool(self.kinds.get(kind)) and self.kinds.get(source_flag(kind, source), True)
            for kind in CATEGORIES
        }

    def _forget_sources(self, asked: set[str]) -> None:
        """What is remembered of a source's failures goes with the source:
        one switched off under TomTom Settings is not failing, it is off -
        its repair used to stay, and sources_ok to read false, until every
        entry had been reloaded."""
        for key in (SOURCE_BLITZER, SOURCE_LUFOP):
            if key in asked:
                continue
            self._source_failed.discard(key)
            self._source_failures.pop(key, None)
            if not bool(enabled_source_keys(self.hass) & {key}):
                ir.async_delete_issue(self.hass, DOMAIN, source_issue_id(key))

    def _wants_source(self) -> bool:
        """Whether a kind is on that a further source answers - one of the
        eight that are theirs, for at least one source."""
        return any(
            self.kinds_for(source).get(kind)
            for source in (SOURCE_BLITZER, SOURCE_LUFOP)
            for kind in SOURCE_CATEGORIES
        )

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
        self._forget_sources({source.key for source in sources})
        language = self.hass.config.language
        found: list[dict] = []
        for source in sources:
            try:
                if self.is_live:
                    items = await source.fetch_route(self.entry_id, self._route_points, self.kinds_for(source.key), language)
                elif self.location:
                    items = await source.fetch_area(
                        self.entry_id,
                        float(self.location["latitude"]),
                        float(self.location["longitude"]),
                        float(self.location.get("radius") or 1000),
                        self.kinds_for(source.key),
                        language,
                    )
                else:
                    items = []
            except SourceError as err:
                failures = self._source_failures.get(source.key, 0) + 1
                self._source_failures[source.key] = failures
                if source.key not in self._source_failed:
                    _LOGGER.warning("%s: %s - keeping what it last brought", self.displayname, err)
                self._source_failed.add(source.key)
                if failures < SOURCE_FAILURES_FOR_REPAIR:
                    found.extend(self._source_items.get(source.key, []))
                    continue
                # Three in a row: what it last brought is no longer shown as
                # current, and a repair names the source.
                if self._source_items.pop(source.key, None) is not None or failures == SOURCE_FAILURES_FOR_REPAIR:
                    _LOGGER.warning("%s: %s failed %d polls in a row - its reports are dropped", self.displayname, source.key, failures)
                ir.async_create_issue(
                    self.hass,
                    DOMAIN,
                    source_issue_id(source.key),
                    is_fixable=False,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key="source_failing",
                    translation_placeholders={
                        "source": SOURCE_NAMES.get(source.key, source.key),
                        "count": str(failures),
                        "reason": str(err),
                    },
                )
                continue
            if source.key in self._source_failed:
                _LOGGER.info("%s: %s answers again", self.displayname, source.key)
                self._source_failed.discard(source.key)
            self._source_failures.pop(source.key, None)
            # Taken down whoever put it up: the repair is the source's, not
            # this entry's, and the entry that raised it may have been
            # reloaded since - its count gone, and with it the one hand that
            # used to take the repair down.
            ir.async_delete_issue(self.hass, DOMAIN, source_issue_id(source.key))
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
        try:
            for box in self._boxes() if self.categories else []:
                for raw in await client.async_incidents(box, self.categories, language):
                    item = incident_item(raw)
                    if item is None or item["id"] in seen:
                        continue
                    cache.learn_prefix(item["id"], self.entry_id)
                    seen.add(item["id"])
                    found.append(item)
        except TomTomQuotaError as err:
            # No requests left for Incident Details, which is where an
            # area's TomTom reports come from. The entry stays up without
            # them rather than failing as a whole: the further sources, the
            # traffic flow and everything set on the entry go on. Nothing
            # of an earlier poll is kept - a jam of an hour ago shown as
            # current would be worse than none. What this poll's own boxes
            # brought before the refusal stays: it is current, and paid for.
            self._details_refused(err)
        else:
            if self.categories:
                self._details_answered()
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
            if self.jam_min_delay and category_key(item) == "jam" and _seconds(item.get("delay")) < self.jam_min_delay * 60:
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
