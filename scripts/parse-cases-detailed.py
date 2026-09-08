"""data/cases-detailed.txt + case-shots/manifest.json -> data/cases-detailed.json

The owner's own case-study document, as data. Segmentation is by title page:
a page whose first line is a title rather than a section heading or a bullet
starts a new case, and the case runs to the page before the next one.
"""
import json, re, pathlib, collections

ROOT = pathlib.Path("/Users/dan/Documents/ChatGPT Ads")
txt = (ROOT / "data/cases-detailed.txt").read_text()
shots = json.loads(pathlib.Path("shots/manifest.json").read_text())["images"]

pages = dict(zip([int(x) for x in re.findall(r"===PAGE (\d+)===", txt)],
                 re.split(r"===PAGE \d+===\n", txt)[1:]))

# A heading may carry trailing text, and that text is worth keeping: "5. Results
# Jan '26 - Apr '26 vs Sep '25 - Dec '25" names the comparison the numbers under
# it are against. Bounded by length so a sentence beginning "Results were..."
# is not read as a heading.
SECTION = re.compile(
    r"^(?:\d+\.\s*)?(challenges?|objectives?|review|work done|what was done|results?|"
    r"market analysis|campaigns? development|campaigns? developed|initial state|task|goal|"
    r"strategies|conclusions?|optimizations?|account total|totals?|summary|next steps)"
    r"\b\s*[:.\u2013-]?\s*(.*)$", re.I)

def as_heading(line: str):
    """(heading, subtitle) when the line is a section heading, else None."""
    l = line.strip().lstrip("\u2022 ").strip()
    if len(l) > 90: return None
    m = SECTION.match(l)
    if not m: return None
    head = re.sub(r"\s+", " ", m.group(1)).strip().title()
    rest = (m.group(2) or "").strip(" :.\u2013-")
    return head, rest
META = re.compile(r"^(Category|Client|Website|Country|Budget|Location|Goal|Account|Start|Task|Period)\s*:\s*(.+)$")

def is_title(line: str) -> bool:
    l = line.strip()
    if not l or l in "●○•" or l[0].isdigit() or l.startswith(("●", "○", "•")): return False
    if SECTION.match(l) or META.match(l): return False
    if len(l) > 110: return False
    # A title names a market and usually a client: it has a comma or a colon and
    # is not a sentence.
    return ("," in l or ":" in l) and not l.endswith(".")

def clean(body: str):
    """Lines, with the stray bullet glyphs folded into the line they belong to."""
    out, pending = [], False
    for raw in body.split("\n"):
        l = raw.strip()
        if not l: continue
        if l in ("●", "○", "•", "-"):
            pending = True
            continue
        out.append(("• " if pending else "") + l)
        pending = False
    return out

# Three pages open with a line the title test cannot tell from a title, and all
# three continue the case before them: two more results pages for the mobile
# game (a campaign by country, then a note about App Store installs) and one
# statistics page for the dental clinic. Named rather than guessed at.
CONTINUATIONS = {26, 28, 49}

starts = [n for n in sorted(pages)
          if n >= 3 and n not in CONTINUATIONS and (lines := clean(pages[n])) and is_title(lines[0])]
cases = []
for i, start in enumerate(starts):
    end = (starts[i + 1] - 1) if i + 1 < len(starts) else max(pages)
    lines = clean("\n".join(pages[p] for p in range(start, end + 1)))
    title = lines[0]

    meta, sections, current = {}, [], None
    for l in lines[1:]:
        m = META.match(l.lstrip("• "))
        if m and not current:
            meta[m.group(1)] = m.group(2).strip(); continue
        if SECTION.match(l.lstrip("• ")):
            current = {"heading": re.sub(r"^\d+\.\s*", "", l.lstrip("• ")).rstrip(":.").strip(), "lines": []}
            sections.append(current); continue
        if current is None:
            current = {"heading": "", "period": "", "lines": []}; sections.append(current)
        current["lines"].append(l)

    # ---- reunite wrapped lines with the line they continue -----------------
    #
    # The extraction breaks a wrapped line into two runs, and the second run
    # starts lower case because it is the middle of a sentence. A first render
    # of the PDF showed those as paragraphs of their own — "form the funnel;",
    # "insertions;" — under a bullet that ended mid-phrase.
    #
    # Measured before choosing a rule rather than after: of 86 such fragments,
    # 71 follow prose, 9 follow a bullet and 6 open a section. So the rule is
    # simply "a line beginning lower case continues the line above it", and the
    # only special case is a fragment with nothing above it, which is attached
    # to the first truncated bullet in its section instead. Anything that still
    # has nowhere to go is left visible — a wrong join puts one item's words on
    # another, which is worse than a fragment somebody can see is a fragment.
    for sec in sections:
        out = []
        for l in sec["lines"]:
            # A line continues the one above it when it starts mid-sentence —
            # lower case, or where the line above stopped without terminal
            # punctuation. The second half caught "67%, despite operating in one
            # of the most competitive legal niches" after "...dropped by".
            unfinished = bool(out) and not out[-1].rstrip().endswith((";", ".", "!", "?", ":"))
            if not l.startswith("\u2022 ") and (l[:1].islower() or unfinished):
                if out:
                    out[-1] = out[-1].rstrip() + " " + l
                    continue
                trunc = next((i for i, x in enumerate(sec["lines"])
                              if x.startswith("\u2022 ")
                              and not x.rstrip().endswith((";", ".", "!", "?", ":"))), None)
                if trunc is not None:
                    sec["lines"][trunc] = sec["lines"][trunc].rstrip() + " " + l
                    continue
            out.append(l)
        sec["lines"] = out

    cases.append({
        "title": title,
        "pages": list(range(start, end + 1)),
        "meta": meta,
        "sections": [s for s in sections if s["lines"]],
        "shots": [s["file"] for s in shots if start <= s["page"] <= end],
    })

# Two pages carry the same client under two headings; fold the later into the
# earlier so a reader gets one case rather than the same client twice.
merged, byname = [], {}
for c in cases:
    key = re.sub(r"[^a-z]", "", c["title"].lower())
    if key in byname:
        into = byname[key]
        into["pages"] += c["pages"]
        into["sections"] += c["sections"]
        into["shots"] += c["shots"]
        continue
    byname[key] = c
    merged.append(c)

(ROOT / "data/cases-detailed.json").write_text(json.dumps({
    "source": "2026 Google Ads & PPC detailed case studies — Dan Burykin and his PPC expert team (.docx export)",
    "cases": merged,
}, indent=2, ensure_ascii=False))

print(f"cases: {len(merged)}  (from {len(cases)} title pages)\n")
for c in merged:
    print(f"  p{c['pages'][0]:>2}-{c['pages'][-1]:<2} {len(c['shots']):>2} shots  "
          f"{len(c['sections']):>2} sections  {c['title'][:64]}")

# ---------------------------------------------------------------------------
# WHY THIS IS PYTHON IN A TYPESCRIPT REPOSITORY, and it is the only one.
#
# It reads a PDF the owner sent once. Its companion, extract-case-shots.py,
# pulls the 73 screenshots out of the same file — which needs zlib to inflate
# the streams and enough struct to write a PNG header, both of which are in
# Python's standard library and neither of which is in this project's
# dependencies. Adding a PDF library to a web application's package.json to
# read one document once is the worse trade.
#
# Neither script runs in the build. They produced data/cases-detailed.json and
# data/case-shots/, both committed, and they are kept so that those files can
# be regenerated rather than trusted.
