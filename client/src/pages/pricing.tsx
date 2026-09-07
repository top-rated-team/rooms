import { useEffect } from "react";

import Header from "@/components/site/Header";
import Footer from "@/components/site/Footer";
import Ladder from "@/components/site/Ladder";

/* ---------------------------------------------------------------------------
 * THE PRICING PAGE
 *
 * It exists because the header now names it, and a nav link that points at an
 * anchor halfway down another page is a worse thing than one more nav item: the
 * visitor arrives mid-scroll with no idea where they are.
 *
 * It renders the same <Ladder /> the home page does, off the same rows in
 * shared/pricing.ts, which is also what every agent's prompt is given. One list,
 * three readers, and no way for them to disagree about a number.
 *
 * There is deliberately no second design here — no plan cards, no recommended
 * tier, no monthly-annual toggle, no crossed-out figure. A pricing page is where
 * a restrained system is most often abandoned, and the ladder already says the
 * whole of what is true.
 * ------------------------------------------------------------------------- */

const TITLE = "Pricing — Top-Rated Team";
const DESCRIPTION =
  "What each service costs, in one list: from $49 a task, $49 and $99 a month, from $499 a month for account management, and free on your own model keys. Custom work is priced by a person.";

export default function Pricing() {
  useEffect(() => {
    document.title = TITLE;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = DESCRIPTION;
  }, []);

  return (
    <div className="min-h-screen bg-background" data-site-chrome>
      <Header />
      <main>
        <Ladder />
      </main>
      <Footer />
    </div>
  );
}
