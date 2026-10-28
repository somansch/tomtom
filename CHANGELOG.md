# Changelog

All notable changes to this integration are documented here.

## v1.1.0

### Added
- **A link to every report.** `url` opens a report from blitzer.de on blitzer.de's map, and `blitzer_key` carries blitzer.de's own id for it. A report from TomTom links to TomTom's route planner, centred on its stretch and zoomed to fit it: the planner has no page for a single report, but shows it there with its traffic info on. The link names no language, so the planner opens in the reader's. Lufop has no page for a radar, so its reports carry none. For a notification, or a Markdown card.
- **The card's map can open that link.** **Map click opens the report**, under the map's settings beside the highlight, makes a click on a report's symbol open its link in a new tab. Off by default; a click on a Lufop report does what it did. Without Lufop every report has a page, so the editor then shows **Map click highlights the entry** off and greyed out - what is saved for it is kept.
- **A symbol and a colour per kind of report.** Under **Layout → General → Kinds of report** the card's editor lists every kind TomTom and the sources switched on can report, each with a symbol and a colour of the card's own - on the map's marker, the band along the road, the list and the bar. Empty keeps the integration's symbol and today's colours.
- **A bar of the kinds on the map.** **Show the bar of kinds** puts one symbol per kind the map holds between map and list - under the map, or beside it side by side, and in the minimal format's pop-up too - with how many there are. A click hides that kind on the map and in the list, and from the badges; a second brings it back. Remembered in this browser for this card.
- **Two counts of the speed cameras.** **All speed cameras** and **New speed cameras** on every entry count the reports from blitzer.de and Lufop among the ones the entry delivers, and those of them reported inside the entry's "new" window - the same reports **Reports** counts and the card shows, so the new count is the card's badge; it ages out on its own, once a minute. Per source and per kind as attributes, `in_range` for the number beyond the cap; a camera both sources report counts once.
- **The map's own theme.** **Map theme** under **Layout → Map** sets the map light or dark whatever the dashboard's theme - a light map on a dark dashboard, say. **Automatic**, the default, follows Home Assistant's theme as before. The pop-up's map follows the same setting.
- **A jam from this much delay.** **Jam from this delay**, under an entry's **Optional settings** below the kinds, leaves out the jams whose delay TomTom puts below that many minutes - the thirty-second ones that make a commute look worse than it is. 0, the default, reports every jam as before.
- **The stars can be switched off.** blitzer.de's confirmation stars in a list entry have a switch of their own under **Settings → List**, beside **Reported at** and **Until when**; they used to go with **Reported at**. The three switch their own part only, and the stars' switch is there only while blitzer.de is one of the sources.
- **The refresh button stays with the info line off.** It answers to its own switch alone and stands under the title on its own when the line is off; it used to go with the line.

### Changed
- **TomTom's quota is warned of in two stages, like Lufop's day.** The first repair comes when the month's projection reaches the share set under **Quota warning → TomTom**, the second when it reaches the whole free tier. The share starts at 80 % on a new installation; one from before keeps the 100 % it had. The dialog's two sections open folded.
- **Reports counts what it delivers.** The `new` attribute and the counts per kind on **Reports** are counted over the delivered reports - the nearest, up to the entry's count - as the state is, so they agree with the card's badge and the camera sensors; the number in range beyond the cap is the new `in_range` attribute.

### Fixed
- **Every blitzer.de camera gets its entity.** blitzer.de files a second camera at one spot under an id ending in `-T1`; the integration took that ending for the id, and every such camera became one entity - an 18 km circle around Munich delivered 49 reports where its count said 60. The card showed those 49, and its badge counted the new among them. The id is now what follows blitzer.de's leading figure: `94657` as before, `98878-T1` for those.

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
