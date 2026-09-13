/**
 * Two short promo animations for the Top-Rated Team Upwork page.
 *
 *   npx tsx scripts/build-promo-video.ts
 *
 * WHAT UPWORK ACTUALLY ACCEPTS, from their own pages, not guessed:
 *
 * Profile introduction (the sidebar field on a profile):
 *   YouTube hosts the file. Upwork takes a YouTube URL, not a direct upload.
 *   Aspect ratio: 16:9. Recommended 1920×1080 as a minimum.
 *   Length: their script guide says communicate the points in 30–60 seconds;
 *   the help article says keep it around two to three minutes.
 *   File size on Upwork: none. YouTube is the host.
 *   https://www.upwork.com/resources/self-introduction-video-script
 *   https://support.upwork.com/hc/en-us/articles/360016144974-How-to-enhance-your-freelancer-profile
 *
 * That same resources page also says the introduction "must be a video of you
 * and no one else", and the add step asks for "Me talking about my skills and
 * experience". These two files are animations, not that. They belong as
 * Project Catalog or portfolio media, or as text slides beside a talking-head.
 *
 * Project Catalog (a hard cap, if the owner puts either file on a catalog card):
 *   MP4 only, at most 60 seconds, at most 100 MB.
 *   https://support.upwork.com/hc/en-us/articles/1500011309082-How-to-add-images-and-video-to-your-Project-Catalog-project
 *
 * Portfolio upload from disk: 100 MB. YouTube/Vimeo links have no size cap.
 *   https://support.upwork.com/hc/en-us/articles/39295662788115-Why-won-t-my-portfolio-item-publish
 *
 * WHAT THIS RENDERS: 1920×1080, 16:9, 45 seconds, MP4 H.264, no audio. Under
 * every published cap. Two files so the owner can see which language lands —
 * this site's, and Upwork's (their green and grotesque, not their logo).
 *
 * Copy is read from shared/doors.ts, shared/pricing.ts and shared/adgrant.ts.
 * A hand-edited clip would still be saying last month's price.
 */
import path from "node:path";

import { renderHtmlToMp4 } from "./promo/capture";
import { DURATION_MS } from "./promo/copy";
import { siteHtml } from "./promo/site-html";
import { upworkHtml } from "./promo/upwork-html";

const OUT_DIR = "docs/promo";

function report(label: string, video: { path: string; durationSec: number; width: number; height: number; bytes: number }): void {
  const mb = (video.bytes / (1024 * 1024)).toFixed(2);
  const seconds = video.durationSec.toFixed(1);
  console.log(
    `${label} — ${seconds}s, ${video.width}×${video.height}, ${video.bytes} bytes (${mb} MB) → ${video.path}`,
  );
}

async function main(): Promise<void> {
  const sitePath = path.resolve(OUT_DIR, "site.mp4");
  const upworkPath = path.resolve(OUT_DIR, "upwork.mp4");

  console.log(`Rendering ${DURATION_MS / 1000}s at 1920×1080…`);
  const site = await renderHtmlToMp4(siteHtml(), sitePath);
  report("site", site);
  const upwork = await renderHtmlToMp4(upworkHtml(), upworkPath);
  report("upwork", upwork);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
