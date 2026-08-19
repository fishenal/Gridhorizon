export const MAP_SIZE = 8000;
export const MAP_CENTER = Math.floor(MAP_SIZE / 2); // 4000
export const MAP_TILE_COUNT = MAP_SIZE * MAP_SIZE;
export const VISION_RADIUS = 20;
export const CHUNK_SIZE = 32;

export const TRAVEL_SECONDS_PER_TILE = Number(
  process.env.TRAVEL_SECONDS_PER_TILE ?? "1",
);

/** Max steps per directional move (client + server). */
export const MAX_TRAVEL_STEPS = 1000;

export const WORLD_SEED = Number(process.env.WORLD_SEED ?? "424242");

export const WAYPOINT_COST = 100;
/** Alias: flag build cost (same as legacy waypoint). */
export const FLAG_COST = WAYPOINT_COST;
export const WAYPOINT_TOLL = 10;
/** Alias: flag influence toll. */
export const FLAG_TOLL = WAYPOINT_TOLL;
/** Town influence: drinking / reveling spend. */
export const TOWN_TOLL = 100;

/** Gold paid to a worker each full minute on the job. */
export const WORK_GOLD_PER_MINUTE = 1;
/** Materials granted to the workplace owner when someone starts working. */
export const WORK_OWNER_GRANT = 5;

/** Town / mine / farm share this gold cost. */
export const TOWN_COST = 500;
export const MINE_COST = 500;
export const FARM_COST = 500;
export const LUMBER_COST = 500;

/** Instant grant when a quarry / farm / lumber camp is built. */
export const PRODUCER_GRANT = 10;
/** Town recipe: one cycle of each producer. */
export const TOWN_MAT_COST = 10;
export const TOWN_POP_GRANT = 10;

export const INITIAL_GOLD = 200;
export const INITIAL_FOOD = 0;

/** Participation XP — never decreases; independent of gold. */
export const XP_PER_STEP = 1;
/** Awarded when placing a flag, town, or other structure. */
export const XP_BUILD = 10;
/**
 * Toll XP equals gold transferred (payer and receiver both gain).
 * Measures economic participation without draining XP.
 */
export const XP_PER_TOLL_GOLD = 1;

/** Gold per resource type for mine production per cycle minute */
export const MINE_GOLD_RATES = {
  stone: 3,
  wood: 4,
  ore: 5,
} as const;

export const FARM_BASE_FOOD = 2;
export const FISHERY_BASE_FOOD = 2;
export const TOWN_BASE_GOLD = 2;

/** Town adjacency: 1 tile = 2, 2 tiles total = 5 → bonus formula */
export const TOWN_CONSUME_PER_TILE = {
  stone: 1,
  wood: 1,
  ore: 1,
  food: 1,
} as const;

export const ECONOMY_CYCLE_SECONDS = 60;
