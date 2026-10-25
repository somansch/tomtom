"""TomTom's traffic flow tiles, served on to the card.

The card lays TomTom's raster flow tiles over its map - the colouring of
every road by how traffic moves on it. A tile URL carries the key, and a
key in a browser is a key in every screenshot and every proxy log, so the
tiles come through here instead: the card asks for
/tomtom_tiles/<token>/flow/<style>/<z>/<x>/<y>.png, this fetches the tile
with the installation's key, keeps it a short while against the next card
asking for the same view, and hands it on.

The token is the one thing that guards the path. A map's tile requests are
plain image fetches, which carry no Home Assistant token, so the view
cannot ask for one; the token is drawn afresh at every start and handed
out only over the authenticated websocket (see websocket_flow in
__init__.py), so a URL copied out of a page stops working at the next
restart, and what it could ever fetch is a picture of the traffic.
"""

from __future__ import annotations

import hmac
import logging

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .api import FlowTileCache, TomTomAuthError, TomTomClient, TomTomError, async_load_key
from .const import DOMAIN, FLOW_STYLES, FLOW_TILE_URL_BASE

_LOGGER = logging.getLogger(__name__)

TILE_TOKEN = "tile_token"
TILE_CLIENT = "tile_client"
TILE_CACHE = "tile_cache"

# TomTom's flow tiles exist from zoom 0 to 22; below about 7 a tile is a
# continent and says nothing a card could read.
MIN_ZOOM = 5
MAX_ZOOM = 22


class FlowTileView(HomeAssistantView):
    """One flow tile, by the card's token."""

    # The entry whose card asked, so the tile is counted on it; "-" for
    # none the view can name.
    url = FLOW_TILE_URL_BASE + r"/{token}/{entry}/flow/{style}/{z:\d+}/{x:\d+}/{y:\d+}.png"
    name = f"api:{DOMAIN}:flow_tile"
    requires_auth = False

    def __init__(self, hass: HomeAssistant) -> None:
        self._hass = hass

    async def get(self, request: web.Request, token: str, entry: str, style: str, z: str, x: str, y: str) -> web.Response:
        domain = self._hass.data.get(DOMAIN) or {}
        expected = domain.get(TILE_TOKEN)
        # No token drawn yet means nothing is served. The comparison takes
        # the same time however much of the token is right, so it cannot be
        # guessed a character at a time; bytes, because the token in the
        # path may be anything at all.
        if not token or not expected or not hmac.compare_digest(
            token.encode("utf-8"), expected.encode("utf-8")
        ):
            return web.Response(status=403, text="bad token")
        if style not in FLOW_STYLES:
            return web.Response(status=404, text="unknown style")
        zoom, col, row = int(z), int(x), int(y)
        if not MIN_ZOOM <= zoom <= MAX_ZOOM or not 0 <= col < 2**zoom or not 0 <= row < 2**zoom:
            return web.Response(status=404, text="no such tile")
        client = domain.get(TILE_CLIENT)
        if client is None:
            key = await async_load_key(self._hass)
            if not key:
                return web.Response(status=503, text="no TomTom key")
            client = domain[TILE_CLIENT] = TomTomClient(self._hass, key, None)
        cache = domain.get(TILE_CACHE)
        if cache is None:
            cache = domain[TILE_CACHE] = FlowTileCache()
        # Only an entry of this integration is charged; anything else the
        # URL names is nobody's.
        entry_id = entry if hasattr(domain.get(entry), "coordinator") else None
        try:
            data = await cache.async_get(client, style, zoom, col, row, entry_id)
        except TomTomAuthError:
            return web.Response(status=502, text="TomTom refused the key")
        except TomTomError as err:
            _LOGGER.debug("flow tile %s/%s/%s: %s", zoom, col, row, err)
            return web.Response(status=502, text="TomTom did not answer")
        return web.Response(
            body=data,
            content_type="image/png",
            headers={"Cache-Control": "private, max-age=60"},
        )
