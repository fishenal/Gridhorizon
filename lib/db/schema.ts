import {
  pgTable,
  text,
  integer,
  timestamp,
  serial,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  x: integer("x").notNull().default(2500),
  y: integer("y").notNull().default(2500),
  gold: integer("gold").notNull().default(200),
  xp: integer("xp").notNull().default(0),
  stone: integer("stone").notNull().default(0),
  wood: integer("wood").notNull().default(0),
  ore: integer("ore").notNull().default(0),
  food: integer("food").notNull().default(20),
  status: text("status").notNull().default("idle"), // idle | traveling
  economySettledAt: timestamp("economy_settled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const exploredChunks = pgTable(
  "explored_chunks",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    chunkX: integer("chunk_x").notNull(),
    chunkY: integer("chunk_y").notNull(),
    /** 32x32 = 1024 bits packed as base64 */
    bitmap: text("bitmap").notNull(),
  },
  (t) => [
    uniqueIndex("explored_chunk_unique").on(t.playerId, t.chunkX, t.chunkY),
  ],
);

export const tileClaims = pgTable(
  "tile_claims",
  {
    id: serial("id").primaryKey(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    askingPrice: integer("asking_price"),
    claimedAt: timestamp("claimed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("tile_claim_xy").on(t.x, t.y)],
);

export const buildings = pgTable(
  "buildings",
  {
    id: serial("id").primaryKey(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    ownerId: integer("owner_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // mine | farm | fishery | town | waypoint
    level: integer("level").notNull().default(1),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("building_xy").on(t.x, t.y),
    index("building_owner_idx").on(t.ownerId),
    index("building_type_idx").on(t.type),
  ],
);

export const travelJobs = pgTable("travel_jobs", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" })
    .unique(),
  pathJson: text("path_json").notNull(), // JSON number[][] of [x,y] remaining including current
  pathIndex: integer("path_index").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSettledAt: timestamp("last_settled_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const friendships = pgTable(
  "friendships",
  {
    id: serial("id").primaryKey(),
    playerAId: integer("player_a_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    playerBId: integer("player_b_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("friendship_pair").on(t.playerAId, t.playerBId),
  ],
);

export const tradeOffers = pgTable("trade_offers", {
  id: serial("id").primaryKey(),
  fromPlayerId: integer("from_player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  toPlayerId: integer("to_player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // sell | buy
  resource: text("resource").notNull(), // stone | wood | ore | food | gold
  amount: integer("amount").notNull(),
  priceGold: integer("price_gold").notNull(),
  status: text("status").notNull().default("open"), // open | accepted | rejected | cancelled
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const landOffers = pgTable("land_offers", {
  id: serial("id").primaryKey(),
  fromPlayerId: integer("from_player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  toPlayerId: integer("to_player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  x: integer("x").notNull(),
  y: integer("y").notNull(),
  priceGold: integer("price_gold").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const waypointPasses = pgTable(
  "waypoint_passes",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    buildingId: integer("building_id")
      .notNull()
      .references(() => buildings.id, { onDelete: "cascade" }),
    paidAt: timestamp("paid_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("waypoint_pass_unique").on(t.playerId, t.buildingId),
  ],
);

export type Player = typeof players.$inferSelect;
export type Building = typeof buildings.$inferSelect;
