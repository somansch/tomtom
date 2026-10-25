# Changelog

All notable changes to this integration are documented here.

## v1.0.2

### Added
- **Police reports from blitzer.de.** A kind of its own, `police_report`: the traffic bulletins of the police that blitzer.de passes on - "A8, Salzburg - München, zwischen Tunnel Neubiberg und München-Perlach in beiden Richtungen Gefahr durch Gegenstände auf der Fahrbahn". The road and the town are the place, the bulletin is in `description`, and the symbol is a megaphone in the red of every report from a further source. On like every kind, so an entry with blitzer.de switched on brings them at its next poll, and the Report Alerts blueprint can filter on them. They are asked in a request of their own: together with the cameras, blitzer.de folds them into groups the search does not resolve.

### Changed
- **The symbol at the start of a row has the colour of its marker on the map.** It was the text colour for TomTom's kinds and red for the sources' only; now every kind's symbol is coloured alike in the list and on the map - dark red for a closed road, orange for roadworks and a closed lane, red for a jam, amber for the rest, and the sources' red - so the list reads like the map.

### Fixed
- **blitzer.de's cameras were missing from a wide search.** A box wider than about 10 km comes back from blitzer.de with its cameras gathered into groups, and a group was asked again in a box of a tenth of the search's radius around its centre - which held none of its members when they lay further out than that. Measured against a 2 km grid of the same area: 2 of 3 cameras lost in a 12 km circle, 14 of 52 in an 18 km one. A group is now asked again in a quarter of the radius, which found every camera of the grid in both, in the same number of requests.
- **The NEW badge sits in the middle of its line.** It was centred on the line's lower-case letters, a pixel under the capitals and digits a report's line starts with. It now sits on the middle of the capitals.
- **A stretch's length is written with the right decimal separator.** The `summary` - and with it every notification from the blueprint - wrote it with a point in every language, "Stau · 1.2 km"; it now follows the installation's language, "1,2 km" in German. On the card it follows each reader's own number format, the same as the distance in front of it, so one line no longer reads "1,5 km · Stau · 0.2 km".

## v1.0.1

### Fixed
- **A blueprint you changed is no longer overwritten.** The Report Alerts blueprint was written over on every start whenever the copy under `config/blueprints/automation/tomtom/` differed from the shipped one. The integration now remembers what it last installed: a missing copy is installed, an untouched one is updated when a release changes the blueprint, and one you edited is left alone, with a line in the log when a newer version ships.
- **The traffic flow tiles compare their token in constant time.** The tile path checks its per-start token with `hmac.compare_digest` and refuses every request while no token is set.

## v1.0.0

Initial release: TomTom traffic reports for an area, a device tracker or a live route as `geo_location` entities, the travel time of a route, and a dashboard card of its own. Everything it does is described in the [README](README.md).
