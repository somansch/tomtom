# Changelog

All notable changes to this integration are documented here.

## v1.0.1

### Fixed
- **A blueprint you changed is no longer overwritten.** The Report Alerts blueprint was written over on every start whenever the copy under `config/blueprints/automation/tomtom/` differed from the shipped one. The integration now remembers what it last installed: a missing copy is installed, an untouched one is updated when a release changes the blueprint, and one you edited is left alone, with a line in the log when a newer version ships.
- **The traffic flow tiles compare their token in constant time.** The tile path checks its per-start token with `hmac.compare_digest` and refuses every request while no token is set.

## v1.0.0

Initial release: TomTom traffic reports for an area, a device tracker or a live route as `geo_location` entities, the travel time of a route, and a dashboard card of its own. Everything it does is described in the [README](README.md).
