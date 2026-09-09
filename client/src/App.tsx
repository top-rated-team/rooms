import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";

import Door from "@/pages/door";
import Doors from "@/pages/doors";
import CaseStudies from "@/pages/case-studies";
import Blog from "@/pages/blog";
import BlogPost from "@/pages/blog-post";
import Pricing from "@/pages/pricing";
import Landing from "@/pages/landing";
import Team from "@/pages/team";
import RoiCalculator from "@/pages/roi-calculator";
import NotFound from "@/pages/not-found";
import Setup from "@/pages/setup";
import Privacy from "@/pages/privacy";
import Terms from "@/pages/terms";

/* The landing page is paid traffic and bounces on latency, so the workspace —
 * chat, websocket client, markdown renderer — is a separate chunk it never
 * downloads. Only /w/:token pays for it.
 *
 * /services and /services/:slug are not lazy: they are Header, Footer, DoorCard, the
 * panel and the door table, and the doors table is what the panel already
 * reads. Splitting them would buy nothing and cost a round trip. Neither one
 * imports anything out of @/pages/workspace or @/components/workspace, so a
 * visitor choosing a door still never downloads the room. */
const Workspace = lazy(() => import("@/pages/workspace"));
const AdGrantApp = lazy(() => import("@/pages/adgrant"));

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Opening workspace…</p>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/services" component={Doors} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/case-studies" component={CaseStudies} />
        <Route path="/team" component={Team} />
        <Route path="/roi-calculator" component={RoiCalculator} />
        <Route path="/blog" component={Blog} />
        <Route path="/blog/:slug" component={BlogPost} />
        {/* Every door answers here. Which one, and whether it has a panel at
            all, is read out of the row — see shared/doors.ts. */}
        <Route path="/services/:slug" component={Door} />
        <Route path="/w/:token" component={Workspace} />
        {/* /w with nothing after it: the rooms this browser remembers. */}
        <Route path="/w" component={Workspace} />
        {/* /setup and /partner are one page: the form, then the same form as the cabinet. */}
        {/* The two legal addresses. Both answered 200 with a 404 page for
            months, which is what a single-page shell does with an address it
            has no route for — and what Google's brand review reported as a
            privacy policy with insufficient content. */}
        <Route path="/privacy" component={Privacy} />
        <Route path="/terms" component={Terms} />
        <Route path="/setup" component={Setup} />
        <Route path="/partner" component={Setup} />
        {/* AdGrant.AI's own tree. Own chrome, not the site header. Mounted here
            because client/index.html is the one head this process serves. Lazy
            so the landing page does not download it. */}
        {/* "/adgrant/*?" and not "/adgrant": a bare path in wouter matches
            EXACTLY, so every page of this library — the glossary, the case
            studies, the tricks, the templates — answered "Page not found" from
            the day it was built, and only the home page ever rendered. The
            optional wildcard keeps /adgrant itself matching and hands the full
            path to the tree's own Switch, which routes on absolute paths that
            already carry the mount. */}
        <Route path="/adgrant/*?">
          <Suspense
            fallback={
              <div className="flex min-h-screen items-center justify-center bg-background">
                <p className="type-note text-muted-foreground">Opening AdGrant.AI…</p>
              </div>
            }
          >
            <AdGrantApp />
          </Suspense>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
