import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import Hero from "@/components/site/Hero";
import WhyHuman from "@/components/site/WhyHuman";
import HowItWorks from "@/components/site/HowItWorks";
import ProofBand from "@/components/site/ProofBand";
import ExpertsBand from "@/components/site/ExpertsBand";
import ServicesUpsell from "@/components/site/ServicesUpsell";
import Faq from "@/components/site/Faq";
import FinalCta from "@/components/site/FinalCta";
import LeadDialog, { collectSource, type LeadPrefill } from "@/components/site/LeadDialog";
/* The split between the doors a stranger reads and the ones behind the email
 * step is decided in GatedOffers.tsx and nowhere else. This page reads that
 * decision rather than making a second one. */
import { PUBLIC_DOORS, countWord } from "@/components/site/GatedOffers";
import type { CreateWorkspaceResponse } from "@shared/api";
import { DOORS } from "@shared/doors";

const PAGE_TITLE = "ChatGPT Ads Conversion Tracking Setup | Top-Rated Team";
/* The head says what this door does and names no other door, which is why it
 * needs nothing from the list below: a row that moves behind the email step
 * cannot leave a name in a title or a description that never held one. */
const PAGE_DESCRIPTION =
  "The ChatGPT Ads pixel, Conversions API, deduplication and consent — installed on your real site, verified against real conversions and documented. Ask our docs agent, or talk to a human.";

/* ------------------------- the note about the doors -----------------------
 *
 * The number and the names under the hero are read off PUBLIC_DOORS — the white
 * and light-grey rows, the same list /work prints — so this page and the
 * overview cannot disagree about how many doors there are or which ones may be
 * named. Move a row to the grey tier in shared/doors.ts and it leaves this
 * sentence with it: nothing here is typed out, so nothing here can be left
 * behind, and a gated offer is never counted or named on an open page.
 */

/** The door this page is: the row whose `path` is the home page. */
const THIS_DOOR = DOORS.find((door) => door.path === "/");

/** The public doors other than the one the visitor is already standing in. */
const OTHER_DOORS = PUBLIC_DOORS.filter((door) => door.id !== THIS_DOOR?.id);

/**
 * The name inside a headline: everything before the first comma or dash.
 * "LinkedIn automation — with a written legal assessment" is a heading, and
 * "LinkedIn automation" is what you call it in a list. It only ever cuts, so a
 * renamed row renames itself here and no second copy of a name exists.
 */
function shortName(headline: string): string {
  return headline.split(/\s+[—–-]\s+|,\s+/)[0];
}

function sentenceList(names: string[]): string {
  if (names.length < 2) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const WAYS_IN = `${countWord(PUBLIC_DOORS.length)} ways in`;

/* If this page's own door is ever moved behind the step, it is no longer one of
 * the ways in and the sentence stops claiming it is. */
const DOORS_LINE =
  THIS_DOOR && PUBLIC_DOORS.includes(THIS_DOOR)
    ? `${shortName(THIS_DOOR.headline)} is one of ${WAYS_IN}.`
    : `There are ${WAYS_IN}.`;

const OTHER_NAMES = sentenceList(OTHER_DOORS.map((door) => shortName(door.headline)));
const OTHER_DOORS_LINE =
  OTHER_DOORS.length === 0
    ? null
    : OTHER_DOORS.length === 1
      ? `${OTHER_NAMES} starts with a question and opens the same workspace.`
      : `${OTHER_NAMES} each start with a question and open the same workspace.`;

export function Landing() {
  const [, navigate] = useLocation();
  const [leadOpen, setLeadOpen] = useState(false);
  const [leadPrefill, setLeadPrefill] = useState<LeadPrefill | null>(null);

  // No helmet dependency: the landing page is the only route that sets these.
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;

    let created = false;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
      created = true;
    }
    const element = meta;
    const previousDescription = element.content;
    element.content = PAGE_DESCRIPTION;

    return () => {
      document.title = previousTitle;
      if (created) element.remove();
      else element.content = previousDescription;
    };
  }, []);

  const openLead = useCallback((prefill?: LeadPrefill) => {
    setLeadPrefill(prefill ?? null);
    setLeadOpen(true);
  }, []);

  /**
   * The hero keeps exactly two buttons, and the first one is now the panel
   * rather than a form: the fastest free answer on this page is already on
   * screen, so the button puts the cursor in it. Asking for a person is
   * something you do inside the conversation, not in a box beside it — the
   * panel's own escalation block and every section below still open the form.
   * If the panel is not in the DOM, fall back to the form rather than to
   * nothing.
   */
  const askInPanel = useCallback(
    (prefill?: LeadPrefill) => {
      const field = document.getElementById("ask-question");
      if (!(field instanceof HTMLTextAreaElement)) {
        openLead(prefill);
        return;
      }
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      field.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
      field.focus({ preventScroll: true });
    },
    [openLead],
  );

  /** Resolves to an error message the caller renders in place, or null when it navigated. */
  const startWorkspace = useCallback(
    async (opts?: { agentId?: string; firstMessage?: string }): Promise<string | null> => {
      try {
        const res = await fetch("/api/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: opts?.agentId,
            firstMessage: opts?.firstMessage,
            source: collectSource(),
          }),
        });
        if (!res.ok) {
          return res.status === 429
            ? "That is a lot of workspaces from one address. Give it a minute, or book a call."
            : "The workspace could not be created. Book a call and we will pick it up from there.";
        }
        const state = (await res.json()) as CreateWorkspaceResponse;
        navigate(`/w/${state.workspace.token}`);
        return null;
      } catch {
        return "Network error creating the workspace. Book a call and we will pick it up from there.";
      }
    },
    [navigate],
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        {/* The hero mints its own room, because "Kept. This conversation now
            has an address" is only true if the address is on screen before the
            page moves. startWorkspace navigates the moment the room exists, so
            it stays with the sections below, which want exactly that. */}
        <Hero onTalkToHuman={askInPanel} />

        {/* The other doors, said once and quietly. A visitor who came for
            conversion tracking should meet the panel first; this is only the
            note that the same workspace has other ways into it. Which ones, and
            how many, come from the list above rather than from this sentence.
            With nothing public to point at there is nothing to say, and the
            band is not rendered at all. */}
        {PUBLIC_DOORS.length > 0 ? (
          <section id="doors" className="border-y border-border bg-muted/30">
            <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
              <p className="text-sm text-muted-foreground">
                {DOORS_LINE}
                {OTHER_DOORS_LINE ? ` ${OTHER_DOORS_LINE}` : ""}{" "}
                <Link href="/work" data-testid="link-doors" className="text-primary underline underline-offset-2">
                  See all {countWord(PUBLIC_DOORS.length)}
                </Link>
              </p>
            </div>
          </section>
        ) : null}

        <WhyHuman />
        <HowItWorks />
        <ProofBand />
        <ExpertsBand onTalkToHuman={openLead} />
        <ServicesUpsell onTalkToHuman={openLead} onStartWorkspace={startWorkspace} />
        <Faq />
        <FinalCta onTalkToHuman={openLead} onStartWorkspace={startWorkspace} />
      </main>
      <Footer />
      <LeadDialog open={leadOpen} onOpenChange={setLeadOpen} prefill={leadPrefill} />
    </div>
  );
}

export default Landing;
