/**
 * Before you commit: which staged files belong to a parcel?
 *
 *   node scripts/staged-owners.mjs
 *
 * WHY THIS EXISTS. Twice now I have run a broad `git add` while a subagent was
 * still writing and swept its half-finished file into a commit. The first time
 * was recorded in docs/parallel-dev.md as a rule not to do it again. The second
 * time was two commits ago, by the person who wrote the rule.
 *
 * A rule broken twice needs a tool. This is the tool: it reads parcels.json,
 * looks at what is staged, and names any staged file a parcel owns — because
 * those are the files an agent may be in the middle of. It does not know
 * whether a run is in progress, and deliberately so: state nobody maintains is
 * state that lies. It just tells you whose files you are about to commit, and
 * you decide.
 *
 * Exits 1 when a staged file is parcel-owned, so it can sit in front of a
 * commit in a `&&` chain and stop it.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const manifest = JSON.parse(fs.readFileSync("parcels.json", "utf8"));
const staged = execSync("git diff --cached --name-only", { encoding: "utf8" })
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);

if (staged.length === 0) {
  console.log("Nothing staged.");
  process.exit(0);
}

/** owner of a path, matching a parcel's explicit files and its globs. */
function ownerOf(path) {
  for (const [name, parcel] of Object.entries(manifest.parcels)) {
    for (const owned of parcel.owns ?? []) {
      if (owned === path) return name;
      if (owned.includes("*") && path.startsWith(owned.split("*")[0])) return name;
    }
  }
  return null;
}

const owned = staged.map((path) => [path, ownerOf(path)]).filter(([, owner]) => owner);

if (owned.length === 0) {
  console.log(`${staged.length} staged file${staged.length === 1 ? "" : "s"}, none of them owned by a parcel.`);
  process.exit(0);
}

console.error(`${owned.length} staged file${owned.length === 1 ? " is" : "s are"} owned by a parcel:\n`);
for (const [path, owner] of owned) console.error(`  ${path}\n      ${owner}`);
console.error(
  `\nIf that parcel's agent has reported, this is fine — commit it deliberately, with the parcel named in the message.` +
    `\nIf it is still working, you are about to commit a file it is in the middle of. Unstage it:\n` +
    `\n  git restore --staged ${owned.map(([p]) => p).join(" ")}\n`,
);
process.exit(1);
