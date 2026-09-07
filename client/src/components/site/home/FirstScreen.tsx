/* ---------------------------------------------------------------------------
 * THE FIRST SCREEN
 *
 * What it replaced, measured at 1440x900: 223 words and 24 clickable things —
 * a trainer badge, a two-line headline whose second line was blue, a paragraph,
 * a second paragraph, two buttons, four statistics, a ten-link menu, a theme
 * control, a booking button, a panel with eight things to press in it, and a
 * band under all of that with one more link.
 *
 * What is here: one line, one paragraph, one line of metadata, one button. The
 * button is not a form and not a call — it puts the cursor in the panel further
 * down the page, because the fastest free thing on this site is a question.
 *
 * The headline is the argument, not a benefit claim: seven offers, and one room
 * behind all of them. That is what this company actually is.
 * ------------------------------------------------------------------------- */

/** The panel's own textarea. Owned by AskWidget; this is the id it renders. */
const PANEL_FIELD_ID = "ask-question";

function toPanel() {
  const field = document.getElementById(PANEL_FIELD_ID);
  const target = field ?? document.getElementById("panel");
  if (!target) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  if (field instanceof HTMLTextAreaElement) field.focus({ preventScroll: true });
}

export function FirstScreen() {
  return (
    <section className="mx-auto grid max-w-[var(--page)] grid-cols-1 items-end gap-[var(--s4)] px-[var(--s3)] py-[var(--s5)] lg:grid-cols-[55fr_45fr] lg:gap-[var(--s5)] lg:py-[var(--s6)]">
      <h1 className="type-display m-0" data-testid="text-home-headline">
        Seven kinds of work. One room behind all of them.
      </h1>

      <div>
        <p className="type-body m-0">
          Paid advertising, the measurement under it, and the custom AI around both. Each one opens with a question you
          can put to an agent that answers from documentation and prints the page it used.
        </p>
        <p className="type-meta mt-[var(--s3)] text-muted-foreground">
          Prague, Kyiv, Madeira. In paid advertising since 2017.
        </p>
        <button
          type="button"
          data-testid="button-home-ask"
          onClick={toPanel}
          className="type-meta mt-[var(--s3)] border-b border-primary pb-[var(--s1)] font-medium text-primary hover:border-foreground hover:text-foreground"
        >
          Put a question to the agent
        </button>
      </div>
    </section>
  );
}

export default FirstScreen;
