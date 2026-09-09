Written by `scripts/build-adgrant.ts` from adgrant.ai's own public content API, one markdown
file per page with its metadata as frontmatter — so a correction is a diff a person can read.

  npm run adgrant:build
  npx tsx scripts/build-adgrant.ts --from-disk
  npx tsx scripts/build-adgrant.ts --take-theirs

Six statements in the fetched material are wrong against Google's current documentation and
are corrected on the way in. They are listed, with the Google page that contradicts each, in
`docs/specs/adgrant-and-dev-agents.md` section 1. A later fetch that disagrees with a file
here prints the disagreement and leaves the disk copy, unless `--take-theirs` is set.
