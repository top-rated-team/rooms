import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";

import { Home } from "@/components/adgrant/Home";
import { LibraryIndex } from "@/components/adgrant/LibraryIndex";
import { LibraryPage } from "@/components/adgrant/LibraryPage";
import { Meta } from "@/components/adgrant/Meta";
import { Missing } from "@/components/adgrant/Missing";
import { Shell } from "@/components/adgrant/Shell";
import { TemplatePage } from "@/components/adgrant/TemplatePage";
import { TemplatesIndex } from "@/components/adgrant/TemplatesIndex";
import { formatCount } from "@/components/adgrant/format";
import { mountHome, sectionPath, leafPath } from "@/components/adgrant/links";
import Door from "@/pages/adgrant/door";
import Privacy from "@/pages/adgrant/privacy";
import Services from "@/pages/adgrant/services";
import Terms from "@/pages/adgrant/terms";
import { STATS } from "@shared/adgrant";

const Workspace = lazy(() => import("@/pages/workspace"));

function WorkspaceFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="type-note text-muted-foreground">Opening workspace…</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * ADGRANT.AI'S TREE, IN THIS APPLICATION.
 *
 * client/index.html is the one head this process serves, so a second host with
 * its own title is owner work for when no wave is running. Each route sets
 * title and description from that page's own meta, the way landing.tsx does.
 *
 * URL shapes are the live ones — /glossary/<slug>, /tricks/<slug> and their
 * siblings — under ADGRANT_MOUNT until the tree moves. Nested paths only
 * render when App.tsx matches them; that change is a handoff, because this
 * parcel does not own App.tsx.
 * ------------------------------------------------------------------------- */

const HOME_TITLE = "AdGrant.AI — a Google Ad Grant structure from the nonprofit's website";
const HOME_DESCRIPTION = `${formatCount(STATS.accountsProcessed)} Ad Grant accounts processed, ${formatCount(STATS.totals.campaigns)} campaigns, ${formatCount(STATS.totals.keywords)} keywords. A structure is produced from the nonprofit's website and shown here. Nothing is written into a Google Ads account.`;

function HomeRoute() {
  return (
    <>
      <Meta title={HOME_TITLE} description={HOME_DESCRIPTION} />
      <Home />
    </>
  );
}

function Pages() {
  return (
    <Shell>
      <Switch>
        <Route path={mountHome()} component={HomeRoute} />
        <Route path={sectionPath("services")} component={Services} />
        <Route path={leafPath("services", ":slug")} component={Door} />
        <Route path={sectionPath("privacy")} component={Privacy} />
        <Route path={sectionPath("terms")} component={Terms} />
        <Route path={sectionPath("glossary")}>
          <LibraryIndex segment="glossary" />
        </Route>
        <Route path={leafPath("glossary", ":slug")}>
          <LibraryPage segment="glossary" />
        </Route>
        <Route path={sectionPath("case-studies")}>
          <LibraryIndex segment="case-studies" />
        </Route>
        <Route path={leafPath("case-studies", ":slug")}>
          <LibraryPage segment="case-studies" />
        </Route>
        <Route path={sectionPath("tricks")}>
          <LibraryIndex segment="tricks" />
        </Route>
        <Route path={leafPath("tricks", ":slug")}>
          <LibraryPage segment="tricks" />
        </Route>
        <Route path={sectionPath("nonprofits")}>
          <LibraryIndex segment="nonprofits" />
        </Route>
        {/* A plain wildcard, because these slugs are two segments and wouter's
            named rest parameter did not match them. LibraryPage reads the slug
            off the address rather than out of the pattern. */}
        <Route path={`${sectionPath("nonprofits")}/*`}>
          <LibraryPage segment="nonprofits" />
        </Route>
        <Route path={sectionPath("templates")} component={TemplatesIndex} />
        <Route path={leafPath("templates", ":slug")} component={TemplatePage} />
        <Route>
          <Missing title="This page is not in the library" />
        </Route>
      </Switch>
    </Shell>
  );
}

export function AdGrantApp() {
  return (
    <Switch>
      {/* Rooms live at /w on this host too. App.tsx does not mount them when
          the process is answering as adgrant.ai, and this parcel cannot edit
          that file, so the route has to live here. */}
      <Route path="/w/:token">
        <Suspense fallback={<WorkspaceFallback />}>
          <Workspace />
        </Suspense>
      </Route>
      <Route path="/w">
        <Suspense fallback={<WorkspaceFallback />}>
          <Workspace />
        </Suspense>
      </Route>
      <Route>
        <Pages />
      </Route>
    </Switch>
  );
}

export default AdGrantApp;
