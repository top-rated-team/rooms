# Spec: /roi-calculator — Google Ads ROI Calculator

**Source of truth:** live page https://top-rated.team/roi-calculator, captured 2026-09-08.
**How this was recovered:** the URL serves a 3,141-byte SPA shell with no calculator markup
in it. The entire tool lives in the client bundle `/assets/index-DmCyTP04.js`
(736,934 bytes), route `/roi-calculator` → component `WF`. All arithmetic below is read
out of that bundle verbatim, not inferred from example numbers. The bundle is minified, so
**the variable names in this document are mine; the operators, operands and order of
operations are the shipped code.**

Stack facts worth keeping: client-side React, `wouter` v3 routing (confirmed via `Symbol.for("wouter_v3")`), Radix-based slider and
select primitives, `Intl.NumberFormat` for all formatting. Everything computes in the
browser.

---

## 1. Page-level behaviour

**Document title** is set client-side to:

```
Google Ads ROI Calculator - Calculate Your Potential Returns | Top-Rated Team
```

(The template is `${title} | Top-Rated Team`. The served HTML `<title>` is the generic
site-wide one; this replaces it after hydration. No og/twitter overrides are passed for
this route, so the page inherits the site defaults.)

**Nothing is submitted anywhere.** Verified by token scan of the component body: zero
occurrences of `fetch(`, `useMutation`, `apiRequest`, `axios`, `navigator.sendBeacon`,
`<form>`, `onSubmit`, `localStorage`, `sessionStorage`, or any `dataLayer`/`gtag` push.
There is no email gate, no "send me my results", no lead capture, no persistence. Reload
resets to defaults. The only outbound traffic is the site-wide Google Tag Manager
container (`GTM-T959V8MG`) in the HTML shell, which loads on this route like on any other
and receives no calculator values. (What that container itself fires is configured outside
the page, so it cannot be read from the shell or the bundle.)

**A reimplementation must preserve this.** If the rebuild adds result-gating or posts
inputs to a server, that is a new product decision, not a port.

---

## 2. Inputs

Six controls. Two are free-text number inputs, three are sliders, one is a select.

| # | Label (verbatim) | Control | Unit | Default | Min | Max | Step |
|---|---|---|---|---|---|---|---|
| 1 | `Industry` | select | — | none selected | — | — | — |
| 2 | `Monthly Ad Budget` | slider | USD | `5000` | `500` | `50000` | `500` |
| 3 | `Average Order Value / Lead Value` | number input | USD | `200` | none | none | none |
| 4 | `Conversion Rate` | slider | percent | `3` | `0.5` | `15` | `0.1` |
| 5 | `Profit Margin` | slider | percent | `30` | `5` | `80` | `1` |
| 6 | `Cost Per Click (CPC)` | number input | USD | `2.5` | none | none | `0.1` |

### Notes per control

**1. Industry** — placeholder `Select your industry`. Default state is the empty string,
i.e. nothing selected; the calculator still computes from the numeric defaults, so
industry is optional. Option values → labels:

| value | label (verbatim) |
|---|---|
| `ecommerce` | `eCommerce` |
| `saas` | `SaaS / Software` |
| `lead-gen` | `B2B Lead Generation` |
| `local-services` | `Local Services` |
| `fintech` | `FinTech` |
| `nonprofit` | `Nonprofit` |

The label carries an info-icon tooltip reading exactly:
> Select your industry to auto-fill benchmark values

Choosing an industry writes **two** fields and only two — `Conversion Rate` and
`Average Order Value / Lead Value`. It does **not** touch budget, profit margin or CPC.
Selection is one-way: it overwrites whatever the user had typed in those two fields, and
subsequently editing those fields does not clear the industry selection.

**2. Monthly Ad Budget** — current value is rendered next to the label as currency with
zero decimals. Slider end labels printed beneath: `$500` and `$50,000`.

**3. Average Order Value / Lead Value** — a `type="number"` input with a `$` prefix
rendered as a sibling span, not an input adornment. No `min`, `max` or `step` attribute,
so the browser permits negatives and arbitrary decimals. Value is coerced with
`Number(e.target.value)`.

**4. Conversion Rate** — current value rendered next to the label as the raw number plus
`%`, **not** run through a formatter. So `2.5` prints `2.5%` and `3` prints `3%` — one
decimal for preset values that have one, none for integers. Slider end labels: `0.5%` and
`15%`.

**5. Profit Margin** — same raw `value + "%"` rendering. Slider end labels: `5%` and `80%`.

**6. Cost Per Click (CPC)** — `type="number"`, `step="0.1"`, `$` prefix span, no `min` or
`max`. Coerced with `Number(e.target.value)`.

### Industry benchmark table

One object drives both the auto-fill and the benchmarks section at the bottom of the page:

| key | conversionRate | avgOrderValue |
|---|---|---|
| `ecommerce` | `2.5` | `120` |
| `saas` | `3` | `500` |
| `lead-gen` | `4.5` | `250` |
| `local-services` | `5` | `350` |
| `fintech` | `2.8` | `800` |
| `nonprofit` | `6` | `75` |

**Provenance of these numbers is not stated anywhere on the page.** They are labelled
"industry benchmarks" and "Average Google Ads performance metrics by industry vertical"
with no source, date, sample, or geography. See §7.

---

## 3. The computation

One `useMemo`, dependencies `[budget, aov, convRate, margin, cpc]`. Note that `industry`
is deliberately not a dependency — it only acts by writing other fields.

### Guard

```js
if (budget <= 0 || aov <= 0 || convRate <= 0 || cpc <= 0) return null;
```

`margin` is **not** in the guard.

### The eight values, exactly as shipped

```js
conversionsPerMonth  = budget / cpc * convRate / 100
monthlyRevenue       = conversionsPerMonth * aov
monthlyProfit        = monthlyRevenue * margin / 100 - budget
roiPercent           = (monthlyRevenue - budget) / budget * 100
yearlyRevenue        = monthlyRevenue * 12
yearlyProfit         = monthlyProfit * 12
costPerAcquisition   = conversionsPerMonth > 0 ? budget / conversionsPerMonth : 0
breakEvenConversions = margin > 0 ? budget / (aov * margin / 100) : 0
```

Read as plain arithmetic:

- **conversionsPerMonth** — clicks (`budget / cpc`) times the conversion rate as a
  fraction. Evaluates strictly left-to-right: `((budget / cpc) * convRate) / 100`.
- **monthlyRevenue** — gross revenue. Every conversion is worth exactly one AOV.
- **monthlyProfit** — gross-margin dollars on that revenue, minus the **entire** ad
  budget. No management fee, no COGS beyond the margin percentage, no other cost.
- **roiPercent** — **computed on revenue, not on profit.** `margin` does not appear in
  this line. This is the single most important thing to notice before rebuilding; see §6.
- **yearlyRevenue / yearlyProfit** — flat ×12. No growth, ramp, seasonality or
  discounting.
- **costPerAcquisition** — budget over conversions. Algebraically this is always
  `cpc / (convRate/100)`, so it is independent of budget; the `> 0` ternary is dead code
  because the guard already forces a positive numerator and denominator.
- **breakEvenConversions** — budget divided by gross profit per order. This one *does*
  use margin, and it is the only place besides `monthlyProfit` that does.

### Formatters

```js
currency = v => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD",
  minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(v)

decimal1 = v => new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1, maximumFractionDigits: 1
}).format(v)
```

Currency is whole dollars, always `$` prefix, thousands separators, negatives as
`-$1,400`. `decimal1` always shows exactly one decimal place.

---

## 4. Outputs

Card title `Projected Results`, subtitle `Based on your campaign parameters`. The card
gains an accent border and tinted background when `roiPercent > 0` (strictly greater).

Layout is a 2-up hero pair, then a full-width ROI panel, then a 2×2 grid.

| Label (verbatim) | Value | Formatter |
|---|---|---|
| `Monthly Revenue` | `monthlyRevenue` | currency, 0 dp |
| `Monthly Profit` | `monthlyProfit` | currency, 0 dp |
| `Return on Investment` | `roiPercent` + `%` | decimal1 |
| `Conversions/Month` | `conversionsPerMonth` | decimal1 |
| `Cost per Acquisition` | `costPerAcquisition` | currency, 0 dp |
| `Yearly Revenue` | `yearlyRevenue` | currency, 0 dp |
| `Break-even Conversions` | `breakEvenConversions` | decimal1 |

**`yearlyProfit` is computed and returned but never rendered.** There is no
"Yearly Profit" tile on the page. A reimplementation can keep computing it or drop it;
either way it must not appear in the UI if the goal is parity.

### Conditional colour

- `Monthly Profit` renders in the accent colour when `monthlyProfit >= 0`, in the
  destructive/red colour otherwise.
- `Return on Investment` — both the icon and the number use accent when
  `roiPercent >= 0`, destructive otherwise.

### Conditional banners

Below the grid, at most one of these two can show, and both can be absent.

Shown when `roiPercent < 0`, in a red-tinted box:
> **Optimization needed:** Current parameters show negative ROI. Consider improving conversion rate, increasing order value, or reducing CPC through better targeting.

Shown when `roiPercent >= 100`, in an accent-tinted box with a sparkles icon (Lucide
`Sparkles`):
> **Great potential!** These metrics suggest strong campaign viability.

(`Optimization needed:` and `Great potential!` are the bolded runs.) The two conditions
cannot both hold, so they are mutually exclusive in practice, and any `roiPercent` between
0 and 100 shows neither.

---

## 5. Empty / no-input state

There is no "Calculate" button. The page computes on every keystroke and slider move and
loads already showing results for the defaults.

When the guard returns `null` — i.e. budget, AOV, conversion rate or CPC is zero or
negative — the results card body is replaced entirely by a centred, half-opacity
calculator icon above the text:

> Adjust the parameters to see projected results

No partial results, no zeros, no error message, and the two banners are gone with it.

**How a user actually reaches that state:** the sliders cannot produce it (their minimums
are 500, 0.5 and 5, all positive), so it is reachable only through the two number inputs.
Clearing `Average Order Value / Lead Value` or `Cost Per Click` yields `target.value === ""`,
and `Number("") === 0`, which trips the guard. Typing a negative value trips it too.

Two edge cases a rebuild should know about:

- **`Profit Margin` is not guarded.** At `margin = 0`, results still render:
  `monthlyProfit` becomes exactly `-budget`, and `breakEvenConversions` falls to the
  ternary's `0` branch and prints `0.0`. The margin slider's floor of 5 makes this
  unreachable through the shipped UI, but the arithmetic permits it.
- **`NaN` is not guarded** — `NaN <= 0` is `false`, so a `NaN` input would flow straight
  through and print the literal strings `$NaN` and `NaN`. In practice `type="number"`
  reports `""` rather than garbage for invalid content, so this is not reachable through
  the shipped UI either. Worth not regressing if the rebuild changes those inputs to
  `type="text"`.

---

## 6. The revenue-vs-profit inconsistency — read before rebuilding

`roiPercent` is `(monthlyRevenue - budget) / budget * 100`. It ignores `Profit Margin`
completely, while `monthlyProfit` right beside it applies that margin. The two headline
numbers therefore answer different questions, and on the **default page load** they
visibly contradict each other:

Defaults (budget 5000, AOV 200, CR 3%, margin 30%, CPC 2.50) produce, verified by
executing the extracted formulas:

```
Monthly Revenue          $12,000
Monthly Profit           -$1,400      (red)
Return on Investment     140.0%       (accent/green)
Conversions/Month        60.0
Cost per Acquisition     $83
Yearly Revenue           $144,000
Break-even Conversions   83.3
banner:                  "Great potential!"
```

So the page ships showing **+140% ROI and a "Great potential!" badge next to a $1,400
monthly loss.** The `ecommerce` preset shows `20.0%` ROI against a `-$3,200` profit, and
`nonprofit` shows `80.0%` ROI against a `-$2,300` profit; holding the other four defaults,
the remaining presets (`saas`, `lead-gen`, `local-services`, `fintech`) land both positive.

**This is documented as observed behaviour, not endorsed as correct.** I am flagging it
rather than silently fixing it because the choice changes every ROI number the tool has
ever shown and belongs to the owner, not to the reimplementation:

- **Port as-is** and the rebuild is faithful, contradiction included.
- **Change ROI to profit-based** (`monthlyProfit / budget * 100`, which at the defaults is
  `-28.0%` instead of `140.0%`) and the tool becomes internally consistent, but headline
  numbers drop hard, the default view flips from a green "Great potential!" to a red
  "Optimization needed:", and anyone who screenshotted an earlier result will see a
  different figure.

Decide explicitly. Do not let this get resolved by accident during a rewrite.

---

## 7. Verbatim page copy

Every string below is quoted exactly and must be re-checked against the owner's intent
before republishing, since several are marketing claims rather than tool mechanics.

**Hero.** Badge: `Free Tool`. H1: `Google Ads ROI Calculator`. Subtitle:
> Calculate your potential return on investment from Google Ads campaigns. Enter your metrics below to see projected results based on industry benchmarks.

**Input card.** Title `Campaign Parameters`, subtitle:
> Adjust the sliders or input your own values

**Results card.** Title `Projected Results`, subtitle `Based on your campaign parameters`.

**CTA card**, directly beneath the results. H3:
> Want to achieve these results?

Body:
> Our team has helped 500+ clients optimize their Google Ads campaigns for maximum ROI. Get a free audit of your current campaigns.

Buttons: `Get Free Audit` → `/contact`, and `View Real Results` → `/case-studies`.

**Benchmarks section**, full-width band at the bottom. H2:
> Industry Conversion Rate Benchmarks

Subtitle:
> Average Google Ads performance metrics by industry vertical

Then one card per industry key, in object order (ecommerce, saas, lead-gen,
local-services, fintech, nonprofit). Each card shows the key with its hyphen replaced by
a space and CSS `text-transform: capitalize` applied — so these headings render as
`Ecommerce`, `Saas`, `Lead Gen`, `Local Services`, `Fintech`, `Nonprofit`, which do **not**
match the select's labels (`eCommerce`, `SaaS / Software`, `B2B Lead Generation`, …). Each
card has two rows: `Avg. Conversion Rate` → the raw value + `%`, and `Avg. Order Value` →
`$` + the raw value.

### There is no disclaimer

I looked for one specifically. **The page prints no disclaimer, no footnote, no
"estimates only", no "results not guaranteed", no methodology note, and no source or date
for the benchmark figures.** The closest thing to a qualifier is the word "potential" and
the phrase "based on industry benchmarks" in the hero subtitle, plus "Projected Results"
as the card title.

Do not invent one for the rebuild. If the owner wants a disclaimer added — and a tool that
prints dollar projections and an unsourced benchmark table arguably wants one — that is
new copy the owner must write and approve.

---

## 8. Reimplementation checklist

1. Six inputs, exact defaults `5000 / 200 / 3 / 30 / 2.5` and industry unselected.
2. Slider bounds and steps exactly as in §2; the two number inputs have no bounds.
3. Industry select auto-fills conversion rate and AOV only.
4. Live recompute, no submit button, no network, no storage.
5. The eight formulas of §3 character-for-character, including left-to-right evaluation of
   `budget / cpc * convRate / 100`.
6. `Intl.NumberFormat("en-US")`, currency at 0 dp and decimal at exactly 1 dp.
7. Seven rendered outputs; `yearlyProfit` computed but not shown.
8. Guard on budget/AOV/CR/CPC only; empty state replaces the whole results body.
9. Both conditional banners at their exact thresholds (`< 0` and `>= 100`).
10. Settle the §6 ROI question deliberately.
11. Re-approve the `500+ clients` claim and the benchmark table before publishing.
