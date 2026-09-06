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
import type { CreateWorkspaceResponse } from "@shared/api";

const PAGE_TITLE = "ChatGPT Ads Conversion Tracking Setup | Top-Rated Team";
const PAGE_DESCRIPTION =
  "The ChatGPT Ads pixel, Conversions API, deduplication and consent — installed on your real site, verified against real conversions and documented. Ask our docs agent, or talk to a human.";

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
            note that the same workspace has six other ways into it. */}
        <section id="doors" className="border-y border-border bg-muted/30">
          <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
            <p className="text-sm text-muted-foreground">
              Conversion tracking is one of seven ways in. Google Ads, Google Ad Grants, LinkedIn ads, LinkedIn
              automation, LinkedIn growth and custom AI builds each start with a question and open the same workspace.{" "}
              <Link href="/work" data-testid="link-doors" className="text-primary underline underline-offset-2">
                See all seven
              </Link>
            </p>
          </div>
        </section>

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
