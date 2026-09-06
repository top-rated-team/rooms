import { Suspense, lazy } from "react";
import { Route, Switch } from "wouter";

import Doors from "@/pages/doors";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

/* The landing page is paid traffic and bounces on latency, so the workspace —
 * chat, websocket client, markdown renderer — is a separate chunk it never
 * downloads. Only /w/:token pays for it.
 *
 * /work is not lazy: it is Header, Footer, DoorCard and the door table, and the
 * doors table is what the panel already reads. Splitting it would buy nothing
 * and cost a round trip. */
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
        <Route path="/w/:token" component={Workspace} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}
