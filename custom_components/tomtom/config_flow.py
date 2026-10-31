"""Setting an entry up, and changing one: the key, then a radius, a tracker,
or a route TomTom works out - each with the two halves'
categories and the shared settings below them."""

from __future__ import annotations

import json
import logging

import voluptuous as vol

from homeassistant.config_entries import SOURCE_IMPORT, ConfigFlow, OptionsFlow
from homeassistant.const import CONF_COUNT, CONF_LOCATION, CONF_NAME, Platform, UnitOfLength
from homeassistant.core import callback
from homeassistant.data_entry_flow import section
from homeassistant.helpers.selector import selector
from homeassistant.helpers.translation import async_get_translations
from homeassistant.util import slugify

from .api import (
    TomTomAddressNotFound,
    TomTomAuthError,
    TomTomClient,
    TomTomError,
    TomTomLimitExceeded,
    TomTomNoRoute,
    TomTomPointNotRoutable,
    TomTomQuotaError,
    TomTomRateError,
    async_load_key,
    async_save_key,
)
from .planner import route_defaults
from .sources import LufopKeyError, async_check_lufop_key
from .const import (
    CONF_API_KEY,
    CONF_DEFAULT_START,
    CONF_LUFOP_QUOTA_THRESHOLD,
    CONF_LUFOP_QUOTA_WARNING,
    CONF_QUOTA_THRESHOLD,
    CONF_QUOTA_WARNING,
    CONF_LUFOP_API_KEY,
    CONF_LUFOP_COUNTRY,
    CONF_SOURCE_BLITZER,
    CONF_SOURCE_LUFOP,
    LUFOP_COUNTRIES,
    DEFAULT_LUFOP_QUOTA_THRESHOLD,
    DEFAULT_QUOTA_THRESHOLD,
    CONF_BLACKLIST,
    CONF_LIVE_BACK_FROM,
    CONF_LIVE_BACK_UNTIL,
    CONF_LIVE_DAYS,
    CONF_LIVE_FROM,
    CONF_LIVE_UNTIL,
    CONF_NEW_MINUTES,
    CONF_ONLY_CERTAIN,
    CONF_JAM_MIN_DELAY,
    DEFAULT_JAM_MIN_DELAY,
    CONF_RETURN_NAME,
    CONF_RETURN_ROUTE,
    CONF_ROADS,
    CONF_ROUTE_DESTINATION,
    CONF_ROUTE_DISTANCE,
    CONF_ROUTE_DURATION,
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
    CATEGORY_DEFAULTS,
    CONF_CATEGORIES,
    LIST_KIND_DEFAULTS,
    SHARED_SOURCE_KINDS,
    SOURCE_BLITZER,
    SOURCE_LUFOP,
    source_flag,
    DEFAULT_COUNT,
    LIVE_DAYS,
    MAX_AREA_RADIUS_M,
    MAX_ROUTE_VIAS,
    PLACE_KIND_ADDRESS,
    PLACE_KIND_POINT,
    PLACE_KIND_ZONE,
    SEARCH_MODE_AREA,
    SEARCH_MODE_ROUTE_LIVE,
    SEARCH_MODE_SETTINGS,
    SEARCH_MODE_TRACKER,
    SETTINGS_GEAR,
    SETTINGS_TITLE,
    SETTINGS_UNIQUE_ID,
    LUFOP_SIGNUP_URL,
    TOMTOM_SIGNUP_URL,
    tracker_position,
)

_LOGGER = logging.getLogger(__name__)

# What a TomTom failure is called in the form. Order matters: TomTomError is
# the base class.
_ERRORS = (
    (TomTomAuthError, "invalid_api_key"),
    (TomTomQuotaError, "quota_exceeded"),
    (TomTomRateError, "rate_limited"),
    (TomTomAddressNotFound, "address_not_found"),
    (TomTomPointNotRoutable, "point_not_routable"),
    (TomTomNoRoute, "no_route"),
    (TomTomLimitExceeded, "route_too_long"),
    (TomTomError, "cannot_connect"),
)


def _error_key(err: TomTomError) -> str:
    _LOGGER.warning("TomTom: %s", err)
    for kind, key in _ERRORS:
        if isinstance(err, kind):
            return key
    return "cannot_connect"


def _title(name: str) -> str:
    return f"TomTom {name}"


# --------------------------------------------------------------- the forms

def _selected(defaults: dict | None, fallbacks: dict) -> list[str]:
    defaults = defaults or {}
    return [key for key, fallback in fallbacks.items() if defaults.get(key, fallback)]


def _as_flags(selected, fallbacks: dict) -> dict:
    """The multi-select's list, back as the flag dict that gets stored."""
    if not isinstance(selected, (list, tuple, set)):
        return dict(fallbacks)
    return {key: key in selected for key in fallbacks}


def _flags_field(key: str, defaults: dict | None, fallbacks: dict, translation_key: str):
    """One multi-select in list mode instead of one switch per category."""
    return {
        vol.Required(key, default=_selected(defaults, fallbacks)): selector(
            {
                "select": {
                    "multiple": True,
                    "mode": "list",
                    "options": list(fallbacks),
                    "translation_key": translation_key,
                    "sort": False,
                }
            }
        )
    }


def _optional_section(defaults: dict | None = None):
    """The settings every mode shares, below the categories: what is kept,
    how often it is asked, what counts as new, and the two filters."""
    defaults = defaults or {}
    return section(
        vol.Schema(
            {
                vol.Required(CONF_ONLY_CERTAIN, default=defaults.get(CONF_ONLY_CERTAIN, True)): bool,
                # A jam below this delay is not reported; 0 reports every jam.
                vol.Required(
                    CONF_JAM_MIN_DELAY, default=defaults.get(CONF_JAM_MIN_DELAY, DEFAULT_JAM_MIN_DELAY)
                ): vol.All(vol.Coerce(int), vol.Range(min=0, max=600)),
                vol.Required(CONF_COUNT, default=defaults.get(CONF_COUNT, DEFAULT_COUNT)): vol.All(
                    vol.Coerce(int), vol.Range(min=1, max=500)
                ),
                # 0 = no automatic polling at all - rely on the "refresh"
                # action instead. Any other value is minutes between polls.
                vol.Required(
                    CONF_UPDATE_INTERVAL,
                    default=defaults.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
                ): vol.All(vol.Coerce(int), vol.Range(min=0, max=1440)),
                vol.Required(
                    CONF_NEW_MINUTES, default=defaults.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES)
                ): vol.All(vol.Coerce(int), vol.Range(min=0, max=10080)),
                # vol.Optional with a suggested value rather than a default:
                # a default would come back every time the field is cleared,
                # because the frontend omits an empty optional text field.
                vol.Optional(CONF_ROADS, description={"suggested_value": defaults.get(CONF_ROADS, "")}): str,
                vol.Optional(CONF_BLACKLIST, description={"suggested_value": defaults.get(CONF_BLACKLIST, "")}): str,
            }
        ),
        {"collapsed": True},
    )


def _kind_section(kind: str, flags: dict) -> section:
    """A kind both sources answer: a section named after the kind, open,
    with one switch per source - no switch for the kind itself. An entry
    from before the switches existed shows both as the kind was: a kind
    switched off stays off until somebody switches a source on."""
    was = bool(flags.get(kind, True))
    return section(
        vol.Schema(
            {
                vol.Required(SOURCE_BLITZER, default=bool(flags.get(source_flag(kind, SOURCE_BLITZER), was))): bool,
                vol.Required(SOURCE_LUFOP, default=bool(flags.get(source_flag(kind, SOURCE_LUFOP), was))): bool,
            }
        ),
        {"collapsed": False},
    )


def _type_fields(data: dict | None) -> dict:
    data = data or {}
    flags = data.get(CONF_CATEGORIES) or {}
    return {
        **_flags_field(CONF_CATEGORIES, flags, LIST_KIND_DEFAULTS, "category"),
        **{vol.Required(f"kind_{kind}"): _kind_section(kind, flags) for kind in SHARED_SOURCE_KINDS},
        vol.Required("optional"): _optional_section(_optional_defaults(data)),
    }


def _optional_defaults(data: dict | None) -> dict:
    data = data or {}
    return {
        CONF_ONLY_CERTAIN: data.get(CONF_ONLY_CERTAIN, True),
        CONF_JAM_MIN_DELAY: data.get(CONF_JAM_MIN_DELAY, DEFAULT_JAM_MIN_DELAY),
        CONF_COUNT: data.get(CONF_COUNT, DEFAULT_COUNT),
        CONF_UPDATE_INTERVAL: data.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
        CONF_NEW_MINUTES: data.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES),
        CONF_ROADS: data.get(CONF_ROADS, ""),
        CONF_BLACKLIST: data.get(CONF_BLACKLIST, ""),
    }


def _common_data(user_input: dict) -> dict:
    """Everything below the search geometry, out of a submitted form."""
    optional = user_input.get("optional", {})
    flags = _as_flags(user_input.get(CONF_CATEGORIES), LIST_KIND_DEFAULTS)
    for kind in SHARED_SOURCE_KINDS:
        chosen = user_input.get(f"kind_{kind}") or {}
        blitzer = bool(chosen.get(SOURCE_BLITZER, True))
        lufop = bool(chosen.get(SOURCE_LUFOP, True))
        flags[source_flag(kind, SOURCE_BLITZER)] = blitzer
        flags[source_flag(kind, SOURCE_LUFOP)] = lufop
        flags[kind] = blitzer or lufop
    return {
        CONF_CATEGORIES: flags,
        CONF_ONLY_CERTAIN: optional.get(CONF_ONLY_CERTAIN, True),
        CONF_JAM_MIN_DELAY: optional.get(CONF_JAM_MIN_DELAY, DEFAULT_JAM_MIN_DELAY),
        CONF_COUNT: optional.get(CONF_COUNT, DEFAULT_COUNT),
        CONF_UPDATE_INTERVAL: optional.get(CONF_UPDATE_INTERVAL, DEFAULT_UPDATE_INTERVAL),
        CONF_NEW_MINUTES: optional.get(CONF_NEW_MINUTES, DEFAULT_NEW_MINUTES),
        CONF_ROADS: optional.get(CONF_ROADS, ""),
        CONF_BLACKLIST: optional.get(CONF_BLACKLIST, ""),
    }


def _area_schema(hass, data: dict | None):
    data = data or {}
    default = data.get(CONF_LOCATION) or {
        "latitude": hass.config.latitude,
        "longitude": hass.config.longitude,
        "radius": 1000,
    }
    return vol.Schema(
        {
            vol.Required(CONF_LOCATION, default=default): selector({"location": {"radius": True}}),
            **_type_fields(data),
        }
    )


def _tracker_choices(hass, current=None) -> list[str]:
    """The device trackers worth offering: those reporting a position now;
    the one already saved stays on the list while it is briefly without a
    fix."""
    choices = [
        state.entity_id
        for state in hass.states.async_all(Platform.DEVICE_TRACKER)
        if tracker_position(state) is not None
    ]
    if current and current.startswith(f"{Platform.DEVICE_TRACKER}.") and current not in choices:
        choices.append(current)
    return sorted(choices)


def _tracker_schema(choices: list[str], data: dict | None):
    data = data or {}
    return vol.Schema(
        {
            vol.Required(CONF_TRACKER, description={"suggested_value": data.get(CONF_TRACKER)}): selector(
                {"entity": {"include_entities": choices}}
            ),
            vol.Required(CONF_TRACKER_RADIUS, default=data.get(CONF_TRACKER_RADIUS, DEFAULT_TRACKER_RADIUS)): vol.All(
                vol.Coerce(int), vol.Range(min=50, max=MAX_AREA_RADIUS_M)
            ),
            **_type_fields(data),
        }
    )


def _live_fields(defaults: dict, back: bool = False) -> dict:
    """The fields that say when a live route is kept up to date: the days,
    from when to when - and, while the way back is on offer, from when to
    when for that one, since it is driven at another time of day."""
    hours = {
        vol.Optional(CONF_LIVE_BACK_FROM, default=defaults.get(CONF_LIVE_BACK_FROM) or "00:00:00"): selector(
            {"time": {}}
        ),
        vol.Optional(CONF_LIVE_BACK_UNTIL, default=defaults.get(CONF_LIVE_BACK_UNTIL) or "00:00:00"): selector(
            {"time": {}}
        ),
    } if back else {}
    return {
        vol.Optional(CONF_LIVE_DAYS, default=list(defaults.get(CONF_LIVE_DAYS) or LIVE_DAYS)): selector(
            {"select": {"multiple": True, "mode": "list", "options": list(LIVE_DAYS), "translation_key": "live_days"}}
        ),
        vol.Optional(CONF_LIVE_FROM, default=defaults.get(CONF_LIVE_FROM) or "00:00:00"): selector({"time": {}}),
        vol.Optional(CONF_LIVE_UNTIL, default=defaults.get(CONF_LIVE_UNTIL) or "00:00:00"): selector({"time": {}}),
        **hours,
    }


def _route_review_schema(data: dict | None, offer_return: bool, return_name_default: str):
    """The live route's settings: its hours, the way back while one is
    being set up, and the shared fields."""
    data = data or {}
    return vol.Schema(
        {
            **(
                {
                    vol.Required(CONF_RETURN_ROUTE, default=bool(data.get(CONF_RETURN_ROUTE, False))): bool,
                    vol.Optional(CONF_RETURN_NAME, default=return_name_default): str,
                }
                if offer_return
                else {}
            ),
            **_live_fields(data, back=offer_return),
            **_type_fields(data),
        }
    )


def build_route_entry_data(
    route: dict, start: dict, destination: dict, vias: list, live: dict, common: dict, reverse: bool = False
) -> dict:
    """A live route entry's data: its geometry as TomTom worked it out, its
    hours, and the shared settings - the way back with the ends swapped
    and the hours meant for it. Used by the wizard and by the card."""
    vias = list(vias or [])
    return {
        CONF_SEARCH_MODE: SEARCH_MODE_ROUTE_LIVE,
        CONF_LIVE_DAYS: list(live.get(CONF_LIVE_DAYS) or []),
        CONF_LIVE_FROM: live.get(CONF_LIVE_BACK_FROM if reverse else CONF_LIVE_FROM) or "00:00:00",
        CONF_LIVE_UNTIL: live.get(CONF_LIVE_BACK_UNTIL if reverse else CONF_LIVE_UNTIL) or "00:00:00",
        CONF_ROUTE_START: destination if reverse else start,
        CONF_ROUTE_DESTINATION: start if reverse else destination,
        CONF_ROUTE_VIAS: vias[::-1] if reverse else vias,
        CONF_WAYPOINTS: [{"latitude": lat, "longitude": lon} for lat, lon in route["points"]],
        CONF_ROUTE_DISTANCE: route.get("distance"),
        CONF_ROUTE_DURATION: route.get("duration"),
        **common,
    }


def _route_defaults_schema(options: dict):
    """Defaults for new routes, under TomTom Settings: what the wizard's
    last step asks, plus the start a route made on the card begins with,
    and whether the way back is made along with it."""
    return vol.Schema(
        {
            vol.Optional(CONF_DEFAULT_START, description={"suggested_value": options.get(CONF_DEFAULT_START) or None}): selector(
                {"entity": {"filter": [{"domain": "person"}, {"domain": "device_tracker"}, {"domain": "zone"}]}}
            ),
            vol.Required(CONF_RETURN_ROUTE, default=bool(options.get(CONF_RETURN_ROUTE, False))): bool,
            **_live_fields(options, back=True),
            **_type_fields(options),
        }
    )


def _defaults_from_input(user_input: dict) -> dict:
    """The defaults step's answers as the settings entry's options."""
    return {
        CONF_DEFAULT_START: user_input.get(CONF_DEFAULT_START) or "",
        CONF_RETURN_ROUTE: bool(user_input.get(CONF_RETURN_ROUTE)),
        CONF_LIVE_DAYS: list(user_input.get(CONF_LIVE_DAYS) or []),
        CONF_LIVE_FROM: user_input.get(CONF_LIVE_FROM) or "00:00:00",
        CONF_LIVE_UNTIL: user_input.get(CONF_LIVE_UNTIL) or "00:00:00",
        CONF_LIVE_BACK_FROM: user_input.get(CONF_LIVE_BACK_FROM) or "00:00:00",
        CONF_LIVE_BACK_UNTIL: user_input.get(CONF_LIVE_BACK_UNTIL) or "00:00:00",
        **_common_data(user_input),
    }


async def _settings_title(hass) -> str:
    """The settings entry's title, in the installation's language, the way
    the device on it is named - "TomTom Settings" where no translation
    exists - with a gear in front. The integrations page lists entries by
    title, in the language's own order, and a symbol stands before any
    letter in every language: the settings entry is first whatever the
    other entries are called."""
    words = await async_get_translations(hass, hass.config.language, "device", {DOMAIN})
    return f"{SETTINGS_GEAR} {words.get(f'component.{DOMAIN}.device.settings.name') or SETTINGS_TITLE}"


def _same_place(a, b) -> bool:
    if not isinstance(a, dict) or not isinstance(b, dict):
        return False
    try:
        return (
            round(float(a["latitude"]), 5) == round(float(b["latitude"]), 5)
            and round(float(a["longitude"]), 5) == round(float(b["longitude"]), 5)
        )
    except (KeyError, TypeError, ValueError):
        return False


# ---------------------------------------------------------------- the key

class _KeyStep:
    """The key screen, for both flows. Saved for the installation; a flow
    says what comes after it through _after_key."""

    async def _after_key(self):
        raise NotImplementedError

    def _usage_entry_id(self) -> str | None:
        return None

    async def async_step_key(self, user_input=None):
        errors = {}
        saved = await async_load_key(self.hass)
        if user_input is not None:
            key = (user_input.get(CONF_API_KEY) or "").strip() or saved
            if not key:
                errors["base"] = "api_key_required"
            else:
                try:
                    await TomTomClient(self.hass, key, self._usage_entry_id()).async_check_key()
                except TomTomError as err:
                    errors["base"] = _error_key(err)
                else:
                    if key != saved:
                        await async_save_key(self.hass, key)
                    return await self._after_key()
        # Never filled in: a form's suggested value travels to the browser,
        # password field or not. A key already there is kept by leaving the
        # field empty.
        key_field = vol.Optional(CONF_API_KEY) if saved else vol.Required(CONF_API_KEY)
        return self.async_show_form(
            step_id="key",
            data_schema=vol.Schema({key_field: selector({"text": {"type": "password"}})}),
            errors=errors,
            description_placeholders={"url": TOMTOM_SIGNUP_URL},
            last_step=False,
        )


# ------------------------------------------------------------- live route

class _LiveRouteSteps:
    """The steps of a "Route (start/destination)" entry, for both flows:
    start, destination, optional vias, then the route on a map with the
    settings below it. Each flow says what "done" means through
    _route_finish, and what is already saved through _route_saved."""

    _route_start: dict | None = None
    _route_destination: dict | None = None
    _route_vias: list | None = None
    _route: dict | None = None
    _route_failure: str | None = None
    _route_pending: dict | None = None
    _offers_return = False

    def _route_saved(self) -> dict:
        # A new route starts from the defaults under TomTom Settings.
        return route_defaults(self.hass)

    def _route_load_saved(self) -> None:
        saved = self._route_saved()
        self._route_start = saved.get(CONF_ROUTE_START)
        self._route_destination = saved.get(CONF_ROUTE_DESTINATION)
        self._route_vias = list(saved.get(CONF_ROUTE_VIAS, []))
        self._route = None

    def _home(self) -> tuple[float, float]:
        return (self.hass.config.latitude, self.hass.config.longitude)

    async def _client(self) -> TomTomClient:
        return TomTomClient(self.hass, await async_load_key(self.hass), self._usage_entry_id())

    # --- start and destination ----------------------------------------

    async def async_step_route_start(self, user_input=None):
        return self.async_show_menu(
            step_id="route_start",
            menu_options=["route_start_zone", "route_start_point", "route_start_address"],
        )

    async def async_step_route_destination(self, user_input=None):
        return self.async_show_menu(
            step_id="route_destination",
            menu_options=["route_destination_zone", "route_destination_point", "route_destination_address"],
        )

    async def async_step_route_start_zone(self, user_input=None):
        return await self._end_step("start", PLACE_KIND_ZONE, user_input)

    async def async_step_route_start_point(self, user_input=None):
        return await self._end_step("start", PLACE_KIND_POINT, user_input)

    async def async_step_route_start_address(self, user_input=None):
        return await self._end_step("start", PLACE_KIND_ADDRESS, user_input)

    async def async_step_route_destination_zone(self, user_input=None):
        return await self._end_step("destination", PLACE_KIND_ZONE, user_input)

    async def async_step_route_destination_point(self, user_input=None):
        return await self._end_step("destination", PLACE_KIND_POINT, user_input)

    async def async_step_route_destination_address(self, user_input=None):
        return await self._end_step("destination", PLACE_KIND_ADDRESS, user_input)

    def _current_end(self, end: str) -> dict:
        attr = self._route_start if end == "start" else self._route_destination
        saved = self._route_saved().get(CONF_ROUTE_START if end == "start" else CONF_ROUTE_DESTINATION)
        return attr or saved or {}

    async def _end_step(self, end: str, kind: str, user_input):
        step_id = f"route_{end}_{kind}"
        current = self._current_end(end)
        same_kind = current.get("kind") == kind
        errors = {}
        if user_input is not None:
            place = None
            if kind == PLACE_KIND_ZONE:
                zone = user_input["zone"]
                state = self.hass.states.get(zone)
                if state and state.attributes.get("latitude") is not None:
                    place = {
                        "kind": kind,
                        "zone": zone,
                        "latitude": float(state.attributes["latitude"]),
                        "longitude": float(state.attributes["longitude"]),
                        "label": state.attributes.get("friendly_name") or zone,
                    }
                else:
                    errors["base"] = "zone_without_position"
            elif kind == PLACE_KIND_POINT:
                loc = user_input[CONF_LOCATION]
                lat, lon = float(loc["latitude"]), float(loc["longitude"])
                place = {"kind": kind, "latitude": lat, "longitude": lon, "label": f"{lat:.5f}, {lon:.5f}"}
            else:
                text = user_input["address"].strip()
                try:
                    lat, lon, label = await (await self._client()).async_geocode(text)
                except TomTomError as err:
                    errors["base"] = _error_key(err)
                else:
                    # Not taken yet: a geocoder's best match can be the right
                    # street in the wrong town.
                    self._route_pending = {"kind": kind, "address": text, "latitude": lat, "longitude": lon, "label": label}
                    return await self._confirm_step(end, None)
            if place:
                return await self._accept_end(end, place)

        if kind == PLACE_KIND_ZONE:
            field = {
                vol.Required("zone", description={"suggested_value": current.get("zone") if same_kind else None}): selector(
                    {"entity": {"domain": "zone"}}
                )
            }
        elif kind == PLACE_KIND_POINT:
            home = self._home()
            default = (
                {"latitude": current["latitude"], "longitude": current["longitude"]}
                if current.get("latitude") is not None
                else {"latitude": home[0], "longitude": home[1]}
            )
            field = {vol.Required(CONF_LOCATION, default=default): selector({"location": {}})}
        else:
            field = {
                vol.Required("address", description={"suggested_value": current.get("address") if same_kind else None}): str
            }
        return self.async_show_form(step_id=step_id, data_schema=vol.Schema(field), errors=errors, last_step=False)

    async def _accept_end(self, end: str, place: dict):
        current = self._route_start if end == "start" else self._route_destination
        if not _same_place(current, place):
            self._route = None
        if end == "start":
            self._route_start = place
            return await self.async_step_route_destination()
        self._route_destination = place
        return await self.async_step_route_vias()

    async def async_step_route_start_address_confirm(self, user_input=None):
        return await self._confirm_step("start", user_input)

    async def async_step_route_destination_address_confirm(self, user_input=None):
        return await self._confirm_step("destination", user_input)

    async def _confirm_step(self, end: str, user_input):
        pending = self._route_pending
        errors = {}
        shown = pending["label"]
        if user_input is not None:
            text = user_input["address"].strip()
            if text in (pending["label"], pending["address"]):
                self._route_pending = None
                return await self._accept_end(end, pending)
            try:
                lat, lon, label = await (await self._client()).async_geocode(text)
            except TomTomError as err:
                errors["base"] = _error_key(err)
                shown = text
            else:
                pending = self._route_pending = {
                    "kind": PLACE_KIND_ADDRESS, "address": text, "latitude": lat, "longitude": lon, "label": label,
                }
                shown = label
        return self.async_show_form(
            step_id=f"route_{end}_address_confirm",
            data_schema=vol.Schema({vol.Required("address", description={"suggested_value": shown}): str}),
            description_placeholders={"label": pending["label"]},
            errors=errors,
            last_step=False,
        )

    # --- vias ------------------------------------------------------------

    async def async_step_route_vias(self, user_input=None):
        if self._route_vias is None:
            self._route_vias = list(self._route_saved().get(CONF_ROUTE_VIAS, []))
        options = []
        if len(self._route_vias) < MAX_ROUTE_VIAS:
            options.append("route_via")
        if self._route_vias:
            options.append("route_vias_clear")
        options.append("route_review")
        return self.async_show_menu(
            step_id="route_vias",
            menu_options=options,
            description_placeholders={
                "start": (self._route_start or {}).get("label", ""),
                "destination": (self._route_destination or {}).get("label", ""),
                "count": str(len(self._route_vias)),
            },
        )

    async def async_step_route_vias_clear(self, user_input=None):
        self._route_vias = []
        self._route = None
        return await self.async_step_route_vias()

    async def async_step_route_via(self, user_input=None):
        if user_input is not None:
            loc = user_input[CONF_LOCATION]
            self._route_vias.append({"latitude": float(loc["latitude"]), "longitude": float(loc["longitude"])})
            self._route = None
            return await self.async_step_route_vias()
        last = self._route_vias[-1] if self._route_vias else self._route_start
        dest = self._route_destination
        default = {
            "latitude": (last["latitude"] + dest["latitude"]) / 2,
            "longitude": (last["longitude"] + dest["longitude"]) / 2,
        }
        return self.async_show_form(
            step_id="route_via",
            data_schema=vol.Schema({vol.Required(CONF_LOCATION, default=default): selector({"location": {}})}),
            description_placeholders={"count": str(len(self._route_vias) + 1)},
            last_step=False,
        )

    # --- the route ---------------------------------------------------------

    def _return_name(self) -> str:
        return ""

    def _name_taken(self, name: str) -> bool:
        wanted = slugify(name)
        return wanted == slugify(getattr(self, "_name", "") or "") or any(
            slugify(entry.data.get(CONF_NAME, "")) == wanted
            for entry in self.hass.config_entries.async_entries(DOMAIN)
        )

    def _route_points(self) -> list[tuple[float, float]]:
        return [
            (self._route_start["latitude"], self._route_start["longitude"]),
            *[(v["latitude"], v["longitude"]) for v in (self._route_vias or [])],
            (self._route_destination["latitude"], self._route_destination["longitude"]),
        ]

    def _route_entry_data(self, route: dict, user_input: dict, reverse: bool = False) -> dict:
        return build_route_entry_data(
            route, self._route_start, self._route_destination, self._route_vias, user_input,
            _common_data(user_input), reverse,
        )

    async def async_step_route_review(self, user_input=None):
        saved = self._route_saved()
        errors = {}
        if user_input is not None and self._route:
            route = self._route
            data = self._route_entry_data(route, user_input)
            if user_input.get(CONF_RETURN_ROUTE):
                back_name = (user_input.get(CONF_RETURN_NAME) or "").strip() or self._return_name()
                if self._name_taken(back_name):
                    errors[CONF_RETURN_NAME] = "return_name_taken"
                else:
                    try:
                        back = await (await self._client()).async_route(self._route_points()[::-1])
                    except TomTomError as err:
                        errors["base"] = _error_key(err)
                    else:
                        self._create_return(self._route_entry_data(back, user_input, reverse=True), back_name)
            if not errors:
                return await self._route_finish(data)

        if not self._route:
            # Always asked again: a live route is what the traffic makes
            # it right now, and the screen says what it takes right now.
            try:
                self._route = await (await self._client()).async_route(self._route_points())
            except TomTomError as err:
                self._route_failure = _error_key(err)
                return await self.async_step_route_failed()

        route = self._route
        distance = route.get("distance")
        duration = route.get("duration")
        delay = route.get("delay")
        return self.async_show_form(
            step_id="route_review",
            data_schema=_route_review_schema(saved, self._offers_return, self._return_name()),
            errors=errors,
            description_placeholders={
                "start": self._route_start.get("label", ""),
                "destination": self._route_destination.get("label", ""),
                "vias": str(len(self._route_vias or [])),
                "distance": (
                    f"{self.hass.config.units.length(distance, UnitOfLength.METERS):.1f} "
                    f"{self.hass.config.units.length_unit}"
                    if distance is not None
                    else "?"
                ),
                "duration": str(round(duration / 60)) if duration is not None else "?",
                "delay": str(round(delay / 60)) if delay is not None else "?",
                # Referenced by no text. The card watches for a flow step
                # carrying these and draws the route on a map above the form.
                "tomtom_route": json.dumps(
                    [[round(lat, 6), round(lon, 6)] for lat, lon in route["points"]], separators=(",", ":")
                ),
                "tomtom_vias": json.dumps(
                    [[round(v["latitude"], 6), round(v["longitude"], 6)] for v in (self._route_vias or [])],
                    separators=(",", ":"),
                ),
            },
            last_step=True,
        )

    async def async_step_route_failed(self, user_input=None):
        if user_input is not None:
            if self._route_failure == "invalid_api_key":
                return await self.async_step_key()
            return await self.async_step_route_start()
        return self.async_show_form(
            step_id="route_failed",
            data_schema=vol.Schema({}),
            errors={"base": self._route_failure or "cannot_connect"},
            last_step=False,
        )


# ---------------------------------------------------------------- the flow

class TomTomConfigFlow(_KeyStep, _LiveRouteSteps, ConfigFlow, domain=DOMAIN):
    VERSION = 1
    # 2: the quota warning's default moved from 100 % to 80 %.
    MINOR_VERSION = 2
    _offers_return = True

    def __init__(self) -> None:
        self._name: str | None = None
        self._mode: str = SEARCH_MODE_AREA
        # The first setup of all: the key, the defaults for new routes,
        # then the choice of finishing or making the first entry right away.
        self._onboarding = False
        self._defaults: dict | None = None

    async def async_step_user(self, user_input=None):
        # Nothing of TomTom's yet - not even the settings entry: the first
        # setup starts with the key rather than with an entry's name.
        if user_input is None and not self._onboarding and not self._async_current_entries():
            self._onboarding = True
            return await self.async_step_key()
        if user_input is not None:
            self._name = user_input[CONF_NAME]
            self._mode = user_input[CONF_SEARCH_MODE]
            await self.async_set_unique_id(slugify(self._name))
            self._abort_if_unique_id_configured()
            if any(
                slugify(entry.data.get(CONF_NAME, "")) == slugify(self._name)
                for entry in self._async_current_entries()
            ):
                return self.async_abort(reason="already_configured")
            if await async_load_key(self.hass):
                return await self._after_key()
            return await self.async_step_key()

        data_schema = vol.Schema(
            {
                vol.Required(CONF_NAME): str,
                vol.Required(CONF_SEARCH_MODE, default=SEARCH_MODE_AREA): selector(
                    {
                        "select": {
                            "options": [SEARCH_MODE_AREA, SEARCH_MODE_TRACKER, SEARCH_MODE_ROUTE_LIVE],
                            "translation_key": "search_mode",
                            "mode": "list",
                        }
                    }
                ),
            }
        )
        return self.async_show_form(step_id="user", data_schema=data_schema, last_step=False)

    async def _after_key(self):
        if self._onboarding and self._defaults is None:
            return await self.async_step_route_defaults()
        if self._mode == SEARCH_MODE_TRACKER:
            return await self.async_step_tracker()
        if self._mode == SEARCH_MODE_ROUTE_LIVE:
            return await self.async_step_route_start()
        return await self.async_step_area()

    # --- the first setup ----------------------------------------------

    async def async_step_route_defaults(self, user_input=None):
        """The defaults every new route starts with, asked once the key is
        in - the same screen as under TomTom Settings -> Configure, where
        they are changed later."""
        if user_input is not None:
            self._defaults = _defaults_from_input(user_input)
            return await self.async_step_first()
        return self.async_show_form(
            step_id="route_defaults", data_schema=_route_defaults_schema(route_defaults(self.hass)), last_step=False
        )

    async def async_step_first(self, user_input=None):
        """Finish here, or go on to the first entry right away."""
        return self.async_show_menu(step_id="first", menu_options=["finish", "add_entry"])

    async def async_step_finish(self, user_input=None):
        """Done: the settings entry, with the defaults as its options, is
        what this flow makes. The first area or route comes from the
        tile's own "Add entry" whenever it is wanted."""
        await self.async_set_unique_id(SETTINGS_UNIQUE_ID)
        self._abort_if_unique_id_configured()
        return self.async_create_entry(
            title=await _settings_title(self.hass),
            data={CONF_NAME: SETTINGS_TITLE, CONF_SEARCH_MODE: SEARCH_MODE_SETTINGS},
            options=self._defaults or {},
        )

    async def async_step_add_entry(self, user_input=None):
        """On to the first entry. The settings entry is made first, through
        a flow of its own - this one has its one entry still to make - and
        is there before the next screen is answered, so a route's last step
        is filled from the defaults just given."""
        self.hass.async_create_task(
            self.hass.config_entries.flow.async_init(
                DOMAIN,
                context={"source": SOURCE_IMPORT},
                data={CONF_SEARCH_MODE: SEARCH_MODE_SETTINGS, "options": self._defaults or {}},
            )
        )
        return await self.async_step_user()

    async def async_step_area(self, user_input=None):
        errors = {}
        if user_input is not None:
            location = user_input.get(CONF_LOCATION)
            if not location:
                return self.async_abort(reason="location_missing")
            if float(location.get("radius") or 0) > MAX_AREA_RADIUS_M:
                errors["base"] = "radius_too_large"
            else:
                return self.async_create_entry(
                    title=_title(self._name),
                    data={
                        CONF_NAME: self._name,
                        CONF_SEARCH_MODE: SEARCH_MODE_AREA,
                        CONF_LOCATION: location,
                        **_common_data(user_input),
                    },
                )
        return self.async_show_form(
            step_id="area",
            data_schema=_area_schema(self.hass, {CONF_LOCATION: (user_input or {}).get(CONF_LOCATION)} if user_input else None),
            errors=errors,
            last_step=True,
        )

    async def async_step_tracker(self, user_input=None):
        choices = _tracker_choices(self.hass)
        if not choices:
            return self.async_abort(reason="no_tracker_with_position")
        if user_input is not None:
            return self.async_create_entry(
                title=_title(self._name),
                data={
                    CONF_NAME: self._name,
                    CONF_SEARCH_MODE: SEARCH_MODE_TRACKER,
                    CONF_TRACKER: user_input[CONF_TRACKER],
                    CONF_TRACKER_RADIUS: user_input[CONF_TRACKER_RADIUS],
                    **_common_data(user_input),
                },
            )
        return self.async_show_form(step_id="tracker", data_schema=_tracker_schema(choices, None), last_step=True)

    async def _route_finish(self, data):
        return self.async_create_entry(title=_title(self._name), data={CONF_NAME: self._name, **data})

    def _return_name(self) -> str:
        suffix = "Rückweg" if self.hass.config.language.startswith("de") else "return"
        return f"{self._name} - {suffix}"

    def _create_return(self, data: dict, name: str) -> None:
        """The way back as an entry of its own, through a flow of its own -
        a flow has only one async_create_entry."""
        self.hass.async_create_task(
            self.hass.config_entries.flow.async_init(
                DOMAIN, context={"source": SOURCE_IMPORT}, data={CONF_NAME: name, **data}
            )
        )

    async def async_step_import(self, data: dict):
        if data.get(CONF_SEARCH_MODE) == SEARCH_MODE_SETTINGS:
            # The integration's own "TomTom Settings" entry - one per
            # installation: made by the first setup, with the defaults it
            # asked for as the entry's options, or by the integration
            # itself where an older version left none.
            await self.async_set_unique_id(SETTINGS_UNIQUE_ID)
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=await _settings_title(self.hass),
                data={CONF_NAME: SETTINGS_TITLE, CONF_SEARCH_MODE: SEARCH_MODE_SETTINGS},
                options=dict(data.get("options") or {}),
            )
        name = data[CONF_NAME]
        await self.async_set_unique_id(slugify(name))
        self._abort_if_unique_id_configured()
        if any(slugify(entry.data.get(CONF_NAME, "")) == slugify(name) for entry in self._async_current_entries()):
            return self.async_abort(reason="already_configured")
        return self.async_create_entry(title=_title(name), data=data)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return TomTomOptionsFlow()


class TomTomOptionsFlow(_KeyStep, _LiveRouteSteps, OptionsFlow):

    def __init__(self) -> None:
        self._key_only = False

    def _usage_entry_id(self) -> str | None:
        return self.config_entry.entry_id

    def _route_saved(self) -> dict:
        return dict(self.config_entry.data)

    async def async_step_init(self, user_input=None):
        mode = self.config_entry.data.get(CONF_SEARCH_MODE, SEARCH_MODE_AREA)
        if mode == SEARCH_MODE_SETTINGS:
            # The settings entry: the key, which the other entries no
            # longer offer since it is the installation's, and the
            # defaults every new route starts from.
            return self.async_show_menu(
                step_id="init", menu_options=["edit_key", "route_defaults", "quota_warning", "sources"]
            )
        if mode == SEARCH_MODE_ROUTE_LIVE:
            self._route_load_saved()
            return self.async_show_menu(step_id="init", menu_options=["edit_route", "edit_route_settings"])
        if mode == SEARCH_MODE_TRACKER:
            return await self.async_step_tracker()
        return await self.async_step_area()

    async def async_step_edit_key(self, user_input=None):
        self._key_only = True
        return await self.async_step_key()

    async def async_step_route_defaults(self, user_input=None):
        """Defaults for new routes, kept in the settings entry's options:
        what the card's planner saves a route with, and what the wizard's
        last step is filled with."""
        options = dict(self.config_entry.options)
        if user_input is not None:
            options.update(_defaults_from_input(user_input))
            return self.async_create_entry(title="", data=options)
        return self.async_show_form(
            step_id="route_defaults", data_schema=_route_defaults_schema(route_defaults(self.hass)), last_step=True
        )

    async def async_step_sources(self, user_input=None):
        """The further sources of reports, each on or off for every entry
        at once: blitzer.de, and Lufop with its key and its country."""
        options = dict(self.config_entry.options)
        errors = {}
        if user_input is not None:
            lufop_on = bool(user_input.get(CONF_SOURCE_LUFOP))
            # The key field is never filled in: a key already saved is kept
            # by leaving it empty, as with TomTom's.
            key = (user_input.get(CONF_LUFOP_API_KEY) or "").strip() or str(options.get(CONF_LUFOP_API_KEY) or "")
            # Checked whenever Lufop is switched on, and whenever its key
            # changes while it is on: a key typed while Lufop was off is
            # saved unchecked, and switching Lufop on later with the field
            # left empty must not let it through. A key already working, with
            # Lufop on before and after, is not asked about again - that
            # would only keep the other settings from being saved while
            # Lufop cannot be reached.
            was_on = bool(options.get(CONF_SOURCE_LUFOP))
            if lufop_on and not key:
                errors["base"] = "lufop_key_required"
            elif lufop_on and (not was_on or key != options.get(CONF_LUFOP_API_KEY)):
                try:
                    await async_check_lufop_key(self.hass, key)
                except LufopKeyError as err:
                    _LOGGER.warning("Lufop key check: %s", err)
                    errors["base"] = err.reason
            if not errors:
                options[CONF_SOURCE_BLITZER] = bool(user_input.get(CONF_SOURCE_BLITZER))
                options[CONF_SOURCE_LUFOP] = lufop_on
                options[CONF_LUFOP_API_KEY] = key
                options[CONF_LUFOP_COUNTRY] = user_input.get(CONF_LUFOP_COUNTRY) or options.get(CONF_LUFOP_COUNTRY) or ""
                return self.async_create_entry(title="", data=options)
        country = options.get(CONF_LUFOP_COUNTRY) or (
            str(self.hass.config.country or "").lower() if str(self.hass.config.country or "").lower() in LUFOP_COUNTRIES else "fr"
        )
        schema = vol.Schema(
            {
                vol.Required(CONF_SOURCE_BLITZER, default=bool(options.get(CONF_SOURCE_BLITZER))): bool,
                vol.Required(CONF_SOURCE_LUFOP, default=bool(options.get(CONF_SOURCE_LUFOP))): bool,
                vol.Optional(CONF_LUFOP_API_KEY): selector({"text": {"type": "password"}}),
                vol.Required(CONF_LUFOP_COUNTRY, default=country): selector(
                    {"select": {"options": LUFOP_COUNTRIES, "translation_key": "lufop_country", "mode": "dropdown"}}
                ),
            }
        )
        return self.async_show_form(
            step_id="sources",
            data_schema=schema,
            errors=errors,
            last_step=True,
            description_placeholders={"lufop_url": LUFOP_SIGNUP_URL},
        )

    async def async_step_quota_warning(self, user_input=None):
        """Two sections, both folded until opened: TomTom's month on top -
        whether to warn when a free tier will not last it, and from what
        share on - and Lufop's day below, with a switch and a share of its
        own. The options stay flat."""
        options = dict(self.config_entry.options)
        if user_input is not None:
            tomtom = user_input.get("tomtom") or {}
            lufop = user_input.get("lufop") or {}
            options[CONF_QUOTA_WARNING] = bool(tomtom.get(CONF_QUOTA_WARNING))
            options[CONF_QUOTA_THRESHOLD] = int(tomtom.get(CONF_QUOTA_THRESHOLD) or DEFAULT_QUOTA_THRESHOLD)
            options[CONF_LUFOP_QUOTA_WARNING] = bool(lufop.get(CONF_LUFOP_QUOTA_WARNING))
            options[CONF_LUFOP_QUOTA_THRESHOLD] = int(
                lufop.get(CONF_LUFOP_QUOTA_THRESHOLD) or DEFAULT_LUFOP_QUOTA_THRESHOLD
            )
            return self.async_create_entry(title="", data=options)
        share = selector({"number": {"min": 10, "max": 100, "step": 5, "unit_of_measurement": "%", "mode": "slider"}})
        schema = vol.Schema(
            {
                vol.Required("tomtom"): section(
                    vol.Schema(
                        {
                            vol.Required(
                                CONF_QUOTA_WARNING, default=bool(options.get(CONF_QUOTA_WARNING, True))
                            ): bool,
                            # Optional, with the share as its default: a slider is never
                            # empty, and a required field gets Home Assistant's
                            # asterisk - with no legend to say what it means.
                            vol.Optional(
                                CONF_QUOTA_THRESHOLD,
                                default=int(options.get(CONF_QUOTA_THRESHOLD, DEFAULT_QUOTA_THRESHOLD)),
                            ): share,
                        }
                    ),
                    {"collapsed": True},
                ),
                vol.Required("lufop"): section(
                    vol.Schema(
                        {
                            vol.Required(
                                CONF_LUFOP_QUOTA_WARNING, default=bool(options.get(CONF_LUFOP_QUOTA_WARNING, True))
                            ): bool,
                            vol.Optional(
                                CONF_LUFOP_QUOTA_THRESHOLD,
                                default=int(options.get(CONF_LUFOP_QUOTA_THRESHOLD, DEFAULT_LUFOP_QUOTA_THRESHOLD)),
                            ): share,
                        }
                    ),
                    {"collapsed": True},
                ),
            }
        )
        return self.async_show_form(step_id="quota_warning", data_schema=schema, last_step=True)

    async def _after_key(self):
        # A changed key reaches every entry: each is reloaded, and nothing
        # about this one's settings changes.
        for entry in self.hass.config_entries.async_entries(DOMAIN):
            self.hass.config_entries.async_schedule_reload(entry.entry_id)
        return self.async_create_entry(title="", data=dict(self.config_entry.options))

    async def async_step_edit_route(self, user_input=None):
        return await self.async_step_route_start()

    async def async_step_edit_route_settings(self, user_input=None):
        return await self.async_step_route_review()

    def _finish(self, data: dict):
        data = {CONF_NAME: self.config_entry.data.get(CONF_NAME), **data}
        self.hass.config_entries.async_update_entry(self.config_entry, data=data)
        return self.async_create_entry(title="", data=dict(self.config_entry.options))

    async def _route_finish(self, data):
        return self._finish(data)

    async def async_step_area(self, user_input=None):
        errors = {}
        if user_input is not None:
            location = user_input.get(CONF_LOCATION) or self.config_entry.data.get(CONF_LOCATION)
            if float(location.get("radius") or 0) > MAX_AREA_RADIUS_M:
                errors["base"] = "radius_too_large"
            else:
                return self._finish(
                    {CONF_SEARCH_MODE: SEARCH_MODE_AREA, CONF_LOCATION: location, **_common_data(user_input)}
                )
        return self.async_show_form(
            step_id="area",
            data_schema=_area_schema(self.hass, dict(self.config_entry.data)),
            errors=errors,
            last_step=True,
        )

    async def async_step_tracker(self, user_input=None):
        current = self.config_entry.data.get(CONF_TRACKER)
        choices = _tracker_choices(self.hass, current)
        if not choices:
            return self.async_abort(reason="no_tracker_with_position")
        if user_input is not None:
            return self._finish(
                {
                    CONF_SEARCH_MODE: SEARCH_MODE_TRACKER,
                    CONF_TRACKER: user_input[CONF_TRACKER],
                    CONF_TRACKER_RADIUS: user_input[CONF_TRACKER_RADIUS],
                    **_common_data(user_input),
                }
            )
        return self.async_show_form(
            step_id="tracker",
            data_schema=_tracker_schema(choices, dict(self.config_entry.data)),
            last_step=True,
        )
