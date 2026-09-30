// Gameplay tuning. Units: metres, seconds, m/s. Everything balance-related lives here.
export const CONFIG = {
  // --- Train movement ---
  MAX_TRAIN_SPEED: 18,        // theoretical top speed; drag keeps real cruise ~16 m/s (~58 km/h)
  TRAIN_ACCELERATION: 1.3,    // m/s² at full throttle from standstill
  TRAIN_BRAKING: 2.4,         // m/s² brake deceleration (≈50 m stopping distance from cruise)
  ROLLING_FRICTION: 0.1,      // m/s² constant coasting loss
  DRAG: 0.0009,               // quadratic drag (× speed²)
  REVERSE_SPEED: 5,           // max reverse speed
  REVERSE_ACCELERATION: 0.7,
  REVERSE_ENGAGE_TIME: 0.35,  // seconds S must be held at standstill before reversing
  THROTTLE_RESPONSE: 1.4,     // throttle lever travel per second
  CAR_MASS_PENALTY: 0.12,     // acceleration loss per car beyond the first
  CAR_FUEL_PENALTY: 0.08,     // fuel use increase per car beyond the first

  // --- Resources ---
  STARTING_FUEL: 70,
  MAX_FUEL: 100,
  FUEL_IDLE: 0.03,            // per second, engine ticking over
  FUEL_CONSUMPTION: 0.5,      // per second at full throttle
  STARTING_HEALTH: 100,
  STARTING_PARTS: 6,
  STARTING_SUPPLIES: 0,
  STARTING_AMMO: 40,
  MAX_AMMO: 90,
  SUPPLY_CAPACITY_BASE: 40,
  SUPPLY_CAPACITY_PER_CARGO: 40,
  REPAIR_COST: 2,             // parts per hull patch
  REPAIR_AMOUNT: 20,
  REPAIR_DURATION: 2.5,
  BURN_SUPPLIES_COST: 5,      // supplies burned in the firebox...
  BURN_SUPPLIES_FUEL: 8,      // ...for this much fuel
  BURN_DURATION: 2,

  // --- Weapon ---
  WEAPON_RANGE: 48,
  WEAPON_DAMAGE: 11,
  WEAPON_COOLDOWN: 0.38,
  WEAPON_FAR_MISS: 0.45,      // miss chance at max range (scales with distance²)

  // --- Enemies ---
  ENEMY_DAMAGE: 1,            // global multiplier on per-type damage
  ENEMY_DETECT_RANGE: 75,
  ENEMY_LOSE_RANGE: 170,
  ENEMY_HIT_CHANCE: 0.6,      // ranged enemy accuracy
  ROAM_FIRST_DELAY: 80,       // seconds before random roaming spawns start
  MAX_ENEMIES: 7,

  // --- Interaction / hazards ---
  SALVAGE_DURATION: 4,        // default; locations override
  SALVAGE_RADIUS: 22,         // metres from any train part
  STOP_SPEED: 0.6,            // below this the train counts as stopped
  HAZARD_SAFE_SPEED: 6,       // debris is harmless below this
  HAZARD_DAMAGE_PER_SPEED: 1.8,
  CRASH_SAFE_SPEED: 3,        // hitting a blockage slower than this is harmless
  CRASH_DAMAGE_PER_SPEED: 2.4,
  MAKESHIFT_REPAIR_TIME: 9,   // clearing without enough parts
  MAKESHIFT_REPAIR_DAMAGE: 10,
  STRAND_TIME: 4,             // seconds out of fuel with no options before game over

  // --- Camera ---
  CAMERA_OFFSET: [30, 56, 42],
  CAMERA_LAG: 3,
  CAMERA_FOV: 40,
  ZOOM_MIN: 0.6,
  ZOOM_MAX: 1.5,
};

// Railway network. Waypoints: [x, z, headingDeg]; heading 0 = north (-Z), positive = east.
// next[0] = left branch, next[1] = right branch.
export const TRACK_DEFS = {
  S1: { name: 'Southern Mainline', kind: 'main', wps: [[0, 60, 0], [0, -130, 0], [28, -300, 12], [30, -440, 0]], next: ['A', 'B'],
    junction: [{ title: 'Forest Loop', desc: 'Longer · quiet woods · old fuel depot' },
               { title: 'Direct Line', desc: 'Shorter · raider ambush · damaged track' }] },
  A: { name: 'Forest Loop', kind: 'safe', wps: [[30, -440, 0], [-15, -570, -32], [-110, -720, -18], [-140, -900, 4], [-85, -1080, 32], [20, -1200, 0]], next: ['S2'] },
  B: { name: 'Direct Line', kind: 'danger', wps: [[30, -440, 0], [58, -600, 8], [48, -900, -6], [20, -1200, 0]], next: ['S2'] },
  S2: { name: 'Junction Flats', kind: 'main', wps: [[20, -1200, 0], [20, -1330, 0], [5, -1480, -8]], next: ['I1', 'Y'],
    junction: [{ title: 'Northern Mainline', desc: 'Continue north into the industrial belt' },
               { title: 'Rail Yard Spur', desc: 'Dead end · fuel tanks · abandoned FUEL TANKER (reverse out)' }] },
  Y: { name: 'Rail Yard Spur', kind: 'spur', wps: [[5, -1480, -8], [30, -1570, 28], [62, -1680, 8], [66, -1740, 0]], next: [] },
  I1: { name: 'Industrial Mainline', kind: 'main', wps: [[5, -1480, -8], [-12, -1650, -3], [-20, -1820, 0], [-20, -1950, 0]], next: ['C', 'D'],
    junction: [{ title: 'Factory Line', desc: 'Dangerous · raider checkpoint · munitions · ARMORED CAR' },
               { title: 'Outer Bypass', desc: 'Longer · burns more fuel · safer · little loot' }] },
  C: { name: 'Factory Line', kind: 'danger', wps: [[-20, -1950, 0], [-65, -2090, -28], [-95, -2290, -2], [-70, -2490, 18], [-20, -2660, 0]], next: ['N1'] },
  D: { name: 'Outer Bypass', kind: 'safe', wps: [[-20, -1950, 0], [55, -2070, 42], [140, -2240, 8], [135, -2440, -18], [60, -2570, -38], [-20, -2660, 0]], next: ['N1'] },
  N1: { name: 'Northern Mainline', kind: 'main', wps: [[-20, -2660, 0], [-20, -2780, 0], [8, -2940, 12], [15, -3100, 0]], next: ['E', 'F'],
    junction: [{ title: 'Mountain Pass', desc: 'Short · rockfalls · crawler nests · crashed helicopter' },
               { title: 'Frozen Lake Line', desc: 'Longer · lakeside fuel depot · spare CARGO CAR' }] },
  E: { name: 'Mountain Pass', kind: 'danger', wps: [[15, -3100, 0], [-18, -3250, -18], [-28, -3450, 4], [-2, -3620, 12], [10, -3760, 0]], next: ['N2'] },
  F: { name: 'Frozen Lake Line', kind: 'safe', wps: [[15, -3100, 0], [80, -3220, 36], [140, -3400, 4], [125, -3570, -22], [55, -3690, -30], [10, -3760, 0]], next: ['N2'] },
  N2: { name: 'Evacuation Approach', kind: 'main', wps: [[10, -3760, 0], [10, -3890, 0], [0, -4030, -4]], next: [] },
};
export const START_SEGMENT = 'S1';
export const START_DIST = 60;
export const STATION_SEGMENT = 'N2';
export const STATION_PLATFORM = 125; // metres before the end of N2 where the platform begins

export const LOCATION_TYPES = {
  farmstead: { name: 'Abandoned Farmstead', prefab: 'farmstead', time: 4, loot: { fuel: [8, 12], parts: [1, 2], supplies: [8, 12] } },
  cache: { name: 'Supply Cache', prefab: 'cache', time: 3, loot: { supplies: [10, 16], ammo: [4, 8] } },
  carwreck: { name: 'Abandoned Vehicles', prefab: 'carwrecks', time: 3.5, loot: { fuel: [6, 10], parts: [1, 2] } },
  fueldepot: { name: 'Old Fuel Depot', prefab: 'fueldepot', time: 5, loot: { fuel: [35, 45], parts: [1, 1] } },
  cabin: { name: "Hunter's Cabin", prefab: 'cabinSite', time: 3.5, loot: { supplies: [8, 12], ammo: [8, 12] } },
  wreckedtrain: { name: 'Wrecked Train', prefab: 'wreckedtrain', time: 5, loot: { parts: [2, 4], supplies: [8, 14], fuel: [5, 10] } },
  ranger: { name: 'Ranger Station', prefab: 'ranger', time: 4, loot: { supplies: [10, 14], ammo: [8, 12], parts: [1, 1] } },
  raiderstash: { name: 'Raider Stash', prefab: 'stash', time: 4, loot: { ammo: [15, 22], parts: [2, 3], supplies: [6, 10] } },
  signalbox: { name: 'Signal Box', prefab: 'signalbox', time: 3, loot: { parts: [2, 3], ammo: [3, 6] } },
  yardtanks: { name: 'Rail Yard Fuel Tanks', prefab: 'fueldepot', time: 5, loot: { fuel: [25, 32] } },
  warehouse: { name: 'Warehouse', prefab: 'warehouseSite', time: 5, loot: { parts: [2, 4], supplies: [10, 16] } },
  munitions: { name: 'Munitions Factory', prefab: 'factorySite', time: 5, loot: { ammo: [20, 28], parts: [2, 3] } },
  chemtanks: { name: 'Chemical Plant Tanks', prefab: 'fueldepot', time: 5, loot: { fuel: [22, 30] } },
  supplywarehouse: { name: 'Supply Warehouse', prefab: 'warehouseSite', time: 5, loot: { supplies: [18, 26], parts: [1, 2] } },
  shed: { name: 'Linesman Shed', prefab: 'shed', time: 3, loot: { parts: [1, 2], fuel: [6, 10] } },
  outpost: { name: 'Canyon Outpost', prefab: 'outpost', time: 4.5, loot: { fuel: [14, 20], supplies: [10, 14], ammo: [5, 8] } },
  helicopter: { name: 'Crashed Helicopter', prefab: 'helicopter', time: 5, loot: { ammo: [14, 20], parts: [3, 4], supplies: [14, 20] } },
  lakedepot: { name: 'Lakeside Fuel Depot', prefab: 'fueldepot', time: 5, loot: { fuel: [35, 45], parts: [1, 2] } },
};

// Selectable locomotives (Settings). Multipliers apply to the CONFIG values above.
export const TRAIN_TYPES = {
  ironclad: { name: 'Ironclad', model: 'steam', card: 'assets/card_steam.jpg', desc: 'Armored steam engine. Tough hull, heavy cannon, slow to get going.',
    health: 1.0, speed: 1.0, accel: 1.0, fuel: 1.0, cooldown: 1.0, damage: 1.0, ammo: 1.0 },
  vanguard: { name: 'Vanguard', model: 'diesel', card: 'assets/card_diesel.jpg', desc: 'Fast diesel with twin machine guns and deep ammo belts. Frugal on fuel, thinner armor.',
    health: 0.9, speed: 1.12, accel: 1.3, fuel: 0.82, cooldown: 0.7, damage: 0.95, ammo: 1.5 }, // small-calibre rounds: more of them
};

export const CAR_TYPES = {
  cargo: { name: 'Cargo Car', desc: '+40 supply capacity' },
  tanker: { name: 'Fuel Tanker', desc: '+60 max fuel, +25 fuel' },
  armored: { name: 'Armored Car', desc: '+40 max hull, 25% damage reduction' },
};

export const HAZARD_TYPES = {
  debris: { name: 'Debris', blocking: false },
  fallentree: { name: 'Fallen Tree', blocking: true, time: 3, cost: 0, verb: 'Clear' },
  barricade: { name: 'Raider Barricade', blocking: true, time: 4, cost: 1, verb: 'Dismantle' },
  damagedtrack: { name: 'Damaged Track', blocking: true, time: 4, cost: 3, verb: 'Repair' },
  rockfall: { name: 'Rockfall', blocking: true, time: 5, cost: 0, verb: 'Clear' },
};

export const ENEMY_TYPES = {
  raider: { name: 'Raider Buggy', hp: 30, speed: 18, accel: 12, range: 20, damage: 3, cooldown: 1.6, melee: false, standoff: 12 },
  truck: { name: 'Gun Truck', hp: 65, speed: 14, accel: 7, range: 26, damage: 7, cooldown: 2.2, melee: false, standoff: 15 },
  crawler: { name: 'Crawler', hp: 22, speed: 16, accel: 22, range: 4, damage: 5, cooldown: 1.0, melee: true, standoff: 2.5 },
};

// Per-run content. Arrays are random picks (null = nothing); "type?" = 50% chance; d<0 counts from segment end.
export const CONTENT = [
  // South — gentle start
  { seg: 'S1', d: 175, side: -1, off: 17, loc: ['farmstead'] },
  { seg: 'S1', d: 310, hazard: ['debris'] },
  { seg: 'S1', d: 410, side: 1, off: 15, loc: ['cache', 'carwreck', null] },
  // Forest Loop: long, safe, fuel
  { seg: 'A', d: 200, side: 1, off: 18, loc: ['fueldepot'] },
  { seg: 'A', d: 420, hazard: ['fallentree', 'debris', null] },
  { seg: 'A', d: 540, side: -1, off: 16, loc: ['cabin', 'wreckedtrain', 'cache'] },
  { seg: 'A', d: 760, side: 1, off: 17, loc: ['ranger'] },
  { seg: 'A', d: 640, ambush: ['raider?'], chance: 0.35 },
  // Direct Line: short, raiders, damaged track
  { seg: 'B', d: 120, ambush: ['raider', 'raider', 'raider?'] },
  { seg: 'B', d: 330, side: -1, off: 16, loc: ['raiderstash'], guards: ['raider', 'raider?'] },
  { seg: 'B', d: 520, hazard: ['damagedtrack', 'barricade'] },
  // Junction flats
  { seg: 'S2', d: 90, side: 1, off: 15, loc: ['signalbox'] },
  // Rail yard spur (dead end)
  { seg: 'Y', d: 110, side: -1, off: 16, loc: ['yardtanks'] },
  { seg: 'Y', d: -26, side: 1, off: 6, carriage: 'tanker' },
  { seg: 'Y', d: 170, guards: ['raider', 'raider?'], side: 1, off: 30 },
  // Industrial mainline
  { seg: 'I1', d: 130, side: -1, off: 20, loc: ['warehouse'] },
  { seg: 'I1', d: 250, hazard: ['debris', null] },
  { seg: 'I1', d: 320, ambush: ['raider', 'raider?'], chance: 0.75 },
  { seg: 'I1', d: 390, side: 1, off: 18, loc: ['cache', 'carwreck', 'wreckedtrain'] },
  // Factory Line: dangerous, rich, armored car
  { seg: 'C', d: 90, ambush: ['raider', 'raider', 'truck'] },
  { seg: 'C', d: 230, side: 1, off: 20, loc: ['munitions'] },
  { seg: 'C', d: 360, hazard: ['barricade'] },
  { seg: 'C', d: 395, side: -1, off: 6, carriage: 'armored', guards: ['truck', 'raider'] },
  { seg: 'C', d: 540, side: 1, off: 18, loc: ['chemtanks', 'supplywarehouse'] },
  // Outer Bypass: long, safe, poor
  { seg: 'D', d: 320, side: -1, off: 16, loc: ['shed', 'cache'] },
  { seg: 'D', d: 560, hazard: ['debris', null] },
  { seg: 'D', d: 640, ambush: ['raider?'], chance: 0.4 },
  // North
  { seg: 'N1', d: 110, side: -1, off: 17, loc: ['outpost'] },
  { seg: 'N1', d: 270, hazard: ['rockfall', 'damagedtrack', 'debris'] },
  { seg: 'N1', d: 310, ambush: ['crawler', 'crawler', 'crawler?'], chance: 0.7 },
  // Mountain Pass: short, deadly
  { seg: 'E', d: 100, ambush: ['crawler', 'crawler', 'crawler', 'crawler?'] },
  { seg: 'E', d: 280, hazard: ['rockfall'] },
  { seg: 'E', d: 360, side: 1, off: 16, loc: ['helicopter'] },
  { seg: 'E', d: 460, ambush: ['crawler', 'truck?'] },
  // Frozen Lake Line: longer, fuel, cargo car
  { seg: 'F', d: 200, side: -1, off: 17, loc: ['lakedepot'] },
  { seg: 'F', d: 430, side: 1, off: 6, carriage: 'cargo' },
  { seg: 'F', d: 560, hazard: ['damagedtrack', 'debris'] },
  { seg: 'F', d: 620, ambush: ['crawler', 'crawler?'], chance: 0.6 },
  // Final approach
  { seg: 'N2', d: 30, ambush: ['crawler', 'crawler', 'truck?'] },
];

// One entry per biome (see util.biomeWeights). threat scales enemy damage; roam = spawn interval [min,max] s.
export const ZONES = [
  { name: 'SOUTHERN FARMLANDS', threat: 0, roam: [55, 80], spawn: [['raider']] },
  { name: 'DUST FLATS', threat: 0.2, roam: [40, 60], spawn: [['raider', 'raider'], ['raider']] },
  { name: 'INDUSTRIAL BELT', threat: 0.4, roam: [32, 50], spawn: [['raider', 'raider'], ['truck']] },
  { name: 'SHATTERED CANYONS', threat: 0.55, roam: [30, 45], spawn: [['truck', 'raider'], ['crawler', 'crawler']] },
  { name: 'FROZEN NORTH', threat: 0.7, roam: [28, 42], spawn: [['crawler', 'crawler'], ['truck', 'crawler']] },
];
export { biomeIndex as zoneIndex } from './util.js';
