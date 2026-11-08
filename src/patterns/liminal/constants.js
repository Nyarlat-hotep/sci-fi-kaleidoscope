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
export const LIGHT_Y = WALL_H - 0.05
export const SINK = 1.0          // depth of sunken rooms / atrium pits
export const STEPS = 6           // steps per stair run (one cell long)
export const ATRIUM_H = WALL_H * 3

export const EYE = 1.6
export const PLAYER_R = 0.3
export const WALK_SPEED = 1.5
export const RUN_SPEED = 3.2

export const SEED = 0x5eed1e55
