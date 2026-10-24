"""The "counts as new for" window, as an entity on the entry's own device
- next to the count it governs, rather than inside a dialog that reloads
the whole entry when it closes. Nothing is stored here: the entity reads
the entry it belongs to and writes back to it."""

import logging

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EntityCategory, UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES, DOMAIN
from .coordinator import TomTomCoordinator

_LOGGER = logging.getLogger(__name__)

# A week, the same ceiling the options form uses.
MAX_MINUTES = 10080


async def async_setup_entry(
    hass: HomeAssistant,
    config_entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
):
    coordinator: TomTomCoordinator = hass.data[DOMAIN][config_entry.entry_id].coordinator
    async_add_entities([NewMinutesNumber(coordinator)])


class NewMinutesNumber(CoordinatorEntity, NumberEntity):
    """How long a report counts as new, in minutes."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_entity_category = EntityCategory.CONFIG
    _attr_mode = NumberMode.BOX
    _attr_native_min_value = 0
    _attr_native_max_value = MAX_MINUTES
    _attr_native_step = 1
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_icon = "mdi:clock-alert-outline"
    _attr_translation_key = "new_minutes"

    def __init__(self, coordinator: TomTomCoordinator) -> None:
        super().__init__(coordinator)
        self._attr_unique_id = f"{DOMAIN}-new_minutes-{coordinator.entry_id}"
        self._attr_device_info = coordinator.device_info

    @property
    def available(self) -> bool:
        return True

    @property
    def native_value(self) -> float:
        return self.coordinator.entry.data.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES)

    async def async_set_native_value(self, value: float) -> None:
        minutes = int(value)
        entry = self.coordinator.entry
        if minutes == entry.data.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES):
            return
        self.hass.config_entries.async_update_entry(entry, data={**entry.data, CONF_NEW_MINUTES: minutes})
