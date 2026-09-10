import { listServices, listPrices, listCases } from "../server/connector/handlers";
import { openApiDocument } from "../server/connector/openapi";
import { MCP_TOOLS } from "../server/connector/mcp";

function hits(label: string, value: unknown) {
  const text = JSON.stringify(value, null, 1);
  const lines = text.split("\n");
  const found = lines
    .map((l, i) => [i, l] as const)
    .filter(([, l]) => /linkedin|autopilot|top.?voice|warmlike|unipile/i.test(l));
  console.log(`\n===== ${label} (${found.length} matching lines) =====`);
  for (const [i, l] of found) console.log(`${i}: ${l.trim()}`);
}

hits("listServices", listServices());
hits("listPrices", listPrices());
hits("listCases", listCases());
hits("openApiDocument", openApiDocument("https://ai.top-rated.team"));
hits("MCP_TOOLS", MCP_TOOLS);
console.log("\nservice ids:", listServices().services.map((s) => s.id).join(", "));
