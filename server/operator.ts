/**
 * The operator config a fork writes on /setup. Read on every request, so a
 * change in the cabinet is what the next visitor sees — no rebuild, no restart.
 *
 * The file holds the model key when the operator brought their own. Nothing
 * that goes on the wire, including an error, may include that key.
 */

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
