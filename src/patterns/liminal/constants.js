// World scale and layout constants for Liminal Space (units are meters).

export const CELL = 3            // grid cell size; walls sit on cell edges
export const CHUNK = 8           // cells per chunk side
export const CHUNK_SIZE = CELL * CHUNK
export const VIEW_CHUNKS = 1     // chunks kept loaded in each direction around the player
export const WINDOW = (VIEW_CHUNKS * 2 + 1) * CHUNK   // light-map window, in cells

export const WALL_H = 2.7
export const WALL_T = 0.16
export const DOOR_W = 1.1
export const DOOR_H = 2.1
export const PILLAR = 0.55
export const SINK = 1.0          // depth of sunken rooms / atrium pits
export const STEPS = 6           // steps per stair run (one cell long)
export const ATRIUM_H = WALL_H * 3
export const LOW_H = 2.15        // crawlspace ceiling
export const LOW_WALL = 1.2      // half-height partitions
export const POOL_D = 0.3        // poolroom water depth (wadeable)
export const WATER_Y = -0.08

// Mall wings: a ground-floor concourse under a skylight, with walkable
// galleries one story up reached by escalators.
export const MALL_H1 = 3.6       // gallery floor
export const MALL_ROOF = 7.0     // gallery ceiling
export const SKY_Y = 8.4         // concourse skylight

export const EYE = 1.6
export const PLAYER_R = 0.3
export const STEP_UP = 0.35      // highest ledge you can step onto
export const WALK_SPEED = 2.6
export const RUN_SPEED = 5.0
export const ESC_SPEED = 0.8     // moving escalators

export const SEED = 0x5eed1e55
