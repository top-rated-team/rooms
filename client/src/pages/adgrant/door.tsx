import { useCallback, useEffect } from "react";
import { Link, useLocation } from "wouter";

import { DOOR_TIERS, doorAgent } from "@shared/doors";
import { RoomMenu } from "@/components/site/RoomMenu";
import {
  ACTION,
  DISPLAY,
  HEADING,
  LINK,
  META,
  META_PLAIN,
  PAGE,
  READ,
  READ_MUTED,
} from "@/components/site/doors/quiet";
import { DoorChat } from "@/pages/adgrant/DoorChat";
import { ADGRANT_IDENTITY, thisDoorBySlug } from "@/pages/adgrant/catalogue";
import { Meta } from "@/components/adgrant/Meta";
import { Missing } from "@/components/adgrant/Missing";
import { sectionPath } from "@/components/adgrant/links";

function contactHref(contact: string): string {
  return /^(https?:\/\/|mailto:|\/)/i.test(contact) ? contact : `mailto:${contact}`;
}

/**
 * One cloned door, in AdGrant.AI's chrome. The row comes from the catalogue,
 * so the headline, the agent and the contract are the nonprofit ones. The
 * chat and the Sign in | Open a room pair are the same components the other
 * house uses.
 */
export function Door() {
  const [pathname] = useLocation();
  const prefix = `${sectionPath("services")}/`;
  const slug = pathname.startsWith(prefix) ? decodeURIComponent(pathname.slice(prefix.length)) : undefined;
  const door = slug ? thisDoorBySlug(slug) : undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [door?.id]);

  const askInPanel = useCallback(() => {
    const field = document.getElementById("ask-question");
    if (!(field instanceof HTMLTextAreaElement)) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    field.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    field.focus({ preventScroll: true });
  }, []);

  if (!door) {
    return <Missing title="This service is not in the catalogue" />;
  }

  const tier = DOOR_TIERS[door.tier];
  const agent = doorAgent(door);
  const panelIsOpen = door.status === "live" && agent !== undefined;
  const partner = door.contract.legalName !== ADGRANT_IDENTITY.legalName;

  return (
    <>
      <Meta title={`${door.headline} — AdGrant.AI`} description={door.blurb} />
      <div className={`${PAGE} pt-[var(--s5)]`}>
        <p className={META}>
          <Link href={sectionPath("services")} data-testid="link-adgrant-door-back" className="draw hover:text-foreground">
            Services
          </Link>
          {door.tier !== "white" ? (
            <>
              <span aria-hidden="true"> · </span>
              <span data-testid="text-adgrant-door-tier">{tier.label}</span>
            </>
          ) : null}
          {door.status === "coming" ? (
            <>
              <span aria-hidden="true"> · </span>
              <span data-testid="text-adgrant-door-status">Not open yet</span>
            </>
          ) : null}
        </p>

        <div className="mt-[var(--s4)] grid items-end gap-[var(--s4)] pb-[var(--s6)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)]">
          <h1 className={DISPLAY} data-testid="text-adgrant-door-headline">
            {door.headline}
          </h1>
          <div>
            <p className={READ_MUTED} data-testid="text-adgrant-door-blurb">
              {door.blurb}
            </p>
            {panelIsOpen ? (
              <div className="mt-[var(--s4)] flex flex-wrap items-baseline gap-x-[var(--s2)] gap-y-[var(--s1)] whitespace-nowrap [font-size:clamp(0.66rem,3vw,0.76rem)!important] sm:flex-nowrap sm:gap-x-[var(--s3)]">
                <RoomMenu
                  className={ACTION}
                  doorId={door.id}
                  agentId={door.firstAgentId}
                  testId="button-adgrant-door-open-room"
                />
                <button type="button" data-testid="button-adgrant-door-ask" className={ACTION} onClick={askInPanel}>
                  Ask AI agent
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div id="panel" className="scroll-mt-[var(--s4)] border-y border-border bg-card py-[var(--s5)] lg:py-[var(--s6)]">
        <div className={`${PAGE} grid gap-[var(--s4)] lg:grid-cols-[minmax(0,32ch)_minmax(0,1fr)] lg:gap-[var(--s5)]`}>
          <div>
            {panelIsOpen ? (
              <>
                <h2 className={HEADING}>Ask it something before you decide anything.</h2>
                <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
                  It is free, it does not need your name, and it will tell you when your question is a five-minute
                  fix.
                </p>
                <div className="mt-[var(--s3)]">
                  <RoomMenu
                    className={ACTION}
                    doorId={door.id}
                    agentId={door.firstAgentId}
                    testId="button-adgrant-door-panel-open-room"
                  />
                </div>
              </>
            ) : (
              <>
                <h2 className={HEADING} data-testid="text-adgrant-door-shut">
                  {door.status === "live" ? "No agent of ours answers in this door." : "This door is not open yet."}
                </h2>
                <p className={`mt-[var(--s2)] ${READ_MUTED}`}>
                  {door.status === "live"
                    ? "There is no panel here, and this page will not stand one of our agents in front of somebody else's work."
                    : (door.comingLine ?? "The offer is real and this page is not finished.")}
                </p>
                <p className={`mt-[var(--s2)] ${META_PLAIN}`}>{door.agentLine}</p>
              </>
            )}
          </div>
          <div>{panelIsOpen ? <DoorChat door={door} /> : null}</div>
        </div>
      </div>

      {door.tool ? (
        <section className={`${PAGE} pt-[var(--s6)]`} data-testid="block-adgrant-door-tool">
          <p className={META}>The tool</p>
          <h2 className={`mt-[var(--s2)] ${HEADING}`}>
            <a href={door.tool.href} className={LINK} data-testid="link-adgrant-door-tool">
              {door.tool.name}
            </a>
          </h2>
          <p className={`mt-[var(--s2)] max-w-[46ch] ${READ_MUTED}`}>{door.tool.line}</p>
        </section>
      ) : null}

      <section className={`${PAGE} pt-[var(--s6)] pb-[var(--s6)]`} data-testid="block-adgrant-door-contract">
        <p className={META}>{partner ? "Who you would be buying from" : "Who does this work"}</p>
        <p className={`mt-[var(--s2)] ${HEADING}`} data-testid="text-adgrant-door-legal-name">
          {partner ? door.contract.legalName : (door.contract.displayName ?? door.contract.legalName)}
        </p>
        <p className={`mt-[var(--s2)] max-w-[46ch] ${READ_MUTED}`}>{door.contract.entity}</p>
        {partner ? <p className={`mt-[var(--s2)] max-w-[46ch] ${READ_MUTED}`}>{door.contract.invoiceLine}</p> : null}
        <p className={`mt-[var(--s3)] ${META_PLAIN}`}>
          {door.contract.termsUrl ? (
            <a href={door.contract.termsUrl} className={`${LINK} text-foreground`} data-testid="link-adgrant-door-terms">
              Terms
            </a>
          ) : (
            <span>
              {door.contract.legalName} has not published terms for this work yet.
            </span>
          )}
          {door.contract.contact ? (
            <>
              <span aria-hidden="true"> · </span>
              <a
                href={contactHref(door.contract.contact)}
                className={`${LINK} text-foreground`}
                data-testid="link-adgrant-door-contact"
              >
                {door.contract.contactLabel ?? door.contract.contact}
              </a>
            </>
          ) : null}
        </p>
      </section>
    </>
  );
}

export default Door;
