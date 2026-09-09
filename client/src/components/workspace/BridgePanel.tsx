import { useCallback, useEffect, useState } from "react";
import type { BridgeKind, RoomBridge } from "@shared/api";
import { ApiError, apiRequest } from "@/lib/apiRequest";
import { cn } from "@/lib/utils";
import { ACTION, ACTION_QUIET, CHROME, FOCUS, LABEL, META, READ } from "@/components/workspace/room-style";

/* ---------------------------------------------------------------------------
 * BRIDGES, AS DOORS INTO THIS ROOM
 *
 * Contractors answer from ChatWoot on one shared inbox and one WhatsApp
 * number. The client is in WhatsApp, and for more than one person on their
 * side, a WhatsApp group. Slack and ClickUp are theirs: one channel or one
 * list, connected by them, revocable by them.
 *
 * The copy below has to stay true of the server. If a sentence here is not
 * true of server/bridge, change the code or change the sentence.
 * ------------------------------------------------------------------------- */

const GROUP_WARNING =
  "A message sent to a WhatsApp group is readable by everyone in that group and stored on their phones.";

const TOKEN_WARNING =
  "This room's address does not go out over WhatsApp, ChatWoot, Slack or ClickUp. A link in a group chat is the account.";

const SLACK_CLICKUP =
  "Slack and ClickUp are yours. They connect to one channel or one list, not a copy of this room, and you can disconnect them here.";

const ATTRIBUTION =
  "Every message that leaves names who is speaking, taken from this room's member list. An agent is labelled Agent. A person is labelled as their badge. That is not a convention somebody has to remember.";

const FAILURE =
  "If a message cannot be delivered, it is marked on that message here. It is not dropped silently.";

const MEMORY =
  "Bridges are kept in this process. A restart forgets them. Reconnect if that happens.";

const CHATWOOT_INBOX =
  "This room opens its own contact and its own conversation in the inbox. You do not have to paste a conversation id. If the inbox, the account and the host are already set on this deployment, Connect is enough. The room is named in ChatWoot as a custom attribute, not in the message, and the room's address is not sent.";

const KINDS: { kind: BridgeKind; name: string; targetHint: string }[] = [
  { kind: "whatsapp", name: "WhatsApp", targetHint: "Chat id, for example 15551234567@c.us or a group @g.us" },
  { kind: "chatwoot", name: "ChatWoot", targetHint: "Inbox identifier. This room will open its own conversation." },
  { kind: "slack", name: "Slack", targetHint: "The name of the one channel this will write into" },
  { kind: "clickup", name: "ClickUp", targetHint: "One task id on one list, not the workspace" },
];

type View = { kind: "loading" } | { kind: "ready"; bridges: RoomBridge[] } | { kind: "missing" };

export interface BridgePanelProps {
  token: string;
  /**
   * Who may connect or disconnect. A visitor with no bridge sees nothing.
   * Defaults off: this panel is plumbing, and an empty form does not belong
   * on the first screen.
   */
  canManage?: boolean;
  className?: string;
}

export function BridgePanel({ token, canManage = false, className }: BridgePanelProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [working, setWorking] = useState<BridgeKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openKind, setOpenKind] = useState<BridgeKind | null>(null);
  const [target, setTarget] = useState("");
  const [targetLabel, setTargetLabel] = useState("");
  const [secret, setSecret] = useState("");
  const [accountId, setAccountId] = useState("");
  const [inboxIdentifier, setInboxIdentifier] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [senderMapText, setSenderMapText] = useState("");

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const bridges = await apiRequest<RoomBridge[]>(
          "GET",
          `/api/workspaces/${encodeURIComponent(token)}/bridges`,
          undefined,
          { signal },
        );
        if (!Array.isArray(bridges)) {
          setView({ kind: "missing" });
          return;
        }
        setView({ kind: "ready", bridges });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (caught instanceof ApiError && caught.status === 404) {
          setView({ kind: "missing" });
          return;
        }
        setView({ kind: "missing" });
      }
    },
    [token],
  );

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  const connectedOf = (kind: BridgeKind): RoomBridge | undefined =>
    view.kind === "ready" ? view.bridges.find((row) => row.kind === kind) : undefined;

  const resetForm = () => {
    setOpenKind(null);
    setTarget("");
    setTargetLabel("");
    setSecret("");
    setAccountId("");
    setInboxIdentifier("");
    setBaseUrl("");
    setSenderMapText("");
    setError(null);
  };

  const disconnect = async (kind: BridgeKind) => {
    setWorking(kind);
    setError(null);
    try {
      const bridges = await apiRequest<RoomBridge[]>("POST", `/api/workspaces/${encodeURIComponent(token)}/bridges`, {
        action: "disconnect",
        kind,
      });
      setView({ kind: "ready", bridges });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.message.trim()
          ? caught.message.trim()
          : "Could not disconnect that bridge.",
      );
    } finally {
      setWorking(null);
    }
  };

  const connect = async (kind: BridgeKind) => {
    setWorking(kind);
    setError(null);
    try {
      const senderMap = senderMapText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [sender, memberKey] = line.split(/\s+/);
          return sender && memberKey ? { sender, memberKey } : null;
        })
        .filter((row): row is { sender: string; memberKey: string } => row !== null);
      const body: Record<string, unknown> = { action: "connect", kind };
      if (target.trim()) body.target = target.trim();
      if (targetLabel.trim()) body.targetLabel = targetLabel.trim();
      if (secret.trim()) body.secret = secret.trim();
      if (accountId.trim()) body.accountId = accountId.trim();
      if (inboxIdentifier.trim()) body.inboxIdentifier = inboxIdentifier.trim();
      if (baseUrl.trim()) body.baseUrl = baseUrl.trim();
      if (senderMap.length > 0) body.senderMap = senderMap;
      const bridges = await apiRequest<RoomBridge[]>("POST", `/api/workspaces/${encodeURIComponent(token)}/bridges`, body);
      setView({ kind: "ready", bridges });
      resetForm();
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.message.trim()
          ? caught.message.trim()
          : "Could not connect that bridge.",
      );
    } finally {
      setWorking(null);
    }
  };

  const hasBridge = view.kind === "ready" && view.bridges.length > 0;
  if (!canManage && (view.kind === "loading" || !hasBridge)) {
    return null;
  }

  return (
    <div className={cn("border-b border-border px-4 py-4", className)} data-testid="panel-bridges">
      <h2 className={LABEL}>Bridges</h2>
      <p className={cn(READ, "mt-1.5 text-foreground")}>{GROUP_WARNING}</p>
      <p className={cn(CHROME, "mt-2 text-muted-foreground")}>{TOKEN_WARNING}</p>
      <p className={cn(CHROME, "mt-2 text-muted-foreground")}>{SLACK_CLICKUP}</p>
      <p className={cn(CHROME, "mt-2 text-muted-foreground")}>{ATTRIBUTION}</p>
      <p className={cn(CHROME, "mt-2 text-muted-foreground")}>{FAILURE}</p>
      <p className={cn(META, "mt-2 text-muted-foreground")}>{MEMORY}</p>

      {view.kind === "loading" ? (
        <p className={cn(META, "mt-3 text-muted-foreground")} data-testid="text-bridges-loading">
          Reading the bridges.
        </p>
      ) : null}

      {view.kind === "missing" ? (
        <p className={cn(CHROME, "mt-3 text-muted-foreground")} data-testid="text-bridges-missing">
          The bridges for this room could not be read. That is not the same as holding none.
        </p>
      ) : null}

      {error ? (
        <p className={cn(CHROME, "mt-3 border-l border-destructive pl-3 text-destructive")} data-testid="text-bridges-error">
          {error}
        </p>
      ) : null}

      {view.kind === "ready" ? (
        <ul className="mt-3" data-testid="list-bridges">
          {KINDS.map((row) => {
            const connected = connectedOf(row.kind);
            const open = openKind === row.kind;
            return (
              <li key={row.kind} className="border-t border-border py-3" data-testid={`bridge-${row.kind}`}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn(CHROME, "font-medium")}>{row.name}</span>
                  {connected ? (
                    <span className={cn(META, "text-muted-foreground")}>Connected</span>
                  ) : (
                    <span className={cn(META, "text-muted-foreground")}>Not connected</span>
                  )}
                </div>
                {connected ? (
                  <p className={cn(META, "mt-1 text-muted-foreground")}>{connected.targetLabel}</p>
                ) : null}

                {connected && canManage ? (
                  <button
                    type="button"
                    className={cn(ACTION_QUIET, "mt-2")}
                    disabled={working === row.kind}
                    onClick={() => void disconnect(row.kind)}
                    data-testid={`button-disconnect-${row.kind}`}
                  >
                    Disconnect
                  </button>
                ) : null}

                {!connected && canManage && open ? (
                  <form
                    className="mt-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void connect(row.kind);
                    }}
                  >
                    {row.kind === "chatwoot" ? (
                      <>
                        <p className={cn(CHROME, "text-muted-foreground")}>{CHATWOOT_INBOX}</p>
                        <p className={cn(META, "mt-2 text-muted-foreground")}>{MEMORY}</p>
                        <label className="mt-2 block">
                          <span className={cn(META, "text-muted-foreground")}>ChatWoot URL, if it is not already set on this deployment</span>
                          <input
                            value={baseUrl}
                            onChange={(event) => setBaseUrl(event.target.value)}
                            className={cn(
                              CHROME,
                              FOCUS,
                              "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                            )}
                            autoComplete="off"
                            data-testid="input-bridge-base-chatwoot"
                          />
                        </label>
                        <label className="mt-2 block">
                          <span className={cn(META, "text-muted-foreground")}>Account id</span>
                          <input
                            value={accountId}
                            onChange={(event) => setAccountId(event.target.value)}
                            className={cn(
                              CHROME,
                              FOCUS,
                              "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                            )}
                            autoComplete="off"
                            data-testid="input-bridge-account-chatwoot"
                          />
                        </label>
                        <label className="mt-2 block">
                          <span className={cn(META, "text-muted-foreground")}>{row.targetHint}</span>
                          <input
                            value={inboxIdentifier}
                            onChange={(event) => setInboxIdentifier(event.target.value)}
                            className={cn(
                              CHROME,
                              FOCUS,
                              "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                            )}
                            autoComplete="off"
                            data-testid="input-bridge-inbox-chatwoot"
                          />
                        </label>
                        <label className="mt-2 block">
                          <span className={cn(META, "text-muted-foreground")}>A name for this connection, as you would say it</span>
                          <input
                            value={targetLabel}
                            onChange={(event) => setTargetLabel(event.target.value)}
                            className={cn(
                              CHROME,
                              FOCUS,
                              "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                            )}
                            autoComplete="off"
                          />
                        </label>
                        <details className="mt-3">
                          <summary className={cn(META, FOCUS, "cursor-pointer text-muted-foreground")}>
                            Speak as an agent into a conversation that already exists
                          </summary>
                          <label className="mt-2 block">
                            <span className={cn(META, "text-muted-foreground")}>Conversation id</span>
                            <input
                              value={target}
                              onChange={(event) => setTarget(event.target.value)}
                              className={cn(
                                CHROME,
                                FOCUS,
                                "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                              )}
                              autoComplete="off"
                              data-testid="input-bridge-target-chatwoot"
                            />
                          </label>
                          <label className="mt-2 block">
                            <span className={cn(META, "text-muted-foreground")}>API token</span>
                            <input
                              type="password"
                              value={secret}
                              onChange={(event) => setSecret(event.target.value)}
                              className={cn(
                                CHROME,
                                FOCUS,
                                "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                              )}
                              autoComplete="off"
                            />
                          </label>
                        </details>
                      </>
                    ) : (
                      <>
                        <label className="mt-2 block">
                          <span className={cn(META, "text-muted-foreground")}>{row.targetHint}</span>
                          <input
                            value={target}
                            onChange={(event) => setTarget(event.target.value)}
                            className={cn(
                              CHROME,
                              FOCUS,
                              "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                            )}
                            autoComplete="off"
                            data-testid={`input-bridge-target-${row.kind}`}
                          />
                        </label>
                        <label className="mt-2 block">
                          <span className={cn(META, "text-muted-foreground")}>
                            {row.kind === "slack"
                              ? "Incoming-webhook URL for that one channel"
                              : row.kind === "whatsapp"
                                ? "A name for this chat, as you would say it"
                                : "API token"}
                          </span>
                          {row.kind === "whatsapp" ? (
                            <input
                              value={targetLabel}
                              onChange={(event) => setTargetLabel(event.target.value)}
                              className={cn(
                                CHROME,
                                FOCUS,
                                "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                              )}
                              autoComplete="off"
                            />
                          ) : (
                            <input
                              type={row.kind === "slack" ? "url" : "password"}
                              value={secret}
                              onChange={(event) => setSecret(event.target.value)}
                              className={cn(
                                CHROME,
                                FOCUS,
                                "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                              )}
                              autoComplete="off"
                            />
                          )}
                        </label>
                        {row.kind === "clickup" ? (
                          <label className="mt-2 block">
                            <span className={cn(META, "text-muted-foreground")}>A name for this connection, as you would say it</span>
                            <input
                              value={targetLabel}
                              onChange={(event) => setTargetLabel(event.target.value)}
                              className={cn(
                                CHROME,
                                FOCUS,
                                "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                              )}
                              autoComplete="off"
                            />
                          </label>
                        ) : null}
                        {row.kind === "slack" ? (
                          <label className="mt-2 block">
                            <span className={cn(META, "text-muted-foreground")}>Channel name, as you would say it</span>
                            <input
                              value={targetLabel}
                              onChange={(event) => setTargetLabel(event.target.value)}
                              className={cn(
                                CHROME,
                                FOCUS,
                                "mt-1 w-full border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                              )}
                              autoComplete="off"
                            />
                          </label>
                        ) : null}
                      </>
                    )}
                    <label className="mt-2 block">
                      <span className={cn(META, "text-muted-foreground")}>
                        Known senders, if any. One per line: a phone number or user id, a space, then the member key
                        from this room. A name is not enough. Anyone not listed arrives unattributed.
                      </span>
                      <textarea
                        value={senderMapText}
                        onChange={(event) => setSenderMapText(event.target.value)}
                        rows={3}
                        className={cn(
                          CHROME,
                          FOCUS,
                          "mt-1 w-full resize-y border-b border-border bg-transparent pb-1 text-foreground outline-none placeholder:text-muted-foreground",
                        )}
                        autoComplete="off"
                        data-testid={`input-bridge-senders-${row.kind}`}
                      />
                    </label>
                    <div className="mt-3 flex items-baseline gap-4">
                      <button type="submit" className={ACTION} disabled={working === row.kind}>
                        Connect
                      </button>
                      <button type="button" className={ACTION_QUIET} onClick={resetForm}>
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}

                {!connected && canManage && !open ? (
                  <button
                    type="button"
                    className={cn(ACTION_QUIET, "mt-2")}
                    onClick={() => {
                      resetForm();
                      setOpenKind(row.kind);
                    }}
                    data-testid={`button-connect-${row.kind}`}
                  >
                    Connect
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default BridgePanel;
