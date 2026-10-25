# <img src="https://raw.githubusercontent.com/somansch/tomtom/main/custom_components/tomtom/brand/icon.png" width="40" height="40" align="top"> TomTom Integration for Home Assistant - traffic reports and your commute's travel time on your map

[![GitHub release](https://img.shields.io/github/v/release/somansch/tomtom)](https://github.com/somansch/tomtom/releases/latest)
[![License](https://img.shields.io/github/license/somansch/tomtom)](https://github.com/somansch/tomtom/blob/main/LICENSE)
[![Downloads](https://img.shields.io/github/downloads/somansch/tomtom/total)](https://github.com/somansch/tomtom/releases)
[![Downloads@latest](https://img.shields.io/github/downloads/somansch/tomtom/latest/total)](https://github.com/somansch/tomtom/releases/latest)

> **Unofficial.** Not affiliated with, endorsed by or supported by TomTom. "TomTom" and its logo are trademarks of TomTom International B.V.

**Available languages:** English, Deutsch, Français, Español, Italiano, Nederlands, Polski, Português, Čeština, Dansk, Eesti, Suomi, Ελληνικά, Magyar, Bahasa Indonesia, 日本語, 한국어, Lietuvių, Latviešu, Norsk bokmål, Română, Русский, Slovenčina, Svenska, ไทย, Türkçe, Català, 繁體中文, العربية, עברית - AI-translated apart from English and German; corrections are welcome as pull requests.

<img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-card-overview.png" alt="The TomTom card in its three formats on a route in Atlanta: portrait and landscape with the travel time, the traffic delay, the traffic flow on the map and the jams and roadworks along the way, and the one-line minimal format" width="100%">

## Overview

Knowing what is on the road ahead usually means opening a phone app. This integration brings TomTom's traffic reports into Home Assistant: jams, closed roads and lanes, roadworks, accidents, broken-down vehicles and the weather on the road - and, for a commute, how long the way takes right now. They can sit on your dashboard, feed the notifications you already use, and answer "what is out there right now" without you looking it up.

You configure an area or a route. An area is a centre point plus a radius. A route is worked out by TomTom from a start and a destination - again on every poll, with the traffic of the moment. What TomTom reports there arrives as `geo_location` entities. Those work natively on Home Assistant's [map card](https://www.home-assistant.io/dashboards/map/), each carrying its distance, its road, the stretch it covers and what it actually is.

Everything comes from TomTom's own APIs, with one free key: the Traffic Incident Details for an area's reports, the Routing API for a live route and the reports on it, the Search API for the addresses a route is set up with, and the Traffic Flow tiles the card lays over its map.

Typical reasons to use it:

- **Be told the moment something new turns up.** A push notification, a spoken announcement, or whatever you already use. The bundled [blueprint](#blueprint-report-alerts) sets that up without any YAML.
- **Ask what is out there before you set off.** One message listing everything currently reported - at a set time, when you leave home, or on demand.
- **Know how long the way takes right now.** A route from start to destination is worked out on every poll with the traffic of the moment: the way that is fastest right now, the minutes it takes and how many of them are delay, as sensors and on the card - and the reports on exactly that way. See [Route (start/destination)](#route-startdestination).
- **Put it on a dashboard.** The [TomTom card](#tomtom-card) comes with the integration: the entry's reports as a list, nearest first, with a map above them, the stretch of road each report covers drawn under its symbol, and the travel time large under the title. Nothing to download and no resource to register.
- **See how the traffic is flowing.** The card's map lays TomTom's traffic flow over the roads, fetched for the view on screen while you look - so a watched commute shows the jam building before it is reported. See [Traffic flow](#traffic-flow).
- **See it on a map**, with a symbol per kind of report, on one map source per entry.
- **Watch a commute rather than a circle.** Let TomTom work the route out, and the search runs along it.
- **Print a report in one line.** Every entity carries a ready-made `summary`, so a card or a notification uses one field instead of six.

TomTom files every report under one of thirteen kinds: a jam, a lane closed, a road closed, roadworks, an accident, a broken-down vehicle, dangerous conditions, fog, rain, ice, wind, flooding - and whatever it cannot name. Each is a switch on the entry, so one entry can report nothing but closures and accidents while another takes everything; see [Kinds of report](#kinds-of-report).

One more thing lives on the card alone, not in an entity: the [traffic flow](#traffic-flow), the roads coloured by how traffic is moving on them, fetched for the part of the map on screen only while someone is looking at it.

## Quick start

1. **Install** via [HACS](#hacs) or [manually](#manual), then restart Home Assistant.
2. Get a free TomTom API key - the first entry's setup tells you how, and it takes a minute: sign up at [developer.tomtom.com](https://developer.tomtom.com/), and the key is waiting in the dashboard. No payment method.
3. Go to **Settings → Devices & Services → Add Integration** and search for "TomTom". Paste the key, set the defaults every new route starts with - or leave them as they are - and either finish or go straight on to your first entry: name it and pick a search mode ([Adding an area, tracker or route](#adding-an-area-tracker-or-route)).
4. Choose what to report: the thirteen [kinds of report](#kinds-of-report). All on by default.
5. Put it on a dashboard. **Add card → TomTom** gives you the [card that comes with the integration](#tomtom-card). Or drop the entry's `tomtom_<entry>` source into the [map card](#map-card).
6. Want to be told rather than to look it up? Create an automation from the [Report Alerts blueprint](#blueprint-report-alerts), which is installed along with the integration. No YAML required.

Add the integration itself only once. Every further entry is added from the "TomTom" tile's own **Add entry** - one per area or route, each with its own entities. The key is asked for once and serves them all.

That is the whole setup. Everything below covers the individual options in more depth.

## Quick links

**Setting up**

- [Adding an area, tracker or route](#adding-an-area-tracker-or-route)
  - [Area (radius)](#area-radius) - every field in the form
  - [Kinds of report](#kinds-of-report) - the thirteen switches, and seven more from blitzer.de and Lufop
  - [Data sources](#data-sources) - blitzer.de and Lufop beside TomTom
  - [Device tracker (radius)](#device-tracker-radius) - a circle that follows a phone or a car
  - [Route (start/destination)](#route-startdestination) - the route the traffic makes fastest right now, its travel time and its delay
- [Around the world](#around-the-world) - which countries TomTom, blitzer.de and Lufop report in
- [The key, and what a poll costs](#the-key-and-what-a-poll-costs) - TomTom's free monthly quotas, and how to stay inside them

**How reports behave**

- [Created entities](#created-entities) - every sensor and every attribute, for your own templates

**Automations**

- [Automation examples](#automation-examples)
  - [Blueprint: Report Alerts](#blueprint-report-alerts)
  - [Use in your own automations](#use-in-your-own-automations)

**Showing reports on a dashboard**

- [TomTom card](#tomtom-card) - the card that comes with the integration
  - [Formats](#formats) - portrait, landscape, and one line with a pop-up
  - [Traffic flow](#traffic-flow) - the roads coloured by how traffic moves, fetched on demand
  - [YAML](#yaml) - the options that decide what the card is
  - [CSS variables](#css-variables) - the scheme behind their names
- [Map card](#map-card)

**Installing**

- [Installation](#installation)
- [Help and Contribution](#help-and-contribution)
- [Disclaimer](#disclaimer)

## Adding an area, tracker or route

Go to **Settings → Devices & Services**. Use **Add Integration** at the bottom right and search for "TomTom". The first time, that is the setup itself: the [API key](#the-key-and-what-a-poll-costs), then the [defaults for new routes](#created-entities) - the days and hours, the way back, the kinds of report and the optional settings every route starts with, all changeable later under **TomTom Settings → Configure** - and then the choice: **Finish setup**, or **Add the first area, tracker or route now**.

The integration is added only once. To watch places - say both "Home" and "Commute" - open the "TomTom" tile and use its own **Add entry**. One entry per area or route, each with its own entities.

After naming the entry, pick a search mode:

- **Area (radius)** - the classic mode: one centre point plus a radius circle.
- **Device tracker (radius)** - the same circle, around a tracker instead of a fixed point ([below](#device-tracker-radius)).
- **Route (start/destination, live with the traffic)** - the route TomTom works out from a start, a destination and optional via points, again on every poll ([below](#route-startdestination)).

The key was given during the setup, so no entry asks for it; **Configure** on the **TomTom Settings** entry replaces it.

Every field can be changed later. Open **Settings → Devices & Services**, find the entry and click **Configure**. The key is changed in one place for every entry: **Configure** on the **TomTom Settings** entry the integration makes for itself.

### Area (radius)

| Field | Description |
|---|---|
| **Display name** | Freely chosen name for this entry. It names the entry's device, and through it every entity id (`sensor.home_reports`). It is also the `area` attribute on every entity. Renaming later is safe: entities are identified by the entry, not by its name. |
| **Area** | Drag the map to the centre point you want, then adjust the radius circle. Everything inside is reported, subject to the switches below. Up to **50 km** - the largest box TomTom answers in one request is 10,000 km², which is a square 100 km on a side. |
| **Reports** | A list of thirteen, one per kind - see [Kinds of report](#kinds-of-report). All ticked by default. |
| **Only reports TomTom is sure of** | TomTom rates each report `certain`, `probable`, `risk_of` or `improbable`: a jam measured from moving cars is certain, a roadwork from a road authority probable, a driver's single report a risk. On - the default - the first two are kept. Off, the uncertain ones come along too. |
| **Number of reports** | Upper limit on how many reports are tracked as entities at once, nearest first. Default 20. A city centre has hundreds of small closures; the limit keeps the entity list readable. |
| **Update interval** | Minutes between polls. Default **60**, and the number to watch: every poll is one request to TomTom's Incident Details, which has 2,500 free a month - see [what a poll costs](#the-key-and-what-a-poll-costs). **0** switches automatic polling off; the entry then refreshes only through the `tomtom.refresh` action. Whatever it says, a new entry fetches once right away, and so does every entry after a restart. |
| **Counts as new for** | How many minutes a report counts as new, for the `new` attribute on the count sensor and the NEW badge on the card. Default 60. **0** switches the marking off. Also on the entry's device page, as a number entity. |
| **Only these roads** | Comma-separated road numbers, `A8, A99, B2`. Only reports TomTom files under one of them are kept - the motorways of a commute, say, without every side street along it. Compared without case or spaces. Empty keeps every road. |
| **Blacklist** | Comma-separated incident ids to leave out. TomTom's own apps never show an id; it is the `id` attribute of a report's entity - or `short_id`, its tail after the last dash - in the entity's details. |

### Kinds of report

TomTom files every report under one category. The thirteen it has, and the key each goes by:

| Key | Name |
|---|---|
| `jam` | Traffic jam |
| `lane_closed` | Lane closed |
| `road_closed` | Road closed |
| `road_works` | Roadworks |
| `accident` | Accident |
| `broken_down_vehicle` | Broken down vehicle |
| `dangerous_conditions` | Dangerous conditions |
| `fog` | Fog |
| `rain` | Rain |
| `ice` | Ice |
| `wind` | Wind |
| `flooding` | Flooding |
| `unknown` | Unknown |
| `camera_fixed` | Fixed speed camera - from [blitzer.de and Lufop](#data-sources) only |
| `camera_mobile` | Mobile speed camera - from [blitzer.de and Lufop](#data-sources) only |
| `camera_trailer` | Speed camera trailer - from [blitzer.de](#data-sources) only |
| `camera_redlight` | Red-light camera - from [blitzer.de and Lufop](#data-sources) only |
| `camera_section` | Section control - from [blitzer.de and Lufop](#data-sources) only |
| `check_distance` | Distance check - from [blitzer.de](#data-sources) only |
| `check_police` | Police check - from [blitzer.de](#data-sources) only |

The key is what the `type` attribute carries, and what the blueprint and the events filter on. Beside the category every report carries TomTom's own wording of it - `description`, "Lane closed; Left lane closed; Roadworks" - which is often more than the category says.

All of TomTom's come out of the same requests: ticking fewer kinds saves nothing, it only leaves them out. The seven kinds of camera and check come from the further sources - all seven from blitzer.de, four of them from Lufop - and stay empty until a source is switched on; see [Data sources](#data-sources).

### Data sources

TomTom is the one source every entry has. Further ones are switched on for every entry at once under **⚙ TomTom Settings → Configure → Data sources**, and each entry still picks its kinds. A source adds only what TomTom has not got, under kinds of its own: nothing is taken from it that TomTom reports too, so no report stands in the list twice.

**blitzer.de** - speed cameras and traffic checks, fixed and mobile, in Germany and its neighbours. No key, no account. They come under seven kinds by what is measured - a fixed speed camera, a mobile one, a trailer, a red-light camera, a section control, a distance check, a police check - each with a symbol of its own, all drawn in red. A report is named by what exactly it is (a red-light and speed camera, a camera in a tunnel, an alcohol check) with its limit after it - `speed_limit` as an attribute - then street and town, then blitzer.de's own note on it in `description` where it has one. A mobile camera or check carries the community's confirmation: when the last was, `confirmed_at`, and how many, `confirmations` - the card shows both, the count as up to three stars. Weight and height checks are not asked for. Every report says who reported it in `provider` - `tomtom` or `blitzer` - and the card shows the source's logo under its symbol. In an area the source is asked once per poll - and where the answer comes back grouped, which a city does above a few hundred markers, each group is asked for again in a smaller box: a 10 km circle over Munich came to about 30 requests a poll. Along a live route it is asked box by box, 6 km apart, at most 40 boxes a poll, and only what stands within 60 m of the route's line is kept - the road and its verges, the same tolerance the Blitzer integration keeps for a route TomTom worked out. blitzer.de has been known to shut an address out that polls it too often, so an hour between polls is the sensible pace for an entry with this source on. Each request is counted under the entry's **blitzer.de this month** sensor and the installation's total; there is no tier to hold them against. A poll of blitzer.de that fails costs TomTom's nothing: the reports it last brought stay until it answers again, and the log says so once.

**Lufop** - speed cameras, fixed, mobile (the units at roadworks among them) and red-light, and section controls, from the radar database at [lufop.net](https://lufop.net): a documented API with a free personal key from [api.lufop.net](https://api.lufop.net/), entered under **Data sources** with the one country every entry asks for - a request is scoped to a country, and the free plan answers France, Belgium and Switzerland, 200 requests a day, 10 a minute and 200 radars a request. The integration keeps every request of the installation at least 6.5 s from the last and asks a route in circles of 5 km every 8 km, at most 12 a poll, so a long route and a short interval are what to watch against the day's 200. The radars come under the four kinds Lufop can tell apart; `provider` says `lufop`, and the card shows its logo. A camera both blitzer.de and Lufop list - the same kind within 40 m - is one report, blitzer.de's with its note and its confirmations, and `providers` names both. Lufop's plan counts a day at a time, from midnight to midnight UTC, so its requests are counted by the same day too: **Lufop today** per entry and for the installation, with the plan's 200 and what is left as attributes, and the quota warning says so - as a repair and on the **Quota at risk** sensor - once today's count reaches the share set in the quota warning's **Lufop** section - 80 % unless changed, with a switch of its own. Lufop's own figures count there: every quarter of an hour the integration asks Lufop's key document (a call that costs no quota) how many requests the key has used today and how many its plan allows - Lufop counts whatever else uses the key too, and a paid plan's limit replaces the free 200. The sensor carries what is left as `lufop_remaining_today` and the plan as `lufop_plan`. Once the day is spent, the repair says so in its own words: Lufop refuses every request until midnight UTC, and the repair gives that time in local time.

A word on where it comes from: blitzer.de has not published an API. The integration reads what the site's own map reads, as the Blitzer integration has for years - which can change or close at blitzer.de's discretion, and is why the source is off until you switch it on.

<img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-card-berlin.png" alt="The card in German on a route into Berlin: a lane closure from TomTom with its description, a mobile speed camera from blitzer.de confirmed by the community with three stars, and roadworks" width="70%">

### Device tracker (radius)

The same circle as an area's, around wherever a device tracker is at the moment of each poll. Only trackers currently reporting coordinates are offered: one that knows nothing but home and away has no position to put a circle around.

| Field | Description |
|---|---|
| **Device tracker** | The tracker to follow. |
| **Radius (meters)** | How wide a circle to search around it, 50 to 50,000 m. Default 1000. |

Everything else is the area form, field for field. A tracker without a position fails the poll - the entities read unavailable rather than reporting a circle around nowhere - and three failed polls in a row raise a repair naming the reason.

### Route (start/destination)

A route TomTom works out from a start, a destination and optional via points - and works out again on every poll, with the traffic of the moment: the way that is fastest right now, how long it takes, how much of that is delay, and the reports on exactly that way. Each end is a zone, a point on the map or an address; an address is looked up through TomTom's geocoder and shown back before it is taken.

| Field | Description |
|---|---|
| **Also create the way back** | A second entry, destination to start, worked out in that direction - on a motorway the way back is the other carriageway, and a jam on one is not one on the other. **Name of the way back** names it; "Home" and "Work", say. Only offered while a route is being set up. |
| **Days the route is kept up to date**, **From**, **Until** | When the route polls at all. Outside those hours nothing is fetched - neither the route nor the reports - until the `tomtom.refresh` action asks. Every day and the same time at both ends means always; a span past midnight wraps. The way back has hours of its own on the same form, since it is driven at another time of day. |

The route itself is thinned out to a few hundred points and stored with the entry, and replaced by the route of the moment on every poll. When the fastest way becomes a different one, the entry fires a `tomtom_route_changed` event.

What a live route adds:

- Three more sensors: **Travel time**, **Traffic delay** and **Route length**, in minutes and kilometres, with the time without traffic, the typical time for the hour and the moment they were computed as attributes.
- The **delay** is the travel time less the time on a free road - whatever stands in the road. TomTom's own `trafficDelayInSeconds` counts jams only, and roadworks at a crawl cost minutes it does not count.
- On the [card](#tomtom-card): the travel time large under the title, the line under it saying how much is traffic in green, yellow or red, and the stretches of the route that traffic is slowing, coloured along the line.
- The reports themselves come with every route, at no extra request: the Routing API names what the route runs through - a jam, roadworks, a closure, an accident - as sections of it, each with TomTom's id. Once per new report, Incident Details is asked for the rest - TomTom's wording, the road, where the stretch starts and ends, since when and until when - and the answer is kept, so a jam that stands for an hour costs one of the 2,500 and not one per poll. Until its lookup has come round, a report shows what the section says.

A commute's recommended setup: one route there and the way back, each with its own hours - 06:00 to 09:00 on weekdays for the way to work, 15:00 to 19:00 for the way home - polled every 15 minutes. Inside those hours every poll is one Routing request, plus one Incident Details request per five reports that are new; outside them none at all.

## Around the world

The integration and its card speak 30 languages anywhere. What fills the list depends on where the area or the route lies, because each source reports in its own countries:

| Source | Where it reports |
|---|---|
| **TomTom** | Jams, closures, roadworks and accidents in more than 70 countries - most of Europe, the United States and Canada, much of Asia and the Middle East, Australia and New Zealand, parts of Africa and Latin America; see TomTom's [market coverage](https://docs.tomtom.com/traffic-api/documentation/tomtom-maps/v1/product-information/market-coverage). Routes and travel times work wherever TomTom has maps. Not covered by the Traffic API this integration uses: Japan and China. South Korea is served only through a separate Korean endpoint the integration does not use. |
| **blitzer.de** | Speed cameras and checks, strongest in Germany and the rest of Europe, with cameras further afield too - Dubai, for one. None in Japan. |
| **Lufop** | The 24 countries of its country list: most of Europe, the United Kingdom, Canada, Australia, New Zealand, Morocco and the United Arab Emirates. Its free plan is meant for France, Belgium and Switzerland; a paid plan opens the rest. |

A route in Japan therefore shows its travel time and length, and an empty list. Arabic and Hebrew read right to left, the card included.

<img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-card-dubai.png" alt="The card in Arabic, read right to left: a route in Dubai with its travel time, a jam from TomTom and red-light and speed cameras from blitzer.de and Lufop" width="40%"> <img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-card-japan.png" alt="The card in Japanese: a route from Yokohama to Tokyo Station with its travel time and length, and no reports, since TomTom's Traffic API does not cover Japan" width="45%">

Know a source with a public API for a country these three leave empty? Suggestions are welcome as a [feature request](https://github.com/somansch/tomtom/issues).

## The key, and what a poll costs

Everything here comes from TomTom, which needs an API key. It is free, and there is no payment method to enter:

1. Sign up at [developer.tomtom.com](https://developer.tomtom.com/).
2. Right after that, **API & SDK Keys** in the dashboard already lists a key, *My First API key*, with every API enabled. Copy it.
3. Paste it into the first entry's setup. It is kept in Home Assistant's own private storage, never in an entry, and serves every entry of this installation. **Configure** on the **TomTom Settings** entry replaces it for all of them.

What TomTom gets to see is what an entry is about and nothing else: the box an area or a tracker searches, a route's start, destination and via points, and an address as you typed it. Your Home Assistant's home position is never sent - the key check asks about a fixed point in Amsterdam, and an address is looked up without a bias towards your home, so a street that exists in two towns wants its town typed.

TomTom's free tier is a number of requests per API per month:

| API | Used for | Free per month |
|---|---|---|
| Traffic Incident Details | an area's or a tracker's reports: one request per poll, one more per 10,000 km² of the search. On a route, one per five new reports, asked once | **2,500** |
| Routing | a live route and the reports on it: one request per poll inside its hours; on the card's planner, one for the preview and one when it is saved (two with the way back) | 20,000 |
| Search (Geocoding) | the addresses a route is set up with; the one lookup that checks the key | 20,000 |
| Search API | the suggestions while an address is typed on the card's planner: one request per pause (from three letters on) | **2,500** |
| Traffic Flow raster tiles | the flow on the card's map: a few per view, fetched again with every poll of the entry while someone looks | 200,000 |

The 2,500 is the one to plan around: that is about three polls an hour across every entry of the installation. At the default hour an area spends about 720 a month; a live route only what its new reports cost, since the reports themselves come with the Routing request. The forms say so, and every entry carries a **TomTom requests this month** sensor - with the count per API as attributes - and there is one more for all entries together, so the month's spend is on the device page and in the history. What TomTom charges beyond the free tier is on its [pricing page](https://developer.tomtom.com/pricing).

A request that TomTom refuses - a key that stopped working, a quota used up - fails the poll; three in a row raise a repair under **Settings → System → Repairs** naming the reason.

Before it comes to that, the integration says so: from the eighth day of the month on, every API's count is projected to the month's end at the pace so far - with the month's own length - and where the projection passes the free tier, a repair names the API and the numbers ("14200 of 20000 Routing requests used 18 days in; about 24500 by the month's end") and the **Quota at risk** sensor on TomTom General turns on, for an automation that sends it on. **TomTom Settings → Configure → Quota warning** has two sections. **TomTom** switches this off or moves the line - 80 % warns at four fifths of the tier. **Lufop** does the same for Lufop's day, below. The projection is on every per-API sensor as `projected_month` too. It counts what this integration asks for: a key used elsewhere as well stands higher at TomTom.

<img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-quota-check.png" alt="The diagnostic sensors of TomTom General: all requests this month, one counter per API with blitzer.de and the flow tiles, Lufop today, and Quota at risk reading OK" width="40%">

## Created entities

Each entry produces the entities below. The sensors are named in your Home Assistant's language:

| Entity | Example ID | Description |
|---|---|---|
| Count sensor: **Reports** | `sensor.<entry>_reports` | How many reports are currently reported, capped at **Number of reports**. Its attributes break the count down per kind, carry `last_update` and `new`, and are the one place the entry's settings and a live route's figures can be read: `search_mode`, `new_minutes`, and on a live route `travel_time_minutes`, `traffic_delay_minutes`, `route_distance_km` and `route_changed`. |
| One `geo_location` entity per report | `geo_location.<entry>_road_closed_a8` | Created and removed as reports appear and disappear. There is no fixed pool of entities. Named after the kind and the road, or the place the stretch starts. |
| Number: **New for** | `number.<entry>_new_for` | How many minutes a report counts as new. The same setting as in the options form, put where the sensor it governs is listed. Changing it is the one change that does **not** rebuild the entry. |
| Diagnostic sensor: **TomTom requests this month** | `sensor.<entry>_tomtom_requests_this_month` | Every request this entry sent to TomTom this calendar month, with the count per API and last month's total as attributes. Starts at nought with the month. One more sensor per API beside it, **blitzer.de this month** among them once that source is on. |
| Diagnostic sensors: **Incident Details this month**, **Routing this month**, **Geocoding this month**, **Flow tiles this month** | `sensor.<entry>_incident_details_this_month`, `..._routing_this_month`, `..._geocoding_this_month`, `..._flow_tiles_this_month` | The same, one per API this entry is charged with, each against its own free tier - the flow tiles being the ones a card fetched while it showed this entry. |

One more entry, **⚙ TomTom Settings** - named in your Home Assistant's language, with a gear in front that keeps it at the top of the integration's list - is made by the setup itself, before any area or route, and goes with the last of them. Its **Configure** has four things: the key, **Quota warning** (above), **Data sources** (above), and **Defaults for new routes** - the days and hours a route is kept up to date in, whether the way back is made along with it, the kinds of report and the optional settings every new route starts with, and the entity a route planned on the card starts from. The wizard's last step is filled with them; a route saved on the card takes them as they are. It carries the key - its **Configure** is the one place the key is changed, for every entry - and the device **TomTom General** with the installation's totals: every entry together, plus what belongs to none, the key check and the flow tiles:

<img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-config.png" alt="Configure on the TomTom Settings entry: change the API key, the defaults for new routes, the quota warning and the data sources" width="50%">

| Entity | Example ID | Description |
|---|---|---|
| **All requests this month** | `sensor.tomtom_general_all_requests_this_month` | Every request of the month, with the count per API as attributes. |
| Binary sensor **Quota at risk** | `binary_sensor.tomtom_general_quota_at_risk` | On while an API's free tier is expected to run out this month - see [the key, and what a poll costs](#the-key-and-what-a-poll-costs). Which APIs, and every API's expected count by the month's end, as attributes. |
| **Incident Details this month**, **Routing this month**, **Geocoding this month**, **Reverse Geocoding this month**, **Search this month**, **Flow tiles this month**, and with a source on **blitzer.de this month** and **Lufop today** | `sensor.tomtom_general_incident_details_this_month`, ... | One per API - the six TomTom's own dashboard lists - each carrying its free tier as `free_per_month`, with `remaining` and `used_percent` beside it. |
| Live route only: **Travel time**, **Traffic delay**, **Route length** | `sensor.<entry>_travel_time`, `..._traffic_delay`, `..._route_length` | How long the route takes right now, how much of that is delay, and how long it is - see [Route (start/destination)](#route-startdestination). |

Every entry gets a **device** of its own, named after the entry. The device's **model** field says how it searches: `Radius`, `Tracker` or `Route`. All of an entry's entities, markers included, group under that one device card.

Every `last_update` is the moment the entry last *fetched*, not the moment its data last changed.

Attributes on each report's `geo_location` entity:

| Attribute | Description |
|---|---|
| `state` | Distance in km (or miles). From the area's centre point, from the tracker, or - on a route - the way along the route from its start to where the report starts, so the markers read like the trip: this one at km 3, that one at km 23. |
| `source` | `tomtom_<entry>`, the display name lowercased and slugified. Lets a map card select one entry. |
| `area` | The display name you gave this entry. |
| `type` | The kind, as a key from the [table above](#kinds-of-report). |
| `type_name` | The same in words, in the **server** language under **Settings → System → General**: "Roadworks" on an English one. |
| `summary` | The whole report in one readable line, so a card prints one field instead of six: `Traffic jam · 1.2 km · +4 min · A9 · Nuremberg → Munich — Stationary traffic`. The kind, the length of the stretch, the minutes it costs, where it is, then TomTom's own wording after the dash. Only figures TomTom sent appear. |
| `description` | TomTom's own wording of what is going on, in the server language where it has one: "Lane closed; Left lane closed; Carriageway reduced to one lane; Roadworks". |
| `events` | The same as a list, each with TomTom's event `code`, its `description` and its `category`. |
| `id`, `short_id` | TomTom's id of the incident, and its tail after the last dash - the form a live route's sections name, and what the entity is filed under: the part before it names the source TomTom took the incident from and differs between regions. Either goes into the blacklist. |
| `road`, `roads` | The road numbers, "A8 / E52", and as a list. Empty on a street. |
| `from`, `to`, `place` | Where the stretch starts and ends, as TomTom names them, and both in one piece with the road. |
| `length` | The stretch in metres. |
| `delay`, `delay_minutes` | What it costs: seconds as TomTom sends them, and rounded up to whole minutes. Absent where TomTom gives none - on a road closure, say. On a route, the delay measured on the route right now. |
| `speed`, `speed_unit` | On a route's report, how fast traffic moves through the stretch, in the system's speed unit: km/h, or mph on an imperial system. |
| `magnitude`, `magnitude_name` | How bad: `minor`, `moderate`, `major`, `indefinite` (a closure) or `unknown`, and the word for it. |
| `probability` | `certain`, `probable`, `risk_of` or `improbable`. |
| `created`, `created_at` | When TomTom first reported it - or, for a route's report whose lookup has not come round, when this entry first saw it: `2026-10-16 21:25:30` in local time, and the same as ISO 8601. |
| `ends_at` | When TomTom expects it to end, ISO 8601, where it says. |
| `polyline` | The stretch of road, as a Google-encoded polyline. The [TomTom card](#tomtom-card) draws it as a band along the road. |
| `end_latitude`, `end_longitude` | The far end of that stretch; `latitude` and `longitude` are its start. |
| `reports`, `last_report_at` | How many drivers reported it and when the last did, on a community report. |
| `provider`, `providers` | Who reported it - `tomtom`, `blitzer` or `lufop` - and every source that lists it. |
| `speed_limit`, `confirmed_at`, `confirmations` | On a camera from blitzer.de: its limit in km/h, when the community last confirmed it and how often. |

The entity's `icon` is the kind's own - `mdi:car-multiple` for a jam, `mdi:excavator` for roadworks - and is what the card draws in the marker and at the start of a list entry.

## Automation examples

### Blueprint: Report Alerts

A ready-to-use automation [blueprint](custom_components/tomtom/blueprints/automation/tomtom/report_alerts.yaml) covers both of the things people actually want, without writing any YAML. Its fields are in English: Home Assistant does not translate blueprints.

**It comes with the integration.** After a restart it is waiting under **Settings → Automations & Scenes → Blueprints**, and **Create automation** is the whole of what is left to do. A release that changes the blueprint brings the new version with it, as long as your copy is unchanged. A copy you edited is left alone; delete it and restart to get the new one.

- **Live alerts** - only what is new. One notification per newly reported incident, the moment it shows up. Never for one already known, and never right after a restart. A time window keeps it quiet at night.
- **Digest** - everything currently reported. One message listing what is standing right now, nearest first, capped at a length you choose. Trigger it at a time of day, when someone leaves a zone, from any entity changing state, or on demand via `automation.trigger`.
- **One set of filters for both.** Which entries, which kinds of report, and a minimum delay so a jam of a minute stays quiet.
- **Proximity.** Measure against a zone, a person or a device tracker, report only what is within a radius of it, and sort the digest by that distance.
- **Notify anywhere**: push via the Companion App, the notification bell and a dashboard helper, text-to-speech, and anything else with the normal action editor.
- **Customizable text.** `{{ summary }}` gives the finished one-line description; the digest loops over `reports` itself.

<img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-blueprint.png" alt="The Report Alerts blueprint: sections for what to report, live alerts, the digest, proximity, the notification text, mobile push, notifications, text-to-speech and custom actions" width="60%">

### Use in your own automations

Every report is both a plain event and a plain `geo_location` entity.

#### New reports anywhere in the entry

Every entry fires a **`tomtom_new_report`** event the moment a genuinely new report is detected - on a poll, or on an on-demand `tomtom.refresh`. Never for one already known from an earlier poll, and never right after Home Assistant starts.

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "Jam or accident on the commute"
    triggers:
      - trigger: event
        event_type: tomtom_new_report
        event_data:
          area: Commute
    conditions:
      - condition: template
        value_template: "{{ trigger.event.data.type in ['jam', 'road_closed', 'accident'] }}"
    actions:
      - action: notify.mobile_app_your_phone
        data:
          message: "{{ trigger.event.data.summary }}"
```

</details>

The event data holds `config_entry_id`, `area`, `id`, `type`, `type_name`, `summary`, `description`, `road`, `roads`, `from`, `to`, `length`, `delay`, `delay_minutes`, `magnitude`, `latitude`, `longitude`, `distance` and `distance_unit`. Keep the `conditions` block: without it a large area notifies you about every roadwork it discovers.

#### The route changed

A live route fires **`tomtom_route_changed`** when the fastest way becomes a different one - with `config_entry_id`, `area`, `distance`, `duration` and `delay`. The first route of a run does not count: that is only the start of knowing.

#### On-demand refresh for a commute

Setting the update interval to **0** switches automatic polling off. The entry then refreshes only through the **`tomtom.refresh`** action - **Refresh** in the UI - which fetches the route and the reports in one pass and returns the reports under `reports`, each with `id`, `type`, `summary`, `description`, `road`, `from`, `to`, `delay_minutes`, `latitude` and `longitude`.

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "Send the commute when leaving home"
    triggers:
      - trigger: zone
        entity_id: person.your_name
        zone: zone.home
        event: leave
    actions:
      - action: tomtom.refresh
        data:
          config_entry_id: YOUR_ROUTE_CONFIG_ENTRY_ID
        response_variable: commute
      - action: notify.mobile_app_your_phone
        data:
          message: >-
            🚗 {{ states('sensor.commute_travel_time') }} min right now
            {% for r in commute.reports %}
            • {{ r.summary }}
            {% endfor %}
```

</details>

To find `YOUR_ROUTE_CONFIG_ENTRY_ID`, build the action once in **Developer Tools → Actions**: pick the route from the dropdown, switch to YAML mode and copy the resolved `config_entry_id`.

#### A morning message when the commute is slow

A live route's **Travel time** sensor makes the usual question an automation: once a weekday morning, when the way to work is slower than it should be, send the time and what stands in the road.

<details>
<summary>YAML</summary>

```yaml
automation:
  - alias: "Commute slow this morning"
    triggers:
      - trigger: state
        entity_id: sensor.commute_travel_time
    conditions:
      - condition: time
        after: "06:00:00"
        before: "09:00:00"
        weekday: [mon, tue, wed, thu, fri]
      - condition: numeric_state
        entity_id: sensor.commute_travel_time
        above: 40
      - condition: template
        value_template: >-
          {{ this.attributes.last_triggered is none
             or now() - this.attributes.last_triggered > timedelta(hours=20) }}
    actions:
      - action: notify.mobile_app_your_phone
        data:
          title: "Commute: {{ states('sensor.commute_travel_time') }} min right now"
          message: |
            {%- set reports = expand(integration_entities('tomtom') | select('search', '^geo_location\.') | list)
                 | selectattr('attributes.area', 'eq', 'Commute') | sort(attribute='state') -%}
            🚗 {{ states('sensor.commute_travel_time') }} min, {{ state_attr('sensor.commute_travel_time', 'travel_time_no_traffic_minutes') }} without traffic, {{ states('sensor.commute_route_length') }} km
            {% for r in reports %}
            • km {{ '%.1f' | format(r.state | float(0)) }}: {{ r.attributes.summary }}
            {% endfor %}
    mode: single
```

</details>

## TomTom card

The integration's own card. One list answering "what is on my way right now", per entry: every report TomTom has for it, nearest first, with a map above them that can either mirror the list or drive it - and, on a live route, how long the way takes right now.

It comes with the integration. There is nothing to download, nothing to copy into `www` and nothing to register as a dashboard resource - restart Home Assistant after installing and the card is there, under **TomTom** in the card picker. The entry that shows up under **Settings → Dashboards → Resources** is the integration's own.

Everything it draws is already in the frontend's own state: the reports are `geo_location` entities, the entry names and their search mode come from the device registry, the "last updated" moment and the travel time from the entry's **Reports** sensor, and what still counts as new from the entry's own window. Distances come in the unit system of your Home Assistant, km or miles, and numbers, times and dates are written the way your profile says - its number, time and date format.

### Adding it

- **Add card → TomTom.** With no entry picked, the card offers every configured one in a dropdown of its own.
- **The card picker's "By entity" tab.** Pick any report, count or window and the card is offered for it, already pinned to the entry that entity belongs to.

### Formats

`layout`, the first setting in the editor. The picture at the top shows all three, on a route in Atlanta:

| Value | What it is |
|---|---|
| `portrait` | The map above, the list below. The default. |
| `landscape` | Map and list side by side. |
| `minimal` | One line carrying up to four parts - everything the entry reports, what of it is still new, what the jams among it cost, and on a live route how long it takes right now, coloured by its delay - each opening the pop-up on what it counted. |

### What it can do

- **Pick the entry on the card**, or pin it to one.
- **Show how long a live route takes right now.** The travel time stands large under the title, and the line under it says how much of it is traffic, in green, yellow or red by thresholds of your choosing.
- **A map that answers the list.** Clicking an entry can centre the map on that report.
- **Draw a route on the map**, under the reports, fitted into view when the card first draws it; on a route entry every distance is the way along the route from its start, so the list reads in driving order.
- **Draw the stretch of road each report covers**, as a band under its symbol in the colour of its kind: dark red for a closed road, striped white down the middle; orange for roadworks and a closed lane; red for a jam; amber for everything else.
- **Keep the map when nothing is reported**, fitted to the circle the entry searches or to its route.
- **Show the traffic flow.** TomTom's own colouring of the roads, laid over the map while the card is visible. Its own section: [Traffic flow](#traffic-flow).
- **The list follows the map.** The map shows every report of the entry; the list, the ones inside the part of it in view - pan or zoom, and the list follows. **List follows the map** under **Content** switches it off, and the list shows them all. Every report's symbol stands on its point, and so does a group's bubble - not on a tail under it - so where a report is can be read off the map.
- **Plan a route on the card.** **+ New route** at the end of the entry dropdown opens a planner under it: start, as many stops as you like and the destination, each an entity's position, a zone, the map's centre or an address with suggestions while you type - from anywhere, not just your own country, and never biased by your home's position. Swap the ends, add or remove stops, then **Calculate**: TomTom's route of the moment is drawn in orange with its travel time and its delay, and the reports on it take the place of the entry's own - on the map, as symbols along the route, and in the list, with their distance along it from the start. **Discard**, or closing the planner, brings the entry's own route or circle and its reports back. **Save as route** makes a route entry of it, with the defaults under TomTom Settings, and the card switches to it as soon as its first poll is in - for administrators, who are the ones Home Assistant lets make an entry; everyone else gets the route and its figures without the button. In the landscape format the planner stands beside the map, above the list.
- **Sort by distance, newest or oldest.** **Measure distance from the entry's centre, from the map, or from a person or zone.**
- **Mark what is new**, by the entry's own windows, with a badge that narrows the card to the new reports.
- **Say what the jams cost**: a red badge beside the NEW one adds up the delay of every report that carries one, and narrows the card to those reports when clicked.
- **Fold a long list**, **refresh on demand** with a button that also says how long ago the entry was last fetched, and **a tap action in the minimal format**.

<img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-card-new-route.png" alt="The planner's place picker: an entity's position, a zone, the map's centre or an address" width="35%"> <img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-card-new-route-FL.png" alt="A planned route from Beverly Hills, Florida to Key West drawn in orange on the map, with its travel time, length and reports, ready to be saved as a route entry" width="60%">

### Traffic flow

**Show the traffic flow** under the map switch - on by default - lays TomTom's flow tiles over the map: every road coloured by how traffic is moving on it, from green through yellow and red to dark red. The tiles are served through the integration - the key never reaches the browser - and fetched by the map for the view it shows, again whenever the entry's poll comes in, so the flow is as old as the reports beside it; not at all while nobody looks. The integration keeps a tile for two minutes, so two cards on one view share a fetch. Each tile counts on the entry the card was showing - its **Flow tiles this month** sensor - and on TomTom General; a free key has 200,000 of them a month, and a dashboard that is open all day uses a few hundred.

**Layout → Map** picks the colouring - TomTom's default shows congestion where traffic moves at all; the others add the free roads in green, show absolute speed, or the delay - and how solid the tiles are drawn. With the option on, a **Traffic flow** button under the entry dropdown - and one under the title of the minimal format's pop-up - shows or hides the flow for the moment, filled while the flow is shown; **Show the Traffic flow button** under **General** takes it away and leaves the flow drawn, and **Layout → Traffic flow button** sets its colour and font. Works on both of Home Assistant's map engines.

### Settings

The editor is the one the [Annuals card](https://github.com/somansch/annuals#custom-dashboard-card) has, with the same freedom: what the card shows and how every element of it is drawn - colour, font, size, symbol, background - is set in the visual editor, no YAML and no card-mod required. Two panels, each with three groups:

- **Settings** - *General, Content, List*: what the card shows.
- **Layout** - *General, Map, List*: how it is drawn. One collapsible block per element - the title, the badges, each line of an entry, the dropdowns, the rule between entries - with colour, typeface, size and, where the element has one, its symbol.

Every field carries an **i** describing it, so the reference for its roughly 200 settings is the editor itself. The editor writes only what differs from the default, so a card configured entirely in the interface stays short in YAML.

<img src="https://raw.githubusercontent.com/somansch/tomtom/main/docs/tomtom-card-editor.png" alt="The card editor: the Settings and Layout panels, with the List tab of Layout open on one block per part of an entry" width="50%">

### YAML

The whole of a working card:

```yaml
type: custom:tomtom-card
```

One pinned to an entry, minimal, with the traffic flow on in its pop-up:

```yaml
type: custom:tomtom-card
layout: minimal
areas:
  - 4f2c1b9d8e7a6c5b4a39281706f5e4d3   # the entry's device id
show_area_picker: false
map_traffic: true
```

The options that decide what the card *is*, rather than how it is drawn:

| Option | Default | What it does |
|---|---|---|
| `layout` | `portrait` | `portrait`, `landscape` or `minimal`. |
| `areas` | *(all)* | Device ids of the entries to show. Empty means every configured one. |
| `title` | *(the translated default)* | The card's own title. |
| `sort` | `distance` | `distance`, `newest` or `oldest`. |
| `reference_mode` / `reference` | `area` / - | Where distances are measured from: `area`, `map` or `entity`, and the entity. On a route every distance is the way along the route from its start, whatever this says. |
| `only_new` | `false` | Show nothing but what is still new. |
| `show_max` / `max` | `false` / `5` | Cap how many reports are listed. |
| `collapse_list` / `collapse_after` | `false` / `3` | Fold the list after this many entries. Portrait only. |
| `show_map` / `show_list` | `true` / `true` | The two halves of the card, and of the pop-up in the minimal format. |
| `map_aspect_ratio` | `16:9` | The map's shape. |
| `map_always` | `true` | Keep the map while nothing is reported, fitted to the circle or the route. |
| `map_scale` | `true` | A scale bar in the map's bottom left corner. |
| `map_route` | `true` | Draw a route entry's route on the map. `route_color` and `route_width` dress it. |
| `map_lines` | `true` | Draw every report's stretch of road as a band on the map. |
| `map_traffic` | `true` | Lay TomTom's traffic flow over the map - see [Traffic flow](#traffic-flow). |
| `traffic_style` / `traffic_opacity` | `relative0` / `70` | The flow's colouring - `relative0`, `relative`, `absolute` or `relative-delay` - and how solid it is drawn, in percent. |
| `map_cluster` / `cluster_style` | `true` / `bubble` | Gather nearby reports into groups when zoomed out, and how a group is drawn from Home Assistant 2026.10 on. |
| `center_on_click` | `true` | A click on an entry centres the map on it. |
| `show_area_picker` | `true` | The entry dropdown. |
| `show_planner` | `true` | **+ New route** at the end of the dropdown, and the planner it opens. |
| `follow_map` | `true` | The list follows the map: it lists the reports inside the part of the map in view, and the map keeps showing them all. |
| `show_traffic_switch` | `true` | The **Traffic flow** button under the dropdown, which shows or hides the flow for the moment. |
| `show_row_provider` | `false` | The logo of who reported it under an entry's symbol - TomTom, blitzer.de or Lufop. |
| `show_travel_time` | `true` | A live route's travel time, large under the title - in the minimal format, in the pop-up. |
| `mini_show_travel` | `true` | Minimal format: the line's fourth part, the live route's travel time. |
| `delay_warn_minutes` / `delay_alert_minutes` | `5` / `15` | From how many minutes of delay the travel time turns yellow, and red. `delay_ok_color`, `delay_warn_color` and `delay_alert_color` replace the three colours. |
| `show_title` / `show_new` / `show_delay` / `show_sub` | `true` | The parts of the head: the title, the two badges, the info line. |
| `sub_show_delay` / `sub_show_area` / `sub_show_mode` | `true` | The info line's parts: the traffic's share (a live route), the entry's name, how it searches or the route's length. The moment of the last fetch is always there - in the refresh button, or as the line's last part without one. |
| `show_row_picture` / `show_row_line1` / `show_row_line2` / `show_row_extra` | `true` | The parts of a list entry: the kind's symbol, distance and kind, the place, TomTom's wording. |
| `show_row_reported` / `show_row_until` | `true` | The chips: when it was reported, and until when it lasts. |
| `show_refresh` | `true` | The refresh button, with how long ago the entry was last fetched - beside a live route's travel time, otherwise at the end of the info line. |
| `mini_tap_action` | *(opens the pop-up)* | Minimal format: what a tap on any part of the line does. |

The rest of the keys say how a given element is drawn. Those are what the **Layout** panel writes, and the same ground is covered by the custom properties below.

### CSS variables

Every setting the **Layout** panel makes is also a custom property - bar the route line and the bands, which the card draws into the map - so a theme can dress the card without anyone opening the editor. The names follow one scheme throughout:

```
--tomtom-<element>-<css-property>
```

`<element>` is the block the editor draws it in, and `<css-property>` is spelled the way CSS spells it. `--tomtom-row-line2-font-size` is the font size of an entry's second line. A setting made in the card's editor beats the variable, and the variable beats the card's own default.

```yaml
# themes.yaml
my_theme:
  tomtom-title-font-size: 22px
  tomtom-row-line1-color: "#e8eaed"
  tomtom-new-background: "#ff5722"
  tomtom-divider-color: "rgba(255, 255, 255, 0.12)"
```

The elements, and which suffixes each takes - `-color`; `-font-size`, `-font-weight`, `-font-style`, `-text-transform`, `-text-decoration`, `-letter-spacing`; `-background`; `-icon-color`, `-icon-size`; `-size`:

| Variable prefix | The element | Colour | Text | Background | Symbol | Size |
|---|---|:-:|:-:|:-:|:-:|:-:|
| `--tomtom-title-` | Card title | ✓ | ✓ | | | |
| `--tomtom-sub-` | Info line | ✓ | ✓ | | ✓ | |
| `--tomtom-new-` | New marker | ✓ | ✓ | ✓ | | |
| `--tomtom-delay-` | The delay badge | ✓ | ✓ | ✓ | | |
| `--tomtom-no-reports-` | Text without reports | ✓ | ✓ | | | |
| `--tomtom-travel-time-` | A live route's travel time | ✓ | ✓ | | | |
| `--tomtom-area-select-` | Entry dropdown | ✓ | ✓ | ✓ | | |
| `--tomtom-switch-` | The Traffic flow button | ✓ | ✓ | | | |
| `--tomtom-planner-` | The planner's panel | | | ✓ | | |
| `--tomtom-plan-title-` | The planner's heading | ✓ | ✓ | | | |
| `--tomtom-plan-role-` | The planner's labels | ✓ | ✓ | | | |
| `--tomtom-plan-button-` | The planner's buttons | ✓ | ✓ | | | |
| `--tomtom-plan-time-` | The planned route's time | ✓ | ✓ | | | |
| `--tomtom-plan-facts-` | The facts beside it | ✓ | ✓ | | | |
| `--tomtom-refresh-` | Refresh button | ✓ | ✓ | ✓ | ✓ | |
| `--tomtom-row-picture-` | An entry's symbol | | | | | ✓ |
| `--tomtom-row-line1-` | Distance and kind | ✓ | ✓ | | | |
| `--tomtom-row-line2-` | Place | ✓ | ✓ | | ✓ | |
| `--tomtom-row-extra-` | Description | ✓ | ✓ | | ✓ | |
| `--tomtom-row-chip-` | Chips | ✓ | ✓ | ✓ | | |
| `--tomtom-mini-total-` | Minimal format: the total | ✓ | ✓ | | ✓ | |
| `--tomtom-mini-new-` | Minimal format: what is new | ✓ | ✓ | | ✓ | |
| `--tomtom-mini-delay-` | Minimal format: what the jams cost | ✓ | ✓ | | ✓ | |
| `--tomtom-pop-new-` | New marker on an entry of the pop-up's list | ✓ | ✓ | ✓ | | |
| `--tomtom-cluster-` | Grouped reports on the map | ✓ | ✓ | ✓ | | |

On their own: `--tomtom-card-background-color`, `-image`, `-size`, `-repeat` and `-opacity` for the card's background; `--tomtom-divider-color`, `-width` and `-style` for the rule between entries; `--tomtom-highlight-background` for the entry whose report was clicked on the map; and `--tomtom-mini-total-fill-color` / `-opacity`, `--tomtom-mini-new-fill-color` / `-opacity`, `--tomtom-mini-delay-fill-color` / `-opacity` for the fills behind the minimal line's parts.

## Map card

Everything an entry reports is a `geo_location` entity, so it shows up natively on the [map card](https://www.home-assistant.io/dashboards/map/). Each entry gets a source of its own, `tomtom_<entry>`, with `<entry>` the display name lowercased and slugified.

```yaml
type: map
geo_location_sources:
  - tomtom_commute
entities:
  - zone.home
```

Home Assistant's own map draws each marker with the name's initials; the [TomTom card](#tomtom-card) replaces them with the kind's symbol. The map card's `label_mode: attribute` writes an attribute into the marker instead - `delay_minutes`, say.

## Installation

Needs Home Assistant **2024.7** or newer, and a free [TomTom API key](#the-key-and-what-a-poll-costs).

### What you get

Three things, in one download:

- The **integration** itself.
- The **[TomTom card](#tomtom-card)**. Served by the integration and handed to every dashboard, so there is no file to copy into `www` and no resource to register.
- The **[Report Alerts blueprint](#blueprint-report-alerts)**, put into `config/blueprints/automation/tomtom/` on start.

### HACS

1. Open HACS in Home Assistant, and under its menu pick **Custom repositories**
2. Add `https://github.com/somansch/tomtom` as an **Integration**
3. Search for "TomTom", click **Download**
4. Restart Home Assistant

### Manual

Download `tomtom.zip` from the [latest release](https://github.com/somansch/tomtom/releases/latest) and extract it to `config/custom_components/tomtom`:

```bash
mkdir -p custom_components/tomtom
cd custom_components/tomtom
wget https://github.com/somansch/tomtom/releases/latest/download/tomtom.zip
unzip tomtom.zip
rm tomtom.zip
```

## Help and Contribution

If you find a problem, feel free to open an issue and I will do my best to help. If you have something to contribute, your help is greatly appreciated! If you want to add a new feature, please open a pull request first so we can discuss the details.

## Disclaimer

This custom integration is not officially endorsed or supported by TomTom. It uses TomTom's public developer APIs with a key of your own, under [TomTom's developer terms](https://developer.tomtom.com/terms-and-conditions), which are yours to comply with - above all the free tier's monthly quotas, and what TomTom charges beyond them. Use it at your own risk.

---

[![Buy Me A Coffee](https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png)](https://buymeacoffee.com/ou4lgpvlju)
