import type { Lead } from "@shared/schema";

const WEBHOOK_TIMEOUT_MS = 6_000;

interface LeadPayload {
  id: string;
  createdAt: string;
  workspaceId: string | null;
  workspaceName: string | null;
  name: string | null;
  email: string | null;
  company: string | null;
  website: string | null;
  intent: string | null;
  message: string | null;
  source: Record<string, string>;
}

/**
 * Deliver a lead to whoever is on call. The workspace token is deliberately
 * absent from the payload: it is a bearer credential that would hand anyone who
 * can read the webhook full access to the visitor's workspace. The workspace id
 * and name are enough to find it from our side.
 */
export async function notifyLead(lead: Lead, context?: { workspaceName?: string }): Promise<void> {
  const payload: LeadPayload = {
    id: lead.id,
    createdAt: (lead.createdAt instanceof Date ? lead.createdAt : new Date()).toISOString(),
    workspaceId: lead.workspaceId,
    workspaceName: context?.workspaceName ?? null,
    name: lead.name,
    email: lead.email,
    company: lead.company,
    website: lead.website,
    intent: lead.intent,
    message: lead.message,
    source: lead.source ?? {},
  };

  const url = process.env.LEAD_WEBHOOK_URL?.trim();
  if (!url) {
    printLead(payload, "no LEAD_WEBHOOK_URL configured");
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[lead] webhook responded ${response.status} ${response.statusText}`);
      printLead(payload, `webhook returned ${response.status}`);
      return;
    }

    console.log(`[lead] delivered ${payload.id} to the lead webhook`);
  } catch (error) {
    // A broken webhook must never fail the visitor's request, and a lead that
    // cannot be delivered still has to end up somewhere a human will see it.
    console.error("[lead] webhook delivery failed:", error);
    printLead(payload, "webhook delivery failed");
  }
}

function printLead(payload: LeadPayload, reason: string): void {
  const rows: Array<[string, string]> = [
    ["workspace", payload.workspaceName ? `${payload.workspaceName} (${payload.workspaceId ?? "-"})` : payload.workspaceId ?? "-"],
    ["intent", payload.intent ?? "-"],
    ["name", payload.name ?? "-"],
    ["email", payload.email ?? "-"],
    ["company", payload.company ?? "-"],
    ["website", payload.website ?? "-"],
    ["source", Object.keys(payload.source).length ? JSON.stringify(payload.source) : "-"],
    ["message", payload.message ?? "-"],
  ];

  const lines = [
    `---- NEW LEAD ${payload.id} (${reason}) ----`,
    `  received  : ${payload.createdAt}`,
    ...rows.map(([label, value]) => `  ${label.padEnd(10)}: ${value}`),
    "-".repeat(48),
  ];

  console.log(lines.join("\n"));
}
