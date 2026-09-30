/* FIRST, before any other module runs: a bare /book, and the owner's signature
   links. The popup's host registers while its module is imported, and reads
   the address then, so this cannot wait for the body of this file. */
import "@/lib/operator-shortcut";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/hooks/use-theme";
import { queryClient } from "@/lib/queryClient";
import "./index.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Missing #root — client/index.html no longer matches main.tsx.");
}

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={200}>
          <App />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
