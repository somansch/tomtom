"""The count of an entry, a live route's times, and what went to TomTom
this month."""

from __future__ import annotations

from datetime import datetime, timedelta
import logging

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.update_coordinator import CoordinatorEntity
from homeassistant.util import dt as dt_util

from .api import ENTRY_PRODUCTS, PRODUCTS, SIGNAL_USAGE, TomTomUsage, async_get_usage
from .const import (
    DOMAIN,
    FREE_TIER,
    FREE_TIER_DAY,
    SEARCH_MODE_SETTINGS,
    SOURCE_BLITZER,
    SOURCE_LUFOP,
)
from .coordinator import TomTomCoordinator, category_key
from .geo_location import local_stamp, reported_at

_LOGGER = logging.getLogger(__name__)


def _minutes_since(iso, now) -> int | None:
    """How old a report is, in minutes, from when it counts - or None."""
    then = local_stamp(iso) if isinstance(iso, str) else None
    if then is None:
        return None
    return max(0, int((now - then).total_seconds() // 60))


def _count_new(items, minutes, now) -> int:
    """How many of these were reported inside the window."""
    fresh = 0
    for item in items:
        age = _minutes_since(reported_at(item), now)
        if age is not None and age < minutes:
            fresh += 1
    return fresh


def _iso(stamp):
    return stamp.isoformat() if stamp else None


# The device the installation-wide counters live on: none of the entries',
# since the counts are everyone's, under a name of its own - "TomTom
# General" in the installation's language, from the translations.
GENERAL_DEVICE = DeviceInfo(
    identifiers={(DOMAIN, "general")},
    translation_key="general",
    manufacturer="TomTom",
    model="Usage",
    entry_type=DeviceEntryType.SERVICE,
)

# One icon per API, so the device page tells them apart at a glance.
PRODUCT_ICONS = {
    "incidents": "mdi:car-brake-alert",
    "routing": "mdi:routes",
    "geocoding": "mdi:map-search",
    "reverse_geocoding": "mdi:map-marker-question",
    "search": "mdi:magnify",
    "tiles": "mdi:grid",
    "blitzer": "mdi:cctv",
    "lufop": "mdi:map-marker-radius",
}


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
):
    usage = await async_get_usage(hass)
    if config_entry.data.get("search_mode") == SEARCH_MODE_SETTINGS:
        # The "TomTom Settings" entry: the totals across every entry on the
        # "TomTom General" device - every API TomTom bills by, and all of
        # them together - and nothing else.
        async_add_entities(
            [SensorRequestsTotal(usage), *(SensorRequestsTotal(usage, product) for product in PRODUCTS)]
        )
        return
    coordinator: TomTomCoordinator = hass.data[DOMAIN][config_entry.entry_id].coordinator

    sensors = [
        SensorReportCount(coordinator),
        # The speed cameras among them - blitzer.de's and Lufop's reports -
        # all of them, and the ones reported inside the "new" window.
        SensorSourceCount(coordinator, fresh=False),
        SensorSourceCount(coordinator, fresh=True),
        # What this entry asked TomTom this month, under Diagnostics: all
        # of it, and each API this entry is charged with on its own.
        SensorRequests(coordinator, usage),
        *(SensorRequests(coordinator, usage, product) for product in ENTRY_PRODUCTS),
    ]
    if coordinator.is_live:
        # A live route says how long it takes right now, and how much of
        # that is the traffic's doing.
        sensors.extend([
            SensorTravelTime(coordinator),
            SensorTrafficDelay(coordinator),
            SensorRouteLength(coordinator),
        ])
    async_add_entities(sensors)


class SensorReportCount(CoordinatorEntity, SensorEntity):
    """How many reports this entry delivers - capped the way its entities
    are, and every attribute counted over those same reports, so that the
    count, its parts, the card's badge and the camera sensors agree; what
    lies in range beyond the cap is "in_range". The one entity the card
    reads the entry's settings and a live route's figures from."""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_icon = "mdi:car-brake-alert"
    _attr_translation_key = "report_count"

    def __init__(self, coordinator: TomTomCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_device_info = coordinator.device_info
        self._attr_unique_id = f"{DOMAIN}-reports-{coordinator.entry_id}-total"

    @callback
    def _handle_coordinator_update(self) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self):
        return len(delivered(self.coordinator))

    @property
    def extra_state_attributes(self):
        coordinator = self.coordinator
        items = delivered(coordinator)
        attrs = {
            "state_class": SensorStateClass.MEASUREMENT,
            "last_update": _iso(coordinator.last_update),
            "search_mode": coordinator.search_mode,
            "new_minutes": coordinator.new_minutes,
            "in_range": len(coordinator.data.reports),
        }
        if coordinator.new_minutes:
            attrs["new"] = _count_new(items, coordinator.new_minutes, dt_util.now())
        # How many of each kind.
        counts: dict[str, int] = {}
        for item in items:
            key = category_key(item)
            counts[key] = counts.get(key, 0) + 1
        attrs.update(counts)
        live = coordinator.live
        if live:
            attrs["live"] = True
            attrs["travel_time_minutes"] = (
                round(live["duration"] / 60) if live.get("duration") is not None else None
            )
            attrs["traffic_delay_minutes"] = (
                round(live["delay"] / 60) if live.get("delay") is not None else None
            )
            attrs["route_distance_km"] = (
                round(live["distance"] / 1000, 1) if live.get("distance") is not None else None
            )
            attrs["route_changed"] = _iso(coordinator.route_changed_at)
        return attrs


# The sources whose reports the camera counts take in: everything blitzer.de
# and Lufop report, speed cameras, checks and police reports alike.
SOURCE_KEYS = frozenset({SOURCE_BLITZER, SOURCE_LUFOP})


def delivered(coordinator: TomTomCoordinator) -> list[dict]:
    """The reports the entry delivers: the nearest, up to its count - the
    ones its entities stand for and the card shows."""
    return coordinator.data.reports[: coordinator.count]


class SensorSourceCount(CoordinatorEntity, SensorEntity):
    """How many of the reports the entry delivers come from blitzer.de or
    Lufop: all of them, or those reported inside the "new" window -
    counted over the same reports as Reports and the card's badge, so the
    three agree; "in_range" says how many there are beyond the cap. A
    camera both sources report counts once.

    The new count ages on its own, once a minute: a poll can be an hour
    apart, and the window is as long, so a count left from the poll would
    stand at its peak the whole hour."""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, coordinator: TomTomCoordinator, fresh: bool) -> None:
        super().__init__(coordinator)
        self._fresh = fresh
        self._written = None
        self._attr_device_info = coordinator.device_info
        key = "cameras_new" if fresh else "cameras"
        self._attr_translation_key = key
        self._attr_icon = "mdi:new-box" if fresh else "mdi:cctv"
        self._attr_unique_id = f"{DOMAIN}-{key}-{coordinator.entry_id}"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        if self._fresh:
            self.async_on_remove(
                async_track_time_interval(self.hass, self._age, timedelta(minutes=1))
            )

    @callback
    def _age(self, _now) -> None:
        if sum(1 for _ in self._items()) != self._written:
            self.async_write_ha_state()

    @callback
    def _handle_coordinator_update(self) -> None:
        self.async_write_ha_state()

    def _items(self, everything: bool = False):
        """The reports that count, each with the sources that report it -
        the delivered ones, or everything in range."""
        now = dt_util.now()
        minutes = self.coordinator.new_minutes
        pool = self.coordinator.data.reports if everything else delivered(self.coordinator)
        for item in pool:
            providers = set(item.get("providers") or [item.get("provider") or "tomtom"]) & SOURCE_KEYS
            if not providers:
                continue
            if self._fresh:
                if not minutes:
                    continue
                age = _minutes_since(reported_at(item), now)
                if age is None or age >= minutes:
                    continue
            yield item, providers

    @property
    def native_value(self):
        self._written = sum(1 for _ in self._items())
        return self._written

    @property
    def extra_state_attributes(self):
        coordinator = self.coordinator
        per_source = {SOURCE_BLITZER: 0, SOURCE_LUFOP: 0}
        per_kind: dict[str, int] = {}
        for item, providers in self._items():
            for provider in providers:
                per_source[provider] += 1
            key = category_key(item)
            per_kind[key] = per_kind.get(key, 0) + 1
        attrs = {
            "last_update": _iso(coordinator.last_update),
            "in_range": sum(1 for _ in self._items(everything=True)),
        }
        if self._fresh:
            attrs["new_minutes"] = coordinator.new_minutes
        attrs.update(per_source)
        attrs.update(per_kind)
        return attrs


class SensorLiveBase(CoordinatorEntity, SensorEntity):
    """Shared plumbing for the live-route sensors: minutes out of the
    seconds TomTom sends, and the block of attributes all carry."""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = "min"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _live_field = ""

    def __init__(self, coordinator: TomTomCoordinator, key: str, icon: str) -> None:
        super().__init__(coordinator)
        self._attr_device_info = coordinator.device_info
        self._attr_translation_key = key
        self._attr_icon = icon
        self._attr_unique_id = f"{DOMAIN}-{key}-{coordinator.entry_id}"

    @callback
    def _handle_coordinator_update(self) -> None:
        self.async_write_ha_state()

    @property
    def native_value(self):
        live = self.coordinator.live or {}
        seconds = live.get(self._live_field)
        return round(seconds / 60) if seconds is not None else None

    @property
    def extra_state_attributes(self):
        live = self.coordinator.live or {}
        minutes = lambda key: round(live[key] / 60) if live.get(key) is not None else None  # noqa: E731
        distance = live.get("distance")
        return {
            "travel_time_minutes": minutes("duration"),
            "travel_time_no_traffic_minutes": minutes("duration_no_traffic"),
            "travel_time_historic_minutes": minutes("duration_historic"),
            "traffic_delay_minutes": minutes("delay"),
            "distance_km": round(distance / 1000, 1) if distance is not None else None,
            "computed_at": _iso(live.get("at")),
            "route_changed_at": _iso(self.coordinator.route_changed_at),
            "error": live.get("error"),
        }


class SensorTravelTime(SensorLiveBase):
    """How long the route takes right now, traffic included."""

    _live_field = "duration"

    def __init__(self, coordinator: TomTomCoordinator) -> None:
        super().__init__(coordinator, "travel_time", "mdi:car-clock")


class SensorTrafficDelay(SensorLiveBase):
    """How much of that is delay - the difference to a free road."""

    _live_field = "delay"

    def __init__(self, coordinator: TomTomCoordinator) -> None:
        super().__init__(coordinator, "traffic_delay", "mdi:traffic-light")


class SensorRouteLength(SensorLiveBase):
    """How long the route is right now, in kilometres."""

    _live_field = "distance"
    _attr_device_class = SensorDeviceClass.DISTANCE
    _attr_native_unit_of_measurement = "km"
    _attr_suggested_display_precision = 1

    def __init__(self, coordinator: TomTomCoordinator) -> None:
        super().__init__(coordinator, "route_length", "mdi:map-marker-distance")

    @property
    def native_value(self):
        metres = (self.coordinator.live or {}).get("distance")
        return round(metres / 1000, 1) if metres is not None else None


def _month_start(month: str):
    try:
        year, number = (int(part) for part in month.split("-", 1))
    except (AttributeError, ValueError):
        return None
    return dt_util.now().replace(year=year, month=number, day=1, hour=0, minute=0, second=0, microsecond=0)


def _day_start(day: str):
    """The midnight UTC a "2026-10-19" began with - the day's count is
    UTC's, as Lufop's is - or None."""
    try:
        year, month, number = (int(part) for part in day.split("-"))
    except (AttributeError, ValueError):
        return None
    return datetime(year, month, number, tzinfo=dt_util.UTC)


class SensorUsageBase(SensorEntity):
    """What went to TomTom this calendar month - see TomTomUsage. A total
    that starts at nought every month, so last_reset is the month's start.
    With a product it counts that API alone; without, every request, and
    the attributes say which API each went to."""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_state_class = SensorStateClass.TOTAL
    _attr_icon = "mdi:api"
    _entry: str | None = None
    _product: str | None = None

    def __init__(self, usage: TomTomUsage, product: str | None = None) -> None:
        self._usage = usage
        self._product = product
        # A source whose plan counts by the day is counted by the day here
        # too: the sensor starts again at midnight UTC, when Lufop's own
        # count does, against the day's tier.
        self._daily = bool(product) and product in FREE_TIER_DAY
        if product:
            self._attr_icon = PRODUCT_ICONS.get(product, "mdi:api")
            self._attr_translation_key = f"requests_{product}"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_USAGE, self.async_write_ha_state)
        )

    @property
    def native_value(self) -> int:
        if self._daily:
            return self._usage.breakdown_day(self._entry).get(self._product, 0)
        if self._product:
            return self._usage.breakdown(self._entry).get(self._product, 0)
        return self._usage.for_entry(self._entry)

    @property
    def last_reset(self):
        if self._daily:
            return _day_start(self._usage.day)
        return _month_start(self._usage.month)

    @property
    def extra_state_attributes(self):
        if self._daily:
            day, count = self._usage.previous_day_for(self._entry, self._product)
            attrs = {"day": self._usage.day, "previous_day": day or None, "previous_day_requests": count if day else None}
            if self._entry is None:
                free = FREE_TIER_DAY[self._product]
                used = self._usage.breakdown_day(None).get(self._product, 0)
                attrs["free_per_day"] = free
                attrs["remaining"] = max(0, free - used)
                attrs["used_percent"] = round(100 * used / free, 1)
            return attrs
        month, count = self._usage.previous_for(self._entry, self._product)
        attrs = {
            "month": self._usage.month,
            "previous_month": month or None,
            "previous_month_requests": count if month else None,
        }
        if self._product:
            # On the installation's totals, what the free tier allows and
            # how much of it is used: "268 of 200,000" at a glance.
            if self._entry is None and self._product in FREE_TIER:
                free = FREE_TIER[self._product]
                used = self._usage.breakdown(None).get(self._product, 0)
                attrs["free_per_month"] = free
                attrs["remaining"] = max(0, free - used)
                attrs["used_percent"] = round(100 * used / free, 1)
                # Where the month is heading at this pace - None in its
                # first week, when the pace is not yet worth reading.
                attrs["projected_month"] = self._usage.projection(self._product)
            return attrs
        breakdown = self._usage.breakdown(self._entry)
        return {**{product: breakdown.get(product, 0) for product in PRODUCTS}, **attrs}


class SensorRequests(SensorUsageBase):
    """This entry's requests to TomTom this month - all of them, or one
    API's."""

    def __init__(self, coordinator: TomTomCoordinator, usage: TomTomUsage, product: str | None = None) -> None:
        super().__init__(usage, product)
        self._entry = coordinator.entry_id
        if not product:
            self._attr_translation_key = "requests"
        suffix = f"-{product}" if product else ""
        self._attr_unique_id = f"{DOMAIN}-requests{suffix}-{coordinator.entry_id}"
        self._attr_device_info = coordinator.device_info


class SensorRequestsTotal(SensorUsageBase):
    """Every request to TomTom this month, all entries together - with the
    lookups of a setup and the flow tiles, which have no entry - all of
    them, or one API's. On the "TomTom General" device of the "TomTom
    Settings" entry."""

    def __init__(self, usage: TomTomUsage, product: str | None = None) -> None:
        super().__init__(usage, product)
        if not product:
            self._attr_translation_key = "requests_total"
        suffix = f"-{product}" if product else ""
        self._attr_unique_id = f"{DOMAIN}-requests_total{suffix}"
        self._attr_device_info = GENERAL_DEVICE
