/**
 * Unipile inbound checks. Run it with:
 *
 *   npx tsx --test server/unipile/inbound.test.ts
 *
 * Seven named functions, each with its own test. Anything that fails a check
 * is recorded and dropped. The webhook body field is `message`, not `text`.
 * An account-status payload never reaches the message path.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CALENDAR_ACCOUNT_ID,
  DEFAULT_WHATSAPP_ACCOUNT_ID,
} from "./accounts";
import {
  INBOUND_MAX_AGE_MS,
  acceptUnipileInbound,
  accountIdIsOurs,
  chatIdIsExpected,
  dispatchInbound,
  eventIsMessageReceived,
  inboundDrops,
  echoFlag,
  isNotOurEcho,
  messageIdIsNew,
  registerInboundMatcher,
  rememberMessageId,
  resetInboundForTests,
  secretMatches,
  selfIdKnown,
  timestampIsRecent,
} from "./inbound";

const SECRET = "test-unipile-webhook-secret-value";
const OUR_USER = "42000000000@s.whatsapp.net";
const VISITOR = "123456789012345@lid";
const CHAT = "chat_expected_1";
const NOW = Date.parse("2026-09-09T10:00:00.000Z");

function liveMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: DEFAULT_WHATSAPP_ACCOUNT_ID,
    account_type: "WHATSAPP",
    account_info: { type: "WHATSAPP", user_id: OUR_USER },
    event: "message_received",
    chat_id: CHAT,
    timestamp: new Date().toISOString(),
    message_id: "msg_live_1",
    message: "Room-bind ABCDEF",
    sender: {
      attendee_id: "att_visitor",
      attendee_name: "Ada",
      attendee_provider_id: VISITOR,
    },
    ...overrides,
  };
}

beforeEach(() => {
  resetInboundForTests();
  delete process.env.UNIPILE_WEBHOOK_SECRET;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
  process.env.UNIPILE_WEBHOOK_SECRET = SECRET;
});

afterEach(() => {
  resetInboundForTests();
  delete process.env.UNIPILE_WEBHOOK_SECRET;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
  delete process.env.UNIPILE_CALENDAR_ACCOUNT_ID;
});

describe("secretMatches", () => {
  it("refuses everything when UNIPILE_WEBHOOK_SECRET is unset, unlike identity.ts:468", () => {
    delete process.env.UNIPILE_WEBHOOK_SECRET;
    assert.equal(secretMatches(SECRET), false);
    assert.equal(secretMatches(undefined), false);
    assert.equal(secretMatches(""), false);
  });

  it("accepts only the configured secret, compared at equal length", () => {
    assert.equal(secretMatches(SECRET), true);
    assert.equal(secretMatches("wrong-secret-value-here"), false);
    assert.equal(secretMatches(SECRET.slice(0, -1)), false);
    assert.equal(secretMatches(undefined), false);
  });
});

describe("selfIdKnown", () => {
  it("separates 'we cannot tell' from 'this was our own message'", () => {
    assert.equal(selfIdKnown(OUR_USER), true);
    assert.equal(selfIdKnown(undefined), false);
    assert.equal(selfIdKnown(""), false);

    /* Unipile's documented payload carries account_info.user_id, but the
       example is a LINKEDIN account and the WhatsApp shape is unverified. If
       it is missing there, every message drops — which is safe and, called an
       echo, would send whoever reads the drops hunting a loop that is not
       there. */
    const noSelf = liveMessage({ account_info: { type: "WHATSAPP" } });
    const result = acceptUnipileInbound(noSelf, SECRET);
    if (!result.authorized || result.kind !== "dropped") {
      assert.fail("a payload that does not say who we are has to drop");
      return;
    }
    assert.equal(result.reason, "unknown-self");
    assert.equal(inboundDrops().at(-1)?.reason, "unknown-self");
  });

  it("still calls a real echo an echo", () => {
    const own = liveMessage({ sender: { attendee_provider_id: OUR_USER } });
    const result = acceptUnipileInbound(own, SECRET);
    if (!result.authorized || result.kind !== "dropped") {
      assert.fail("our own message has to drop");
      return;
    }
    assert.equal(result.reason, "echo");
  });
});

describe("accountIdIsOurs", () => {
  it("requires the account_id to be on the allowlist, not merely present", () => {
    assert.equal(accountIdIsOurs(DEFAULT_WHATSAPP_ACCOUNT_ID), true);
    assert.equal(accountIdIsOurs(DEFAULT_CALENDAR_ACCOUNT_ID), true);
    assert.equal(accountIdIsOurs("some_other_account"), false);
    assert.equal(accountIdIsOurs(""), false);
    assert.equal(accountIdIsOurs(undefined), false);
    process.env.UNIPILE_WHATSAPP_ACCOUNT_ID = "wa_custom";
    assert.equal(accountIdIsOurs("wa_custom"), true);
    assert.equal(accountIdIsOurs(DEFAULT_WHATSAPP_ACCOUNT_ID), false);
  });
});

describe("echoFlag", () => {
  it("reads the provider's own flag, and refuses to guess when it is absent", () => {
    /* WhatsApp sends 0 and 1. The strings are defensive: a webhook that
       stringifies its numbers would otherwise read 0 as "present and ours". */
    assert.equal(echoFlag(0), false);
    assert.equal(echoFlag(1), true);
    assert.equal(echoFlag(false), false);
    assert.equal(echoFlag(true), true);
    assert.equal(echoFlag("0"), false);
    assert.equal(echoFlag("1"), true);
    assert.equal(echoFlag(undefined), null);
    assert.equal(echoFlag(null), null);
    assert.equal(echoFlag("yes"), null);
  });

  it("accepts a WhatsApp message that never says who we are", () => {
    /* The production bug, exactly: real account_info, no user_id in it, and
       is_sender: 0. Before this the message was answered 200 and thrown away,
       so a visitor who had done everything right watched a spinner. */
    const live = liveMessage({ account_info: { type: "WHATSAPP" }, is_sender: 0 });
    const result = acceptUnipileInbound(live, SECRET);
    if (!result.authorized || result.kind !== "message") {
      assert.fail(`is_sender: 0 has to be enough; got ${JSON.stringify(result)}`);
      return;
    }
    assert.equal(result.message.message, "Room-bind ABCDEF");
  });

  it("drops our own message on the flag alone, whatever the sender says", () => {
    const own = liveMessage({ account_info: { type: "WHATSAPP" }, is_sender: 1, message_id: "msg_live_2" });
    const result = acceptUnipileInbound(own, SECRET);
    assert.equal(result.authorized && result.kind === "dropped" && result.reason, "echo");
  });

  it("will not name an author it was not given", () => {
    /* is_sender answers check (3) without ever looking at sender, so the
       sender guard has to stand on its own or the room invents an author. */
    const anonymous = liveMessage({ account_info: { type: "WHATSAPP" }, is_sender: 0, sender: {}, message_id: "msg_live_3" });
    const result = acceptUnipileInbound(anonymous, SECRET);
    assert.equal(result.authorized && result.kind === "dropped" && result.reason, "unknown-sender");
  });
});

describe("event under either name", () => {
  it("accepts event_type, which is what the webhook's field list calls it", () => {
    const { event, ...rest } = liveMessage({ message_id: "msg_live_4" });
    const result = acceptUnipileInbound({ ...rest, event_type: event }, SECRET);
    assert.equal(result.authorized && result.kind, "message");
  });
});

describe("isNotOurEcho", () => {
  it("drops when sender.attendee_provider_id equals account_info.user_id", () => {
    assert.equal(isNotOurEcho(VISITOR, OUR_USER), true);
    assert.equal(isNotOurEcho(OUR_USER, OUR_USER), false);
    assert.equal(isNotOurEcho(undefined, OUR_USER), false);
    assert.equal(isNotOurEcho(VISITOR, undefined), false);
  });
});

describe("chatIdIsExpected", () => {
  it("requires a present chat_id, and equality when an expected chat is given", () => {
    assert.equal(chatIdIsExpected(CHAT), true);
    assert.equal(chatIdIsExpected(CHAT, CHAT), true);
    assert.equal(chatIdIsExpected("chat_other", CHAT), false);
    assert.equal(chatIdIsExpected("", CHAT), false);
    assert.equal(chatIdIsExpected(undefined, CHAT), false);
    assert.equal(chatIdIsExpected(undefined), false);
  });
});

describe("messageIdIsNew", () => {
  it("rejects a missing id, and a second look at an id that was remembered", () => {
    assert.equal(messageIdIsNew("msg_1"), true);
    assert.equal(messageIdIsNew(""), false);
    assert.equal(messageIdIsNew(undefined), false);
    rememberMessageId("msg_1");
    assert.equal(messageIdIsNew("msg_1"), false);
    assert.equal(messageIdIsNew("msg_2"), true);
  });
});

describe("eventIsMessageReceived", () => {
  it("accepts only message_received; the other five events are not messages", () => {
    assert.equal(eventIsMessageReceived("message_received"), true);
    for (const event of [
      "message_reaction",
      "message_read",
      "message_edited",
      "message_deleted",
      "message_delivered",
    ]) {
      assert.equal(eventIsMessageReceived(event), false, event);
    }
    assert.equal(eventIsMessageReceived(undefined), false);
  });
});

describe("timestampIsRecent", () => {
  it("drops a reconnect burst and an unreadable timestamp", () => {
    const recent = new Date(NOW - 60_000).toISOString();
    const stale = new Date(NOW - INBOUND_MAX_AGE_MS - 1).toISOString();
    assert.equal(timestampIsRecent(recent, NOW), true);
    assert.equal(timestampIsRecent(stale, NOW), false);
    assert.equal(timestampIsRecent("not-a-date", NOW), false);
    assert.equal(timestampIsRecent(undefined, NOW), false);
  });
});

describe("acceptUnipileInbound", () => {
  it("returns 401-shaped unauthorized when the secret is wrong, and records the drop", () => {
    const result = acceptUnipileInbound(liveMessage(), "nope");
    assert.deepEqual(result, { authorized: false, reason: "secret" });
    assert.equal(inboundDrops().some((drop) => drop.reason === "secret"), true);
  });

  it("accepts a live visitor message and reads the body from `message`, not `text`", () => {
    const result = acceptUnipileInbound(
      liveMessage({ message: "the webhook body", text: "the rest field, which must not be used" }),
      SECRET,
    );
    assert.equal(result.authorized, true);
    if (result.authorized && result.kind === "message") {
      assert.equal(result.message.message, "the webhook body");
      assert.equal(result.message.chatId, CHAT);
      assert.equal(result.message.sender.attendeeProviderId.form, "lid");
      assert.equal("phone" in result.message.sender.attendeeProviderId, false);
    } else {
      assert.fail("expected an accepted message");
    }
  });

  it("drops our own echo, a foreign account, a missing chat, a duplicate, a non-message event, and a stale timestamp, and never guesses", () => {
    const echo = acceptUnipileInbound(
      liveMessage({
        message_id: "msg_echo",
        sender: { attendee_provider_id: OUR_USER },
      }),
      SECRET,
    );
    assert.equal(echo.authorized && echo.kind === "dropped" && echo.reason === "echo", true);

    const foreign = acceptUnipileInbound(liveMessage({ account_id: "not_ours", message_id: "msg_foreign" }), SECRET);
    assert.equal(foreign.authorized && foreign.kind === "dropped" && foreign.reason === "account", true);

    const noChat = acceptUnipileInbound(liveMessage({ chat_id: "", message_id: "msg_nochats" }), SECRET);
    assert.equal(noChat.authorized && noChat.kind === "dropped" && noChat.reason === "chat", true);

    const reaction = acceptUnipileInbound(liveMessage({ event: "message_reaction", message_id: "msg_react" }), SECRET);
    assert.equal(reaction.authorized && reaction.kind === "dropped" && reaction.reason === "event", true);

    const stale = acceptUnipileInbound(
      liveMessage({
        message_id: "msg_stale",
        timestamp: "2020-01-01T00:00:00.000Z",
      }),
      SECRET,
    );
    assert.equal(stale.authorized && stale.kind === "dropped" && stale.reason === "timestamp", true);

    const first = acceptUnipileInbound(liveMessage({ message_id: "msg_once" }), SECRET);
    assert.equal(first.authorized && first.kind === "message", true);
    const duplicate = acceptUnipileInbound(liveMessage({ message_id: "msg_once" }), SECRET);
    assert.equal(duplicate.authorized && duplicate.kind === "dropped" && duplicate.reason === "duplicate", true);

    const reasons = inboundDrops().map((drop) => drop.reason);
    assert.equal(reasons.includes("echo"), true);
    assert.equal(reasons.includes("account"), true);
    assert.equal(reasons.includes("chat"), true);
    assert.equal(reasons.includes("event"), true);
    assert.equal(reasons.includes("timestamp"), true);
    assert.equal(reasons.includes("duplicate"), true);
  });

  it("does not treat a REST `text` field as the body", () => {
    const result = acceptUnipileInbound(
      liveMessage({ message: undefined, text: "would be a bug if this were read" }),
      SECRET,
    );
    assert.equal(result.authorized && result.kind === "dropped", true);
  });

  it("branches an AccountStatus payload away from the message path", () => {
    const received: string[] = [];
    registerInboundMatcher((message) => {
      received.push(message.messageId);
    });
    const result = acceptUnipileInbound(
      {
        AccountStatus: {
          account_id: DEFAULT_WHATSAPP_ACCOUNT_ID,
          account_type: "WHATSAPP",
          message: "CREDENTIALS",
        },
      },
      SECRET,
    );
    assert.equal(result.authorized, true);
    if (!result.authorized || result.kind !== "account_status") {
      assert.fail("expected account_status");
      return;
    }
    assert.equal(result.status.status, "CREDENTIALS");
    assert.equal(result.status.accountId, DEFAULT_WHATSAPP_ACCOUNT_ID);
    dispatchInbound(result);
    assert.deepEqual(received, []);
  });

  it("refuses an AccountStatus for an account that is not ours", () => {
    /* The owner's rule is about every inbound payload, not only messages. This
       path was gated on the secret alone, so anything holding the secret could
       report a status for somebody else's account and have it logged as ours. */
    const result = acceptUnipileInbound(
      {
        AccountStatus: {
          account_id: "acct_not_ours",
          account_type: "WHATSAPP",
          message: "CREDENTIALS",
        },
      },
      SECRET,
    );
    if (!result.authorized || result.kind !== "dropped") {
      assert.fail("an AccountStatus for somebody else's account has to drop");
      return;
    }
    assert.equal(result.reason, "account");
    assert.equal(inboundDrops().at(-1)?.reason, "account");
  });

  it("dispatches an accepted message to a registered matcher after the checks pass", () => {
    const received: string[] = [];
    registerInboundMatcher((message) => {
      received.push(message.message);
    });
    const result = acceptUnipileInbound(liveMessage({ message: "hello matcher" }), SECRET);
    dispatchInbound(result);
    assert.deepEqual(received, ["hello matcher"]);
  });
});
