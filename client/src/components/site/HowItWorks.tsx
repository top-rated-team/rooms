interface Step {
  title: string;
  meta: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: "Ask",
    meta: "Instant, free",
    body: "Put a real question to the agent in the hero. It answers from the official ChatGPT Ads documentation and cites the page it used. If your question turns out to be a five-minute fix, you will have it in five minutes and we will have cost you nothing.",
  },
  {
    title: "Scope",
    meta: "Shared workspace, no signup",
    body: "Open a workspace from the answer. Your stack, your money event, and the checklist of what actually has to happen, in one shared space with our agents and our people in it. The link in the address bar is the whole account — bookmark it, or send it to your developer.",
  },
  {
    title: "Implement",
    meta: "Our engineer, your stack",
    body: "Pixel in the real template, Conversions API endpoint in your own backend with the key in your secret manager, one event ID agreed across both halves, consent wired to the banner you already run, CRM stages mapped if the money closes offline.",
  },
  {
    title: "Verify and hand over",
    meta: "Documented, with a rollback note",
    body: "Real conversions fired on the real site and reconciled in Ads Manager over days, not a debug console screenshot. Then a written map of what fires where, and a rollback note for whoever touches the site next.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">How it works</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight lg:text-4xl">Four steps, and the first two are free.</h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Nothing here needs a contract before you know whether we are useful. The work starts when you have seen the
            answer and still want hands on it.
          </p>
        </div>

        <ol className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.title} data-testid="item-how-it-works" className="border-t border-border pt-6">
              <span className="font-mono text-3xl font-bold text-primary tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 text-lg font-semibold">{step.title}</h3>
              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{step.meta}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

export default HowItWorks;
