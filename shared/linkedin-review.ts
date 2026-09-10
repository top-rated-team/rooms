/**
 * One switch for everything withheld while the owner's LinkedIn API
 * application is being read.
 *
 * The doors and the agents carry their own `hidden` flags, because those are
 * rows and a row can be filtered. This is for the PROSE — the sentences and
 * the hand-written product cards that no flag reaches: a paragraph naming a
 * door, a list of two partner products, a price row describing a LinkedIn
 * service. A sweep found seventy-five such surfaces after the flags were set,
 * and the ones that survived a second pass were all of this kind.
 *
 * WHY A CONSTANT AND NOT A DELETION. The copy is good and it comes back. A
 * deletion would have to be rewritten from memory; this is one line to flip
 * and one search to find every place that read it.
 *
 * WHEN THE APPLICATION IS ANSWERED: set this to false, then remove the
 * `hidden: true` lines in shared/doors.ts and shared/roster.ts, then restore
 * the two prompt handovers and the routing test case that each say so in
 * their own comment. `npm test` will tell you if you missed one — the
 * predicate test in server/hidden-agents.test.ts fails when nothing is
 * hidden, on purpose, so this cannot be half-undone in silence.
 *
 * LINKEDIN ADS IS NOT PART OF THIS. Bought media through an ad account is not
 * automation against a member's account, and the owner excepted it by name.
 */
export const LINKEDIN_REVIEW_OPEN = true;
