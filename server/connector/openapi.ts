/**
 * OpenAPI 3.1 for the Custom GPT. The operations named here are the MCP tools
 * named in mcp.ts, and both call handlers.ts — same names, same bodies.
 */

import { AGENT_BY_ID } from "@shared/roster";

import type { Request } from "express";

import { publicBaseUrl } from "./handlers";

/* HIDDEN WHILE THE LINKEDIN APPLICATION IS UNDER REVIEW. Delete this filter when the application is answered. */
const AGENT_IDS = Object.keys(AGENT_BY_ID).filter((id) => !AGENT_BY_ID[id]?.hidden);

export function openApiDocument(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Top-Rated Team",
      version: "1.0.0",
      description:
        "Read the services Top-Rated Team publishes, the price rows as written, and the case studies. Ask a question that is answered from the same documentation the site's panel uses. Open a room and hand the person the address that comes back. This surface does not list rooms, leads or members, and it does not accept a room token.",
    },
    servers: [{ url: baseUrl }],
    paths: {
      "/api/connector/services": {
        get: {
          operationId: "list_services",
          summary: "List the published services",
          description:
            "Returns every published offer: the headline, the two sentences under it, whose name is on the contract, whether the panel is open, and which agent answers first. Use this to explain the company. Quote the fields as returned. A coming door has a comingLine saying why its panel is shut; do not describe that panel as open.",
          responses: {
            "200": {
              description: "The services, in the order the site lists them.",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/connector/prices": {
        get: {
          operationId: "list_prices",
          summary: "List the published price rows",
          description:
            "Returns the price ladder exactly as written. Repeat a row's price, buys and condition verbatim. Do not turn a figure into a range, do not add a figure that is not in the list, and do not invent a price for a service whose priceTier is partner — that row is absent on purpose, because another company sets that price.",
          responses: {
            "200": {
              description: "The published rows.",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/connector/cases": {
        get: {
          operationId: "list_cases",
          summary: "List the published case studies",
          description:
            "Returns every case study the site publishes: client, challenge, work and the metrics as recorded. These are claims about named accounts. Repeat the numbers as returned. Five services have no case; do not invent one for them.",
          responses: {
            "200": {
              description: "The case studies.",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/connector/ask": {
        post: {
          operationId: "ask_question",
          summary: "Ask a grounded question",
          description:
            "Sends the question through the same answer path the site's /api/ask panel uses, including the spend ceiling. Pass agentId from a service's firstAgentId when that service has one. If firstAgentId is null, do not ask — that door has no agent of ours. Live answers need an OpenAI key on the deployment; without one the response says they are not configured.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["question"],
                  properties: {
                    question: {
                      type: "string",
                      minLength: 1,
                      maxLength: 4000,
                      description: "The visitor's question, in full.",
                    },
                    agentId: {
                      type: "string",
                      description:
                        "Which agent answers. Use a service's firstAgentId. Omit to use the ChatGPT Ads agent.",
                      enum: AGENT_IDS,
                    },
                    history: {
                      type: "array",
                      maxItems: 20,
                      description: "Earlier turns of this conversation, oldest first.",
                      items: {
                        type: "object",
                        required: ["role", "content"],
                        properties: {
                          role: { type: "string", enum: ["user", "assistant"] },
                          content: { type: "string", maxLength: 8000 },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "The answer, any citations, or an error sentence.",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "400": {
              description: "The body was not a question this endpoint accepts.",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "429": {
              description: "This address has asked too many questions in a minute.",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/connector/rooms": {
        post: {
          operationId: "create_room",
          summary: "Open a room and return its address",
          description:
            "Opens a room the same way the site's Keep step does. The response is only the address. Give that address to the person you are inviting and to nobody else: anyone who has it can enter. Pass doorId so the room carries that service's contract name. Do not call this to look up an existing room — there is no read on this path.",
          "x-openai-isConsequential": true,
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    visitorName: {
                      type: "string",
                      maxLength: 120,
                      description: "The invited person's name, if they gave one.",
                    },
                    visitorEmail: {
                      type: "string",
                      format: "email",
                      maxLength: 200,
                      description: "The invited person's email, if they gave one.",
                    },
                    visitorCompany: {
                      type: "string",
                      maxLength: 160,
                      description: "Their company, if they gave one.",
                    },
                    visitorWebsite: {
                      type: "string",
                      maxLength: 300,
                      description: "Their website, if they gave one.",
                    },
                    name: {
                      type: "string",
                      maxLength: 120,
                      description: "A name for the room. Optional.",
                    },
                    doorId: {
                      type: "string",
                      maxLength: 64,
                      description: "The service this room is for, from list_services.",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "201": {
              description: "The room's address.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    required: ["url"],
                    properties: {
                      url: {
                        type: "string",
                        description: "The address of the room. It is the whole credential.",
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "The body named a door that does not exist, or failed validation.",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "429": {
              description: "This address has opened too many rooms in an hour.",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
    },
  };
}

export function openApiFor(req: Request) {
  return openApiDocument(publicBaseUrl(req));
}

/** Every operationId, in one list, so the MCP tools can be checked against it. */
export function openApiOperationIds(): string[] {
  const spec = openApiDocument("https://example.invalid");
  const ids: string[] = [];
  for (const path of Object.values(spec.paths)) {
    for (const op of Object.values(path)) {
      if (op && typeof op === "object" && "operationId" in op && typeof op.operationId === "string") {
        ids.push(op.operationId);
      }
    }
  }
  return ids;
}
