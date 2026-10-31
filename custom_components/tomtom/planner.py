"""Routes planned on the card: suggestions while an address is typed, a
route worked out for a preview, and the entry that saves it - with the
defaults kept under TomTom Settings, so a route made on the card asks
nothing the wizard would."""

from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import SOURCE_IMPORT
from homeassistant.const import CONF_COUNT, CONF_NAME, UnitOfLength
from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util
from homeassistant.util import slugify

from .api import (
    TomTomAuthError,
    async_get_usage,
    TomTomClient,
    TomTomError,
    async_get_details_cache,
    async_load_key,
    id_tail,
    incident_language,
    merge_details,
    section_item,
)
from .geo_location import describe_report
from .route_match import RouteLine
from .sources import SourceError, enabled_sources, merge_sources
from .const import (
    CATEGORIES,
    CATEGORY_DEFAULTS,
    CONF_BLACKLIST,
    CONF_CATEGORIES,
    CONF_DEFAULT_START,
    CONF_LIVE_BACK_FROM,
    CONF_LIVE_BACK_UNTIL,
    CONF_LIVE_DAYS,
    CONF_LIVE_FROM,
    CONF_LIVE_UNTIL,
    CONF_NEW_MINUTES,
    CONF_ONLY_CERTAIN,
    CONF_RETURN_ROUTE,
    CONF_ROADS,
    CONF_SEARCH_MODE,
    CONF_UPDATE_INTERVAL,
    DEFAULT_COUNT,
    DEFAULT_NEW_MINUTES,
    DEFAULT_UPDATE_INTERVAL,
    DOMAIN,
    LIVE_DAYS,
    MAX_ROUTE_VIAS,
    SEARCH_MODE_SETTINGS,
    source_flag,
)

_LOGGER = logging.getLogger(__name__)

# The keys a route entry takes below its geometry - the same the wizard's
# forms ask for, here read from the defaults.
COMMON_KEYS = (
    CONF_CATEGORIES,
    CONF_ONLY_CERTAIN,
    CONF_COUNT,
    CONF_UPDATE_INTERVAL,
    CONF_NEW_MINUTES,
    CONF_ROADS,
    CONF_BLACKLIST,
)

# A place the card names: where it is, what it is called, and how it was
# chosen - an entity's position, a zone, a point on the map or an address.
PLACE_SCHEMA = vol.Schema(
    {
        vol.Required("kind"): str,
        vol.Required("label"): str,
        vol.Required("latitude"): vol.Coerce(float),
        vol.Required("longitude"): vol.Coerce(float),
        vol.Optional("entity_id"): str,
        vol.Optional("zone"): str,
        vol.Optional("address"): str,
    },
    extra=vol.REMOVE_EXTRA,
)


def async_register(hass: HomeAssistant) -> None:
    for command in (websocket_search, websocket_plan, websocket_save_route):
        websocket_api.async_register_command(hass, command)


def settings_entry(hass: HomeAssistant):
    for entry in hass.config_entries.async_entries(DOMAIN):
        if entry.data.get(CONF_SEARCH_MODE) == SEARCH_MODE_SETTINGS:
            return entry
    return None


def route_defaults(hass: HomeAssistant) -> dict:
    """What a new route starts with: the defaults saved under TomTom
    Settings -> Configure -> Defaults for new routes, and the integration's
    own where nothing was saved."""
    entry = settings_entry(hass)
    options = dict(entry.options) if entry else {}
    return {
        CONF_DEFAULT_START: options.get(CONF_DEFAULT_START) or "",
        CONF_RETURN_ROUTE: bool(options.get(CONF_RETURN_ROUTE, False)),
        CONF_LIVE_DAYS: list(options.get(CONF_LIVE_DAYS) or LIVE_DAYS),
        CONF_LIVE_FROM: options.get(CONF_LIVE_FROM) or "00:00:00",
        CONF_LIVE_UNTIL: options.get(CONF_LIVE_UNTIL) or "00:00:00",
        CONF_LIVE_BACK_FROM: options.get(CONF_LIVE_BACK_FROM) or "00:00:00",
        CONF_LIVE_BACK_UNTIL: options.get(CONF_LIVE_BACK_UNTIL) or "00:00:00",
        CONF_CATEGORIES: dict(options.get(CONF_CATEGORIES) or CATEGORY_DEFAULTS),
        CONF_ONLY_CERTAIN: options.get(CONF_ONLY_CERTAIN, True),
        CONF_COUNT: options.get(CONF_COUNT, DEFAULT_COUNT),
        CONF_UPDATE_INTERVAL: options.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
        CONF_NEW_MINUTES: options.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES),
        CONF_ROADS: options.get(CONF_ROADS, ""),
        CONF_BLACKLIST: options.get(CONF_BLACKLIST, ""),
    }


def return_name(hass: HomeAssistant, name: str) -> str:
    suffix = "Rückweg" if str(hass.config.language).startswith("de") else "return"
    return f"{name} - {suffix}"


def name_taken(hass: HomeAssistant, name: str) -> bool:
    wanted = slugify(name)
    return any(slugify(entry.data.get(CONF_NAME, "")) == wanted for entry in hass.config_entries.async_entries(DOMAIN))


async def _client(hass: HomeAssistant) -> TomTomClient:
    key = await async_load_key(hass)
    if not key:
        raise TomTomAuthError("no API key saved yet")
    # No entry to count on: the planner's requests go to the installation's
    # totals on TomTom General, like the wizard's.
    return TomTomClient(hass, key, None)


def _error(connection, msg: dict, err: Exception) -> None:
    code = "invalid_api_key" if isinstance(err, TomTomAuthError) else "tomtom"
    connection.send_error(msg["id"], code, str(err) or err.__class__.__name__)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/search", vol.Required("text"): str, vol.Optional("limit", default=5): int}
)
@websocket_api.async_response
async def websocket_search(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """Suggestions for an address being typed: a few places TomTom's
    search finds for the text so far, within the installation's country."""
    text = msg["text"].strip()
    if len(text) < 3:
        connection.send_result(msg["id"], {"results": []})
        return
    try:
        client = await _client(hass)
        results = await client.async_search(text, hass.config.language, max(1, min(int(msg["limit"]), 8)))
    except TomTomError as err:
        _error(connection, msg, err)
        return
    connection.send_result(msg["id"], {"results": results})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/plan", vol.Required("points"): [PLACE_SCHEMA]}
)
@websocket_api.async_response
async def websocket_plan(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The route through the places named, right now: its line for the map,
    how long it takes, how much of that is traffic, and how many reports
    lie on it - a preview, saved by nothing."""
    places = msg["points"]
    if len(places) < 2 or len(places) > MAX_ROUTE_VIAS + 2:
        connection.send_error(msg["id"], "points", f"2 to {MAX_ROUTE_VIAS + 2} places")
        return
    try:
        client = await _client(hass)
        route = await client.async_route([(p["latitude"], p["longitude"]) for p in places])
        reports = await _plan_reports(hass, client, route)
    except TomTomError as err:
        _error(connection, msg, err)
        return
    # The further sources' reports along the route - the cameras and checks
    # a saved route would get - after TomTom's, which decide the preview.
    reports += await _plan_source_reports(hass, route)
    reports.sort(key=lambda r: r.get("distance") if r.get("distance") is not None else float("inf"))
    connection.send_result(msg["id"], {**_preview(route), "reports": reports})


def _preview(route: dict) -> dict:
    return {
        "points": [[round(lat, 6), round(lon, 6)] for lat, lon in route.get("points") or []],
        "distance": route.get("distance"),
        "duration": route.get("duration"),
        "duration_no_traffic": route.get("duration_no_traffic"),
        "delay": route.get("delay"),
        # The traffic on the route, section by section with TomTom's
        # magnitude of delay: what the card colours the line with.
        "traffic": [
            {
                "points": [[round(lat, 6), round(lon, 6)] for lat, lon in s.get("points") or []],
                "magnitude": s.get("magnitude"),
                "delay": s.get("delay"),
                "category": s.get("category"),
            }
            for s in route.get("sections") or []
            if len(s.get("points") or []) > 1
        ],
    }


# How many of a preview's reports are looked up in Incident Details, five
# to a request: the nearest ten, at most two requests. The rest show what
# the route's sections say, as a live route's do until their turn comes.
PLAN_DETAILS = 10


async def _plan_reports(hass: HomeAssistant, client: TomTomClient, route: dict) -> list[dict]:
    """The planned route's reports, worded like an entry's - the way the
    coordinator words a live route's, from its traffic sections and what
    Incident Details knows about them - with the distance along the route
    from its start. For the card to list and draw while the preview stands;
    no entity is made of them."""
    points = [(float(lat), float(lon)) for lat, lon in route.get("points") or []]
    line = RouteLine(points) if len(points) > 1 else None
    cache = await async_get_details_cache(hass)
    now_iso = dt_util.now().isoformat()
    today = now_iso[:10]
    items: list[dict] = []
    seen: set[str] = set()
    for section in route.get("sections") or []:
        item = section_item(section, cache.prefix)
        if item is None or item["short_id"] in seen:
            continue
        seen.add(item["short_id"])
        item["first_seen"] = cache.first_seen(item["short_id"], now_iso)
        items.append(item)
    along = lambda i: line.nearest((i["lat"], i["lng"]))[1] if line else 0.0
    items.sort(key=along)
    language = hass.config.language
    lang = incident_language(language)
    wanted = [i for i in items if cache.needs_lookup(i["short_id"], lang, today)][:PLAN_DETAILS]
    for start in range(0, len(wanted), 5):
        pending = wanted[start : start + 5]
        for prefix in cache.candidates(None):
            if not pending:
                break
            try:
                answers = await client.async_incident_details([prefix + i["short_id"] for i in pending], language)
            except TomTomError as err:
                _LOGGER.debug("plan: details lookup failed: %s", err)
                break
            by_tail = {}
            for answer in answers:
                if answer:
                    full = str((answer.get("properties") or {}).get("id") or "")
                    if full:
                        cache.learn_prefix(full)
                        by_tail[id_tail(full)] = answer
            for item in pending:
                if item["short_id"] in by_tail:
                    cache.put(item["short_id"], by_tail[item["short_id"]], now_iso, lang)
            pending = [i for i in pending if i["short_id"] not in by_tail]
        for item in pending:
            cache.put(item["short_id"], None, now_iso, lang)
    out: list[dict] = []
    for item in items:
        details = cache.details(item["short_id"])
        merged = merge_details(item, details) if details else item
        merged["first_seen"] = item["first_seen"]
        out.append(_plan_report_out(hass, merged, line))
    return out


def _plan_report_out(hass: HomeAssistant, item: dict, line: RouteLine | None) -> dict:
    """One report of the preview, worded like an entity's, with the way
    along the route from its start."""
    units = hass.config.units
    name, icon, attrs = describe_report(hass.config.language, units, item, "")
    metres = line.nearest((item["lat"], item["lng"]))[1] if line else 0.0
    return {
        "id": item["id"],
        "name": name,
        "icon": icon,
        "latitude": item["lat"],
        "longitude": item["lng"],
        "distance": units.length(metres, UnitOfLength.METERS) if line else None,
        "unit": units.length_unit,
        "attributes": attrs,
    }


def _source_kinds(flags: dict, source: str) -> dict[str, bool]:
    """The kinds one source is asked for, by the defaults for new routes:
    the kind's switch, and under a kind both sources answer the switch for
    this source - what the route gets once it is saved."""
    return {
        kind: bool(flags.get(kind, True)) and bool(flags.get(source_flag(kind, source), True))
        for kind in CATEGORIES
    }


async def _plan_source_reports(hass: HomeAssistant, route: dict) -> list[dict]:
    """The further sources' reports along the planned route - blitzer.de's
    and Lufop's cameras and checks, where those are switched on - asked the
    way a saved route asks for them, and counted on the settings entry. A
    source that does not answer leaves the preview to TomTom's reports."""
    points = [(float(lat), float(lon)) for lat, lon in route.get("points") or []]
    if len(points) < 2:
        return []
    try:
        sources = enabled_sources(hass, await async_get_usage(hass))
    except Exception as err:  # noqa: BLE001 - the preview must not fall over a source
        _LOGGER.debug("plan: sources not available: %s", err)
        return []
    if not sources:
        return []
    flags = route_defaults(hass)[CONF_CATEGORIES]
    settings = settings_entry(hass)
    entry_id = settings.entry_id if settings else None
    language = hass.config.language
    found: list[dict] = []
    for source in sources:
        try:
            found.extend(await source.fetch_route(entry_id, points, _source_kinds(flags, source.key), language))
        except SourceError as err:
            _LOGGER.debug("plan: %s did not answer: %s", source.key, err)
    if not found:
        return []
    line = RouteLine(points)
    return [_plan_report_out(hass, item, line) for item in merge_sources(found)]


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/save_route",
        vol.Required("name"): str,
        vol.Required("start"): PLACE_SCHEMA,
        vol.Required("destination"): PLACE_SCHEMA,
        vol.Optional("vias", default=[]): [PLACE_SCHEMA],
        vol.Optional("return_route"): bool,
    }
)
@websocket_api.require_admin
@websocket_api.async_response
async def websocket_save_route(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict) -> None:
    """The planned route as an entry of its own, made the way the wizard
    makes one, with the defaults under TomTom Settings - and the way back
    as a second entry where the defaults say so. Administrators only, as
    making an entry is everywhere else; the card shows the button to them
    alone."""
    from .config_flow import build_route_entry_data  # noqa: PLC0415 - avoids a circular import at load

    name = msg["name"].strip()
    if not name:
        connection.send_error(msg["id"], "name", "a name is needed")
        return
    if name_taken(hass, name):
        connection.send_error(msg["id"], "name_taken", name)
        return
    start, destination, vias = msg["start"], msg["destination"], list(msg["vias"])
    if len(vias) > MAX_ROUTE_VIAS:
        connection.send_error(msg["id"], "points", f"at most {MAX_ROUTE_VIAS} stops")
        return
    defaults = route_defaults(hass)
    with_return = msg.get("return_route")
    if with_return is None:
        with_return = defaults[CONF_RETURN_ROUTE]
    back_name = return_name(hass, name)
    if with_return and name_taken(hass, back_name):
        connection.send_error(msg["id"], "return_name_taken", back_name)
        return
    points = [
        (start["latitude"], start["longitude"]),
        *[(v["latitude"], v["longitude"]) for v in vias],
        (destination["latitude"], destination["longitude"]),
    ]
    common = {key: defaults[key] for key in COMMON_KEYS}
    try:
        client = await _client(hass)
        route = await client.async_route(points)
        back = await client.async_route(points[::-1]) if with_return else None
    except TomTomError as err:
        _error(connection, msg, err)
        return

    async def _create(entry_name: str, data: dict):
        result = await hass.config_entries.flow.async_init(
            DOMAIN, context={"source": SOURCE_IMPORT}, data={CONF_NAME: entry_name, **data}
        )
        if result.get("type") != "create_entry":
            raise TomTomError(f"entry not created: {result.get('reason') or result.get('type')}")
        return result["result"]

    try:
        entry = await _create(name, build_route_entry_data(route, start, destination, vias, defaults, common))
        back_entry = (
            await _create(back_name, build_route_entry_data(back, start, destination, vias, defaults, common, reverse=True))
            if back
            else None
        )
    except TomTomError as err:
        _error(connection, msg, err)
        return
    connection.send_result(
        msg["id"],
        {
            "entry_id": entry.entry_id,
            "return_entry_id": back_entry.entry_id if back_entry else None,
            **_preview(route),
        },
    )
