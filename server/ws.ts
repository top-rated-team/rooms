import type { IncomingMessage, Server } from "node:http";
import type { Duplex } from "node:stream";
import { setInterval } from "node:timers";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientEvent, ServerEvent, WorkspaceState } from "@shared/api";
import { storage } from "./storage";

const HEARTBEAT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 64 * 1024;
/** Close code for "this token does not open anything" — 4000-4999 is app space. */
const UNKNOWN_WORKSPACE = 4004;

interface SocketMeta {
  token: string;
  alive: boolean;
}

const rooms = new Map<string, Set<WebSocket>>();
const sockets = new WeakMap<WebSocket, SocketMeta>();

let wss: WebSocketServer | null = null;

export function attachWs(server: Server): void {
  if (wss) return;

  wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD_BYTES });

  server.on("upgrade", (req, socket, head) => {
    void handleUpgrade(req, socket, head);
  });

  const heartbeat = setInterval(sweep, HEARTBEAT_MS);
  heartbeat.unref();
}

export function broadcast(token: string, event: ServerEvent): void {
  const room = rooms.get(token);
  if (!room || room.size === 0) return;

  const payload = JSON.stringify(event);
  for (const client of room) {
    if (client.readyState !== WebSocket.OPEN) {
      room.delete(client);
      continue;
    }
    try {
      client.send(payload);
    } catch (error) {
      // A socket can close between the readyState check and the write; that is
      // a disconnected visitor, not a failure worth propagating to the caller.
      console.error("[ws] send failed:", error);
      room.delete(client);
    }
  }

  if (room.size === 0) rooms.delete(token);
}

async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  const server = wss;
  if (!server) return;

  let pathname: string;
  let token: string | null;
  try {
    const url = new URL(req.url ?? "/", "http://localhost");
    pathname = url.pathname;
    token = url.searchParams.get("token");
  } catch {
    socket.destroy();
    return;
  }

  if (pathname !== "/ws") {
    // In development Vite owns every other upgrade (its HMR channel), so the
    // socket must be left alone. In production nothing else claims one.
    if (process.env.NODE_ENV !== "production") return;
    socket.destroy();
    return;
  }

  if (!token) {
    refuse(server, req, socket, head, "Missing workspace token");
    return;
  }

  let state: WorkspaceState | null = null;
  try {
    state = await storage.getWorkspaceByToken(token);
  } catch (error) {
    console.error("[ws] workspace lookup failed:", error);
  }

  if (!state) {
    refuse(server, req, socket, head, "Unknown workspace");
    return;
  }

  const resolved = state;
  const workspaceToken = token;
  server.handleUpgrade(req, socket, head, (client) => {
    accept(client, workspaceToken, resolved);
  });
}

/**
 * Completing the handshake before closing costs one round trip but gives the
 * browser a real close code; destroying the socket surfaces as an opaque
 * network error the client cannot tell apart from a dead server.
 */
function refuse(server: WebSocketServer, req: IncomingMessage, socket: Duplex, head: Buffer, reason: string): void {
  server.handleUpgrade(req, socket, head, (client) => {
    client.close(UNKNOWN_WORKSPACE, reason);
  });
}

function accept(client: WebSocket, token: string, state: WorkspaceState): void {
  sockets.set(client, { token, alive: true });

  let room = rooms.get(token);
  if (!room) {
    room = new Set<WebSocket>();
    rooms.set(token, room);
  }
  room.add(client);

  send(client, { type: "hello", state });

  client.on("pong", () => {
    const meta = sockets.get(client);
    if (meta) meta.alive = true;
  });

  client.on("message", (raw) => {
    const meta = sockets.get(client);
    if (meta) meta.alive = true;
    handleClientEvent(client, token, raw.toString());
  });

  client.on("error", (error) => {
    console.error("[ws] socket error:", error);
  });

  client.on("close", () => {
    const current = rooms.get(token);
    if (!current) return;
    current.delete(client);
    if (current.size === 0) rooms.delete(token);
  });
}

function handleClientEvent(client: WebSocket, token: string, raw: string): void {
  let event: ClientEvent;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof (parsed as { type?: unknown }).type !== "string") return;
    event = parsed as ClientEvent;
  } catch {
    return;
  }

  if (event.type !== "typing" || typeof event.channelId !== "string") return;

  const room = rooms.get(token);
  if (!room) return;
  const payload = JSON.stringify({ type: "typing", memberKey: "visitor", channelId: event.channelId } satisfies ServerEvent);
  for (const peer of room) {
    if (peer === client || peer.readyState !== WebSocket.OPEN) continue;
    try {
      peer.send(payload);
    } catch {
      room.delete(peer);
    }
  }
}

function send(client: WebSocket, event: ServerEvent): void {
  try {
    client.send(JSON.stringify(event));
  } catch (error) {
    console.error("[ws] send failed:", error);
  }
}

function sweep(): void {
  for (const [token, room] of rooms) {
    for (const client of room) {
      const meta = sockets.get(client);
      if (!meta || !meta.alive) {
        room.delete(client);
        client.terminate();
        continue;
      }
      meta.alive = false;
      try {
        client.ping();
      } catch {
        room.delete(client);
        client.terminate();
      }
    }
    if (room.size === 0) rooms.delete(token);
  }
}
