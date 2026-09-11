/**
 * Runs a TypeScript script that uses the `@/` path alias.
 *
 * ts-node reads compilerOptions.paths but does not act on them, so any script
 * importing `@/lib/...` dies with MODULE_NOT_FOUND — which is why
 * `pnpm points:verify` never actually ran. Rather than add tsconfig-paths for
 * two scripts, this resolves the one alias the repo uses.
 *
 *   node scripts/run-ts.js scripts/verify-points-ledger.ts [args...]
 */

const path = require("path");
const Module = require("module");

// Scripts run outside Next, which is what normally loads .env.local. Doing it
// here means each script doesn't have to remember to.
require("dotenv").config({ path: ".env.local" });
require("dotenv").config({ path: ".env" });

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request.startsWith("@/")) {
    request = path.join(process.cwd(), request.slice(2));
  }
  // `import "server-only"` throws outside a React Server Component. These
  // scripts ARE server code, just not running under Next, so stub it out the
  // same way Next does under its server condition (and vitest.config.ts does
  // for tests). Without this, every script importing lib/points/* dies.
  if (request === "server-only") {
    request = path.join(process.cwd(), "node_modules/server-only/empty.js");
  }
  return originalResolve.call(this, request, ...args);
};

require("ts-node").register({
  transpileOnly: true,
  compilerOptions: {
    module: "CommonJS",
    moduleResolution: "node",
    // tsconfig targets the bundler; neither setting works under plain node.
    verbatimModuleSyntax: false,
  },
});

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/run-ts.js <script.ts> [args...]");
  process.exit(1);
}

// Shift argv so the target script sees its own args at the usual positions.
process.argv = [process.argv[0], path.resolve(target), ...process.argv.slice(3)];
require(path.resolve(target));
