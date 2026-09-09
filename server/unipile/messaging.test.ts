/**
 * Unipile send and contact reads. Run it with:
 *
 *   npx tsx --test server/unipile/messaging.test.ts
 *
 * Both send routes are multipart/form-data, not JSON. attendee_provider_id is
 * a tagged union and is never regexed for digits. Contact reads have no phone
 * field.
 */

import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  getChatAttendee,
  listChatAttendees,
  parseAttendeeProviderId,
  parseChatAttendee,
  sendInChat,
  startOrReuseChat,
} from "./messaging";

const DSN = "unipile.test.example:9443";
const KEY = "test-unipile-key-do-not-log";
const WHATSAPP_ID = "wa_account_for_tests";
const CHAT_ID = "chat_existing_1";
const ATTENDEE_JID = "420774654822@s.whatsapp.net";
const ATTENDEE_LID = "123456789012345@lid";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function setConfigured(): void {
  process.env.UNIPILE_DSN = DSN;
  process.env.UNIPILE_API_KEY = KEY;
  process.env.UNIPILE_WHATSAPP_ACCOUNT_ID = WHATSAPP_ID;
}

beforeEach(() => {
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
});

afterEach(() => {
  delete process.env.UNIPILE_DSN;
  delete process.env.UNIPILE_API_KEY;
  delete process.env.UNIPILE_WHATSAPP_ACCOUNT_ID;
});

describe("parseAttendeeProviderId", () => {
  it("models a WhatsApp JID as s.whatsapp.net and does not expose a phone field", () => {
    const parsed = parseAttendeeProviderId(ATTENDEE_JID);
    assert.deepEqual(parsed, { form: "s.whatsapp.net", value: ATTENDEE_JID });
    assert.equal("phone" in parsed, false);
    assert.equal("phoneNumber" in parsed, false);
  });

  it("models a LID as lid and never pulls digits out of it", () => {
    const parsed = parseAttendeeProviderId(ATTENDEE_LID);
    assert.equal(parsed.form, "lid");
    assert.equal(parsed.value, ATTENDEE_LID);
    assert.equal("phone" in parsed, false);
    assert.equal(JSON.stringify(parsed).includes("123456789012345@lid"), true);
    assert.equal(Object.values(parsed).some((value) => /^\d+$/.test(String(value))), false);
  });

  it("keeps any other provider id as other, whole", () => {
    const linkedIn = "ACoAAAcDMMQBODyLwZrRcgYhrkCafURGqva0U4E";
    assert.deepEqual(parseAttendeeProviderId(linkedIn), { form: "other", value: linkedIn });
  });
});

describe("parseChatAttendee", () => {
  it("keeps id, name, picture_url and provider_id, and drops specifics so no phone leaks through", () => {
    const parsed = parseChatAttendee({
      object: "ChatAttendee",
      id: "att_1",
      account_id: WHATSAPP_ID,
      provider_id: ATTENDEE_LID,
      name: "Ada",
      is_self: 0,
      picture_url: "https://example.test/ada.jpg",
      specifics: { provider: "WHATSAPP", phone: "420774654822" },
    });
    assert.deepEqual(parsed, {
      id: "att_1",
      providerId: { form: "lid", value: ATTENDEE_LID },
      name: "Ada",
      pictureUrl: "https://example.test/ada.jpg",
      isSelf: false,
    });
    assert.equal(JSON.stringify(parsed).includes("420774654822"), false);
    assert.equal(JSON.stringify(parsed).includes("phone"), false);
    assert.equal(JSON.stringify(parsed).includes("specifics"), false);
  });
});

describe("sendInChat", () => {
  it("POSTs multipart/form-data to /chats/{chat_id}/messages with text and account_id, not JSON", async () => {
    setConfigured();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return jsonResponse(201, { object: "MessageSent", message_id: "msg_sent_1" });
    };

    const result = await sendInChat({ chatId: CHAT_ID, text: "hello from the room" }, fetchImpl);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.object, "MessageSent");
      assert.equal(result.body.messageId, "msg_sent_1");
    }
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `https://${DSN}/api/v1/chats/${CHAT_ID}/messages`);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], undefined);
    assert.equal(headers["X-API-KEY"], KEY);
    const body = calls[0].init.body;
    assert.ok(body instanceof FormData);
    assert.equal(body.get("text"), "hello from the room");
    assert.equal(body.get("account_id"), WHATSAPP_ID);
    assert.equal(body.get("attendees_ids"), null);
  });

  it("passes quote_id and typing_duration when given", async () => {
    setConfigured();
    const calls: RequestInit[] = [];
    const fetchImpl: typeof fetch = async (_input, init) => {
      calls.push(init ?? {});
      return jsonResponse(201, { object: "MessageSent", message_id: "msg_quoted" });
    };
    await sendInChat(
      { chatId: CHAT_ID, text: "reply", quoteId: "msg_orig", typingDuration: "800" },
      fetchImpl,
    );
    const body = calls[0]?.body;
    assert.ok(body instanceof FormData);
    assert.equal(body.get("quote_id"), "msg_orig");
    assert.equal(body.get("typing_duration"), "800");
  });
});

describe("startOrReuseChat", () => {
  it("POSTs multipart/form-data to /chats with account_id and repeated attendees_ids", async () => {
    setConfigured();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      return jsonResponse(201, { object: "ChatStarted", chat_id: "chat_upserted", message_id: "msg_new" });
    };

    const result = await startOrReuseChat(
      { attendeesIds: [ATTENDEE_JID, ATTENDEE_LID], text: "Book-code K7QMX2" },
      fetchImpl,
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.object, "ChatStarted");
      assert.equal(result.body.chatId, "chat_upserted");
      assert.equal(result.body.messageId, "msg_new");
    }
    assert.equal(calls[0].url, `https://${DSN}/api/v1/chats`);
    const headers = calls[0].init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], undefined);
    const body = calls[0].init.body;
    assert.ok(body instanceof FormData);
    assert.equal(body.get("account_id"), WHATSAPP_ID);
    assert.equal(body.get("text"), "Book-code K7QMX2");
    assert.deepEqual(body.getAll("attendees_ids"), [ATTENDEE_JID, ATTENDEE_LID]);
  });
});

describe("contact reads", () => {
  it("lists attendees from GET /chats/{chat_id}/attendees without keeping a phone", async () => {
    setConfigured();
    let url = "";
    const fetchImpl: typeof fetch = async (input) => {
      url = String(input);
      return jsonResponse(200, {
        object: "ChatAttendeeList",
        items: [
          {
            id: "att_self",
            provider_id: "42000000000@s.whatsapp.net",
            name: "Us",
            is_self: 1,
            picture_url: "https://example.test/us.jpg",
          },
          {
            id: "att_them",
            provider_id: ATTENDEE_LID,
            name: "Visitor",
            is_self: 0,
            picture_url: null,
            specifics: { phone: "420774654822" },
          },
        ],
      });
    };

    const result = await listChatAttendees(CHAT_ID, fetchImpl);
    assert.equal(url.startsWith(`https://${DSN}/api/v1/chats/${CHAT_ID}/attendees`), true);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body.length, 2);
      assert.equal(result.body[0].isSelf, true);
      assert.equal(result.body[1].providerId.form, "lid");
      assert.equal(JSON.stringify(result.body).includes("phone"), false);
      assert.equal(JSON.stringify(result.body).includes("420774654822"), false);
    }
  });

  it("reads one attendee from GET /chat_attendees/{id}", async () => {
    setConfigured();
    let url = "";
    const fetchImpl: typeof fetch = async (input) => {
      url = String(input);
      return jsonResponse(200, {
        id: "att_them",
        provider_id: ATTENDEE_JID,
        name: "Visitor",
        is_self: 0,
        picture_url: "https://example.test/v.jpg",
      });
    };
    const result = await getChatAttendee("att_them", fetchImpl);
    assert.equal(url.startsWith(`https://${DSN}/api/v1/chat_attendees/att_them`), true);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.body?.id, "att_them");
      assert.equal(result.body?.providerId.form, "s.whatsapp.net");
      assert.equal(result.body && "phone" in result.body, false);
    }
  });
});
