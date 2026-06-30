import Phaser from 'phaser';
import { RegKey, WORLD_H, WORLD_W } from '../config/constants';
import { factions } from '../defs/factions';
import type { AIContext } from '../ai/Brain';
import type { Entity } from '../ecs/components';
import { World } from '../ecs/World';
import { Spawner } from '../ecs/spawn';
import { AbilitySystem } from '../systems/AbilitySystem';
import { AISystem } from '../systems/AISystem';
import { DebugOverlay } from '../systems/DebugOverlay';
import { Damage } from '../systems/Damage';
import { EffectSystem } from '../systems/EffectSystem';
import { FxSystem } from '../systems/FxSystem';
import { GameDirector } from '../systems/GameDirector';
import { InputSystem } from '../systems/InputSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { RenderSystem } from '../systems/RenderSystem';
import { ShipSystem } from '../systems/ShipSystem';
import { SquadSystem } from '../systems/SquadSystem';
import { Collision } from '../world/Collision';
import { Pathfinder } from '../world/Pathfinder';
import { SpatialQuery } from '../world/SpatialQuery';
import { TerrainRenderer } from '../world/TerrainRenderer';
import { generateLevel } from '../world/WorldGen';

interface Dot { x: number; y: number; c: number; r: number }

/** Owns the ECS world + systems, drives the fixed update order, and publishes HUD state. */
export class WorldScene extends Phaser.Scene {
  private world!: World;
  private director!: GameDirector;
  private inputSys!: InputSystem;
  private aiSys!: AISystem;
  private moveSys!: MovementSystem;
  private renderSys!: RenderSystem;
  private abilitySys!: AbilitySystem;
  private effectSys!: EffectSystem;
  private shipSys!: ShipSystem;
  private squadSys!: SquadSystem;
  private debug!: DebugOverlay;
  private fx!: FxSystem;

  constructor() {
    super('World');
  }

  create(): void {
    const level = generateLevel();
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    TerrainRenderer.bake(this, level.grid);
    TerrainRenderer.bakeMinimap(this, level.grid);

    const world = new World();
    this.world = world;
    const collision = new Collision(level.grid);
    const pathfinder = new Pathfinder(level.grid);
    const query = new SpatialQuery(world);
    const fx = new FxSystem(this);
    this.fx = fx;
    const damage = new Damage(fx);
    const effects = new EffectSystem(world);
    const abilities = new AbilitySystem(world, damage, fx, effects);
    const ships = new ShipSystem(world, collision, fx);
    const squads = new SquadSystem(world, query);
    const spawner = new Spawner(this, world);

    const hero = spawner.spawnHero(level.playerSpawn.x, level.playerSpawn.y);
    // a Cutlass lying on the island — walk up and press E to equip (fists → sword)
    spawner.spawnPickup('weapon', 'weapon.cutlass', level.playerSpawn.x + 40, level.playerSpawn.y - 60);

    const cutlass = () => (Math.random() < 0.2 ? 'weapon.cutlass' : undefined); // rarely armed
    const fodder = ['unit.thug', 'unit.bandit', 'unit.brute']; // F- / F / F+ stat variants
    const grunt = () => fodder[Math.floor(Math.random() * fodder.length)];
    // enemy-isle gang (reachable by ship) — a squad; the captain fights solo
    const isle = { id: 2, name: 'Isle Raiders' };
    for (const s of level.enemies) {
      const unit = s.boss ? 'unit.captain' : grunt();
      spawner.spawnEnemy(unit, s.x, s.y, s.boss ? undefined : isle, s.boss ? undefined : cutlass());
    }
    // home-island test SQUAD of 4: ~2 strike at once, the rest circle, and they flee when broken
    const gang = { id: 1, name: 'Dock Gang' };
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      spawner.spawnEnemy(grunt(), level.playerSpawn.x + 300 + Math.cos(a) * 36, level.playerSpawn.y - 20 + Math.sin(a) * 36, { ...gang }, cutlass());
    }
    // an anchored Sloop at the home dock — board with E, sail east with W/S + A/D
    spawner.spawnShip('ship.sloop', level.boatSpawn.x, level.boatSpawn.y, 'straw_hat');

    const ctx: AIContext = {
      world,
      controlled: hero,
      query,
      fx,
      abilities,
      pathfinder,
      applyDamage: (target, d, kx, ky, bp) => damage.apply(target, d, kx, ky, bp),
    };

    this.director = new GameDirector(world, fx, level);
    this.abilitySys = abilities;
    this.effectSys = effects;
    this.shipSys = ships;
    this.squadSys = squads;
    this.debug = new DebugOverlay(this, world, level.grid);
    this.inputSys = new InputSystem(this, world, query, abilities, ships, this.director);
    this.aiSys = new AISystem(world, ctx);
    this.moveSys = new MovementSystem(world, collision);
    this.renderSys = new RenderSystem(this, world);

    this.cameras.main.startFollow(hero.render!.gfx, true, 0.12, 0.12);

    if (import.meta.env.DEV) {
      (window as Window & { __bp?: unknown }).__bp = { world, director: this.director, hero, abilities };
    }
  }

  update(_t: number, delta: number): void {
    if (!this.world) return;
    const dt = Math.min(delta / 1000, 1 / 30);
    if (this.director.state === 'play') {
      this.inputSys.update(dt);
      this.squadSys.update(); // assign focus + attack tokens before brains run
      this.aiSys.update(dt);
      this.moveSys.update(dt);
      this.shipSys.update(dt);
      this.abilitySys.tick(dt);
      this.effectSys.update(dt);
      this.director.update(dt);
    } else {
      this.inputSys.update(dt); // still allow E to recover / continue
    }
    this.fx.update(dt);
    this.renderSys.update(dt);
    this.debug.update();
    this.publish();
  }

  private publish(): void {
    const r = this.registry;
    const e = this.world.first('control');
    if (e?.health && e.combatant) {
      r.set(RegKey.Hp, e.health.hp);
      r.set(RegKey.MaxHp, e.health.maxhp);
      r.set(RegKey.Stam, e.combatant.stam);
      r.set(RegKey.MaxStam, e.combatant.maxStam);
      r.set(RegKey.Combo, e.combatant.combo);
      r.set(RegKey.HasFruit, e.avatar?.hasFruit ?? false);
    }
    if (e?.loadout) {
      const lo = e.loadout;
      const entries = ([
        { key: 'LMB', id: lo.primary },
        { key: 'Q', id: lo.dash },
        { key: 'K', id: lo.slots[0] },
        { key: 'L', id: lo.slots[1] },
      ] as Array<{ key: string; id?: string }>)
        .filter((x) => !!x.id && lo.granted.has(x.id))
        .map((x) => ({ key: x.key, id: x.id as string, cd: lo.cd.get(x.id as string) ?? 0 }));
      r.set(RegKey.AbilityBar, entries);
    }
    let prompt = '';
    if (e?.riding) prompt = '[E] Disembark';
    else if (e && this.shipSys.nearestShip(e)) prompt = '[E] Board ship';
    else if (e?.transform) {
      let near: Entity | undefined;
      let bd = 42 * 42;
      for (const it of this.world.with('pickup', 'transform')) {
        const d = (e.transform.x - it.transform!.x) ** 2 + (e.transform.y - it.transform!.y) ** 2;
        if (d < bd) {
          bd = d;
          near = it;
        }
      }
      if (near) prompt = `[E] ${near.pickup!.kind === 'weapon' ? 'Equip' : 'Take'} ${near.pickup!.label}`;
    }
    r.set(RegKey.Prompt, prompt);
    r.set(RegKey.Gold, this.director.gold);
    r.set(RegKey.EnemiesLeft, this.director.enemiesAlive());
    r.set(RegKey.Objective, this.director.objective);
    r.set(RegKey.State, this.director.state);

    const pf = this.director.controlledFaction();
    const dots: Dot[] = [];
    for (const o of this.world.entities) {
      if (!o.transform || o === e) continue;
      if (o.faction && !o.health?.dead && factions.isHostile(pf, o.faction.id)) {
        const boss = !!o.ai?.bb?.boss;
        dots.push({ x: o.transform.x, y: o.transform.y, c: boss ? 0xff5a5a : 0xd4483b, r: boss ? 3 : 2 });
      }
    }
    if (e?.transform) dots.push({ x: e.transform.x, y: e.transform.y, c: 0xffffff, r: 3 });
    r.set(RegKey.Minimap, dots);
  }
}
