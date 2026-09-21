// The deterministic scene. GLOBE team. DESIGN 8.5 (capture rig), DESIGN 7 (verification).
//
// DESIGN 8.5 requires ?replay=1 to run a fixed camera path against a committed fixture and
// stop, so that every screenshot, now and in two years, is frame identical. This module is the
// globe half of that: a fixed camera, a fixed set of arcs, reduced motion on, and no clock
// anywhere. test/globe-render.test.js renders exactly this and asserts pixel invariants
// against it, so the thing the capture rig produces and the thing the test guarantees are the
// same thing rather than two similar things.
//
// THE ARCS HERE ARE NOT MEASUREMENTS AND CARRY NO NUMBER. A GlobeInput is geometry plus a text
// alternative. The measured milliseconds live in the table, which is the authoritative surface
// (DESIGN 6.6), and every one of them goes through the claim badge system. The globe never
// renders a figure.
//
// The observer point is Ashburn, Virginia. That is the coordinate the shipped endpoint table
// carries for the region AWS publishes as "US East (N. Virginia)", and it is used here as a
// FIXTURE ORIGIN so the capture is reproducible. It is not a reading of anybody's location:
// the live page takes its observer from the facility Cloudflare reports for the connection, or
// from a city the reader picks, and never from an address lookup.
//
// Isomorphic: no node:* imports and no DOM.

import { endpointById } from '../core/data/endpoints.js';
import { DEFAULT_DISTANCE } from './camera.js';

/**
 * The fixed camera. Over the mid Atlantic, which puts the Americas and Europe on the near side
 * and the Pacific rim behind the planet, so one frame shows both a drawn arc and an occluded
 * one. The distance is the module default rather than a literal, so the framing follows the
 * camera module instead of drifting away from it.
 */
export const REPLAY_CAMERA = Object.freeze({
  yawDeg: -45,
  pitchDeg: 25,
  distance: DEFAULT_DISTANCE,
});

/** The fixed drawing buffer for a reference render. Square, so the framing is orientation free. */
export const REPLAY_VIEWPORT = Object.freeze({ widthPx: 512, heightPx: 512, devicePixelRatio: 1 });

/** Region ids in the fixture, in the order they appear. All are measured rows in the table. */
export const REPLAY_ENDPOINT_IDS = Object.freeze([
  'aws:eu-central-1',
  'aws:sa-east-1',
  'aws:ap-southeast-2',
  'aws:af-south-1',
  'aws:ap-northeast-1',
]);

/** The arc the accent is spent on in the fixture. Exactly one, as the contract requires. */
export const REPLAY_WORST_ID = 'aws:ap-northeast-1';

/** The observer, a fixture origin. See the header for what it is and is not. */
export const REPLAY_OBSERVER = Object.freeze({ lat: 39.0438, lon: -77.4874, label: 'Ashburn, Virginia' });

/**
 * A GlobeInput that is identical on every machine and in every year.
 *
 * @param {Object} [opts]
 * @param {'dark'|'light'} [opts.theme]
 * @param {string|null} [opts.selectedId]
 * @returns {import('../core/contracts/globe.js').GlobeInput}
 */
export function replayGlobeInput(opts = {}) {
  const theme = opts.theme === 'light' ? 'light' : 'dark';
  const selectedId = opts.selectedId === undefined ? 'aws:eu-central-1' : opts.selectedId;

  const arcs = REPLAY_ENDPOINT_IDS.map((id) => {
    const e = endpointById(id);
    if (!e) {
      throw new Error('replayGlobeInput: ' + id + ' is not in the shipped endpoint table. The '
        + 'fixture names real rows on purpose, so a region leaving the catalogue breaks the '
        + 'capture rig loudly instead of drawing an invented place.');
    }
    const state = id === REPLAY_WORST_ID ? 'worst' : (id === selectedId ? 'selected' : 'idle');
    return {
      endpointId: id,
      from: { lat: REPLAY_OBSERVER.lat, lon: REPLAY_OBSERVER.lon },
      to: { lat: e.lat, lon: e.lon },
      state,
      progress: 1,
      label: 'Great circle to ' + e.city + ', the region ' + e.providerLabel + ' publishes as '
        + e.providerRegionName + '.',
    };
  });

  return {
    schema: 1,
    observer: { lat: REPLAY_OBSERVER.lat, lon: REPLAY_OBSERVER.lon, label: REPLAY_OBSERVER.label },
    arcs,
    theme,
    reducedMotion: true,
    idle: false,
    devicePixelRatioCap: 2,
    bloomEnabled: false,
    ariaSummary: 'A dark globe. Great circles run from ' + REPLAY_OBSERVER.label + ' to five '
      + 'cloud regions. The line to Tokyo is highlighted. The globe is decorative; the table '
      + 'below it carries every value, with its provenance.',
  };
}
