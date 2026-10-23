/**
 * The connection table, as the database sees it. Run it with:
 *
 *   npx tsx --test server/bridge/schema.test.ts
 *
 * Drizzle names every column of room_bridges in each insert and in select(),
 * so a column added there that a database does not have yet fails every
 * connect and the load at boot, and a failed load disconnects every room.
 * That is why a room's own inbound secret is a table of its own. These cases
 * hold the line: the connection's SQL does not change, and the secret is not
 * in it.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getTableColumns, getTableName } from "drizzle-orm";
import { QueryBuilder } from "drizzle-orm/pg-core";

import { roomBridgeSecrets, roomBridges } from "@shared/schema-bridges";

/* The columns room_bridges was created with. Adding to this list means the
   load at boot and every connect name a new column: read the warning in
   shared/schema-bridges.ts first. */
const ROOM_BRIDGES_COLUMNS = [
  "workspace_id",
  "kind",
  "token",
  "target",
  "target_label",
  "secret",
  "account_id",
  "inbox_id",
  "inbox_identifier",
  "contact_identifier",
  "base_url",
  "channel_id",
  "sender_map",
  "connected_at",
];

describe("room_bridges", () => {
  it("has the columns every deployed database already has, and no more", () => {
    const columns = Object.values(getTableColumns(roomBridges)).map((column) => column.name);
    assert.deepEqual(columns, ROOM_BRIDGES_COLUMNS);
  });

  it("loads connections with a query that does not name the inbound secret", () => {
    const sql = new QueryBuilder().select().from(roomBridges).toSQL().sql;
    assert.equal(sql.includes("inbound_secret"), false);
  });

  it("keeps a room's own inbound secret in a table of its own", () => {
    assert.equal(getTableName(roomBridgeSecrets), "room_bridge_secrets");
    assert.deepEqual(
      Object.values(getTableColumns(roomBridgeSecrets)).map((column) => column.name),
      ["workspace_id", "kind", "inbound_secret"],
    );
  });
});
