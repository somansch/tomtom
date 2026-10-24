"""Whether an API's free tier will last the month - on the "TomTom General"
device, for an automation to pick up."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .api import PRODUCT_LABELS, SIGNAL_USAGE
from .const import DOMAIN, SEARCH_MODE_SETTINGS
from .quota import QUOTA_DATA_KEY, SIGNAL_QUOTA, QuotaWatch
from .sensor import GENERAL_DEVICE


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
):
    if config_entry.data.get("search_mode") != SEARCH_MODE_SETTINGS:
        return
    watch: QuotaWatch | None = hass.data.get(DOMAIN, {}).get(QUOTA_DATA_KEY)
    if watch is None:
        return
    async_add_entities([BinarySensorQuotaAtRisk(watch)])


class BinarySensorQuotaAtRisk(BinarySensorEntity):
    """On while at least one API is expected to outgrow its free tier this
    month - see QuotaWatch. Which ones, and every API's expected count,
    are its attributes."""

    _attr_should_poll = False
    _attr_has_entity_name = True
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_device_class = BinarySensorDeviceClass.PROBLEM
    _attr_translation_key = "quota_at_risk"
    _attr_unique_id = f"{DOMAIN}-quota_at_risk"
    _attr_device_info = GENERAL_DEVICE

    def __init__(self, watch: QuotaWatch) -> None:
        self._watch = watch

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        for signal in (SIGNAL_QUOTA, SIGNAL_USAGE):
            self.async_on_remove(async_dispatcher_connect(self.hass, signal, self.async_write_ha_state))

    @property
    def is_on(self) -> bool:
        return bool(self._watch.at_risk or self._watch.day_at_risk)

    @property
    def extra_state_attributes(self):
        projections = self._watch.projections()
        return {
            "warning": self._watch.enabled,
            "threshold_percent": self._watch.threshold,
            "lufop_warning": self._watch.day_enabled,
            "lufop_threshold_percent": self._watch.day_threshold,
            "at_risk": [PRODUCT_LABELS.get(product, product) for product in (*self._watch.at_risk, *self._watch.day_at_risk)],
            **{f"today_{product}": facts["used"] for product, facts in self._watch.day_at_risk.items()},
            **self._lufop_attributes(),
            **{f"projected_{product}": projected for product, projected in projections.items()},
        }

    def _lufop_attributes(self) -> dict:
        """What Lufop itself last said about the key's day - see QuotaWatch."""
        lufop = self._watch.lufop
        if not lufop:
            return {}
        remaining = 0 if lufop.get("used_up") else lufop.get("remaining")
        out = {}
        if remaining is not None:
            out["lufop_remaining_today"] = remaining
        if lufop.get("plan"):
            out["lufop_plan"] = lufop["plan"]
        return out
