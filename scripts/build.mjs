#!/usr/bin/env node
// Build the hub. Usage: node scripts/build.mjs [--scratch]
//
//   (no flag)   build into .next, the directory `start` mode serves from.
//   --scratch   build into .next-check instead.
//
// Why --scratch exists: `next build` and `next dev` share .next, so running a
// build in the checkout that is currently serving you takes your hub down
// mid-page. The self-build channel has the hub build ITSELF, so that failure
// mode is not hypothetical.
//
// Why this file exists AT ALL rather than a bare `next build` in package.json:
// the telemetry switch. See scripts/next-run.mjs. Every path to Next goes
// through that one module so the switch cannot be forgotten in one of them,
// which is precisely what happened before.
import { runNext } from "./next-run.mjs";

const scratch = process.argv.includes("--scratch");
const dist = scratch ? ".next-check" : ".next";

console.log(`[hub] building into ${dist}`);
process.exit(await runNext(["build"], { HUB_DIST_DIR: dist }));
