"""The month's quota, watched: whether the free tier of an API will last the
month at the pace so far - said as a repair, and as a binary sensor on the
"TomTom General" device."""

from __future__ import annotations

import asyncio
from datetime import timedelta
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import issue_registry as ir
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.helpers.event import async_track_time_interval, async_track_utc_time_change
from homeassistant.util import dt as dt_util

from .api import PRODUCT_LABELS, PRODUCT_LUFOP, SIGNAL_USAGE, TomTomUsage
from .const import (
    CONF_LUFOP_API_KEY,
    CONF_LUFOP_QUOTA_THRESHOLD,
    CONF_LUFOP_QUOTA_WARNING,
    CONF_QUOTA_THRESHOLD,
    CONF_QUOTA_WARNING,
    CONF_SOURCE_LUFOP,
    DEFAULT_LUFOP_QUOTA_THRESHOLD,
    DEFAULT_QUOTA_THRESHOLD,
    DOMAIN,
    FREE_TIER,
    FREE_TIER_DAY,
)
from .sources import SourceError, async_lufop_usage

SIGNAL_QUOTA = f"{DOMAIN}_quota"
QUOTA_DATA_KEY = "quota"

# The repair's numbers are refreshed this often at most: every request
# counted would otherwise rewrite the issue.
_LOGGER = logging.getLogger(__name__)
ISSUE_REFRESH = timedelta(hours=1)
# How often Lufop itself is asked about the key's day - a call that costs
# no quota, but takes its place in the minute's ten like any other.
LUFOP_USAGE_EVERY = timedelta(minutes=15)


def issue_id(product: str) -> str:
    return f"quota_{product}"


def day_issue_id(product: str) -> str:
    return f"quota_day_{product}"


def _next_utc_midnight_local() -> str:
    """The next midnight UTC, when Lufop's day turns, as local time -
    "02:00" in a Berlin summer."""
    now = dt_util.utcnow()
    midnight = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return dt_util.as_local(midnight).strftime("%H:%M")


class QuotaWatch:
    """Looks at every API's count whenever one changes, and once an hour
    besides - the projection sinks with time even while nothing is asked -
    and keeps a repair per API whose free tier the month will outgrow.

    What it says is this integration's own count: a key used elsewhere
    stands higher at TomTom than here.
    """

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, usage: TomTomUsage) -> None:
        self._hass = hass
        self._entry = entry
        self._usage = usage
        self._unsubscribe: list = []
        self._issue_stamps: dict[str, object] = {}
        # product -> {"used", "tier", "projected"} for every API at risk.
        self.at_risk: dict[str, dict] = {}
        # product -> {"used", "tier"} for every source past the share of
        # its day's plan - no projection there: the day is short, and what
        # is used is used.
        self.day_at_risk: dict[str, dict] = {}
        # What Lufop itself last said about the key's day - which covers
        # whatever else uses the key - stamped with the day it is for.
        self.lufop: dict = {}
        self._lufop_asked = None
        self._lufop_task: asyncio.Task | None = None

    @property
    def enabled(self) -> bool:
        return bool(self._entry.options.get(CONF_QUOTA_WARNING, True))

    @property
    def threshold(self) -> int:
        try:
            return int(self._entry.options.get(CONF_QUOTA_THRESHOLD, DEFAULT_QUOTA_THRESHOLD))
        except (TypeError, ValueError):
            return DEFAULT_QUOTA_THRESHOLD

    @property
    def day_enabled(self) -> bool:
        """Lufop's day has a switch of its own - see the second section of
        the quota warning step."""
        return bool(self._entry.options.get(CONF_LUFOP_QUOTA_WARNING, True))

    @property
    def day_threshold(self) -> int:
        try:
            return int(self._entry.options.get(CONF_LUFOP_QUOTA_THRESHOLD, DEFAULT_LUFOP_QUOTA_THRESHOLD))
        except (TypeError, ValueError):
            return DEFAULT_LUFOP_QUOTA_THRESHOLD

    @callback
    def start(self) -> None:
        self._unsubscribe.append(async_dispatcher_connect(self._hass, SIGNAL_USAGE, self.evaluate))
        self._unsubscribe.append(async_track_time_interval(self._hass, self._tick, ISSUE_REFRESH))
        # Lufop's day ends at midnight UTC: looked at then, so the day's
        # count and its repair turn over on the minute rather than with the
        # next hourly look or the next request.
        self._unsubscribe.append(
            async_track_utc_time_change(self._hass, self._tick, hour=0, minute=0, second=5)
        )
        self.evaluate()

    @callback
    def _tick(self, _now) -> None:
        """The timers' way in. Marked a callback, so it runs in the event
        loop: a plain lambda is not one, and Home Assistant ran it in a
        worker thread instead - where the issue registry refuses to be
        touched, and the hourly look and the one at midnight UTC failed."""
        self.evaluate()

    @callback
    def stop(self) -> None:
        for unsubscribe in self._unsubscribe:
            unsubscribe()
        self._unsubscribe = []

    @callback
    def _ask_lufop(self, now) -> None:
        """Asks Lufop about the key's day every quarter of an hour while the
        source is on - in a task of its own, so the count that led here is
        not held up."""
        options = self._entry.options
        key = str(options.get(CONF_LUFOP_API_KEY) or "").strip()
        if not options.get(CONF_SOURCE_LUFOP) or not key:
            self.lufop = {}
            return
        if self._lufop_asked is not None and now - self._lufop_asked < LUFOP_USAGE_EVERY:
            return
        if self._lufop_task is not None and not self._lufop_task.done():
            return
        self._lufop_asked = now
        self._lufop_task = self._hass.async_create_task(self._fetch_lufop(key))

    async def _fetch_lufop(self, key: str) -> None:
        try:
            answer = await async_lufop_usage(self._hass, key)
        except SourceError as err:
            _LOGGER.debug("Lufop gave no key document: %s", err)
            return
        self.lufop = {**answer, "day": self._usage.day}
        self.evaluate()
        async_dispatcher_send(self._hass, SIGNAL_QUOTA)

    @callback
    def projections(self) -> dict[str, int | None]:
        """Every API's expected count by the month's end - None in the
        first week of the month."""
        return {product: self._usage.projection(product) for product in FREE_TIER}

    @callback
    def evaluate(self) -> None:
        now = dt_util.now()
        enabled = self.enabled
        threshold = self.threshold
        counts = self._usage.breakdown(None)
        risk: dict[str, dict] = {}
        for product, tier in FREE_TIER.items():
            projected = self._usage.projection(product, now)
            if not enabled or projected is None or projected <= tier * threshold / 100:
                continue
            risk[product] = {"used": counts.get(product, 0), "tier": tier, "projected": projected}

        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        for product in FREE_TIER:
            if product not in risk:
                # Taken down whether or not this watch put it up: a watch
                # made again by a reload, with the warning switched off
                # meanwhile, has no stamps and still has to clear the slate.
                self._issue_stamps.pop(product, None)
                ir.async_delete_issue(self._hass, DOMAIN, issue_id(product))
                continue
            stamp = self._issue_stamps.get(product)
            if stamp is not None and now - stamp < ISSUE_REFRESH:
                continue
            self._issue_stamps[product] = now
            facts = risk[product]
            ir.async_create_issue(
                self._hass,
                DOMAIN,
                issue_id(product),
                is_fixable=False,
                severity=ir.IssueSeverity.WARNING,
                translation_key="quota_at_risk",
                translation_placeholders={
                    "api": PRODUCT_LABELS.get(product, product),
                    "used": str(facts["used"]),
                    "tier": str(facts["tier"]),
                    "projected": str(facts["projected"]),
                    "days": str((now - start).days),
                    "percent": str(threshold),
                },
            )

        self._ask_lufop(now)
        day_counts = self._usage.breakdown_day(None)
        day_risk: dict[str, dict] = {}
        for product, tier in FREE_TIER_DAY.items():
            used = day_counts.get(product, 0)
            # Lufop's own figures win over this installation's count while
            # they are today's: the key may be used elsewhere too, and Lufop
            # counts all of it - against its plan's limit, not the free one.
            if product == PRODUCT_LUFOP and self.lufop.get("day") == self._usage.day:
                if self.lufop.get("limit"):
                    tier = self.lufop["limit"]
                if self.lufop.get("used_up"):
                    used = max(used, tier)
                elif self.lufop.get("used") is not None:
                    used = max(used, self.lufop["used"])
            if self.day_enabled and used >= tier * self.day_threshold / 100:
                day_risk[product] = {"used": used, "tier": tier, "used_up": used >= tier}
            used_up_id = day_issue_id(product) + "_used_up"
            if product in day_risk:
                # Two voices: the day nearly spent, and the day spent - from
                # then on Lufop refuses every request until midnight UTC,
                # which the repair gives in local time too.
                used_up = day_risk[product]["used_up"]
                ir.async_delete_issue(self._hass, DOMAIN, day_issue_id(product) if used_up else used_up_id)
                ir.async_create_issue(
                    self._hass,
                    DOMAIN,
                    used_up_id if used_up else day_issue_id(product),
                    is_fixable=False,
                    severity=ir.IssueSeverity.WARNING,
                    translation_key="quota_day_used_up" if used_up else "quota_day_at_risk",
                    translation_placeholders={
                        "api": PRODUCT_LABELS.get(product, product),
                        "used": str(used),
                        "tier": str(tier),
                        "percent": str(self.day_threshold),
                        "reset": _next_utc_midnight_local(),
                    },
                )
            else:
                ir.async_delete_issue(self._hass, DOMAIN, day_issue_id(product))
                ir.async_delete_issue(self._hass, DOMAIN, used_up_id)

        if risk != self.at_risk or day_risk != self.day_at_risk:
            self.at_risk = risk
            self.day_at_risk = day_risk
            async_dispatcher_send(self._hass, SIGNAL_QUOTA)
