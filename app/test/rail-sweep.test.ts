import { expect, it } from 'vitest';
import { deckCellAtLocal, deckOf, deckToWorld, gangplankCell, gangplankOutward, worldToDeck } from '../src/defs/decks';
import { TERRAIN } from '../src/defs/terrains';
import { ShipHulls } from '../src/defs/ships';
import { World } from '../src/ecs/World';
import { Collision } from '../src/world/Collision';
import { TileGrid } from '../src/world/TileGrid';
import { MovementSystem } from '../src/systems/MovementSystem';
import { ShipSystem } from '../src/systems/ShipSystem';
import { HullCollisionSystem } from '../src/systems/HullCollisionSystem';

/**
 * THE DOOR-REGION SWEEP — the brute-force guard over the whole "walked onto the rail without jumping"
 * family. Every hand-written regression here guarded ONE path, and playtesting kept finding the next one
 * (the wader strip, the swim-window slip past the jamb, the 45° corner-rail slide). This sweeps the entire
 * neighborhood: every start spot around the gangplank × all 8 push directions × deep AND shallow water,
 * 4 seconds of held input each — and asserts the ONE invariant every variant violated: a world-frame body's
 * CENTER never stands inside a rail cell. A failure prints its exact combo — the repro comes for free.
 */
it('no start spot, push direction, or water depth around the door puts a center inside a rail cell', () => {
  const grid = deckOf('ship.sloop', ShipHulls.get('ship.sloop').deck);
  const gp = gangplankCell(grid)!;
  const [ox, oy] = gangplankOutward(grid, gp);
  const t = grid.tilePx;
  const spots: [string, number, number][] = [
    ['plank', gp.lx, gp.ly],
    ['plank-N-edge', gp.lx, gp.ly - 10],
    ['plank-E-offset', gp.lx + 12, gp.ly], // 60/40 across the plank/deck seam — the interior-overlap TRADE spot
    ['plank-E-offset-N', gp.lx + 12, gp.ly - 8], // same, nudged at the flank (the reported "30% through" recipe)
    ['mouth', gp.lx + ox * t, gp.ly + oy * t],
    ['mouth-N', gp.lx + ox * t, gp.ly - 12],
    ['mouth-S', gp.lx + ox * t, gp.ly + 36],
    ['outside-N-jamb', gp.lx + ox * t, gp.ly - t],
  ];
  const fails: string[] = [];
  for (const water of [0 /* deep */, TERRAIN.shallowWater]) {
    for (const [name, slx, sly] of spots) {
      for (let dir = 0; dir < 8; dir++) {
        const g = new TileGrid(40, 40);
        g.tiles = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => water));
        const world = new World();
        const collision = new Collision(g);
        const move = new MovementSystem(world, collision);
        const ships = new ShipSystem(world, collision);
        const hulls = new HullCollisionSystem(world);
        const ship = world.create({
          transform: { x: 500, y: 500, angle: 0, r: 56 },
          ship: { hull: 'ship.sloop', mode: 'exploration', anchored: true, speed: 0, throttle: 0 },
        });
        const s = deckToWorld(ship.transform!, slx, sly);
        const a = world.create({
          transform: { x: s.x, y: s.y, angle: 0, r: 11 },
          mover: { vx: 0, vy: 0, speed: 95, mass: 1, mode: 'foot', dodgeT: 0, dvx: 0, dvy: 0 },
        });
        const ang = (dir / 8) * Math.PI * 2;
        const ang2 = ((dir + 3) / 8) * Math.PI * 2; // phase two turns 135° — wiggling input hunts escape-rule seams a held push can't reach
        for (let i = 0; i < 240 && !a.onDeck; i++) {
          const useAng = i < 120 ? ang : ang2;
          a.mover!.vx = Math.cos(useAng) * 95;
          a.mover!.vy = Math.sin(useAng) * 95;
          move.update(1 / 60);
          ships.update(1 / 60);
          hulls.update();
          const l = worldToDeck(ship.transform!, a.transform!.x, a.transform!.y);
          if (deckCellAtLocal(grid, l.lx, l.ly)?.tile === 'rail') {
            fails.push(`${water === 0 ? 'deep' : 'shallow'} ${name} dir ${((ang * 180) / Math.PI).toFixed(0)}° → center on rail at tick ${i}, local (${l.lx.toFixed(0)}, ${l.ly.toFixed(0)})`);
            break; // one line per combo is enough — the combo IS the repro
          }
        }
      }
    }
  }
  expect(fails).toEqual([]);
});
