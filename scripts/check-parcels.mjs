/**
 * The checks parcels.json exists to pass, run against the tree.
 *
 * Written because the manifest is only a coordination device if its claims are
 * true, and every one of these was violated at least once by a manifest that
 * looked fine: a parcel owning a path that does not exist, two parcels owning
 * one file, a glob swallowing a neighbour's file, a file frozen and declared a
 * seam in the same breath, a seam nobody declared at the top level, and a
 * parcel with no way to tell whether it is finished.
 *
 *   node scripts/check-parcels.mjs
 *
 * Run it before starting a parallel run. It costs a second; a merge does not.
 */
import fs from "node:fs";
import path from "node:path";

const j = JSON.parse(fs.readFileSync("parcels.json", "utf8"));
const seams = new Set(j.seams);
const frozen = new Set(j.frozen);
const owners = new Map();
const problems = [];

for (const [name, parcel] of Object.entries(j.parcels)) {
  for (const owned of parcel.owns ?? []) {
    if (owners.has(owned)) problems.push(`${owned} is owned by both ${owners.get(owned)} and ${name}`);
    owners.set(owned, name);
    if (seams.has(owned)) problems.push(`${name} owns ${owned}, which is a seam — one or the other`);
    if (frozen.has(owned)) problems.push(`${name} owns ${owned}, which is frozen`);
    if (!owned.includes("*") && !fs.existsSync(owned) && !fs.existsSync(path.dirname(owned)))
      problems.push(`${name} owns ${owned}, and not even its directory exists`);
  }
  for (const seam of Object.keys(parcel.seams ?? {})) {
    if (!fs.existsSync(seam)) problems.push(`${name} declares a seam on ${seam}, which does not exist`);
    if (frozen.has(seam)) problems.push(`${name} declares a seam on ${seam}, which is frozen`);
    if (!seams.has(seam)) problems.push(`${name} declares a seam on ${seam}, which is not in the seams list`);
  }
  if (!parcel.done) problems.push(`${name} has no done condition, so nobody can tell when it is finished`);
}

for (const [name, parcel] of Object.entries(j.parcels)) {
  for (const glob of (parcel.owns ?? []).filter((o) => o.includes("*"))) {
    const prefix = glob.split("*")[0];
    for (const [owned, owner] of owners)
      if (owner !== name && owned.startsWith(prefix))
        problems.push(`${name}'s glob ${glob} swallows ${owner}'s ${owned}`);
  }
}

if (problems.length) {
  console.error(`parcels.json: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  for (const line of problems) console.error(`  - ${line}`);
  process.exit(1);
}
console.log(
  `parcels.json is consistent: ${Object.keys(j.parcels).length} parcels, ${seams.size} seams, ${frozen.size} frozen, ` +
    `${owners.size} owned paths, no overlap.`,
);
