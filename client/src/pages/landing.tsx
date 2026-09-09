import { useEffect } from "react";

import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import DoorIndex from "@/components/site/home/DoorIndex";
import FirstScreen from "@/components/site/home/FirstScreen";
import HouseAsk from "@/components/site/home/HouseAsk";
import Plate from "@/components/site/home/Plate";
import Results from "@/components/site/home/Results";
import Ladder from "@/components/site/Ladder";
import TalkToUs from "@/components/site/TalkToUs";

/* ---------------------------------------------------------------------------
 * THE HOME PAGE
 *
 * It was one offer's sales page — the ChatGPT Ads conversion-tracking pitch —
 * with the other six mentioned in a band under the hero. It is now the landing
 * for all of them, and that pitch has a door page of its own.
 *
 * Nine stacked sections became five, and the five do different jobs rather than
 * the same job five times: an argument, a drawing of it, the panel that proves
 * it, the index of the work, and two results with the sentence that says what
 * they are not.
 *
 * Deleted here, and not replaced: the trainer badge, the four statistics, the
 * blue second line of the headline, the outlined second button, the doors band,
 * the five sections that all opened with an uppercase blue label above a bold
 * line above a grey paragraph, the FAQ, the final call-to-action band, and the
 * lead dialog this page used to open from six different places. What a visitor
 * can do here is ask a question, read the index, open a door, or keep the
 * conversation. Everything that used to be a form now begins as a conversation,
 * which is what the doors were always for.
 * ------------------------------------------------------------------------- */

const PAGE_TITLE = "Top-Rated Team — hire a hybrid team for your business";
/* No offer is named. Which rows exist and what they are called is data, and a
 * description that lists them would keep naming a row the day it changes. */
const PAGE_DESCRIPTION =
  "A free expert read of what the AI agents and automations in your ad accounts have been doing, then the work it turns up: paid advertising and the measurement under it, Google Ad Grants, inbound LinkedIn on the official API, and custom AI around all of it. Digital experts and AI agents in one room, with no signup.";

export function Landing() {
  // No helmet dependency: each route sets its own and puts back what it found.
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

  /*
   * ARRIVING AT AN ANCHOR THAT DID NOT EXIST YET.
   *
   * "Open a room" in the header points at /#panel. From a page that has no
   * panel — /pricing, /case-studies — the browser loads this page and then
   * looks for #panel, which at that instant is inside a lazily-loaded chunk
   * that has not rendered. So the fragment finds nothing and the reader lands
   * at the top of the home page instead of at the section they asked for.
   *
   * One frame is enough: the sections below are in this page's own chunk, so
   * they are in the document by the time an effect after paint runs.
   */
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;

    const frame = requestAnimationFrame(() => {
      const target = document.getElementById(id);
      if (!target) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <FirstScreen />
        {/* The index second, on the owner's reading: the panel defaults to one
            door's agent, so putting it here made the home page look like that
            door's sales page again — which is exactly what this redesign moved
            to /services/chatgpt-ads. The list answers "what do you do" before
            anything invites a question. */}
        <DoorIndex />
        <Plate />
        {/* THE PANEL HAS LEFT THIS PAGE. It defaulted to one door's agent and
            its starter questions, so a visitor pressing a general button on the
            home page got the ChatGPT Ads chat — which the owner has now said
            twice makes no sense here. The doors each carry their own, where the
            agent matches the page. The unified room this page should have
            instead is queued as the `home-room` parcel. */}
        <HouseAsk />
        <TalkToUs className="pt-[var(--s5)]" />
        <Results />
        {/* Low, and after the work: a price means nothing until the reader
            knows what it buys. Every figure here is read off shared/pricing.ts,
            which is also what every agent's prompt is given — so the page and
            the agents cannot quote different numbers. */}
        <Ladder />

        <section className="mx-auto max-w-[var(--page)] px-[var(--s3)] pt-[var(--s6)]">
          <div className="max-w-[44ch]">
            <p className="type-body m-0">
              Ask first. It costs nothing, and it is the fastest way to find out whether you need us at all.
            </p>
            <p className="type-note mt-[var(--s2)] text-muted-foreground">
              There is no magic: just expertise, dedicated hours, and a systematic approach.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export default Landing;
