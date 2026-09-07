import { useState } from "react";
import { cn } from "@/lib/utils";
import { ACTION_QUIET, CHROME, LABEL, LINK, META } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * ADGRANT.AI, IN THE ROOM — the smallest version that is true today.
 *
 * The tool is real and it is ours: adgrant.ai writes campaigns, ad groups,
 * keywords, ads and extensions into a nonprofit's own Google Ads account
 * through the official Google Ads API, under a manager-account link the client
 * invites and can remove. That is already written down in the Ad Grants door's
 * contract line in shared/doors.ts, and this block says it in the room, where
 * somebody is deciding whether to go ahead.
 *
 * WHAT THIS IS NOT. It is not a button that starts the tool, and it does not
 * pretend to be one. Nothing in this repository can reach a Google Ads account:
 * there is no OAuth, no customer id, no job runner, and every agent in the
 * roster is under written instructions never to imply otherwise. A "Run the
 * setup" button here would be the one thing this whole site is built not to do.
 *
 * So the honest version is two things a room can actually do: say what the tool
 * is and what it cannot see, and put the real engagement on the list — five
 * lines, four of which are a person's hands, one of which is the tool. Adding
 * them uses the task endpoint the room already has, so this needed no server
 * change at all.
 *
 * WHAT THE SERVER WOULD NEED for the version where an agent starts the work,
 * in the order it would have to be built:
 *
 *   1. A Google Ads connection that belongs to the client, not to us: an OAuth
 *      grant against their own account, a stored refresh token per room, and a
 *      manager-link invitation they accept and can revoke from their own side.
 *      Until a room can hold a credential, nothing downstream is possible.
 *   2. A place to put a credential that is not this room. A room's token is a
 *      bearer credential in a URL; a Google refresh token must never live
 *      anywhere the URL can reach.
 *   3. An approval before a write. Everything the tool does to a live account
 *      goes into the thread first — what it would create, against what is there
 *      now, with two buttons. That is the `approval-card` parcel in
 *      parcels.json, and this work should wait for it rather than invent a
 *      second approval shape.
 *   4. A job runner with a written record: what was generated, from which
 *      pages of the client's site, at what time, by whose approval, and a
 *      rollback for the account it wrote into.
 *   5. Retrieval that can tell one corpus from another, which now exists —
 *      the Ad Grants Agent reads Google's own Ad Grants policies and cites
 *      them, and it is the thing that should answer the policy questions this
 *      block deliberately does not answer.
 * ------------------------------------------------------------------------- */

/** One line of the real engagement. Titles are what a client would recognise. */
export interface SetupLine {
  title: string;
  detail: string;
  assigneeKey: string;
}

export const AD_GRANT_SETUP: SetupLine[] = [
  {
    title: "Check the grant is active and the account is inside the rules",
    detail:
      "Somebody reads the account and the registration first. Eligibility is written per country and Google rewrites that page per country, so nobody here answers it from a document — and nobody here can say whether Google will approve or reinstate an account.",
    assigneeKey: "human:dan",
  },
  {
    title: "Invite a manager link into your own Google Ads account",
    detail:
      "The tool writes through the official Google Ads API under a manager-account link you invite and can remove at any time. It is not a tool signed in as you, and no password or login is shared in this room or anywhere else.",
    assigneeKey: "human:dan",
  },
  {
    title: "Generate the campaigns from your own website",
    detail:
      "adgrant.ai reads your site and writes campaigns, ad groups, keywords, ads and extensions into the account. This is the automated half of the work, and it is the only automated half.",
    assigneeKey: "human:dan",
  },
  {
    title: "Measure donations and sign-ups, not clicks",
    detail:
      "A grant account that reports clicks cannot be managed. Donations, volunteer sign-ups and form completions are installed on your own site and verified against live conversions before the account is worth optimising.",
    assigneeKey: "human:ihor",
  },
  {
    title: "Agree who runs the account each month",
    detail:
      "The 5% click-through rule and the account-management policies are what suspend grants. Staying inside them is month-to-month work by a person, not a setting.",
    assigneeKey: "human:dan",
  },
];

export interface AdGrantPanelProps {
  /** "ad-grants" and "google-ads" show it. Every other door shows nothing. */
  doorId: string | undefined;
  /** True when the five lines are already on the list, so it stops offering. */
  alreadyAdded: boolean;
  onAddSetup: (lines: SetupLine[]) => Promise<void> | void;
  className?: string;
}

export function AdGrantPanel({ doorId, alreadyAdded, onAddSetup, className }: AdGrantPanelProps) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (doorId !== "ad-grants" && doorId !== "google-ads") return null;
  const isGrants = doorId === "ad-grants";

  return (
    <div className={cn("border-b border-border px-4 py-4", className)} data-testid="panel-adgrant">
      <h2 className={LABEL}>The setup tool</h2>

      <p className={cn(CHROME, "mt-1.5 text-muted-foreground")}>
        {isGrants ? "Ad Grants setup here runs on " : "For a nonprofit on a Google Ad Grant, the setup runs on "}
        <a href="https://adgrant.ai" target="_blank" rel="noopener noreferrer" className={LINK}>
          adgrant.ai
        </a>
        , our own tool. It writes into your own Google Ads account through the official Google Ads API.
      </p>

      {open ? (
        <>
          <p className={cn(META, "mt-2 text-muted-foreground")}>
            Campaigns, keywords and ads, written under a manager link you invite and can remove. It is not a tool signed
            in as you, and no login is shared here or anywhere else.
          </p>
          <p className={cn(META, "mt-1.5 text-muted-foreground")}>
            It is not connected to this room and cannot see your account from here. A person sets that link up with you,
            after there is an engagement. Nothing in this room can start it.
          </p>
        </>
      ) : null}

      <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={ACTION_QUIET}
          data-testid="button-adgrant-more"
        >
          {open ? "Less" : "What it can and cannot do"}
        </button>
        {alreadyAdded ? (
          <span className={cn(META, "text-muted-foreground")} data-testid="text-adgrant-added">
            The five steps are on the list.
          </span>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void Promise.resolve(onAddSetup(AD_GRANT_SETUP)).finally(() => setBusy(false));
            }}
            className={ACTION_QUIET}
            data-testid="button-adgrant-add"
          >
            {busy ? "Adding" : "Put the five steps on the list"}
          </button>
        )}
      </div>
    </div>
  );
}

export default AdGrantPanel;
