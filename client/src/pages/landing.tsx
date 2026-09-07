import { useEffect } from "react";

import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import DoorIndex from "@/components/site/home/DoorIndex";
import FirstScreen from "@/components/site/home/FirstScreen";
import Panel from "@/components/site/home/Panel";
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

const PAGE_TITLE = "Top-Rated Team — paid ads, measurement, and the AI around them";
/* No offer is named. Which rows exist and what they are called is data, and a
 * description that lists them would keep naming a row the day it changes. */
const PAGE_DESCRIPTION =
  "Paid advertising, the measurement under it, and the custom AI around both — one workspace behind all of them. Ask an agent a question and get an answer from documentation, with the page it used, for free and without giving a name.";

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
        {/* Before the panel, not after it. Somebody who came wanting a person
            should not have to work out that the box is not the only door. */}
        <TalkToUs className="pt-[var(--s5)]" />
        <Panel />
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
