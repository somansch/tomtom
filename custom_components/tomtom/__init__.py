"""TomTom: what is on the road, around a point, around a device, or along a
route - as markers on the map, as counts, and as a live route's times."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
import logging
import secrets

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import SOURCE_IMPORT, ConfigEntry
from homeassistant.const import CONF_LOCATION, Platform
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import ConfigEntryNotReady, ServiceValidationError
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.typing import ConfigType
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator
import homeassistant.helpers.config_validation as cv

from .api import async_forget_key, async_get_usage
from .bundle import CARD_RESOURCE_PATHS, async_install_blueprints, async_register_card
from .const import (
    CONF_DEFAULT_START,
    ATTR_CONFIG_ENTRY_ID,
    CONF_ROUTE_DESTINATION,
    CONF_ROUTE_DISTANCE,
    CONF_ROUTE_DURATION,
    CONF_ROUTE_START,
    CONF_ROUTE_VIAS,
    CONF_SEARCH_MODE,
    CONF_TRACKER,
    CONF_TRACKER_RADIUS,
    CONF_WAYPOINTS,
    DEFAULT_FLOW_STYLE,
    DEFAULT_TRACKER_RADIUS,
    DOMAIN,
    FLOW_STYLES,
    FLOW_TILE_URL_BASE,
    ROUTE_MODES,
    SEARCH_MODE_ROUTE_LIVE,
    SEARCH_MODE_SETTINGS,
    SEARCH_MODE_TRACKER,
    SERVICE_REFRESH,
)
from .coordinator import TomTomCoordinator, TomTomData, category_key
from .geo_location import delay_minutes, summary_text
from .lovelace_resource import async_unregister as async_unregister_resource
from .planner import async_register as async_register_planner, route_defaults
from .sources import active_kinds, enabled_source_keys
from .quota import QUOTA_DATA_KEY, QuotaWatch
from .tiles import TILE_CACHE, TILE_CLIENT, TILE_TOKEN, FlowTileView

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.GEO_LOCATION, Platform.NUMBER]
# The settings entry's own: the totals, and the quota watch's sensor.
SETTINGS_PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.BINARY_SENSOR]

_REFRESH_SCHEMA = vol.Schema({vol.Required(ATTR_CONFIG_ENTRY_ID): str})

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


@dataclass
class RuntimeData:
    coordinator: DataUpdateCoordinator | None
    cancel_update_listener: Callable


def is_settings_entry(entry: ConfigEntry) -> bool:
    return entry.data.get(CONF_SEARCH_MODE) == SEARCH_MODE_SETTINGS


def _settings_entry(hass: HomeAssistant) -> ConfigEntry | None:
    for entry in hass.config_entries.async_entries(DOMAIN):
        if is_settings_entry(entry):
            return entry
    return None


def _async_ensure_settings_entry(hass: HomeAssistant) -> None:
    """The "TomTom Settings" entry, made once the first real entry is up -
    through a flow of its own, since an entry can only be made by one.
    Not while one is already being made: two real entries setting up at
    once would otherwise race for it."""
    if _settings_entry(hass) is not None:
        return
    for flow in hass.config_entries.flow.async_progress_by_handler(DOMAIN):
        if flow.get("context", {}).get("source") == SOURCE_IMPORT:
            return
    hass.async_create_task(
        hass.config_entries.flow.async_init(
            DOMAIN,
            context={"source": SOURCE_IMPORT},
            data={CONF_SEARCH_MODE: SEARCH_MODE_SETTINGS},
        )
    )


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Put what the download brings with it in place, once for the domain:
    the card, the blueprint, the websocket commands and the tile view."""
    domain = hass.data.setdefault(DOMAIN, {})
    domain[TILE_TOKEN] = secrets.token_urlsafe(18)
    await async_register_card(hass)
    await async_install_blueprints(hass)
    websocket_api.async_register_command(hass, websocket_route)
    websocket_api.async_register_command(hass, websocket_flow)
    async_register_planner(hass)
    hass.http.register_view(FlowTileView(hass))
    return True


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/flow"})
@websocket_api.async_response
async def websocket_flow(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Where the card gets the traffic flow tiles: the URL template with
    this start's token in it - and a place for the entry the card shows,
    which the tiles are then counted on - and the styles TomTom draws
    them in."""
    token = (hass.data.get(DOMAIN) or {}).get(TILE_TOKEN) or ""
    connection.send_result(
        msg["id"],
        {
            "template": f"{FLOW_TILE_URL_BASE}/{token}/{{entry}}/flow/{{style}}/{{z}}/{{x}}/{{y}}.png",
            "styles": list(FLOW_STYLES),
            "default_style": DEFAULT_FLOW_STYLE,
            # What the card's planner starts a new route from, by default.
            "default_start": route_defaults(hass)[CONF_DEFAULT_START],
            # The further sources that are asked - what tells the editor
            # whether every report has a page of its own to open.
            "sources": enabled_source_keys(hass),
            # And every kind a report can have with them, with its symbol -
            # what the editor offers a symbol and a colour for.
            "kinds": active_kinds(hass),
        },
    )


@websocket_api.websocket_command({"type": f"{DOMAIN}/route", "config_entry_id": str})
@websocket_api.async_response
async def websocket_route(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """The line a route entry searches along, for the card - and, for a
    live route, the stretches of it traffic is slowing.

    Asked for rather than published as an attribute: attributes are written
    to the recorder with every state change. Answers with points set to
    null for every other kind of entry, with what that entry searches
    instead: the circle's centre and radius, or the tracker it follows.
    """
    entry = hass.config_entries.async_get_entry(msg["config_entry_id"])
    if entry is None or entry.domain != DOMAIN:
        connection.send_error(msg["id"], websocket_api.ERR_NOT_FOUND, "Not a TomTom entry")
        return
    data = entry.data
    mode = data.get(CONF_SEARCH_MODE)
    waypoints = data.get(CONF_WAYPOINTS) or []
    runtime = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    coordinator = runtime.coordinator if isinstance(runtime, RuntimeData) and runtime.coordinator else None
    live = coordinator.live if coordinator and coordinator.live else None
    if live and coordinator.waypoints:
        waypoints = coordinator.waypoints
    if mode not in ROUTE_MODES or not waypoints:
        area = {"points": None, "mode": mode}
        if mode == SEARCH_MODE_TRACKER:
            area["tracker"] = data.get(CONF_TRACKER)
            area["radius"] = data.get(CONF_TRACKER_RADIUS, DEFAULT_TRACKER_RADIUS)
        else:
            location = data.get(CONF_LOCATION) or {}
            area["center"] = [location.get("latitude"), location.get("longitude")]
            area["radius"] = location.get("radius")
        connection.send_result(msg["id"], area)
        return

    def end(value):
        value = value or {}
        return {
            "latitude": value.get("latitude"),
            "longitude": value.get("longitude"),
            "label": value.get("label", ""),
        }

    is_live = mode == SEARCH_MODE_ROUTE_LIVE
    connection.send_result(
        msg["id"],
        {
            "mode": mode,
            "points": [[p["latitude"], p["longitude"]] for p in waypoints],
            "start": end(data.get(CONF_ROUTE_START) if is_live else waypoints[0]),
            "destination": end(data.get(CONF_ROUTE_DESTINATION) if is_live else waypoints[-1]),
            "vias": [[v["latitude"], v["longitude"]] for v in data.get(CONF_ROUTE_VIAS, [])],
            "distance": live["distance"] if live and live.get("distance") is not None else data.get(CONF_ROUTE_DISTANCE),
            "duration": live["duration"] if live and live.get("duration") is not None else data.get(CONF_ROUTE_DURATION),
            **(
                {
                    "live": {
                        "delay": live.get("delay"),
                        "duration_no_traffic": live.get("duration_no_traffic"),
                        "at": live["at"].isoformat() if live.get("at") else None,
                        "sections": [
                            {
                                "category": s.get("category"),
                                "delay": s.get("delay"),
                                "magnitude": s.get("magnitude"),
                                "speed": s.get("speed"),
                                "event_id": s.get("event_id"),
                                "points": [[lat, lon] for lat, lon in s.get("points") or []],
                            }
                            for s in live.get("sections") or []
                        ],
                    }
                }
                if live
                else {}
            ),
        },
    )


async def async_migrate_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    """Minor version 2: the quota warning's default share went from 100 %
    to 80 %. A settings entry that never saved a share of its own warned at
    100 % until now and keeps doing so; only a new installation starts at
    80 %. Every other entry just takes the new number."""
    if config_entry.version > 1:
        return False
    if config_entry.minor_version < 2:
        from .const import CONF_QUOTA_THRESHOLD  # noqa: PLC0415 - only here

        options = dict(config_entry.options)
        if is_settings_entry(config_entry) and CONF_QUOTA_THRESHOLD not in options:
            options[CONF_QUOTA_THRESHOLD] = 100
        hass.config_entries.async_update_entry(config_entry, options=options, minor_version=2)
    return True


async def async_setup_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    domain = hass.data.setdefault(DOMAIN, {})
    # A key may have changed since the tile client was made; it is cheap
    # to make again.
    domain.pop(TILE_CLIENT, None)
    domain.pop(TILE_CACHE, None)

    if is_settings_entry(config_entry):
        # No search: the "TomTom General" device with the month's totals,
        # and the watch over the month's quota - see quota.py.
        domain[config_entry.entry_id] = RuntimeData(None, config_entry.add_update_listener(_async_update_listener))
        watch = domain[QUOTA_DATA_KEY] = QuotaWatch(hass, config_entry, await async_get_usage(hass))
        watch.start()
        await hass.config_entries.async_forward_entry_setups(config_entry, SETTINGS_PLATFORMS)
        return True

    coordinator = TomTomCoordinator(hass, config_entry)

    # One fetch right away, whatever the interval and a live route's hours
    # say - a new entry shows something at once. An entry set to manual
    # only, or one outside its hours, is then left alone until the
    # "refresh" action or its hours come round.
    await coordinator.async_config_entry_first_refresh()
    if coordinator.attempted_fetch and not coordinator.connected:
        raise ConfigEntryNotReady

    cancel_update_listener = config_entry.add_update_listener(_async_update_listener)
    domain[config_entry.entry_id] = RuntimeData(coordinator, cancel_update_listener)

    await hass.config_entries.async_forward_entry_setups(config_entry, PLATFORMS)
    _async_ensure_settings_entry(hass)

    if not hass.services.has_service(DOMAIN, SERVICE_REFRESH):
        hass.services.async_register(
            DOMAIN,
            SERVICE_REFRESH,
            _async_handle_refresh,
            schema=_REFRESH_SCHEMA,
            supports_response=SupportsResponse.OPTIONAL,
        )
    return True


def _coordinator_for(call: ServiceCall) -> TomTomCoordinator:
    hass = call.hass
    entry_id = call.data[ATTR_CONFIG_ENTRY_ID]
    entry = hass.config_entries.async_get_entry(entry_id)
    if entry is None or entry.domain != DOMAIN:
        raise ServiceValidationError(f"'{entry_id}' is not a TomTom config entry")
    runtime = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if not isinstance(runtime, RuntimeData) or runtime.coordinator is None:
        raise ServiceValidationError(
            f"'{entry.title}' is not running right now"
            + (f" ({entry.reason})" if entry.reason else "")
        )
    return runtime.coordinator


def _items_response(hass: HomeAssistant, coordinator: TomTomCoordinator, items) -> list[dict]:
    language = hass.config.language
    return [
        {
            "id": item["id"],
            "type": category_key(item),
            "summary": summary_text(item, language, hass.config.units),
            "description": item.get("description") or "",
            "road": " / ".join(item.get("roads") or []),
            "from": item.get("from") or "",
            "to": item.get("to") or "",
            "delay_minutes": delay_minutes(item),
            "latitude": item.get("lat"),
            "longitude": item.get("lng"),
        }
        for item in items
    ]


async def _async_handle_refresh(call: ServiceCall) -> ServiceResponse:
    """Fetch one entry right now, whatever its interval and - for a live
    route - its hours say; the route itself first. Returns the reports."""
    coordinator = _coordinator_for(call)
    await coordinator.async_refresh_all()
    data = coordinator.data or TomTomData()
    return {"reports": _items_response(call.hass, coordinator, data.reports)}


async def _async_update_listener(hass: HomeAssistant, config_entry):
    runtime = hass.data.get(DOMAIN, {}).get(config_entry.entry_id)
    if isinstance(runtime, RuntimeData) and runtime.coordinator and runtime.coordinator.absorb_window(config_entry):
        return
    await hass.config_entries.async_reload(config_entry.entry_id)
    if is_settings_entry(config_entry):
        # A source switched on or off is every entry's business: each
        # polls again, so its reports follow at once rather than at its
        # next interval.
        for other in hass.data.get(DOMAIN, {}).values():
            if isinstance(other, RuntimeData) and other.coordinator is not None:
                hass.async_create_task(other.coordinator.async_refresh_all())


async def async_unload_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> bool:
    runtime = hass.data[DOMAIN][config_entry.entry_id]
    runtime.cancel_update_listener()
    if runtime.coordinator is None:
        watch = hass.data[DOMAIN].pop(QUOTA_DATA_KEY, None)
        if watch is not None:
            watch.stop()
        unload_ok = await hass.config_entries.async_unload_platforms(config_entry, SETTINGS_PLATFORMS)
    else:
        ir.async_delete_issue(hass, DOMAIN, runtime.coordinator.repair_issue_id)
        unload_ok = await hass.config_entries.async_unload_platforms(config_entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(config_entry.entry_id)
    return unload_ok


async def async_remove_entry(hass: HomeAssistant, config_entry: ConfigEntry) -> None:
    """Forget what the last entry leaves behind: the settings entry, which
    is only ever there for the real ones; the key, which should not outlive
    what it was given for; and the card's resource entry. A settings entry
    removed by hand while real entries remain is made again - it is where
    their totals and their key live."""
    remaining = hass.config_entries.async_entries(DOMAIN)
    if is_settings_entry(config_entry):
        if any(not is_settings_entry(entry) for entry in remaining):
            _async_ensure_settings_entry(hass)
            return
    else:
        (await async_get_usage(hass)).forget(config_entry.entry_id)
        if any(not is_settings_entry(entry) for entry in remaining):
            return
        for entry in remaining:
            hass.async_create_task(hass.config_entries.async_remove(entry.entry_id))
    await async_forget_key(hass)
    (hass.data.get(DOMAIN) or {}).pop(TILE_CLIENT, None)
    await async_unregister_resource(hass, CARD_RESOURCE_PATHS)
