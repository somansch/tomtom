// Builds a translations/<code>.json of the TomTom integration from one
// language table (src/ or out/). The shared blocks (the category
// list, the optional section) are written once in the table and repeated
// into every step that carries them, which is what Home Assistant's
// translation files need.
const fs = require("fs");
const out = require("path").join(__dirname, "..", "..", "custom_components", "tomtom", "translations") + "/";

function build(s) {
  const typeStep = (step, budget) => ({
    title: step.title,
    ...(step.description ? { description: step.description + (step.description.endsWith(" ") ? budget : "") } : {}),
    data: { ...(step.data || {}), ...s.typeData },
    ...(step.data_description ? { data_description: step.data_description } : {}),
    sections: {
      // One section per kind both sources answer: its name is the kind's,
      // its two switches the sources'.
      ...Object.fromEntries(
        ["camera_fixed", "camera_mobile", "camera_redlight", "camera_section"].map((kind) => [
          "kind_" + kind,
          { name: s.categories[kind], data: { blitzer: s.sourceNames.blitzer, lufop: s.sourceNames.lufop } },
        ])
      ),
      optional: { name: s.optional.name, data: s.optional.data, data_description: s.optional.description },
    },
  });
  const plain = (step) => ({
    title: step.title,
    ...(step.description ? { description: step.description } : {}),
    ...(step.data ? { data: step.data } : {}),
    ...(step.data_description ? { data_description: step.data_description } : {}),
    ...(step.menu ? { menu_options: step.menu } : {}),
  });
  const routeSteps = () => {
    const out = {};
    for (const id of [
      "route_start", "route_start_zone", "route_start_point", "route_start_address", "route_start_address_confirm",
      "route_destination", "route_destination_zone", "route_destination_point", "route_destination_address", "route_destination_address_confirm",
      "route_vias", "route_via", "route_failed",
    ]) out[id] = plain(s.steps[id]);
    out.route_review = typeStep(s.steps.route_review, s.budgetRoute);
    return out;
  };
  // The defaults step asks what the review step does, plus its own two
  // fields: the labels of the one serve the other.
  const reviewTexts = s.steps.route_review;
  const defaultsStep = typeStep(
    {
      title: s.steps.route_defaults.title,
      description: s.steps.route_defaults.description,
      data: {
        default_start: s.steps.route_defaults.data.default_start,
        return_route: reviewTexts.data.return_route,
        live_days: reviewTexts.data.live_days,
        live_from: reviewTexts.data.live_from,
        live_until: reviewTexts.data.live_until,
        live_back_from: reviewTexts.data.live_back_from,
        live_back_until: reviewTexts.data.live_back_until,
      },
      data_description: { return_route: reviewTexts.data_description.return_route },
    },
    ""
  );
  // The first setup: the key, the defaults, then the choice of finishing
  // or making the first entry right away - the same defaults screen as
  // under the settings entry's Configure.
  const config = {
    step: {
      user: plain(s.steps.user),
      key: plain(s.steps.key),
      route_defaults: defaultsStep,
      first: plain(s.steps.first),
      area: typeStep(s.steps.area, s.budgetArea),
      tracker: typeStep(s.steps.tracker, s.budgetArea),
      ...routeSteps(),
    },
    abort: s.abort,
    error: s.error,
  };
  const options = {
    step: {
      init: { title: s.steps.init.title, menu_options: s.steps.init.menu },
      route_defaults: defaultsStep,
      quota_warning: { ...plain(s.steps.quota_warning), sections: s.steps.quota_warning.sections },
      sources: plain(s.steps.sources),
      key: plain(s.steps.key),
      area: typeStep(s.steps.area, s.budgetArea),
      tracker: typeStep(s.steps.tracker, s.budgetArea),
      ...routeSteps(),
    },
    error: s.error,
    abort: { no_tracker_with_position: s.abort.no_tracker_with_position },
  };
  // The way back is only offered while an entry is being made.
  const review = options.step.route_review;
  review.data = { ...review.data };
  delete review.data.return_route;
  delete review.data.return_name;
  delete review.data.live_back_from;
  delete review.data.live_back_until;
  delete review.data_description;
  return {
    title: "TomTom",
    selector: {
      search_mode: { options: s.modes },
      live_days: { options: s.days },
      category: { options: s.categories },
      lufop_country: { options: s.lufopCountries },
    },
    // The two things the integration names itself: the settings entry's
    // device, and - through the same table - that entry.
    device: {
      general: { name: s.device.general },
      settings: { name: s.device.settings },
    },
    entity: {
      sensor: Object.fromEntries(Object.entries(s.entities.sensor).map(([k, v]) => [k, { name: v }])),
      number: Object.fromEntries(Object.entries(s.entities.number).map(([k, v]) => [k, { name: v }])),
      binary_sensor: Object.fromEntries(Object.entries(s.entities.binary_sensor).map(([k, v]) => [k, { name: v }])),
    },
    config,
    services: { refresh: { name: s.service.name, description: s.service.description, fields: { config_entry_id: s.service.field } } },
    options,
    issues: { entry_failing: s.issue, source_failing: s.sourceIssue, quota_at_risk: s.quotaIssue, quota_over: s.quotaOverIssue, quota_day_at_risk: s.quotaDayIssue, quota_day_used_up: s.quotaDayUsedUpIssue },
  };
}

module.exports = { build };

// Run on its own, it writes English from src/; i18n_build.js does the same
// for every language.
if (require.main === module) {
  for (const lang of ["en"]) {
    const table = JSON.parse(fs.readFileSync(__dirname + "/src/" + lang + ".backend.json", "utf8"));
    fs.writeFileSync(out + lang + ".json", JSON.stringify(build(table), null, 4) + "\n");
  }
  console.log("translations written");
}
