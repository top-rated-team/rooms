import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";

import Door from "@/pages/door";
import Doors from "@/pages/doors";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

/* The landing page is paid traffic and bounces on latency, so the workspace —
 * chat, websocket client, markdown renderer — is a separate chunk it never
 * downloads. Only /w/:token pays for it.
 *
 * /work and /work/:slug are not lazy: they are Header, Footer, DoorCard, the
 * panel and the door table, and the doors table is what the panel already
 * reads. Splitting them would buy nothing and cost a round trip. Neither one
 * imports anything out of @/pages/workspace or @/components/workspace, so a
 * visitor choosing a door still never downloads the room. */
const Workspace = lazy(() => import("@/pages/workspace"));

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
        <Route path="/work" component={Doors} />
        {/* Every door answers here. Which one, and whether it has a panel at
            all, is read out of the row — see shared/doors.ts. */}
        <Route path="/work/:slug" component={Door} />
        <Route path="/w/:token" component={Workspace} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
