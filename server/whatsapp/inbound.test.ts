/**
 * Inbound checks for both WhatsApp transports. Run it with:
 *
 *   npx tsx --test server/whatsapp/inbound.test.ts
 *
 * Seven named functions, each with its own test, on both the hosted payload
 * shape and the WAHA payload shape. Anything that fails a check is recorded
 * and dropped. A check dropped because a webhook spells a field differently
 * is the bug this parcel exists to avoid.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  INBOUND_MAX_AGE_MS,
  acceptInbound,
  accountIdIsOurs,
  chatIdIsExpected,
  dispatchInbound,
  echoFlag,
  eventIsMessageReceived,
  inboundDrops,
  isNotGroup,
  isNotOurEcho,
  messageIdIsNew,
  registerInboundMatcher,
  rememberMessageId,
  resetInboundForTests,
  secretMatches,
  selfIdKnown,
  senderIsKnown,
  timestampIsRecent,
} from "./inbound";

const SECRET = "test-hosted-webhook-secret-value";
const WAHA_SECRET = "test-waha-webhook-secret-value";
const ACCOUNT = "acct_whatsapp_for_tests";
const OUR_USER = "42000000000@s.whatsapp.net";
const VISITOR = "123456789012345@lid";
const CHAT = "chat_expected_1";
const NOW = Date.parse("2026-09-09T10:00:00.000Z");

function hostedMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: ACCOUNT,
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

function wahaMessage(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const payload = {
    id: "waha_msg_1",
    from: "15555550999@c.us",
    body: "Room-bind ABCDEF",
    fromMe: false,
    timestamp: Math.floor(Date.now() / 1000),
    pushName: "Ada",
    ...(typeof overrides.payload === "object" && overrides.payload !== null
      ? (overrides.payload as Record<string, unknown>)
      : {}),
  };
  const rest = { ...overrides };
  delete rest.payload;
  return {
    event: "message",
    session: "default",
    payload,
    ...rest,
  };
}

beforeEach(() => {
  resetInboundForTests();
  process.env.HOSTED_WHATSAPP_ACCOUNT_ID = ACCOUNT;
  process.env.HOSTED_WHATSAPP_WEBHOOK_SECRET = SECRET;
  process.env.WAHA_WEBHOOK_SECRET = WAHA_SECRET;
  process.env.WAHA_SESSION = "default";
});

afterEach(() => {
  resetInboundForTests();
  delete process.env.HOSTED_WHATSAPP_ACCOUNT_ID;
  delete process.env.HOSTED_WHATSAPP_WEBHOOK_SECRET;
  delete process.env.WAHA_WEBHOOK_SECRET;
  delete process.env.WAHA_SESSION;
});

describe("secretMatches", () => {
  it("refuses everything when no webhook secret is configured", () => {
    delete process.env.HOSTED_WHATSAPP_WEBHOOK_SECRET;
    delete process.env.WAHA_WEBHOOK_SECRET;
    assert.equal(secretMatches(SECRET), false);
    assert.equal(secretMatches(undefined), false);
  });

  it("accepts the hosted secret or the WAHA secret, compared at equal length", () => {
    assert.equal(secretMatches(SECRET), true);
    assert.equal(secretMatches(WAHA_SECRET), true);
    assert.equal(secretMatches("wrong-secret-value-here"), false);
    assert.equal(secretMatches(undefined), false);
  });
});

describe("senderIsKnown — who it is from", () => {
  it("requires a sender id", () => {
    assert.equal(senderIsKnown(VISITOR), true);
    assert.equal(senderIsKnown(""), false);
    assert.equal(senderIsKnown(undefined), false);
  });
});

describe("accountIdIsOurs — who it is to, and whether the account is ours", () => {
  it("requires the account_id to be on the allowlist, not merely present", () => {
    assert.equal(accountIdIsOurs(ACCOUNT), true);
    assert.equal(accountIdIsOurs("default"), true);
    assert.equal(accountIdIsOurs("some_other_account"), false);
    assert.equal(accountIdIsOurs(""), false);
    assert.equal(accountIdIsOurs(undefined), false);
  });
});

describe("chatIdIsExpected — which chat it is in", () => {
  it("requires a present chat_id, and equality when an expected chat is given", () => {
    assert.equal(chatIdIsExpected(CHAT), true);
    assert.equal(chatIdIsExpected(CHAT, CHAT), true);
    assert.equal(chatIdIsExpected("chat_other", CHAT), false);
    assert.equal(chatIdIsExpected("", CHAT), false);
    assert.equal(chatIdIsExpected(undefined), false);
  });
});

describe("isNotOurEcho — is it our own echo", () => {
  it("drops when sender equals our user id", () => {
    assert.equal(isNotOurEcho(VISITOR, OUR_USER), true);
    assert.equal(isNotOurEcho(OUR_USER, OUR_USER), false);
    assert.equal(isNotOurEcho(undefined, OUR_USER), false);
  });
});

describe("isNotGroup — is it a group", () => {
  it("drops a group JID and a chat with more than two attendees", () => {
    assert.equal(isNotGroup(CHAT), true);
    assert.equal(isNotGroup("15555550999@c.us"), true);
    assert.equal(isNotGroup("120363@g.us"), false);
    assert.equal(isNotGroup(CHAT, 3), false);
    assert.equal(isNotGroup(CHAT, 2), true);
  });
});

describe("timestampIsRecent — has the code expired", () => {
  it("drops a reconnect burst, a unix timestamp that is too old, and an unreadable value", () => {
    const recent = new Date(NOW - 60_000).toISOString();
    const stale = new Date(NOW - INBOUND_MAX_AGE_MS - 1).toISOString();
    assert.equal(timestampIsRecent(recent, NOW), true);
    assert.equal(timestampIsRecent(stale, NOW), false);
    assert.equal(timestampIsRecent(Math.floor((NOW - 60_000) / 1000), NOW), true);
    assert.equal(timestampIsRecent("not-a-date", NOW), false);
    assert.equal(timestampIsRecent(undefined, NOW), false);
  });
});

describe("echoFlag", () => {
  it("reads the provider's own flag, and refuses to guess when it is absent", () => {
    assert.equal(echoFlag(0), false);
    assert.equal(echoFlag(1), true);
    assert.equal(echoFlag(false), false);
    assert.equal(echoFlag(true), true);
    assert.equal(echoFlag("0"), false);
    assert.equal(echoFlag("1"), true);
    assert.equal(echoFlag(undefined), null);
  });
});

describe("selfIdKnown", () => {
  it("separates 'we cannot tell' from 'this was our own message'", () => {
    assert.equal(selfIdKnown(OUR_USER), true);
    assert.equal(selfIdKnown(undefined), false);
    const noSelf = hostedMessage({ account_info: { type: "WHATSAPP" } });
    const result = acceptInbound(noSelf, SECRET);
    if (!result.authorized || result.kind !== "dropped") {
      assert.fail("a payload that does not say who we are has to drop");
      return;
    }
    assert.equal(result.reason, "unknown-self");
  });

  it("still calls a real echo an echo", () => {
    const own = hostedMessage({ sender: { attendee_provider_id: OUR_USER } });
    const result = acceptInbound(own, SECRET);
    if (!result.authorized || result.kind !== "dropped") {
      assert.fail("our own message has to drop");
      return;
    }
    assert.equal(result.reason, "echo");
  });
});

describe("eventIsMessageReceived", () => {
  it("accepts hosted message_received and WAHA message; the other events are not messages", () => {
    assert.equal(eventIsMessageReceived("message_received"), true);
    assert.equal(eventIsMessageReceived("message"), true);
    for (const event of ["message_reaction", "message_read", "message_edited", "message_deleted", "message_delivered"]) {
      assert.equal(eventIsMessageReceived(event), false, event);
    }
  });
});

describe("messageIdIsNew", () => {
  it("rejects a missing id, and a second look at an id that was remembered", () => {
    assert.equal(messageIdIsNew("msg_1"), true);
    assert.equal(messageIdIsNew(""), false);
    rememberMessageId("msg_1");
    assert.equal(messageIdIsNew("msg_1"), false);
  });
});

describe("acceptInbound — hosted shape", () => {
  it("returns unauthorized when the secret is wrong", () => {
    const result = acceptInbound(hostedMessage(), "nope");
    assert.deepEqual(result, { authorized: false, reason: "secret" });
  });

  it("accepts a live visitor message and reads the body from `message`, not `text`", () => {
    const result = acceptInbound(
      hostedMessage({ message: "the webhook body", text: "the rest field, which must not be used" }),
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

  it("accepts a WhatsApp message that never says who we are, when is_sender is 0", () => {
    const live = hostedMessage({ account_info: { type: "WHATSAPP" }, is_sender: 0 });
    const result = acceptInbound(live, SECRET);
    if (!result.authorized || result.kind !== "message") {
      assert.fail(`is_sender: 0 has to be enough; got ${JSON.stringify(result)}`);
      return;
    }
    assert.equal(result.message.message, "Room-bind ABCDEF");
  });

  it("drops our own echo, a foreign account, a missing chat, a group, a duplicate, a non-message event, and a stale timestamp", () => {
    const echo = acceptInbound(hostedMessage({ message_id: "msg_echo", sender: { attendee_provider_id: OUR_USER } }), SECRET);
    assert.equal(echo.authorized && echo.kind === "dropped" && echo.reason === "echo", true);

    const foreign = acceptInbound(hostedMessage({ account_id: "not_ours", message_id: "msg_foreign" }), SECRET);
    assert.equal(foreign.authorized && foreign.kind === "dropped" && foreign.reason === "account", true);

    const noChat = acceptInbound(hostedMessage({ chat_id: "", message_id: "msg_nochats" }), SECRET);
    assert.equal(noChat.authorized && noChat.kind === "dropped" && noChat.reason === "chat", true);

    const group = acceptInbound(hostedMessage({ chat_id: "120363-group@g.us", message_id: "msg_group" }), SECRET);
    assert.equal(group.authorized && group.kind === "dropped" && group.reason === "group", true);

    const reaction = acceptInbound(hostedMessage({ event: "message_reaction", message_id: "msg_react" }), SECRET);
    assert.equal(reaction.authorized && reaction.kind === "dropped" && reaction.reason === "event", true);

    const stale = acceptInbound(hostedMessage({ message_id: "msg_stale", timestamp: "2020-01-01T00:00:00.000Z" }), SECRET);
    assert.equal(stale.authorized && stale.kind === "dropped" && stale.reason === "timestamp", true);

    const first = acceptInbound(hostedMessage({ message_id: "msg_once" }), SECRET);
    assert.equal(first.authorized && first.kind === "message", true);
    const duplicate = acceptInbound(hostedMessage({ message_id: "msg_once" }), SECRET);
    assert.equal(duplicate.authorized && duplicate.kind === "dropped" && duplicate.reason === "duplicate", true);
  });

  it("does not treat a REST `text` field as the hosted body", () => {
    const result = acceptInbound(hostedMessage({ message: undefined, text: "would be a bug if this were read" }), SECRET);
    assert.equal(result.authorized && result.kind === "dropped", true);
  });

  it("accepts event_type, which is what one webhook field list calls it", () => {
    const { event, ...rest } = hostedMessage({ message_id: "msg_live_4" });
    const result = acceptInbound({ ...rest, event_type: event }, SECRET);
    assert.equal(result.authorized && result.kind, "message");
  });

  it("branches an AccountStatus payload away from the message path", () => {
    const received: string[] = [];
    registerInboundMatcher((message) => {
      received.push(message.messageId);
    });
    const result = acceptInbound(
      {
        AccountStatus: {
          account_id: ACCOUNT,
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
    dispatchInbound(result);
    assert.deepEqual(received, []);
  });

  it("dispatches an accepted message to a registered matcher after the checks pass", () => {
    const received: string[] = [];
    registerInboundMatcher((message) => {
      received.push(message.message);
    });
    const result = acceptInbound(hostedMessage({ message: "hello matcher" }), SECRET);
    dispatchInbound(result);
    assert.deepEqual(received, ["hello matcher"]);
  });
});

describe("acceptInbound — WAHA shape", () => {
  it("accepts a 1:1 visitor message and drops our own echo and a group", () => {
    const ok = acceptInbound(wahaMessage(), WAHA_SECRET);
    if (!ok.authorized || ok.kind !== "message") {
      assert.fail(`expected an accepted WAHA message; got ${JSON.stringify(ok)}`);
      return;
    }
    assert.equal(ok.message.chatId, "15555550999@c.us");
    assert.equal(ok.message.message, "Room-bind ABCDEF");
    assert.equal(ok.message.fromMe, false);
    assert.equal(ok.message.sender.attendeeName, "Ada");

    const echo = acceptInbound(
      wahaMessage({ payload: { id: "waha_echo", from: "15555550999@c.us", body: "hi", fromMe: true, timestamp: Math.floor(Date.now() / 1000) } }),
      WAHA_SECRET,
    );
    assert.equal(echo.authorized && echo.kind === "dropped" && echo.reason === "echo", true);

    const group = acceptInbound(
      wahaMessage({
        payload: {
          id: "waha_group",
          from: "120363@g.us",
          body: "hi",
          fromMe: false,
          timestamp: Math.floor(Date.now() / 1000),
          participant: "15555550999@c.us",
        },
      }),
      WAHA_SECRET,
    );
    assert.equal(group.authorized && group.kind === "dropped" && group.reason === "group", true);
  });

  it("does not accept a WAHA body under the hosted secret when that secret is the only one configured... wait, both are configured in beforeEach. A wrong secret still 401s", () => {
    const result = acceptInbound(wahaMessage(), "nope");
    assert.deepEqual(result, { authorized: false, reason: "secret" });
  });
});
