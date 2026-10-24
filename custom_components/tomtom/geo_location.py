"""Every report as a marker on the map: one geo_location entity per
incident, on one source per entry."""

from __future__ import annotations

import logging
from datetime import datetime
from math import ceil
from typing import Any

from homeassistant.components.geo_location import GeolocationEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_CORE_CONFIG_UPDATE, UnitOfLength, UnitOfSpeed
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util
from homeassistant.util import slugify
from homeassistant.util.unit_conversion import SpeedConverter

from .const import CATEGORY_ICONS, DOMAIN, EVENT_NEW_REPORT
from .coordinator import (
    TomTomCoordinator,
    category_key,
    category_label,
    magnitude_key,
    magnitude_label,
)

_LOGGER = logging.getLogger(__name__)


def _as_number(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def local_stamp(iso: str) -> datetime | None:
    """TomTom's "2026-10-16T19:25:30Z", as a local datetime - or None."""
    if not iso:
        return None
    parsed = dt_util.parse_datetime(iso)
    if parsed is None:
        return None
    return dt_util.as_local(parsed)


def full_stamp(iso: str) -> str:
    """A TomTom time the way the card and the sensors read a report's time:
    "2026-10-16 21:25:30" in local time, or "" for none."""
    local = local_stamp(iso)
    return local.strftime("%Y-%m-%d %H:%M:%S") if local else ""


def reported_at(item: dict) -> str:
    """When a report counts from: when TomTom first reported it, or - for a
    route's report the sections named before Details said - when this
    installation first saw it. ISO 8601 as TomTom sends it, or the local
    stamp the cache keeps."""
    return item.get("start") or item.get("first_seen") or ""


def delay_minutes(item: dict) -> int:
    """How many minutes the incident costs, rounded up - TomTom's figure in
    seconds, which a road closure does not carry at all."""
    delay = _as_number(item.get("delay"))
    return int(ceil(delay / 60)) if delay and delay > 0 else 0


# The languages written right to left among those the integration speaks.
# The arrow between a stretch's two ends follows the reading direction:
# the start is met first, on the right, and the arrow points on from it.
RTL_LANGUAGES = {"ar", "he", "fa", "ur"}


def _arrow(language: str | None) -> str:
    return "←" if str(language or "")[:2].lower() in RTL_LANGUAGES else "→"


def place_text(item: dict, language: str | None = None) -> str:
    """Where it is, in one piece: the road numbers, then from where to
    where - "A99 · München-Allach → München-Eschenried"."""
    roads = " / ".join(item.get("roads") or [])
    span = item.get("from") or ""
    if item.get("to") and item.get("to") != span:
        span = f"{span} {_arrow(language)} {item['to']}" if span else item["to"]
    return " · ".join(part for part in (roads, span) if part)


def length_text(meters: float, units=None) -> str:
    """A stretch's length the way the installation measures: "1.2 km", or
    "0.7 mi" on an imperial one."""
    if units is None:
        return f"{meters / 1000:.1f} km"
    return f"{units.length(meters, UnitOfLength.METERS):.1f} {units.length_unit}"


def summary_text(item: dict, language: str, units=None) -> str:
    """The report in one line, ready to drop into a notification: what it
    is, how long, how much it costs, where - then TomTom's own wording of
    it after a dash. "Stau · 1.2 km · +4 min · A9 · Nürnberg → München —
    Stockender Verkehr"."""
    parts = [item.get("type_label") or category_label(item, language)]
    if item.get("speed_limit"):
        # A camera's limit, right after what it is: "Mobile speed camera ·
        # 50 km/h".
        parts.append(f"{item['speed_limit']} km/h")
    length = _as_number(item.get("length"))
    if length and length >= 100:
        parts.append(length_text(length, units))
    minutes = delay_minutes(item)
    if minutes:
        parts.append(f"+{minutes} min")
    parts.append(place_text(item, language))
    text = " · ".join(part for part in parts if part)
    description = item.get("description") or ""
    if description:
        return f"{text} — {description}" if text else description
    return text


def describe_report(language: str, units, item: dict, area: str) -> tuple[str, str, dict[str, Any]]:
    """A report's name, its symbol and its attributes, worded for the
    instance's language and units - for the entity, and for a planned
    route's preview, which has no entity."""
    key = category_key(item)
    # A further source's report is named by what exactly it is; the
    # kind's own name is on the symbol.
    label = item.get("type_label") or category_label(item, language)
    roads = " / ".join(item.get("roads") or [])
    where = roads or item.get("from") or ""
    name = f"{label} {where}".strip()
    icon = CATEGORY_ICONS.get(key, "mdi:alert")
    minutes = delay_minutes(item)
    since = local_stamp(reported_at(item))
    attrs: dict[str, Any] = {
        "area": area,
        # The category, as a key, and what it is called in this
        # instance's language.
        "type": key,
        "type_name": label,
        # All of the above in one readable line, so a notification or a
        # card can print one field instead of assembling six.
        "summary": summary_text(item, language, units),
        # TomTom's own wording of what is going on, in the instance's
        # language where it has one.
        "description": item.get("description") or "",
        "events": item.get("events") or [],
        # The id TomTom gives the incident, and the one the blacklist
        # matches against; the short form is what a route's traffic
        # sections name.
        "id": item["id"],
        "short_id": item["short_id"],
        "from": item.get("from") or "",
        "to": item.get("to") or "",
        "roads": list(item.get("roads") or []),
        "road": roads,
        "place": place_text(item, language),
        "magnitude": magnitude_key(item),
        "magnitude_name": magnitude_label(item, language),
        "probability": item.get("probability") or "",
        # When the report counts from, in local time the way the card
        # reads a report's time, and as ISO 8601 for a template.
        "created": since.strftime("%Y-%m-%d %H:%M:%S") if since else "",
        "created_at": since.isoformat() if since else None,
        "ends_at": local_stamp(item.get("end")).isoformat() if local_stamp(item.get("end")) else None,
        # The stretch of road it runs along, as an encoded polyline the
        # card draws as a band, and its far end as coordinates.
        "polyline": item.get("polyline") or "",
        "end_latitude": item.get("end_lat"),
        "end_longitude": item.get("end_lng"),
        # Who reported it: "tomtom", or a further source such as
        # "blitzer" - see sources.py.
        "provider": item.get("provider") or "tomtom",
        # Every source that has it: a camera blitzer.de and Lufop both
        # list is one report, with blitzer.de's information.
        "providers": list(item.get("providers") or [item.get("provider") or "tomtom"]),
    }
    if item.get("speed_limit"):
        # A camera's limit, as blitzer.de states it: km/h.
        attrs["speed_limit"] = item["speed_limit"]
    if item.get("confirmed_at"):
        # When the community last confirmed a mobile camera or check.
        confirmed = local_stamp(item["confirmed_at"])
        attrs["confirmed_at"] = confirmed.isoformat() if confirmed else None
    if item.get("confirmations") is not None:
        # How often it was confirmed - the card's stars, up to three.
        attrs["confirmations"] = item["confirmations"]
    # Only what TomTom actually sent: a closure carries no delay, a
    # section no length.
    length = _as_number(item.get("length"))
    if length is not None:
        attrs["length"] = round(length)
    delay = _as_number(item.get("delay"))
    if delay is not None:
        attrs["delay"] = round(delay)
    if minutes:
        attrs["delay_minutes"] = minutes
    if item.get("speed") is not None:
        # A route's section: how fast traffic moves through it, in the
        # installation's speed unit - km/h, or mph.
        # By the length unit, not the unit system's own speed unit:
        # metric Home Assistant measures wind in m/s, and road speed
        # in m/s is a number nobody reads.
        speed = float(item["speed"])
        if units.length_unit == UnitOfLength.MILES:
            attrs["speed"] = round(
                SpeedConverter.convert(speed, UnitOfSpeed.KILOMETERS_PER_HOUR, UnitOfSpeed.MILES_PER_HOUR)
            )
            attrs["speed_unit"] = UnitOfSpeed.MILES_PER_HOUR
        else:
            attrs["speed"] = round(speed)
            attrs["speed_unit"] = UnitOfSpeed.KILOMETERS_PER_HOUR
    if item.get("reports") is not None:
        attrs["reports"] = item["reports"]
    if item.get("last_report"):
        attrs["last_report_at"] = local_stamp(item["last_report"]).isoformat() if local_stamp(item["last_report"]) else None
    return name, icon, attrs


def _report_distance(hass, coordinator, lat, lng) -> float | None:
    meters = coordinator.report_distance(lat, lng)
    if meters is None:
        return None
    return hass.config.units.length(meters, UnitOfLength.METERS)


def event_payload(hass: HomeAssistant, coordinator: TomTomCoordinator, item: dict) -> dict:
    """What a new-report event carries: the same wording the entity has, so
    an automation can print one field instead of assembling six - straight
    from the event, without looking the entity up."""
    language = hass.config.language
    value = _report_distance(hass, coordinator, item["lat"], item["lng"])
    return {
        "config_entry_id": coordinator.entry_id,
        "area": coordinator.displayname,
        "id": item["id"],
        "type": category_key(item),
        "type_name": category_label(item, language),
        "summary": summary_text(item, language, hass.config.units),
        "description": item.get("description") or "",
        "from": item.get("from") or "",
        "to": item.get("to") or "",
        "roads": list(item.get("roads") or []),
        "road": " / ".join(item.get("roads") or []),
        "length": item.get("length"),
        "delay": item.get("delay"),
        "delay_minutes": delay_minutes(item),
        "magnitude": magnitude_key(item),
        "latitude": item["lat"],
        "longitude": item["lng"],
        "distance": round(value, 1) if value is not None else None,
        "distance_unit": hass.config.units.length_unit,
    }


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up the geolocation platform."""
    coordinator: TomTomCoordinator = hass.data[DOMAIN][config_entry.entry_id].coordinator

    registry = er.async_get(hass)
    prefix = f"{DOMAIN}-report-{coordinator.entry_id}-"
    known: dict[str, TomTomReportEvent] = {}
    # Set False after the first sync below - everything reported there is
    # simply "already there" from the entry's very first data fetch, not
    # a new detection, so the "new" event only starts firing from the
    # next poll onwards.
    first_sync = True

    @callback
    def _sync() -> None:
        nonlocal first_sync
        items = coordinator.data.reports[: coordinator.count]
        # Filed by the tail of TomTom's id, which is the same whatever
        # prefix the source puts before it.
        current_ids = {item["short_id"] for item in items}
        new_entities = []
        new_items = []

        for item in items:
            marker_id = item["short_id"]
            if marker_id in known:
                known[marker_id].update_from_item(item)
            else:
                entity = TomTomReportEvent(coordinator, item)
                known[marker_id] = entity
                new_entities.append(entity)
                new_items.append(item)

        # Purge every registry entry of this entry that no longer matches a
        # currently reported item - both ones tracked in `known` this
        # session and leftovers from a previous session. Removing the
        # registry entry directly is what makes this immediate: no
        # "restored" ghost in the meantime.
        for entry in list(er.async_entries_for_config_entry(registry, config_entry.entry_id)):
            if entry.domain != "geo_location" or not entry.unique_id.startswith(prefix):
                continue
            marker_id = entry.unique_id[len(prefix):]
            if marker_id in current_ids:
                continue
            known.pop(marker_id, None)
            registry.async_remove(entry.entity_id)

        if new_entities:
            async_add_entities(new_entities)

        if not first_sync:
            for item in new_items:
                hass.bus.async_fire(EVENT_NEW_REPORT, event_payload(hass, coordinator, item))
        first_sync = False

    coordinator.async_add_listener(_sync)
    # A changed unit system or language - Settings -> System -> General -
    # rewrites every report at once: its distance, its summary, its speed,
    # its labels and the unit on them, without waiting for the next poll
    # or a restart. A callback, so it runs on the loop like the rest.
    @callback
    def _core_config_changed(event) -> None:
        if "unit_system" in event.data or "language" in event.data:
            _sync()

    config_entry.async_on_unload(hass.bus.async_listen(EVENT_CORE_CONFIG_UPDATE, _core_config_changed))
    _sync()


class TomTomReportEvent(GeolocationEvent):
    """One report as a marker: where it starts, what it is, and everything
    TomTom says about it as attributes."""

    _attr_should_poll = False
    # Every entity of an entry belongs to that entry's device, so Home
    # Assistant renders "<entry> <entity>" itself.
    _attr_has_entity_name = True

    def __init__(self, coordinator: TomTomCoordinator, item: dict) -> None:
        self._coordinator = coordinator
        self._item_id = item["short_id"]
        # One source per entry, so a map card can pick an entry's reports.
        self._attr_source = f"{DOMAIN}_{slugify(coordinator.displayname)}"
        self._attr_unique_id = f"{DOMAIN}-report-{coordinator.entry_id}-{item['short_id']}"
        self._attr_device_info = coordinator.device_info
        self._extra_attrs: dict[str, Any] = {}
        self._apply(item)

    @property
    def _language(self) -> str:
        return self._coordinator.hass.config.language

    @property
    def _units(self):
        return self._coordinator.hass.config.units

    @property
    def unit_of_measurement(self) -> str:
        """The unit the installation measures distance in - km, or miles on
        an imperial one - read live, the way the state is computed, so a
        changed unit system never leaves a mile under a "km"."""
        return self._units.length_unit

    def _apply(self, item: dict) -> None:
        name, icon, attrs = describe_report(
            self._language, self._units, item, self._coordinator.displayname
        )
        self._attr_name = name
        self._attr_latitude = item["lat"]
        self._attr_longitude = item["lng"]
        self._attr_icon = icon
        if self.hass is not None:
            self._attr_distance = _report_distance(self.hass, self._coordinator, item["lat"], item["lng"])
        self._extra_attrs = attrs

    async def async_added_to_hass(self) -> None:
        self._attr_distance = _report_distance(
            self.hass, self._coordinator, self._attr_latitude, self._attr_longitude
        )
        self.async_write_ha_state()

    @callback
    def update_from_item(self, item: dict) -> None:
        self._apply(item)
        if self.hass is not None:
            self.async_write_ha_state()

    async def async_will_remove_from_hass(self) -> None:
        registry = er.async_get(self.hass)
        if self.entity_id in registry.entities:
            registry.async_remove(self.entity_id)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return self._extra_attrs
