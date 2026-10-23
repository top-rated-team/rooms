/**
 * The operator config a fork writes on /setup. Read on every request, so a
 * change in the cabinet is what the next visitor sees — no rebuild, no restart.
 *
 * The file holds the model key when the operator brought their own. Nothing
 * that goes on the wire, including an error, may include that key.
 */

import { timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { NextFunction, Request, Response } from "express";

import { catalogue } from "@shared/doors";
import {
  asOperatorConfig,
  isHouseHost,
  parseOperatorWrite,
  publicOperator,
  redactSecrets,
  OperatorInputError,
  type OperatorConfig,
  type OperatorIdentity,
  type OperatorPublic,
  type OperatorService,
  type OperatorWrite,
} from "@shared/operator";

const DEFAULT_PATH = path.resolve(process.cwd(), "data", "operator.json");

interface StoredOperator {
  identity: OperatorIdentity;
  services: Record<string, OperatorService>;
  origin: string;
  model: { useOwnKey: boolean };
  /** Write-only. Never copied onto a response. */
  apiKey?: string;
}

let configPath = process.env.OPERATOR_CONFIG_PATH?.trim() || DEFAULT_PATH;
let hostKeyAtBoot = process.env.OPENAI_API_KEY ?? "";

export function operatorConfigPath(): string {
  return configPath;
}

/**
 * Test seam. Points the store at a temp file and restores the host key the
 * process booted with, so a saved operator key cannot leak into a later test.
 */
export function resetOperatorForTests(opts: { file?: string; hostKey?: string } = {}): void {
  if (opts.file) configPath = opts.file;
  else configPath = process.env.OPERATOR_CONFIG_PATH?.trim() || DEFAULT_PATH;
  if (opts.hostKey !== undefined) hostKeyAtBoot = opts.hostKey;
  applyModelKey(readStored());
}

export function restoreOperatorDefaultsForTests(): void {
  configPath = process.env.OPERATOR_CONFIG_PATH?.trim() || DEFAULT_PATH;
  applyModelKey(readStored());
}

function applyModelKey(stored: StoredOperator | null): void {
  if (stored?.model.useOwnKey) {
    process.env.OPENAI_API_KEY = stored.apiKey?.trim() || "";
  } else {
    process.env.OPENAI_API_KEY = hostKeyAtBoot;
  }
}

function readStored(): StoredOperator | null {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as StoredOperator;
    if (!parsed || typeof parsed !== "object" || typeof parsed.identity?.legalName !== "string") {
      return null;
    }
    if (!parsed.identity.legalName.trim()) return null;
    return parsed;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw error;
  }
}

function writeStored(record: StoredOperator): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const tmp = `${configPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(record, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tmp, configPath);
}

function secretsInPlay(stored: StoredOperator | null, incomingKey?: string): string[] {
  const secrets: string[] = [];
  if (stored?.apiKey) secrets.push(stored.apiKey);
  if (incomingKey) secrets.push(incomingKey);
  return secrets;
}

function sendJson(res: Response, status: number, body: unknown, secrets: readonly string[] = []): void {
  const payload = redactSecrets(JSON.stringify(body), secrets);
  res.status(status).type("application/json").send(payload);
}

function sendError(res: Response, status: number, message: string, secrets: readonly string[] = []): void {
  sendJson(res, status, { error: redactSecrets(message, secrets) }, secrets);
}

/**
 * WHO MAY SAVE A CONFIG. Saving one re-brands every page this process serves
 * and, with `useOwnKey`, swaps the model key every answer is paid with — the
 * key a room's conversation is sent under. It was open to anyone who could
 * reach PUT /api/operator. Two rules now, and both fail closed:
 *
 * 1. NEVER ON A HOUSE HOST. top-rated.team and adgrant.ai are the reference
 *    deployment, and the catalogue is forbidden to change there. Nobody saves
 *    a config on them, with or without a token.
 * 2. ON A FORK, ONLY WITH THE DEPLOYMENT'S SET-UP TOKEN. Whoever runs the host
 *    sets OPERATOR_SETUP_TOKEN there and types it on /setup. Without it there
 *    is no first-come window in which a stranger names themselves the
 *    operator, and no way to overwrite a partner's config afterwards. A host
 *    with no token, or one too short to resist guessing, saves nothing.
 *
 * The house rule is checked first and does not depend on the token, so a
 * Host header that lies about being a fork still needs a token the house
 * never sets.
 */
export const OPERATOR_SETUP_TOKEN_HEADER = "x-operator-setup-token";
export const OPERATOR_SETUP_TOKEN_MIN = 16;

export const OPERATOR_HOUSE_REFUSED_LINE =
  "This is Top-Rated Team's own deployment, and it takes no operator config from anyone. A config is for a copy of this site running on your own domain.";
export const OPERATOR_TOKEN_MISSING_LINE =
  `Saving is switched off until this deployment has a set-up token. Set OPERATOR_SETUP_TOKEN on the host to a random value of at least ${OPERATOR_SETUP_TOKEN_MIN} characters, restart it, and enter the same value here.`;
export const OPERATOR_TOKEN_WRONG_LINE =
  "That is not this deployment's set-up token. It is the value of OPERATOR_SETUP_TOKEN on the host this runs on.";

function configuredSetupToken(): string | null {
  const token = process.env.OPERATOR_SETUP_TOKEN?.trim() ?? "";
  return token.length >= OPERATOR_SETUP_TOKEN_MIN ? token : null;
}

function tokenMatches(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  /* timingSafeEqual throws on unequal lengths, and a throw here would be a
     500 that says more than a refusal does. */
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Why this request may not save a config, or null when it may. */
export function operatorWriteRefusal(req: Request): { status: 401 | 403; error: string } | null {
  if (isHouseHost(req.hostname)) return { status: 403, error: OPERATOR_HOUSE_REFUSED_LINE };
  const expected = configuredSetupToken();
  if (!expected) return { status: 403, error: OPERATOR_TOKEN_MISSING_LINE };
  if (!tokenMatches(expected, req.get(OPERATOR_SETUP_TOKEN_HEADER)?.trim())) {
    return { status: 401, error: OPERATOR_TOKEN_WRONG_LINE };
  }
  return null;
}

function skipGate(req: Request): boolean {
  const pathname = req.path;
  if (pathname.startsWith("/api")) return true;
  if (pathname.startsWith("/@")) return true;
  if (pathname.startsWith("/src")) return true;
  if (pathname.startsWith("/node_modules")) return true;
  if (pathname.startsWith("/assets")) return true;
  const last = pathname.split("/").pop() ?? "";
  if (last.includes(".")) return true;
  return false;
}

export function isOperatorConfigured(): boolean {
  return readStored() !== null;
}

/**
 * The config partner-catalogue reads. Null when this deployment has no
 * operator, so catalogue() stays today's doors — that is what keeps
 * ai.top-rated.team as it is.
 */
export function operatorConfig(): OperatorConfig | null {
  const stored = readStored();
  applyModelKey(stored);
  if (!stored) return null;
  return asOperatorConfig({
    identity: stored.identity,
    services: stored.services,
    origin: stored.origin,
    model: { useOwnKey: stored.model.useOwnKey },
  });
}

/** The catalogue as this deployment should show it, resolved from the saved config. */
export function seededCatalogue() {
  return catalogue(operatorConfig());
}

function toPublic(stored: StoredOperator | null): OperatorPublic {
  applyModelKey(stored);
  if (!stored) return publicOperator(null);
  return publicOperator({
    identity: stored.identity,
    services: stored.services,
    origin: stored.origin,
    model: stored.model,
    hasKey: Boolean(stored.apiKey?.trim()),
  });
}

function mergeKey(previous: StoredOperator | null, write: OperatorWrite): string | undefined {
  const incoming = write.model.apiKey?.trim();
  if (incoming) return incoming;
  if (write.model.useOwnKey) return previous?.apiKey;
  return undefined;
}

/**
 * With no operator, every page on a fork goes to /setup. The house hosts —
 * localhost and top-rated.team — are the reference deployment and stay as they
 * are, because an operator config on those would re-brand the site that the
 * catalogue parcel is forbidden to change.
 *
 * /setup itself is allowed through so the form can load. Once a config exists,
 * /setup becomes /partner.
 */
export function operatorGate(req: Request, res: Response, next: NextFunction): void {
  if (skipGate(req)) {
    applyModelKey(readStored());
    next();
    return;
  }

  const stored = readStored();
  applyModelKey(stored);
  const configured = stored !== null;
  const house = isHouseHost(req.hostname);
  const navigating = req.method === "GET" || req.method === "HEAD";

  if (!configured && house) {
    next();
    return;
  }

  if (!configured) {
    if (req.path === "/setup") {
      next();
      return;
    }
    if (navigating) {
      res.redirect(302, "/setup");
      return;
    }
    next();
    return;
  }

  if (navigating && req.path === "/setup") {
    res.redirect(302, "/partner");
    return;
  }

  next();
}

export async function readOperator(req: Request, res: Response): Promise<void> {
  const stored = readStored();
  try {
    sendJson(res, 200, toPublic(stored), secretsInPlay(stored));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the operator config.";
    sendError(res, 500, message, secretsInPlay(stored));
  }
}

export async function writeOperator(req: Request, res: Response): Promise<void> {
  const previous = readStored();
  const incomingKey = typeof req.body?.model?.apiKey === "string" ? req.body.model.apiKey : undefined;
  const secrets = secretsInPlay(previous, incomingKey);

  const refused = operatorWriteRefusal(req);
  if (refused) {
    sendError(res, refused.status, refused.error, secrets);
    return;
  }

  try {
    const write = parseOperatorWrite(req.body);
    const apiKey = mergeKey(previous, write);
    const record: StoredOperator = {
      identity: write.identity,
      services: write.services ?? {},
      origin: write.origin,
      model: { useOwnKey: write.model.useOwnKey },
      ...(apiKey ? { apiKey } : {}),
    };
    writeStored(record);
    applyModelKey(record);
    sendJson(res, 200, toPublic(record), secretsInPlay(record, incomingKey));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the operator config.";
    const status = error instanceof OperatorInputError ? 400 : 500;
    sendError(res, status, message, secrets);
  }
}
