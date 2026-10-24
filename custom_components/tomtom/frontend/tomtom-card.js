/**
 * TomTom dashboard card.
 *
 * One list answering "what is on my way right now", per configured area or
 * route. Every report TomTom has for it, nearest first, with an optional map
 * that can either mirror the list or drive it - and, on a route TomTom
 * keeps live, how long the way takes right now.
 *
 * Everything it needs is already in the frontend's own state: the reports are
 * geo_location entities, the area names and their search mode come from the
 * device registry, and the "last updated" moment from the entry's own total
 * sensor. The card therefore needs nothing added to the integration.
 */
(() => {
  const CARD_TAG = "tomtom-card";
  const EDITOR_TAG = `${CARD_TAG}-editor`;
  const DOMAIN = "tomtom";
  // The dropdown value that is not an entry but the planner.
  const PLAN_VALUE = "__plan__";
  // Start, destination and the stops TomTom takes between them.
  const PLAN_MAX_PLACES = 22;
  // The planned route on the map, beside the entry's own in the theme's
  // colour.
  const PLAN_COLOR = "#ffa726";
  const SOURCE_PREFIX = `${DOMAIN}_`;
  // How close a click on a list entry takes the map: near enough to read the
  // street the report stands in, and never further out than it already is.
  const FOCUS_ZOOM = 16;
  // What to mark as new with when the area's own sensor does not say -
  // an entry set up before the windows existed, or one whose sensors have
  // not been created yet. The integration's own default, in minutes: an
  // unmarked card would read as broken, where an hour reads as a setting.
  const FALLBACK_WINDOW = 60;
  // What the map fades into at its edges: whatever the card is standing on.
  const FADE = "var(--ha-card-background, var(--card-background-color, #1c1c1c))";

  // ---------------------------------------------------------------- strings
  //
  // Kept here rather than pulled from the integration's own translations: a
  // card renders in the *reader's* language, while entity attributes are
  // stored once for everyone in the server's. Only the card's own chrome is
  // translated - `summary`, `type_name` and the rest arrive already worded by
  // the integration and are printed as they come.
  //
  // English lives in this file; every other language TomTom speaks is a file
  // under lang/ beside it, fetched the first time a reader of that language
  // opens a card - see t() and loadLanguage().
  const STRINGS = {
    en: {
      title: "TomTom",
      radius: "Radius",
      tracker: "Tracker",
      waypoints: "Route",
      updatedNever: "not updated yet",
      updatedNow: "updated just now",
      updatedMin: (n) => `updated ${n} min ago`,
      updatedHours: (n) => `updated ${n} h ago`,
      nothing: "Nothing reported right now",
      nothingInView: "Nothing reported in this part of the map",
      noAreas: "No TomTom entry configured yet.",
      reportedAt: (v) => `Reported at ${v}`,
      reportedOn: (v) => `Reported on ${v}`,
      confirmedAt: (v) => `Confirmed at ${v}`,
      confirmedOn: (v) => `Confirmed on ${v}`,
      closureUntil: (v) => `Until ${v}`,
      newLabel: "New",
      newCount: (n) => `${n} New`,
      // What the jams on this card add up to. Minutes up to an hour, hours
      // and minutes above it - "+95 min" is a number to work out, "+1 h 35
      // min" is one to read.
      // Nought is not "+0": the plus means "on top of your journey", and
      // nothing on top of it is what the minimal line says while the road
      // is clear. The badge never shows this - it is not drawn at nought.
      delaySum: (n) =>
        n <= 0 ? "0 min" : n < 60 ? `+${n} min` : n % 60 ? `+${Math.floor(n / 60)} h ${n % 60} min` : `+${Math.floor(n / 60)} h`,
      noNew: "Nothing new right now",
      noDelay: "Nothing is costing time right now",
      newReports: "new reports",
      popClose: "Close",
      foldOpen: (n) => `Show ${n} more`,
      foldClose: "Show fewer",
      edLayout: "Format",
      edLayoutHelp: "Portrait stacks the map over the list, landscape sets them side by side. Minimal is one line, with the reports in a pop-up.",
      miniLabelTotal: "total",
      miniLabelNew: "new",
      edMiniIconHelp: "Any MDI icon in front of the number. Empty draws none.",
      edMiniIconColorHelp: "Empty takes the number's colour.",
      edMiniIconSizeHelp: "E.g. 22px. Empty keeps the usual size.",
      edFontColor: "Text color",
      edMiniBg: "Background color",
      edMiniBgHelp: "The fill behind this part. New reports and delay start on their own colour; empty leaves it clear.",
      edMiniBgOpacity: "Opacity",
      edMiniBgOpacityHelp: "How much of that colour comes through, in percent.",
      edElMiniTotal: "Total number of reports",
      edElMiniTotalHelp: "The part of the line counting every report.",
      edMiniTotalColorHelp: "Text colour of the total.",
      edMiniTotalFontHelp: "Font of the total.",
      edElMiniNew: "New reports",
      edElMiniNewHelp: "The part of the line counting what is still new.",
      edMiniNewColorHelp: "Text colour of the new count.",
      edMiniNewFontHelp: "Font of the new count.",
      edElMiniDelay: "What the jams cost",
      edElMiniDelayHelp: "The part of the line adding up the delay of the reports.",
      edMiniDelayColorHelp: "Text colour of the delay.",
      edMiniDelayFontHelp: "Font of the delay.",
      edElPopNew: "New marker in the list",
      edElPopNewHelp: "The NEW tag on an entry in the pop-up's list.",
      edPopNewColorHelp: "Text colour of that tag.",
      edPopNewFontHelp: "Font of that tag.",
      edPopNewBackground: "Show background",
      edPopNewBackgroundHelp: "A rounded background behind that tag.",
      edPopNewBg: "Background color",
      edPopNewBgHelp: "Its background colour.",
      edMiniTap: "Tap action",
      edMiniTapHelp: "What a tap on a number does. Default opens the pop-up on the reports it counts.",
      edMiniGroupButtons: "Buttons",
      edMiniGroupButtonsHelp: "The parts of the line, left to right. Each opens the pop-up on what it shows.",
      edMiniGroupPop: "Pop-up",
      edMiniGroupPopHelp: "What the pop-up behind the line shows.",
      edMiniNew: "New",
      edMiniNewHelp: "How many reports are new.",
      edMiniDelay: "Delay",
      edMiniDelayHelp: "What the jams among the reports cost, in minutes.",
      edMiniTravel: "Travel time",
      edMiniTravelHelp: "The live route's travel time right now, coloured by its delay. Nothing on other entries.",
      edElMiniTravel: "Travel time on the line",
      edElMiniTravelHelp: "The travel time on the line. Symbol, fill and text take a colour by the traffic's share: below yellow, from yellow, from red.",
      edMiniTravelLevelOk: "Below yellow",
      edMiniTravelLevelWarn: "From yellow",
      edMiniTravelLevelAlert: "From red",
      edMiniTravelIconColorHelp: "The symbol's colour at this level. Empty: the line's grey below yellow, the threshold's colour from it.",
      edMiniTravelColorHelp: "The time's colour at this level. Empty: the line's text colour below yellow, the threshold's colour from it.",
      edMiniTravelFillHelp: "The fill at this level. Empty: clear below yellow, tinted in the threshold's colour from it.",
      edMiniTravelFontHelp: "Font of the travel time on the line.",
      edMiniTotal: "Total",
      edMiniTotalHelp: "How many reports the area has.",
      layoutPortrait: "Portrait",
      layoutLandscape: "Landscape",
      layoutMinimal: "Minimal",
      newFilterOn: "Show only the new reports",
      newFilterOff: "Back to all reports",
      delayFilterOn: "Show only the reports costing time",
      delayFilterOff: "Back to all reports",
      // editor
      edPanelSettings: "Settings",
      edPanelSettingsDesc: "General, content and list",
      edPanelLayout: "Layout",
      edPanelLayoutDesc: "General, map and list",
      edGroupGeneral: "General",
      edGroupDisplay: "General",
      edGroupMap: "Map",
      edGroupList: "List",
      edTitle: "Card title",
      edTitleHelp: "Empty keeps the default heading.",
      edNothing: "Text when nothing is reported",
      edNothingHelp: "What the card says when nothing is reported. Empty keeps its own wording.",
      edShowDelay: "Show what the jams cost",
      edShowDelayHelp: "The badge beside NEW adding up the delay of the reports; a click narrows the card to them.",
      edShowNew: "Show and mark new reports",
      edShowNewHelp: "The NEW badge beside the title and the NEW tag on new reports. How long a report counts as new is set on the entry.",
      edSubIcon: "Icon",
      edSubIconHelp: "Any MDI icon in front of the line. Empty draws none. Not drawn under a live route's travel time.",
      edSubIconColor: "Icon color",
      edSubIconColorHelp: "Empty takes the line's colour.",
      edSubIconSize: "Icon size",
      edSubIconSizeHelp: "A font size; the icon is as tall as its capital letters. Empty follows the line.",
      edShowSub: "Show the info line",
      edShowSubHelp: "The line under the title: the entry's name, how it searches, the last update. On a live route it stands under the travel time and starts with the traffic's share.",
      edShowTravelTimePop: "Show the travel time",
      edShowTravelTimePopHelp: "The live route's travel time, large in the pop-up, with the refresh button and the traffic's share. The line itself does not show it.",
      edTrafficSwitch: "Show the Traffic flow button",
      edTrafficSwitchHelp: "The Traffic flow button under the entry dropdown, which shows or hides the flow for the moment. Off, the flow is drawn without it.",
      edShowTravelTime: "Show the travel time",
      edShowTravelTimeHelp: "The live route's travel time, large under the title, with the refresh button and the info line. Off, it stands in the info line as \"Route 38 min (+9)\".",
      edGroupContent: "Content",
      edGroupRows: "List",
      edCollapse: "Fold the rest away",
      edCollapseHelp: "Shows the first few reports and folds the rest behind a chevron. Portrait only.",
      edCollapseAfter: "Reports shown",
      edCollapseAfterHelp: "How many reports stay on screen.",
      edDivider: "Show the rule between entries",
      edDividerHelp: "A line between one entry and the next.",
      edRowPicture: "Show the symbol",
      edRowPictureHelp: "The symbol of the report's kind at the start of an entry.",
      edRowProvider: "Provider's logo",
      edRowProviderHelp: "The logo of who reported it, under the symbol: TomTom or blitzer.de.",
      edRowLine1: "Distance and kind",
      edRowLine1Help: "The entry's first line.",
      edRowLine2: "Place",
      edRowLine2Help: "The road and the stretch, under the first line.",
      edRowExtra: "Description",
      edRowExtraHelp: "TomTom's own wording of what is going on, where there is one.",
      edRowReported: "Reported at",
      edElDivider: "Rule between entries",
      edElDividerHelp: "The line between two entries.",
      edDividerColorHelp: "Colour of the line.",
      edDividerWidth: "Width",
      edDividerWidthHelp: "Thickness, e.g. 1px. Empty is 1px.",
      edDividerStyle: "Style",
      edDividerStyleHelp: "Solid, dashed or dotted.",
      lineStyleSolid: "Solid",
      lineStyleDashed: "Dashed",
      lineStyleDotted: "Dotted",
      edChipBackground: "Show background",
      edChipBackgroundHelp: "A filled background behind each chip.",
      edChipBg: "Background color",
      edChipBgHelp: "Background colour of the chips.",
      edRowDistance: "Distance",
      edRowDistanceHelp: "The distance at the start of the line.",
      edElPicture: "Symbol",
      edElPictureHelp: "The symbol of the report's kind.",
      edPictureSize: "Size",
      edPictureSizeHelp: "E.g. 34px. Empty keeps the card's size.",
      edElLine1: "Distance and kind",
      edElLine1Help: "The entry's first line.",
      edLine1ColorHelp: "Text colour of the first line.",
      edLine1FontHelp: "Font of the first line.",
      edElLine2: "Place",
      edElLine2Help: "The road and the stretch.",
      edLine2ColorHelp: "Text colour of the place.",
      edLine2FontHelp: "Font of the place.",
      edElExtra: "Description",
      edElExtraHelp: "TomTom's own wording of what is going on.",
      edExtraColorHelp: "Text colour of the description.",
      edExtraFontHelp: "Font of the description.",
      edElChip: "Chips",
      edElChipHelp: "The small framed labels under an entry.",
      edChipColorHelp: "Text colour of the chips.",
      edChipFontHelp: "Font of the chips.",
      edElAreaPicker: "Area dropdown",
      edElAreaPickerHelp: "The dropdown that picks the entry.",
      edAreaPickerColorHelp: "Text colour of the dropdown.",
      edAreaPickerFontHelp: "Font of the dropdown.",
      edAreaPickerBackground: "Show background",
      edAreaPickerBackgroundHelp: "A filled background behind the dropdown.",
      edAreaPickerBg: "Background color",
      edAreaPickerBgHelp: "Its background colour.",
      edElSwitch: "Traffic flow button",
      edElSwitchHelp: "The Traffic flow button under the dropdown.",
      edSwitchFontHelp: "Font of the button.",
      edSwitchTrack: "Button color",
      edSwitchTrackHelp: "Its fill while the flow is shown, its text while hidden. Empty takes the theme's colour.",
      edElPlanner: "New route: panel",
      edElPlannerHelp: "The box the planner is drawn in.",
      edPlannerBg: "Background color",
      edPlannerBgHelp: "Its fill. Empty takes the theme's secondary background.",
      edElPlanTitle: "New route: title",
      edElPlanTitleHelp: "The planner's heading.",
      edPlanTitleColorHelp: "Text colour of the heading.",
      edPlanTitleFontHelp: "Font of the heading.",
      edElPlanRole: "New route: labels",
      edElPlanRoleHelp: "Start, Stop, Destination and Name in front of their fields. A set place turns the primary colour unless one is set here.",
      edPlanRoleColorHelp: "Text colour of the labels.",
      edPlanRoleFontHelp: "Font of the labels.",
      edElPlanButton: "New route: buttons",
      edElPlanButtonHelp: "Calculate, Save as route, Add a stop, Use the map centre, Discard.",
      edPlanButtonFontHelp: "Font of the buttons.",
      edPlanButtonColor: "Button color",
      edPlanButtonColorHelp: "Fill of the filled buttons, text of the outlined ones. Empty takes the primary colour.",
      edElPlanTime: "New route: travel time",
      edElPlanTimeHelp: "The planned route's travel time, once calculated.",
      edPlanTimeColorHelp: "Text colour of the time.",
      edPlanTimeFontHelp: "Font of the time.",
      edElPlanFacts: "New route: facts",
      edElPlanFactsHelp: "The line beside the time: the traffic's share, the length, the reports on the way. The share keeps its threshold colour.",
      edPlanFactsColorHelp: "Text colour of the line.",
      edPlanFactsFontHelp: "Font of the line.",
      edElTravelTime: "Travel time",
      edElTravelTimeHelp: "The large travel time of a live route.",
      edTravelTimeColorHelp: "Text colour of the travel time.",
      edTravelTimeFontHelp: "Font of the travel time.",
      edElDelayLine: "Traffic delay",
      edElDelayLineHelp: "The traffic's share of a live route's travel time, coloured by the two thresholds.",
      edDelayWarn: "Yellow from",
      edDelayWarnHelp: "Minutes of delay from which the second colour applies.",
      edDelayAlert: "Red from",
      edDelayAlertHelp: "Minutes of delay from which the third colour applies.",
      edDelayOkColor: "Color below yellow",
      edDelayOkColorHelp: "Below the yellow threshold. Empty takes the theme's success colour.",
      edDelayWarnColor: "Color from yellow",
      edDelayWarnColorHelp: "From the yellow threshold. Empty takes the theme's warning colour.",
      edDelayAlertColor: "Color from red",
      edDelayAlertColorHelp: "From the red threshold. Empty takes the theme's error colour.",
      edDelayLineFontHelp: "Font of the delay line.",
      minutesUnit: "min",
      edElRefresh: "Refresh button",
      edElRefreshHelp: "The button that fetches again, with how long ago it last did.",
      edRefreshIconHelp: "Any MDI icon. Empty draws none.",
      edRefreshColor: "Icon color",
      edRefreshColorHelp: "Empty takes the button's text colour.",
      edRefreshSize: "Icon size",
      edRefreshSizeHelp: "A font size; the symbol is as tall as its capital letters. Empty follows the button's text.",
      edRefreshTextColorHelp: "Text colour of the time.",
      edRefreshFontHelp: "Font of the time.",
      edRefreshFrame: "Show background",
      edRefreshFrameHelp: "A soft grey pill behind the button. Off leaves symbol and time on the card.",
      edRefreshBg: "Background color",
      edRefreshBgHelp: "Replaces that grey. Empty keeps the theme's.",
      edShowRefresh: "Show the refresh button",
      edShowRefreshHelp: "A button that fetches the entry again now, with how long ago it last did. Beside the live travel time, otherwise at the end of the info line. Useful with an update interval of 0.",
      refreshNow: "Fetch this area again",
      edElSub: "Info line",
      edElSubHelp: "The line under the title: name, search mode, last update. On a live route it stands under the travel time and starts with the traffic's share.",
      edSubColorHelp: "Text colour of the line.",
      edSubFontHelp: "Font of the line.",
      edSubArea: "Name of the entry",
      edSubAreaHelp: "The area, route or tracker shown.",
      edSubMode: "How it searches, or the route's length",
      edSubModeHelp: "Radius, route or tracker. On a live route with the travel time shown large, the route's current length instead.",
      edSubDelay: "Traffic's share (live route)",
      edSubDelayHelp: "On a live route: the traffic's share of the travel time, coloured by the thresholds under Layout → Traffic delay.",
      edElNew: "New marker",
      edElNewHelp: "The NEW badge and the NEW tag in the list.",
      edNewColorHelp: "Text colour of the marker.",
      edNewFontHelp: "Font of the marker.",
      edNewBackground: "Show background",
      edNewBackgroundHelp: "A rounded background behind the marker.",
      edNewBg: "Background color",
      edNewBgHelp: "Its background colour.",
      edElDelay: "Delay badge",
      edElDelayHelp: "The badge beside NEW that adds up what the jams cost.",
      edDelayColorHelp: "Text colour of the badge.",
      edDelayFontHelp: "Font of the badge.",
      edDelayBackground: "Show background",
      edDelayBackgroundHelp: "A rounded background behind the badge.",
      edDelayBg: "Background color",
      edDelayBgHelp: "Its background colour. Empty is the theme's error colour.",
      edHideTitle: "Hide",
      edHideTitleHelp: "Hide the title even when one is set. The minimal format's pop-up loses it too.",
      edElTitle: "Card title",
      edElTitleHelp: "The card's own title.",
      edElCardBg: "Card background",
      edElCardBgHelp: "A colour and an image behind the whole card; in the minimal format behind its pop-up.",
      edCardBgEnable: "Show background",
      edCardBgEnableHelp: "Draws the colour and the image below. Off keeps the theme's background.",
      edCardBgColor: "Color",
      edCardBgColorHelp: "Background colour of the card.",
      edCardBgImage: "Image",
      edCardBgImageHelp: "Upload one, or paste a URL or a local path. JPEG, PNG, GIF, WebP. Keep it small: the card waits for it on every load.",
      edCardBgImagePlaceholder: "e.g. /local/my-image.jpg",
      edCardBgUpload: "Upload image",
      edCardBgClear: "Remove image",
      edCardBgSize: "Image behaviour",
      edCardBgSizeHelp: "How the image meets the card's edges.",
      bgSizeCover: "Fill (cover)",
      bgSizeContain: "Fit (contain)",
      bgSizeAuto: "Actual size",
      bgSizeRepeat: "Repeat (tile)",
      edCardBgOpacity: "Opacity",
      edCardBgOpacityHelp: "How much of colour and image comes through, in percent.",
      edElNothing: "Text without reports",
      edElNothingHelp: "The line shown when nothing is reported.",
      edColor: "Color",
      edTitleColorHelp: "Text colour of the title.",
      edNothingColorHelp: "Text colour of the line.",
      edColorPlaceholder: "e.g. #ff5722 or var(--my-red)",
      edFont: "Font",
      edTitleFontHelp: "Font of the title.",
      edNothingFontHelp: "Font of the line.",
      edFontPlaceholder: "e.g. 1.2em or 20px",
      edBold: "Bold",
      edItalic: "Italic",
      edUppercase: "Caps",
      edUnderline: "Underline",
      edLetterSpacing: "Letter spacing",
      edLetterSpacingHelp: "Space between the letters. Empty keeps the font's own.",
      edLetterSpacingPlaceholder: "e.g. 0.05em or 1px",
      presetDefault: "Default",
      presetCustom: "Custom",
      presetPrimary: "Primary",
      presetAccent: "Accent",
      presetRed: "Red",
      presetPink: "Pink",
      presetPurple: "Purple",
      presetDeepPurple: "Deep purple",
      presetIndigo: "Indigo",
      presetBlue: "Blue",
      presetLightBlue: "Light blue",
      presetCyan: "Cyan",
      presetTeal: "Teal",
      presetGreen: "Green",
      presetLightGreen: "Light green",
      presetLime: "Lime",
      presetYellow: "Yellow",
      presetAmber: "Amber",
      presetOrange: "Orange",
      presetDeepOrange: "Deep orange",
      presetBrown: "Brown",
      presetGrey: "Grey",
      presetBlueGrey: "Blue grey",
      edAreas: "Areas and routes",
      edAreasHelp: "Empty offers every configured entry.",
      edGroupContentReports: "Reports",
      edGroupContentReportsHelp: "Which of the entry's reports the card shows.",
      edMax: "Maximum number of reports",
      edMaxHelp: "Shows only the nearest few. Off shows every report.",
      edOnlyNew: "Only new reports",
      edOnlyNewHelp: "Only what is still marked new. The NEW badge switches it too.",
      edReference: "Measure distance from",
      edReferenceHelp: "The point distances are measured from. On a route, every distance is the way along the route from its start.",
      refModeArea: "Centre of the area",
      refModeMap: "Centre of the map view",
      refModeEntity: "A person, a tracker or a zone",
      edAreaPicker: "Offer the area dropdown",
      edAreaPickerHelp: "Off pins the card to one entry.",
      edSort: "Sort order",
      edSortHelp: "The order of the reports in the list and the pop-up. It also decides which stay when the number is capped.",
      sortDistance: "Nearest first",
      sortNewest: "Newest first",
      sortOldest: "Oldest first",
      edCenterOnClick: "Click centres the map",
      edCenterOnClickHelp: "A click on an entry centres the map on the report and zooms in. Off opens the report's details.",
      edMapHighlight: "Map click highlights the entry",
      edMapHighlightHelp: "A click on a report on the map backs its entry in the list; a click on the bare map lets go.",
      edElHighlight: "Highlight",
      edElHighlightHelp: "The backing of the entry whose report was clicked on the map.",
      edHighlightBg: "Background color",
      edHighlightBgHelp: "Its background colour.",
      edShowList: "Show the list",
      edShowListHelp: "The list of reports under the head; in the minimal format, in the pop-up.",
      edListOff: "The list is switched off. Turn it on under Settings, General to set it up.",
      edMapOff: "The map is switched off. Turn it on under Settings, General to set it up.",
      edShowMap: "Show a map",
      edShowMapHelp: "Home Assistant's map above the list; in the minimal format, beside the list in the pop-up.",
      edAspect: "Map aspect ratio",
      edAspectHelp: "Height against width. Landscape has none: the map fills its half.",
      aspectPanorama: "21:9 (panorama)",
      aspectWide: "16:9 (widescreen)",
      aspect32: "3:2",
      aspect43: "4:3",
      aspectSquare: "1:1 (square)",
      aspectTall: "3:4 (tall)",
      edMapFade: "Soft edges",
      edMapFadeHelp: "Fades the map into the card on all sides. Its buttons move inward.",
      edMapCluster: "Group nearby reports",
      edMapClusterHelp: "Gathers nearby reports into one group when zoomed out. Off draws each on its own. Needs Home Assistant 2026.10; older versions always group.",
      edClusterStyle: "Shape of a group",
      edClusterStyleHelp: "From Home Assistant 2026.10: the map's bubble with the first symbols and \"+N\", or the disc with the count. Older versions draw the disc.",
      clusterStyleBubble: "Bubble with symbols (Home Assistant's)",
      clusterStyleDisc: "Disc with the count (as before 2026.10)",
      edMapRoute: "Show the route on the map",
      edMapRouteHelp: "The route of a route entry, under the reports, fitted into view at first draw. Colour and width under Layout → Map.",
      edMapScale: "Show a scale bar",
      edMapScaleHelp: "A scale bar bottom left, in Home Assistant's unit. In the minimal format on the pop-up's map.",
      edMapAlways: "Keep the map when nothing is reported",
      edMapAlwaysHelp: "Keeps the map while nothing is reported, fitted to the area or route. Off takes it down until something is reported.",
      liveTime: (minutes, delay) => (delay > 0 ? `${minutes} min (+${delay})` : `${minutes} min`),
      // A live route's travel time, large: minutes up to an hour, hours and
      // minutes above it, the way the delay badge counts.
      travelTime: (n) =>
        n < 60 ? `${n} min` : n % 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${Math.floor(n / 60)} h`,
      // The same on a line too narrow for words: "2:19 h", "45 min".
      travelTimeShort: (n) =>
        n < 60 ? `${n} min` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")} h`,
      travelTimeTip: "Travel time right now, with the traffic of the moment",
      liveDelay: (sum) => `incl. ${sum} traffic`,
      liveFree: "free flow, no delay",
      liveDelayTip: "Already part of the travel time: what the traffic adds to the way on a free road.",
      // The refresh buttons' own words: how long ago, nothing else.
      agoNever: "not yet",
      agoNow: "just now",
      agoMin: (n) => `${n} min ago`,
      agoHours: (n) => `${n} h ago`,
      trafficLine: "Traffic flow",
      trafficSwitch: "Show the traffic flow on the map",
      edMapTraffic: "Show the traffic flow",
      edMapTrafficHelp: "TomTom's traffic flow over the map, every road coloured by how traffic moves. Fetched through the integration with each poll, only while the card is on screen; counted as tiles on the requests sensor.",
      edMapClosures: "Draw the stretch of road",
      edMapClosuresHelp: "The stretch of road under each report's symbol, in the colour of its kind: dark red closed, orange roadworks and closed lane, red jam, amber the rest.",
      edRowClosure: "Until when",
      edElRoute: "Route",
      edElRouteHelp: "The route line. Drawn only while \"Show the route on the map\" is on.",
      edRouteColor: "Line color",
      edRouteColorHelp: "Colour of the line and its end markers. Empty takes the primary colour.",
      edRouteWidth: "Line width",
      edRouteWidthHelp: "Thickness in pixels. 4 by default.",
      edElTraffic: "Traffic flow",
      edElTrafficHelp: "The flow tiles over the map. Only while \"Show the traffic flow\" is on.",
      edTrafficOpacity: "Opacity",
      edTrafficOpacityHelp: "How solid the flow is drawn, in percent. 70 by default.",
      edTrafficStyle: "Colouring",
      edTrafficStyleHelp: "Congestion: how much slower than free flow, moving traffic only. With free roads: the same, free roads in green. Absolute speed: the speed. Delay: minutes lost.",
      trafficStyleRelative0: "Congestion (TomTom's default)",
      trafficStyleRelative: "Congestion, with free roads",
      trafficStyleAbsolute: "Absolute speed",
      trafficStyleDelay: "Delay",
      edElCluster: "Grouped reports",
      edElClusterHelp: "What nearby reports are gathered into when zoomed out: the disc with the count, or from Home Assistant 2026.10 the bubble with symbols and \"+N\".",
      edClusterColor: "Group color",
      edClusterColorHelp: "Colour of the disc or bubble. Empty follows the theme.",
      edClusterTextColor: "Number color",
      edClusterTextColorHelp: "Colour of the count. Empty follows the theme.",
      edClusterFont: "Size and style of the number",
      edClusterFontHelp: "Font size of the count, e.g. 14px, and its style. Empty keeps the map's.",
      // The planner under the dropdown.
      planNew: "+ New route",
      planTitle: "New route",
      planStart: "Start",
      planDestination: "Destination",
      planStop: (n) => `Stop ${n}`,
      planKindEntity: "Entity",
      planKindZone: "Zone",
      planKindMap: "Map",
      planKindAddress: "Address",
      planChoose: "Choose …",
      planNoEntity: "No entity with a position",
      planAddress: "Street, town",
      planUseCentre: "Use the map centre",
      planCentreHint: "Move the map until the crosshair sits on the place, then press the button.",
      planAddStop: "+ Add a stop",
      planSwap: "Swap start and destination",
      planRemove: "Remove this stop",
      planCalculate: "Calculate",
      planSave: "Save as route",
      planDiscard: "Discard",
      planName: "Name of the route",
      planReports: (n) => `${n} reports`,
      planBusy: "Asking TomTom …",
      planNeedPlaces: "Pick a start and a destination first.",
      planNameTaken: "An entry of that name exists already.",
      planFailed: (n) => `TomTom could not work this out: ${n}`,
      planSaved: "Saved. The new route appears in the dropdown as soon as its first poll is in.",
      edShowPlanner: "Offer \"New route\" in the dropdown",
      edShowPlannerHelp: "\"New route\" as the dropdown's last entry: a planner with start, stops and destination. Its route and its reports stand on the map and in the list until it is saved or discarded.",
      edFollowMap: "List follows the map",
      edFollowMapHelp: "The list shows only the reports in the part of the map in view. Off shows them all.",
    },
  };

  // The languages served as a file of their own, by Home Assistant's code.
  const LANG_FILES = [
    "ar", "ca", "cs", "da", "de", "el", "es", "et", "fi", "fr", "he", "hu", "id", "it", "ja",
    "ko", "lt", "lv", "nb", "nl", "pl", "pt", "ro", "ru", "sk", "sv", "th", "tr", "zh-Hant",
  ];
  // Where those files are: lang/ next to this module, under the same
  // version the module was loaded with, so a new release is fetched afresh.
  const SELF_URL = import.meta.url;

  // Who reported it, as a badge under the row's symbol: the source's
  // logo, from brand/ beside this module. TomTom for everything the
  // integration asks TomTom; blitzer.de for what that source adds.
  const PROVIDERS = {
    tomtom: { file: "tomtom.png", name: "TomTom" },
    blitzer: { file: "blitzer.png", name: "blitzer.de" },
    lufop: { file: "lufop.png", name: "Lufop" },
  };
  function providerBadgeHtml(provider) {
    const known = PROVIDERS[provider] || PROVIDERS.tomtom;
    const url = new URL(`brand/${known.file}`, SELF_URL).href;
    return `<img class="prov" src="${escapeHtml(url)}" alt="${escapeHtml(known.name)}" title="${escapeHtml(known.name)}">`;
  }
  const LOADED = {};
  const LOADING = {};
  const LANGUAGE_EVENT = `${CARD_TAG}-language`;

  // A language file is plain strings: the few that the English table keeps
  // as functions are templates there, filled in here, and the time
  // formatters are built from the file's two unit words.
  function wrap(flat) {
    const table = { ...flat };
    const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    for (const key of [
      "updatedMin", "updatedHours", "reportedAt", "reportedOn", "confirmedAt", "confirmedOn", "closureUntil",
      "newCount", "foldOpen", "liveDelay", "agoMin", "agoHours", "planStop", "planReports", "planFailed",
    ]) {
      table[key] = (n) => fill(flat[key], { n });
    }
    const min = flat.unitMin || "min";
    const hour = flat.unitHour || "h";
    const hm = (n) => (n % 60 ? `${Math.floor(n / 60)} ${hour} ${n % 60} ${min}` : `${Math.floor(n / 60)} ${hour}`);
    table.delaySum = (n) => (n <= 0 ? `0 ${min}` : n < 60 ? `+${n} ${min}` : `+${hm(n)}`);
    table.travelTime = (n) => (n < 60 ? `${n} ${min}` : hm(n));
    table.travelTimeShort = (n) =>
      n < 60 ? `${n} ${min}` : `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")} ${hour}`;
    table.liveTime = (minutes, delay) => (delay > 0 ? `${minutes} ${min} (+${delay})` : `${minutes} ${min}`);
    // Anything the file lacks falls back to English rather than to a hole.
    for (const [key, value] of Object.entries(STRINGS.en)) {
      if (!(key in table)) table[key] = value;
    }
    return table;
  }

  // The reader's language, as a code this card has words for: the exact
  // code first ("zh-Hant", "pt-BR"), then its first part ("pt"), else
  // English.
  function langCode(hass) {
    const raw = String(hass && hass.language ? hass.language : "en");
    for (const code of [raw, raw.split("-")[0].toLowerCase()]) {
      if (STRINGS[code] || LANG_FILES.includes(code)) return code;
    }
    return "en";
  }

  function loadLanguage(code) {
    if (LOADED[code] || LOADING[code]) return;
    let url;
    try {
      url = new URL(`lang/${code}.json`, SELF_URL);
      const version = new URL(SELF_URL).searchParams.get("v");
      if (version) url.searchParams.set("v", version);
    } catch (err) {
      return;
    }
    LOADING[code] = fetch(url.toString(), { credentials: "same-origin" })
      .then((response) => (response.ok ? response.json() : null))
      .then((flat) => {
        if (flat && typeof flat === "object") {
          LOADED[code] = wrap(flat);
          // Every card and editor on the page redraws in the new words.
          window.dispatchEvent(new Event(LANGUAGE_EVENT));
        }
      })
      .catch(() => {
        // Asked again on the next draw.
        delete LOADING[code];
      });
  }

  function t(hass) {
    if (hass) LOCALE_HASS = hass;
    const code = langCode(hass);
    if (STRINGS[code]) return STRINGS[code];
    if (LOADED[code]) return LOADED[code];
    loadLanguage(code);
    return STRINGS.en;
  }

  // ----------------------------------------------------------------- config
  const DEFAULTS = {
    // The shape of the whole card. "portrait" is the map over the list,
    // "landscape" the two side by side, and "minimal" a single line saying
    // what is new, with those reports behind it in a pop-up.
    layout: "portrait",
    // The minimal format is two numbers - everything the area reports, and
    // what of it is new - with a symbol between them. Each number opens the
    // pop-up on what it counts, so the scope is a click rather than a setting.
    // The two halves of the minimal line and the NEW tag in its pop-up are
    // elements of their own, each with the full set - see DESIGN_ELEMENTS.
    // Their looks are separate from the head's badges on purpose: the badges
    // are not drawn in this format, and a card that is one line has different
    // needs from one that is a head over a list.
    mini_icon: "mdi:car-multiple",
    mini_icon_color: "",
    mini_icon_size: "",
    mini_color: "",
    mini_font_size: "",
    mini_bold: false,
    mini_italic: false,
    mini_uppercase: false,
    mini_underline: false,
    mini_letter_spacing: "",
    // A fill of its own behind each half. Empty leaves what the stylesheet
    // draws: nothing behind the total, the accent tint behind the new.
    mini_fill_color: "",
    mini_fill_opacity: 100,
    mini_new_icon: "mdi:bell-outline",
    mini_new_icon_color: "",
    mini_new_icon_size: "",
    mini_new_color: "",
    mini_new_font_size: "",
    mini_new_bold: false,
    mini_new_italic: false,
    mini_new_uppercase: false,
    mini_new_underline: false,
    mini_new_letter_spacing: "",
    // Pre-set rather than empty: this half is already drawn on the accent,
    // and a field that says nothing while something is plainly there cannot
    // be dimmed or replaced - a lower opacity would only have faded a second
    // layer over the first. These two are that first layer now, so the
    // stylesheet no longer paints one of its own.
    mini_new_fill_color: "var(--tomtom-new-background, var(--accent-color, #ff9800))",
    mini_new_fill_opacity: 14,
    // The third part, arranged like the second: a clock rather than a queue,
    // because what this part counts is time rather than reports, and the
    // colour of the badge it stands in for.
    mini_delay_icon: "mdi:timer-alert-outline",
    mini_delay_icon_color: "",
    mini_delay_icon_size: "",
    mini_delay_color: "",
    mini_delay_font_size: "",
    mini_delay_bold: false,
    mini_delay_italic: false,
    mini_delay_uppercase: false,
    mini_delay_underline: false,
    mini_delay_letter_spacing: "",
    mini_delay_fill_color: "var(--tomtom-delay-background, var(--error-color, #db4437))",
    mini_delay_fill_opacity: 14,
    // The fourth part, on a route TomTom keeps live: how long it takes right
    // now. Its symbol, its fill and its text each have a colour per level
    // of delay - below the yellow threshold, from it, and from the red one
    // (delay_warn_minutes / delay_alert_minutes). Empty is the stylesheet's
    // own: plain below yellow, the threshold's colour from it, the fill
    // tinted at the same opacity the other parts use.
    mini_show_travel: true,
    mini_travel_icon: "mdi:car-clock",
    mini_travel_icon_size: "",
    mini_travel_ok_icon_color: "",
    mini_travel_ok_color: "",
    mini_travel_ok_fill_color: "",
    mini_travel_warn_icon_color: "",
    mini_travel_warn_color: "",
    mini_travel_warn_fill_color: "",
    mini_travel_alert_icon_color: "",
    mini_travel_alert_color: "",
    mini_travel_alert_fill_color: "",
    mini_travel_fill_opacity: 14,
    mini_travel_font_size: "",
    mini_travel_bold: false,
    mini_travel_italic: false,
    mini_travel_uppercase: false,
    mini_travel_underline: false,
    mini_travel_letter_spacing: "",
    // The same starting look as the NEW tag in the card's own list: bold,
    // in capitals, on its pill.
    pop_new_color: "",
    pop_new_background: true,
    pop_new_background_color: "",
    pop_new_font_size: "",
    pop_new_bold: true,
    pop_new_italic: false,
    pop_new_uppercase: true,
    pop_new_underline: false,
    pop_new_letter_spacing: "",
    // And whether that pop-up puts a map beside the list.
    // Which parts the minimal line is made of. The other two follow
    // show_new and show_delay, which answer for the head's badges where
    // there is a head instead.
    mini_show_total: true,
    title: "",           // empty = the translated default
    areas: [],           // device ids; empty = every configured area
    // Off, the card shows every report the area has; on, the nearest `max`
    // of them. The number keeps its value while the limit is switched off, so
    // switching back on does not mean typing it again.
    show_max: false,
    max: 5,
    // Starts the card on the new-only filter the head badge also toggles.
    only_new: false,
    // Where distances are measured from. "area" keeps the integration's own
    // figure - to the area's centre point, or to the nearest waypoint on a
    // route. "map" follows the embedded map's centre, so panning re-sorts the
    // list around wherever one is looking. "entity" measures from the person,
    // device tracker or zone named below, which stays named while one of the
    // other two modes is picked - switching back keeps the pick rather than
    // asking for it again.
    reference_mode: "area",
    reference: "",
    show_area_picker: true,
    // The list narrowed to what the map shows, as it is panned and zoomed.
    follow_map: true,
    // "+ New route" at the end of the dropdown, and the planner it opens.
    show_planner: true,
    // The traffic flow's own switch and refresh, under the two above. Off,
    // the flow is drawn without them - see map_traffic for the flow itself.
    show_traffic_switch: true,
    area_select_color: "",
    area_select_background: true,
    area_select_background_color: "",
    area_select_font_size: "",
    area_select_bold: false,
    area_select_italic: false,
    area_select_uppercase: false,
    area_select_underline: false,
    area_select_letter_spacing: "",
    // The switch under the area dropdown - the traffic flow's: its label,
    // and the colour of one that is on.
    switch_color: "",
    switch_font_size: "",
    switch_bold: true,
    switch_italic: false,
    switch_uppercase: true,
    switch_underline: false,
    switch_letter_spacing: "",
    switch_track_color: "",
    // The planner - "+ New route" in the dropdown: its panel, its heading,
    // the labels in front of the fields, its buttons (capitals and weight
    // from here, as the badges'), the planned route's time and the facts
    // beside it.
    planner_background_color: "",
    plan_title_color: "",
    plan_title_font_size: "",
    plan_title_bold: false,
    plan_title_italic: false,
    plan_title_uppercase: false,
    plan_title_underline: false,
    plan_title_letter_spacing: "",
    plan_role_color: "",
    plan_role_font_size: "",
    plan_role_bold: false,
    plan_role_italic: false,
    plan_role_uppercase: false,
    plan_role_underline: false,
    plan_role_letter_spacing: "",
    plan_button_color: "",
    plan_button_font_size: "",
    plan_button_bold: true,
    plan_button_italic: false,
    plan_button_uppercase: true,
    plan_button_underline: false,
    plan_button_letter_spacing: "",
    plan_button_fill: "",
    plan_time_color: "",
    plan_time_font_size: "",
    plan_time_bold: false,
    plan_time_italic: false,
    plan_time_uppercase: false,
    plan_time_underline: false,
    plan_time_letter_spacing: "",
    plan_facts_color: "",
    plan_facts_font_size: "",
    plan_facts_bold: false,
    plan_facts_italic: false,
    plan_facts_uppercase: false,
    plan_facts_underline: false,
    plan_facts_letter_spacing: "",
    // The card's own heading, and how it is drawn. Switched off, the whole
    // title line goes - and with it its Layout settings, which would then
    // style something nobody sees.
    show_title: true,
    title_color: "",
    title_font_size: "",
    title_bold: false,
    title_italic: false,
    title_uppercase: false,
    title_underline: false,
    title_letter_spacing: "",
    // The card's own wording for an empty area. Empty keeps whichever of
    // its two built-in sentences fits the situation.
    // Any MDI name, drawn in front of the line and taking its colour and
    // size. Empty draws none.
    sub_icon: "mdi:information-outline",
    // Empty means "as tall as a capital letter of the line", which is what
    // the stylesheet does with the 1cap unit.
    sub_icon_color: "",
    sub_icon_size: "",
    // The line as a whole, then the three things it can say, each on its own.
    // The badge beside the title, and the line under it: each on its own
    // switch, because one says how much there is and the other says where
    // one is looking.
    // Part of the line under the title, and on with it: a card that polls
    // on demand is unusable without it, and one that polls on a schedule
    // loses nothing to a second symbol on a line that already says when it
    // last looked.
    show_refresh: true,
    refresh_icon: "mdi:refresh",
    refresh_icon_color: "",
    refresh_icon_size: "",
    // The time it last fetched is written in the button, and the button is
    // a rounded frame unless that is switched off - for the area's refresh
    // and the traffic flow's alike.
    refresh_color: "",
    refresh_font_size: "",
    refresh_bold: false,
    refresh_italic: false,
    refresh_uppercase: false,
    refresh_underline: false,
    refresh_letter_spacing: "",
    refresh_background: true,
    refresh_background_color: "",
    // A route TomTom keeps live: its travel time large under the title, and
    // under it what of that is traffic, coloured by two thresholds in
    // minutes - below the first in the first colour, then the second, then
    // from the second threshold on the third.
    show_travel_time: true,
    travel_time_color: "",
    travel_time_font_size: "",
    travel_time_bold: false,
    travel_time_italic: false,
    travel_time_uppercase: false,
    travel_time_underline: false,
    travel_time_letter_spacing: "",
    delay_warn_minutes: 5,
    delay_alert_minutes: 15,
    delay_ok_color: "",
    delay_warn_color: "",
    delay_alert_color: "",
    delay_line_font_size: "",
    delay_line_bold: false,
    delay_line_italic: false,
    delay_line_uppercase: false,
    delay_line_underline: false,
    delay_line_letter_spacing: "",
    show_sub: true,
    // The traffic's share, first in the line on a live route.
    sub_show_delay: true,
    sub_show_area: true,
    sub_show_mode: true,
    sub_color: "",
    sub_font_size: "",
    sub_bold: false,
    sub_italic: false,
    sub_uppercase: false,
    sub_underline: false,
    sub_letter_spacing: "",
    no_reports_text: "",
    no_reports_color: "",
    no_reports_font_size: "",
    no_reports_bold: false,
    no_reports_italic: false,
    no_reports_uppercase: false,
    no_reports_underline: false,
    no_reports_letter_spacing: "",
    // A background of the user's own behind the whole card - a colour, an
    // image, or both. Off by default: an existing card must keep the
    // background its theme gives it until somebody asks for another.
    card_background: false,
    card_background_color: "",
    card_background_image: "",
    card_background_size: "cover",
    card_background_opacity: 100,
    // Whether a freshly reported entry is marked NEW at all. How long that
    // lasts is not the card's to answer - it belongs to the area, and is
    // read back off its sensors. See newWindow().
    show_new: true,
    // What the jams cost, added up (see delaySum): the badge beside the NEW
    // one where there is a head to draw it in, the third part of the line
    // where there is not. The badge is only drawn where there is something
    // to add up; the part of the line stands quiet at nought, the way the
    // new part beside it does.
    show_delay: true,
    new_color: "",
    new_background: true,
    new_background_color: "",
    new_font_size: "",
    // Both on: the marker is drawn bold and in capitals, and a switch that
    // reports a look has to start where that look actually is.
    new_bold: true,
    new_italic: false,
    new_uppercase: true,
    new_underline: false,
    new_letter_spacing: "",
    // The delay badge beside it (see delaySum): the same nine settings, so
    // the two can be styled as a pair or told apart. Bold and in capitals
    // like the badge it stands next to, which is where it started.
    delay_color: "",
    delay_background: true,
    delay_background_color: "",
    delay_font_size: "",
    delay_bold: true,
    delay_italic: false,
    delay_uppercase: true,
    delay_underline: false,
    delay_letter_spacing: "",
    // On by default, both of them: a map beside the list is what most people
    // put this card on a dashboard for, and with the list following the map
    // panning it is how one reads a route rather than a radius.
    show_map: true,
    // The list itself. Off leaves the head - and the map, if that is on.
    show_list: true,
    map_aspect_ratio: "16:9",
    // Home Assistant's own marker chrome. Off by default: the TomTom
    // symbols are drawings in their own right and read better without a ring
    // and a disc around them. Switch either on for Home Assistant's own look.
    // Soft edges rather than a hard cut, on by default - a map that melts
    // into the card is what this card is meant to look like. The switch is
    // there for anyone who wants the plain rectangle back.
    map_fade: true,
    // The route of a route entry - waypoints or start/destination - drawn on
    // the map. Its colour follows the theme's primary colour until one is
    // picked; the width is in pixels.
    map_route: true,
    // Every report's stretch of road, as a band on the map.
    map_lines: true,
    map_always: true,
    // A scale bar in the map's bottom left corner, drawn by the card itself
    // so that both map engines show the same one.
    map_scale: true,
    map_traffic: true,
    // TomTom's flow tiles: which of its colourings, and how solid.
    traffic_style: "relative0",
    traffic_opacity: 70,
    route_color: "",
    route_width: 4,
    // Whether Home Assistant's map gathers nearby reports into discs at all.
    // On, as the map itself defaults to; off is handed to the map as its
    // "cluster" option, which versions before 2026.10 do not know and
    // ignore - they group regardless.
    map_cluster: true,
    // What a group looks like from 2026.10 on: the map's bubble with the
    // first few symbols ("bubble"), or the disc with the count that every
    // version before drew ("disc") - redrawn by the card over the bubble.
    // Moot before 2026.10, where the disc is all there is.
    cluster_style: "bubble",
    // The discs Home Assistant's map gathers nearby reports into, with the
    // count on them: the disc's colour and the count's. Empty leaves the
    // theme's primary colour and its text colour on it.
    cluster_color: "",
    cluster_text_color: "",
    cluster_font_size: "",
    cluster_bold: false,
    cluster_italic: false,
    cluster_underline: false,
    // A click on a list entry aims the map at that report rather than
    // opening Home Assistant's details dialog for it.
    center_on_click: true,
    // And the other way round: a click on a report in the map backs its
    // entry in the list until the bare map is clicked.
    map_highlight: true,
    highlight_color: "",
    // Nearest first, which is what a card about what is on the road ahead
    // is for. The other two order by when something was reported.
    sort: "distance",
    // Off by default: a card that has always shown its whole list must not
    // start hiding the end of it because it was updated. On, the first few
    // stand and the rest waits behind a chevron.
    collapse_list: false,
    collapse_after: 3,
    // What a list entry is made of, each part on its own switch, plus the
    // rule between two entries.
    show_divider: true,
    divider_color: "",
    divider_width: "",
    divider_style: "solid",
    show_row_picture: true,
    // The logo of who reported it, under the symbol. Off unless asked for.
    show_row_provider: false,
    row_picture_size: "",
    show_row_line1: true,
    show_row_distance: true,
    show_row_line2: true,
    show_row_extra: true,
    show_row_reported: true,
    // "Until ..." where TomTom says when a report ends.
    show_row_until: true,
    line1_color: "",
    line1_font_size: "",
    line1_bold: false,
    line1_italic: false,
    line1_uppercase: false,
    line1_underline: false,
    line1_letter_spacing: "",
    line2_icon: "mdi:map-marker",
    line2_icon_color: "",
    line2_icon_size: "",
    line2_color: "",
    line2_font_size: "",
    line2_bold: false,
    line2_italic: false,
    line2_uppercase: false,
    line2_underline: false,
    line2_letter_spacing: "",
    extra_icon: "mdi:text",
    extra_icon_color: "",
    extra_icon_size: "",
    extra_color: "",
    extra_font_size: "",
    extra_bold: false,
    extra_italic: false,
    extra_uppercase: false,
    extra_underline: false,
    extra_letter_spacing: "",
    chip_color: "",
    chip_background: true,
    chip_background_color: "",
    chip_font_size: "",
    chip_bold: false,
    chip_italic: false,
    chip_uppercase: false,
    chip_underline: false,
    chip_letter_spacing: "",
  };

  function defaultConfig(config) {
    const merged = { ...DEFAULTS, ...(config || {}) };
    // Until the windows moved to the integration, the card carried its own
    // "mark as new for" in minutes, and 0 was how the marking got switched
    // off. Nothing but that switch could produce a 0 - the default was 60 -
    // so one still on file is read as the switch it has become, and the dead
    // key drops out the next time the editor saves.
    if (merged.new_minutes !== undefined) {
      if (merged.new_minutes === 0) merged.show_new = false;
      delete merged.new_minutes;
    }
    // The pop-up used to have a map switch of its own, next to the card's.
    // Two switches for one map is one too many, so the card's own answers
    // for both now - and a card that had the pop-up map switched off keeps
    // it off. Only where that switch was ever reachable: outside the minimal
    // format it was hidden, and a stale false there must not blank the map a
    // portrait card actually draws.
    if (merged.mini_popup_map !== undefined) {
      if (merged.mini_popup_map === false && merged.layout === "minimal") {
        merged.show_map = false;
      }
      delete merged.mini_popup_map;
    }
    // The filter and its switches are gone with the two halves; their keys
    // drop out the next time the editor saves.
    for (const key of Object.keys(merged)) {
      if (key.startsWith("filter_select_") || key === "filter" || key === "show_filter_picker") delete merged[key];
    }
    return merged;
  }

  function sameValue(a, b) {
    if (a === b) return true;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      return a.every((item, i) => sameValue(item, b[i]));
    }
    return false;
  }

  // Everything that differs from what defaultConfig would have produced
  // anyway. Writing all of it back would put a dozen lines of YAML behind a
  // card nobody has customised, burying the one or two that say something -
  // and would pin options nobody chose to today's defaults forever.
  function pruneDefaults(config) {
    const out = {};
    for (const [key, value] of Object.entries(config)) {
      if (key === "type") { out[key] = value; continue; }
      if (sameValue(value, DEFAULTS[key])) continue;
      out[key] = value;
    }
    return out;
  }

  // ------------------------------------------------------------------ data
  //
  // Every entry the TomTom integration has set up, as the device registry
  // sees it. A renamed device answers on name_by_user, so both are read - and
  // the id, not the name, is what the entities are matched against further
  // down, so renaming an area never breaks the card.
  // ------------------------------------------------------------------ route
  //
  // The line a "Route (start/destination)" entry searches along, drawn on
  // Home Assistant's own map - in this card, in its pop-up, and in the setup
  // dialog, which has no field of its own that could draw one.
  //
  // Drawn with the map element's own Leaflet (ha-map's Leaflet and
  // leafletMap), in the overlay pane, so the reports sit on top of it.
  function routeSig(route) {
    if (!route || !route.points || route.points.length < 2) return "";
    const pts = route.points;
    return pts.length + ":" + pts[0].join(",") + ":" + pts[pts.length - 1].join(",");
  }

  // The colour the route is drawn in: the one picked in the editor, or the
  // theme's primary colour. A picked one is resolved here - a preset is a CSS
  // variable, and Leaflet writes the colour into an SVG attribute, where a
  // variable means nothing.
  function routeColor(el, picked) {
    try {
      if (picked) {
        const probe = document.createElement("span");
        probe.style.display = "none";
        probe.style.color = picked;
        (el.shadowRoot || el).appendChild(probe);
        const rgb = getComputedStyle(probe).color;
        probe.remove();
        if (rgb) return rgb;
      }
      return getComputedStyle(el).getPropertyValue("--primary-color").trim() || "#03a9f4";
    } catch (err) {
      return "#03a9f4";
    }
  }

  // ---- the map's handles, by Home Assistant version
  //
  // Through 2026.9, ha-map carried Leaflet itself: the namespace as
  // `Leaflet`, the instance as `leafletMap`. From 2026.10 it drives an
  // engine instead - MapLibre GL, or Leaflet as the fallback without
  // WebGL2 - keeps that engine to itself, and offers fitBounds,
  // containsLocation, getView and setView of its own. Neither shape is a
  // documented interface, so everything here is found by feel and guarded:
  // a map that offers neither simply gets no route drawn and no viewport
  // read, as the card has always behaved when it could not reach in.
  //
  // What comes back is one small vocabulary the rest of the card speaks
  // whatever the version: events, the centre and the viewport, a jump to a
  // point, and the three things a route is drawn with - a line, a dot and a
  // numbered label - plus a fit to a set of points.
  // Home Assistant 2026.9 draws the streets under a Leaflet map through a
  // plugin that defers part of its work to the next frame after a resize or
  // a zoom - its _transitionEnd - and runs it whether or not the layer is
  // still on a map by then. A map taken down in between, which a pop-up
  // closing, a view switch or a card rebuilding its map all do, leaves that
  // frame reading a null map: "Cannot read properties of null (reading
  // 'getZoom')", reported by the frontend into Home Assistant's log. Every
  // such frame is scheduled through Leaflet's own scheduler, so that is
  // taught to drop a callback whose layer has been removed. Once per
  // Leaflet, for every map on the page; 2026.10's MapLibre engine does not
  // go through here.
  function guardLeafletPlugin(L) {
    try {
      const util = L && L.Util;
      if (!util || util.__tomtomGuarded || typeof util.requestAnimFrame !== "function") return;
      const raf = util.requestAnimFrame;
      util.requestAnimFrame = function (fn, context, immediate) {
        if (context && typeof fn === "function" && "_glMap" in context) {
          const guarded = function () {
            if (!context._map || !context._glMap) return undefined;
            return fn.apply(this, arguments);
          };
          return raf.call(this, guarded, context, immediate);
        }
        return raf.call(this, fn, context, immediate);
      };
      util.__tomtomGuarded = true;
    } catch (err) {
      // A Leaflet without that scheduler has nothing to guard.
    }
  }

  // A scale bar in the map's bottom left corner: a bracket as wide as a
  // round number of metres or feet at the map's current scale, redrawn on
  // every move. Drawn by hand rather than with either engine's own control:
  // Leaflet's and MapLibre's differ in look and are reached differently, and
  // the width of the view in metres is the whole of what either knows. The
  // bar's width is the view's width in pixels divided by its width in
  // metres across the middle - exact enough for a bar that is rounded to
  // 1, 2, 3 or 5 of a power of ten anyway. Removed with the handles.
  function scaleBar(h, imperial) {
    const container = h && typeof h.container === "function" ? h.container() : null;
    if (!container) return null;
    const el = document.createElement("div");
    el.className = "tomtom-scale";
    const line = document.createElement("div");
    line.className = "tomtom-scale-line";
    el.appendChild(line);
    container.appendChild(el);
    // Leaflet's own rounding: the largest of 1, 2, 3, 5 times a power of
    // ten that fits.
    const round = (num) => {
      const pow = Math.pow(10, String(Math.floor(num)).length - 1);
      const d = num / pow;
      return pow * (d >= 10 ? 10 : d >= 5 ? 5 : d >= 3 ? 3 : d >= 2 ? 2 : 1);
    };
    const update = () => {
      try {
        const b = h.bounds();
        const width = container.clientWidth;
        if (!b || !(width > 0)) return;
        const lat = (b.north + b.south) / 2;
        const metres = distanceKm(lat, b.west, lat, b.east) * 1000;
        const perPixel = metres / width;
        if (!(perPixel > 0)) return;
        // At most 70 px wide: a small bar, read at a glance, not a ruler.
        const most = perPixel * 70;
        let text;
        let px;
        if (imperial) {
          const feet = most * 3.28084;
          if (feet > 5280) {
            const miles = round(feet / 5280);
            text = `${miles} mi`;
            px = (miles * 5280) / 3.28084 / perPixel;
          } else {
            const f = round(feet);
            text = `${f} ft`;
            px = f / 3.28084 / perPixel;
          }
        } else {
          const m = round(most);
          text = m >= 1000 ? `${fmtNumber(m / 1000, 1)} km` : `${m} m`;
          px = m / perPixel;
        }
        line.style.width = `${Math.round(px)}px`;
        line.textContent = text;
      } catch (err) {
        // The map went away underneath; the next move redraws or the bar
        // is removed with it.
      }
    };
    h.on("move", update);
    h.on("zoom", update);
    let observer = null;
    try {
      observer = new ResizeObserver(update);
      observer.observe(container);
    } catch (err) {
      // Without one the bar is still redrawn on every move.
    }
    update();
    return {
      update,
      remove: () => {
        try {
          h.off("move", update);
          h.off("zoom", update);
        } catch (err) {
          // Already gone with its map.
        }
        if (observer) observer.disconnect();
        el.remove();
      },
    };
  }

  function mapHandles(haMap) {
    if (!haMap) return null;

    const leafletHandles = (L, leaflet) => ({
      kind: "leaflet",
      on: (name, fn) => leaflet.on(name, fn),
      off: (name, fn) => leaflet.off(name, fn),
      container: () => (typeof leaflet.getContainer === "function" ? leaflet.getContainer() : null),
      centre: () => {
        const c = leaflet.getCenter();
        return { lat: c.lat, lon: c.lng };
      },
      contains: (lat, lon) => leaflet.getBounds().contains([lat, lon]),
      bounds: () => {
        const b = leaflet.getBounds();
        return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
      },
      traffic: () => trafficLeafletLayer(L, leaflet),
      zoom: () => leaflet.getZoom(),
      zoomTo: (lat, lon, minZoom) =>
        leaflet.setView([lat, lon], Math.max(leaflet.getZoom() || 0, minZoom)),
      line: (points, o) => {
        const line = L.polyline(points, {
          color: o.color,
          weight: o.width,
          opacity: o.opacity,
          dashArray: o.dashed ? "8 6" : null,
          interactive: false,
        });
        line.addTo(leaflet);
        return { remove: () => line.remove() };
      },
      dot: (point, o) => {
        const dot = L.circleMarker(point, {
          radius: o.radius,
          color: "#fff",
          weight: 2,
          fillColor: o.color,
          fillOpacity: o.fill,
          interactive: false,
        });
        dot.addTo(leaflet);
        return { remove: () => dot.remove() };
      },
      label: (point, text, color) => {
        const marker = L.marker(point, {
          interactive: false,
          icon: L.divIcon({
            className: "",
            iconSize: [22, 22],
            iconAnchor: [11, 11],
            html: routeLabelHtml(text, color),
          }),
        });
        marker.addTo(leaflet);
        return { remove: () => marker.remove() };
      },
      marker: (point, html, size) => {
        const marker = L.marker(point, {
          interactive: false,
          icon: L.divIcon({ className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2], html }),
        });
        marker.addTo(leaflet);
        return { remove: () => marker.remove() };
      },
      fit: (points, o = {}) => fitRoute(leaflet, L.latLngBounds(points), o.maxZoom),
      inView: (points) => {
        const size = leaflet.getSize();
        return points.every((pt) => {
          const p = leaflet.latLngToContainerPoint(L.latLng(pt[0], pt[1]));
          return p.x >= 22 && p.y >= 22 && p.x <= size.x - 22 && p.y <= size.y - 22;
        });
      },
    });

    // Through 2026.9.
    if (haMap.leafletMap && haMap.Leaflet && typeof haMap.leafletMap.getBounds === "function") {
      guardLeafletPlugin(haMap.Leaflet);
      return leafletHandles(haMap.Leaflet, haMap.leafletMap);
    }

    const engine = haMap._engine;
    if (!engine) return null;
    // 2026.10's Leaflet fallback: the same Leaflet, one level down.
    if (engine.leafletMap && engine.Leaflet && typeof engine.leafletMap.getBounds === "function") {
      guardLeafletPlugin(engine.Leaflet);
      return leafletHandles(engine.Leaflet, engine.leafletMap);
    }
    // 2026.10's MapLibre engine. The route goes on as one of the engine's
    // own paths - the kind it draws history trails with, which it also
    // carries across a change of map style - and the dots and labels as
    // markers, which is what the engine places any element with.
    const inner = engine._map;
    if (
      !inner || typeof inner.on !== "function" ||
      typeof engine.addPath !== "function" || typeof engine.addMarker !== "function" ||
      typeof haMap.fitBounds !== "function" || typeof haMap.containsLocation !== "function" ||
      typeof haMap.getView !== "function"
    ) {
      return null;
    }
    const element = (cssText) => {
      const el = document.createElement("div");
      el.style.cssText = cssText;
      return el;
    };
    return {
      kind: "engine",
      on: (name, fn) => inner.on(name, fn),
      off: (name, fn) => inner.off(name, fn),
      container: () => (typeof inner.getContainer === "function" ? inner.getContainer() : null),
      centre: () => {
        const view = haMap.getView();
        return view && view.center ? { lat: view.center[0], lon: view.center[1] } : undefined;
      },
      contains: (lat, lon) => haMap.containsLocation([lat, lon]),
      bounds: () => {
        const b = inner.getBounds();
        return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
      },
      traffic: () => trafficEngineLayer(inner),
      zoom: () => {
        const view = haMap.getView();
        return view ? view.zoom : undefined;
      },
      zoomTo: (lat, lon, minZoom) => {
        const view = haMap.getView();
        haMap.setView([lat, lon], Math.max((view && view.zoom) || 0, minZoom));
      },
      line: (points, o) => {
        // The engine numbers its paths; the one just added is the last
        // number handed out. Its line is drawn 3px wide whatever is asked,
        // so the width is set on the layer afterwards - and again whenever
        // the style is rebuilt, since the engine re-adds the layer as it
        // first made it.
        const handle = engine.addPath({
          color: o.color,
          segments: [{ points, opacity: o.opacity }],
          markers: [],
        });
        const id = Number.isFinite(engine._idCounter)
          ? "ha-map-path-" + (engine._idCounter - 1) + "-lines"
          : null;
        const apply = () => {
          if (!id) return;
          try {
            if (!inner.getLayer(id)) return;
            if (inner.getPaintProperty(id, "line-width") !== o.width) {
              inner.setPaintProperty(id, "line-width", o.width);
            }
            if (o.dashed && !inner.getPaintProperty(id, "line-dasharray")) {
              inner.setPaintProperty(id, "line-dasharray", [2, 1.5]);
            }
          } catch (err) {
            // The style is still loading, or the layer went with it.
          }
        };
        apply();
        inner.on("styledata", apply);
        return {
          remove: () => {
            try {
              inner.off("styledata", apply);
            } catch (err) {
              // The map went first.
            }
            handle.remove();
          },
        };
      },
      dot: (point, o) => {
        const size = o.radius * 2 + 4;
        const el = element(
          "box-sizing:border-box;width:" + size + "px;height:" + size + "px;border-radius:50%;" +
          "border:2px solid #fff;background:color-mix(in srgb, " + o.color + " " +
          Math.round(o.fill * 100) + "%, transparent);pointer-events:none"
        );
        const handle = engine.addMarker(el, point, { size: [size, size], interactive: false });
        return { remove: () => handle.remove() };
      },
      label: (point, text, color) => {
        const el = element("pointer-events:none");
        el.innerHTML = routeLabelHtml(text, color);
        const handle = engine.addMarker(el, point, { size: [22, 22], interactive: false });
        return { remove: () => handle.remove() };
      },
      marker: (point, html, size) => {
        const el = element("pointer-events:none");
        el.innerHTML = html;
        const handle = engine.addMarker(el, point, { size: [size, size], interactive: false });
        return { remove: () => handle.remove() };
      },
      // ha-map's own fit: it pauses the map's auto-fit for good, so nothing
      // of Home Assistant's undoes it later. Its zoom is a ceiling, and the
      // map's default of 14 is too far out for a short commute. The padding
      // is the room a pin needs: ha-map's markers stand 65px above their
      // point and 24px to each side, its cluster bubbles 60px above and
      // 40px to each side - and a report at the top edge of what is fitted
      // would otherwise lose its pin to the map's edge.
      // A map too small for that room gets less: MapLibre refuses a fit
      // whose padding leaves nothing, and the map would stay where it was.
      fit: (points, o = {}) => {
        const el = inner.getContainer();
        const w = el ? el.clientWidth : 0;
        const h = el ? el.clientHeight : 0;
        const scale = Math.min(1, w ? (w / 2) / 92 : 1, h ? (h / 2) / 96 : 1);
        const room = (px) => Math.round(px * scale);
        haMap.fitBounds(points, {
          zoom: o.maxZoom || 17,
          pad: 0.05,
          padding: { top: room(72), right: room(46), bottom: room(24), left: room(46) },
        });
      },
      // In view with the room the pins need - the fit's padding, less a few
      // pixels so the fit's own result passes. ha-map fits the map to its
      // markers once more when it has loaded, with no room at all, and
      // where the route was known before the map that fit lands after the
      // route's: the route stays inside, its topmost pins do not.
      inView: (points) => {
        const el = inner.getContainer();
        const w = el ? el.clientWidth : 0;
        const h = el ? el.clientHeight : 0;
        if (!w || !h) return true;
        return points.every((pt) => {
          const p = inner.project([pt[1], pt[0]]);
          return p.x >= 38 && p.y >= 64 && p.x <= w - 38 && p.y <= h - 16;
        });
      },
    };
  }

  // ---- The traffic flow: TomTom's flow tiles over the map ------------------
  //
  // TomTom draws the flow as raster tiles - every road coloured by how
  // traffic moves on it - and the integration serves them on under a URL
  // of its own, so the key never reaches a browser (see tiles.py). The card
  // asks the integration once for that URL's template, then hands it to
  // whichever map engine it has as a tile layer: both engines fetch the
  // tiles of the view they show by themselves, and a new stamp on the URL
  // every few minutes makes them fetch the tiles afresh.
  // How long a layer stands before its tiles are fetched again while the
  // card is on screen, and how long a pan or a zoom is given to settle.
  const TRAFFIC_DEBOUNCE_MS = 900;
  // TomTom's colourings of the flow, as the editor offers them.
  const TRAFFIC_STYLES = ["relative0", "relative", "absolute", "relative-delay"];

  let flowTemplatePromise = null;
  let flowTemplateAt = 0;
  // How long one answer serves. The token in it is issued per start of
  // Home Assistant, and a page that lives through a restart - the frontend
  // reconnects by itself - would otherwise keep fetching tiles under a
  // token nobody answers to any more.
  const FLOW_TEMPLATE_MS = 60000;

  // Where the tiles are: asked of the integration once per page, and asked
  // again after a failure - no connection, or an integration without the
  // command - the next time the flow is wanted.
  function flowTemplate(hass) {
    if (!flowTemplatePromise || Date.now() - flowTemplateAt > FLOW_TEMPLATE_MS) {
      flowTemplateAt = Date.now();
      flowTemplatePromise = hass
        .callWS({ type: "tomtom/flow" })
        .then(
          (answer) => (answer && answer.template ? answer : null),
          () => {
            flowTemplatePromise = null;
            return null;
          }
        );
    }
    return flowTemplatePromise;
  }

  // The entry the card shows goes into the URL, so the integration counts
  // the tiles on it; "-" where there is none to name.
  function flowUrl(template, style, stamp, entryId) {
    return template.replace("{entry}", entryId || "-").replace("{style}", style) + "?v=" + stamp;
  }

  let trafficLayerCount = 0;

  // On 2026.10's MapLibre engine: one raster source and one raster layer,
  // put in under the first layer of the base style that writes text, so
  // the flow lies over the roads and under their names - and over the
  // engine's own paths, which a route is drawn with, since a flow under a
  // thick route line would never show. The engine rebuilds its style now
  // and then and loses what was added to it; the layer is put back whenever
  // the style comes up without it.
  function trafficEngineLayer(inner) {
    const id = "tomtom-traffic-" + (++trafficLayerCount);
    let url = "";
    let opacity = 0.7;
    const before = () => {
      try {
        const layers = (inner.getStyle() && inner.getStyle().layers) || [];
        const label = layers.find((layer) => layer.type === "symbol" && layer.layout && layer.layout["text-field"]);
        return label ? label.id : undefined;
      } catch (err) {
        return undefined;
      }
    };
    const add = () => {
      if (!url) return;
      try {
        const source = inner.getSource(id);
        if (source && inner.getLayer(id)) {
          if (typeof source.setTiles === "function") source.setTiles([url]);
          inner.setPaintProperty(id, "raster-opacity", opacity);
          return;
        }
        if (!source) inner.addSource(id, { type: "raster", tiles: [url], tileSize: 256, maxzoom: 22 });
        if (!inner.getLayer(id)) {
          inner.addLayer(
            { id, type: "raster", source: id, paint: { "raster-opacity": opacity, "raster-fade-duration": 0 } },
            before()
          );
        }
      } catch (err) {
        // The style is still loading; styledata brings this back.
      }
    };
    const onStyle = () => {
      if (!url) return;
      try {
        if (!inner.getSource(id) || !inner.getLayer(id)) add();
      } catch (err) {
        // Not yet.
      }
    };
    inner.on("styledata", onStyle);
    return {
      set: (nextUrl, nextOpacity) => {
        url = nextUrl;
        opacity = nextOpacity;
        add();
      },
      remove: () => {
        try {
          inner.off("styledata", onStyle);
        } catch (err) {
          // The map went first.
        }
        try {
          if (inner.getLayer(id)) inner.removeLayer(id);
          if (inner.getSource(id)) inner.removeSource(id);
        } catch (err) {
          // Gone with the map.
        }
      },
    };
  }

  // On Leaflet - through 2026.9, and the fallback without WebGL after - a
  // plain tile layer over the base tiles, under the overlay pane the route
  // and the bands are drawn in.
  function trafficLeafletLayer(L, leaflet) {
    let layer = null;
    return {
      set: (url, opacity) => {
        try {
          if (!layer) {
            layer = L.tileLayer(url, { opacity, maxZoom: 22, maxNativeZoom: 22, zIndex: 5, crossOrigin: false });
            layer.addTo(leaflet);
            return;
          }
          layer.setOpacity(opacity);
          layer.setUrl(url);
        } catch (err) {
          // The map went away underneath.
        }
      },
      remove: () => {
        try {
          if (layer) layer.remove();
        } catch (err) {
          // Gone with the map.
        }
        layer = null;
      },
    };
  }

  // A number on a route, for telling alternatives apart: a small disc in
  // the line's colour.
  function routeLabelHtml(text, color) {
    return (
      '<div style="width:22px;height:22px;border-radius:50%;background:' + color + ";" +
      'color:#fff;font:700 13px/22px sans-serif;text-align:center;' +
      'box-shadow:0 0 0 2px #fff">' + escapeHtml(String(text)) + "</div>"
    );
  }

  // The route as drawn on any map: the line, a hollow dot at its start and a
  // filled one at its destination - which way round it runs, without a
  // legend - and the via points smaller between them: a route that bends
  // away from where it seems to be going is almost always following one.
  function drawRouteWith(h, points, color, vias, weight) {
    const width = Number.isFinite(Number(weight)) && Number(weight) > 0 ? Number(weight) : 4;
    const items = [h.line(points, { color, width, opacity: 0.85 })];
    items.push(h.dot(points[0], { color, fill: 0.35, radius: 5 }));
    items.push(h.dot(points[points.length - 1], { color, fill: 1, radius: 5 }));
    for (const via of Array.isArray(vias) ? vias : []) {
      items.push(h.dot(via, { color, fill: 0.7, radius: 4 }));
    }
    return {
      points,
      remove: () => {
        for (const item of items) {
          try {
            item.remove();
          } catch (err) {
            // Its map is already gone.
          }
        }
      },
    };
  }

  function removeRoute(drawn) {
    if (drawn) drawn.remove();
  }

  // Since 2026.9 the streets under ha-map are a MapLibre GL layer, and it
  // does not follow a jump it was not animated through: after a plain fit it
  // keeps its last frame, stretched over the new view - measured, labels
  // three times their size until something else moved the map. Telling it
  // its size again makes it draw the view it is actually showing.
  function refreshBaseMap(leaflet) {
    try {
      leaflet.eachLayer((layer) => {
        if (typeof layer.getMaplibreMap !== "function") return;
        const gl = layer.getMaplibreMap();
        if (gl && typeof gl.resize === "function") gl.resize();
      });
    } catch (err) {
      // No MapLibre layer on this version - nothing to refresh.
    }
  }

  // Without animation: an animated fit is exactly what leaves the stretched
  // frame behind.
  function fitRoute(leaflet, bounds, maxZoom) {
    try {
      leaflet.invalidateSize(false);
      leaflet.fitBounds(bounds, {
        padding: [30, 30],
        animate: false,
        ...(maxZoom ? { maxZoom } : {}),
      });
    } catch (err) {
      return;
    }
    refreshBaseMap(leaflet);
  }

  // Home Assistant's map fits itself to its markers once it has them, and
  // that lands after a route fitted the moment the map attached. Measured on
  // a 458 x 258 map: the first fit left the route's far end outside it, while
  // the very same fit repeated later showed it end to end - and with the list
  // following the map, reports at that end had dropped out of the list too.
  //
  // When that fit comes is not something to guess at: with the streets drawn
  // by MapLibre the map takes 15-30 s to appear, and a few timed refits a
  // few seconds apart still lost. So the map is asked instead - every time it
  // comes to rest, a route no longer entirely in view is fitted again. The
  // route's own fit comes to rest with the route in view, so it does not set
  // itself off again. The first touch - a drag, a pinch, the wheel, a key -
  // ends it for good: where someone put the view is where it stays.
  // Returns the function that ends the watch early - for whoever moves the
  // map on purpose before the minute is up, so the watch does not pull it
  // back to the route.
  function fitRouteSettled(h, points) {
    h.fit(points);
    const container = h.container();
    const events = ["mousedown", "touchstart", "wheel", "keydown"];
    let done = false;
    // 2026.10's MapLibre fires moveend from a resize, moved or not, and
    // fitting the map is what resizes it - so a fit from here fires the very
    // event that called here, synchronously. Guarded twice: nothing while a
    // fit is under way, and nothing for a view that did not change.
    let busy = false;
    let lastView = "";
    const viewOf = () => {
      try {
        const c = h.centre();
        return c ? `${c.lat.toFixed(5)},${c.lon.toFixed(5)},${h.zoom()}` : "";
      } catch (err) {
        return "";
      }
    };
    const cleanup = () => {
      if (done) return;
      done = true;
      try {
        h.off("moveend", onRest);
      } catch (err) {
        // The map went first.
      }
      if (container) {
        events.forEach((name) => container.removeEventListener(name, cleanup));
      }
    };
    const onRest = () => {
      if (busy || done) return;
      const view = viewOf();
      if (view === lastView) return;
      lastView = view;
      busy = true;
      try {
        if (!h.inView(points)) h.fit(points);
      } catch (err) {
        cleanup();
      } finally {
        busy = false;
      }
    };
    lastView = viewOf();
    h.on("moveend", onRest);
    if (container) {
      events.forEach((name) => container.addEventListener(name, cleanup, { passive: true }));
    }
    // Long enough for the slowest first load measured, and not forever: a
    // map left alone for a minute has settled.
    window.setTimeout(cleanup, 60000);
    return cleanup;
  }

  // ---------------------------------------------------------- setup dialog
  //
  // The integration hands a route step's points to the frontend in the
  // step's description_placeholders, under "tomtom_route" - a key no text
  // refers to. Every Home Assistant page loads this file, so the dialog is
  // watched from here and a native map with the route is put under the
  // step's description.
  //
  // None of what this reaches into is a documented interface:
  // dialog-data-entry-flow in home-assistant's shadow root, the
  // step-flow-form inside it and that element's "step" property. Each step
  // is a new step-flow-form. Everything is guarded, so a dialog laid out
  // differently one day shows its form without the map rather than failing.
  function ensureHaMap() {
    if (customElements.get("ha-map")) return Promise.resolve();
    // ha-map is loaded on demand. A location selector pulls it in, and the
    // dialog has one defined already.
    let probe;
    try {
      const ha = document.querySelector("home-assistant");
      probe = document.createElement("ha-selector");
      probe.hass = ha && ha.hass;
      probe.selector = { location: {} };
      probe.value = { latitude: 0, longitude: 0 };
      probe.style.cssText = "position:fixed;left:-9999px;top:0;width:10px;height:10px";
      document.body.appendChild(probe);
    } catch (err) {
      probe = undefined;
    }
    return Promise.race([
      customElements.whenDefined("ha-map"),
      new Promise((resolve) => window.setTimeout(resolve, 8000)),
    ]).then(() => {
      if (probe) probe.remove();
    });
  }


  // Where several routes are on offer, the fastest is drawn as the route
  // and the others beside it in their own colours, each numbered the way
  // the menu numbers them - so "Route 2" can be found on the map.
  const ALTERNATIVE_COLORS = ["#ff9800", "#9c27b0"];

  function drawFlowRoute(map, points, vias, attempt, alternatives) {
    const h = mapHandles(map);
    if (!h) {
      if (attempt < 40) {
        window.setTimeout(() => drawFlowRoute(map, points, vias, attempt + 1, alternatives), 250);
      }
      return;
    }
    const color = routeColor(map);
    const all = [...points];
    (alternatives || []).forEach((route, i) => {
      const tint = ALTERNATIVE_COLORS[i % ALTERNATIVE_COLORS.length];
      h.line(route, { color: tint, width: 4, opacity: 0.8, dashed: true });
      h.label(route[Math.floor(route.length / 2)], String(i + 2), tint);
      all.push(...route);
    });
    drawRouteWith(h, points, color, vias);
    if (alternatives && alternatives.length) {
      h.label(points[Math.floor(points.length / 2)], "1", color);
    }
    h.fit(all);
    // The dialog grows into its size while it opens; fit once more after.
    window.setTimeout(() => h.fit(all), 500);
  }

  async function addFlowMap(form, points, vias, attempt, alternatives) {
    const root = form.shadowRoot;
    const description = root && root.querySelector("ha-markdown");
    if (!description || !description.parentNode) {
      if (attempt < 20) {
        window.setTimeout(() => addFlowMap(form, points, vias, attempt + 1, alternatives), 150);
      }
      return;
    }
    await ensureHaMap();
    if (!customElements.get("ha-map") || !form.isConnected) return;
    const ha = document.querySelector("home-assistant");
    const map = document.createElement("ha-map");
    map.hass = ha && ha.hass;
    map.style.cssText =
      "display:block;height:240px;margin:12px 0 4px;border-radius:8px;overflow:hidden";
    description.parentNode.insertBefore(map, description.nextSibling);
    drawFlowRoute(map, points, vias, 0, alternatives);
  }

  function decorateFlow(dialog) {
    // A form, or the menu that picks between routes - both carry a
    // description, which is where the map goes.
    const form =
      dialog.shadowRoot && dialog.shadowRoot.querySelector("step-flow-form, step-flow-menu");
    if (!form || form.__tomtomRoute) return;
    const placeholders = form.step && form.step.description_placeholders;
    const raw = placeholders && placeholders.tomtom_route;
    if (!raw) return;
    let points;
    try {
      points = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!Array.isArray(points) || points.length < 2) return;
    let vias = [];
    try {
      vias = JSON.parse(placeholders.tomtom_vias || "[]");
    } catch (err) {
      vias = [];
    }
    let alternatives = [];
    try {
      alternatives = JSON.parse(placeholders.tomtom_alternatives || "[]");
    } catch (err) {
      alternatives = [];
    }
    if (!Array.isArray(alternatives)) alternatives = [];
    form.__tomtomRoute = true;
    addFlowMap(form, points, vias, 0, alternatives);
  }

  function watchFlowDialogs() {
    if (window.__tomtomFlowMapWatch) return;
    const ha = document.querySelector("home-assistant");
    if (!ha || !ha.shadowRoot) {
      window.setTimeout(watchFlowDialogs, 1000);
      return;
    }
    window.__tomtomFlowMapWatch = true;
    const watched = new WeakSet();
    const scan = () => {
      for (const dialog of ha.shadowRoot.querySelectorAll("dialog-data-entry-flow")) {
        if (watched.has(dialog) || !dialog.shadowRoot) continue;
        watched.add(dialog);
        new MutationObserver(() => decorateFlow(dialog)).observe(dialog.shadowRoot, {
          childList: true,
          subtree: true,
        });
        decorateFlow(dialog);
      }
    };
    new MutationObserver(scan).observe(ha.shadowRoot, { childList: true, subtree: true });
    scan();
  }

  // The device's model field is what the integration puts the search mode
  // in: "Waypoints" for a waypoint route, "Route" for one TomTom works out.
  function isRouteArea(area) {
    return !!area && (area.model === "Waypoints" || area.model === "Route");
  }

  function tomtomAreas(hass, wanted) {
    const out = [];
    for (const device of Object.values(hass.devices || {})) {
      const mine = (device.identifiers || []).some((pair) => pair[0] === DOMAIN);
      if (!mine) continue;
      // The settings entry's device carries the installation's counters
      // and no reports: not an area to show. Known by its identifier.
      if ((device.identifiers || []).some((pair) => pair[0] === DOMAIN && pair[1] === "general")) continue;
      if (wanted && wanted.length && !wanted.includes(device.id)) continue;
      out.push({
        id: device.id,
        name: device.name_by_user || device.name || device.id,
        model: device.model || "",
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
  }

  function referencePoint(hass, entityId) {
    if (!entityId) return null;
    const state = hass.states[entityId];
    if (!state) return null;
    const lat = Number.parseFloat(state.attributes.latitude);
    const lon = Number.parseFloat(state.attributes.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }

  // The reports of one area, already filtered and sorted. Matching runs over
  // the device id rather than the `area` attribute: the two agree today, but
  // only the id is guaranteed to keep agreeing after a rename.
  //
  // With a reference point set, the distance is recomputed here rather than
  // taken from the entity: the integration measures to the area's own centre,
  // which answers "how far into the area is it", not "how far is it from me".
  function reportsFor(hass, deviceId, reference, sort) {
    const imperial = hass.config && hass.config.unit_system && hass.config.unit_system.length === "mi";
    const rows = [];
    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!entityId.startsWith("geo_location.")) continue;
      const source = state.attributes.source || "";
      if (!source.startsWith(SOURCE_PREFIX)) continue;
      const entry = hass.entities[entityId];
      if (!entry || entry.device_id !== deviceId) continue;
      const lat = Number.parseFloat(state.attributes.latitude);
      const lon = Number.parseFloat(state.attributes.longitude);
      let distance = Number.parseFloat(state.state);
      let unit = state.attributes.unit_of_measurement || (imperial ? "mi" : "km");
      if (reference && Number.isFinite(lat) && Number.isFinite(lon)) {
        const km = distanceKm(reference.lat, reference.lon, lat, lon);
        distance = Math.round((imperial ? km * 0.621371 : km) * 10) / 10;
        unit = imperial ? "mi" : "km";
      }
      rows.push({ entityId, state, source, distance, unit, lat, lon });
    }
    return sortReports(rows, sort);
  }

  // A planned route's reports, as the planner's preview hands them over:
  // rows shaped like an entry's - the attributes under a state, the
  // distance along the route - so the list, the badges, the bands and the
  // map treat them as any report. Their ids are the planner's own; there
  // is no entity behind them.
  function planRows(reports, sort) {
    const rows = [];
    for (const r of reports || []) {
      const lat = Number(r.latitude);
      const lon = Number(r.longitude);
      const distance = Number(r.distance);
      rows.push({
        entityId: `plan:${r.id}`,
        plan: true,
        state: {
          state: Number.isFinite(distance) ? String(distance) : "",
          attributes: { ...(r.attributes || {}), latitude: lat, longitude: lon, icon: r.icon, friendly_name: r.name },
          last_updated: "",
        },
        source: "plan",
        distance: Number.isFinite(distance) ? Math.round(distance * 10) / 10 : NaN,
        unit: r.unit || "km",
        lat,
        lon,
      });
    }
    return sortReports(rows, sort);
  }

  function sortReports(rows, sort) {
    // Distance is the order the card is built around and the tie-breaker for
    // the other two: two reports of the same minute are still nearer and
    // farther, and leaving that to chance would shuffle the list on every
    // poll.
    const byDistance = (a, b) => {
      const x = Number.isFinite(a.distance) ? a.distance : Infinity;
      const y = Number.isFinite(b.distance) ? b.distance : Infinity;
      return x - y;
    };
    if (sort !== "newest" && sort !== "oldest") return rows.sort(byDistance);
    // Age rather than a timestamp: TomTom dates a report as a time of
    // day or as a date, never as one comparable thing - minutesSince is what
    // makes the two the same kind of number. One reading of the clock for
    // the whole sort, so no two comparisons disagree.
    const now = new Date();
    const ages = new Map(
      rows.map((row) => [row, minutesSince(row.state.attributes.created, now)])
    );
    return rows.sort((a, b) => {
      const x = ages.get(a);
      const y = ages.get(b);
      // A report TomTom dated in neither of its two ways goes last
      // whichever end is asked for: it says nothing about when, and putting
      // it at the front of "newest" would be an answer it never gave.
      if (x === null || y === null) {
        if (x !== y) return x === null ? 1 : -1;
        return byDistance(a, b);
      }
      if (x !== y) return sort === "newest" ? x - y : y - x;
      return byDistance(a, b);
    });
  }

  // The entry's own count sensor, which carries the entry's settings and
  // a live route's figures: the one with the search mode on it.
  function totalSensor(hass, deviceId) {
    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!entityId.startsWith("sensor.")) continue;
      if (state.attributes.search_mode === undefined) continue;
      const entry = hass.entities[entityId];
      if (entry && entry.device_id === deviceId) return state;
    }
    return null;
  }

  // The window that decides what is still new, in minutes. It belongs to
  // the entry rather than to the card - set on the integration, next to
  // the count it governs - so that three cards of one entry cannot
  // disagree about which reports are new, and so that a dashboard's
  // visibility condition and an automation reading the same sensor agree
  // with all three. A sensor carrying no window is one from before it
  // existed; only then does the card answer for itself.
  function newWindow(hass, deviceId) {
    const attrs = (totalSensor(hass, deviceId) || {}).attributes || {};
    if (attrs.new_minutes === undefined) return FALLBACK_WINDOW;
    const minutes = Number(attrs.new_minutes);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  }

  // The same, in the refresh buttons' own words: how long ago, nothing else -
  // the button says what it does.
  function agoText(str, iso) {
    if (!iso) return str.agoNever;
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return str.agoNever;
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return str.agoNow;
    if (mins < 60) return str.agoMin(mins);
    return str.agoHours(Math.floor(mins / 60));
  }

  function updatedText(str, iso) {
    if (!iso) return str.updatedNever;
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return str.updatedNever;
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return str.updatedNow;
    if (mins < 60) return str.updatedMin(mins);
    return str.updatedHours(Math.floor(mins / 60));
  }

  // TomTom's own stamps are either a date or a time of day, never both -
  // see the integration's README. The wording follows which one arrived.
  // TomTom dates an entry the way it displays it: a bare "HH:MM" while it
  // is from today, "dd.mm.yyyy" once it is not. Nothing finer is available, so
  // the freshness check reads that same string.
  //
  // Returns the age in minutes, or null when the string says nothing useful.
  // A date always answers "older than today", which is what it means - the
  // only thing lost is the few minutes after midnight, when a report from
  // 23:5x has already been re-dated.
  // "2026-10-10 09:25:30", as the integration stamps a report. The
  // integration folds it into the short form below before the card sees
  // it; this is for a card running against an older integration.
  const FULL_STAMP = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/;

  function minutesSince(created, now) {
    if (typeof created !== "string") return null;
    const full = created.match(FULL_STAMP);
    if (full) {
      const then = new Date(
        Number(full[1]), Number(full[2]) - 1, Number(full[3]), Number(full[4]), Number(full[5])
      );
      return Math.max(0, Math.round((now - then) / 60000));
    }
    const time = created.match(/^(\d{1,2}):(\d{2})$/);
    if (time) {
      const then = new Date(now);
      then.setHours(Number(time[1]), Number(time[2]), 0, 0);
      // A time still ahead of the clock belongs to yesterday - the card can be
      // a minute behind the server that stamped it.
      if (then > now) then.setDate(then.getDate() - 1);
      return Math.max(0, Math.round((now - then) / 60000));
    }
    const date = created.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (date) {
      const then = new Date(Number(date[3]), Number(date[2]) - 1, Number(date[1]));
      return Math.max(0, Math.round((now - then) / 60000));
    }
    return null;
  }

  function isNewReport(row, minutes, now) {
    if (!(minutes > 0)) return false;
    const age = minutesSince(row.state.attributes.created, now);
    return age !== null && age < minutes;
  }

  // Numbers, times and dates the way the reader's profile says - Home
  // Assistant's own number, time and date format settings - read off the
  // hass every card and editor was last handed. Where the profile says
  // "language", the reader's language decides; "system", the browser.
  let LOCALE_HASS = null;

  function localeLang() {
    const locale = LOCALE_HASS && LOCALE_HASS.locale;
    return (locale && locale.language) || (LOCALE_HASS && LOCALE_HASS.language) || "en";
  }

  function fmtNumber(value, maxDigits) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    const locale = (LOCALE_HASS && LOCALE_HASS.locale) || {};
    let lang = localeLang();
    if (locale.number_format === "comma_decimal") lang = "en-US";
    else if (locale.number_format === "decimal_comma") lang = "de";
    else if (locale.number_format === "space_comma") lang = "fr";
    else if (locale.number_format === "system") lang = navigator.language || lang;
    else if (locale.number_format === "none") return String(Math.round(n * 10 ** maxDigits) / 10 ** maxDigits);
    try {
      return new Intl.NumberFormat(lang, { maximumFractionDigits: maxDigits }).format(n);
    } catch (err) {
      return String(n);
    }
  }

  function fmtTime(date) {
    const locale = (LOCALE_HASS && LOCALE_HASS.locale) || {};
    let lang = localeLang();
    const options = { hour: "2-digit", minute: "2-digit" };
    if (locale.time_format === "am_pm") options.hour12 = true;
    else if (locale.time_format === "24_hour") options.hour12 = false;
    else if (locale.time_format === "system") lang = navigator.language || lang;
    try {
      return new Intl.DateTimeFormat(lang, options).format(date);
    } catch (err) {
      return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    }
  }

  function fmtDate(date) {
    const locale = (LOCALE_HASS && LOCALE_HASS.locale) || {};
    let lang = localeLang();
    // The same locales Home Assistant itself writes its numeric dates with.
    if (locale.date_format === "DMY") lang = "en-GB";
    else if (locale.date_format === "MDY") lang = "en-US";
    else if (locale.date_format === "YMD") lang = "en-CA";
    else if (locale.date_format === "system") lang = navigator.language || lang;
    try {
      return new Intl.DateTimeFormat(lang, { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
    } catch (err) {
      return date.toLocaleDateString();
    }
  }

  // A report's moment: the ISO stamp with its offset where the integration
  // sends one, else the local "YYYY-MM-DD HH:MM:SS" the chips were first
  // written from.
  function stampDate(attrs, key) {
    const iso = attrs && attrs[`${key}_at`];
    if (typeof iso === "string" && iso) {
      const date = new Date(iso);
      if (!Number.isNaN(date.getTime())) return date;
    }
    const full = attrs && typeof attrs[key] === "string" && attrs[key].match(FULL_STAMP);
    if (!full) return null;
    return new Date(
      Number(full[1]), Number(full[2]) - 1, Number(full[3]), Number(full[4]), Number(full[5]), Number(full[6] || 0)
    );
  }

  function isToday(date) {
    const now = new Date();
    return (
      date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
    );
  }

  // When a report was reported, as a chip: the time for today, the date for
  // any other day.
  function reportedText(str, attrs) {
    const date = stampDate(attrs, "created");
    if (!date) return "";
    return isToday(date) ? str.reportedAt(fmtTime(date)) : str.reportedOn(fmtDate(date));
  }

  // When the community last confirmed a mobile camera or check, as a chip
  // written the way the reported one is - blitzer.de's reports only.
  function confirmedChip(str, attrs) {
    const iso = attrs && attrs.confirmed_at;
    if (typeof iso !== "string" || !iso) return [];
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return [];
    return [isToday(date) ? str.confirmedAt(fmtTime(date)) : str.confirmedOn(fmtDate(date))];
  }

  // The confirmation count as blitzer.de's own map draws it: three stars,
  // filled as far as the count reaches - capped at three the way its map
  // caps them. Only a report that carries a count: a fixed installation
  // is not confirmed by anyone, and TomTom's reports are not rated.
  const STAR_PATHS = {
    full: "M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z",
    empty:
      "M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.96L22,9.24Z",
  };
  function starsHtml(attrs) {
    const count = attrs && attrs.confirmations;
    if (count === null || count === undefined || count === "") return "";
    const filled = Math.min(Number.parseInt(count, 10) || 0, 3);
    const star = (which) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_PATHS[which]}"/></svg>`;
    return `<span class="stars" title="${filled}/3">${star("full").repeat(filled)}${star("empty").repeat(3 - filled)}</span>`;
  }

  // Until when TomTom says a report lasts, as a chip - a jam's expected
  // end, a roadwork's last day. Written the way the reported chip is.
  function untilChip(str, attrs) {
    const iso = attrs && attrs.ends_at;
    if (typeof iso !== "string" || !iso) return [];
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return [];
    return [str.closureUntil(isToday(date) ? fmtTime(date) : fmtDate(date))];
  }

  // The stretch of road a report runs along comes as a Google-encoded
  // polyline (five decimals), the way the integration sends it.
  function decodePolyline(encoded) {
    const points = [];
    let index = 0;
    let lat = 0;
    let lng = 0;
    while (index < encoded.length) {
      for (const which of [0, 1]) {
        let shift = 0;
        let result = 0;
        let byte;
        do {
          byte = encoded.charCodeAt(index++) - 63;
          result |= (byte & 0x1f) << shift;
          shift += 5;
        } while (byte >= 0x20);
        const delta = result & 1 ? ~(result >> 1) : result >> 1;
        if (which === 0) lat += delta;
        else lng += delta;
      }
      points.push([lat / 1e5, lng / 1e5]);
    }
    return points;
  }

  // The bands' colours, by the kind of report: a closed road in dark red,
  // roadworks and a closed lane in orange, a jam in red, everything else in
  // amber - and the closed road striped white down the middle, the way a
  // map marks a road one cannot take.
  const LINE_COLORS = {
    road_closed: "#b71c1c",
    lane_closed: "#ef6c00",
    road_works: "#ef6c00",
    jam: "#d32f2f",
  };
  const OTHER_LINE_COLOR = "#f9a825";
  // blitzer.de's kinds - the cameras and checks - all in one red, on the
  // map and in the list alike: a check is a check, whatever it measures.
  const CAMERA_COLOR = "#e53935";
  const CAMERA_KINDS = new Set(["camera_fixed", "camera_mobile", "camera_trailer", "camera_redlight", "camera_section", "check_distance", "check_police"]);
  const kindColor = (type) => (CAMERA_KINDS.has(type) ? CAMERA_COLOR : LINE_COLORS[type] || OTHER_LINE_COLOR);

  // Changing any of this is what a re-render actually depends on. Every other
  // state update in the system leaves the card's DOM - and whatever the
  // person is mid-interaction with - alone.
  function signature(hass, deviceId, reference) {
    if (!deviceId) return "none";
    const parts = [];
    for (const [entityId, state] of Object.entries(hass.states)) {
      if (!entityId.startsWith("geo_location.") && !entityId.startsWith("sensor.")) continue;
      const entry = hass.entities[entityId];
      if (!entry || entry.device_id !== deviceId) continue;
      parts.push(`${entityId}:${state.state}:${state.last_updated}`);
    }
    // A moving reference point changes every distance on the card.
    if (reference && hass.states[reference]) {
      const ref = hass.states[reference];
      parts.push(`ref:${ref.attributes.latitude},${ref.attributes.longitude}`);
    }
    return parts.sort().join("|");
  }

  // One element's Layout -> General settings as an inline style. Only what has
  // actually been set is written, so an untouched card keeps the theme's own
  // look rather than a frozen copy of today's defaults. `prefix` is the
  // element's own config prefix - "title", "no_reports".
  // How many minutes one report costs. The integration works this out the
  // way TomTom's own map does - ceil(delay / 60) - and only reports it
  // on the types that describe a queue, so anything without it simply
  // costs nothing (see _tailback_figures in geo_location.py).
  function delayMinutes(row) {
    const raw = row && row.state && row.state.attributes ? row.state.attributes.delay_minutes : null;
    const minutes = Number.parseInt(raw, 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  }

  function elementStyle(config, prefix) {
    const parts = [];
    const color = config[`${prefix}_color`];
    const size = config[`${prefix}_font_size`];
    const spacing = config[`${prefix}_letter_spacing`];
    if (color) parts.push(`color: ${color}`);
    if (size) parts.push(`font-size: ${size}`);
    if (config[`${prefix}_bold`]) parts.push("font-weight: 700");
    if (config[`${prefix}_italic`]) parts.push("font-style: italic");
    if (config[`${prefix}_uppercase`]) parts.push("text-transform: uppercase");
    if (config[`${prefix}_underline`]) parts.push("text-decoration: underline");
    if (spacing) parts.push(`letter-spacing: ${spacing}`);
    // Only the elements that declare a background carry these keys; for the
    // others both reads are undefined and nothing is written.
    if (config[`${prefix}_background`] === false) {
      parts.push("background: none");
    } else if (config[`${prefix}_background_color`]) {
      parts.push(`background: ${config[`${prefix}_background_color`]}`);
    }
    return parts.join("; ");
  }

  // What to overrule inside one map marker, or "" while both parts are kept.
  //
  // Home Assistant draws every marker as a coloured ring on a filled disc with
  // the entity picture in the middle (ha-entity-marker's own ".marker"). The
  // ring keeps its width when only its colour goes, so switching it off moves
  // nothing on the map - the symbols stay exactly where they were.
  // The symbol on a marker, and the initials under it hidden: font size 0
  // takes the text away without touching the disc's own size.
  // A marker of its own - not one in a bubble, which the card marks with
  // tomtom-point - sits on its point: the map draws a 48px box with a tail
  // under it and anchors the element at the tail's tip, 65px down, so the
  // box is moved down by the difference and the tail hidden. The symbol
  // then stands where the report is, instead of a dark tip under it.
  const MARKER_ICON_CSS =
    ".marker { font-size: 0 !important; display: flex !important; align-items: center !important; justify-content: center !important; }" +
    ".marker .tomtom-marker-icon { --mdc-icon-size: 24px; width: 24px; height: 24px; display: block; }" +
    ":host([tomtom-point]) .marker { transform: translateY(41px); }" +
    ":host([tomtom-point]) .tail { visibility: hidden; }";

  // The bare symbol on the map: neither Home Assistant's coloured ring
  // around a marker nor the disc it sits on.
  function markerCss() {
    return ".marker { border-color: transparent !important; background: none !important; }";
  }

  // The map's cluster discs - the ones it gathers nearby reports into, with
  // the count on them - as --tomtom-cluster-* custom properties, the way
  // every other element of this card is dressed. Home Assistant draws each
  // as a filled disc with a wider ring of the same colour at a fifth of its
  // opacity, and the count on it in its text colour; every fallback here is
  // Home Assistant's own declaration, so nothing changes until a property
  // is set. The ring follows the disc, so a recoloured disc still looks like
  // Home Assistant's. The rule lands inside the map's own shadow root, which
  // the card's stylesheet cannot reach - but the properties do: a custom
  // property set on the map card, by the editor or by a theme, is inherited
  // straight through.
  const CLUSTER_CSS = [
    ".marker-cluster div {",
    "  background-color: var(--tomtom-cluster-background, var(--primary-color)) !important;",
    "  border-color: color-mix(in srgb, var(--tomtom-cluster-background, var(--primary-color)) 20%, transparent) !important;",
    "  color: var(--tomtom-cluster-color, var(--text-primary-color)) !important;",
    "  font-size: var(--tomtom-cluster-font-size, var(--ha-font-size-m)) !important;",
    "  font-weight: var(--tomtom-cluster-font-weight, normal) !important;",
    "  font-style: var(--tomtom-cluster-font-style, normal) !important;",
    "  text-transform: var(--tomtom-cluster-text-transform, none) !important;",
    "  text-decoration: var(--tomtom-cluster-text-decoration, none) !important;",
    "  letter-spacing: var(--tomtom-cluster-letter-spacing, normal) !important;",
    // Centred whatever its size. Home Assistant gives the count a line height
    // of twice its font size and lets the disc centre that line, which holds
    // at the size it ships with and sinks the count as it grows - at 24px it
    // sat 8px low. Centring the count itself instead, at a line height of its
    // own size, puts it in the middle at every size, and at the map's own
    // size within a third of a pixel of where it was.
    "  display: flex !important;",
    "  align-items: center !important;",
    "  justify-content: center !important;",
    "}",
    ".marker-cluster span { line-height: 1 !important; }",
    // From 2026.10 a cluster is a bubble - the first few symbols in a
    // rounded box on a tail, and a "+N" for the rest - rather than a disc
    // with the count. The same properties dress it: the colour lands on the
    // box and its tail, where the disc's used to land, and the count's
    // colour and font on the "+N". Every fallback is again the map's own.
    ".cluster-bubble, .cluster-bubble-tail {",
    "  background: var(--tomtom-cluster-background, var(--card-background-color, #fff)) !important;",
    "}",
    // The bubble on its point too. The map sizes the element as the box
    // plus the 7px of tail under it and anchors it 9px under that, at the
    // tail's tip: 16px below the box. So the box is moved down by half its
    // own height and those 16px, and the tail hidden - the group's symbols
    // then stand on the place the group is at, like a single symbol does.
    ".cluster-marker:not(.tomtom-disc) .cluster-bubble { transform: translateY(calc(50% + 16px)); }",
    ".cluster-marker:not(.tomtom-disc) .cluster-bubble-tail { visibility: hidden; }",
    ".cluster-bubble .more {",
    "  color: var(--tomtom-cluster-color, var(--primary-text-color, #212121)) !important;",
    "  font-size: var(--tomtom-cluster-font-size, var(--ha-font-size-s)) !important;",
    "  font-weight: var(--tomtom-cluster-font-weight, var(--ha-font-weight-medium)) !important;",
    "  font-style: var(--tomtom-cluster-font-style, normal) !important;",
    "  text-decoration: var(--tomtom-cluster-text-decoration, none) !important;",
    "}",
    // The disc drawn over a bubble when "Shape of a group" says so - see
    // _styleClusters. Centred on the bubble's anchor: the box's bottom
    // middle plus the 9px the map lifts a floating marker by, which is the
    // cluster's own position. Sized and ringed like the disc the map drew
    // through 2026.9, and dressed by the same properties as that one.
    ".cluster-marker.tomtom-disc { position: relative; filter: none !important; }",
    ".cluster-marker.tomtom-disc .cluster-bubble,",
    ".cluster-marker.tomtom-disc .cluster-bubble-tail { display: none !important; }",
    ".cluster-marker.tomtom-disc::after {",
    "  content: attr(data-tomtom-count);",
    "  position: absolute;",
    "  left: 50%;",
    "  top: 100%;",
    "  transform: translate(-50%, calc(-50% + 9px));",
    "  box-sizing: border-box;",
    "  width: 36px;",
    "  height: 36px;",
    "  border-radius: 50%;",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  background: var(--tomtom-cluster-background, var(--primary-color));",
    "  box-shadow: 0 0 0 5px color-mix(in srgb, var(--tomtom-cluster-background, var(--primary-color)) 20%, transparent);",
    "  color: var(--tomtom-cluster-color, var(--text-primary-color));",
    "  font-size: var(--tomtom-cluster-font-size, var(--ha-font-size-m));",
    "  font-weight: var(--tomtom-cluster-font-weight, normal);",
    "  font-style: var(--tomtom-cluster-font-style, normal);",
    "  text-decoration: var(--tomtom-cluster-text-decoration, none);",
    "  line-height: 1;",
    "  cursor: pointer;",
    "}",
  ].join("\n");

  // Whether this Home Assistant's map card knows the "cluster" option -
  // 2026.10 is where it arrived. A version that cannot be read (an odd build,
  // a missing field) counts as new enough: better a switch that may do
  // nothing than one greyed out for no reason anyone can check.
  function mapClusterSwitchable(hass) {
    return haAtLeast(hass, 2026, 10);
  }

  // Whether this Home Assistant is the given release or later. A version
  // that cannot be read counts as new.
  function haAtLeast(hass, year, month) {
    const m = /^(\d+)\.(\d+)/.exec(String((hass && hass.config && hass.config.version) || ""));
    if (!m) return true;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return y > year || (y === year && mo >= month);
  }

  // What the editor's cluster settings put into those properties. Only the
  // ones set: an unset one is removed again, so a theme's value shows
  // through the moment the card's own is cleared.
  function clusterVars(config) {
    return {
      "--tomtom-cluster-background": config.cluster_color || "",
      "--tomtom-cluster-color": config.cluster_text_color || "",
      "--tomtom-cluster-font-size": config.cluster_font_size || "",
      "--tomtom-cluster-font-weight": config.cluster_bold ? "700" : "",
      "--tomtom-cluster-font-style": config.cluster_italic ? "italic" : "",
      "--tomtom-cluster-text-decoration": config.cluster_underline ? "underline" : "",
    };
  }

  // The subtitle line's icon has a colour and a size of its own, so it can be
  // played down against the words or picked out from them. Empty leaves both
  // to the stylesheet, where the icon takes the line's colour and exactly the
  // height of one of its capitals.
  // How much of an MDI icon's 24-unit box its drawing actually fills, and how
  // much empty space is left under it. Read off the shape itself in viewBox
  // units, so the answer is the same whatever size the icon is drawn at, and
  // cached per icon name - it never changes for a given icon.
  //
  // Worth measuring because it differs a lot: mdi:map-marker-radius fills 88%
  // of its box, mdi:information-outline 83%, mdi:check only 56%, and the
  // padding above and below is often uneven. Sizing the box alone would
  // therefore leave every icon a different height on screen next to the same
  // text, which is exactly the mismatch this is here to remove.
  const ICON_INK = new Map();

  function iconInk(el) {
    // The attribute, not the property: the head is rebuilt with innerHTML, so
    // on the first look the custom element has not been upgraded yet and
    // el.icon is still undefined. Keying the cache off that missed it every
    // redraw and fell through to the slow retry below - which is what made
    // the icon lag a size behind while somebody was typing one in.
    const name = el.getAttribute("icon") || el.icon;
    if (ICON_INK.has(name)) return ICON_INK.get(name);
    try {
      const inner = el.shadowRoot && el.shadowRoot.querySelector("ha-svg-icon");
      const svg = inner && inner.shadowRoot && inner.shadowRoot.querySelector("svg");
      if (!svg) return null;
      const view = Number((svg.getAttribute("viewBox") || "0 0 24 24").split(/\s+/)[3]) || 24;
      const box = svg.getBBox();
      if (!(box.height > 0)) return null;
      const ink = { fill: box.height / view, below: (view - (box.y + box.height)) / view };
      ICON_INK.set(name, ink);
      return ink;
    } catch (err) {
      // A shape we cannot measure keeps the stylesheet's plain cap-high box.
      return null;
    }
  }

  // Colour and size of one element's leading icon, by that element's prefix.
  //
  // The size is a font size, not a box size. The stylesheet sizes the icon at
  // one cap height of its own font, so setting this to what the line is set
  // to gives an icon exactly as tall as the line's capitals - which is what
  // "14px and 14px" is asking for. Writing the box directly instead would
  // make a 14px icon 4px taller than a 14px capital.
  function leadIconStyle(config, prefix) {
    const parts = [];
    const color = config[`${prefix}_icon_color`];
    const size = config[`${prefix}_icon_size`];
    if (color) parts.push(`color: ${color}`);
    if (size) parts.push(`font-size: ${size}`);
    return parts.join("; ");
  }

  // The minimal line's own symbol. Not the leading icon above: that one is
  // sized to a capital of the text it opens, which is what a line of prose
  // wants. Here the symbol stands beside a number twice the size of the word
  // under it, in a row that is centred rather than sitting on a baseline -
  // so it keeps the stylesheet's own box unless a size is asked for.
  function miniIconHtml(config, prefix) {
    const name = config[`${prefix}_icon`];
    if (!name) return "";
    const parts = [];
    const colour = config[`${prefix}_icon_color`];
    const size = config[`${prefix}_icon_size`];
    if (colour) parts.push(`color: ${colour}`);
    if (size) parts.push(`--mdc-icon-size: ${size}`, `width: ${size}`, `height: ${size}`);
    return `<ha-icon icon="${escapeHtml(name)}" style="${escapeHtml(parts.join("; "))}"></ha-icon>`;
  }

  // The markup for that icon, or "" when the element has none.
  function leadIconHtml(config, prefix) {
    const name = config[`${prefix}_icon`];
    if (!name) return "";
    return `<ha-icon class="fit-icon" icon="${escapeHtml(name)}" style="${escapeHtml(
      leadIconStyle(config, prefix)
    )}"></ha-icon>`;
  }

  // One of Home Assistant's own tap actions, carried out. Written here
  // rather than taken from a helper library because the card bundles
  // nothing: this is the whole of what the action selector can produce.
  //
  // Returns false for "there is no action here", which is what leaves the
  // card free to do its own thing instead - opening the pop-up.
  function runAction(node, hass, action, fallbackEntity) {
    if (!action || !action.action || action.action === "default") return false;
    switch (action.action) {
      case "none":
        return true;
      case "more-info":
      case "toggle": {
        // Neither says which entity when it is the card as a whole being
        // tapped, so the area's own total is what they fall back to.
        const entityId = action.entity || fallbackEntity;
        if (!entityId) return true;
        if (action.action === "toggle") {
          hass.callService("homeassistant", "toggle", { entity_id: entityId });
          return true;
        }
        node.dispatchEvent(
          new CustomEvent("hass-more-info", {
            detail: { entityId },
            bubbles: true,
            composed: true,
          })
        );
        return true;
      }
      case "navigate": {
        if (!action.navigation_path) return true;
        // The same two steps Home Assistant's own navigate() takes: change
        // the address, then tell the frontend it changed. Without the second
        // the address bar moves and the page does not.
        window.history.pushState(null, "", action.navigation_path);
        window.dispatchEvent(
          new CustomEvent("location-changed", { detail: { replace: false } })
        );
        return true;
      }
      case "url": {
        if (action.url_path) window.open(action.url_path, "_blank", "noopener");
        return true;
      }
      case "perform-action":
      case "call-service": {
        // Named "service" before the 2024 rename and "perform_action" after;
        // the selector writes whichever this frontend uses.
        const name = action.perform_action || action.service;
        if (!name || !name.includes(".")) return true;
        const [domain, service] = name.split(".", 2);
        hass.callService(
          domain,
          service,
          action.data || action.service_data || {},
          action.target
        );
        return true;
      }
      default:
        return false;
    }
  }

  // ------------------------------------------------------------------ card
  class TomTomCard extends HTMLElement {
    setConfig(config) {
      this._config = defaultConfig(config);
      this._onlyNew = this._config.only_new === true;
      this._onlyDelay = false;
      this._highlight = null;
      this._centred = false;
      this._newRows = new Set();
      this._delayRows = new Set();
      this._area = undefined;
      this._signature = undefined;
      this._mapKey = undefined;
      this._mapFitted = false;
      // Folded until someone asks otherwise. Reset here rather than on every
      // draw, so a list opened by hand stays open through the next poll.
      this._expanded = false;
      this._built = false;
      this._render();
    }

    set hass(hass) {
      const previous = this._hass;
      this._hass = hass;
      if (!this._config) return;
      // The embedded map keeps its own view state (pan, zoom, open popups),
      // so it is handed every hass even when nothing else needs redrawing.
      if (this._map) this._map.hass = hass;
      const langChanged = !previous || previous.language !== hass.language;
      // The entries on offer are part of what the card shows: one made on
      // the planner, or added in Settings, reaches the dropdown as soon as
      // its device is there.
      const sig =
        signature(hass, this._areaId(), this._referenceEntity()) +
        "#" + tomtomAreas(hass, this._config.areas).map((a) => a.id).join(",");
      if (this._built && !langChanged && sig === this._signature) return;
      this._signature = sig;
      this._render();
      // The entry may just have polled: the flow is fetched again under
      // the new stamp, and left alone when the stamp is the old one.
      this._scheduleTraffic("main");
      if (this._popHandles) this._scheduleTraffic("pop");
    }

    getCardSize() {
      if (!this._config) return 3;
      if (this._layout === "minimal") return 1;
      // What is actually drawn, not what is held: a folded list is as tall
      // as its fold.
      const rows = this._rows
        ? this._foldable && !this._expanded
          ? this._foldAt
          : this._rows.length
        : 3;
      return 2 + (this._wantsMap ? 4 : 0) + Math.min(rows, 8);
    }

    // What sizes the card can be given in a sections view. Answering at all
    // is what tells the layout editor that the card can be resized - without
    // it, it says so and offers only the coarse old sizing. The numbers are
    // columns of twelve and rows of 56px, and each format asks for the shape
    // it is: a tall stack, a wide pair of halves, or a single line.
    getGridOptions() {
      if (this._layout === "minimal") {
        return { columns: 6, rows: 1, min_columns: 3, min_rows: 1, max_rows: 2 };
      }
      if (this._layout === "landscape") {
        return { columns: 12, rows: 6, min_columns: 6, min_rows: 3 };
      }
      // With a map to fit above the list, the smallest useful card is taller
      // than one that is all list.
      return { columns: 12, rows: "auto", min_columns: 4, min_rows: this._wantsMap ? 4 : 2 };
    }

    static getConfigElement() {
      return document.createElement(EDITOR_TAG);
    }

    // Deliberately bare: defaultConfig fills the rest in on load, and writing
    // it all out would bury the two lines that actually say something.
    static getStubConfig() {
      return {};
    }

    // Which area is on screen. The pick is remembered per browser rather than
    // in the dashboard, because switching it is a private act - one person
    // looking at their commute must not repoint the card for everyone else.
    _areaId() {
      const areas = this._hass ? tomtomAreas(this._hass, this._config.areas) : [];
      if (!areas.length) return null;
      if (this._area && areas.some((a) => a.id === this._area)) return this._area;
      const stored = this._storage("area");
      if (stored && areas.some((a) => a.id === stored)) return stored;
      return areas[0].id;
    }

    _storageKey(what) {
      const scope = (this._config.areas || []).join(",") || "all";
      return `tomtom-card:${scope}:${what}`;
    }

    _storage(what, value) {
      try {
        if (value === undefined) return window.localStorage.getItem(this._storageKey(what));
        window.localStorage.setItem(this._storageKey(what), value);
      } catch (err) {
        // Private windows and "block site data" both throw here. Losing the
        // remembered pick is not worth breaking the card over.
      }
      return null;
    }

    // The skeleton is built once and then only its parts are refilled. The
    // map in the middle has to survive a redraw: recreating it would throw
    // away its pan and zoom and refetch every tile each time a report moves.
    _skeleton() {
      if (this._root) return;
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `
        <style>@layer tomtom-card { ${STYLE} }
               @layer tomtom-vars { ${variableCss()} }</style>
        <ha-card>
          <div class="head"></div>
          <div class="planner" hidden></div>
          <div class="split">
            <div class="mapwrap"></div>
            <div class="side">
              <div class="listwrap"></div>
            </div>
          </div>
          <div class="mini" hidden></div>
          <dialog class="pop">
            <div class="pop-head">
              <span class="pop-title"></span>
              <button type="button" class="pop-close">✕</button>
            </div>
            <div class="pop-traffic"></div>
            <div class="pop-body">
              <div class="pop-map"></div>
              <div class="pop-side">
                <div class="pop-live" hidden></div>
                <div class="pop-list"></div>
              </div>
            </div>
          </dialog>
        </ha-card>`;
      this._root = this.shadowRoot.querySelector("ha-card");
      this._headEl = this._root.querySelector(".head");
      this._plannerEl = this._root.querySelector(".planner");
      this._splitEl = this._root.querySelector(".split");
      this._mapEl = this._root.querySelector(".mapwrap");
      this._sideEl = this._root.querySelector(".side");
      this._listEl = this._root.querySelector(".listwrap");
      this._miniEl = this._root.querySelector(".mini");
      this._popEl = this._root.querySelector(".pop");
      this._popEl.querySelector(".pop-close").addEventListener("click", () => this._popEl.close());
      // The dialog element itself fills the backdrop, so a click that lands
      // on it rather than on the panel inside is a click outside.
      this._popEl.addEventListener("click", (ev) => {
        if (ev.target === this._popEl) this._popEl.close();
      });
      // A map nobody is looking at should not go on fetching tiles. Watched on
      // the attribute rather than the "close" event, which does not reach us
      // here whichever way the dialog is closed.
      new MutationObserver(() => {
        if (!this._popEl.open) this._closePopMap();
      }).observe(this._popEl, { attributes: true, attributeFilter: ["open"] });
    }

    get _layout() {
      return (this._config && this._config.layout) || "portrait";
    }

    // What the card actually draws. The minimal format is one line and a
    // pop-up, so neither the map nor the list is drawn there, whatever their
    // own switches say - and everything hanging off them goes quiet with them.
    get _wantsMap() {
      return this._layout !== "minimal" && this._config.show_map !== false;
    }

    get _wantsList() {
      return this._layout !== "minimal" && this._config.show_list !== false;
    }

    // What a tap on the minimal line is configured to do, or nothing - in
    // which case the line does what it has always done and opens the pop-up.
    get _miniTapAction() {
      const action = this._config.mini_tap_action;
      return action && action.action && action.action !== "default" ? action : null;
    }

    // How many entries stand before the fold. A number typed to nothing, or
    // to something that is not one, folds after three rather than after
    // none - a list of no entries and a chevron says nothing at all.
    get _foldAt() {
      const many = Number.parseInt(this._config.collapse_after, 10);
      return Number.isFinite(many) && many > 0 ? many : 3;
    }

    // Whether this list folds at all: asked for, in the one format that can
    // grow downwards, and with more entries than the fold would leave
    // standing. Without the last condition a full list would carry a chevron
    // that opens nothing.
    get _foldable() {
      return (
        this._layout === "portrait" &&
        this._config.collapse_list === true &&
        (this._rows || []).length > this._foldAt
      );
    }

    // The embedded map is listened to for two reasons: the list follows what
    // it shows, and distances are measured from where it is centred. Either
    // one is enough, and either one means a pan must not be undone by a refit.
    // Whether the view belongs to whoever is looking - because they panned
    // it, or clicked an entry to aim it. The card must not refit it then.
    get _keepsView() {
      return this._watchesMap || this._centred === true;
    }

    // Puts one report in the middle of the map and goes in close. Returns
    // false when there is no map to aim, so the click can fall back to the
    // details dialog.
    _focusMap(row) {
      if (!row || !this._handles) return false;
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
      try {
        // Aimed on purpose: the watch that keeps the route in view after its
        // first fit must not pull the map straight back.
        this._endRouteWatch("_routeSettle");
        this._handles.zoomTo(row.lat, row.lon, FOCUS_ZOOM);
      } catch (err) {
        return false;
      }
      this._centred = true;
      return true;
    }

    get _watchesMap() {
      return !!(this._wantsMap && (this._config.reference_mode === "map" || this._config.follow_map));
    }

    // Whether the list is narrowed to what the map shows.
    get _following() {
      return !!(this._wantsMap && this._config.follow_map);
    }

    // Whether a report lies inside the map's view - asked only while the map
    // has said where it is looking.
    _inBounds(row) {
      return Number.isFinite(row.lat) && Number.isFinite(row.lon) && this._bounds.contains([row.lat, row.lon]);
    }

    // The entity distances are measured from, and only in the mode that
    // actually uses one - the other two must not redraw the card every time
    // some leftover tracker moves.
    _referenceEntity() {
      return this._config.reference_mode === "entity" ? this._config.reference : "";
    }

    // Where distances are measured from, or null for the integration's own
    // figure. The map's centre is only known once the map has reported it;
    // until then, and with the map switched off, this falls back to that
    // same figure rather than to no distance at all.
    _referencePoint() {
      if (this._config.reference_mode === "map") return this._mapCentre || null;
      return referencePoint(this._hass, this._referenceEntity());
    }

    _render() {
      if (!this._hass || !this._config) return;
      this._skeleton();
      const str = t(this._hass);
      const areas = tomtomAreas(this._hass, this._config.areas);
      if (this._planWanted) {
        const made = Object.values(this._hass.devices || {}).find(
          (d) => (d.config_entries || []).includes(this._planWanted) && areas.some((a) => a.id === d.id)
        );
        if (made) {
          this._planWanted = undefined;
          this._area = made.id;
          this._storage("area", made.id);
          this._mapFitted = false;
        }
      }

      if (!areas.length) {
        this._headEl.innerHTML = "";
        this._mapEl.innerHTML = "";
        this._listEl.innerHTML = `<div class="empty">${str.noAreas}</div>`;
        this._built = true;
        return;
      }

      const areaId = this._areaId();
      const area = areas.find((a) => a.id === areaId);
      // On a route the integration's figure is the way along the route from
      // its start, and that is what a route's markers show whatever is
      // picked under "Measure distance from": a straight line from the map's
      // centre says nothing about where on the trip a report is.
      const reference = isRouteArea(area) ? null : this._referencePoint();
      // While the planner previews a route, that route's reports are what
      // the card shows - list, badges, bands and map - the entry's own
      // come back when the planner closes.
      const planned = this._planner && this._planner.route;
      const all = planned && Array.isArray(planned.reports)
        ? planRows(planned.reports, this._config.sort)
        : reportsFor(this._hass, areaId, reference, this._config.sort);
      this._allRows = all;
      this._total = all.length;
      // A highlight lives only as long as the report it points at.
      if (this._highlight && !all.some((r) => r.entityId === this._highlight)) {
        this._highlight = null;
      }

      // "List follows the map" narrows by what is in view; otherwise every
      // report of this area is a candidate and only `max` trims it.
      let pool = all;
      if (this._following && this._bounds) {
        pool = all.filter((r) => this._inBounds(r));
      }

      // Worked out once per redraw, off one clock reading, so the badge and
      // the row markers can never disagree about what is still new. Counted
      // before `max` trims anything: the badge is what one clicks to see the
      // new ones, so it must not hide a report the click would reveal.
      const now = new Date();
      // Switched off here rather than inside the check, so that "the card
      // does not mark" and "this half has no window" are the same thing to
      // everything downstream.
      const window = this._config.show_new === false ? 0 : newWindow(this._hass, areaId);
      this._newRows = new Set(
        pool.filter((row) => isNewReport(row, window, now)).map((r) => r.entityId)
      );
      // The jams that say what they cost, and what they cost together. Off
      // the same pool as the badge above, so both numbers answer for the
      // same reports.
      this._delayRows = new Set();
      this._delayTotal = 0;
      for (const row of this._config.show_delay === false ? [] : pool) {
        const minutes = delayMinutes(row);
        if (!minutes) continue;
        this._delayRows.add(row.entityId);
        this._delayTotal += minutes;
      }
      // Nothing left that costs time - the badge that would switch this back
      // off has gone with it, the same way "only new" lets go of itself.
      if (this._onlyDelay && !this._delayRows.size) this._onlyDelay = false;
      // Nothing new left to show - the badge that would switch this back off
      // has gone with it, so the card lets go of the filter itself rather
      // than stranding whoever set it on an empty list. Not when the card was
      // configured this way, though: showing everything would then be the
      // opposite of what the dashboard asked for.
      if (this._onlyNew && !this._newRows.size && this._config.only_new !== true) {
        this._onlyNew = false;
      }

      // One at a time: each badge narrows the card to what it counted, and
      // two narrowings at once would leave a card that can be empty with
      // both badges still standing on it.
      const candidates = this._onlyNew
        ? pool.filter((r) => this._newRows.has(r.entityId))
        : this._onlyDelay
          ? pool.filter((r) => this._delayRows.has(r.entityId))
          : pool;
      const limit = this._config.show_max ? this._config.max : 0;
      this._rows = limit > 0 ? candidates.slice(0, limit) : candidates;
      // While following, the map shows the whole entry rather than the
      // visible slice of it - but "only new" and "only delayed" are not
      // about the view, so they narrow the map either way.
      this._mapRows = this._following
        ? (this._onlyNew
            ? all.filter((r) => isNewReport(r, window, now))
            : this._onlyDelay
              ? all.filter((r) => delayMinutes(r) > 0)
              : all)
        : this._rows;

      const minimal = this._layout === "minimal";
      this._root.dataset.layout = this._layout;
      this._applyBackground();
      this._miniEl.hidden = !minimal;
      this._headEl.hidden = minimal;
      this._splitEl.hidden = minimal;
      this._mapEl.hidden = !this._wantsMap;
      this._listEl.hidden = !this._wantsList;
      const sideBySide = this._layout === "landscape";
      const plannerSlot = sideBySide ? this._sideEl : this._root;
      if (this._plannerEl.parentNode !== plannerSlot) {
        plannerSlot.insertBefore(this._plannerEl, sideBySide ? this._listEl : this._splitEl);
      }

      // _syncMap runs either way: in the minimal format it is what takes the
      // map down again, rather than leaving it fetching tiles out of sight.
      this._syncMap(areaId);
      if (minimal) {
        this._renderMini(str);
        if (this._popEl.open) this._fillPop(str);
        this._built = true;
        return;
      }
      this._syncScale("main");
      this._renderHead(str, areas, area, areaId);
      this._renderPlanner(str, areas);
      this._renderList(str);
      this._built = true;
    }

    // The whole of the minimal format: the name on the left, what is new on
    // the right, and the line itself is the button that opens the rest.
    // The whole of the minimal format: two halves, each a button, each opening
    // the pop-up on exactly what it counts. Halves rather than words in a row,
    // because two numbers that lead somewhere different should look like two
    // places to press - and the right one carries the accent, since what is
    // new is the thing worth interrupting a glance for.
    _renderMini(str) {
      // A half counting nothing is not a place to press: there is no list to
      // show behind it and no map to draw, so it says its zero and stops
      // being a button.
      // A half counting nothing normally leads nowhere and stops being a
      // button. With a tap action set it leads somewhere regardless of the
      // count, so it stays one - and so does the total while the pop-up has
      // a map to show on its own, with the area drawn on it.
      const dead = (value, scope) =>
        !value && !this._miniTapAction && !(scope === "all" && this._popHasEmptyMap());
      // What is written is not always what decides whether there is anything
      // there: the delay part says "+22 min", and a string is never nought.
      // `level` is the travel time's: its colours are read per level of
      // delay - `${prefix}_${level}_color` and the like - where the other
      // parts have one of each.
      // `short` is the travel time's other wording, for a line too narrow
      // for the long one: both are drawn, the stylesheet shows one.
      const half = (what, scope, prefix, value, label, count = value, level = "", short = "") => {
        const config = level
          ? {
              ...this._config,
              [`${prefix}_color`]: this._config[`${prefix}_${level}_color`],
              [`${prefix}_icon_color`]: this._config[`${prefix}_${level}_icon_color`],
              [`${prefix}_fill_color`]: this._config[`${prefix}_${level}_fill_color`],
            }
          : this._config;
        const style = elementStyle(config, prefix);
        // The fill goes on a layer of its own rather than on the button, for
        // the same reason the card's background does: an opacity set on the
        // button would take the number and the word down with it.
        const fill = [];
        const colour = config[`${prefix}_fill_color`];
        const half =
          { mini_new: "mini-new", mini_delay: "mini-delay", mini_travel: "mini-travel" }[prefix] || "mini-total";
        if (colour) fill.push(`--tomtom-${half}-fill-color: ${colour}`);
        const percent = Number(config[`${prefix}_fill_opacity`]);
        if (Number.isFinite(percent) && percent !== 100) {
          fill.push(`--tomtom-${half}-fill-opacity: ${Math.max(0, Math.min(100, percent)) / 100}`);
        }
        // The word belongs to the same half as the number, so whatever is set
        // here reaches both - a colour that stopped at the digits would leave
        // half the half behind. Only the size stays with the number: giving
        // the word the same one would flatten the pair into one run of text,
        // and the difference between them is what makes the number the thing
        // one reads first.
        const wordStyle = style
          .split("; ")
          .filter((part) => !part.startsWith("font-size:"))
          .join("; ");
        return `<button type="button" class="mini-half ${what}${dead(count, scope) ? " empty" : ""}"
                 data-scope="${scope}"${dead(count, scope) ? " disabled" : ""}
                 style="${escapeHtml(fill.join("; "))}">
          ${miniIconHtml(config, prefix)}
          <span class="mini-value${short ? " long" : ""}" style="${escapeHtml(style)}">${escapeHtml(
            String(value)
          )}</span>
          ${short
            ? `<span class="mini-value short" style="${escapeHtml(style)}">${escapeHtml(short)}</span>`
            : ""}
          ${label
            ? `<span class="mini-label" style="${escapeHtml(wordStyle)}">${escapeHtml(label)}</span>`
            : ""}
        </button>`;
      };
      // Each part on its own switch, and none stands in for another: with
      // all of them off the line is empty, which is what three switches set
      // to off asked for.
      const halves = [];
      if (this._config.mini_show_total !== false) {
        halves.push(
          half("total", "all", "mini", (this._allRows || []).length, str.miniLabelTotal)
        );
      }
      if (this._config.show_new !== false) {
        halves.push(
          half(this._newRows.size ? "new" : "new quiet", "new", "mini_new",
               this._newRows.size, str.miniLabelNew)
        );
      }
      // And what those reports cost in time. Drawn at nought too, quiet the
      // way the new part is: a line that gained and lost a third of itself
      // every time a jam cleared would move everything under it each time.
      // No word beside it: "+21 min" says what it is, and the word did not
      // fit beside it on a card of ordinary width.
      if (this._config.show_delay !== false) {
        halves.push(
          half(this._delayTotal ? "delay" : "delay quiet", "delay", "mini_delay",
               str.delaySum(this._delayTotal), "", this._delayTotal)
        );
      }
      // And, on a route TomTom keeps live, how long it takes right now -
      // coloured by how much of that is traffic, the way the line under a
      // head's travel time is. It leads to everything: the time is the
      // whole route's. Nothing on an entry without a travel time.
      const sensor = this._config.mini_show_travel !== false ? totalSensor(this._hass, this._areaId()) : null;
      const attrs = (sensor && sensor.attributes) || {};
      if (Number.isFinite(attrs.travel_time_minutes)) {
        const level = this._delayLevel(Number(attrs.traffic_delay_minutes) || 0);
        halves.push(
          half(`travel level-${level}`, "all", "mini_travel",
               str.travelTime(attrs.travel_time_minutes), "", 1, level,
               str.travelTimeShort(attrs.travel_time_minutes))
        );
      }
      // Three parts need the room two had; the words go first (see .mini.three).
      // Four share it by what each has to say, and step down sooner.
      this._miniEl.classList.toggle("three", halves.length > 2);
      this._miniEl.classList.toggle("four", halves.length > 3);
      this._miniEl.innerHTML = halves.join("");
      for (const button of this._miniEl.querySelectorAll(".mini-half")) {
        button.addEventListener("click", () => {
          const sensor = totalSensor(this._hass, this._areaId());
          if (runAction(this, this._hass, this._miniTapAction, sensor && sensor.entity_id)) return;
          this._openPop(button.dataset.scope);
        });
      }
    }

    // The card's own background, as four custom properties the stylesheet
    // reads. Cleared first and only set while it is switched on, so turning
    // it off gives the theme its card back rather than leaving the last
    // colour behind.
    //
    // Which surface carries it depends on the format. The minimal format is
    // one line high - there is no room there for a picture, and a colour
    // behind two numbers is not what anyone means by a card background. Its
    // pop-up is the surface that has the room, so that is where it goes.
    // Set on the one and cleared from the other, never both: the pop-up sits
    // inside the card, so a value left on the card would be inherited into
    // it and drawn twice over.
    _applyBackground() {
      const card = this._layout === "minimal" ? this._popEl : this._root;
      const other = this._layout === "minimal" ? this._root : this._popEl;
      for (const surface of [card, other]) {
        if (!surface) continue;
        for (const name of ["color", "image", "size", "repeat", "opacity"]) {
          surface.style.removeProperty(`--tomtom-card-background-${name}`);
        }
      }
      if (!card || this._config.card_background !== true) return;
      if (this._config.card_background_color) {
        card.style.setProperty("--tomtom-card-background-color", this._config.card_background_color);
      }
      if (this._config.card_background_image) {
        card.style.setProperty(
          "--tomtom-card-background-image",
          `url("${this._config.card_background_image.replace(/"/g, "%22")}")`
        );
      }
      // Two properties per choice: how the image is scaled, and whether it
      // is laid out once or tiled. "Actual size" and "Repeat" differ in
      // nothing else.
      const fits = {
        cover: ["cover", "no-repeat"],
        contain: ["contain", "no-repeat"],
        auto: ["auto", "no-repeat"],
        repeat: ["auto", "repeat"],
      };
      const [size, repeat] = fits[this._config.card_background_size] || fits.cover;
      card.style.setProperty("--tomtom-card-background-size", size);
      card.style.setProperty("--tomtom-card-background-repeat", repeat);
      const percent = Number(this._config.card_background_opacity);
      const opacity = Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 100;
      card.style.setProperty("--tomtom-card-background-opacity", String(opacity / 100));
    }

    // Fetch this area again, now - on a live route, the route first.
    //
    // The action is addressed to the config entry rather than to the device,
    // because that is what the integration registered it for. The device
    // knows its entry, so the card does not have to be told.
    async _refresh(button, areaId) {
      const device = this._hass && this._hass.devices && this._hass.devices[areaId];
      const entry = device && (device.config_entries || [])[0];
      if (!entry || button.disabled) return;
      const service = "refresh";
      button.disabled = true;
      button.classList.add("spinning");
      try {
        await this._hass.callService(DOMAIN, service, { config_entry_id: entry });
      } catch (err) {
        console.error("tomtom-card: refresh failed", err);
      } finally {
        // The button belongs to the head that drew it; a poll arriving mid
        // request replaces that head, and this one is then no longer on
        // screen. Guarded rather than assumed, so a redraw cannot leave a
        // button spinning that nobody can see any more.
        if (button.isConnected) {
          button.disabled = false;
          button.classList.remove("spinning");
        }
      }
    }

    _newReports() {
      return (this._allRows || []).filter((r) => this._newRows.has(r.entityId));
    }

    _delayReports() {
      return (this._allRows || []).filter((r) => this._delayRows.has(r.entityId));
    }

    // What the pop-up is about - decided by which of the numbers opened it.
    _popRows() {
      if (this._popScope === "all") return this._allRows || [];
      return this._popScope === "delay" ? this._delayReports() : this._newReports();
    }

    // The reports behind the line: the map on one side, the list on the other,
    // both drawn exactly as the card draws them - so every Layout setting for
    // the map and for a list entry holds in here too.
    _fillPop(str) {
      const rows = this._popRows();
      this._popRowsCache = rows;
      this._popListShown = undefined;
      // The card's own title, and the card's own "Hide" with it: this is the
      // same title shown somewhere else, not a second one.
      const popTitle = this._popEl.querySelector(".pop-title");
      popTitle.textContent =
        this._config.show_title === false ? "" : this._config.title || str.title;
      // The same wording and the same look: Layout -> General settles the
      // card title once, wherever it is shown.
      popTitle.setAttribute("style", elementStyle(this._config, "title"));
      this._popEl.querySelector(".pop-close").title = str.popClose;
      // With one of the two switched off the other has the pop-up to itself,
      // which the narrow layout has to be told - see .pop-body.solo.
      const wantsMap = this._config.show_map !== false;
      const wantsList = this._config.show_list !== false;
      this._popEl.querySelector(".pop-body").classList.toggle("solo", wantsMap !== wantsList);
      this._fillPopTrafficLine();
      this._fillPopLive(str);
      this._fillPopList(str);
      this._syncPopMap(rows);
    }

    // The list on its own, so a highlight can redraw it without rebuilding the
    // map beside it.
    _fillPopList(str) {
      const rows = this._popRowsCache || [];
      const list = this._popEl.querySelector(".pop-list");
      // Nothing changed, nothing redrawn.
      const shown = rows.map((r) => r.entityId).join(",") + "|" + this._highlight;
      if (shown === this._popListShown && list.children.length) return;
      this._popListShown = shown;
      // The card's own list switch answers for this one too - in the minimal
      // format it is the only list there is.
      list.hidden = this._config.show_list === false;
      if (list.hidden) {
        list.innerHTML = "";
        return;
      }
      list.innerHTML = rows.length
        ? `<div class="list${this._config.show_divider === false ? " no-divider" : ""}"
             style="${escapeHtml(dividerStyle(this._config))}">${rows
            .map((row) =>
              rowHtml(row, str, this._newRows.has(row.entityId), this._config,
                      this._highlight === row.entityId, "pop_new")
            )
            .join("")}</div>`
        : `<div class="empty" style="${escapeHtml(elementStyle(this._config, "no_reports"))}">${escapeHtml(
            this._config.no_reports_text ||
              (this._popScope === "all"
                ? str.nothing
                : this._popScope === "delay"
                  ? str.noDelay
                  : str.noNew)
          )}</div>`;
      this._fitIcons();
      // The same click as in the card: it aims the map at the report, and
      // opens Home Assistant's details dialog where there is no map to aim.
      for (const el of list.querySelectorAll(".row")) {
        el.addEventListener("click", () => {
          const row = rows.find((r) => r.entityId === el.dataset.entity);
          if (this._config.center_on_click !== false && this._focusPopMap(row)) return;
          this.dispatchEvent(
            new CustomEvent("hass-more-info", {
              detail: { entityId: el.dataset.entity },
              bubbles: true,
              composed: true,
            })
          );
        });
      }
    }

    _focusPopMap(row) {
      if (!row || !this._popHandles) return false;
      if (!Number.isFinite(row.lat) || !Number.isFinite(row.lon)) return false;
      try {
        this._endRouteWatch("_popRouteSettle");
        this._popHandles.zoomTo(row.lat, row.lon, FOCUS_ZOOM);
      } catch (err) {
        return false;
      }
      return true;
    }

    // The pop-up's own map. A second one of Home Assistant's map cards, built
    // and taken down with the pop-up rather than kept running out of sight.
    async _syncPopMap(rows) {
      const wrap = this._popEl.querySelector(".pop-map");
      const wanted = this._config.show_map !== false;
      wrap.hidden = !wanted;
      const ids = wanted ? rows.map((r) => r.entityId).sort() : [];
      const key = ids.join(",") + "|" + (this._config.map_cluster !== false) + "|" + (this._config.map_always !== false);
      if (!wanted || (!ids.length && this._config.map_always === false)) {
        wrap.innerHTML = "";
        this._popMap = undefined;
        this._popMapKey = key;
        return;
      }
      if (key === this._popMapKey && this._popMap) {
        this._popMap.hass = this._hass;
        this._styleMap(this._popMap);
        return;
      }
      this._popMapKey = key;
      const helpers = await window.loadCardHelpers();
      if (this._popMapKey !== key) return;
      // No ratio: the map fills its half of the pop-up.
      const card = await helpers.createCardElement({
        type: "map",
        ...(ids.length ? { entities: ids } : { geo_location_sources: [] }),
        auto_fit: true,
        ...(this._config.map_cluster === false ? { cluster: false } : {}),
      });
      if (this._popMapKey !== key) return;
      card.hass = this._hass;
      wrap.innerHTML = "";
      wrap.appendChild(card);
      this._popMap = card;
      this._watchMarkers(card, "_popObserver");
      this._attachPopMap(card);
    }

    // The pop-up map's own grip: a click on a report picks its entry out of
    // the list beside it, a click on the bare map lets it go again. The same
    // two rules as in the card, and switched by the same setting.
    _attachPopMap(card) {
      const tryAttach = (attempt) => {
        if (this._popMap !== card) return;
        const haMap = card.shadowRoot ? card.shadowRoot.querySelector("ha-map") : null;
        const h = mapHandles(haMap);
        if (!h) {
          window.setTimeout(() => tryAttach(attempt + 1), attempt < 40 ? 300 : 2000);
          return;
        }
        this._popHandles = h;
        this._popHaMap = haMap;
        this._syncScale("pop");
        this._paintPopRoute();
        this._paintArea(h, this._popRowsCache, "_popAreaDrawn", "_popAreaSettle");
        this._paintLines(h, this._popRowsCache, "_popLinesDrawn");
        this._onPopMove = () => {
          this._scheduleTraffic("pop");
        };
        h.on("moveend", this._onPopMove);
        h.on("zoomend", this._onPopMove);
        this._scheduleTraffic("pop");
        this._onPopMarkerClick = (ev) => {
          if (this._config.map_highlight === false) return;
          const marker = ev.composedPath().find((n) => n && n.tagName === "HA-ENTITY-MARKER");
          const id = marker && (marker.entityId || marker.getAttribute("entity-id"));
          if (!id || !(this._popRowsCache || []).some((r) => r.entityId === id)) return;
          const bubble = marker.closest && marker.closest(".cluster-marker");
          if (bubble && bubble.getAttribute("role") !== "group") return;
          ev.stopPropagation();
          ev.preventDefault();
          this._highlight = this._highlight === id ? null : id;
          this._fillPopList(t(this._hass));
        };
        try {
          haMap.shadowRoot.addEventListener("click", this._onPopMarkerClick, true);
        } catch (err) {
          this._onPopMarkerClick = undefined;
        }
        this._onPopMapClick = () => {
          if (!this._highlight) return;
          this._highlight = null;
          this._fillPopList(t(this._hass));
        };
        if (h.kind === "leaflet") h.on("click", this._onPopMapClick);
        else haMap.addEventListener("map-clicked", this._onPopMapClick);
      };
      tryAttach(0);
    }

    _closePopMap() {
      if (this._popObserver) {
        try {
          this._popObserver.disconnect();
        } catch (err) {
          // Already gone with the map it was watching.
        }
        this._popObserver = undefined;
      }
      const h = this._popHandles;
      if (h && this._onPopMapClick) {
        try {
          if (h.kind === "leaflet") h.off("click", this._onPopMapClick);
          else if (this._popHaMap) this._popHaMap.removeEventListener("map-clicked", this._onPopMapClick);
        } catch (err) {
          // The instance went with the map.
        }
      }
      if (this._popHaMap && this._onPopMarkerClick) {
        try {
          this._popHaMap.shadowRoot.removeEventListener("click", this._onPopMarkerClick, true);
        } catch (err) {
          // Its shadow root went with it.
        }
      }
      if (h && this._onPopMove) {
        try {
          h.off("moveend", this._onPopMove);
          h.off("zoomend", this._onPopMove);
        } catch (err) {
          // The instance went with the map.
        }
      }
      this._onPopMove = undefined;
      this._popListShown = undefined;
      this._popTrafficAt = undefined;
      this._popTrafficOn = undefined;
      this._endRouteWatch("_popRouteSettle");
      removeRoute(this._popRouteDrawn);
      this._popRouteDrawn = undefined;
      this._removeArea("_popAreaDrawn", "_popAreaSettle");
      this._removeLines("_popLinesDrawn");
      this._clearTraffic("pop");
      if (this._popScale) {
        this._popScale.remove();
        this._popScale = undefined;
      }
      this._popHandles = undefined;
      this._popHaMap = undefined;
      this._onPopMapClick = undefined;
      this._onPopMarkerClick = undefined;
      const wrap = this._popEl ? this._popEl.querySelector(".pop-map") : null;
      if (wrap) wrap.innerHTML = "";
      this._popMap = undefined;
      this._popMapKey = undefined;
    }

    // Opened by one of the two numbers, and about exactly what that number
    // counted. Nothing opens on nothing: a pop-up that can only say "no
    // reports" is worse than the click doing nothing at all, and the same
    // goes for one with neither the map nor the list switched on.
    _openPop(scope) {
      if (!this._hass) return;
      const wanted = scope === "all" || scope === "delay" ? scope : "new";
      const rows =
        wanted === "all"
          ? this._allRows || []
          : wanted === "delay"
            ? this._delayReports()
            : this._newReports();
      if (!rows.length && !(wanted === "all" && this._popHasEmptyMap())) return;
      if (this._config.show_map === false && this._config.show_list === false) return;
      this._popScope = wanted;
      this._highlight = null;
      this._fillPop(t(this._hass));
      this._popEl.showModal();
    }

    // Whether the pop-up shows a map even with nothing reported: the map
    // switch on, and the map set to stay - see map_always.
    _popHasEmptyMap() {
      return this._config.show_map !== false && this._config.map_always !== false;
    }

    _renderHead(str, areas, area, areaId) {
      const sensor = totalSensor(this._hass, areaId);
      const updated = updatedText(str, sensor && sensor.attributes.last_update);
      // The device's model field is what the integration puts the search
      // mode in; "Radius" is also what every entry made before the other two
      // existed carries, which is why it is the fallback rather than a case.
      const mode =
        isRouteArea(area)
          ? str.waypoints
          : area.model === "Tracker"
          ? str.tracker
          : str.radius;
      // A route TomTom keeps live says how long it takes right now - large,
      // under the title, with the area's refresh beside it - and under that
      // how much of it is traffic, followed by the subtitle line's parts.
      // Every other entry keeps the subtitle line with the refresh at its
      // end. Either way the button carries the time of the last fetch while
      // the line's "Last update" is on, and the line says it in words only
      // where there is no button to say it.
      const attrs = (sensor && sensor.attributes) || {};
      const liveMinutes = attrs.travel_time_minutes;
      const liveDelay = Number(attrs.traffic_delay_minutes) || 0;
      const hasLive = Number.isFinite(liveMinutes);
      const bigLive = hasLive && this._config.show_travel_time !== false;
      const showSub = this._config.show_sub !== false;
      // The moment of the last fetch is part of the refresh button; without
      // the button it is the info line's last part.
      const showUpdated = true;
      const refreshHtml =
        this._config.show_refresh !== false && (bigLive || showSub)
          ? refreshPillHtml(
              this._config,
              "refresh",
              str.refreshNow,
              showUpdated
                ? `<span class="ago">${escapeHtml(agoText(str, sensor && sensor.attributes.last_update))}</span>`
                : ""
            )
          : "";
      const updatedPart = showUpdated && !refreshHtml ? updated : "";
      let lineHtml = "";
      if (bigLive) {
        const parts = showSub
          ? [
              this._config.sub_show_area === false ? "" : area.name,
              this._config.sub_show_mode === false ? "" : this._routeLength(attrs.route_distance_km),
              updatedPart,
            ]
          : [];
        lineHtml = this._liveHtml(str, attrs, refreshHtml, parts);
      } else {
        // Each part on its own switch; with all of them off and no button
        // the line goes too, rather than leaving an empty row under the
        // title. A live route whose travel time is not shown large says it
        // here, beside the mode, where the route is named.
        const live = hasLive ? str.liveTime(liveMinutes, liveDelay) : "";
        const subText = showSub
          ? [
              this._config.sub_show_area === false ? "" : area.name,
              this._config.sub_show_mode === false ? "" : [mode, live].filter(Boolean).join(" "),
              updatedPart,
            ]
              .filter(Boolean)
              .join(" · ")
          : "";
        lineHtml = showSub && (subText || refreshHtml)
          ? `<div class="sub" style="${escapeHtml(elementStyle(this._config, "sub"))}">${
              leadIconHtml(this._config, "sub")
            }<span>${escapeHtml(subText)}</span>${refreshHtml}</div>`
          : "";
      }

      // Under the area dropdown: the traffic flow's switch.
      const toggles = [...this._trafficCells(str, "main")];
      this._headEl.innerHTML = `
        <div class="head-left">
          <div class="title">
            ${this._config.show_title === false
              ? ""
              : `<span class="title-text" style="${escapeHtml(elementStyle(this._config, "title"))}">${escapeHtml(this._config.title || str.title)}</span>`}
            ${this._newRows.size
              ? `<button type="button" class="badge new" data-what="new-filter"
                    aria-pressed="${this._onlyNew ? "true" : "false"}"
                    title="${escapeHtml(this._onlyNew ? str.newFilterOff : str.newFilterOn)}"
                    style="${escapeHtml(elementStyle(this._config, "new"))}"
                 >${escapeHtml(str.newCount(this._newRows.size))}</button>`
              : ""}
            ${this._delayTotal
              ? `<button type="button" class="badge delay" data-what="delay-filter"
                    aria-pressed="${this._onlyDelay ? "true" : "false"}"
                    title="${escapeHtml(this._onlyDelay ? str.delayFilterOff : str.delayFilterOn)}"
                    style="${escapeHtml(elementStyle(this._config, "delay"))}"
                 >${escapeHtml(str.delaySum(this._delayTotal))}</button>`
              : ""}
          </div>
          ${lineHtml}
        </div>
        <div class="pickers">
          ${this._config.show_area_picker
            ? selectHtml("area", this._areaOptions(areas, str), areaId,
                elementStyle(this._config, "area_select"))
            : ""}
          ${toggles.length ? `<div class="toggles">${toggles.join("")}</div>` : ""}
        </div>`;

      const refreshButton = this._headEl.querySelector('[data-what="refresh"]');
      if (refreshButton) {
        refreshButton.addEventListener("click", () => this._refresh(refreshButton, areaId));
      }

      // The traffic flow's own switch and refresh. The switch is for the
      // moment - the option under Settings is what offers it at all.
      this._bindTrafficLine(this._headEl, "main");

      const newButton = this._headEl.querySelector('[data-what="new-filter"]');
      if (newButton) {
        newButton.addEventListener("click", () => {
          this._onlyNew = !this._onlyNew;
          if (this._onlyNew) this._onlyDelay = false;
          this._render();
        });
      }

      const delayButton = this._headEl.querySelector('[data-what="delay-filter"]');
      if (delayButton) {
        delayButton.addEventListener("click", () => {
          this._onlyDelay = !this._onlyDelay;
          if (this._onlyDelay) this._onlyNew = false;
          this._render();
        });
      }

      const areaSelect = this._headEl.querySelector('select[data-what="area"]');
      if (areaSelect) {
        areaSelect.addEventListener("change", (ev) => {
          if (ev.target.value === PLAN_VALUE) {
            // Not an entry: the planner opens under the head, and the
            // dropdown goes on naming the entry the card shows.
            ev.target.value = areaId || "";
            this._openPlanner();
            return;
          }
          this._area = ev.target.value;
          this._storage("area", this._area);
          this._mapFitted = false;
          this._signature = signature(this._hass, this._area, this._referenceEntity());
          this._render();
        });
      }
      this._fitIcons();
    }

    // A live route's travel time, large, with the area's refresh beside it,
    // and under it how much of that is traffic followed by `parts` - in the
    // card's head, and in the minimal format's pop-up above its list. The
    // line's colour is the delay's level: below the yellow threshold, from
    // it, or from the red one, each colour from Layout -> Traffic delay.
    // Which of the three levels a delay is at: "ok" below the yellow
    // threshold, "warn" from it, "alert" from the red one - the two under
    // Layout -> Traffic delay, shared by every part coloured by delay.
    _delayLevel(delay) {
      const warnAt = Number.isFinite(Number(this._config.delay_warn_minutes))
        ? Number(this._config.delay_warn_minutes) : 5;
      const alertAt = Number.isFinite(Number(this._config.delay_alert_minutes))
        ? Number(this._config.delay_alert_minutes) : 15;
      return delay >= alertAt ? "alert" : delay >= warnAt ? "warn" : "ok";
    }

    _liveHtml(str, attrs, refreshHtml, parts) {
      const minutes = attrs.travel_time_minutes;
      const delay = Number(attrs.traffic_delay_minutes) || 0;
      const level = this._delayLevel(delay);
      const levelColor = this._config[`delay_${level}_color`];
      const delayStyle = [levelColor ? `color: ${levelColor}` : "", elementStyle(this._config, "delay_line")]
        .filter(Boolean)
        .join("; ");
      // The line under it: the traffic's share first, unless switched off,
      // then the info line's parts; nothing at all when nothing is left.
      const pieces = [
        this._config.sub_show_delay === false
          ? ""
          : `<span class="delay-line level-${level}" title="${escapeHtml(str.liveDelayTip)}" style="${escapeHtml(delayStyle)}">${escapeHtml(
              delay > 0 ? str.liveDelay(str.delaySum(delay)) : str.liveFree
            )}</span>`,
        ...(parts || []).filter(Boolean).map((p) => escapeHtml(p)),
      ].filter(Boolean);
      return `
        <div class="live">
          <span class="travel-time" title="${escapeHtml(str.travelTimeTip)}"
                style="${escapeHtml(elementStyle(this._config, "travel_time"))}">${escapeHtml(str.travelTime(minutes))}</span>${refreshHtml}
        </div>
        ${pieces.length ? `<div class="sub live-sub" style="${escapeHtml(elementStyle(this._config, "sub"))}">${pieces.join(" · ")}</div>` : ""}`;
    }

    // The minimal format's pop-up has no head, so a live route's travel time
    // goes where its list is: right of the map, above the list - or under
    // the map on a narrow screen. The route's name and length follow the
    // delay as in the head, and the area's refresh stands beside the time.
    // With the list switched off it stays, on its own beside the map.
    _fillPopLive(str) {
      const side = this._popEl.querySelector(".pop-side");
      const box = this._popEl.querySelector(".pop-live");
      const areaId = this._areaId();
      const area = tomtomAreas(this._hass, this._config.areas).find((a) => a.id === areaId);
      const sensor = totalSensor(this._hass, areaId);
      const attrs = (sensor && sensor.attributes) || {};
      const live =
        !!area && Number.isFinite(attrs.travel_time_minutes) && this._config.show_travel_time !== false;
      if (live) {
        const refresh =
          this._config.show_refresh === false
            ? ""
            : refreshPillHtml(
                this._config,
                "refresh",
                str.refreshNow,
                `<span class="ago">${escapeHtml(agoText(str, attrs.last_update))}</span>`
              );
        box.innerHTML = this._liveHtml(str, attrs, refresh, [area.name, this._routeLength(attrs.route_distance_km)]);
        const button = box.querySelector('[data-what="refresh"]');
        if (button) button.addEventListener("click", () => this._refresh(button, areaId));
      } else {
        box.innerHTML = "";
      }
      box.hidden = !live;
      const listOff = this._config.show_list === false;
      side.classList.toggle("live-only", listOff);
      side.hidden = listOff && !live;
      this._fitIcons();
    }

    // A live route's length as the line under its travel time says it: in
    // the unit the system measures in, whole above a hundred, to a tenth
    // below. Empty while the integration has not said it.
    _routeLength(km) {
      const value = Number(km);
      if (km === null || km === undefined || !Number.isFinite(value)) return "";
      const imperial =
        this._hass.config && this._hass.config.unit_system && this._hass.config.unit_system.length === "mi";
      const amount = imperial ? value * 0.621371 : value;
      return `${fmtNumber(amount, amount >= 100 ? 0 : 1)} ${imperial ? "mi" : "km"}`;
    }

    // Sizes the subtitle line's icon so that its drawing - not its box - is
    // exactly one capital high and ends on the same baseline as the text.
    //
    // The stylesheet gets the box right on its own (see ha-icon.fit-icon), but a
    // box is not what one sees: every MDI icon leaves a different amount of
    // room around its drawing, so a cap-high box leaves a drawing that is
    // shorter than the capitals by a different amount per icon. This measures
    // that room once per icon and takes it back out.
    //
    // Runs after every redraw, since the font size, the icon and its own size
    // can all change underneath it, and retries while ha-icon is still
    // fetching the shape - it resolves the name asynchronously.
    _fitIcons(attempt = 0) {
      const icons = this._root ? [...this._root.querySelectorAll("ha-icon.fit-icon")] : [];
      if (!icons.length) return;
      let waiting = false;
      for (const icon of icons) if (!this._fitOneIcon(icon)) waiting = true;
      if (waiting && attempt < 20) {
        // The first few looks are a frame apart, so the one time this really
        // has to wait is not a visible jump either. After that the ratio is
        // cached and the whole thing runs straight through.
        window.setTimeout(() => this._fitIcons(attempt + 1), attempt < 6 ? 16 : 150);
      }
    }

    // True once this icon has been fitted; false while something it needs is
    // still missing.
    _fitOneIcon(icon) {
      // Two things have to be there before this can be worked out, and
      // neither is on the first look after a redraw: ha-icon resolves its
      // shape asynchronously, and the line has no measurable capital height
      // until it has been laid out. Both wait through the same retry - an
      // earlier version gave up silently on the second one, which is why the
      // icon kept the stylesheet's plain box while its size was being typed.
      const ink = iconInk(icon);
      const cap = ink ? this._capHeight(icon) : 0;
      if (!ink || !(cap > 0)) return false;
      const box = cap / ink.fill;
      icon.style.setProperty("--mdc-icon-size", `${box}px`);
      icon.style.width = `${box}px`;
      icon.style.height = `${box}px`;
      // The box's bottom edge rides the baseline; push it down by the empty
      // strip under the drawing so the drawing itself lands there instead.
      icon.style.transform = `translateY(${ink.below * box}px)`;
      return true;
    }

    // The height of a capital in the icon's own font - measured off a probe
    // rather than guessed at a ratio, because it is a property of the font
    // and follows any size set for the icon.
    _capHeight(icon) {
      try {
        const probe = document.createElement("span");
        probe.style.cssText =
          `position:absolute;visibility:hidden;width:0;height:1cap;font-size:${
            getComputedStyle(icon).fontSize
          }`;
        icon.parentElement.appendChild(probe);
        const cap = probe.getBoundingClientRect().height;
        probe.remove();
        return cap;
      } catch (err) {
        return 0;
      }
    }

    // Home Assistant's own map card, embedded rather than redrawn here. It is
    // maintained, themed and already draws TomTom's symbols.
    //
    // What it is handed depends on which way round the two halves work:
    //
    //   - mirroring (default): exactly the listed reports, so the badge and
    //     the map can never tell two different stories.
    //   - following: every report of the area, because the list is narrowed
    //     by what the map shows - handing it the narrowed set instead would
    //     feed back on itself and collapse to nothing.
    //
    // An existing map is reconfigured rather than rebuilt when only the set of
    // reports changed: rebuilding would throw away its pan and zoom and
    // refetch every tile, which on a one-minute poll would be constant.
    async _syncMap(areaId) {
      if (!this._wantsMap) {
        if (this._map) {
          this._detachMap();
          this._unwatchMarkers();
          this._mapEl.innerHTML = "";
          this._map = undefined;
          this._mapKey = undefined;
        }
        return;
      }

      // Asked first, because it decides how the map is built: a route is
      // fitted to by this card, so Home Assistant's own fit to the markers
      // must not undo it on the next update.
      const previewing = !!(this._planner && this._planner.route);
      const route = this._config.map_route === false || previewing ? null : await this._routeFor(areaId);
      this._route = route;
      // A new colour or width is repainted in place; only the route itself
      // rebuilds the map, since it decides how the map is fitted.
      const routeStyle = `${this._config.route_color}|${this._config.route_width}`;
      const restyle = this._routeStyle !== routeStyle;
      this._routeStyle = routeStyle;
      const trafficStyle = `${this._config.traffic_style}|${this._config.traffic_opacity}`;
      if (this._trafficStyleSig !== trafficStyle) {
        this._trafficStyleSig = trafficStyle;
        this._restyleTraffic();
      }

      const shown = this._mapRows;
      // A planned route's reports have no entity: the map draws them itself
      // (see _paintPlan), and must not be asked for them.
      const ids = (shown || []).filter((r) => !r.plan).map((r) => r.entityId).sort();
      const key =
        `${areaId}|${ids.join(",")}|${this._config.map_aspect_ratio}` +
        `|${this._watchesMap}|${this._layout}|${routeSig(route)}` +
        `|${this._config.map_cluster !== false}|${this._config.map_always !== false}|${previewing ? "plan" : ""}`;
      if (key === this._mapKey && this._map) {
        this._map.hass = this._hass;
        // Hooks can be missing here for reasons other than a view switch -
        // the map card rebuilding its own insides, say. Both of these do
        // nothing when they are already in place.
        if (!this._handles) this._attachMap();
        else if (restyle) {
          this._paintRoute();
          this._paintArea();
        }
        this._watchMarkers();
        this._styleMap();
        this._fitScope();
        this._syncTrafficSwitch();
        return;
      }

      // Nothing to mark and no route to draw: no map - unless the map is
      // to stay regardless, which it does by default, showing the area as
      // it is set up. A route is a reason of its own either way - a short
      // commute is empty most of the day, and the map is what shows the
      // route (#3).
      if (!ids.length && !route && this._config.map_always === false) {
        this._detachMap();
        this._unwatchMarkers();
        this._mapEl.innerHTML = "";
        this._map = undefined;
        this._mapKey = key;
        return;
      }

      // A new map starts from Home Assistant's own fit of its markers, with
      // no room for their pins - so the route is fitted again on it, whatever
      // was fitted on the map before.
      this._routeFitted = undefined;

      const mapConfig = {
        type: "map",
        // Home Assistant's map card refuses an empty entity list but takes a
        // list of geo_location sources, and an empty one of those is a map
        // of nothing - the base the route is painted on. Not this area's
        // own sources: the list is empty because of what the card is set to
        // show ("only new", say, or one half), and the area's markers would
        // reappear on the map regardless of that.
        ...(ids.length ? { entities: ids } : { geo_location_sources: [] }),
        // Only ever said when it is off: the map groups by default, and a
        // version from before the option simply does not see the key.
        ...(this._config.map_cluster === false ? { cluster: false } : {}),
        // While the card is listening to the map - following it, or measuring
        // from its centre - refitting on every data update would undo the pan
        // the person just made. It fits once, when the map first appears.
        auto_fit: route ? false : this._keepsView ? !this._mapFitted : true,
        // Side by side, the map has a height to fill - its half of the card -
        // so a ratio of its own would only fight it.
        ...(this._layout === "landscape"
          ? {}
          : { aspect_ratio: this._config.map_aspect_ratio }),
      };

      // Same card, new entities - keeps the Leaflet instance alive.
      if (this._map && this._mapKey && this._mapKey.startsWith(`${areaId}|`)) {
        try {
          this._map.setConfig(mapConfig);
          this._map.hass = this._hass;
          this._mapKey = key;
          this._mapFitted = true;
          this._attachMap();
          this._styleMap();
          this._fitScope();
          return;
        } catch (err) {
          // Fall through and build a fresh one.
        }
      }

      this._mapKey = key;
      // A map built afresh starts where Home Assistant puts it; a previewed
      // route is fitted into it again.
      this._planFitted = undefined;
      const helpers = await window.loadCardHelpers();
      // Another redraw may have overtaken this one while the helpers loaded.
      if (this._mapKey !== key) return;
      const card = await helpers.createCardElement(mapConfig);
      if (this._mapKey !== key) return;
      card.hass = this._hass;
      this._detachMap();
      this._unwatchMarkers();
      this._mapEl.innerHTML = "";
      this._mapEl.appendChild(card);
      this._map = card;
      this._mapFitted = true;
      // A fresh map is fitted by Home Assistant, or to its route; a badge
      // already narrowing the card is picked up once the map is attached.
      this._fittedScope = "";
      this._attachMap();
      this._watchMarkers();
    }

    // Reaches into the embedded map's markers to drop the ring or the disc
    // behind each symbol.
    //
    // Like the viewport following below, this leans on Home Assistant
    // internals it does not own - `ha-map`, `ha-entity-marker` and that
    // element's own ".marker" class. Everything is therefore guarded: if the
    // shape ever changes, the markers simply keep Home Assistant's own look
    // instead of the card breaking.
    //
    // A stylesheet of its own goes into each marker's shadow root rather than
    // the class being patched globally: every other map in the installation
    // has to keep looking the way its own dashboard expects.
    // Everything the card restyles inside an embedded map - the one in the
    // card, or the one in the pop-up.
    _styleMap(card = this._map) {
      this._fillMap(card);
      this._styleMapChrome(card);
      this._styleMarkers(card);
      this._styleClusters(card);
    }

    // Side by side, and in the pop-up, the map has a height to fill - its
    // half - and no ratio of its own. Home Assistant's map card, given no
    // ratio, still draws itself square by a padding on its root, and the
    // half, when it is lower than the square, cut the map's bottom off
    // together with the scale and the credit. The padding goes, once the
    // card has had its own say: it sets the padding again on every config
    // of its own, after this code has run, so the override waits for that
    // update to settle. Portrait keeps the ratio the settings ask for.
    _fillMap(card) {
      const fill = card && (card === this._popMap || (card === this._map && this._layout === "landscape"));
      if (!fill) return;
      const apply = () => {
        try {
          const root = card.shadowRoot && card.shadowRoot.getElementById("root");
          if (root && root.style.paddingBottom !== "0px") root.style.paddingBottom = "0px";
        } catch (err) {
          // The map card's inside is Home Assistant's; if it changes shape,
          // the map keeps the square it draws itself.
        }
      };
      Promise.resolve(card.updateComplete).then(apply, apply);
    }

    // The map's own furniture: the credit line OpenStreetMap and CARTO ask
    // for in return for their tiles, and the buttons Leaflet draws in the
    // corners.
    //
    // The credit never goes away. Collapsed it is an "i" in the corner that a
    // click opens - the smallest form OpenStreetMap allows, and only because
    // a card on a dashboard is the small display their guidance is about.
    // Open it is fine print rather than the white box Leaflet draws.
    _styleMapChrome(card = this._map) {
      try {
        const haMap = card && card.shadowRoot
          ? card.shadowRoot.querySelector("ha-map")
          : null;
        if (!haMap || !haMap.shadowRoot) return;
        let sheet = haMap.shadowRoot.querySelector("style[data-tomtom-chrome]");
        if (!sheet) {
          sheet = document.createElement("style");
          sheet.dataset.tomtomChrome = "";
          haMap.shadowRoot.appendChild(sheet);
        }
        const css = [
          ".leaflet-control-attribution {",
          "  background: none !important;",
          "  color: rgba(255, 255, 255, 0.6) !important;",
          "  font-size: 10px !important;",
          "  padding: 0 6px !important;",
          "  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);",
          "}",
          ".leaflet-control-attribution a { color: inherit !important; text-decoration: none !important; }",
          // The card's own scale bar - see scaleBar. Over the fade (800 on
          // Leaflet, 1 on MapLibre), under the buttons; the card's text
          // colour on a wash of its background, so it reads on either map.
          ".tomtom-scale {",
          "  position: absolute; left: 18px; bottom: 13px; z-index: 900; pointer-events: none;",
          "  font: 500 8px/1.1 var(--paper-font-body1_-_font-family, var(--ha-font-family-body, Roboto, sans-serif));",
          "  color: var(--primary-text-color);",
          "}",
          "#map.maplibregl-map .tomtom-scale { z-index: 2; }",
          ".tomtom-scale-line {",
          "  box-sizing: border-box; border: 1.5px solid currentColor; border-top: none;",
          "  padding: 1px 3px 1px; white-space: nowrap; overflow: hidden; text-align: center;",
          "  background: rgba(255, 255, 255, 0.55);",
          "  background: color-mix(in srgb, var(--card-background-color) 60%, transparent);",
          "}",
          // Collapsed: the whole line at font-size 0, which takes the links
          // with it, and an "i" drawn in its place.
          ".leaflet-control-attribution {",
          "  box-sizing: border-box;",
          "  width: 18px; height: 18px;",
          "  padding: 0 !important;",
          "  border-radius: 999px !important;",
          "  background: rgba(90, 90, 90, 0.85) !important;",
          "  font-size: 0 !important;",
          "  overflow: hidden;",
          "  cursor: pointer;",
          "}",
          '.leaflet-control-attribution::before {',
          '  content: "i";',
          "  display: block;",
          "  width: 18px; height: 18px;",
          "  font: italic 600 11px/18px var(--paper-font-body1_-_font-family, sans-serif);",
          "  color: #fff;",
          "  text-align: center;",
          "  text-shadow: none;",
          "}",
          ".leaflet-control-attribution.tomtom-open {",
          "  width: auto; height: auto;",
          "  padding: 1px 8px !important;",
          "  border-radius: 10px !important;",
          "  font-size: 10px !important;",
          "  background: rgba(90, 90, 90, 0.85) !important;",
          "}",
          ".leaflet-control-attribution.tomtom-open::before { content: none; }",
          // 2026.10's MapLibre puts its markers inside the canvas container,
          // whose cursor is the map's own grabbing hand; Leaflet gave a
          // marker the pointing one, and a report one can click should keep
          // it. The host passes the cursor down into the marker's shadow.
          ".maplibregl-marker, .maplibregl-marker ha-entity-marker { cursor: pointer !important; }",
          // A click on a bubble zooms the map in to the reports in it - the
          // map's own doing, and what the discs did before 2026.10. The map
          // listens for it on the bubble, but each symbol in the bubble is
          // a marker with a click of its own, which opens that report's
          // details and goes no further - so a tap that lands on a symbol,
          // which is most of a bubble, never zoomed. While the bubble is
          // closed (the map marks it as a button) its symbols let the click
          // through to it; once the map has opened it into a group, because
          // zooming could not part them, each symbol is a target again.
          '.cluster-marker[role="button"] .cluster-bubble ha-entity-marker { pointer-events: none !important; }',
          CLUSTER_CSS,
          // The soft edge, drawn inside the map itself. Leaflet stacks its
          // drawing panes up to 700 and puts its buttons at 1000, so a layer
          // at 800 fades the tiles and the markers and leaves every button
          // and the credit untouched - which is why nothing has to be moved
          // out of the way. Two gradients, one per axis: each is the card's
          // own colour at its edges and clear in between, so together they
          // draw a 20px frame that thickens into the corners.
          this._config.map_fade === false
            ? ""
            : [
                // Leaflet stacks its buttons at 1000; MapLibre puts its
                // controls at 2 and everything it draws below, so the frame
                // goes to 1 there - over the map and the markers, under the
                // buttons, the same place as on Leaflet.
                ".leaflet-container::after, #map.maplibregl-map::after {",
                '  content: "";',
                "  position: absolute;",
                "  inset: 0;",
                "  pointer-events: none;",
                "  z-index: 800;",
                "  background:",
                "    linear-gradient(to bottom, " + FADE + " 0, transparent 20px,",
                "      transparent calc(100% - 20px), " + FADE + " 100%),",
                "    linear-gradient(to right, " + FADE + " 0, transparent 20px,",
                "      transparent calc(100% - 20px), " + FADE + " 100%);",
                "}",
                "#map.maplibregl-map::after { z-index: 1; }",
              ].join("\n"),
        ].join("\n");
        if (sheet.textContent !== css) sheet.textContent = css;
        for (const [name, value] of Object.entries(clusterVars(this._config))) {
          if (value) card.style.setProperty(name, value);
          else card.style.removeProperty(name);
        }

        // The map card draws itself as a card: a hairline border and a filled
        // background, on the ha-card inside its own shadow root - which this
        // card's stylesheet cannot reach. It has always been there; the mask
        // that used to make the soft edge simply faded it away with
        // everything else. Now that the fade is drawn inside the map, the
        // frame stands around it, so it has to go explicitly - a map melting
        // into the card cannot have a line drawn round it.
        let cardSheet = card.shadowRoot.querySelector("style[data-tomtom-chrome]");
        if (!cardSheet) {
          cardSheet = document.createElement("style");
          cardSheet.dataset.tomtomChrome = "";
          card.shadowRoot.appendChild(cardSheet);
        }
        const cardCss = this._config.map_fade === false
          ? ""
          : "ha-card { border: none !important; background: none !important; box-shadow: none !important; }";
        if (cardSheet.textContent !== cardCss) cardSheet.textContent = cardCss;

        const credit = haMap.shadowRoot.querySelector(".leaflet-control-attribution");
        if (credit && !credit.dataset.tomtomWired) {
          credit.dataset.tomtomWired = "1";
          credit.setAttribute("role", "button");
          credit.tabIndex = 0;
          credit.title = credit.textContent.trim();
          const toggle = (ev) => {
            // A click on one of the links inside is meant for the link.
            if (ev.target && ev.target.closest && ev.target.closest("a")) return;
            ev.preventDefault();
            ev.stopPropagation();
            credit.classList.toggle("tomtom-open");
          };
          credit.addEventListener("click", toggle);
          for (const link of credit.querySelectorAll("a")) {
            link.target = "_blank";
            link.rel = "noopener noreferrer";
          }
          credit.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") toggle(ev);
          });
        }
      } catch (err) {
        // The map's internals are not ours to rely on.
      }
    }

    // Also what each marker shows. A TomTom report has no picture of its
    // own, and Home Assistant then writes the name's initials on the disc;
    // the kind's symbol goes on it instead, in the colour its band is
    // drawn in. Appended beside the initials rather than in their place -
    // the text is the map's own, managed by its renderer - and the initials
    // are hidden by the stylesheet. Markers are rebuilt on every pan, and
    // the observer brings this back each time.
    _styleMarkers(card = this._map) {
      const css = markerCss(this._config) + MARKER_ICON_CSS;
      try {
        const haMap = card && card.shadowRoot
          ? card.shadowRoot.querySelector("ha-map")
          : null;
        if (!haMap || !haMap.shadowRoot) return;
        for (const marker of haMap.shadowRoot.querySelectorAll("ha-entity-marker")) {
          const root = marker.shadowRoot;
          if (!root) continue;
          let sheet = root.querySelector("style[data-tomtom]");
          if (!sheet) {
            sheet = document.createElement("style");
            sheet.dataset.tomtom = "";
            root.appendChild(sheet);
          }
          if (sheet.textContent !== css) sheet.textContent = css;
          // On its point, unless it is one of a bubble's - those the bubble
          // lays out, and the bubble as a whole is put on its point instead.
          const own = !marker.closest(".cluster-marker");
          if (marker.hasAttribute("tomtom-point") !== own) marker.toggleAttribute("tomtom-point", own);
          const id = marker.entityId || marker.getAttribute("entity-id");
          const state = id && this._hass && this._hass.states[id];
          const disc = root.querySelector(".marker");
          if (!disc || !state || !state.attributes.icon) continue;
          if (disc.querySelector("ha-icon, img, .entity-picture")) continue;
          const color = kindColor(state.attributes.type);
          const icon = document.createElement("ha-icon");
          icon.setAttribute("icon", state.attributes.icon);
          icon.className = "tomtom-marker-icon";
          icon.style.color = color;
          disc.appendChild(icon);
        }
      } catch (err) {
        // The map's internals are not ours to rely on.
      }
    }

    // The disc in place of 2026.10's bubble, when asked for. The bubble
    // stays the map's element - its click still zooms - and is only drawn
    // differently: its symbols and tail hidden, and the count put on it as
    // generated content, from a number worked out here. The map writes the
    // bubble's size and anchor for the symbols it holds, so the disc is
    // placed on the anchor point itself, not in the box - see CLUSTER_CSS.
    // Only a closed bubble: one the map has opened into a group, because
    // zooming could not part its reports, lists them, and that is what it
    // is for.
    _styleClusters(card = this._map) {
      try {
        const haMap = card && card.shadowRoot
          ? card.shadowRoot.querySelector("ha-map")
          : null;
        if (!haMap || !haMap.shadowRoot) return;
        const disc = this._config.cluster_style === "disc";
        for (const bubble of haMap.shadowRoot.querySelectorAll(".cluster-marker")) {
          const closed = bubble.getAttribute("role") !== "group";
          if (!disc || !closed) {
            bubble.classList.remove("tomtom-disc");
            delete bubble.dataset.tomtomCount;
            continue;
          }
          const shown = bubble.querySelectorAll("ha-entity-marker").length;
          const more = bubble.querySelector(".more");
          // "+N" for the rest, or "99+" once the map stops counting.
          const rest = more ? parseInt(more.textContent.replace(/[^0-9]/g, ""), 10) || 0 : 0;
          const capped = !!more && /\+$/.test(more.textContent.trim());
          bubble.dataset.tomtomCount = String(shown + rest) + (capped ? "+" : "");
          bubble.classList.add("tomtom-disc");
        }
      } catch (err) {
        // The map's internals are not ours to rely on.
      }
    }

    // Markers are rebuilt whenever the map pans, zooms or reclusters, so the
    // styling has to follow rather than being applied once.
    _watchMarkers(card = this._map, slot = "_markerObserver", attempt = 0) {
      if (this[slot]) return;
      const haMap = card && card.shadowRoot ? card.shadowRoot.querySelector("ha-map") : null;
      if (!haMap || !haMap.shadowRoot) {
        if (attempt < 10) window.setTimeout(() => this._watchMarkers(card, slot, attempt + 1), 300);
        return;
      }
      try {
        this[slot] = new MutationObserver(() => this._styleMap(card));
        this[slot].observe(haMap.shadowRoot, { childList: true, subtree: true });
        this._styleMap(card);
      } catch (err) {
        this[slot] = undefined;
      }
    }

    _unwatchMarkers() {
      if (this._markerObserver) {
        try {
          this._markerObserver.disconnect();
        } catch (err) {
          // Already gone with the map it was watching.
        }
      }
      this._markerObserver = undefined;
    }

    // The card's one grip on the embedded map: its Leaflet instance, to aim
    // and to be told where it is looking, and the clicks that land on it.
    //
    // `ha-map`'s Leaflet instance is not a documented interface - Home
    // Assistant can rearrange it at any time. Everything here is therefore
    // guarded: if it cannot be reached, the card simply keeps behaving as it
    // does without these options, rather than breaking.
    _attachMap() {
      if (!this._wantsMap || !this._map) return;
      this._detachMap();
      const map = this._map;
      const tryAttach = (attempt) => {
        // The map this was started for may have been replaced meanwhile.
        if (this._map !== map || this._handles) return;
        const haMap = map.shadowRoot ? map.shadowRoot.querySelector("ha-map") : null;
        const h = mapHandles(haMap);
        if (!h) {
          // 2026.10 loads its engine in a chunk of its own, after the map
          // element is there - a dozen seconds on a slow box, and longer
          // right after a restart. Quick for the first dozen seconds, then
          // every two, for as long as this map stands: nothing else asks
          // again, since the card only redraws when its data changes.
          window.setTimeout(() => tryAttach(attempt + 1), attempt < 40 ? 300 : 2000);
          return;
        }
        this._handles = h;
        this._haMap = haMap;
        this._syncScale("main");
        this._paintRoute();
        this._paintArea();
        this._paintLines();
        this._fitScope();
        this._scheduleTraffic("main");

        // A click on a report picks its entry out of the list. The marker's
        // own handler opens Home Assistant's details dialog, which would
        // cover the very list the highlight is in, so for our own reports
        // the click is caught on the way down and stopped there. Not inside
        // one of 2026.10's closed cluster bubbles, though: a tap there zooms
        // the map in, and that is the map's to handle (its symbols pass the
        // click on - see the stylesheet). In a bubble the map has opened
        // into a group, each symbol is a report of ours again.
        this._onMarkerClick = (ev) => {
          if (this._config.map_highlight === false) return;
          const marker = ev.composedPath().find((n) => n && n.tagName === "HA-ENTITY-MARKER");
          const id = marker && (marker.entityId || marker.getAttribute("entity-id"));
          if (!id || !(this._allRows || []).some((r) => r.entityId === id)) return;
          const bubble = marker.closest && marker.closest(".cluster-marker");
          if (bubble && bubble.getAttribute("role") !== "group") return;
          ev.stopPropagation();
          ev.preventDefault();
          this._highlight = this._highlight === id ? null : id;
          this._render();
        };
        try {
          haMap.shadowRoot.addEventListener("click", this._onMarkerClick, true);
        } catch (err) {
          this._onMarkerClick = undefined;
        }
        // A click on the bare map only ever means "somewhere else" - which
        // is what lets the highlight go. Leaflet keeps a marker's click to
        // itself; 2026.10's ha-map says so itself, as map-clicked.
        this._onMapClick = () => {
          if (!this._highlight) return;
          this._highlight = null;
          this._render();
        };
        if (h.kind === "leaflet") h.on("click", this._onMapClick);
        else haMap.addEventListener("map-clicked", this._onMapClick);

        // The viewport itself is only listened to when something reads it:
        // the list following the map, or distances measured from its centre.
        if (!this._watchesMap) return;
        // MapLibre's resize() fires moveend synchronously, moved or not
        // (Leaflet's invalidateSize never did), and a redraw of this card
        // can resize the map - the head gaining a badge is enough. Redrawn
        // straight from here, that was a loop: redraw -> resize -> moveend
        // -> redraw, until the stack ran out. So only a view that actually
        // changed counts, and the redraw it earns runs on its own turn.
        this._onMove = () => {
          let sig = "";
          try {
            // What _inBounds asks of it, answered by whichever map this is.
            this._bounds = { contains: (point) => h.contains(point[0], point[1]) };
            this._mapCentre = h.centre();
            const zoom = h.zoom();
            sig = this._mapCentre
              ? `${this._mapCentre.lat.toFixed(5)},${this._mapCentre.lon.toFixed(5)},${zoom}`
              : "";
          } catch (err) {
            this._bounds = undefined;
            this._mapCentre = undefined;
          }
          if (sig === this._viewSig) return;
          this._viewSig = sig;
          this._scheduleTraffic("main");
          if (this._moveRender) return;
          this._moveRender = window.setTimeout(() => {
            this._moveRender = undefined;
            this._render();
          }, 0);
        };
        h.on("moveend", this._onMove);
        h.on("zoomend", this._onMove);
        this._onMove();
      };
      tryAttach(0);
    }

    // An area's route, if it has one. Asked of the integration again only
    // when the area's total sensor changed - which is also what an edited
    // entry does when it reloads, the one moment its route can change.
    _routeFor(areaId) {
      const device = this._hass && this._hass.devices && this._hass.devices[areaId];
      const entryId = device && (device.config_entries || [])[0];
      if (!entryId || !this._hass.callWS) return Promise.resolve(null);
      const sensor = totalSensor(this._hass, areaId);
      // A live route is asked for again whenever it last became a different
      // one, which the sensor says - its count can stay the same meanwhile.
      const sig = entryId + "|" + (sensor ? sensor.last_changed : "") + "|" + ((sensor && sensor.attributes.route_changed) || "");
      if (this._routeAsked !== sig) {
        this._routeAsked = sig;
        this._routePromise = this._hass
          .callWS({ type: "tomtom/route", config_entry_id: entryId })
          .then(
            (answer) => {
              // What an area entry searches instead of a route: its circle,
              // or the tracker it follows - for a map with nothing on it.
              this._areaShape = answer && !routeSig(answer) && answer.radius ? answer : null;
              return answer && routeSig(answer) ? answer : null;
            },
            // An older integration without the command, or no connection.
            () => {
              this._areaShape = null;
              return null;
            }
          );
      }
      return this._routePromise;
    }

    _entryIdFor(areaId) {
      const device = this._hass && this._hass.devices && this._hass.devices[areaId];
      return device ? (device.config_entries || [])[0] : undefined;
    }

    // ---- the traffic flow, fetched for the view while it is on screen -----
    //
    // Two maps can show it, the card's own and the pop-up's, each with a
    // layer, a timer and a memory of what it last asked for; "slot" names
    // which. Nothing here polls: a view is asked for once it has settled
    // after a move, again every few minutes while the card stays visible,
    // and not at all while the tab is hidden or the card is off the page.
    // Per map: the card's own, or the pop-up's - the minimal format has no
    // map of its own, and its pop-up's must not be judged by that.
    _trafficWanted(slot = "main") {
      return this._trafficOffered(slot) && this._trafficShown !== false;
    }

    // Whether the traffic flow is on offer at all: the option on - which
    // it is unless switched off - and a map that can draw it. Its switch
    // is drawn then, under the area dropdown; _trafficShown is that
    // switch, undefined until it is touched.
    _trafficOffered(slot = "main") {
      const hasMap = slot === "pop" ? this._config.show_map !== false : this._wantsMap;
      return this._config.map_traffic !== false && hasMap;
    }

    // The traffic flow's button, as the one cell of the head's grid under
    // the dropdown.
    _trafficCells(str, slot = "main") {
      if (!this._trafficOffered(slot) || this._config.show_traffic_switch === false) return [];
      const on = this._trafficShown !== false;
      return [trafficButtonHtml("traffic-switch", str.trafficLine, on, this._config, str.trafficSwitch)];
    }

    // The pop-up's line: the same button.
    _trafficLineHtml(str, slot = "main") {
      const cells = this._trafficCells(str, slot);
      return cells.length ? `<div class="traffic-line">${cells.join("")}</div>` : "";
    }

    // The line's button, wherever the line was drawn.
    _bindTrafficLine(root, slot) {
      const trafficSwitch = root.querySelector('[data-what="traffic-switch"]');
      if (trafficSwitch) {
        trafficSwitch.addEventListener("click", () => {
          this._trafficShown = trafficSwitch.getAttribute("aria-pressed") !== "true";
          this._syncTrafficSwitch();
          if (slot === "pop") this._fillPopTrafficLine();
          else this._render();
        });
      }
    }

    // The pop-up's line, drawn whenever the pop-up is filled and whenever
    // its switch is turned.
    _fillPopTrafficLine() {
      const box = this._popEl && this._popEl.querySelector(".pop-traffic");
      if (!box || !this._hass) return;
      box.innerHTML = this._trafficLineHtml(t(this._hass), "pop");
      box.hidden = !box.firstElementChild;
      this._bindTrafficLine(box, "pop");
    }

    // The scale bar on one of the maps, as the option says: drawn once the
    // map's handles are there, taken away when the option goes off, and
    // left alone otherwise - a redraw of the card must not blink it.
    _syncScale(slot = "main") {
      const handles = slot === "pop" ? "_popHandles" : "_handles";
      const bar = slot === "pop" ? "_popScale" : "_scale";
      const h = this[handles];
      const wanted = !!h && this._config.map_scale !== false;
      if (this[bar] && !wanted) {
        this[bar].remove();
        this[bar] = undefined;
      }
      if (wanted && !this[bar]) {
        const imperial =
          !!this._hass && !!this._hass.config && !!this._hass.config.unit_system &&
          this._hass.config.unit_system.length === "mi";
        this[bar] = scaleBar(h, imperial);
      }
    }

    _trafficSlot(slot) {
      return slot === "pop"
        ? { handles: "_popHandles", layer: "_popTrafficLayer", debounce: "_popTrafficDebounce", last: "_popTrafficLast" }
        : { handles: "_handles", layer: "_trafficLayer", debounce: "_trafficDebounce", last: "_trafficLast" };
    }

    // The tiles' colouring and opacity, from Layout -> Map.
    _trafficStyle() {
      const style = String(this._config.traffic_style || "");
      const opacity = Number(this._config.traffic_opacity);
      return {
        style: TRAFFIC_STYLES.includes(style) ? style : "relative0",
        opacity: Number.isFinite(opacity) ? Math.max(0.1, Math.min(1, opacity / 100)) : 0.7,
      };
    }

    // A changed colouring or opacity is laid onto whichever maps carry the
    // flow: the layer is handed the new look straight away.
    _restyleTraffic() {
      for (const slot of ["main", "pop"]) {
        const keys = this._trafficSlot(slot);
        if (!this[keys.layer]) continue;
        this._askTraffic(slot, true);
      }
    }

    _scheduleTraffic(slot) {
      const keys = this._trafficSlot(slot);
      if (!this._trafficWanted(slot)) {
        this._clearTraffic(slot);
        return;
      }
      window.clearTimeout(this[keys.debounce]);
      this[keys.debounce] = window.setTimeout(() => {
        this[keys.debounce] = undefined;
        this._askTraffic(slot);
      }, TRAFFIC_DEBOUNCE_MS);
    }

    // The button was pressed while the map stands: on asks, off clears.
    _syncTrafficSwitch() {
      const main = this._trafficWanted("main");
      if (main !== this._trafficOn) {
        this._trafficOn = main;
        this._scheduleTraffic("main");
      }
      if (this._popHandles) {
        const pop = this._trafficWanted("pop");
        if (pop !== this._popTrafficOn) {
          this._popTrafficOn = pop;
          this._scheduleTraffic("pop");
        }
      }
    }

    // The stamp the flow's tiles are fetched under: the moment the entry
    // last polled TomTom. The flow is as old as the reports beside it,
    // and fetched again when they are - with the poll, not on a clock of
    // its own. An entry that has not polled yet gets the moment of asking.
    _trafficStamp() {
      const sensor = this._hass && totalSensor(this._hass, this._areaId());
      const at = sensor && Date.parse(sensor.attributes.last_update);
      return Number.isFinite(at) ? at : Date.now();
    }

    // Lays the flow over one map, or refreshes it: the layer is handed the
    // tile URL with the entry's stamp, and the engine fetches the tiles of
    // the view it shows. The same stamp on the same layer is left alone -
    // a move fetches the tiles it uncovers by itself - unless a changed
    // look asks for a fresh pass whatever the stamp.
    async _askTraffic(slot, refresh = false) {
      const keys = this._trafficSlot(slot);
      const h = this[keys.handles];
      if (!h || !this._trafficWanted(slot) || !this.isConnected) return;
      if (document.visibilityState === "hidden") return;
      if (!this._hass || !this._hass.callWS) return;
      const answer = await flowTemplate(this._hass);
      if (!answer || !this._trafficWanted(slot) || this[keys.handles] !== h) return;
      const stamp = this._trafficStamp();
      const look = this._trafficStyle();
      const url = flowUrl(answer.template, look.style, stamp, this._entryIdFor(this._areaId()));
      // The same URL on a standing layer is left alone: the same poll,
      // the same look, and the same token. Any of the three changing -
      // the token with a restart of Home Assistant - sets it afresh.
      const last = this[keys.last];
      if (!refresh && last && this[keys.layer] && last.url === url) return;
      if (!this[keys.layer]) {
        try {
          this[keys.layer] = h.traffic();
        } catch (err) {
          return;
        }
      }
      this[keys.last] = { stamp, url };
      try {
        this[keys.layer].set(this[keys.last].url, look.opacity);
      } catch (err) {
        // The map went away underneath.
      }
    }

    _dropTrafficLayer(slot) {
      const keys = this._trafficSlot(slot);
      if (this[keys.layer]) {
        try {
          this[keys.layer].remove();
        } catch (err) {
          // Its map is already gone.
        }
        this[keys.layer] = undefined;
      }
    }

    _clearTraffic(slot) {
      const keys = this._trafficSlot(slot);
      window.clearTimeout(this[keys.debounce]);
      this[keys.debounce] = undefined;
      this[keys.last] = undefined;
      this._dropTrafficLayer(slot);
    }

    // ---- the planner -----------------------------------------------------
    //
    // "+ New route" in the dropdown opens it: a bar under the head with a
    // row per place - start, any stops, destination - each named as an
    // entity's position, a zone, the map's centre or an address TomTom
    // suggests while it is typed. "Calculate" asks the integration for
    // the route right now and draws it on the map in orange; "Save as
    // route" makes an entry of it with the defaults under TomTom Settings.

    _areaOptions(areas, str) {
      const options = areas.map((a) => ({ value: a.id, label: a.name }));
      if (this._config.show_planner !== false && this._layout !== "minimal") {
        options.push({ value: PLAN_VALUE, label: str.planNew, accent: true });
      }
      return options;
    }

    _newPlace(role) {
      return { role, kind: "address", entity: "", text: "", lat: null, lon: null, label: "", suggestions: [] };
    }

    async _openPlanner() {
      if (this._planner) return;
      const start = this._newPlace("start");
      // The start the defaults under TomTom Settings name, where its
      // entity has a position right now.
      try {
        const answer = await flowTemplate(this._hass);
        const entity = answer && answer.default_start;
        const state = entity && this._hass.states[entity];
        if (state && Number.isFinite(Number(state.attributes.latitude))) {
          start.kind = entity.startsWith("zone.") ? "zone" : "entity";
          this._placeFromEntity(start, entity);
        }
      } catch (err) {
        // No defaults to read: the start is typed.
      }
      this._planner = { rows: [start, this._newPlace("destination")], route: null, name: "", busy: false, error: "", notice: "" };
      this._render();
    }

    _closePlanner() {
      this._planner = null;
      this._planFitted = undefined;
      // The map was fitted to the planned route; the entry's own - its
      // route, its circle or its markers - is fitted again once the planner
      // is gone.
      this._routeFitted = undefined;
      this._mapFitted = false;
      this._fittedScope = undefined;
      this._paintPlan();
      this._render();
    }

    _placeFromEntity(place, entityId) {
      const state = this._hass && this._hass.states[entityId];
      const lat = state && Number(state.attributes.latitude);
      const lon = state && Number(state.attributes.longitude);
      place.entity = entityId;
      if (state && Number.isFinite(lat) && Number.isFinite(lon)) {
        place.lat = lat;
        place.lon = lon;
        place.label = state.attributes.friendly_name || entityId;
      } else {
        place.lat = null;
        place.lon = null;
        place.label = "";
      }
    }

    // The entities a place can be: zones, and whatever else carries a
    // position right now - a person, a tracker.
    _placeEntities(kind) {
      const out = [];
      for (const [id, state] of Object.entries(this._hass.states)) {
        const domain = id.split(".")[0];
        if (kind === "zone" ? domain !== "zone" : !["person", "device_tracker", "zone"].includes(domain)) continue;
        if (!Number.isFinite(Number(state.attributes.latitude)) || !Number.isFinite(Number(state.attributes.longitude))) continue;
        out.push({ value: id, label: state.attributes.friendly_name || id });
      }
      return out.sort((a, b) => a.label.localeCompare(b.label));
    }

    _placeForServer(place) {
      return {
        kind: place.kind === "map" ? "point" : place.kind,
        label: place.label,
        latitude: place.lat,
        longitude: place.lon,
        ...(place.entity ? { entity_id: place.entity } : {}),
        ...(place.kind === "zone" && place.entity ? { zone: place.entity } : {}),
        ...(place.kind === "address" ? { address: place.text || place.label } : {}),
      };
    }

    _renderPlanner(str, areas) {
      const el = this._plannerEl;
      if (!el) return;
      const plan = this._planner;
      if (!plan || this._layout === "minimal" || !areas.length) {
        el.hidden = true;
        el.innerHTML = "";
        this._crosshair(false);
        this._syncSide();
        return;
      }
      el.hidden = false;
      // Saving makes a config entry, which Home Assistant leaves to its
      // administrators - so does the integration, and the button is theirs.
      const canSave = !!(this._hass && this._hass.user && this._hass.user.is_admin);
      const rows = plan.rows.map((place, i) => this._planRowHtml(str, place, i, plan.rows.length)).join("");
      const route = plan.route;
      // The time as the head says it - hours and minutes, the traffic's
      // share in words - not the subtitle line's short form.
      const planDelay = route ? Math.round((route.delay || 0) / 60) : 0;
      const planLevel = this._delayLevel(planDelay);
      const planLevelColor = this._config[`delay_${planLevel}_color`];
      const preview = route
        ? `<div class="plan-preview">
             <span class="plan-time">${escapeHtml(str.travelTime(Math.round(route.duration / 60)))}</span>
             <span class="plan-facts"><span class="delay-line level-${planLevel}"${planLevelColor ? ` style="color: ${escapeHtml(planLevelColor)}"` : ""}>${escapeHtml(planDelay > 0 ? str.liveDelay(str.delaySum(planDelay)) : str.liveFree)}</span> · ${escapeHtml(this._routeLength((route.distance || 0) / 1000))} · ${escapeHtml(str.planReports(Array.isArray(route.reports) ? route.reports.length : route.reports || 0))}</span>
           </div>${canSave
             ? `<div class="plan-row plan-name">
             <label class="plan-role">${escapeHtml(str.planName)}</label>
             <input type="text" data-plan="name" value="${escapeHtml(plan.name)}">
           </div>`
             : ""}`
        : "";
      el.innerHTML = `
        <div class="plan-head">
          <span class="plan-title">${escapeHtml(str.planTitle)}</span>
          <button type="button" class="plan-icon" data-plan="swap" title="${escapeHtml(str.planSwap)}">⇅</button>
          <button type="button" class="plan-icon" data-plan="discard" title="${escapeHtml(str.planDiscard)}">✕</button>
        </div>
        ${rows}
        <div class="plan-actions">
          <button type="button" class="plan-btn ghost" data-plan="add"${plan.rows.length >= PLAN_MAX_PLACES ? " disabled" : ""}>${escapeHtml(str.planAddStop)}</button>
          <button type="button" class="plan-btn" data-plan="calc"${plan.busy ? " disabled" : ""}>${escapeHtml(plan.busy ? str.planBusy : str.planCalculate)}</button>
        </div>
        ${preview}
        ${route ? `<div class="plan-actions">${canSave ? `<button type="button" class="plan-btn" data-plan="save"${plan.busy ? " disabled" : ""}>${escapeHtml(str.planSave)}</button>` : ""}<button type="button" class="plan-btn ghost" data-plan="discard">${escapeHtml(str.planDiscard)}</button></div>` : ""}
        ${plan.error ? `<div class="plan-error">${escapeHtml(plan.error)}</div>` : ""}
        ${plan.notice ? `<div class="plan-notice">${escapeHtml(plan.notice)}</div>` : ""}`;
      this._dressPlanner(el);
      if (!el.dataset.bound) {
        el.dataset.bound = "1";
        this._bindPlanner(el);
      }
      // The crosshair while a place is to be taken off the map - until the
      // route is calculated, which is when the map shows that route instead.
      // A change to any place takes the route away again, and the crosshair
      // comes back with it.
      this._crosshair(!plan.route && plan.rows.some((p) => p.kind === "map"));
      this._syncSide();
    }

    // The column beside the map stands while the list or, in landscape, the
    // planner is in it.
    _syncSide() {
      if (!this._sideEl) return;
      const plannerHere = this._plannerEl && this._plannerEl.parentNode === this._sideEl && !this._plannerEl.hidden;
      this._sideEl.hidden = this._listEl.hidden && !plannerHere;
    }

    _planRowHtml(str, place, i, count) {
      const role = i === 0 ? str.planStart : i === count - 1 ? str.planDestination : str.planStop(i);
      const kinds = [
        ["entity", str.planKindEntity], ["zone", str.planKindZone], ["map", str.planKindMap], ["address", str.planKindAddress],
      ];
      const kindSelect = `<select data-plan="kind" data-row="${i}">${kinds
        .map(([v, l]) => `<option value="${v}"${place.kind === v ? " selected" : ""}>${escapeHtml(l)}</option>`)
        .join("")}</select>`;
      let input;
      if (place.kind === "entity" || place.kind === "zone") {
        const entities = this._placeEntities(place.kind);
        input = entities.length
          ? `<select data-plan="entity" data-row="${i}"><option value=""${place.entity ? "" : " selected"}>${escapeHtml(str.planChoose)}</option>${entities
              .map((e) => `<option value="${escapeHtml(e.value)}"${e.value === place.entity ? " selected" : ""}>${escapeHtml(e.label)}</option>`)
              .join("")}</select>`
          : `<span class="plan-val muted">${escapeHtml(str.planNoEntity)}</span>`;
      } else if (place.kind === "map") {
        input = `<button type="button" class="plan-btn ghost" data-plan="centre" data-row="${i}">${escapeHtml(str.planUseCentre)}</button>
                 <span class="plan-val${place.label ? "" : " muted"}">${escapeHtml(place.label || str.planCentreHint)}</span>`;
      } else {
        const sugg = place.suggestions.length
          ? `<div class="plan-sugg">${place.suggestions
              .map((s, j) => `<button type="button" data-plan="pick" data-row="${i}" data-pick="${j}">${escapeHtml(s.label)}</button>`)
              .join("")}</div>`
          : "";
        input = `<div class="plan-addr"><input type="text" data-plan="address" data-row="${i}" placeholder="${escapeHtml(str.planAddress)}" value="${escapeHtml(place.text)}" autocomplete="off">${sugg}</div>`;
      }
      const remove = i > 0 && i < count - 1
        ? `<button type="button" class="plan-icon" data-plan="remove" data-row="${i}" title="${escapeHtml(str.planRemove)}">✕</button>`
        : `<span class="plan-icon-gap"></span>`;
      const done = Number.isFinite(place.lat) ? " done" : "";
      return `<div class="plan-row${done}" data-row="${i}"><span class="plan-role">${escapeHtml(role)}</span>${kindSelect}<div class="plan-input">${input}</div>${remove}</div>`;
    }

    // Bound once, to the element that outlives every redraw; what they
    // act on is read when the event comes.
    _bindPlanner(el) {
      const rowOf = (target) => this._planner && this._planner.rows[Number(target.dataset.row)];
      const clear = (place) => {
        place.entity = "";
        place.lat = null;
        place.lon = null;
        place.label = "";
        place.suggestions = [];
      };
      el.addEventListener("change", (ev) => {
        const plan = this._planner;
        const target = ev.target;
        const what = target.dataset.plan;
        if (!plan || !what) return;
        if (what === "kind") {
          const place = rowOf(target);
          place.kind = target.value;
          clear(place);
          this._planChanged();
        } else if (what === "entity") {
          const place = rowOf(target);
          if (target.value) this._placeFromEntity(place, target.value);
          else clear(place);
          this._planChanged();
        } else if (what === "name") {
          plan.name = target.value;
        }
      });
      el.addEventListener("input", (ev) => {
        const plan = this._planner;
        const target = ev.target;
        if (!plan) return;
        if (target.dataset.plan === "address") {
          const place = rowOf(target);
          place.text = target.value;
          place.lat = null;
          place.lon = null;
          place.label = "";
          this._planSuggest(place, Number(target.dataset.row));
        } else if (target.dataset.plan === "name") {
          plan.name = target.value;
        }
      });
      el.addEventListener("keydown", (ev) => {
        const target = ev.target;
        if (this._planner && target.dataset.plan === "address" && ev.key === "Enter") {
          ev.preventDefault();
          const place = rowOf(target);
          if (place.suggestions.length) this._planPick(place, 0);
        }
      });
      el.addEventListener("click", (ev) => {
        const plan = this._planner;
        const target = ev.target.closest("[data-plan]");
        if (!plan || !target) return;
        const what = target.dataset.plan;
        const str = t(this._hass);
        if (what === "swap") {
          plan.rows.reverse();
          this._planChanged();
        } else if (what === "discard") {
          this._closePlanner();
        } else if (what === "add") {
          if (plan.rows.length < PLAN_MAX_PLACES) {
            plan.rows.splice(plan.rows.length - 1, 0, this._newPlace("stop"));
            this._planChanged();
          }
        } else if (what === "remove") {
          plan.rows.splice(Number(target.dataset.row), 1);
          this._planChanged();
        } else if (what === "centre") {
          const place = rowOf(target);
          const c = this._handles && this._handles.centre();
          if (place && c) {
            place.lat = c.lat;
            place.lon = c.lon;
            place.label = `${c.lat.toFixed(4)}, ${c.lon.toFixed(4)}`;
            this._planChanged();
          }
        } else if (what === "pick") {
          this._planPick(rowOf(target), Number(target.dataset.pick));
        } else if (what === "calc") {
          this._planCalculate(str);
        } else if (what === "save") {
          this._planSave(str);
        }
      });
    }

    // A change of the places takes the preview with it: a route that was
    // worked out for other places says nothing about these.
    _planChanged() {
      const plan = this._planner;
      const hadRoute = !!plan.route;
      plan.route = null;
      plan.error = "";
      plan.notice = "";
      this._paintPlan();
      // The preview's reports go with the preview; the entry's come back.
      if (hadRoute) this._render();
      else this._renderPlanner(t(this._hass), tomtomAreas(this._hass, this._config.areas));
    }

    _planSuggest(place, row) {
      window.clearTimeout(this._planSuggestTimer);
      const text = place.text.trim();
      if (text.length < 3) {
        place.suggestions = [];
        this._planSuggestionsOnly(row);
        return;
      }
      this._planSuggestTimer = window.setTimeout(async () => {
        try {
          const answer = await this._hass.callWS({ type: `${DOMAIN}/search`, text });
          if (place.text.trim() !== text) return;
          place.suggestions = (answer && answer.results) || [];
        } catch (err) {
          place.suggestions = [];
        }
        this._planSuggestionsOnly(row);
      }, 400);
    }

    // Only the suggestion list under one row is redrawn, so the field being
    // typed in keeps its focus and its caret.
    _planSuggestionsOnly(row) {
      const el = this._plannerEl && this._plannerEl.querySelector(`.plan-row[data-row="${row}"] .plan-addr`);
      const place = this._planner && this._planner.rows[row];
      if (!el || !place) return;
      const old = el.querySelector(".plan-sugg");
      if (old) old.remove();
      if (!place.suggestions.length) return;
      const sugg = document.createElement("div");
      sugg.className = "plan-sugg";
      sugg.innerHTML = place.suggestions
        .map((s, j) => `<button type="button" data-plan="pick" data-row="${row}" data-pick="${j}">${escapeHtml(s.label)}</button>`)
        .join("");
      el.appendChild(sugg);
    }

    _planPick(place, index) {
      const pick = place.suggestions[index];
      if (!pick) return;
      place.lat = pick.latitude;
      place.lon = pick.longitude;
      place.label = pick.label;
      place.text = pick.label;
      place.suggestions = [];
      this._planChanged();
    }

    async _planCalculate(str) {
      const plan = this._planner;
      if (!plan || plan.busy) return;
      if (!plan.rows.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))) {
        plan.error = str.planNeedPlaces;
        this._renderPlanner(str, tomtomAreas(this._hass, this._config.areas));
        return;
      }
      plan.busy = true;
      plan.error = "";
      plan.notice = "";
      this._renderPlanner(str, tomtomAreas(this._hass, this._config.areas));
      try {
        const route = await this._hass.callWS({ type: `${DOMAIN}/plan`, points: plan.rows.map((p) => this._placeForServer(p)) });
        if (this._planner !== plan) return;
        plan.route = route;
        if (!plan.name) plan.name = `${plan.rows[0].label} → ${plan.rows[plan.rows.length - 1].label}`;
      } catch (err) {
        if (this._planner !== plan) return;
        plan.error = str.planFailed((err && err.message) || String(err));
      }
      plan.busy = false;
      // The whole card, not only the planner: the preview's reports are
      // the list's and the map's now (see _render).
      this._render();
    }

    async _planSave(str) {
      const plan = this._planner;
      if (!plan || plan.busy || !plan.route) return;
      const name = (plan.name || "").trim();
      if (!name) {
        plan.error = str.planName;
        this._renderPlanner(str, tomtomAreas(this._hass, this._config.areas));
        return;
      }
      plan.busy = true;
      plan.error = "";
      this._renderPlanner(str, tomtomAreas(this._hass, this._config.areas));
      try {
        const answer = await this._hass.callWS({
          type: `${DOMAIN}/save_route`,
          name,
          start: this._placeForServer(plan.rows[0]),
          destination: this._placeForServer(plan.rows[plan.rows.length - 1]),
          vias: plan.rows.slice(1, -1).map((p) => this._placeForServer(p)),
        });
        // The new entry becomes the one the card shows once its device is
        // there - see _render, which watches for it.
        this._planWanted = answer && answer.entry_id;
        this._closePlanner();
      } catch (err) {
        if (this._planner !== plan) return;
        plan.busy = false;
        plan.error = err && err.code === "name_taken" ? str.planNameTaken : str.planFailed((err && err.message) || String(err));
        this._renderPlanner(str, tomtomAreas(this._hass, this._config.areas));
      }
    }

    // The planned route on the map, in orange beside the entry's own, fitted
    // into view once per route.
    _paintPlan() {
      removeRoute(this._planDrawn);
      this._planDrawn = undefined;
      for (const marker of this._planMarkers || []) marker.remove();
      this._planMarkers = [];
      const plan = this._planner;
      const h = this._handles;
      if (!plan || !plan.route || !h || !plan.route.points || plan.route.points.length < 2) return;
      const points = plan.route.points;
      const vias = plan.rows.slice(1, -1).filter((p) => Number.isFinite(p.lat)).map((p) => [p.lat, p.lon]);
      this._planDrawn = drawRouteWith(h, points, PLAN_COLOR, vias, this._config.route_width);
      // Its reports, drawn the way the entry's markers are styled: the bare
      // symbol in the kind's colour, on its point. No entity stands behind
      // them, so the map card cannot draw them itself.
      if (typeof h.marker === "function") {
        for (const r of plan.route.reports || []) {
          const lat = Number(r.latitude);
          const lon = Number(r.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon) || !r.icon) continue;
          const type = (r.attributes || {}).type;
          const html =
            `<ha-icon class="tomtom-plan-marker" icon="${escapeHtml(r.icon)}" ` +
            `style="--mdc-icon-size: 24px; width: 24px; height: 24px; display: block; color: ${escapeHtml(kindColor(type))}"></ha-icon>`;
          try {
            this._planMarkers.push(h.marker([lat, lon], html, 24));
          } catch (err) {
            // The map went first.
          }
        }
      }
      const sig = `${points.length}|${points[0]}|${points[points.length - 1]}`;
      if (this._planFitted !== sig) {
        this._planFitted = sig;
        this._endRouteWatch("_planSettle");
        this._planSettle = fitRouteSettled(h, points);
      }
    }

    // The planner's looks, from the Layout: the panel's fill and the
    // buttons' colour as properties on the panel, every text part's
    // colour and font inline - the way the rest of the card is dressed.
    _dressPlanner(el) {
      const config = this._config;
      el.style.background = config.planner_background_color || "";
      el.style.setProperty("--tomtom-plan-button-fill", config.plan_button_fill || "");
      const dress = (selector, prefix) => {
        for (const part of el.querySelectorAll(selector)) part.style.cssText = elementStyle(config, prefix);
      };
      dress(".plan-title", "plan_title");
      dress(".plan-role", "plan_role");
      dress(".plan-btn", "plan_button");
      dress(".plan-time", "plan_time");
      dress(".plan-facts", "plan_facts");
    }

    // The crosshair over the map's centre while a place is to be taken
    // off it.
    _crosshair(on) {
      if (!this._mapEl) return;
      let cross = this._mapEl.querySelector(".plan-cross");
      if (on && !cross) {
        cross = document.createElement("div");
        cross.className = "plan-cross";
        this._mapEl.appendChild(cross);
      } else if (!on && cross) {
        cross.remove();
      }
    }

    _paintRoute() {
      removeRoute(this._routeDrawn);
      this._routeDrawn = undefined;
      const route = this._route;
      const h = this._handles;
      this._paintPlan();
      if (!route || !h) return;
      this._routeDrawn = drawRouteWith(
        h, route.points, routeColor(this, this._config.route_color), route.vias, this._config.route_width
      );
      // Fitted once per route, not on every redraw - a pan the person made
      // stays where they put it.
      const sig = routeSig(route);
      if (this._routeFitted !== sig) {
        this._routeFitted = sig;
        this._endRouteWatch("_routeSettle");
        // The route and the reports on it: a report sits where the incident
        // begins, which can be a little off the line's own extent, and on a
        // small map that little is a pin cut off at the edge.
        const reports = (this._mapRows || [])
          .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
          .map((r) => [r.lat, r.lon]);
        this._routeSettle = fitRouteSettled(h, route.points.concat(reports));
      }
    }

    // Ends the watch that keeps the route in view after its first fit - see
    // fitRouteSettled - before the map is fitted to something else, or torn
    // down. Nothing to end is fine.
    _endRouteWatch(slot) {
      const end = this[slot];
      this[slot] = undefined;
      if (typeof end === "function") {
        try {
          end();
        } catch (err) {
          // The map went first.
        }
      }
    }

    // A badge narrows the card to what it counted - the new reports, or the
    // jams - and the map follows: switched on, it fits what is left, so the
    // one tailback the card now lists is also the one thing in view;
    // switched off, it goes back to the route, or to all of the area's
    // reports where there is no route. Only on the change itself: a pan
    // made in between stays where it was put.
    _fitScope() {
      const h = this._handles;
      if (!h) return;
      const scope = this._onlyNew ? "new" : this._onlyDelay ? "delay" : "";
      const fitted = this._fittedScope === undefined ? "" : this._fittedScope;
      if (scope === fitted) return;
      this._fittedScope = scope;
      // The map is about to be fitted on purpose; the route's own watch
      // must not pull it back.
      this._endRouteWatch("_routeSettle");
      const points = (this._mapRows || [])
        .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon))
        .map((r) => [r.lat, r.lon]);
      try {
        if (scope) {
          if (points.length) h.fit(points, { maxZoom: FOCUS_ZOOM });
        } else if (this._route) {
          h.fit(this._route.points);
        } else if (points.length) {
          h.fit(points, { maxZoom: FOCUS_ZOOM });
        } else {
          const circle = this._areaCircle();
          if (circle) h.fit(circle);
        }
      } catch (err) {
        // The map went away underneath; nothing to fit.
      }
    }

    // The circle an area entry searches, as points along its edge - from
    // the centre it was set up with, or from wherever its tracker is right
    // now. Null for a route entry, or before the integration has said.
    _areaCircle() {
      const shape = this._areaShape;
      if (!shape || !Number.isFinite(Number(shape.radius)) || Number(shape.radius) <= 0) return null;
      let lat;
      let lon;
      if (shape.tracker) {
        const state = this._hass && this._hass.states && this._hass.states[shape.tracker];
        lat = state && Number(state.attributes.latitude);
        lon = state && Number(state.attributes.longitude);
      } else if (Array.isArray(shape.center)) {
        lat = Number(shape.center[0]);
        lon = Number(shape.center[1]);
      }
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      const radius = Number(shape.radius);
      const dLat = radius / 111320;
      const dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
      const points = [];
      for (let i = 0; i <= 64; i++) {
        const t = (i / 64) * 2 * Math.PI;
        points.push([lat + dLat * Math.cos(t), lon + dLon * Math.sin(t)]);
      }
      return points;
    }

    // The area's circle on a map with nothing on it: a dashed line in the
    // route's colour, fitted into view once per area, the way a route is.
    // With reports on the map there is nothing to draw - they are what the
    // map shows, and Home Assistant fits them.
    _paintArea(h = this._handles, rows = this._mapRows, slot = "_areaDrawn", settleSlot = "_areaSettle") {
      this._removeArea(slot, settleSlot);
      if (!h || this._config.map_always === false || this._route) return;
      if ((rows || []).length) return;
      const circle = this._areaCircle();
      if (!circle) return;
      try {
        this[slot] = h.line(circle, {
          color: routeColor(this, this._config.route_color),
          width: 2,
          opacity: 0.8,
          dashed: true,
        });
        this[settleSlot] = fitRouteSettled(h, circle);
      } catch (err) {
        // The map went away underneath; nothing to draw on.
      }
    }

    _removeArea(slot, settleSlot) {
      this._endRouteWatch(settleSlot);
      if (this[slot]) {
        try {
          this[slot].remove();
        } catch (err) {
          // Its map is already gone.
        }
      }
      this[slot] = undefined;
    }

    async _paintPopRoute() {
      const h = this._popHandles;
      const route = this._config.map_route === false ? null : await this._routeFor(this._areaId());
      if (!route || !h || this._popHandles !== h) return;
      removeRoute(this._popRouteDrawn);
      this._popRouteDrawn = drawRouteWith(
        h, route.points, routeColor(this, this._config.route_color), route.vias, this._config.route_width
      );
      this._endRouteWatch("_popRouteSettle");
      this._popRouteSettle = fitRouteSettled(h, route.points);
    }

    // The stretch of road each report on the map runs along, as a band
    // under its symbol in the colour of its kind - see LINE_COLORS - and a
    // closed road striped white down the middle. Drawn for the reports the
    // map shows, so it follows every filter the symbols follow, and redrawn
    // whenever the map is attached - which is whenever that set changes.
    _paintLines(h = this._handles, rows = this._mapRows, slot = "_linesDrawn") {
      this._removeLines(slot);
      if (!h || this._config.map_lines === false) return;
      const drawn = [];
      for (const row of rows || []) {
        const attrs = row.state.attributes || {};
        const encoded = attrs.polyline;
        if (typeof encoded !== "string" || !encoded) continue;
        let points;
        try {
          points = decodePolyline(encoded);
        } catch (err) {
          continue;
        }
        if (points.length < 2) continue;
        const color = LINE_COLORS[attrs.type] || OTHER_LINE_COLOR;
        try {
          drawn.push(h.line(points, { color, width: 6, opacity: 0.8 }));
          if (attrs.type === "road_closed") {
            drawn.push(h.line(points, { color: "#ffffff", width: 2, opacity: 0.9, dashed: true }));
          }
        } catch (err) {
          // The map went away underneath; nothing to draw on.
        }
      }
      this[slot] = drawn;
    }

    _removeLines(slot) {
      for (const item of this[slot] || []) {
        try {
          item.remove();
        } catch (err) {
          // Its map is already gone.
        }
      }
      this[slot] = undefined;
    }

    _detachMap() {
      const h = this._handles;
      if (h && this._onMove) {
        try {
          h.off("moveend", this._onMove);
          h.off("zoomend", this._onMove);
        } catch (err) {
          // The map went away underneath us; nothing left to detach from.
        }
      }
      if (h && this._onMapClick) {
        try {
          if (h.kind === "leaflet") h.off("click", this._onMapClick);
          else if (this._haMap) this._haMap.removeEventListener("map-clicked", this._onMapClick);
        } catch (err) {
          // Same again - the instance is already gone.
        }
      }
      if (this._haMap && this._onMarkerClick) {
        try {
          this._haMap.shadowRoot.removeEventListener("click", this._onMarkerClick, true);
        } catch (err) {
          // Its shadow root went with it.
        }
      }
      this._endRouteWatch("_routeSettle");
      removeRoute(this._routeDrawn);
      this._routeDrawn = undefined;
      this._removeArea("_areaDrawn", "_areaSettle");
      this._removeLines("_linesDrawn");
      this._clearTraffic("main");
      if (this._moveRender) {
        window.clearTimeout(this._moveRender);
        this._moveRender = undefined;
      }
      this._viewSig = undefined;
      if (this._scale) {
        this._scale.remove();
        this._scale = undefined;
      }
      this._handles = undefined;
      this._haMap = undefined;
      this._onMove = undefined;
      this._onMapClick = undefined;
      this._onMarkerClick = undefined;
      this._mapCentre = undefined;
      this._bounds = undefined;
    }

    disconnectedCallback() {
      this._detachMap();
      this._unwatchMarkers();
      if (this._onLanguage) window.removeEventListener(LANGUAGE_EVENT, this._onLanguage);
      if (this._onVisibility) {
        document.removeEventListener("visibilitychange", this._onVisibility);
        this._onVisibility = undefined;
      }
      this._clearTraffic("pop");
    }

    // Switching between the views of a dashboard takes the card out of the
    // document and puts the same element back a moment later - so everything
    // disconnectedCallback tore out has to be hooked up again here.
    //
    // Nothing else does it: the redraw that follows finds the map card and
    // its entities unchanged and returns early. Without this the markers keep
    // Home Assistant's own ring and disc, because the observer that restyles
    // each freshly drawn one is gone; the viewport is never read again, so
    // the count goes on reporting whatever was in view before the switch;
    // and clicks on the map stop meaning anything.
    connectedCallback() {
      // A language fetched after the first draw redraws the card in it.
      if (!this._onLanguage) {
        this._onLanguage = () => {
          this._built = false;
          this._render();
        };
      }
      window.addEventListener(LANGUAGE_EVENT, this._onLanguage);
      // The traffic flow is fetched only while someone can see it: a tab
      // coming back to the front asks again, and gets fresh tiles if the
      // entry polled in the meantime.
      if (!this._onVisibility) {
        this._onVisibility = () => {
          if (document.visibilityState !== "visible") return;
          this._scheduleTraffic("main");
          if (this._popHandles) this._scheduleTraffic("pop");
        };
        document.addEventListener("visibilitychange", this._onVisibility);
      }
      // The very first insertion happens before there is a map to hook into.
      if (!this._map) return;
      this._attachMap();
      this._watchMarkers();
    }

    _renderList(str) {
      if (!this._wantsList) {
        this._listEl.innerHTML = "";
        return;
      }
      // A wording of one's own replaces both sentences: whoever writes one
      // means it to be what the card says when it has nothing to show.
      // Both switches off is not an empty area, and says so.
      const emptyText =
        this._config.no_reports_text ||
        (this._following && this._bounds && this._total ? str.nothingInView : str.nothing);
      // Folded, only the first few are drawn - the rest are not built at all
      // rather than built and hidden, so a hundred entries behind the fold
      // cost nothing until they are asked for.
      const folded = this._foldable && !this._expanded;
      const shown = folded ? this._rows.slice(0, this._foldAt) : this._rows;
      this._listEl.innerHTML =
        (this._rows.length
          ? `<div class="list${this._config.show_divider === false ? " no-divider" : ""}"
             style="${escapeHtml(dividerStyle(this._config))}">${shown
              .map((row) =>
                rowHtml(row, str, this._newRows.has(row.entityId), this._config, this._highlight === row.entityId)
              )
              .join("")}</div>`
          : `<div class="empty" style="${escapeHtml(elementStyle(this._config, "no_reports"))}">${escapeHtml(emptyText)}</div>`) +
        (this._foldable
          ? `<button type="button" class="fold" aria-expanded="${folded ? "false" : "true"}"
                     title="${escapeHtml(folded ? str.foldOpen(this._rows.length - this._foldAt) : str.foldClose)}">
               <ha-icon icon="mdi:chevron-${folded ? "down" : "up"}"></ha-icon>
             </button>`
          : "");

      const fold = this._listEl.querySelector(".fold");
      if (fold) {
        fold.addEventListener("click", () => {
          this._expanded = !this._expanded;
          this._renderList(str);
        });
      }

      this._fitIcons();

      this._listEl.querySelectorAll(".row").forEach((el) => {
        el.addEventListener("click", () => {
          // With a map to aim, that is what a click on an entry means. Where
          // there is none - or the setting is off - it opens Home Assistant's
          // own details dialog, which is what the click has always done.
          const row = (this._rows || []).find((r) => r.entityId === el.dataset.entity);
          if (this._config.center_on_click !== false && this._focusMap(row)) return;
          if (row && row.plan) return;
          this.dispatchEvent(
            new CustomEvent("hass-more-info", {
              detail: { entityId: el.dataset.entity },
              bubbles: true,
              composed: true,
            })
          );
        });
      });
    }
  }

  // ---------------------------------------------------------------- editor
  //
  // The Annuals card's editor, field for field: two collapsible super-panels,
  // three tabs each, "Allgemein" first in both. The markup and styling are
  // copied rather than reinvented so the three integrations read as one
  // product - a plain styled <input> where Annuals uses one, an HA picker only
  // where a plain input cannot do the job.
  const SUPER_GROUPS = [
    { key: "settings", icon: "mdi:tune", groups: ["general", "content", "rows"] },
    { key: "layout", icon: "mdi:view-dashboard-outline", groups: ["display", "map", "list"] },
  ];

  const GROUPS = [
    { key: "general", icon: "mdi:cog" },
    { key: "content", icon: "mdi:filter-variant" },
    // Two tabs called "Liste": what an entry says, under Settings, and how it
    // looks, under Layout. Their keys have to differ, since the key is what
    // decides which body gets built.
    { key: "rows", icon: "mdi:format-list-bulleted" },
    { key: "display", icon: "mdi:eye-outline" },
    { key: "map", icon: "mdi:map" },
    { key: "list", icon: "mdi:format-list-bulleted" },
  ];

  // Annuals' own palette, in its own order, so a colour picked in one card can
  // be named the same way in the other.
  const PRESET_COLORS = [
    { key: "default", labelKey: "presetDefault", value: "" },
    { key: "primary", labelKey: "presetPrimary", value: "var(--primary-color)" },
    { key: "accent", labelKey: "presetAccent", value: "var(--accent-color)" },
    { key: "red", labelKey: "presetRed", value: "#f44336" },
    { key: "pink", labelKey: "presetPink", value: "#e91e63" },
    { key: "purple", labelKey: "presetPurple", value: "#9c27b0" },
    { key: "deep_purple", labelKey: "presetDeepPurple", value: "#673ab7" },
    { key: "indigo", labelKey: "presetIndigo", value: "#3f51b5" },
    { key: "blue", labelKey: "presetBlue", value: "#2196f3" },
    { key: "light_blue", labelKey: "presetLightBlue", value: "#03a9f4" },
    { key: "cyan", labelKey: "presetCyan", value: "#00bcd4" },
    { key: "teal", labelKey: "presetTeal", value: "#009688" },
    { key: "green", labelKey: "presetGreen", value: "#4caf50" },
    { key: "light_green", labelKey: "presetLightGreen", value: "#8bc34a" },
    { key: "lime", labelKey: "presetLime", value: "#cddc39" },
    { key: "yellow", labelKey: "presetYellow", value: "#ffeb3b" },
    { key: "amber", labelKey: "presetAmber", value: "#ffc107" },
    { key: "orange", labelKey: "presetOrange", value: "#ff9800" },
    { key: "deep_orange", labelKey: "presetDeepOrange", value: "#ff5722" },
    { key: "brown", labelKey: "presetBrown", value: "#795548" },
    { key: "grey", labelKey: "presetGrey", value: "#9e9e9e" },
    { key: "blue_grey", labelKey: "presetBlueGrey", value: "#607d8b" },
  ];

  // Every piece of the card Layout -> General can restyle, in the order the
  // card itself reads: the empty-list line that stands in for the whole list,
  // then the head - title, its badges, and the two dropdowns and the subtitle
  // line beneath them.
  //
  // `fallback` is what each element actually renders in when nothing is set
  // (see STYLE), so a swatch previews the real theme colour rather than
  // falling back to white.
  const DESIGN_ELEMENTS = {
    title: {
      label: "edElTitle",
      help: "edElTitleHelp",
      colorHelp: "edTitleColorHelp",
      fontHelp: "edTitleFontHelp",
      fallback: "var(--primary-text-color)",
      // Nothing left to style once the title is not drawn at all. Kept in
      // the minimal format, where the pop-up wears this same title.
      hidden: (config) => config.show_title === false,
    },
    // Straight after the title: the card's other piece of fixed wording, and
    // the one it falls back to when there is nothing to list.
    no_reports: {
      label: "edElNothing",
      help: "edElNothingHelp",
      colorHelp: "edNothingColorHelp",
      fontHelp: "edNothingFontHelp",
      fallback: "var(--secondary-text-color)",
      hidden: (config) => config.layout === "minimal",
    },
    // The minimal format's own four, and the only ones it offers besides
    // the title: everything below answers for a head, a subtitle or a picker
    // that one line does not draw. Read top down the way the format is - the
    // three parts of the line, then the one thing its pop-up shows that the
    // line behind it cannot.
    mini: {
      label: "edElMiniTotal",
      help: "edElMiniTotalHelp",
      // "Colour" on its own would be the second one in this block. Named for
      // what it actually colours, and put where the rest of the type is.
      colorLabel: "edFontColor",
      colorLast: true,
      colorHelp: "edMiniTotalColorHelp",
      fontHelp: "edMiniTotalFontHelp",
      fallback: "var(--primary-text-color)",
      icon: {
        key: "mini_icon",
        label: "edSubIcon",
        help: "edMiniIconHelp",
        color: {
          key: "mini_icon_color",
          label: "edSubIconColor",
          help: "edMiniIconColorHelp",
          fallback: "var(--secondary-text-color)",
        },
        size: { key: "mini_icon_size", label: "edSubIconSize", help: "edMiniIconSizeHelp" },
      },
      // No "show background" switch in front of it: this half has a fill
      // already, and what is being set here is which one - not whether.
      // The swatch previews the card behind it, which is what one sees
      // through an empty field.
      extra: {
        key: "mini_fill_color",
        label: "edMiniBg",
        help: "edMiniBgHelp",
        fallback: "var(--ha-card-background, var(--card-background-color))",
      },
      opacity: {
        key: "mini_fill_opacity",
        label: "edMiniBgOpacity",
        help: "edMiniBgOpacityHelp",
      },
      hidden: (config) =>
        config.layout !== "minimal" || config.mini_show_total === false,
    },
    mini_new: {
      label: "edElMiniNew",
      help: "edElMiniNewHelp",
      colorLabel: "edFontColor",
      colorLast: true,
      colorHelp: "edMiniNewColorHelp",
      fontHelp: "edMiniNewFontHelp",
      // The accent the half is drawn in, so an untouched swatch shows the
      // colour that is actually there rather than a plain white.
      fallback: "var(--tomtom-new-background, var(--accent-color, #ff9800))",
      icon: {
        key: "mini_new_icon",
        label: "edSubIcon",
        help: "edMiniIconHelp",
        color: {
          key: "mini_new_icon_color",
          label: "edSubIconColor",
          help: "edMiniIconColorHelp",
          fallback: "var(--tomtom-new-background, var(--accent-color, #ff9800))",
        },
        size: { key: "mini_new_icon_size", label: "edSubIconSize", help: "edMiniIconSizeHelp" },
      },
      extra: {
        key: "mini_new_fill_color",
        label: "edMiniBg",
        help: "edMiniBgHelp",
        fallback: "var(--ha-card-background, var(--card-background-color))",
      },
      opacity: {
        key: "mini_new_fill_opacity",
        label: "edMiniBgOpacity",
        help: "edMiniBgOpacityHelp",
      },
      hidden: (config) => config.layout !== "minimal" || config.show_new === false,
    },
    // And the third part, arranged like the second. Its own switch is the
    // one that draws the head's badge in the other formats: one setting for
    // what the jams cost, wherever the format puts it.
    mini_delay: {
      label: "edElMiniDelay",
      help: "edElMiniDelayHelp",
      colorLabel: "edFontColor",
      colorLast: true,
      colorHelp: "edMiniDelayColorHelp",
      fontHelp: "edMiniDelayFontHelp",
      // The red the part is drawn in, so an untouched swatch shows what is
      // actually there - the same colour the badge wears in a head.
      fallback: "var(--tomtom-delay-background, var(--error-color, #db4437))",
      icon: {
        key: "mini_delay_icon",
        label: "edSubIcon",
        help: "edMiniIconHelp",
        color: {
          key: "mini_delay_icon_color",
          label: "edSubIconColor",
          help: "edMiniIconColorHelp",
          fallback: "var(--tomtom-delay-background, var(--error-color, #db4437))",
        },
        size: { key: "mini_delay_icon_size", label: "edSubIconSize", help: "edMiniIconSizeHelp" },
      },
      extra: {
        key: "mini_delay_fill_color",
        label: "edMiniBg",
        help: "edMiniBgHelp",
        fallback: "var(--ha-card-background, var(--card-background-color))",
      },
      opacity: {
        key: "mini_delay_fill_opacity",
        label: "edMiniBgOpacity",
        help: "edMiniBgOpacityHelp",
      },
      hidden: (config) => config.layout !== "minimal" || config.show_delay === false,
    },
    pop_new: {
      label: "edElPopNew",
      help: "edElPopNewHelp",
      colorHelp: "edPopNewColorHelp",
      fontHelp: "edPopNewFontHelp",
      fallback: "var(--tomtom-new-color, #fff)",
      bgToggle: {
        key: "pop_new_background",
        label: "edPopNewBackground",
        help: "edPopNewBackgroundHelp",
      },
      extra: {
        key: "pop_new_background_color",
        label: "edPopNewBg",
        help: "edPopNewBgHelp",
        fallback: "var(--tomtom-new-background, var(--accent-color, #ff9800))",
      },
      // No list in the pop-up, no entries to tag.
      hidden: (config) =>
        config.layout !== "minimal" ||
        config.show_new === false ||
        config.show_list === false,
    },
    // The one pair with a second colour each: the pill behind them, shown
    // only while "Show background" is on - Annuals' own badge arrangement.
    new: {
      label: "edElNew",
      help: "edElNewHelp",
      colorHelp: "edNewColorHelp",
      fontHelp: "edNewFontHelp",
      fallback: "var(--tomtom-new-color, #fff)",
      bgToggle: { key: "new_background", label: "edNewBackground", help: "edNewBackgroundHelp" },
      extra: {
        key: "new_background_color",
        label: "edNewBg",
        help: "edNewBgHelp",
        fallback: "var(--tomtom-new-background, var(--accent-color, #ff9800))",
      },
      // Follows the marker itself: with the marking switched off there is no
      // NEW badge and no NEW tag to give a look to. In the minimal format
      // neither is drawn here - the pop-up's tag has an element of its own.
      hidden: (config) => config.show_new === false || config.layout === "minimal",
    },
    // Its neighbour, and the same arrangement: a colour, a pill behind it
    // and the font the two share. Its own defaults are the theme's error
    // colour, which is what a badge about lost time renders in.
    delay: {
      label: "edElDelay",
      help: "edElDelayHelp",
      colorHelp: "edDelayColorHelp",
      fontHelp: "edDelayFontHelp",
      fallback: "var(--tomtom-delay-color, #fff)",
      bgToggle: { key: "delay_background", label: "edDelayBackground", help: "edDelayBackgroundHelp" },
      extra: {
        key: "delay_background_color",
        label: "edDelayBg",
        help: "edDelayBgHelp",
        fallback: "var(--tomtom-delay-background, var(--error-color, #db4437))",
      },
      // Follows its own switch, and the format: the badge is drawn in the
      // head, which the minimal format does not have.
      hidden: (config) => config.show_delay === false || config.layout === "minimal",
    },
    // A live route's travel time, under the badges. The line under it -
    // what of it is traffic - has a block of its own straight after this
    // one, built by hand: it has thresholds and three colours.
    travel_time: {
      label: "edElTravelTime",
      help: "edElTravelTimeHelp",
      colorHelp: "edTravelTimeColorHelp",
      fontHelp: "edTravelTimeFontHelp",
      fallback: "var(--primary-text-color)",
      // Kept in the minimal format: its pop-up shows the time too.
      hidden: (config) => config.show_travel_time === false,
    },
    // Straight after the line it stands at the end of: the area's refresh,
    // and the traffic flow's with it - both are the same rounded button with
    // the time of the last fetch in it. The symbol first, then the words,
    // then the frame they sit in, the way the button reads.
    refresh: {
      label: "edElRefresh",
      help: "edElRefreshHelp",
      colorHelp: "edRefreshTextColorHelp",
      fontHelp: "edRefreshFontHelp",
      fallback: "var(--secondary-text-color)",
      icon: {
        key: "refresh_icon",
        label: "edSubIcon",
        help: "edRefreshIconHelp",
        color: {
          key: "refresh_icon_color",
          label: "edRefreshColor",
          help: "edRefreshColorHelp",
          fallback: "var(--secondary-text-color)",
        },
        size: { key: "refresh_icon_size", label: "edRefreshSize", help: "edRefreshSizeHelp" },
      },
      bgToggle: { key: "refresh_background", label: "edRefreshFrame", help: "edRefreshFrameHelp" },
      extra: {
        key: "refresh_background_color",
        label: "edRefreshBg",
        help: "edRefreshBgHelp",
        fallback: "var(--secondary-background-color)",
      },
      // Gone once the area's button is switched off.
      hidden: (config) => config.show_refresh === false,
    },
    sub: {
      label: "edElSub",
      help: "edElSubHelp",
      colorHelp: "edSubColorHelp",
      fontHelp: "edSubFontHelp",
      fallback: "var(--secondary-text-color)",
      // Its own icon first, with a colour and a size that do not follow the
      // words - left to right, the way the line itself reads. What the line
      // says is a question of content and lives under Settings -> General.
      icon: {
        key: "sub_icon",
        label: "edSubIcon",
        help: "edSubIconHelp",
        color: {
          key: "sub_icon_color",
          label: "edSubIconColor",
          help: "edSubIconColorHelp",
          fallback: "var(--secondary-text-color)",
        },
        size: { key: "sub_icon_size", label: "edSubIconSize", help: "edSubIconSizeHelp" },
      },
      // Gone with the line it describes - and the minimal format draws none.
      hidden: (config) => config.show_sub === false || config.layout === "minimal",
    },
    area_select: {
      label: "edElAreaPicker",
      help: "edElAreaPickerHelp",
      colorHelp: "edAreaPickerColorHelp",
      fontHelp: "edAreaPickerFontHelp",
      fallback: "var(--primary-text-color)",
      bgToggle: {
        key: "area_select_background",
        label: "edAreaPickerBackground",
        help: "edAreaPickerBackgroundHelp",
      },
      extra: {
        key: "area_select_background_color",
        label: "edAreaPickerBg",
        help: "edAreaPickerBgHelp",
        fallback: "var(--card-background-color)",
      },
      hidden: (config) =>
        config.show_area_picker === false || config.layout === "minimal",
    },
    // The traffic flow's button under the area dropdown. Its one colour is
    // the button's own - the fill while the flow is shown, the text while
    // it is hidden - so the text colour the other elements have is not
    // offered; the font settings are.
    switch: {
      label: "edElSwitch",
      help: "edElSwitchHelp",
      noColor: true,
      fontHelp: "edSwitchFontHelp",
      fallback: "var(--primary-color)",
      extra: {
        key: "switch_track_color",
        label: "edSwitchTrack",
        help: "edSwitchTrackHelp",
        fallback: "var(--primary-color)",
      },
      hidden: (config) =>
        config.layout === "minimal" ||
        config.map_traffic === false ||
        config.show_traffic_switch === false,
    },
    // The planner, in the order it is drawn: the panel, its heading, the
    // labels, the buttons, the planned route's time and the facts beside it.
    planner: {
      label: "edElPlanner",
      help: "edElPlannerHelp",
      noColor: true,
      noFont: true,
      extra: {
        key: "planner_background_color",
        label: "edPlannerBg",
        help: "edPlannerBgHelp",
        fallback: "var(--secondary-background-color)",
      },
      hidden: (config) => config.layout === "minimal" || config.show_planner === false,
    },
    plan_title: {
      label: "edElPlanTitle",
      help: "edElPlanTitleHelp",
      colorHelp: "edPlanTitleColorHelp",
      fontHelp: "edPlanTitleFontHelp",
      fallback: "var(--primary-text-color)",
      hidden: (config) => config.layout === "minimal" || config.show_planner === false,
    },
    plan_role: {
      label: "edElPlanRole",
      help: "edElPlanRoleHelp",
      colorHelp: "edPlanRoleColorHelp",
      fontHelp: "edPlanRoleFontHelp",
      fallback: "var(--secondary-text-color)",
      hidden: (config) => config.layout === "minimal" || config.show_planner === false,
    },
    plan_button: {
      label: "edElPlanButton",
      help: "edElPlanButtonHelp",
      noColor: true,
      fontHelp: "edPlanButtonFontHelp",
      fallback: "var(--primary-color)",
      extra: {
        key: "plan_button_fill",
        label: "edPlanButtonColor",
        help: "edPlanButtonColorHelp",
        fallback: "var(--primary-color)",
      },
      hidden: (config) => config.layout === "minimal" || config.show_planner === false,
    },
    plan_time: {
      label: "edElPlanTime",
      help: "edElPlanTimeHelp",
      colorHelp: "edPlanTimeColorHelp",
      fontHelp: "edPlanTimeFontHelp",
      fallback: "var(--primary-text-color)",
      hidden: (config) => config.layout === "minimal" || config.show_planner === false,
    },
    plan_facts: {
      label: "edElPlanFacts",
      help: "edElPlanFactsHelp",
      colorHelp: "edPlanFactsColorHelp",
      fontHelp: "edPlanFactsFontHelp",
      fallback: "var(--secondary-text-color)",
      hidden: (config) => config.layout === "minimal" || config.show_planner === false,
    },
    // Everything a list entry is made of, in the order it is drawn.
    highlight: {
      label: "edElHighlight",
      help: "edElHighlightHelp",
      // A backing, not a word on the card: one colour, no typeface, and it
      // is the background rather than the text that is being set.
      noColor: true,
      noFont: true,
      extra: {
        key: "highlight_color",
        label: "edHighlightBg",
        help: "edHighlightBgHelp",
        fallback: "rgba(var(--rgb-primary-color, 3, 169, 244), 0.22)",
      },
      tab: "map",
      hidden: (config) => config.map_highlight === false,
    },
    divider: {
      label: "edElDivider",
      help: "edElDividerHelp",
      colorHelp: "edDividerColorHelp",
      fallback: "var(--divider-color)",
      plainSize: { key: "divider_width", label: "edDividerWidth", help: "edDividerWidthHelp" },
      choice: {
        key: "divider_style",
        label: "edDividerStyle",
        help: "edDividerStyleHelp",
        options: [
          { value: "solid", label: "lineStyleSolid" },
          { value: "dashed", label: "lineStyleDashed" },
          { value: "dotted", label: "lineStyleDotted" },
        ],
      },
      noFont: true,
      tab: "list",
      hidden: (config) => config.show_divider === false,
    },
    row_picture: {
      label: "edElPicture",
      help: "edElPictureHelp",
      plainSize: { key: "row_picture_size", label: "edPictureSize", help: "edPictureSizeHelp" },
      // A symbol - nothing here to set in a typeface, only how big it is.
      noColor: true,
      noFont: true,
      tab: "list",
      hidden: (config) => config.show_row_picture === false,
    },
    line1: {
      label: "edElLine1",
      help: "edElLine1Help",
      colorHelp: "edLine1ColorHelp",
      fontHelp: "edLine1FontHelp",
      fallback: "var(--primary-text-color)",
      // No icon of its own: the entry already opens with its kind's symbol,
      // and a second one on the same line says nothing more.
      tab: "list",
      hidden: (config) => config.show_row_line1 === false,
    },
    line2: {
      label: "edElLine2",
      help: "edElLine2Help",
      colorHelp: "edLine2ColorHelp",
      fontHelp: "edLine2FontHelp",
      fallback: "var(--secondary-text-color)",
      icon: {
        key: "line2_icon",
        label: "edSubIcon",
        help: "edSubIconHelp",
        color: { key: "line2_icon_color", label: "edSubIconColor", help: "edSubIconColorHelp", fallback: "var(--secondary-text-color)" },
        size: { key: "line2_icon_size", label: "edSubIconSize", help: "edSubIconSizeHelp" },
      },
      tab: "list",
      hidden: (config) => config.show_row_line2 === false,
    },
    extra: {
      label: "edElExtra",
      help: "edElExtraHelp",
      colorHelp: "edExtraColorHelp",
      fontHelp: "edExtraFontHelp",
      fallback: "var(--secondary-text-color)",
      icon: {
        key: "extra_icon",
        label: "edSubIcon",
        help: "edSubIconHelp",
        color: { key: "extra_icon_color", label: "edSubIconColor", help: "edSubIconColorHelp", fallback: "var(--secondary-text-color)" },
        size: { key: "extra_icon_size", label: "edSubIconSize", help: "edSubIconSizeHelp" },
      },
      tab: "list",
      hidden: (config) => config.show_row_extra === false,
    },
    chip: {
      label: "edElChip",
      help: "edElChipHelp",
      colorHelp: "edChipColorHelp",
      fontHelp: "edChipFontHelp",
      fallback: "var(--secondary-text-color)",
      bgToggle: { key: "chip_background", label: "edChipBackground", help: "edChipBackgroundHelp" },
      extra: {
        key: "chip_background_color",
        label: "edChipBg",
        help: "edChipBgHelp",
        fallback: "var(--tomtom-row-chip-background, rgba(128, 128, 128, 0.12))",
      },
      tab: "list",
      hidden: (config) =>
        config.show_row_reported === false && config.show_row_until === false,
    },
  };

  class TomTomCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = defaultConfig(config);
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._render();
    }

    _emit() {
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: pruneDefaults(this._config) },
          bubbles: true,
          composed: true,
        })
      );
    }

    _set(key, value) {
      this._config = { ...this._config, [key]: value };
      this._emit();
      this._syncValues();
    }

    // An open colour menu is closed by anything that says "not this": a
    // click that lands somewhere else, or Escape. Without these the only way
    // out was the button the menu had just covered, which is not where
    // anybody looks - and a menu left standing over the form reads as a form
    // that has stopped working.
    //
    // On the window rather than on our own root, because a click on the card
    // preview beside the form never reaches the form at all, and while it is
    // going down rather than coming back up, so that nothing can swallow it
    // on the way.
    connectedCallback() {
      if (!this._onOutsideClick) {
        this._onOutsideClick = (ev) => this._closeMenus(ev.composedPath());
        this._onMenuEscape = (ev) => {
          // Only when one of ours is open. Otherwise Escape still belongs to
          // the dialog around us, and closing that is what it should do.
          //
          // Both halves are needed: stopPropagation keeps Home Assistant out
          // of it, and preventDefault is what keeps the dialog itself open -
          // a dialog closes on Escape by the browser's own doing rather than
          // by a listener anybody can stop.
          if (ev.key !== "Escape" || !this._closeMenus([])) return;
          ev.stopPropagation();
          ev.preventDefault();
        };
      }
      window.addEventListener("pointerdown", this._onOutsideClick, true);
      window.addEventListener("keydown", this._onMenuEscape, true);
      if (!this._onLanguage) {
        this._onLanguage = () => {
          // The form is built once and then only has values pushed into
          // it, so new words mean building it again.
          if (this.shadowRoot) this.shadowRoot.innerHTML = "";
          this._render();
        };
      }
      window.addEventListener(LANGUAGE_EVENT, this._onLanguage);
    }

    disconnectedCallback() {
      window.removeEventListener("pointerdown", this._onOutsideClick, true);
      window.removeEventListener("keydown", this._onMenuEscape, true);
      if (this._onLanguage) window.removeEventListener(LANGUAGE_EVENT, this._onLanguage);
    }

    // Closes every open colour menu except the one the event happened
    // inside, and says whether it closed anything. The exception is what
    // leaves the button its own toggle and a preset its own click: both
    // happen inside the menu's own .preset-select, which handles them.
    //
    // Read off composedPath() rather than the target, since the target of a
    // click inside a shadow root is retargeted to the host on the way out.
    _closeMenus(path) {
      if (!this.shadowRoot) return false;
      let closed = false;
      for (const menu of this.shadowRoot.querySelectorAll(".preset-menu")) {
        if (menu.hidden || path.includes(menu.parentElement)) continue;
        menu.hidden = true;
        closed = true;
      }
      return closed;
    }

    // Accordion: opening one panel closes the other, as in Annuals. Both start
    // closed, so the form opens as two lines rather than a wall of fields.
    _toggleSuper(key) {
      this.shadowRoot.querySelectorAll(".super-panel").forEach((panel) => {
        panel.classList.toggle(
          "open",
          panel.dataset.super === key && !panel.classList.contains("open")
        );
      });
    }

    _selectTab(superKey, groupKey) {
      const panel = this.shadowRoot.querySelector(`.super-panel[data-super="${superKey}"]`);
      if (!panel) return;
      panel.querySelectorAll(".tab").forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.key === groupKey);
      });
      panel.querySelectorAll(".group-body").forEach((body) => {
        body.hidden = body.dataset.group !== groupKey;
      });
    }

    _groupText(key, str) {
      return {
        general: str.edGroupGeneral,
        content: str.edGroupContent,
        rows: str.edGroupRows,
        display: str.edGroupDisplay,
        map: str.edGroupMap,
        list: str.edGroupList,
      }[key];
    }

    _hasFocus(el) {
      return !!el && this.shadowRoot.activeElement === el;
    }

    // Annuals' own row: label line with its "i", then the control inside a
    // .field-input-row.
    _fieldRow(label, tooltip, inner, sub) {
      const row = document.createElement("div");
      row.className = sub ? "field-row sub-field-row" : "field-row";
      // No "i" where there is nothing to say: an anchor with an empty tooltip
      // still draws its icon and opens an empty box on hover.
      row.innerHTML = `
        <div class="field-label">
          <span class="label-text"></span>
          ${tooltip
            ? `<span class="tooltip-anchor" data-tooltip="">
                 <ha-icon icon="mdi:information-outline"></ha-icon>
               </span>`
            : ""}
        </div>
        <div class="field-input-row"></div>`;
      row.querySelector(".label-text").textContent = label;
      const anchor = row.querySelector(".tooltip-anchor");
      if (anchor) anchor.dataset.tooltip = tooltip;
      if (inner) row.querySelector(".field-input-row").appendChild(inner);
      return row;
    }

    // Names the indented block below it and carries no control of its own -
    // the heading a design block gets in Annuals. Here it doubles as the
    // block's own handle: one element's settings are eight rows, and three
    // of them stacked is a long scroll to reach the third.
    // `collapsible` false gives a plain heading: the Content tab's two blocks
    // are always open, and a chevron there would promise a fold that is not
    // there.
    _groupLabelRow(label, tooltip, collapsible = true) {
      const row = this._fieldRow(label, tooltip, null);
      row.classList.add("group-label-row");
      row.querySelector(".field-input-row").remove();
      if (!collapsible) {
        row.classList.add("plain-label-row");
        return row;
      }

      const chevron = document.createElement("ha-icon");
      chevron.className = "design-chevron";
      chevron.icon = "mdi:chevron-down";
      row.querySelector(".field-label").appendChild(chevron);

      row.tabIndex = 0;
      row.setAttribute("role", "button");
      // Reading the "i" must not fold the block away underneath the cursor.
      row.querySelector(".tooltip-anchor").addEventListener("click", (ev) => ev.stopPropagation());
      const toggle = () => {
        const block = row.closest(".design-element");
        if (!block) return;
        const open = !block.classList.contains("open");
        // One at a time, the way the two big panels above already behave.
        block.parentElement.querySelectorAll(".design-element").forEach((el) => {
          el.classList.toggle("open", el === block && open);
          const head = el.querySelector(".group-label-row");
          if (head) head.setAttribute("aria-expanded", el === block && open ? "true" : "false");
        });
      };
      row.addEventListener("click", toggle);
      row.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        toggle();
      });
      row.setAttribute("aria-expanded", "false");
      return row;
    }

    _textInput(key, placeholder) {
      const input = document.createElement("input");
      input.type = "text";
      input.dataset.field = key;
      input.placeholder = placeholder || "";
      input.addEventListener("input", () => this._set(key, input.value));
      return input;
    }

    _numberInput(key, min, max, step) {
      const input = document.createElement("input");
      input.type = "number";
      input.dataset.field = key;
      input.min = min;
      input.max = max;
      if (step) input.step = step;
      input.addEventListener("input", () => {
        const value = step ? Number.parseFloat(input.value) : Number.parseInt(input.value, 10);
        this._set(key, Number.isFinite(value) ? value : min);
      });
      return input;
    }

    _select(key, options) {
      const select = document.createElement("select");
      select.dataset.field = key;
      for (const option of options) {
        const el = document.createElement("option");
        el.value = option.value;
        el.textContent = option.label;
        select.appendChild(el);
      }
      select.addEventListener("change", () => this._set(key, select.value));
      return select;
    }

    // Only where a plain input cannot do the job - picking a device or an
    // entity needs Home Assistant's own picker.
    _picker(key, selector) {
      const control = document.createElement("ha-selector");
      control.selector = selector;
      control.dataset.key = key;
      // Every option here is optional; without this the pickers draw the
      // asterisk that means "you have to fill this in".
      control.required = false;
      control.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        this._set(key, ev.detail.value);
      });
      return control;
    }

    // A switch with its label beside it, as in the Annuals editor - not a
    // labelled row with a control below, because a switch reads as one line.
    // `invert` drives a "Hide" switch off a "show" config key, the way
    // Annuals' own Hide-title toggle does, so no config key had to be flipped.
    _toggleRow(key, label, tooltip, invert) {
      const row = document.createElement("div");
      row.className = "toggle-row";
      row.innerHTML = `
        <label class="toggle">
          <input type="checkbox" data-toggle="${key}"${invert ? ' data-invert="1"' : ""}>
          <span class="track"></span>
        </label>
        <span class="toggle-label"></span>
        ${tooltip
          ? `<span class="tooltip-anchor" data-tooltip="">
               <ha-icon icon="mdi:information-outline"></ha-icon>
             </span>`
          : ""}`;
      row.querySelector(".toggle-label").textContent = label;
      const anchor = row.querySelector(".tooltip-anchor");
      if (anchor) anchor.dataset.tooltip = tooltip;
      row.querySelector("input").addEventListener("change", (ev) =>
        this._set(key, invert ? !ev.target.checked : ev.target.checked)
      );
      return row;
    }

    // The card's own background: a switch, a colour, an image with an upload
    // and a preview, how that image meets the edges, and how much of both
    // comes through. Built by hand rather than from DESIGN_ELEMENTS - that
    // table describes a run of text, and none of this is one - but wearing
    // the same collapsible block so it folds with its neighbours.
    _backgroundBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "card_background";
      block.appendChild(this._groupLabelRow(str.edElCardBg, str.edElCardBgHelp));

      const on = this._toggleRow("card_background", str.edCardBgEnable, str.edCardBgEnableHelp);
      on.classList.add("sub-field-row", "sub-toggle-row");
      block.appendChild(on);

      // Everything below the switch describes a background that is not being
      // drawn until it is on, so it waits until then. Kept in the DOM rather
      // than rebuilt, so the wiring survives being switched off and on.
      const wanted = [];
      const add = (row) => { wanted.push(row); block.appendChild(row); };
      add(this._colorRow("card_background_color", str.edCardBgColor, str.edCardBgColorHelp, str));

      const image = this._textInput("card_background_image", str.edCardBgImagePlaceholder);
      const upload = document.createElement("button");
      upload.type = "button";
      upload.className = "upload-btn";
      upload.title = str.edCardBgUpload;
      upload.innerHTML = `<ha-icon icon="mdi:upload"></ha-icon>`;
      const imageRow = this._fieldRow(str.edCardBgImage, str.edCardBgImageHelp, image, true);
      imageRow.querySelector(".field-input-row").appendChild(upload);
      const preview = document.createElement("div");
      preview.className = "bg-image-preview";
      preview.dataset.bgPreview = "";
      preview.hidden = true;
      preview.innerHTML = `<img alt=""><button type="button" class="bg-image-clear"
        title="${escapeHtml(str.edCardBgClear)}"><ha-icon icon="mdi:close"></ha-icon></button>`;
      imageRow.appendChild(preview);
      add(imageRow);

      add(this._fieldRow(str.edCardBgSize, str.edCardBgSizeHelp,
        this._select("card_background_size", [
          { value: "cover", label: str.bgSizeCover },
          { value: "contain", label: str.bgSizeContain },
          { value: "auto", label: str.bgSizeAuto },
          { value: "repeat", label: str.bgSizeRepeat },
        ]), true));

      // A number that is a percentage says so inside the field, the way
      // Annuals writes one - a label reading "(%)" is a second thing to read
      // where the field can say it itself.
      const opacity = document.createElement("div");
      opacity.className = "unit-input-wrap";
      opacity.appendChild(this._numberInput("card_background_opacity", 0, 100));
      const suffix = document.createElement("span");
      suffix.className = "unit-suffix";
      suffix.textContent = "%";
      opacity.appendChild(suffix);
      add(this._fieldRow(str.edCardBgOpacity, str.edCardBgOpacityHelp, opacity, true));

      for (const row of wanted) row.dataset.withCardBg = "";

      // Uploads go through Home Assistant's own image endpoint - the one its
      // dashboard and area pickers use - so what comes back is an ordinary
      // /api/image/serve URL that the text field can hold like any other.
      const setImage = (value) => {
        this._set("card_background_image", value);
        // Picking an image is the clearest way of saying it should be shown.
        // Without this, an upload lands in a background that is switched off
        // and nothing appears to have happened.
        if (value && this._config.card_background !== true) this._set("card_background", true);
        this._syncValues();
      };
      upload.addEventListener("click", () => this._uploadBackground(setImage));
      preview.querySelector(".bg-image-clear").addEventListener("click", () => setImage(""));
      return block;
    }

    // The route line: its colour and its width, in a collapsible block of
    // their own like the card background. The block answers to "Show the
    // route on the map" under Settings -> General and hides with it.
    _routeBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "route";
      block.dataset.withRoute = "";
      block.appendChild(this._groupLabelRow(str.edElRoute, str.edElRouteHelp));
      block.appendChild(this._colorRow("route_color", str.edRouteColor, str.edRouteColorHelp, str));
      const width = document.createElement("div");
      width.className = "unit-input-wrap";
      width.appendChild(this._numberInput("route_width", 1, 12));
      const suffix = document.createElement("span");
      suffix.className = "unit-suffix";
      suffix.textContent = "px";
      width.appendChild(suffix);
      block.appendChild(this._fieldRow(str.edRouteWidth, str.edRouteWidthHelp, width, true));
      return block;
    }

    // The minimal line's travel time: its symbol, the two thresholds, and
    // for each of the three levels the symbol's colour, the text's and the
    // fill's; then the fill's opacity and the font. Built by hand -
    // DESIGN_ELEMENTS has one of each colour, and this has three of each.
    _miniTravelBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "mini_travel";
      block.dataset.withMiniTravel = "";
      block.appendChild(this._groupLabelRow(str.edElMiniTravel, str.edElMiniTravelHelp));
      block.appendChild(
        this._fieldRow(str.edSubIcon, str.edMiniIconHelp, this._picker("mini_travel_icon", { icon: {} }), true)
      );
      block.appendChild(
        this._fieldRow(
          str.edSubIconSize, str.edMiniIconSizeHelp,
          this._textInput("mini_travel_icon_size", str.edFontPlaceholder), true
        )
      );
      const minutes = (key) => {
        const wrap = document.createElement("div");
        wrap.className = "unit-input-wrap";
        wrap.appendChild(this._numberInput(key, 0, 600));
        const suffix = document.createElement("span");
        suffix.className = "unit-suffix";
        suffix.textContent = str.minutesUnit;
        wrap.appendChild(suffix);
        return wrap;
      };
      block.appendChild(this._fieldRow(str.edDelayWarn, str.edDelayWarnHelp, minutes("delay_warn_minutes"), true));
      block.appendChild(this._fieldRow(str.edDelayAlert, str.edDelayAlertHelp, minutes("delay_alert_minutes"), true));
      for (const [level, label] of [
        ["ok", "edMiniTravelLevelOk"],
        ["warn", "edMiniTravelLevelWarn"],
        ["alert", "edMiniTravelLevelAlert"],
      ]) {
        const heading = this._fieldRow(str[label], "", null, true);
        heading.classList.add("level-heading");
        block.appendChild(heading);
        block.appendChild(
          this._colorRow(`mini_travel_${level}_icon_color`, str.edSubIconColor, str.edMiniTravelIconColorHelp, str)
        );
        block.appendChild(
          this._colorRow(`mini_travel_${level}_color`, str.edFontColor, str.edMiniTravelColorHelp, str)
        );
        block.appendChild(
          this._colorRow(`mini_travel_${level}_fill_color`, str.edMiniBg, str.edMiniTravelFillHelp, str)
        );
      }
      const wrap = document.createElement("div");
      wrap.className = "unit-input-wrap";
      wrap.appendChild(this._numberInput("mini_travel_fill_opacity", 0, 100));
      const suffix = document.createElement("span");
      suffix.className = "unit-suffix";
      suffix.textContent = "%";
      wrap.appendChild(suffix);
      block.appendChild(this._fieldRow(str.edMiniBgOpacity, str.edMiniBgOpacityHelp, wrap, true));
      block.appendChild(this._fontRows("mini_travel", str.edFont, str.edMiniTravelFontHelp, str));
      return block;
    }

    // The line under a live route's travel time: from how many minutes of
    // delay it turns yellow and red, the three colours, and its font.
    // Built by hand - DESIGN_ELEMENTS has one colour per element, and this
    // has three that take turns.
    _delayLineBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "delay_line";
      block.dataset.withTravelTime = "";
      block.appendChild(this._groupLabelRow(str.edElDelayLine, str.edElDelayLineHelp));
      const minutes = (key) => {
        const wrap = document.createElement("div");
        wrap.className = "unit-input-wrap";
        wrap.appendChild(this._numberInput(key, 0, 600));
        const suffix = document.createElement("span");
        suffix.className = "unit-suffix";
        suffix.textContent = str.minutesUnit;
        wrap.appendChild(suffix);
        return wrap;
      };
      block.appendChild(this._fieldRow(str.edDelayWarn, str.edDelayWarnHelp, minutes("delay_warn_minutes"), true));
      block.appendChild(this._fieldRow(str.edDelayAlert, str.edDelayAlertHelp, minutes("delay_alert_minutes"), true));
      block.appendChild(this._colorRow("delay_ok_color", str.edDelayOkColor, str.edDelayOkColorHelp, str));
      block.appendChild(this._colorRow("delay_warn_color", str.edDelayWarnColor, str.edDelayWarnColorHelp, str));
      block.appendChild(this._colorRow("delay_alert_color", str.edDelayAlertColor, str.edDelayAlertColorHelp, str));
      block.appendChild(this._fontRows("delay_line", str.edFont, str.edDelayLineFontHelp, str));
      return block;
    }

    // The traffic flow's tiles: TomTom's colouring and the opacity. Answers
    // to "Show the traffic flow" under Settings -> General, the way the
    // route block answers to the route switch.
    _trafficBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "traffic";
      block.dataset.withTraffic = "";
      block.appendChild(this._groupLabelRow(str.edElTraffic, str.edElTrafficHelp));
      block.appendChild(
        this._fieldRow(str.edTrafficStyle, str.edTrafficStyleHelp,
          this._select("traffic_style", [
            { value: "relative0", label: str.trafficStyleRelative0 },
            { value: "relative", label: str.trafficStyleRelative },
            { value: "absolute", label: str.trafficStyleAbsolute },
            { value: "relative-delay", label: str.trafficStyleDelay },
          ]), true)
      );
      const opacity = document.createElement("div");
      opacity.className = "unit-input-wrap";
      opacity.appendChild(this._numberInput("traffic_opacity", 10, 100));
      const pct = document.createElement("span");
      pct.className = "unit-suffix";
      pct.textContent = "%";
      opacity.appendChild(pct);
      block.appendChild(this._fieldRow(str.edTrafficOpacity, str.edTrafficOpacityHelp, opacity, true));
      return block;
    }

    // The cluster discs: the disc's colour and the count's, in a collapsible
    // block of their own. The block answers to "Group nearby reports" just
    // above it and hides with it; empty keeps the theme's colours.
    _clusterBlock(str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = "cluster";
      block.dataset.withCluster = "";
      block.appendChild(this._groupLabelRow(str.edElCluster, str.edElClusterHelp));
      // Bubble or disc - only a choice from 2026.10, so it is greyed out
      // before that the same way the grouping switch is.
      const styleRow = this._fieldRow(
        str.edClusterStyle,
        str.edClusterStyleHelp,
        this._select("cluster_style", [
          { value: "bubble", label: str.clusterStyleBubble },
          { value: "disc", label: str.clusterStyleDisc },
        ]),
        true
      );
      styleRow.dataset.needsCluster = "";
      block.appendChild(styleRow);
      block.appendChild(this._colorRow("cluster_color", str.edClusterColor, str.edClusterColorHelp, str));
      block.appendChild(
        this._colorRow("cluster_text_color", str.edClusterTextColor, str.edClusterTextColorHelp, str)
      );
      // The count's size and style - the font row every text element has,
      // less the capitals switch: a number has none.
      const row = this._fieldRow(str.edClusterFont, str.edClusterFontHelp, null, true);
      const slot = row.querySelector(".field-input-row");
      const size = document.createElement("input");
      size.type = "text";
      size.dataset.field = "cluster_font_size";
      size.placeholder = str.edFontPlaceholder;
      size.addEventListener("input", () => this._set("cluster_font_size", size.value));
      slot.appendChild(size);
      const toggles = document.createElement("div");
      toggles.className = "field-toggles";
      for (const [attr, text] of [
        ["bold", str.edBold],
        ["italic", str.edItalic],
        ["underline", str.edUnderline],
      ]) {
        const group = document.createElement("div");
        group.className = "toggle-group";
        group.innerHTML = `
          <label class="toggle">
            <input type="checkbox" data-toggle="cluster_${attr}">
            <span class="track"></span>
          </label>
          <span class="toggle-label toggle-label-${attr}"></span>`;
        group.querySelector(".toggle-label").textContent = text;
        group.querySelector("input").addEventListener("change", (ev) =>
          this._set(`cluster_${attr}`, ev.target.checked)
        );
        toggles.appendChild(group);
      }
      slot.appendChild(toggles);
      block.appendChild(row);
      return block;
    }

    // The file input is created on document.body rather than kept in this
    // shadow root: inside the dialog, the native file picker handing focus
    // back is read as a click outside it, and the whole editor closes before
    // the pick is even delivered.
    async _uploadBackground(setImage) {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.cssText = "position: fixed; opacity: 0; pointer-events: none";
      document.body.appendChild(input);
      input.addEventListener("change", async () => {
        const file = input.files && input.files[0];
        input.remove();
        if (!file || !this._hass) return;
        const body = new FormData();
        body.append("file", file);
        try {
          const response = await fetch("/api/image/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${this._hass.auth.data.access_token}` },
            body,
          });
          if (!response.ok) throw new Error(`upload failed: ${response.status}`);
          const result = await response.json();
          setImage(`/api/image/serve/${result.id}/original`);
        } catch (err) {
          console.error("tomtom-card: background image upload failed", err);
        }
      });
      input.click();
    }

    // A switch that rides on another row's label line instead of taking a
    // row of its own, right aligned. The arrangement "Show background"
    // already has on a colour row, and what "Hide" wants against the field
    // it empties: the two are one setting, and a row of their own made them
    // read as two.
    _inlineToggle(key, label, tooltip, invert) {
      const group = this._toggleRow(key, label, tooltip, invert);
      group.className = "toggle-group inline-toggle";
      return group;
    }

    // Preset dropdown, free-text field and native colour square, in that
    // order - Annuals' colour row exactly.
    // `bgToggle` puts a switch of its own on the row's second line, right
    // aligned - the way Annuals hangs "Show background" off the badge's own
    // colour row rather than giving it a row of its own.
    _colorRow(key, label, tooltip, str, bgToggle) {
      const row = this._fieldRow(label, tooltip, null, true);
      const slot = row.querySelector(".field-input-row");
      slot.innerHTML = `
        <div class="preset-select" data-preset-for="${key}">
          <button type="button" class="preset-btn">
            <span class="preset-swatch"></span>
            <span class="preset-name"></span>
            <ha-icon icon="mdi:menu-down"></ha-icon>
          </button>
          <div class="preset-menu" hidden></div>
        </div>
        <input type="text" data-color-text="${key}">
        <input type="color" data-color="${key}">`;

      const menu = slot.querySelector(".preset-menu");
      for (const preset of PRESET_COLORS) {
        const item = document.createElement("div");
        item.className = "preset-item";
        item.innerHTML = `<span class="preset-swatch"></span><span class="preset-item-name"></span>`;
        const swatch = item.querySelector(".preset-swatch");
        swatch.style.background = preset.value || "transparent";
        if (!preset.value) swatch.style.boxShadow = "inset 0 0 0 2px var(--divider-color, #ccc)";
        item.querySelector(".preset-item-name").textContent = str[preset.labelKey] || preset.key;
        item.addEventListener("click", () => {
          this._set(key, preset.value);
          menu.hidden = true;
        });
        menu.appendChild(item);
      }

      const select = slot.querySelector(".preset-select");
      select.querySelector(".preset-btn").addEventListener("click", (ev) => {
        ev.stopPropagation();
        const isOpen = !menu.hidden;
        this.shadowRoot.querySelectorAll(".preset-menu").forEach((m) => (m.hidden = true));
        if (!isOpen) {
          // The edit dialog scrolls internally and clips this menu well before
          // the browser viewport does, so measure against the nearest actual
          // scrolling ancestor - and on every open, since both the scroll
          // offset and the button's position move between opens.
          //
          // Whichever side has more room wins, and the menu is then capped to
          // that room. Opening upward on its own was not enough: near the top
          // of the dialog the menu simply ran off the other end instead, with
          // its first entries out of reach.
          const rect = select.getBoundingClientRect();
          const box = this._scrollAncestorRect();
          const below = box.bottom - rect.bottom - 8;
          const above = rect.top - box.top - 8;
          const up = above > below;
          menu.classList.toggle("menu-up", up);
          menu.style.maxHeight = `${Math.max(120, Math.min(260, up ? above : below))}px`;
        }
        menu.hidden = isOpen;
      });

      const textInput = slot.querySelector(`input[data-color-text="${key}"]`);
      const colorInput = slot.querySelector(`input[data-color="${key}"]`);
      textInput.placeholder = str.edColorPlaceholder;
      textInput.addEventListener("input", () => this._set(key, textInput.value));
      colorInput.addEventListener("input", () => this._set(key, colorInput.value));

      if (bgToggle) {
        const group = document.createElement("div");
        group.className = "toggle-group";
        group.innerHTML = `
          <label class="toggle">
            <input type="checkbox" data-toggle="${bgToggle.key}">
            <span class="track"></span>
          </label>
          <span class="toggle-label"></span>
          <span class="tooltip-anchor" data-tooltip="">
            <ha-icon icon="mdi:information-outline"></ha-icon>
          </span>`;
        group.querySelector(".toggle-label").textContent = str[bgToggle.label];
        const help = str[bgToggle.help];
        const anchor = group.querySelector(".tooltip-anchor");
        if (help) anchor.dataset.tooltip = help;
        else anchor.remove();
        group.querySelector("input").addEventListener("change", (ev) =>
          this._set(bgToggle.key, ev.target.checked)
        );
        slot.appendChild(group);
      }
      return row;
    }

    // Size field with Bold/Italic/Uppercase/Underline beside it, then letter
    // spacing on its own indented line underneath.
    _fontRows(key, label, tooltip, str) {
      const rows = document.createElement("div");
      const row = this._fieldRow(label, tooltip, null, true);
      const slot = row.querySelector(".field-input-row");

      const size = document.createElement("input");
      size.type = "text";
      size.dataset.field = `${key}_font_size`;
      size.placeholder = str.edFontPlaceholder;
      size.addEventListener("input", () => this._set(`${key}_font_size`, size.value));
      slot.appendChild(size);

      const toggles = document.createElement("div");
      toggles.className = "field-toggles";
      for (const [attr, text] of [
        ["bold", str.edBold],
        ["italic", str.edItalic],
        ["uppercase", str.edUppercase],
        ["underline", str.edUnderline],
      ]) {
        const group = document.createElement("div");
        group.className = "toggle-group";
        group.innerHTML = `
          <label class="toggle">
            <input type="checkbox" data-toggle="${key}_${attr}">
            <span class="track"></span>
          </label>
          <span class="toggle-label toggle-label-${attr}"></span>`;
        group.querySelector(".toggle-label").textContent = text;
        group.querySelector("input").addEventListener("change", (ev) =>
          this._set(`${key}_${attr}`, ev.target.checked)
        );
        toggles.appendChild(group);
      }
      slot.appendChild(toggles);
      rows.appendChild(row);

      const spacing = this._fieldRow(
        str.edLetterSpacing,
        str.edLetterSpacingHelp,
        this._textInput(`${key}_letter_spacing`, str.edLetterSpacingPlaceholder),
        true
      );
      spacing.classList.add("sub-field-row-nested");
      rows.appendChild(spacing);
      return rows;
    }

    // The Card title block under Layout -> General: its own heading, then
    // colour, font and letter spacing indented beneath it. Hidden as a whole
    // when the title is switched off in Settings -> General, so there is
    // nothing to style for something that is not drawn.
    _designElement(prefix, el, str) {
      const block = document.createElement("div");
      block.className = "design-element";
      block.dataset.design = prefix;
      block.appendChild(this._groupLabelRow(str[el.label], str[el.help]));
      // A plain measurement of its own - the rule's width, the symbol's size,
      // the stars' size. Elements that are not text have this instead of the
      // font block below. Width first, then style, then colour: Annuals' own
      // order for a line.
      if (el.plainSize) {
        block.appendChild(
          this._fieldRow(
            str[el.plainSize.label],
            str[el.plainSize.help],
            this._textInput(el.plainSize.key, str.edFontPlaceholder),
            true
          )
        );
      }
      // A dropdown of its own - the rule's line style is the one setting here
      // that is a choice rather than a measurement.
      if (el.choice) {
        block.appendChild(
          this._fieldRow(
            str[el.choice.label],
            str[el.choice.help],
            this._select(
              el.choice.key,
              el.choice.options.map((o) => ({ value: o.value, label: str[o.label] }))
            ),
            true
          )
        );
      }
      if (el.icon) {
        block.appendChild(
          this._fieldRow(str[el.icon.label], str[el.icon.help], this._picker(el.icon.key, { icon: {} }), true)
        );
        if (el.icon.color) {
          block.appendChild(
            this._colorRow(el.icon.color.key, str[el.icon.color.label], str[el.icon.color.help], str)
          );
        }
        if (el.icon.size) {
          block.appendChild(
            this._fieldRow(
              str[el.icon.size.label],
              str[el.icon.size.help],
              this._textInput(el.icon.size.key, str.edFontPlaceholder),
              true
            )
          );
        }
      }
      for (const part of el.parts || []) {
        const row = this._toggleRow(part.key, str[part.label], str[part.help]);
        row.classList.add("sub-field-row", "sub-toggle-row");
        block.appendChild(row);
      }
      const colorRow = el.noColor
        ? null
        : this._colorRow(
            `${prefix}_color`,
            str[el.colorLabel] || str.edColor,
            str[el.colorHelp],
            str,
            el.bgToggle
          );
      // Normally the element's own colour comes first and a background
      // colour hangs off it. Where the block has a fill of its own instead,
      // the fill leads and the type - colour and font together - follows.
      if (colorRow && !el.colorLast) block.appendChild(colorRow);
      if (el.extra) {
        block.appendChild(this._colorRow(el.extra.key, str[el.extra.label], str[el.extra.help], str));
      }
      // How much of that colour comes through. A percentage, so the unit
      // goes inside the field the way the card background's does.
      if (el.opacity) {
        const wrap = document.createElement("div");
        wrap.className = "unit-input-wrap";
        wrap.appendChild(this._numberInput(el.opacity.key, 0, 100));
        const suffix = document.createElement("span");
        suffix.className = "unit-suffix";
        suffix.textContent = "%";
        wrap.appendChild(suffix);
        block.appendChild(
          this._fieldRow(str[el.opacity.label], str[el.opacity.help], wrap, true)
        );
      }
      if (colorRow && el.colorLast) block.appendChild(colorRow);
      // Only what carries text gets a font.
      if (!el.noFont) {
        block.appendChild(this._fontRows(prefix, str.edFont, str[el.fontHelp], str));
      }
      return block;
    }

    // Stands in for a tab's settings while the part of the card they describe
    // is switched off, so the tab is still there to be found - just with the
    // one thing to do first. `kind` is what has to be switched on: "list" or
    // "map", which is also how _syncValues knows when to show the note.
    // Stands in for a tab whose part of the card is switched off - in the
    // minimal format that part is the pop-up's map, and the switch that puts
    // it back is in the same place either way.
    _offNote(kind, str) {
      const note = document.createElement("div");
      note.className = "off-note";
      note.dataset.off = kind;
      note.textContent = kind === "map" ? str.edMapOff : str.edListOff;
      return note;
    }

    // One half of a row in the Content tab: a heading and the rows that belong
    // under it - switches that offer a choice, the choice itself, and anything
    // hanging off one of them. Controls come wrapped in _bareRow.
    _contentBlock(label, tooltip, rows) {
      const block = document.createElement("div");
      block.className = "content-block";
      block.appendChild(this._groupLabelRow(label, tooltip, false));
      for (const row of rows) if (row) block.appendChild(row);
      return block;
    }

    // A control on a line of its own. No label beside it: inside a content
    // block the block's own heading is the label.
    _bareRow(control) {
      const row = this._fieldRow("", "", control);
      row.querySelector(".field-label").remove();
      return row;
    }

    _buildGroup(groupKey, str) {
      const body = document.createElement("div");
      body.className = "group-body";
      body.dataset.group = groupKey;

      if (groupKey === "general") {
        // First, because it decides what the card is before anything else
        // here decides how it looks.
        body.appendChild(
          this._fieldRow(str.edLayout, str.edLayoutHelp,
            this._select("layout", [
              { value: "portrait", label: str.layoutPortrait },
              { value: "landscape", label: str.layoutLandscape },
              { value: "minimal", label: str.layoutMinimal },
            ]))
        );
        // "Hide" sits on the title's own label line rather than on a row of
        // its own: it is not a second setting but the same one, saying that
        // whatever the field below holds is not to be drawn.
        const titleRow = this._fieldRow(
          str.edTitle, str.edTitleHelp, this._textInput("title", str.title)
        );
        titleRow
          .querySelector(".field-label")
          .appendChild(
            this._inlineToggle("show_title", str.edHideTitle, str.edHideTitleHelp, true)
          );
        body.appendChild(titleRow);
        // Straight behind the title, because in the minimal format the two
        // are the whole of what the card is: a line one taps, and the words
        // its pop-up wears. Home Assistant's own action picker rather than
        // one of ours, so that what this card offers is what every other card
        // offers, down to the wording.
        const tap = this._fieldRow(str.edMiniTap, str.edMiniTapHelp,
          this._picker("mini_tap_action", {
            ui_action: {
              actions: ["more-info", "navigate", "url", "perform-action", "toggle", "none"],
            },
          }));
        tap.dataset.withMinimal = "";
        body.appendChild(tap);
        // Straight after the title pair, since it is the card's other piece of
        // fixed wording - the one it falls back to when the area turns out
        // empty. Never in the minimal format: a number of nothing opens no
        // pop-up, so there is nowhere left for this wording to appear.
        const nothing = this._fieldRow(
          str.edNothing, str.edNothingHelp, this._textInput("no_reports_text", str.nothing)
        );
        nothing.dataset.withoutMinimal = "";
        body.appendChild(nothing);
        // The minimal format's own two groups: the line's four parts, each
        // named for what it shows, then what the pop-up behind them shows.
        // The new and delay switches are the same keys the head's badges
        // answer to, offered under their own names here.
        const minimalOnly = (row) => {
          row.dataset.withMinimal = "";
          body.appendChild(row);
          return row;
        };
        minimalOnly(this._groupLabelRow(str.edMiniGroupButtons, str.edMiniGroupButtonsHelp, false));
        minimalOnly(this._toggleRow("mini_show_total", str.edMiniTotal, str.edMiniTotalHelp));
        minimalOnly(this._toggleRow("show_new", str.edMiniNew, str.edMiniNewHelp));
        minimalOnly(this._toggleRow("show_delay", str.edMiniDelay, str.edMiniDelayHelp));
        minimalOnly(this._toggleRow("mini_show_travel", str.edMiniTravel, str.edMiniTravelHelp));

        const newRow = this._toggleRow("show_new", str.edShowNew, str.edShowNewHelp);
        newRow.dataset.withoutMinimal = "";
        body.appendChild(newRow);
        // Under it, because the two stand next to each other wherever they
        // are drawn: the badges beside the title in a head.
        const delayRow = this._toggleRow("show_delay", str.edShowDelay, str.edShowDelayHelp);
        delayRow.dataset.withoutMinimal = "";
        body.appendChild(delayRow);

        // The line under the title: whether it is drawn at all, then each of
        // the three things it can say, indented beneath that. The minimal
        // format draws no such line, so it is not offered one.
        // A live route's travel time, large under the title. Before the
        // line under it, which it then takes the parts of.
        // In the minimal format the same setting is offered further down,
        // among the pop-up's rows and named for it: the switches here say
        // what the line is made of, and the line never shows the time.
        const travel = this._toggleRow("show_travel_time", str.edShowTravelTime, str.edShowTravelTimeHelp);
        travel.dataset.withoutMinimal = "";
        body.appendChild(travel);
        // The refresh button has two places - beside a live route's travel
        // time, at the end of the info line otherwise - so it stands on its
        // own, where it is drawn first.
        const refresh = this._toggleRow("show_refresh", str.edShowRefresh, str.edShowRefreshHelp);
        refresh.dataset.withoutMinimal = "";
        body.appendChild(refresh);
        // Beside the travel time, at the right under the dropdown: the
        // traffic flow's button. Only while the flow itself is on.
        const trafficButton = this._toggleRow("show_traffic_switch", str.edTrafficSwitch, str.edTrafficSwitchHelp);
        trafficButton.dataset.withTraffic = "";
        body.appendChild(trafficButton);
        const sub = this._toggleRow("show_sub", str.edShowSub, str.edShowSubHelp);
        sub.dataset.withoutMinimal = "";
        body.appendChild(sub);
        for (const part of [
          // In the order the line says them: the traffic's share first, on
          // a live route, then the name, the mode or length, the update.
          { key: "sub_show_delay", label: "edSubDelay", help: "edSubDelayHelp" },
          { key: "sub_show_area", label: "edSubArea", help: "edSubAreaHelp" },
          { key: "sub_show_mode", label: "edSubMode", help: "edSubModeHelp" },
        ]) {
          const row = this._toggleRow(part.key, str[part.label], str[part.help]);
          row.classList.add("sub-field-row", "sub-toggle-row");
          row.dataset.withSub = "";
          body.appendChild(row);
        }
        // Whether there is a map at all. Its looks stay under Layout -> Map,
        // and "the list follows it" is a property of the list.
        // The minimal format's second group: the map, the list and the
        // travel time are the pop-up's there.
        const popHead = this._groupLabelRow(str.edMiniGroupPop, str.edMiniGroupPopHelp, false);
        popHead.dataset.withMinimal = "";
        body.appendChild(popHead);
        body.appendChild(this._toggleRow("show_map", str.edShowMap, str.edShowMapHelp));
        // Whether the map stays while there is nothing to put on it.
        const alwaysRow = this._toggleRow("map_always", str.edMapAlways, str.edMapAlwaysHelp);
        alwaysRow.classList.add("sub-field-row", "sub-toggle-row");
        alwaysRow.dataset.withMap = "";
        body.appendChild(alwaysRow);
        const scaleRow = this._toggleRow("map_scale", str.edMapScale, str.edMapScaleHelp);
        scaleRow.classList.add("sub-field-row", "sub-toggle-row");
        scaleRow.dataset.withMap = "";
        body.appendChild(scaleRow);
        // Whether a route entry's route is drawn on it - indented under the
        // map switch, since without a map there is nothing to draw it on.
        // Its looks are under Layout -> Map.
        const routeRow = this._toggleRow("map_route", str.edMapRoute, str.edMapRouteHelp);
        routeRow.classList.add("sub-field-row", "sub-toggle-row");
        routeRow.dataset.withMap = "";
        body.appendChild(routeRow);
        // And every report's stretch of road, drawn the same way.
        const closuresRow = this._toggleRow("map_lines", str.edMapClosures, str.edMapClosuresHelp);
        closuresRow.classList.add("sub-field-row", "sub-toggle-row");
        closuresRow.dataset.withMap = "";
        body.appendChild(closuresRow);
        // And TomTom's traffic flow on the roads, as tiles over the map
        // while the card is on screen.
        const trafficRow = this._toggleRow("map_traffic", str.edMapTraffic, str.edMapTrafficHelp);
        trafficRow.classList.add("sub-field-row", "sub-toggle-row");
        trafficRow.dataset.withMap = "";
        body.appendChild(trafficRow);
        // What a click on the map does to the list: under the map, since it
        // is the map that is clicked.
        const highlight = this._toggleRow("map_highlight", str.edMapHighlight, str.edMapHighlightHelp);
        highlight.classList.add("sub-field-row", "sub-toggle-row");
        highlight.dataset.withMap = "";
        body.appendChild(highlight);
        body.appendChild(this._toggleRow("show_list", str.edShowList, str.edShowListHelp));
        const travelPop = this._toggleRow(
          "show_travel_time", str.edShowTravelTimePop, str.edShowTravelTimePopHelp
        );
        travelPop.dataset.withMinimal = "";
        body.appendChild(travelPop);
      }

      if (groupKey === "content") {
        // The two things a card is pointed at - where it looks and what it
        // keeps - side by side and equally wide, each read top to bottom:
        // what it is, whether the card offers the choice, and the choice.
        const pair = document.createElement("div");
        pair.className = "content-pair";
        pair.appendChild(
          this._contentBlock(str.edAreas, str.edAreasHelp, [
            this._toggleRow("show_area_picker", str.edAreaPicker, str.edAreaPickerHelp),
            this._toggleRow("show_planner", str.edShowPlanner, str.edShowPlannerHelp),
            this._bareRow(
              this._picker("areas", { device: { multiple: true, filter: { integration: DOMAIN } } })
            ),
          ])
        );
        body.appendChild(pair);
        // And underneath, laid out the same way: where distances are counted
        // from, and how many reports survive. Filtering too - both decide what
        // the card holds, not how it looks.
        const pair2 = document.createElement("div");
        pair2.className = "content-pair";
        // Only one of the three ways of measuring names an entity, so the
        // picker for it hangs off the choice rather than standing beside it.
        const refEntity = this._bareRow(
          this._picker("reference", {
            entity: { filter: [{ domain: "person" }, { domain: "device_tracker" }, { domain: "zone" }] },
          })
        );
        refEntity.dataset.withRefEntity = "";
        pair2.appendChild(
          this._contentBlock(str.edReference, str.edReferenceHelp, [
            this._bareRow(
              this._select("reference_mode", [
                { value: "area", label: str.refModeArea },
                { value: "map", label: str.refModeMap },
                { value: "entity", label: str.refModeEntity },
              ])
            ),
            refEntity,
          ])
        );
        // The number belongs to the switch above it: there is nothing to cap
        // the list at while the cap is off.
        const maxNumber = this._bareRow(this._numberInput("max", 1, 100));
        maxNumber.dataset.withMax = "";
        // Both of these trim a list, and the minimal format has none: its
        // two numbers count what the area has, and its pop-up shows exactly
        // what the number that opened it counted.
        const reports = this._contentBlock(str.edGroupContentReports, str.edGroupContentReportsHelp, [
          this._toggleRow("only_new", str.edOnlyNew, str.edOnlyNewHelp),
          this._toggleRow("show_max", str.edMax, str.edMaxHelp),
          maxNumber,
        ]);
        reports.dataset.withoutMinimal = "";
        pair2.appendChild(reports);
        body.appendChild(pair2);
      }

      // What a list entry is made of - the behaviour of the list, not its
      // looks, which live under Layout -> List.
      if (groupKey === "rows") {
        body.appendChild(this._offNote("list", str));
        // First, because it decides what the list is before anything else
        // here decides what one entry of it says.
        body.appendChild(
          this._fieldRow(str.edSort, str.edSortHelp,
            this._select("sort", [
              { value: "distance", label: str.sortDistance },
              { value: "newest", label: str.sortNewest },
              { value: "oldest", label: str.sortOldest },
            ]))
        );
        // What a click on an entry does comes next: it is the one thing here
        // that answers for the list as a whole rather than for a part of it.
        const centre = this._toggleRow("center_on_click", str.edCenterOnClick, str.edCenterOnClickHelp);
        // Nothing to aim without a map.
        centre.dataset.withMap = "";
        body.appendChild(centre);
        // Nothing to follow without a map either.
        const follow = this._toggleRow("follow_map", str.edFollowMap, str.edFollowMapHelp);
        follow.dataset.withMap = "";
        body.appendChild(follow);
        body.appendChild(this._toggleRow("show_divider", str.edDivider, str.edDividerHelp));
        // Then how much of the list stands before it folds. Only the portrait
        // format: side by side the list already has a height of its own to
        // scroll in, and the minimal format has no list on the card at all.
        const fold = this._toggleRow("collapse_list", str.edCollapse, str.edCollapseHelp);
        fold.dataset.withPortrait = "";
        body.appendChild(fold);
        // The number belongs to the switch above it, the same way the cap on
        // the list does: nothing to count to while the fold is off.
        const foldAfter = this._fieldRow(
          str.edCollapseAfter, str.edCollapseAfterHelp, this._numberInput("collapse_after", 1, 100)
        );
        foldAfter.dataset.withPortrait = "";
        foldAfter.dataset.withFold = "";
        body.appendChild(foldAfter);

        // Laid out the way an entry is: the symbol on the left, and beside it
        // the three lines, then the chips along the bottom. One
        // sees where a switch will take effect instead of reading a list.
        const shape = document.createElement("div");
        shape.className = "row-shape";
        shape.innerHTML = `<div class="row-shape-pic"></div><div class="row-shape-body"></div>`;
        const pic = shape.querySelector(".row-shape-pic");
        const rowBody = shape.querySelector(".row-shape-body");
        pic.appendChild(this._toggleRow("show_row_picture", str.edRowPicture, str.edRowPictureHelp));
        // Under it, where the logo is drawn.
        const picSub = document.createElement("div");
        picSub.className = "row-shape-sub";
        picSub.appendChild(this._toggleRow("show_row_provider", str.edRowProvider, str.edRowProviderHelp));
        pic.appendChild(picSub);

        rowBody.appendChild(this._toggleRow("show_row_line1", str.edRowLine1, str.edRowLine1Help));
        const inner = document.createElement("div");
        inner.className = "row-shape-sub";
        inner.appendChild(this._toggleRow("show_row_distance", str.edRowDistance, str.edRowDistanceHelp));
        rowBody.appendChild(inner);

        rowBody.appendChild(this._toggleRow("show_row_line2", str.edRowLine2, str.edRowLine2Help));
        rowBody.appendChild(this._toggleRow("show_row_extra", str.edRowExtra, str.edRowExtraHelp));

        const chips = document.createElement("div");
        chips.className = "row-shape-chips";
        // Neither carries an "i": their names say what they are.
        chips.appendChild(this._toggleRow("show_row_reported", str.edRowReported, ""));
        chips.appendChild(this._toggleRow("show_row_until", str.edRowClosure, ""));
        rowBody.appendChild(chips);

        body.appendChild(shape);
      }

      if (groupKey === "display" || groupKey === "list") {
        if (groupKey === "list") body.appendChild(this._offNote("list", str));
        // First of all, because it is the only thing here that answers for
        // the whole card rather than for one piece of it.
        if (groupKey === "display") body.appendChild(this._backgroundBlock(str));

        // The card's own head lives under Layout -> General, everything a
        // list entry is made of under Layout -> List.
        const wanted = groupKey === "list" ? "list" : undefined;
        for (const [prefix, el] of Object.entries(DESIGN_ELEMENTS)) {
          if (el.tab !== wanted) continue;
          body.appendChild(this._designElement(prefix, el, str));
          if (prefix === "mini_delay") body.appendChild(this._miniTravelBlock(str));
          if (prefix === "refresh") body.appendChild(this._delayLineBlock(str));
        }
      }

      if (groupKey === "map") {
        body.appendChild(this._offNote("map", str));
        body.appendChild(
          (() => {
            const row = this._fieldRow(str.edAspect, str.edAspectHelp,
              this._select("map_aspect_ratio", [
                { value: "21:9", label: str.aspectPanorama },
                { value: "16:9", label: str.aspectWide },
                { value: "3:2", label: str.aspect32 },
                { value: "4:3", label: str.aspect43 },
                { value: "1:1", label: str.aspectSquare },
                { value: "3:4", label: str.aspectTall },
              ]));
            // Only the portrait format draws the map to a ratio. Side by side
            // it fills its half instead, and the minimal format has no map at
            // all - so there is nothing here to answer for.
            row.dataset.withRatio = "";
            return row;
          })()
        );
        body.appendChild(this._toggleRow("map_fade", str.edMapFade, str.edMapFadeHelp));
        body.appendChild(this._routeBlock(str));
        body.appendChild(this._trafficBlock(str));
        // Whether nearby reports are gathered into discs at all, and then
        // the discs' looks, which answer to this switch.
        const clusterRow = this._toggleRow("map_cluster", str.edMapCluster, str.edMapClusterHelp);
        clusterRow.dataset.withMap = "";
        clusterRow.dataset.needsCluster = "";
        body.appendChild(clusterRow);
        body.appendChild(this._clusterBlock(str));
        // What a click on the map does to the list is set here too, since it
        // is the map that decides which entry is meant.
        for (const [prefix, el] of Object.entries(DESIGN_ELEMENTS)) {
          if (el.tab !== "map") continue;
          body.appendChild(this._designElement(prefix, el, str));
        }
      }

      return body;
    }

    _render() {
      if (!this._hass || !this._config) return;
      const str = t(this._hass);

      if (!this.shadowRoot) this.attachShadow({ mode: "open" });

      if (!this.shadowRoot.querySelector(".super-panel")) {
        this.shadowRoot.innerHTML = `<style>${EDITOR_STYLE}</style>`;
        for (const superGroup of SUPER_GROUPS) {
          const panel = document.createElement("div");
          panel.className = "super-panel";
          panel.dataset.super = superGroup.key;
          panel.innerHTML = `
            <div class="super-header">
              <div class="super-icon"><ha-icon icon="${superGroup.icon}"></ha-icon></div>
              <div class="super-text">
                <span class="super-title"></span>
                <span class="super-subtitle"></span>
              </div>
              <ha-icon class="super-chevron" icon="mdi:chevron-down"></ha-icon>
            </div>
            <div class="super-body">
              <div class="tabs"></div>
              <div class="super-content"></div>
            </div>`;
          panel.querySelector(".super-title").textContent =
            superGroup.key === "settings" ? str.edPanelSettings : str.edPanelLayout;
          panel.querySelector(".super-subtitle").textContent =
            superGroup.key === "settings" ? str.edPanelSettingsDesc : str.edPanelLayoutDesc;
          panel
            .querySelector(".super-header")
            .addEventListener("click", () => this._toggleSuper(superGroup.key));

          const tabsEl = panel.querySelector(".tabs");
          const contentEl = panel.querySelector(".super-content");
          for (const groupKey of superGroup.groups) {
            const group = GROUPS.find((g) => g.key === groupKey);
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "tab";
            btn.dataset.key = groupKey;
            btn.innerHTML = `<ha-icon icon="${group.icon}"></ha-icon><span></span>`;
            btn.querySelector("span").textContent = this._groupText(groupKey, str);
            btn.addEventListener("click", () => this._selectTab(superGroup.key, groupKey));
            tabsEl.appendChild(btn);
            contentEl.appendChild(this._buildGroup(groupKey, str));
          }
          this.shadowRoot.appendChild(panel);
          this._selectTab(superGroup.key, superGroup.groups[0]);
        }
      }

      this._prepareTooltips();
      this._syncValues();
    }

    // Every "i" carries its text in a real element, floating above the icon on
    // hover - the Annuals editor's tooltip, which is the reference for this.
    //
    // Annuals gets it right with CSS alone: left-aligned above the icon by
    // default, and right-aligned (opening leftward) for the anchors its layout
    // puts near the right edge - `.toggle-group`, and the right-hand column of
    // a split row. The same two rules are below.
    //
    // An element rather than Annuals' ::after, for one reason only: a
    // pseudo-element's box cannot be measured, so the rule above can be
    // written but never checked. This one can, and _placeTooltip below is the
    // safety net that catches an anchor the CSS rules do not know about.
    _prepareTooltips() {
      for (const anchor of this.shadowRoot.querySelectorAll(".tooltip-anchor")) {
        let tip = anchor.querySelector(".tip");
        if (!tip) {
          tip = document.createElement("span");
          tip.className = "tip";
          anchor.appendChild(tip);
          anchor.addEventListener("pointerenter", () => this._placeTooltip(anchor));
        }
        tip.textContent = anchor.dataset.tooltip || "";
      }
    }

    // Keeps the tooltip inside the editor's own column.
    //
    // The column, not the dialog: the dialog is twice as wide because the card
    // preview sits beside the form, so a tooltip can be well inside the dialog
    // and still lie across the preview. That is what a check against the
    // dialog missed.
    //
    // And inside everything that clips it top to bottom (see _clipRect): below
    // the icon when there is no room above it, which is where a long tooltip
    // on a row near the top of the dialog's form column used to lose its
    // first lines.
    //
    // Overlapping the rows behind it is not a fault - it is what a floating
    // tooltip does, in Annuals as here. Being cut off is.
    _placeTooltip(anchor) {
      let tip = anchor.querySelector(".tip");
      if (!tip) {
        tip = document.createElement("span");
        tip.className = "tip";
        anchor.appendChild(tip);
      }
      tip.textContent = anchor.dataset.tooltip || "";
      // Put at 0,0 first: where that lands on screen is the corner of the
      // box a fixed element is placed in - the window, or a transformed
      // ancestor - and the offsets below are measured from it.
      tip.style.left = "0px";
      tip.style.top = "0px";
      const origin = tip.getBoundingClientRect();
      const width = origin.width;
      const height = origin.height;
      const icon = anchor.getBoundingClientRect();
      const pane = this.getBoundingClientRect();
      const box = this._clipRect(anchor);
      // Inside the editor's own column - the dialog is twice as wide, with
      // the preview beside the form - and inside whatever clips a fixed box.
      const minX = Math.max(pane.left, box.left) + 4;
      const maxX = Math.min(pane.right, box.right) - 4 - width;
      let x = icon.left;
      if (x > maxX) x = icon.right - width;
      x = Math.max(minX, Math.min(x, maxX));
      // Above the icon; below it when there is no room above; and when
      // neither side has the room, the side that cuts less.
      const minY = box.top + 4;
      const maxY = box.bottom - 4 - height;
      let y = icon.top - 6 - height;
      if (y < minY) {
        y = icon.bottom + 6;
        if (y > maxY) y = Math.max(minY, Math.min(icon.top - 6 - height, maxY));
      }
      tip.style.left = `${x - origin.left}px`;
      tip.style.top = `${y - origin.top}px`;
      // Not shown while the icon itself is scrolled out of sight: a fixed
      // box would otherwise go on floating where its row used to be.
      const seen = this._clipRect(anchor, false);
      const iconSeen = icon.bottom > seen.top && icon.top < seen.bottom && icon.right > seen.left && icon.left < seen.right;
      tip.style.visibility = iconSeen ? "" : "hidden";
      this._followTooltip(anchor, icon);
    }

    // A fixed box does not move with the row it belongs to, so while the
    // pointer rests on the icon - or, on a touch screen, until the next tap
    // elsewhere, which is how long a tap keeps it hovered - it is placed
    // again on every frame the icon has moved in: scrolling the form takes
    // the tooltip along, and out of sight with the icon. One follower at a
    // time; hovering the next icon hands over to it. It ends once the icon
    // is no longer hovered - but only after it has been: iOS reports the
    // touch before the finger lifts and applies :hover only afterwards, so
    // a second is allowed for that to happen.
    _followTooltip(anchor, rect) {
      if (this._tipFollowing === anchor) return;
      this._tipFollowing = anchor;
      let last = rect;
      let hovered = false;
      const started = performance.now();
      const step = () => {
        if (this._tipFollowing !== anchor) return;
        const onIcon = anchor.isConnected && anchor.matches(":hover");
        if (onIcon) hovered = true;
        if (!anchor.isConnected || (!onIcon && (hovered || performance.now() - started > 1000))) {
          this._tipFollowing = null;
          return;
        }
        if (!onIcon) {
          requestAnimationFrame(step);
          return;
        }
        const now = anchor.getBoundingClientRect();
        if (now.top !== last.top || now.left !== last.left) {
          last = now;
          this._placeTooltip(anchor);
        }
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }

    // The area a fixed tooltip can be seen in: the window, narrowed by the
    // ancestor it is fixed to and every ancestor of that one which clips
    // its content. The scrolling areas below that ancestor - the form
    // column, the dialog body - do not clip a fixed box, which is the point
    // of it (see _placeTooltip). An ancestor becomes the box a fixed
    // element is placed in when it has a transform, a filter or paint
    // containment - the edit dialog has one - and without any such
    // ancestor the window alone is the bound. The walk follows the rendered
    // tree, through the slot an element is shown in before its parent: the
    // dialog slots the form column into its own shadow DOM.
    //
    // With fixed set to false, the area the icon itself can be seen in
    // instead: every clipping ancestor counts, the scrolling ones included.
    _clipRect(from, fixed = true) {
      const nextUp = (node) =>
        node.assignedSlot || node.parentElement || (node.getRootNode() && node.getRootNode().host) || null;
      const holdsFixed = (style) =>
        style.transform !== "none" ||
        style.perspective !== "none" ||
        style.filter !== "none" ||
        (style.backdropFilter && style.backdropFilter !== "none") ||
        (style.translate && style.translate !== "none") ||
        (style.scale && style.scale !== "none") ||
        (style.rotate && style.rotate !== "none") ||
        /transform|perspective|filter/.test(style.willChange || "") ||
        /paint|layout|strict|content/.test(style.contain || "") ||
        (style.containerType && style.containerType !== "normal");
      // The layout viewport, the space getBoundingClientRect and a fixed
      // box are measured in - not innerWidth/innerHeight, which on iOS
      // shrink to the visible part of a pinch-zoomed page.
      const root = document.documentElement;
      const box = { top: 0, bottom: root.clientHeight, left: 0, right: root.clientWidth };
      let fixedTo = !fixed;
      for (let node = nextUp(from || this); node && node !== document.documentElement; node = nextUp(node)) {
        const style = getComputedStyle(node);
        if (!fixedTo && holdsFixed(style)) fixedTo = true;
        if (!fixedTo) continue;
        if (style.overflowX === "visible" && style.overflowY === "visible") continue;
        const r = node.getBoundingClientRect();
        box.top = Math.max(box.top, r.top);
        box.bottom = Math.min(box.bottom, r.bottom);
        box.left = Math.max(box.left, r.left);
        box.right = Math.min(box.right, r.right);
      }
      return box;
    }

    // Walks out of this editor's own shadow root to find the dialog container
    // that actually clips a dropdown - its bottom edge, not the window's.
    _scrollAncestorRect() {
      const nextUp = (node) =>
        node.parentElement || (node.getRootNode() && node.getRootNode().host) || null;
      let node = nextUp(this);
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) {
          return node.getBoundingClientRect();
        }
        node = nextUp(node);
      }
      return { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
    }

    // Resolves a theme variable or colour name to the hex the native colour
    // square needs. Probed against the document, not this shadow root: the
    // sync can run before the editor is in the DOM, and getComputedStyle on a
    // detached node resolves nothing - the swatch would fall back to white.
    _resolveToHex(value) {
      if (!value) return null;
      if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
      const probe = document.createElement("span");
      probe.style.display = "none";
      probe.style.color = value;
      document.body.appendChild(probe);
      const rgb = getComputedStyle(probe).color;
      probe.remove();
      const parts = rgb.match(/[\d.]+/g);
      if (!parts || parts.length < 3) return null;
      const hex = (n) =>
        Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, "0");
      return `#${hex(parts[0])}${hex(parts[1])}${hex(parts[2])}`;
    }

    _syncColorRow(key, value, fallback, str) {
      const textInput = this.shadowRoot.querySelector(`input[data-color-text="${key}"]`);
      const colorInput = this.shadowRoot.querySelector(`input[data-color="${key}"]`);
      if (!colorInput) return;
      if (!this._hasFocus(textInput)) textInput.value = value;
      colorInput.value = this._resolveToHex(value || fallback) || "#ffffff";

      const select = this.shadowRoot.querySelector(`.preset-select[data-preset-for="${key}"]`);
      const preset = PRESET_COLORS.find((p) => p.value === value);
      const swatch = select.querySelector(".preset-btn .preset-swatch");
      swatch.style.background = value || "transparent";
      swatch.style.boxShadow = value
        ? "inset 0 0 0 1px rgba(0, 0, 0, 0.15)"
        : "inset 0 0 0 2px var(--divider-color, #ccc)";
      select.querySelector(".preset-name").textContent = preset
        ? str[preset.labelKey]
        : str.presetCustom;
    }

    // Whether the card this editor is editing draws a map at all. One switch
    // for both places it can be drawn: under the head, or in the minimal
    // format's pop-up.
    _wantsMapHere() {
      return this._config.show_map !== false;
    }

    // Values are pushed into the already-built controls rather than the form
    // being rebuilt: rebuilding would close whichever panel is open and drop
    // the focus out of the field being typed into.
    _syncValues() {
      if (!this.shadowRoot || !this._config) return;
      const str = t(this._hass);
      this.shadowRoot.querySelectorAll("ha-selector").forEach((el) => {
        el.hass = this._hass;
        const value = this._config[el.dataset.key];
        if (value !== el.value) el.value = value;
      });
      this.shadowRoot.querySelectorAll("input[data-field], select[data-field]").forEach((el) => {
        const value = this._config[el.dataset.field];
        const next = value === undefined || value === null ? "" : String(value);
        // A value the dropdown has no entry for - one written by hand in the
        // YAML - is given one, rather than the field falling blank and the
        // next change quietly overwriting what somebody chose.
        if (el.tagName === "SELECT" && next && ![...el.options].some((o) => o.value === next)) {
          const extra = document.createElement("option");
          extra.value = next;
          extra.textContent = next;
          el.appendChild(extra);
        }
        if (el.value !== next && !this._hasFocus(el)) el.value = next;
      });
      this.shadowRoot.querySelectorAll("input[data-toggle]").forEach((el) => {
        const on = this._config[el.dataset.toggle] === true;
        el.checked = el.dataset.invert ? !on : on;
      });
      // With the list or the map switched off, the tabs that set them up keep
      // only the note saying so - the tabs themselves stay, or the setting
      // would be unfindable. Two tabs belong to the list, one to the map.
      //
      // This sweep goes first because it touches every row of those tabs at
      // once; the rules for single rows below then have the last word. The
      // other way round, this one silently unhid a row they had just hidden -
      // which is what left "List follows the map" showing with no map.
      // In the minimal format these tabs answer for the pop-up rather than
      // for the card - and by the same two switches, which is why there is
      // nothing to tell apart here any more.
      const minimal = this._config.layout === "minimal";
      const tabOff = {
        rows: this._config.show_list === false,
        list: this._config.show_list === false,
        map: this._config.show_map === false,
      };
      this.shadowRoot.querySelectorAll(".off-note").forEach((note) => {
        note.hidden = !tabOff[note.dataset.off];
      });
      for (const key of Object.keys(tabOff)) {
        const body = this.shadowRoot.querySelector(`.group-body[data-group="${key}"]`);
        if (!body) continue;
        for (const child of body.children) {
          if (child.classList.contains("off-note")) continue;
          child.hidden = tabOff[key];
        }
      }
      // Each of these assigns rather than ORs, so a row comes back when its
      // own reason for hiding goes away - but a row inside a tab that is off
      // as a whole stays hidden.
      const inOffTab = (el) => {
        const body = el.closest(".group-body");
        return !!body && tabOff[body.dataset.group] === true;
      };
      // Nothing to pick from a line that is not drawn - and the minimal
      // format draws none.
      this.shadowRoot.querySelectorAll("[data-with-sub]").forEach((row) => {
        row.hidden = minimal || this._config.show_sub === false || inOffTab(row);
      });
      // The delay line's thresholds and colours, with the travel time it
      // stands under.
      this.shadowRoot.querySelectorAll("[data-with-travel-time]").forEach((row) => {
        row.hidden = this._config.show_travel_time === false || inOffTab(row);
      });
      this.shadowRoot.querySelectorAll("[data-with-mini-travel]").forEach((row) => {
        row.hidden = !minimal || this._config.mini_show_travel === false || inOffTab(row);
      });
      // The minimal line's travel time: what each colour falls back to is
      // what the stylesheet draws at that level without one.
      for (const [key, fallback] of [
        ["mini_travel_ok_icon_color", "var(--secondary-text-color)"],
        ["mini_travel_ok_color", "var(--primary-text-color)"],
        ["mini_travel_ok_fill_color", "var(--ha-card-background, var(--card-background-color))"],
        ["mini_travel_warn_icon_color", "var(--warning-color, #ffa600)"],
        ["mini_travel_warn_color", "var(--warning-color, #ffa600)"],
        ["mini_travel_warn_fill_color", "var(--warning-color, #ffa600)"],
        ["mini_travel_alert_icon_color", "var(--error-color, #db4437)"],
        ["mini_travel_alert_color", "var(--error-color, #db4437)"],
        ["mini_travel_alert_fill_color", "var(--error-color, #db4437)"],
      ]) {
        this._syncColorRow(key, this._config[key] || "", fallback, str);
      }
      // Nothing to aim without a map.
      this.shadowRoot.querySelectorAll("[data-with-map]").forEach((row) => {
        row.hidden = !this._wantsMapHere() || inOffTab(row);
      });
      // Following needs a map whose viewport the list is tied to: the
      // card's, or in the minimal format the pop-up's.
      // The settings only the minimal format has, and the ones it has no
      // use for.
      this.shadowRoot.querySelectorAll("[data-with-minimal]").forEach((row) => {
        row.hidden = !minimal;
      });
      this.shadowRoot.querySelectorAll("[data-without-minimal]").forEach((row) => {
        row.hidden = minimal;
      });
      // Only one of the three ways of measuring names an entity.
      this.shadowRoot.querySelectorAll("[data-with-ref-entity]").forEach((row) => {
        row.hidden = this._config.reference_mode !== "entity" || inOffTab(row);
      });
      // The card background: its own colour swatch, its preview, and the
      // four rows that only mean something once it is switched on.
      this._syncColorRow(
        "card_background_color",
        this._config.card_background_color || "",
        "var(--ha-card-background, var(--card-background-color))",
        str
      );
      const bgPreview = this.shadowRoot.querySelector("[data-bg-preview]");
      if (bgPreview) {
        const src = this._config.card_background_image || "";
        bgPreview.hidden = !src;
        if (src) bgPreview.querySelector("img").src = src;
      }
      this.shadowRoot.querySelectorAll("[data-with-card-bg]").forEach((row) => {
        row.hidden = this._config.card_background !== true;
      });
      // Two settings the portrait format alone has a use for.
      this.shadowRoot.querySelectorAll("[data-with-portrait]").forEach((row) => {
        row.hidden = (this._config.layout || "portrait") !== "portrait" || inOffTab(row);
      });
      // And no number to type while nothing is folded away.
      this.shadowRoot.querySelectorAll("[data-with-fold]").forEach((row) => {
        row.hidden =
          this._config.collapse_list !== true ||
          (this._config.layout || "portrait") !== "portrait" ||
          inOffTab(row);
      });
      // A ratio is only ever drawn in the portrait format.
      this.shadowRoot.querySelectorAll("[data-with-ratio]").forEach((row) => {
        row.hidden = (this._config.layout || "portrait") !== "portrait" || inOffTab(row);
      });
      // The route's looks answer to the switch that draws it.
      this.shadowRoot.querySelectorAll("[data-with-route]").forEach((row) => {
        row.hidden = this._config.map_route === false || !this._wantsMapHere() || inOffTab(row);
      });
      // The traffic flow's lines answer to its own switch.
      this.shadowRoot.querySelectorAll("[data-with-traffic]").forEach((row) => {
        row.hidden = this._config.map_traffic === false || !this._wantsMapHere() || inOffTab(row);
      });
      // And the discs' looks to the switch that draws them.
      this.shadowRoot.querySelectorAll("[data-with-cluster]").forEach((row) => {
        row.hidden = this._config.map_cluster === false || !this._wantsMapHere() || inOffTab(row);
      });
      // The switch itself needs a map that knows the option - Home Assistant
      // 2026.10 or newer. On an older one it stays where it is, greyed out,
      // with its tooltip saying why: a switch that simply vanished would
      // send anyone who read about it looking for it.
      const switchable = mapClusterSwitchable(this._hass);
      this.shadowRoot.querySelectorAll("[data-needs-cluster]").forEach((row) => {
        row.classList.toggle("disabled", !switchable);
        const control = row.querySelector("input[data-toggle], select[data-field]");
        if (control) control.disabled = !switchable;
      });
      this._syncColorRow("route_color", this._config.route_color || "", "var(--primary-color)", str);
      // What the colour falls back to is what the map draws without one: the
      // primary colour on the disc through 2026.9, the card background on the
      // bubble from 2026.10.
      this._syncColorRow(
        "cluster_color",
        this._config.cluster_color || "",
        haAtLeast(this._hass, 2026, 10) && this._config.cluster_style !== "disc"
          ? "var(--card-background-color)"
          : "var(--primary-color)",
        str
      );
      this._syncColorRow(
        "cluster_text_color", this._config.cluster_text_color || "", "var(--text-primary-color)", str
      );
      // What each delay colour falls back to is the theme colour the line
      // is drawn in without one.
      for (const [key, fallback] of [
        ["delay_ok_color", "var(--success-color, #43a047)"],
        ["delay_warn_color", "var(--warning-color, #ffa600)"],
        ["delay_alert_color", "var(--error-color, #db4437)"],
      ]) {
        this._syncColorRow(key, this._config[key] || "", fallback, str);
      }
      // No number to type while the list is not capped at all.
      this.shadowRoot.querySelectorAll("[data-with-max]").forEach((row) => {
        row.hidden = this._config.show_max !== true || inOffTab(row);
      });
      for (const [prefix, el] of Object.entries(DESIGN_ELEMENTS)) {
        if (!el.noColor) {
          this._syncColorRow(`${prefix}_color`, this._config[`${prefix}_color`] || "", el.fallback, str);
        }
        if (el.extra) {
          this._syncColorRow(el.extra.key, this._config[el.extra.key] || "", el.extra.fallback, str);
        }
        if (el.icon && el.icon.color) {
          this._syncColorRow(
            el.icon.color.key,
            this._config[el.icon.color.key] || "",
            el.icon.color.fallback,
            str
          );
        }
        // A background colour only means anything while there is a
        // background. The row is hidden rather than removed, so its wiring
        // survives being switched off and on again.
        if (el.bgToggle && el.extra) {
          const input = this.shadowRoot.querySelector(`input[data-color="${el.extra.key}"]`);
          const row = input && input.closest(".field-row");
          if (row) row.style.display = this._config[el.bgToggle.key] === false ? "none" : "";
        }
        // A block whose element the card does not draw at all has nothing to
        // offer, so it goes rather than sitting there doing nothing - and the
        // whole of Layout -> List goes with the list itself.
        const block = this.shadowRoot.querySelector(`[data-design="${prefix}"]`);
        if (block) {
          block.hidden =
            (el.hidden ? el.hidden(this._config) : false) || tabOff[el.tab] === true;
        }
      }
    }
  }

  const EDITOR_STYLE = `
    /* Every row in this editor is given an explicit display - flex, grid -
       and any of those beats the browser's own [hidden] { display: none } on
       specificity. So the .hidden property, which the sync uses to put a
       setting away, silently did nothing. This one line makes it mean what it
       says, for every rule here and every one added later. */
    [hidden] { display: none !important; }
    .super-panel {
      border: 2px solid rgba(128, 128, 128, 0.4);
      border-radius: 12px;
      margin-bottom: 16px;
      background-color: var(--card-background-color, #1c1c1c);
      overflow: hidden;
    }
    .super-header {
      display: grid;
      grid-template-columns: 36px 1fr 16px;
      align-items: center;
      gap: 0 10px;
      padding: 14px 16px;
      background-color: rgba(255, 255, 255, 0.05);
      cursor: pointer;
    }
    .super-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background-color: rgba(74, 144, 217, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--primary-color);
      flex-shrink: 0;
    }
    .super-icon ha-icon { --mdc-icon-size: 18px; }
    .super-text { display: flex; flex-direction: column; min-width: 0; }
    .super-title {
      font-size: 15px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--primary-text-color, #e1e1e1);
    }
    .super-subtitle {
      font-size: 11px;
      color: var(--secondary-text-color, #9b9b9b);
    }
    .super-chevron {
      --mdc-icon-size: 16px;
      color: var(--secondary-text-color);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      justify-self: end;
    }
    .super-panel.open .super-chevron { transform: rotate(180deg); }
    .super-body { display: none; padding: 0 16px 16px; }
    .super-panel.open .super-body { display: block; }
    .tabs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 2px;
      padding: 4px;
      margin: 6px 0 16px;
      background: rgba(127, 127, 127, 0.1);
      border-radius: 10px;
    }
    .tab {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px 10px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--secondary-text-color);
      font: inherit;
      font-weight: 400;
      font-size: 11.5px;
      letter-spacing: 0.46px;
      text-transform: uppercase;
      cursor: pointer;
      transition: 0.2s;
    }
    .tab ha-icon { --mdc-icon-size: 13px; flex-shrink: 0; }
    .tab.active {
      background: var(--card-background-color, #1c1c1c);
      color: var(--primary-color);
      font-weight: 600;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
    }
    .field-row { margin-bottom: 16px; }
    .field-label {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin-bottom: 6px;
      font-size: 0.9em;
      font-weight: 500;
    }
    .field-input-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      row-gap: 8px;
      gap: 8px;
    }
    .field-input-row input[type="text"],
    .field-input-row input[type="number"],
    .field-input-row select {
      flex: 1;
      min-width: 0;
      padding: 8px;
      border-radius: 4px;
      border: 1px solid var(--divider-color, #e0e0e0);
      background: var(--card-background-color, transparent);
      color: inherit;
      font: inherit;
    }
    .field-input-row select { cursor: pointer; }
    .field-input-row ha-selector { flex: 1; min-width: 0; }
    /* Home Assistant's own pickers draw themselves as a filled box with an
       underline, which sits oddly beside this editor's plain bordered fields.
       They read three inheritable variables for it, so handing them our own
       values is enough to make them match - no reaching into their shadow
       roots. Their inner row keeps Home Assistant's fixed 56px height. */
    .field-input-row ha-selector {
      --ha-color-form-background: transparent;
      --ha-color-border-neutral-loud: transparent;
      --ha-border-radius-sm: 4px;
      display: block;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      background: var(--card-background-color, transparent);
    }
    /* The two halves of the Content tab, equally wide and each read top to
       bottom. They fall under one another once the pane is too narrow for
       two dropdowns side by side. */
    .content-pair {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 0 16px;
      margin-bottom: 8px;
    }
    .content-block { min-width: 0; }
    .content-block .group-label-row { margin-bottom: 8px; }
    .content-block .toggle-row { margin-bottom: 10px; }
    /* Stands in for a tab's settings while the list is off. */
    .off-note {
      margin: 4px 0 8px;
      padding: 10px 12px;
      border-radius: 6px;
      border-inline-start: 3px solid var(--primary-color);
      background: rgba(127, 127, 127, 0.12);
      color: var(--secondary-text-color);
      font-size: 0.9em;
      line-height: 1.4;
    }
    .toggle-row {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 12px;
      margin-bottom: 16px;
    }
    .toggle {
      position: relative;
      display: inline-block;
      width: 30px;
      height: 16px;
      flex-shrink: 0;
      cursor: pointer;
    }
    .toggle input { position: absolute; opacity: 0; width: 0; height: 0; }
    .toggle .track {
      position: absolute;
      inset: 0;
      background: var(--disabled-text-color, #ccc);
      border-radius: 20px;
      transition: 0.2s;
    }
    .toggle .track::before {
      content: "";
      position: absolute;
      width: 12px;
      height: 12px;
      inset-inline-start: 2px;
      top: 2px;
      background: #fff;
      border-radius: 50%;
      transition: 0.2s;
    }
    .toggle input:checked + .track { background: var(--primary-color); }
    .toggle input:checked + .track::before { inset-inline-start: 16px; }
    /* A switch this Home Assistant cannot act on: still there, still
       explained by its "i", but plainly not for turning. */
    .toggle-row.disabled .toggle { cursor: default; }
    .toggle-row.disabled .toggle .track,
    .toggle-row.disabled .toggle-label { opacity: 0.45; }
    .toggle-label {
      font-size: 0.85em;
      color: var(--secondary-text-color);
    }
    /* Anchored on a plain span rather than the ha-icon itself: Annuals found
       Chromium paints a tooltip generated on a shadow-hosting element in a way
       that does not reliably stack above the rows behind it. */
    .tooltip-anchor { position: relative; display: flex; cursor: help; }
    .tooltip-anchor ha-icon { --mdc-icon-size: 16px; opacity: 0.6; }
    .tip {
      position: fixed;
      left: 0;
      top: 0;
      z-index: 20;
      width: max-content;
      max-width: 220px;
      padding: 6px 10px;
      border-radius: 6px;
      background-color: #383838;
      opacity: 1;
      color: #fff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      font-size: 12px;
      font-weight: 400;
      text-transform: none;
      letter-spacing: normal;
      white-space: normal;
      text-align: start;
      visibility: hidden;
      pointer-events: none;
    }
    .tooltip-anchor:hover .tip { visibility: visible; }
    /* Marks a row as a dependent sub-option of the block above it -
       indented, smaller, with a left border, so it reads as belonging to
       that block rather than as a peer field. */
    .sub-field-row {
      margin: -8px 0 16px 20px;
      padding-inline-start: 12px;
      border-inline-start: 2px solid var(--divider-color, #e0e0e0);
    }
    /* A sub-row inside a sub-row: the letter-spacing line under an already
       indented font row. */
    .sub-field-row-nested { margin-inline-start: 32px; }
    .sub-field-row .field-label { font-size: 0.8em; }
    .sub-field-row .field-label ha-icon,
    .sub-field-row .tooltip-anchor ha-icon { --mdc-icon-size: 14px; }
    .sub-field-row .field-input-row input[type="text"] {
      padding: 6px 8px;
      font-size: 0.85em;
    }
    .sub-field-row .field-input-row input[type="color"] { width: 28px; height: 28px; }
    /* Home Assistant's own icon picker is the one control here that is not a
       plain input, and it draws itself at full height - shrunk to match the
       smaller rows it sits among. */
    .sub-field-row .field-input-row ha-selector { --mdc-typography-subtitle1-font-size: 0.85em; }
    .sub-field-row .preset-btn { padding: 4px 6px; font-size: 0.8em; max-width: 110px; }
    .sub-field-row .preset-btn .preset-swatch { width: 14px; height: 14px; }
    /* Names the indented block that follows it and has no control of its
       own, so the gap a field row leaves for one would just be a hole. The
       first row under it has to give back .sub-field-row's -8px pull, which
       exists to tuck a sub-row under its parent field and here would tuck
       the heading away. */
    .group-label-row {
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    .group-label-row + .sub-field-row { margin-top: 0; }
    .group-label-row { cursor: pointer; }
    .group-label-row.plain-label-row { cursor: default; }
    /* A heading over a run of switches in a tab, the way a content block's
       is over its rows: set off from the row above it. */
    .group-body > .plain-label-row { margin-top: 14px; margin-bottom: 4px; }
    .group-label-row:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    .design-chevron {
      --mdc-icon-size: 16px;
      margin-inline-start: auto;
      color: var(--secondary-text-color);
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .design-element.open .design-chevron { transform: rotate(180deg); }
    /* Folded away, heading and all its rows - the heading stays, so the tab
       reads as a list of what can be styled rather than a wall of fields.
       A row the sync has hidden for its own reason keeps its inline
       display:none and stays hidden when the block is opened. */
    .design-element:not(.open) .sub-field-row { display: none; }
    /* A switch used as a sub-row keeps the indent and the rule of the field
       rows around it, but not their bottom gap - they stack as one list. */
    .sub-toggle-row { display: flex; }
    .design-element:not(.open) .sub-toggle-row { display: none; }
    /* The list settings, arranged the way a list entry is drawn: the symbol
       in its own column, everything else beside it, and the three labels that
       sit side by side under an entry side by side here too. */
    .row-shape {
      display: grid;
      /* The symbol's column as wide as its labels, up to a share of the
         sketch, so the lines beside it keep room in a narrow editor. */
      grid-template-columns: fit-content(45%) minmax(0, 1fr);
      gap: 4px 12px;
      margin-top: 20px;
      padding-top: 12px;
      border-top: 1px dashed var(--divider-color, #444);
    }
    .row-shape .toggle-row { margin-bottom: 10px; }
    .row-shape-sub {
      margin: -4px 0 10px 20px;
      padding-inline-start: 12px;
      border-inline-start: 2px solid var(--divider-color, #e0e0e0);
    }
    .row-shape-sub .toggle-row { margin-bottom: 6px; }
    /* Three across, the way they sit under an entry. A grid rather than a
       wrapping row, so the third one keeps its place in the narrow editor
       pane instead of dropping to a line of its own. */
    /* Three across, the way they sit under an entry. A grid rather than a
       wrapping row: at the dialog's width the three of them do not fit on one
       line on their own, and a grid keeps the third in place instead of
       dropping it to a line of its own. */
    .row-shape-chips { display: flex; flex-wrap: wrap; gap: 4px 16px; }
    .row-shape-chips .toggle-row { gap: 6px; }
    .row-shape-chips .toggle-label { white-space: nowrap; }
    .row-shape-chips .toggle-row { margin-bottom: 0; }
    .design-element { margin-bottom: 20px; }
    .design-element:not(.open) { margin-bottom: 8px; }
    .design-element:not(.open) .group-label-row { margin-bottom: 0; }
    /* Each style switch labels itself in the style it turns on, so the row
       shows what the switches do without reading a word of it. */
    .toggle-label-bold { font-weight: 700; }
    .toggle-label-italic { font-style: italic; }
    .toggle-label-uppercase { text-transform: uppercase; }
    .toggle-label-underline { text-decoration: underline; }
    /* A switch that belongs to the row above it - "Show background" under a
       colour row - takes a line of its own at the row's right end rather
       than squeezing in beside the colour controls. */
    .field-input-row > .toggle-group { flex-basis: 100%; justify-content: flex-end; margin-top: 4px; }
    .field-input-row > .field-toggles {
      flex-basis: 100%;
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      row-gap: 8px;
      gap: 16px;
      white-space: nowrap;
    }
    .toggle-group {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    /* The image row: a square button beside the field, and under it the
       picture itself with a way to take it off again. Annuals' own. */
    .upload-btn { display: flex; align-items: center; justify-content: center;
                  width: 36px; height: 36px; flex-shrink: 0; border-radius: 6px;
                  border: 1px solid var(--divider-color, #e0e0e0);
                  background: var(--card-background-color, transparent);
                  color: inherit; cursor: pointer; }
    .upload-btn:hover { background: var(--secondary-background-color, rgba(0, 0, 0, 0.05)); }
    .upload-btn ha-icon { --mdc-icon-size: 18px; }
    .bg-image-preview { position: relative; display: inline-block; margin-top: 8px;
                        width: fit-content; }
    .bg-image-preview img { display: block; max-width: 100%; max-height: 120px;
                            border-radius: 6px; border: 1px solid var(--divider-color, #e0e0e0); }
    .bg-image-clear { position: absolute; top: 4px; inset-inline-end: 4px; width: 22px; height: 22px;
                      border-radius: 50%; border: none; background: rgba(0, 0, 0, 0.6);
                      color: #fff; display: flex; align-items: center;
                      justify-content: center; cursor: pointer; }
    .bg-image-clear ha-icon { --mdc-icon-size: 14px; }
    /* A number whose unit belongs inside the field rather than in its label. */
    .unit-input-wrap { position: relative; flex: 1; min-width: 0; display: flex; }
    .unit-input-wrap input[type="number"] { width: 100%; padding-inline-end: 32px; }
    .unit-suffix { position: absolute; top: 50%; inset-inline-end: 10px; transform: translateY(-50%);
                   color: var(--secondary-text-color); font-size: 0.9em;
                   pointer-events: none; }
    /* On a label line, pushed to the far end of it. The label itself is a
       wrapping flex row, so on a column too narrow to hold both the switch
       drops to its own line rather than squeezing the heading. */
    .field-label > .inline-toggle { margin-inline-start: auto; font-weight: 400; }
    .field-input-row input[type="color"] {
      width: 36px;
      height: 36px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: none;
      cursor: pointer;
      flex-shrink: 0;
    }
    /* border:none only removes the frame around the control; the coloured
       area inside is a separate shadow part the browser draws with its own
       grey frame and padding. At 28px that frame mutes the colour enough
       that the swatch no longer reads as what the card renders. */
    .field-input-row input[type="color"]::-webkit-color-swatch-wrapper { padding: 0; }
    .field-input-row input[type="color"]::-webkit-color-swatch {
      /* A hairline of our own in its place: a swatch showing the card's
         background - the grouped reports' default from 2026.10 - would
         otherwise vanish into the dialog it sits in. */
      border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.4));
      border-radius: 6px;
    }
    .preset-select { position: relative; flex-shrink: 0; }
    .preset-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 4px;
      background: var(--card-background-color, transparent);
      color: inherit;
      font: inherit;
      font-size: 0.85em;
      cursor: pointer;
      max-width: 130px;
    }
    .preset-btn .preset-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      text-align: left;
    }
    .preset-btn ha-icon { --mdc-icon-size: 16px; opacity: 0.6; flex-shrink: 0; }
    .preset-swatch {
      width: 16px;
      height: 16px;
      border-radius: 50%;
      flex-shrink: 0;
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15);
    }
    .preset-menu {
      position: absolute;
      top: calc(100% + 4px);
      inset-inline-start: 0;
      z-index: 10;
      /* The height set on opening is the room measured between the button
         and the edge of whatever is scrolling. Without this the padding and
         the border are added on top of it and the menu ends up ten pixels
         taller than the room it was given - enough to have its last entry
         cut off by that edge in a short dialog. */
      box-sizing: border-box;
      max-height: 260px;
      overflow-y: auto;
      background: var(--card-background-color, #1c1c1c);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      min-width: 170px;
      padding: 4px;
    }
    /* Applied when there is no room below the button - rows near the bottom
       of the scrollable dialog open upward instead of being clipped by it. */
    .preset-menu.menu-up {
      top: auto;
      bottom: calc(100% + 4px);
    }
    .preset-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.85em;
    }
    .preset-item:hover { background: var(--secondary-background-color, rgba(0, 0, 0, 0.06)); }
  `;

  // ------------------------------------------------------------------ view
  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value).replace(
      /[&<>"']/g,
      (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch])
    );
  }

  // One of the head's switches: a track and its label, the checkbox inside
  // carrying what it is for. The track's colour when on comes from Layout ->
  // Switches, through a custom property so the stylesheet keeps the rest.
  // The traffic flow's button: a toggle drawn like the planner's Calculate,
  // filled in its colour while the flow is shown and outlined while it is
  // hidden. The colour is the one the Layout's "Traffic flow button" sets,
  // the theme's primary unless set.
  function trafficButtonHtml(what, label, on, config, title) {
    const colour = config.switch_track_color
      ? `--tomtom-switch-on: ${config.switch_track_color}; `
      : "";
    return `<button type="button" class="plan-btn traffic-btn" data-what="${what}" aria-pressed="${on ? "true" : "false"}"
        title="${escapeHtml(title || label)}" style="${escapeHtml(colour + elementStyle(config, "switch"))}">${escapeHtml(label)}</button>`;
  }

  // A refresh: its symbol, then what is inside it - the time of the last
  // fetch - in a rounded frame. `off` draws the same shape as a plain label,
  // for a traffic flow that is switched off and has nothing to fetch.
  function refreshPillHtml(config, what, title, innerHtml, off) {
    const cls = `refresh pill${config.refresh_background === false ? " bare" : ""}${off ? " off" : ""}`;
    const style = escapeHtml(elementStyle(config, "refresh"));
    const body = `${leadIconHtml(config, "refresh")}${innerHtml || ""}`;
    return off
      ? `<span class="${cls}" style="${style}">${body}</span>`
      : `<button type="button" class="${cls}" data-what="${what}"
            title="${escapeHtml(title)}" style="${style}">${body}</button>`;
  }

  function selectHtml(what, options, selected, style) {
    const opts = options
      .map(
        (o) =>
          `<option value="${escapeHtml(o.value)}"${o.value === selected ? " selected" : ""}${o.accent ? ' class="accent" style="color: var(--primary-color)"' : ""}>${escapeHtml(o.label)}</option>`
      )
      .join("");
    return `<select data-what="${what}" style="${escapeHtml(style || "")}">${opts}</select>`;
  }

  // The rule between two entries, as CSS variables the list's own rule reads.
  // Written on the list rather than on every row, so one declaration serves
  // however many rows there happen to be.
  function dividerStyle(config) {
    const parts = [];
    if (config.divider_color) parts.push(`--tomtom-divider-color: ${config.divider_color}`);
    if (config.divider_width) parts.push(`--tomtom-divider-width: ${config.divider_width}`);
    if (config.divider_style) parts.push(`--tomtom-divider-style: ${config.divider_style}`);
    return parts.join("; ");
  }

  // One report. The summary is split the way the Markdown card splits it:
  // everything after the em dash is TomTom's own free text and gets a
  // line of its own, and the last "·" segment is the address.
  // `newPrefix` is which element the NEW tag takes its look from: the card's
  // own list uses the head's NEW marker, so that a card marks one thing one
  // way; the minimal format's pop-up has no head to match and answers to an
  // element of its own.
  function rowHtml(row, str, isNew, config, highlighted, newPrefix = "new") {
    const a = row.state.attributes;
    const summary = a.summary || a.friendly_name || "";
    const head = summary.split(" — ")[0];
    const extra = summary.split(" — ").slice(1).join(" — ");
    const parts = head.split(" · ");
    const place = parts.length > 1 ? parts[parts.length - 1] : "";
    const whatParts = parts.length > 1 ? parts.slice(0, -1) : [head];
    const what = whatParts.join(" · ");
    const distance =
      config.show_row_distance !== false && Number.isFinite(row.distance)
        ? `${fmtNumber(row.distance, 1)} ${row.unit}`
        : "";

    const chips = [
      config.show_row_reported === false ? "" : reportedText(str, a),
      ...(config.show_row_reported === false ? [] : confirmedChip(str, a)),
      ...(config.show_row_until === false ? [] : untilChip(str, a)),
    ].filter(Boolean);
    const stars = config.show_row_reported === false ? "" : starsHtml(a);

    const line = (prefix, inner) =>
      `<div class="${prefix}" style="${escapeHtml(elementStyle(config, prefix))}">${leadIconHtml(
        config,
        prefix
      )}<span>${inner}</span></div>`;

    return `
      <div class="row${highlighted ? " hl" : ""}" data-entity="${escapeHtml(row.entityId)}"${highlighted && config.highlight_color ? ` style="background: ${escapeHtml(config.highlight_color)}"` : ""}>
        ${config.show_row_picture === false || !a.icon
          ? ""
          : `<div class="pic"><ha-icon icon="${escapeHtml(a.icon)}" style="${escapeHtml(
              [
                config.row_picture_size
                  ? `--mdc-icon-size: ${config.row_picture_size}; width: ${config.row_picture_size}; height: ${config.row_picture_size}`
                  : "",
                CAMERA_KINDS.has(a.type) ? `color: ${CAMERA_COLOR}` : "",
              ].filter(Boolean).join("; ")
            )}"></ha-icon>${config.show_row_provider ? providerBadgeHtml(a.provider) : ""}</div>`}
        <div class="body">
          ${config.show_row_line1 === false
            ? ""
            : line(
                "line1",
                `<b dir="auto">${escapeHtml(distance)}</b>${distance ? " · " : ""}${escapeHtml(what)}${
                  isNew
                    ? `<span class="new-tag" style="${escapeHtml(elementStyle(config, newPrefix))}">${escapeHtml(str.newLabel)}</span>`
                    : ""
                }`
              )}
          ${config.show_row_line2 === false || !place ? "" : line("line2", escapeHtml(place))}
          ${config.show_row_extra === false || !extra ? "" : line("extra", escapeHtml(extra))}
          ${chips.length || stars
            ? `<div class="chips">${chips
                .map(
                  (c) =>
                    `<span class="chip" style="${escapeHtml(elementStyle(config, "chip"))}">${escapeHtml(c)}</span>`
                )
                .join("")}${stars}</div>`
            : ""}
        </div>
      </div>`;
  }

  // Where each element of DESIGN_ELEMENTS is drawn. Naming one here is the
  // whole of what it takes for every setting that element has to be reachable
  // as a custom property as well - variableCss below reads the settings
  // themselves off DESIGN_ELEMENTS, so the two cannot drift apart.
  //
  // Three elements are missing on purpose: the rule between entries, the
  // highlight behind a picked one and the card background are custom
  // properties already, under the same names.
  const ELEMENT_CSS = {
    title: { name: "title", selector: ".title-text, .pop-title" },
    no_reports: { name: "no-reports", selector: ".empty" },
    mini: {
      name: "mini-total",
      selector: ".mini-half.total .mini-value, .mini-half.total .mini-label",
      icon: ".mini-half.total ha-icon",
    },
    mini_new: {
      name: "mini-new",
      selector: ".mini-half.new .mini-value, .mini-half.new .mini-label",
      icon: ".mini-half.new ha-icon",
    },
    mini_delay: {
      name: "mini-delay",
      selector: ".mini-half.delay .mini-value, .mini-half.delay .mini-label",
      icon: ".mini-half.delay ha-icon",
    },
    pop_new: { name: "pop-new", selector: ".pop-list .new-tag" },
    // The head badge and the tag in the card's own list, which is what this
    // element has always been both of. The pop-up's tag is pop_new above.
    new: { name: "new", selector: ".badge.new, .listwrap .new-tag" },
    delay: { name: "delay", selector: ".badge.delay" },
    travel_time: { name: "travel-time", selector: ".travel-time" },
    area_select: { name: "area-select", selector: 'select[data-what="area"]' },
    switch: { name: "switch", selector: ".traffic-btn" },
    planner: { name: "planner", selector: ".planner" },
    plan_title: { name: "plan-title", selector: ".plan-title" },
    plan_role: { name: "plan-role", selector: ".plan-role" },
    plan_button: { name: "plan-button", selector: ".planner .plan-btn" },
    plan_time: { name: "plan-time", selector: ".plan-time" },
    plan_facts: { name: "plan-facts", selector: ".plan-facts" },
    sub: { name: "sub", selector: ".sub", icon: ".sub .fit-icon" },
    refresh: { name: "refresh", selector: ".refresh.pill", icon: ".refresh .fit-icon" },
    row_picture: { name: "row-picture", selector: ".pic ha-icon", size: ["width", "height", "--mdc-icon-size"] },
    line1: { name: "row-line1", selector: ".line1" },
    line2: { name: "row-line2", selector: ".line2", icon: ".line2 .fit-icon" },
    extra: { name: "row-extra", selector: ".extra", icon: ".extra .fit-icon" },
    chip: { name: "row-chip", selector: ".chip" },
  };

  // Every look a text element can be given, as the CSS property it sets.
  const LOOK_PROPS = [
    "font-size",
    "font-weight",
    "font-style",
    "text-transform",
    "text-decoration",
    "letter-spacing",
  ];

  // One rule per element, giving each of its settings a custom property.
  // `revert-layer` is what makes this safe to add to a finished card: with
  // the property unset the declaration rolls back to the layer below, which
  // is the card's own stylesheet, so nothing changes look until somebody
  // sets one. A setting made in the editor is written as an inline style and
  // beats both - card setting, then variable, then the card's own default.
  //
  // Named --tomtom-<element>-<css-property> throughout: the element as the
  // editor names its block, the property as CSS spells it, never abbreviated.
  function variableCss() {
    const rules = [];
    for (const [key, el] of Object.entries(DESIGN_ELEMENTS)) {
      const where = ELEMENT_CSS[key];
      if (!where) continue;
      const v = (prop) => `var(--tomtom-${where.name}-${prop}, revert-layer)`;
      const decls = [];
      if (!el.noColor) decls.push(`color: ${v("color")}`);
      if (!el.noFont) for (const prop of LOOK_PROPS) decls.push(`${prop}: ${v(prop)}`);
      // Only a background that is drawn behind the words themselves. The
      // minimal line's two halves also carry a fill, but that one sits on a
      // layer of its own and has its own pair of properties.
      const bg = el.bgToggle || (el.extra && el.extra.key.endsWith("_background_color"));
      if (bg) decls.push(`background: ${v("background")}`);
      for (const prop of where.size || []) decls.push(`${prop}: ${v("size")}`);
      if (decls.length) rules.push(`${where.selector} { ${decls.join("; ")}; }`);
      if (el.icon && where.icon) {
        rules.push(
          `${where.icon} { color: ${v("icon-color")}; font-size: ${v("icon-size")};` +
            ` width: ${v("icon-size")}; height: ${v("icon-size")}; }`
        );
      }
    }
    return rules.join("\n    ");
  }

  const STYLE = `
    /* Every part of this card carries its own display, which beats the
       browser's own [hidden] rule - so a hidden part would keep its box and,
       being a flex item with height:100%, take the whole card with it. */
    [hidden] { display: none !important; }
    /* Home Assistant hands a resized card a fixed height, which the card
       fills. What gives way inside it is the list: it scrolls, rather than
       the card spilling out of its cell. Where no height is imposed - a
       masonry view, or the automatic row count - all of this resolves back
       to the height the contents want. */
    :host { display: block; height: 100%; }
    ha-card { padding: 12px 16px 8px; display: flex; flex-direction: column;
              height: 100%; box-sizing: border-box; overflow: hidden;
              container-type: inline-size; position: relative; }
    /* The card's own background on a layer of its own, behind everything
       the card draws and in front of the one the theme gives it. Its own
       layer because of the opacity: set on the card itself it would fade
       the text with it, and a half-faded list is not what "a background at
       70%" means. */
    ha-card::before {
      content: "";
      position: absolute;
      inset: 0;
      background-color: var(--tomtom-card-background-color, transparent);
      background-image: var(--tomtom-card-background-image, none);
      background-size: var(--tomtom-card-background-size, cover);
      background-repeat: var(--tomtom-card-background-repeat, no-repeat);
      background-position: center;
      opacity: var(--tomtom-card-background-opacity, 1);
      pointer-events: none;
      z-index: 0;
    }
    /* Everything the card draws sits above that layer. A positioned
       pseudo-element paints over plain in-flow children whatever their
       order, so each of the three has to say where it belongs. */
    .head, .split, .mini { position: relative; z-index: 1; }
    .split { display: flex; flex-direction: column; flex: 1; min-height: 0; }
    /* The list is what gives way when the card is short: it takes whatever
       is left and scrolls. The map gives way too, but only down to a height
       that is still a map - squeezed to a few pixels it reads as a fault,
       and a card that small is one the layout editor will not hand out
       anyway (see getGridOptions). */
    .listwrap { flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden; }
    /* The list's column - and, side by side, the planner's above it. */
    .side { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
    .side[hidden] { display: none; }
    .side .planner { flex: 0 0 auto; margin-top: 0; margin-bottom: 10px; }
    .mapwrap { flex: 0 1 auto; position: relative; }
    /* The soft edge itself is drawn inside the map rather than over it - see
       _styleMapChrome. From out here it would lie across the map's own
       buttons as well, which is what made them have to move out of its way. */
    .mapwrap:not(:empty) { min-height: 120px; }
    /* Side by side, in halves. The map fills its half rather than keeping a
       ratio, and the list scrolls in the other. */
    ha-card[data-layout="landscape"] .split { flex-direction: row; gap: 12px; margin-top: 12px; }
    ha-card[data-layout="landscape"] .mapwrap,
    ha-card[data-layout="landscape"] .side { flex: 1 1 0; min-width: 0; }
    ha-card[data-layout="landscape"] .mapwrap:not(:empty) { margin-top: 0; }
    /* The map fills the half; the planner's crosshair over it keeps its
       own size. */
    ha-card[data-layout="landscape"] .mapwrap > :not(.plan-cross) { height: 100%; }
    ha-card[data-layout="landscape"] .mapwrap ha-card { height: 100%; }
    /* One line, and the line is the button. */
    ha-card[data-layout="minimal"] { padding: 0; }
    /* Two or three parts, each a button: how much there is, how much of it is
       new, and what the jams among it cost. The parts after the first carry a
       colour, so what interrupts a glance is what the eye lands on - and each
       is plainly a place to press rather than a run of text. */
    .mini { display: flex; width: 100%; height: 100%; min-height: 48px;
            border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; }
    .mini-half { flex: 1 1 0; min-width: 0; display: flex; align-items: center;
                 justify-content: center; gap: 8px; padding: 0 8px;
                 background: none; border: none; font: inherit; cursor: pointer;
                 color: var(--primary-text-color); position: relative; }
    /* A fill of the half's own, on its own layer so that its opacity leaves
       the number and the word alone. Transparent until a colour is set, so
       what the stylesheet draws below it stands until then. */
    .mini-half::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    .mini-half.total::before {
      background: var(--tomtom-mini-total-fill-color, transparent);
      opacity: var(--tomtom-mini-total-fill-opacity, 1);
    }
    .mini-half.new::before {
      background: var(--tomtom-mini-new-fill-color, transparent);
      opacity: var(--tomtom-mini-new-fill-opacity, 1);
    }
    .mini-half.delay::before {
      background: var(--tomtom-mini-delay-fill-color, transparent);
      opacity: var(--tomtom-mini-delay-fill-opacity, 1);
    }
    /* Two parts are one half each. Three are not three thirds: what the
       jams cost is a good deal wider than a count, and an equal share of a
       narrow card cuts it off. Each part then takes what it needs first
       and shares out what is left, so the line divides by its contents. */
    .mini.three .mini-half { flex: 1 1 auto; }
    .mini-half > * { position: relative; z-index: 1; }
    .mini-half:hover { background: rgba(127, 127, 127, 0.1); }
    .mini-half:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px; }
    .mini-half ha-icon { --mdc-icon-size: 22px; width: 22px; height: 22px; flex: none;
                         display: flex; align-items: center; justify-content: center;
                         line-height: 0; color: var(--secondary-text-color); }
    .mini-value { font-size: 20px; font-weight: 500; line-height: 1.2; }
    .mini-label { font-size: 14px; color: var(--secondary-text-color);
                  white-space: nowrap; }
    /* The tint is mixed from whatever colour the new marker actually has, so a
       theme that owns its accent keeps it here too. The flat value first is
       what a browser without color-mix falls back to. */
    /* The accent this half wears is two settings now, not a rule here - see
       mini_new_fill_color and its opacity. What stays is the colour of
       what stands on it, which is a different thing from the fill. */
    .mini-half.new ha-icon,
    .mini-half.new .mini-value { color: var(--tomtom-new-background, var(--accent-color, #ff9800)); }
    .mini-half.new .mini-label { color: #c08324; }
    @supports (color: color-mix(in srgb, red 10%, transparent)) {
      .mini-half.new .mini-label {
        color: color-mix(in srgb,
               var(--tomtom-new-background, var(--accent-color, #ff9800)) 70%,
               var(--secondary-text-color));
      }
    }
    /* The third part wears the badge's red for the reason the second wears
       the accent: the colour is what it says, not decoration. The fill is
       two settings of its own (see mini_delay_fill_color); this is what
       stands on it. */
    .mini-half.delay ha-icon,
    .mini-half.delay .mini-value { color: var(--tomtom-delay-background, var(--error-color, #db4437)); }
    .mini-half.delay .mini-label { color: #b8564c; }
    @supports (color: color-mix(in srgb, red 10%, transparent)) {
      .mini-half.delay .mini-label {
        color: color-mix(in srgb,
               var(--tomtom-delay-background, var(--error-color, #db4437)) 70%,
               var(--secondary-text-color));
      }
    }
    /* "+1 h 35 min" is one thing to read, not three. */
    .mini-half.delay .mini-value { white-space: nowrap; }
    /* With nothing new there is nothing to interrupt a glance for, so the
       accent stands down until there is - the fill with it. */
    .mini-half.new.quiet::before,
    /* The travel time, coloured by its level of delay: plain below the
       yellow threshold, the threshold's colour from it - symbol, time and a
       tint behind them, each replaceable under Layout. */
    .mini-half.travel::before {
      background: var(--tomtom-mini-travel-fill-color, transparent);
      opacity: var(--tomtom-mini-travel-fill-opacity, 1);
    }
    .mini-half.travel.level-warn::before {
      background: var(--tomtom-mini-travel-fill-color, var(--warning-color, #ffa600));
    }
    .mini-half.travel.level-alert::before {
      background: var(--tomtom-mini-travel-fill-color, var(--error-color, #db4437));
    }
    .mini-half.travel.level-warn ha-icon,
    .mini-half.travel.level-warn .mini-value { color: var(--warning-color, #ffa600); }
    .mini-half.travel.level-alert ha-icon,
    .mini-half.travel.level-alert .mini-value { color: var(--error-color, #db4437); }
    .mini-half.travel .mini-value { white-space: nowrap; }
    .mini-half.delay.quiet::before { background: none; }
    .mini-half.new.quiet ha-icon,
    .mini-half.new.quiet .mini-value,
    .mini-half.new.quiet .mini-label,
    .mini-half.delay.quiet ha-icon,
    .mini-half.delay.quiet .mini-value,
    .mini-half.delay.quiet .mini-label { color: var(--secondary-text-color); }
    /* A half counting nothing leads nowhere, so it stops offering: no hand,
       no lift under the pointer. The button itself is disabled, and this is
       what keeps it from still looking pressable. */
    .mini-half.empty { cursor: default; }
    .mini-half.empty:hover,
    .mini-half.new.quiet:hover,
    .mini-half.delay.quiet:hover { background: none; }
    .mini-half.travel.level-ok:hover { background: rgba(127, 127, 127, 0.1); }
    /* Too narrow for words: the numbers and their symbols carry it alone.
       Three parts share the room two had, so their words go sooner. */
    @container (max-width: 250px) {
      .mini-label { display: none; }
    }
    @container (max-width: 440px) {
      .mini.three .mini-label { display: none; }
    }
    /* Narrower still, and three numbers are more than the line can set in
       full: the type steps down rather than letting "+1 h 35 min" be cut
       off at both ends. The symbols are the last to go - a number that is
       neither counted nor coloured says least without one. */
    @container (max-width: 270px) {
      .mini.three .mini-value { font-size: 17px; }
      .mini.three .mini-half { gap: 6px; padding: 0 6px; }
      .mini.three .mini-half ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
    }
    @container (max-width: 230px) {
      .mini.three .mini-half ha-icon { display: none; }
    }
    /* Four parts: the travel time is words as well as a number, so the
       parts take the room each needs rather than a quarter apiece - the
       three numbers never give way, the time does - and the steps the
       three take at 270 and 230 come at 440 and 360, where the time also
       goes to its short wording ("2:19 h"). Narrower still, it is cut with
       an ellipsis rather than laid over its neighbour. A line of fewer
       parts takes the short wording at 230 with the three's last step. */
    .mini.four .mini-half { flex: 0 0 auto; }
    .mini.four .mini-half.travel { flex: 1 1 auto; min-width: 0; }
    .mini-half.travel .mini-value { overflow: hidden; text-overflow: ellipsis; }
    .mini-value.short { display: none; }
    @container (max-width: 440px) {
      .mini.four .mini-value { font-size: 17px; }
      .mini.four .mini-half { gap: 6px; padding: 0 6px; }
      .mini.four .mini-half ha-icon { --mdc-icon-size: 18px; width: 18px; height: 18px; }
    }
    @container (max-width: 360px) {
      .mini.four .mini-half ha-icon { display: none; }
      .mini.four .mini-value { font-size: 15px; }
      .mini.four .mini-value.long { display: none; }
      .mini.four .mini-value.short { display: inline; }
    }
    @container (max-width: 230px) {
      .mini .mini-value.long { display: none; }
      .mini .mini-value.short { display: inline; }
    }
    /* The reports behind that line. A dialog rather than a panel of our own:
       the browser draws it above everything, so the card being one row tall
       and clipped cannot cut it off. */
    /* As large as the screen sensibly allows, and landscape: the map on one
       side, the list on the other. Below a screen width that cannot hold two
       columns they fall under one another instead. */
    dialog.pop { width: min(1100px, 94vw); height: min(760px, 88vh);
                 max-width: none; max-height: 88vh; padding: 0; border: none;
                 border-radius: var(--ha-card-border-radius, 12px);
                 background: var(--card-background-color, #1c1c1c);
                 color: var(--primary-text-color);
                 box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); overflow: hidden; }
    /* A column: the head, the flow line when there is one, and the body
       taking the rest - rather than the body guessing the head's height,
       which the flow line used to put under the dialog's edge, map and
       all. Only while open: a closed dialog stays off the page. */
    dialog.pop[open] { display: flex; flex-direction: column; }
    dialog.pop::backdrop { background: rgba(0, 0, 0, 0.6); }
    /* The same layer as on the card, for the format whose card is one line:
       there the background belongs to the pop-up, which is the surface with
       room for it. No position of its own - a modal dialog is already
       positioned by the browser, and saying so again would take it out of
       the middle of the screen. */
    dialog.pop::before {
      content: "";
      position: absolute;
      inset: 0;
      background-color: var(--tomtom-card-background-color, transparent);
      background-image: var(--tomtom-card-background-image, none);
      background-size: var(--tomtom-card-background-size, cover);
      background-repeat: var(--tomtom-card-background-repeat, no-repeat);
      background-position: center;
      opacity: var(--tomtom-card-background-opacity, 1);
      pointer-events: none;
      z-index: 0;
    }
    .pop-head, .pop-body { position: relative; z-index: 1; }
    .pop-head, .pop-traffic { flex: 0 0 auto; }
    .pop-head { display: flex; align-items: center; justify-content: space-between;
                gap: 12px; padding: 12px 16px; box-sizing: border-box; height: 57px;
                border-bottom: 1px solid var(--divider-color); }
    /* Takes the width whether or not it says anything, so hiding the title
       leaves the close button in the corner it always sits in. */
    .pop-title { flex: 1 1 auto; min-width: 0; font-size: 1.1rem; font-weight: 500; }
    .pop-traffic { position: relative; z-index: 1; padding: 0 16px 8px; }
    .pop-traffic[hidden] { display: none; }
    .pop-traffic .traffic-line { margin-top: 0; }
    .pop-close { background: none; border: none; font: inherit; font-size: 1rem;
                 color: var(--secondary-text-color); cursor: pointer;
                 padding: 4px 8px; border-radius: 6px; }
    .pop-close:hover { background: rgba(127, 127, 127, 0.12); color: var(--primary-text-color); }
    .pop-body { display: flex; gap: 16px; padding: 12px 16px; box-sizing: border-box;
                flex: 1 1 auto; min-height: 0; overflow: hidden; }
    .pop-map { flex: 1 1 0; min-width: 0; position: relative;
               border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; }
    .pop-map > * { height: 100%; }
    /* Right of the map: a live route's travel time over the list, the list
       scrolling under it while the time stays. Without a list the time
       keeps only the room it needs, and the map takes the rest. */
    .pop-side { flex: 1 1 0; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
    .pop-side[hidden], .pop-live[hidden] { display: none; }
    .pop-side.live-only { flex: 0 0 auto; }
    .pop-live { flex: 0 0 auto; padding-bottom: 10px; margin-bottom: 4px;
                border-bottom: 1px solid var(--divider-color); }
    .pop-side.live-only .pop-live { border-bottom: none; }
    .pop-live .live { margin-top: 0; }
    .pop-list { flex: 1 1 auto; min-width: 0; min-height: 0; overflow-y: auto; overflow-x: hidden; }
    @media (max-width: 800px) {
      .pop-body { flex-direction: column; }
      .pop-map { flex: 0 0 40%; }
      .pop-side { flex: 1 1 auto; }
      /* Alone in there, the map takes the height it would have shared. */
      .pop-body.solo .pop-map { flex: 1 1 auto; }
    }
    /* Two fixed columns rather than a wrapping row: the dropdowns keep the
       top right corner whatever the title, the area name or the report count
       happen to be, instead of dropping to their own line - and, once a map
       is shown, wandering across it. minmax(0, 1fr) lets the left column
       shrink so a long title is what gives way, not the picker column. */
    /* On the title line with the badges, and no bigger than one: a way to
       ask for fresh reports, not a thing to look at. */
    /* No box of its own and no size of its own: the symbol inside is an
       ha-icon.fit-icon like the one that opens this same line, so it sizes
       itself to a capital of the text and rides the same baseline. A button
       with a width would have put its own box in the way of that - which is
       exactly what had it sitting half a line too low. */
    .refresh { display: inline; padding: 0; border: none; background: none;
               font: inherit; color: inherit; cursor: pointer; }
    .refresh .fit-icon { margin: 0 0 0 6px; }
    /* The rounded button every refresh is now: the symbol on the text's
       baseline - inline-block, not flex, for the same reason as the line
       above - then how long ago. Without its frame it keeps the padding, so
       switching the frame off moves nothing. */
    .refresh.pill { display: inline-block; padding: 3px 10px; border-radius: 999px; border: none;
                    background: var(--secondary-background-color);
                    font-size: .8rem; line-height: 1.4;
                    color: var(--secondary-text-color); white-space: nowrap; }
    .refresh.pill.bare { background: none; }
    .refresh.pill .fit-icon { margin: 0 6px 0 0; }
    .refresh.pill .fit-icon:last-child { margin-inline-end: 0; }
    .refresh.pill.off { cursor: default; color: var(--disabled-text-color, var(--secondary-text-color)); }
    .sub .refresh.pill { margin-inline-start: 8px; }
    .refresh:hover { color: var(--primary-text-color); }
    .refresh:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px;
                             border-radius: 4px; }
    .refresh[disabled] { cursor: default; }
    .refresh.spinning ha-icon { animation: tomtom-spin 1s linear infinite; }
    /* The rotate property rather than a transform: the fit above already
       uses the transform to drop the drawing onto the baseline, and a
       rotation written as one would throw that away while it spins. */
    @keyframes tomtom-spin { to { rotate: 360deg; } }
    /* Nobody asked for a spinning icon; a reader who did ask for less motion
       gets a dimmed button instead. */
    @media (prefers-reduced-motion: reduce) {
      .refresh.spinning ha-icon { animation: none; }
      .refresh.spinning { opacity: 0.5; }
    }
    .head { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: start; }
    .title { display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
             font-size: 1.25rem; font-weight: 500; color: var(--primary-text-color); }
    .title-text { display: inline-flex; align-items: center; gap: 8px; min-width: 0;
                  overflow-wrap: anywhere; }
    .badge { font-size: .75rem; font-weight: 500; padding: 2px 8px; border-radius: 12px;
             text-align: center;
             background: var(--secondary-background-color);
             color: var(--secondary-text-color); }
    /* Loud on purpose - it is the one thing on the card worth interrupting a
       glance for. Both halves are themeable, so a dashboard that already owns
       an accent can hand it its own. */
    /* Colour only. Weight, capitals and spacing come from the configuration
       so that the Layout switches and the card can never disagree - a rule
       here would win against a switch turned off and make it a lie. */
    .badge.new, .new-tag {
      background: var(--tomtom-new-background, var(--accent-color, #ff9800));
      color: var(--tomtom-new-color, #fff);
    }
    /* The same badge in the colour of what it reports: time lost. These
       two are what an unset Colour and Background mean on its own element
       (Layout -> Delay badge); anything set there is written inline and
       wins, exactly as it does on the NEW badge above. */
    .badge.delay {
      background: var(--tomtom-delay-background, var(--error-color, #db4437));
      color: var(--tomtom-delay-color, #fff);
      white-space: nowrap;
    }
    .new-tag { font-size: .68rem; padding: 1px 6px; border-radius: 8px; margin-inline-start: 6px;
               vertical-align: middle; white-space: nowrap; }
    /* The head badge is a button - clicking it narrows the card to what is
       new - so it has to shed the browser's own button look and say, both to
       the eye and to a screen reader, whether that narrowing is on. */
    button.badge { font: inherit; font-size: .75rem; border: none; cursor: pointer; }
    button.badge[aria-pressed="true"] { box-shadow: 0 0 0 2px var(--primary-text-color); }
    /* Icon and words are one run of text, so the icon takes the line's own
       colour and grows with its font size instead of staying at a fixed 24px
       beside text somebody has enlarged. */
    /* The icon rides the text's own baseline rather than the middle of the
       line, and is exactly one cap tall - so it starts and ends where the "B"
       of "Berlin" does instead of hanging below it, and grows with the line
       because the cap unit is the font's own capital height.
       Two details make that exact. The line is a plain block, not a flexbox:
       a flex item is aligned by the flex baseline rules, which put this icon
       5px too high whatever display it was given. And overflow:hidden is what
       makes an inline-block report its bottom margin edge as its baseline
       instead of synthesising one from its contents - measured on the running
       card, that is the difference between a 5px offset and none at all.
       line-height:0 goes with it: ha-icon lays its drawing out as an inline
       box, so the line's own leading pushed the artwork half a line down
       inside the box, where overflow:hidden then cut it in half. */
    .sub { font-size: .8rem; color: var(--secondary-text-color); margin-top: 2px; }
    /* The pop-up's traffic flow: its switch. */
    .traffic-line { margin-top: 4px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    /* A live route's travel time, large, with the area's refresh beside it,
       and under it the line saying how much of it is traffic - coloured by
       the thresholds under Layout -> Traffic delay. */
    .live { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 12px; margin-top: 6px; }
    .travel-time { font-size: 2rem; font-weight: 500; line-height: 1.15; white-space: nowrap;
                   color: var(--primary-text-color); }
    .delay-line.level-ok { color: var(--success-color, #43a047); }
    .delay-line.level-warn { color: var(--warning-color, #ffa600); }
    .delay-line.level-alert { color: var(--error-color, #db4437); }
    /* Under the area dropdown: the traffic flow's switch. */
    .toggles { display: grid; grid-template-columns: auto; justify-content: start;
               align-items: center; row-gap: 10px; }
    ha-icon.fit-icon {
      display: inline-block;
      vertical-align: baseline;
      overflow: hidden;
      line-height: 0;
      --mdc-icon-size: 1cap;
      width: 1cap;
      height: 1cap;
      margin-inline-end: 6px;
    }
    /* Stacked, the area dropdown over the switches, the dropdown stretched
       to the column's width so the two read as one block rather than loose
       controls. */
    /* The planner under the head: a row per place, the kind beside its
       input, the actions below, the preview and the name once TomTom has
       answered. */
    .planner { display: grid; gap: 6px; margin-top: 10px; padding: 8px 12px 10px; border-radius: 12px;
               background: var(--secondary-background-color); }
    .planner[hidden] { display: none; }
    .plan-head { display: flex; align-items: center; gap: 8px; }
    .plan-title { font-weight: 500; flex: 1; }
    .plan-icon { border: 0; background: transparent; color: var(--secondary-text-color); font-size: 1rem;
                 cursor: pointer; padding: 2px 6px; border-radius: 12px; }
    .plan-icon:hover { color: var(--primary-text-color); background: var(--divider-color); }
    .plan-icon-gap { width: 24px; }
    /* The place on its own line under its role and kind, so an address and
       its suggestions get the planner's whole width in a narrow card too. */
    .plan-row { display: grid; grid-template-columns: 5.5em minmax(0, 1fr) 24px; gap: 4px 8px; align-items: center; }
    .plan-row.plan-name { grid-template-columns: 5.5em minmax(0, 1fr); }
    .plan-row > .plan-input { grid-column: 1 / -1; }
    .plan-role { font-size: .8rem; color: var(--secondary-text-color); }
    .plan-row.done .plan-role { color: var(--primary-color); }
    .plan-row select, .plan-row input[type="text"] { width: 100%; min-width: 0; box-sizing: border-box; padding: 3px 10px;
      border-radius: 12px; border: 1px solid var(--divider-color); background: var(--card-background-color);
      color: var(--primary-text-color); font: inherit; font-size: .85rem; }
    .plan-row select[data-plan="kind"] { width: auto; }
    .plan-input { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
    .plan-addr { position: relative; flex: 1; min-width: 0; }
    .plan-sugg { position: absolute; inset-inline-start: 0; inset-inline-end: 0; top: 100%; z-index: 30; display: grid;
                 background: var(--card-background-color); border: 1px solid var(--divider-color); border-radius: 12px;
                 box-shadow: 0 4px 12px rgba(0,0,0,.3); overflow: hidden; }
    .plan-sugg button { border: 0; background: transparent; color: var(--primary-text-color); text-align: start;
                        padding: 6px 10px; cursor: pointer; font: inherit; }
    .plan-sugg button:hover { background: var(--secondary-background-color); }
    .plan-val { font-size: .85rem; min-width: 0; overflow-wrap: anywhere; }
    .plan-val.muted { color: var(--secondary-text-color); }
    .plan-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    /* The buttons are the badges' height and shape: the same font size and
       padding, the same 12px corners. The outlined ones draw their line
       inside, so they stay exactly as tall as the filled ones. */
    /* Capitals, weight and spacing come from the configuration - the Layout
       switches and the buttons must never disagree. The colour is the one
       Layout -> New route: buttons sets, the theme's primary unless set. */
    .plan-btn { border: 0; border-radius: 12px; padding: 2px 10px; font: inherit; font-size: .75rem; font-weight: normal;
                text-transform: none; letter-spacing: normal; cursor: pointer; white-space: nowrap;
                background: var(--tomtom-plan-button-fill, var(--primary-color)); color: var(--text-primary-color, #fff); }
    .plan-btn.ghost { background: transparent; color: var(--tomtom-plan-button-fill, var(--primary-color));
                      box-shadow: inset 0 0 0 1px var(--divider-color); }
    .plan-btn[disabled] { opacity: .5; cursor: default; }
    /* The traffic flow's button: filled while the flow is shown, outlined
       while it is hidden, in the one colour the Layout sets for it. */
    /* Capitals, weight and spacing come from the configuration - the Layout
       switches and the button must never disagree - so the shared button
       rule's own are undone here. */
    .traffic-btn { background: var(--tomtom-switch-on, var(--primary-color));
                   text-transform: none; font-weight: normal; letter-spacing: normal; }
    .traffic-btn[aria-pressed="false"] { background: transparent; color: var(--tomtom-switch-on, var(--primary-color));
                                         box-shadow: inset 0 0 0 1px var(--divider-color); }
    .traffic-btn:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
    /* "+ New route" in the dropdown, in the theme's primary colour. */
    option.accent { color: var(--primary-color); }
    .plan-preview { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
    .plan-time { font-size: 1.4rem; font-weight: 500; line-height: 1.2; }
    .plan-facts { color: var(--secondary-text-color); font-size: .85rem; }
    .plan-error { color: var(--error-color, #db4437); font-size: .85rem; }
    .plan-notice { color: var(--secondary-text-color); font-size: .85rem; }
    .mapwrap { position: relative; }
    .plan-cross { position: absolute; left: 50%; top: 50%; width: 22px; height: 22px; transform: translate(-50%, -50%);
                  pointer-events: none; z-index: 950; border: 2px solid #ffa726; border-radius: 50%;
                  box-shadow: 0 0 0 2px rgba(0,0,0,.45); }
    .plan-cross::before, .plan-cross::after { content: ""; position: absolute; background: #ffa726; }
    .plan-cross::before { left: 50%; top: -8px; bottom: -8px; width: 2px; transform: translateX(-50%); }
    .plan-cross::after { top: 50%; left: -8px; right: -8px; height: 2px; transform: translateY(-50%); }
    .pickers { display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
    .pickers select { width: 100%; }
    /* A card narrower than this - the ordinary portrait card in a dashboard
       column - has no room for the dropdown and the switches beside the
       title, and squeezing them in there is what put the count badge on top
       of the name. Below a threshold they go under the title, and the title
       gets the full width back. The query asks the card, not the window, so
       it holds wherever the card is put. */
    @container (max-width: 440px) {
      .head { grid-template-columns: minmax(0, 1fr); }
    }
    select { font: inherit; font-size: .85rem; padding: 4px 8px; border-radius: 12px;
             color: var(--primary-text-color); background: var(--card-background-color);
             border: 1px solid var(--divider-color); }
    .mapwrap:not(:empty) { margin-top: 12px; border-radius: var(--ha-card-border-radius, 12px); overflow: hidden; }
    .mapwrap ha-card { padding: 0; box-shadow: none; border: none; background: none; }
    .list { margin-top: 8px; }
    .row { display: flex; gap: 12px; padding: 10px 0; cursor: pointer;
           border-top: var(--tomtom-divider-width, 1px) var(--tomtom-divider-style, solid)
                       var(--tomtom-divider-color, var(--divider-color)); }
    .row:first-child { border-top: none; }
    /* The entry whose report was just clicked on the map. */
    .row.hl { background: var(--tomtom-highlight-background, rgba(var(--rgb-primary-color, 3, 169, 244), 0.22)); }
    .list.no-divider .row { border-top: none; }
    .pic { flex: 0 0 34px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; gap: 3px; }
    /* Who reported it, under the symbol: the source's logo, small. */
    .pic .prov { width: 16px; height: 16px; object-fit: contain; display: block; }
    .pic ha-icon { --mdc-icon-size: 28px; width: 28px; height: 28px; margin-top: 2px; color: var(--primary-text-color); }
    .body { min-width: 0; flex: 1; overflow-wrap: anywhere; }
    .line1 { color: var(--primary-text-color); }
    .line2 { font-size: .85rem; color: var(--secondary-text-color); }
    .extra { font-size: .8rem; color: var(--secondary-text-color); margin-top: 2px; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
    .chip { font-size: .72rem; padding: 2px 8px; border-radius: 10px;
            color: var(--secondary-text-color); border: 1px solid var(--divider-color);
            background: var(--tomtom-row-chip-background, rgba(128, 128, 128, 0.12)); }
    .chips .chip { flex-shrink: 0; }
    /* The confirmation count, as up to three stars beside the chips. */
    .stars { display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; color: var(--primary-text-color); }
    .stars svg { width: 1em; height: 1em; display: block; fill: currentColor; }
    /* The rest of the list, folded away: a strip with nothing on it but a
       chevron, so the card ends on an invitation rather than on an entry cut
       in half. Home Assistant's own way of saying "there is more". */
    .fold { display: flex; align-items: center; justify-content: center;
            width: 100%; padding: 4px 0; background: none; border: none;
            color: var(--secondary-text-color); cursor: pointer; }
    .fold:hover { color: var(--primary-text-color); }
    .fold:focus-visible { outline: 2px solid var(--primary-color); outline-offset: -2px;
                          border-radius: 8px; }
    .fold ha-icon { --mdc-icon-size: 24px; width: 24px; height: 24px; }
    .empty { padding: 16px 0; text-align: center; color: var(--secondary-text-color); }
  `;

  // Defining the two elements - and defining them again if Home Assistant
  // swaps the registry out from under them.
  //
  // The app bundle's very first statement replaces window.customElements with
  // the scoped registry polyfill, and that polyfill answers only for what was
  // defined into it: anything registered before it arrived is invisible
  // afterwards. customElements.get() returns undefined, whenDefined() never
  // fires, and the card shows "Configuration error" with nothing in the
  // console and nothing in the log. Whether this file runs before or after
  // that statement is an unordered race between two imports in the page - Home
  // Assistant's own import of the app bundle, and the one it writes into the
  // page for this card (home-assistant/frontend#53890).
  //
  // So: define now, remember which registry took it, and watch for that object
  // being replaced. Watching the registry itself rather than waiting for
  // "home-assistant" to be defined is the point - the swap and that definition
  // are one synchronous task, so by the first tick of any timer the tag is
  // always there, and a check built on it would stop before doing anything.
  const TAGS = [
    [CARD_TAG, TomTomCard],
    [EDITOR_TAG, TomTomCardEditor],
  ];
  const WATCHING = "__tomtomCardRegistryWatch";
  const WARNED = "__tomtomCardDefineWarned";

  const defineAll = () => {
    const registry = window.customElements;
    for (const [tag, cls] of TAGS) {
      if (registry.get(tag)) continue;
      try {
        registry.define(tag, cls);
      } catch (err) {
        // Usually another copy of this file between the check and here, and
        // then there is nothing to do. But this is also where the failure this
        // whole block exists to prevent would show up, so it gets said once
        // rather than thrown away on every tick.
        if (!window[WARNED]) {
          window[WARNED] = true;
          console.warn(`tomtom-card: could not define ${tag}`, err);
        }
      }
    }
    return registry;
  };

  let registry = defineAll();

  // One watcher per page, for the same reason the elements are guarded above:
  // this file can be evaluated twice. The flag is handed back when the watcher
  // is done, so a copy arriving later still gets to watch.
  if (!window[WATCHING]) {
    window[WATCHING] = true;
    // Half a minute of a page's life, then the page is what it is going to be.
    // Deliberately not "until Home Assistant's app is up": another card that
    // brings its own copy of the same polyfill would swap the registry later,
    // and stopping at the first quiet tick would miss it. A tick costs one
    // comparison while nothing changes, and the swap is checked before the
    // deadline is, so even a single throttled tick in a background tab still
    // repairs before it stops.
    const deadline = performance.now() + 30000;
    const watch = setInterval(() => {
      if (window.customElements !== registry) registry = defineAll();
      if (performance.now() > deadline) {
        clearInterval(watch);
        window[WATCHING] = false;
      }
    }, 100);
  }

  window.customCards = window.customCards || [];
  watchFlowDialogs();

  if (!window.customCards.some((c) => c.type === CARD_TAG)) {
    window.customCards.push({
      type: CARD_TAG,
      name: "TomTom",
      description: "TomTom's traffic reports and a live route's travel time, for one configured area, route or tracker.",
      preview: true,
      documentationURL: "https://github.com/somansch/tomtom",
      // Offers this card where Home Assistant asks what to build for a
      // picked entity, which in practice is the card picker's "By entity"
      // tab. The "Add to dashboard" button on a device page looks like the
      // same question but is not: it builds its cards from its own table of
      // domains and never asks a custom card.
      //
      // The answer is the card pinned to the area that entity belongs to -
      // whoever picked a report or a count of München was looking at
      // München, not at every configured area. The area dropdown goes with
      // the pinning: offering the one area the card is already fixed to says
      // nothing, and the subtitle line names it anyway. Both are ordinary
      // settings, so either can be undone in the editor.
      //
      // Deliberately narrow: anything not ours returns null. A card offered
      // for every entity only makes the picker harder to use.
      getEntitySuggestion: (hass, entityId) => {
        if (typeof entityId !== "string") return null;
        const entry = hass && hass.entities && hass.entities[entityId];
        // The registry says which integration an entity came from, which is
        // the one answer that holds for all three kinds this integration
        // creates - the reports, the counts and the two windows.
        if (!entry || entry.platform !== DOMAIN) return null;
        if (!entry.device_id) return { config: { type: `custom:${CARD_TAG}` } };
        return {
          config: {
            type: `custom:${CARD_TAG}`,
            areas: [entry.device_id],
            show_area_picker: false,
          },
        };
      },
    });
  }
})();
