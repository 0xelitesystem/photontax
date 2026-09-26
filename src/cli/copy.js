// THE COMMAND LINE'S WORDS. DESIGN-CLI sections 0 and 1.
//
// Every sentence the command line prints that is not a failure reason (./reasons.js), a claim,
// or a sentence taken verbatim from a core table lives here. That is on purpose, for the same
// three reasons src/measure/reasons.js gives: a sentence written at the call site is a sentence
// nobody reviewed, a test can pin a table, and trap 15 names language drift as the biggest risk
// in the project. The vocabulary gate scans this file, and test/cli-static.test.js runs the
// shipped scanner over every string in it.
//
// No sentence here contains a digit. A figure is never typed into prose: it is a claim, built
// where it is computed and rendered with its badge (src/ui/parts.js t() throws on a digit, and
// the command line renders every prose run through t()).
//
// Isomorphic: no node:* imports.

/** The package and binary name. */
export const NAME = 'photontax';

/** The repository, printed in the help text and carried in the User-Agent. */
export const REPO_URL = 'https://github.com/0xelitesystem/photontax';

/** The schema every --json document names, so a consumer can refuse one it does not know. */
export const JSON_SCHEMA = 'photontax.cli/1';

/** Exit codes. DESIGN-CLI section 0 item 11. Documented in --help. */
export const EXIT = Object.freeze({ DONE: 0, FAILED: 1, USAGE: 2, INTERRUPTED: 130 });

/**
 * The User-Agent every measurement request sends. DESIGN-CLI section 0 item 9: the name, the
 * version and the repository, nothing about the person running it.
 * @param {string} version
 * @returns {string}
 */
export function userAgentFor(version) {
  return NAME + '/' + version + ' (+' + REPO_URL + ')';
}

/**
 * The citation method the page puts on every entry of its sources list (src/ui/page.js), so a
 * source printed here carries the same statement of where it came from.
 */
export const CITATION_METHOD =
  'A citation. The title, the address and the attribution sentence are recorded in the source '
  + 'registry in this repository, which also records exactly what was taken from each source and '
  + 'under what licence.';

/** The sources the command line itself depends on, in the order the page lists them. */
export const CLI_SOURCE_IDS = Object.freeze([
  'si_metre',
  'corning_smf28',
  'iugg_mean_radius',
  'aws_endpoints_catalogue',
  'gcping_endpoints',
  'wikidata_coordinates',
  'azure_regions_list',
  'azure_arm_list_locations',
]);

/** Sources the page credits and the command line never uses, named rather than dropped. */
export const PAGE_ONLY_SOURCE_IDS = Object.freeze(['cloudflare_trace', 'natural_earth_coastline']);

/** Fixed sentences, grouped by where they print. */
export const COPY = Object.freeze({
  purpose: 'photontax splits a warm HTTPS round trip into physics, access cost and route.',
  purposeMore:
    'It measures from this machine to public cloud regions, subtracts the floor light in fibre '
    + 'sets for each distance and this machine\'s own access cost, and states what is left. Every '
    + 'figure carries a MEASURED, REPORTED, COMPUTED or INFERRED badge, and only the measure '
    + 'command uses the network.',

  /* ---- Help ---- */
  helpUsage: 'Usage',
  helpOptions: 'Options',
  helpEnvironment: 'Environment',
  helpPlan: 'What measure contacts',
  helpPrivacy: 'Privacy',
  helpIndependence: 'Independence',
  helpSources: 'Sources',
  helpExitCodes: 'Exit codes',
  helpLicence: 'photontax is MIT licensed.',

  usage: Object.freeze([
    ['photontax', 'one offline fact, then a pointer to this help'],
    ['photontax measure --city <city>', 'measure from this machine; the only command that uses the network'],
    ['photontax cities', 'the cities --city accepts'],
    ['photontax plan', 'exactly what measure contacts, and how many requests it makes'],
    ['photontax floor <from> <to>', 'the physics floor between two bundled places, with the working'],
    ['photontax selftest', 'the offline checks on the arithmetic, the engine and this command line'],
    ['photontax sources', 'every data source and its attribution'],
  ]),

  optionsLead: 'Options may come before or after the command.',
  options: Object.freeze([
    ['--city <city>', 'measure only, and required: a city id or name from photontax cities. '
      + 'photontax never looks you up, so it has to be told which city you are nearest. The '
      + 'match is exact, apart from letter case.'],
    ['--json', 'print one JSON document on stdout. Every figure is an object carrying its '
      + 'badge, value, unit, method and display text; a figure that is not shown is an absent '
      + 'value with a reason, never a zero.'],
    ['--plain', 'linear sentences for a screen reader or a log: one figure per line, each with '
      + 'its badge word and its method. No columns and no colour.'],
    ['--no-color', 'no colour. Colour is decoration only; the badge word is always printed.'],
    ['--help, -h', 'this text'],
    ['--version', 'the version'],
  ]),

  environment: Object.freeze([
    ['NO_COLOR', 'set to any value, turns colour off'],
    ['FORCE_COLOR', 'turns colour on when the output is not a terminal'],
    ['COLUMNS', 'the width text is wrapped to. A figure is never split across lines.'],
    ['NODE_TLS_REJECT_UNAUTHORIZED', 'if it turns certificate checking off, measure refuses to run'],
    ['NODE_EXTRA_CA_CERTS', 'allowed, and measure says so, because a local interception '
      + 'authority can end TLS near this machine'],
    ['HTTPS_PROXY, HTTP_PROXY, NODE_USE_ENV_PROXY', 'never used. measure goes direct and says so, '
      + 'because timing through a proxy would time the proxy'],
  ]),

  planLead: 'measure makes ',
  planRequests: ' HTTPS GET requests in total: ',
  planPerEndpoint: ' to each of ',
  planEndpoints: ' AWS DynamoDB regional endpoints, of which ',
  planWarmUp: ' per endpoint opens the connection and is thrown away. It works on ',
  planAtOnce: ' endpoints at once, abandons any request still running after ',
  planLimit: ' and never retries one, so the longest a run can wait on the network is ',
  planClose: '. It contacts no other host. The hosts:',
  /** The same plan in the linear form, one figure to a line. */
  planPlain: Object.freeze({
    total: 'HTTPS GET requests measure makes in total: ',
    perEndpoint: 'Requests to each endpoint: ',
    endpoints: 'AWS DynamoDB regional endpoints: ',
    warmUp: 'Requests per endpoint that open the connection and are thrown away: ',
    atOnce: 'Endpoints worked on at once: ',
    limit: 'Time limit on each request, after which it is abandoned and never retried: ',
    worst: 'The longest a run can wait on the network: ',
    hosts: 'It contacts no other host. The hosts:',
  }),
  latitude: 'Latitude: ',
  longitude: 'Longitude: ',
  planNoFacility:
    'The page also asks one Cloudflare endpoint which facility served it. The command line '
    + 'never does: the observer point is the city named with --city.',
  planRules:
    'Certificate checking is always on. A redirect is a failure and is never followed. Every '
    + 'response body is read to the end, capped in size, and thrown away. Each warm sample must '
    + 'ride the connection its warm up opened, or the endpoint is reported as failed.',

  privacy:
    'No account, no key, no cookie, no telemetry and no update check. Only measure uses the '
    + 'network, and only the hosts above. Each request is a bare GET carrying the User-Agent '
    + 'below and nothing about you. The address each name resolved to is printed as text and '
    + 'never placed on a map. photontax writes no file: its output goes to this terminal or '
    + 'wherever you send it.',
  userAgentLabel: 'User-Agent: ',

  independence:
    'photontax is an independent project. It is not affiliated with, endorsed by, or connected '
    + 'to Amazon, Google, Cloudflare, Fastly, or any other company named in this output. '
    + 'Measuring a public endpoint is not an endorsement by its owner, and no company named here '
    + 'has reviewed, approved or sponsored this work.',

  sourcesLead: 'Data from: ',
  sourcesPointer: ' photontax sources prints each attribution in full.',

  exitCodes: Object.freeze([
    ['DONE', 'done'],
    ['FAILED', 'a named failure: nothing was measured, a self test failed, the environment was '
      + 'refused, or photontax stopped on an internal error'],
    ['USAGE', 'a usage error'],
    ['INTERRUPTED', 'interrupted'],
  ]),

  /* ---- No command ---- */
  factNoNetwork:
    'That is arithmetic from two bundled city centres and two constants. Nothing touched the '
    + 'network.',
  factPointer:
    'Run photontax --help for every command, or photontax measure --city <city> to measure '
    + 'from this machine.',

  /* ---- cities ---- */
  citiesLead:
    'The cities --city accepts, by id and by name. Each is a city centre from the bundled '
    + 'region table, not a building.',

  /* ---- floor ---- */
  floorFrom: 'From: ',
  floorTo: 'To: ',
  floorCoordinate: ', latitude then longitude: ',
  floorResult: 'The physics floor between these two places: ',
  floorResultClose: '. No cable can carry a round trip between them faster than that.',
  floorDistance: 'Great circle distance: ',

  /* ---- selftest ---- */
  selftestArithmetic: 'Arithmetic',
  selftestRun: 'The page checks, over a scripted run',
  selftestRunLead:
    'The checks below run the real measurement engine end to end over a scripted run built '
    + 'inside this process, through this command line transport. The scripted run touches no '
    + 'socket and no network. Its timings are made up to exercise the engine, so none of them is '
    + 'printed and none is presented as measured.',
  selftestEngine: 'The engine checks, over the same scripted run',
  selftestCli: 'This command line',
  selftestPass: 'PASS',
  selftestFail: 'FAIL',
  selftestAllPassed: 'Every check passed.',
  selftestSomeFailed: 'At least one check failed. The failing lines are marked FAIL above.',
  cliCheckProbeTable: 'The probe table names exactly the declared measurement hosts',
  cliCheckProbeTableDetail:
    'Its keys equal the shipped host list, and each entry, called with a stand in connection '
    + 'pool that opens nothing, addresses its own key over HTTPS on the standard port.',
  cliCheckSanitiser: 'The output sanitiser',
  cliCheckSanitiserDetail:
    'A planted screen clear, a hyperlink escape, a clipboard write escape, a single byte control '
    + 'introducer, a right to left override, an isolate and a delete character are all removed, '
    + 'while accented names and curly quotes pass untouched.',
  cliCheckRenderer: 'Figures reach the output only through the claim renderer',
  cliCheckRendererDetail:
    'A prose run carrying a digit is refused, a claim refuses to become text on its own, and a '
    + 'rendered claim always carries its badge word.',
  cliCheckPlan: 'The plan count equals the requests a run makes',
  cliCheckPlanDetail:
    'The scripted run above went through this command line transport, and the number of '
    + 'requests it issued equals the planned count, with every warm sample on its own warm up '
    + 'connection.',
  engineDisplayPrecision:
    'every millisecond figure printed is a whole millisecond. The clock on this machine steps '
    + 'much finer than that, and the page and the command line round the same way.',
  engineDisplayIdentity:
    'the three whole millisecond parts printed on each row add up to the round trip printed on '
    + 'that row',

  /* ---- sources ---- */
  sourcesCommandLead:
    'Every source the command line depends on, as recorded in the source registry.',
  sourcesPageOnly: 'The page also credits these, which the command line never uses: ',

  /* ---- measure ---- */
  measureObserver: 'Observer point: ',
  measureObserverClose: ' city centre, named with --city.',
  measureObserverCoordinate: 'Observer coordinate, latitude then longitude: ',
  observerSource: 'the city centre named with --city',
  clientStack:
    'These figures were taken by Node on this machine, over HTTPS on a TCP connection with no '
    + 'newer protocol offered. A browser may negotiate a newer protocol through a different '
    + 'client, so the page can show different figures from the same machine.',
  headlineLead: 'The endpoint with the largest route surplus:',
  headlineCosts: ' costs this machine ',
  headlinePhysics: '. Physics charges ',
  headlineAccess: '. This machine\'s access cost charges ',
  headlineRoute: '. The route charges ',
  headlineOnTable: ' On the table: ',
  headlineOnTableClose: '.',
  accessLead: 'Access baseline, set by ',
  accessSame: ', the same for every endpoint: ',
  rowsLead: 'Endpoints, worst route surplus first:',
  rowRoundTrip: 'round trip',
  rowPhysics: 'physics',
  rowAccess: 'access',
  rowRoute: 'route',
  rowDistance: 'distance',
  rowRatio: 'route ratio',
  rowVerdict: 'verdict',
  rowEquals: ' = ',
  rowPlus: ' + ',
  rowSep: ' ',
  unstableLead: 'Unstable, the spread is shown in place of a single number:',
  rowSpread: 'spread',
  defectsLead: 'Defects, faster than light for their stated geography, used in no total:',
  failedLead: 'Not measured:',
  allUsable:
    'Every endpoint answered, every answer was slower than light for its own geography, and '
    + 'every set of samples was stable enough to report.',
  phasesHeading: 'Connection phases',
  phasesLead:
    'From the warm up connection of each endpoint, one sample each. They are not the round trip '
    + 'and are never subtracted from it.',
  phaseDns: 'DNS lookup time',
  phaseTcp: 'TCP connect time',
  phaseTls: 'TLS handshake time',
  phaseAddress: 'connected address',
  phaseTlsVersion: 'TLS version',
  phaseFailedAttempts: 'failed connection attempts',
  phaseNotObserved: 'Not observed on this connection.',
  phaseNoConnection:
    'No connection was established to this endpoint, so there are no phases to show.',
  phaseTcpBelowFloor:
    'A TCP connect time marked below the floor is below the physics floor between the city '
    + 'named with --city and that endpoint\'s city, which light in fibre cannot do. Either '
    + 'something near this machine answered the connection in place of the endpoint, such as a '
    + 'proxy or a middlebox, or this machine is not near the city named with --city. It is a '
    + 'notice, not a result, and the figure is not shown.',
  phaseTcpBelowFloorShort: 'below the floor, not shown; the notice after this list says why',
  reuseHeld:
    'Every warm sample on every timed endpoint rode the connection its warm up opened, as the '
    + 'socket reported on each request.',
  reuseNoneTimed:
    'No endpoint was timed in this run, so no warm sample could be checked for riding its warm '
    + 'up connection.',
  reuseNotHeld:
    'At least one timed endpoint could not be shown to have ridden its warm up connection on '
    + 'every warm sample. That is a defect in photontax, because such an endpoint should have '
    + 'been reported as not measured.',
  noOnTheTable:
    'Only an endpoint whose path is materially longer than the geography requires carries a '
    + 'figure on the table, and this one does not.',
  requestsMade: 'Requests made: ',
  requestsOf: ' of ',
  requestsPlanned: ' planned.',
  requestsPlannedLead: 'Requests planned: ',
  runSelfTestLead: 'Self test on this run:',
  methodsLead: 'How each figure was obtained:',
  sourcesPointerMeasure: 'Sources: photontax sources prints every attribution in full.',
  nothingMeasured:
    'No endpoint produced a usable round trip in this run, so nothing is shown as measured. '
    + 'Each endpoint states its own reason below.',

  /* ---- measure, stderr ---- */
  progressMeasuring: 'Measuring from ',
  progressMeasuringClose: ' city centre. Each endpoint is listed as it finishes.',
  progressTimed: 'timed',
  progressUnstable: 'timed, spread too wide for a single number',
  progressNotMeasured: 'not measured',
  // One line at the default eighty columns (DESIGN-CLI item 8: a one line notice).
  interrupted:
    'Interrupted. Requests in flight were abandoned and nothing partial is reported.',
  tlsRefused:
    'NODE_TLS_REJECT_UNAUTHORIZED is set to turn certificate checking off. photontax never '
    + 'measures over a connection it has not verified, so measure refuses to run. Unset it and '
    + 'run again.',
  proxyNotice:
    'A proxy is set in the environment. Measurements go direct from this machine to each '
    + 'endpoint and the proxy setting is not used, because timing through a proxy would time '
    + 'the proxy.',
  extraCaNotice:
    'NODE_EXTRA_CA_CERTS is set, so this machine trusts extra certificate authorities. A local '
    + 'interception proxy holding one of them can end TLS near this machine. A TCP connect time '
    + 'below the physics floor, stated as a notice in the connection phases, is one sign of that.',

  /* ---- errors ---- */
  usagePrefix: 'photontax: ',
  usageHint: 'Run photontax --help for usage.',
  usageUnknownOption: 'unknown option ',
  usageUnknownCommand: 'unknown command ',
  usageMissingValue: 'this option needs a value: ',
  usageRepeated: 'this option was given twice: ',
  usageNoValue: 'this option takes no value: ',
  usageJsonPlain: '--json and --plain cannot be combined: one is for programs, the other for people.',
  // The hint printed after it (usageUnknownCityHint) names the cities command, so this does not.
  usageCityRequired: 'measure needs --city, because photontax never looks you up.',
  usageCityOnlyMeasure: '--city belongs to measure only.',
  usageUnknownCity: 'no bundled city matches ',
  usageUnknownCityHint: 'Run photontax cities for the list.',
  usageUnknownPlace: 'no bundled city or region matches ',
  usageUnknownPlaceHint: 'Use a city id or name from photontax cities, or a region id or region code from the bundled region table.',
  usageFloorArgs: 'floor needs exactly two places: photontax floor <from> <to>.',
  usageExtraArgument: 'this command takes no further argument: ',
  internalError:
    'photontax hit an internal error. This is a defect in photontax, not in your network. The '
    + 'detail below is for a bug report.',
});
