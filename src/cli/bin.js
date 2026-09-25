#!/usr/bin/env node
// The file package.json "bin" names. DESIGN-CLI section 0 item 5: a shebang, one import, the
// exit code, and no copy of its own. Everything the command line prints is built under src/cli
// and leaves through src/cli/out.js, where every gate already looks.

import { main } from './main.js';

process.exitCode = await main(process.argv.slice(2));
