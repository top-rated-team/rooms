"""Extract the screenshots from the owner's case-study PDF, with page numbers.

No dependency: the file has no object streams, so objects can be located by
regex and the two filters present (DCTDecode, FlateDecode) are both handled
here — JPEG bytes are written through untouched, raw samples are wrapped in a
PNG with zlib and four chunk headers.
"""
import json, re, struct, zlib, pathlib, sys

SRC = pathlib.Path("/Users/dan/.claude/uploads/0f2acab6-eccc-42b8-bad0-ebf0ecfea758/af9123b5-2026_Google_Ads__PPC_detailed_case_studies__Dan_Burykin_and_his_PPC_expert_team.docx.pdf")
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "shots")
OUT.mkdir(parents=True, exist_ok=True)
raw = SRC.read_bytes()

# ---- every "N 0 obj … endobj", by number
objs = {}
for m in re.finditer(rb"(\d+)\s+0\s+obj\b", raw):
    num = int(m.group(1)); start = m.end()
    end = raw.find(b"endobj", start)
    objs[num] = raw[start:end if end > 0 else len(raw)]

def dict_of(body):
    i = body.find(b"<<")
    if i < 0: return b""
    depth = 0
    for m in re.finditer(rb"<<|>>", body[i:]):
        depth += 1 if m.group(0) == b"<<" else -1
        if depth == 0: return body[i:i + m.end()]
    return body[i:]

def stream_of(body):
    m = re.search(rb"stream\r?\n", body)
    if not m: return None
    end = body.rfind(b"endstream")
    return body[m.end():end if end > 0 else len(body)]

def name(d, key, default=None):
    m = re.search(rb"/" + key + rb"\s*/([A-Za-z0-9]+)", d)
    return m.group(1).decode() if m else default

def num(d, key, default=None):
    m = re.search(rb"/" + key + rb"\s+(\d+)", d)
    return int(m.group(1)) if m else default

# ---- page order, then page -> image object numbers
pages = []
for n, body in objs.items():
    d = dict_of(body)
    if re.search(rb"/Type\s*/Page[^s]", d):
        pages.append(n)
pages.sort()

def resources_of(pagenum):
    d = dict_of(objs[pagenum])
    m = re.search(rb"/Resources\s+(\d+)\s+0\s+R", d)
    if m: return dict_of(objs.get(int(m.group(1)), b""))
    m = re.search(rb"/Resources\s*(<<)", d)
    if not m: return b""
    i = d.find(b"<<", m.start(1)); depth = 0
    for mm in re.finditer(rb"<<|>>", d[i:]):
        depth += 1 if mm.group(0) == b"<<" else -1
        if depth == 0: return d[i:i + mm.end()]
    return b""

page_images = {}
for idx, p in enumerate(pages, start=1):
    res = resources_of(p)
    xo = re.search(rb"/XObject\s+(\d+)\s+0\s+R", res)
    block = dict_of(objs.get(int(xo.group(1)), b"")) if xo else res
    refs = [int(x) for x in re.findall(rb"/[A-Za-z0-9]+\s+(\d+)\s+0\s+R", block)]
    page_images[idx] = refs

def png_of(samples, w, h, channels, bpc):
    """A PNG from raw samples. Scanline filter byte 0 in front of each row."""
    stride = (w * channels * bpc + 7) // 8
    rows = b"".join(b"\x00" + samples[y * stride:(y + 1) * stride] for y in range(h))
    color = {1: 0, 3: 2, 4: 6}[channels]
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, bpc, color, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(rows, 6))
            + chunk(b"IEND", b""))

CHANNELS = {"DeviceRGB": 3, "DeviceGray": 1, "DeviceCMYK": 4}

seen = {}
for pageno, refs in page_images.items():
    for ref in refs: seen[ref] = seen.get(ref, 0) + 1
# The slide background and the logo sit on all 52 pages. Evidence sits on one.
CHROME = {ref for ref, n in seen.items() if n > 3}

manifest = []
for pageno, refs in page_images.items():
    for ref in refs:
        body = objs.get(ref)
        if not body: continue
        d = dict_of(body)
        if not re.search(rb"/Subtype\s*/Image", d): continue
        if ref in CHROME: continue
        w, h = num(d, b"Width"), num(d, b"Height")
        if not w or not h or w < 200 or h < 120: continue      # icons and rules
        bpc = num(d, b"BitsPerComponent", 8)
        filt = name(d, b"Filter")
        blob = stream_of(body)
        if blob is None: continue

        stem = f"p{pageno:02d}-o{ref}"
        if filt == "DCTDecode":
            # The stream's own boundaries, not the whitespace around them: a JPEG
            # runs from FFD8 to the LAST FFD9, and stripping newlines off the ends
            # of the slice produced files sips refused to open.
            i = blob.find(b"\xff\xd8")
            j = blob.rfind(b"\xff\xd9")
            if i < 0 or j < 0: continue
            path = OUT / f"{stem}.jpg"
            path.write_bytes(blob[i:j + 2])
        elif filt == "FlateDecode":
            if re.search(rb"/Predictor\s+([2-9]|1[0-9])", d): continue
            try: samples = zlib.decompress(blob.strip(b"\r\n"))
            except Exception: continue
            cs = name(d, b"ColorSpace")
            if cs in CHANNELS: channels = CHANNELS[cs]
            elif num(d, b"N"): channels = num(d, b"N")
            else:
                guess = len(samples) / (w * h) if w * h else 0
                channels = 3 if 2.5 < guess < 3.5 else 1 if 0.5 < guess < 1.5 else 0
            if channels not in (1, 3, 4): continue
            expected = (w * channels * bpc + 7) // 8 * h
            if len(samples) < expected: continue
            path = OUT / f"{stem}.png"
            path.write_bytes(png_of(samples[:expected], w, h, channels, bpc))
        else:
            continue
        manifest.append({"page": pageno, "object": ref, "file": path.name,
                         "width": w, "height": h, "bytes": path.stat().st_size})

(OUT / "manifest.json").write_text(json.dumps(
    {"source": SRC.name, "pages": len(pages), "images": manifest}, indent=2))
print(f"pages: {len(pages)}   images written: {len(manifest)}")
for r in manifest[:8]:
    print(f"   p{r['page']:>2}  {r['file']:<18} {r['width']}x{r['height']}  {r['bytes']//1024}KB")
