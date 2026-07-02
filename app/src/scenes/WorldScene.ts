import Phaser from 'phaser';
import { CAMERA_ZOOM, RegKey, SIM_DT, WORLD_H, WORLD_W, type MinimapDot } from '../config/constants';
import { factions } from '../defs/factions';
import type { AIContext } from '../ai/Brain';
import type { Entity } from '../ecs/components';
import { Rng, streamSeed } from '../core/Rng';
import { World } from '../ecs/World';
import { Spawner } from '../ecs/Spawner';
import { AbilitySystem } from '../systems/AbilitySystem';
import { AISystem } from '../systems/AISystem';
import { CombatantSystem } from '../systems/CombatantSystem';
import { DebugOverlay } from '../systems/DebugOverlay';
import { Damage } from '../systems/Damage';
import { DoorSystem } from '../systems/DoorSystem';
import { DoorRenderer } from '../draw/DoorRenderer';
import { EffectSystem } from '../systems/EffectSystem';
import { FxSystem } from '../systems/FxSystem';
import { GameDirector } from '../systems/GameDirector';
import { InputSystem } from '../systems/InputSystem';
import { AccessorySystem } from '../systems/AccessorySystem';
import { MeleeSystem } from '../systems/MeleeSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { BodyCollisionSystem } from '../systems/BodyCollisionSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { DialogueSystem } from '../systems/DialogueSystem';
import { NameplateSystem } from '../systems/NameplateSystem';
import { RenderSystem } from '../systems/RenderSystem';
import { ShipSystem } from '../systems/ShipSystem';
import { StrikeResolver } from '../systems/StrikeResolver';
import { SquadSystem } from '../systems/SquadSystem';
import { Collision } from '../world/Collision';
import { Pathfinder } from '../world/Pathfinder';
import { SpatialQuery } from '../world/SpatialQuery';
import { SeaRenderer } from '../draw/SeaRenderer';
import { TerrainRenderer } from '../draw/TerrainRenderer';
import { generateLevel } from '../world/WorldGen';

/** Owns the ECS world + systems, drives the fixed update order, and publishes HUD state. */
export class WorldScene extends Phaser.Scene {
  private world!: World;
  private director!: GameDirector;
  private inputSys!: InputSystem;
  private interactionSys!: InteractionSystem;
  private dialogueSys!: DialogueSystem;
  private aiSys!: AISystem;
  private moveSys!: MovementSystem;
  private bodySys!: BodyCollisionSystem;
  private meleeSys!: MeleeSystem;
  private combatantSys!: CombatantSystem;
  private renderSys!: RenderSystem;
  private nameplateSys!: NameplateSystem;
  private accessorySys!: AccessorySystem;
  private abilitySys!: AbilitySystem;
  private effectSys!: EffectSystem;
  private shipSys!: ShipSystem;
  private squadSys!: SquadSystem;
  private doorSys!: DoorSystem;
  private doorRenderer!: DoorRenderer;
  private debug!: DebugOverlay;
  private fx!: FxSystem;
  private sea!: SeaRenderer;
  private readonly camTarget = { x: 0, y: 0 }; // camera follows the CONTROLLED entity (possession-safe)

  constructor() {
    super('World');
  }

  create(): void {
    // The ONE legal wall-clock read in the sim path: minting a new game's master seed (persisted with the
    // save later). Everything downstream is a pure function of it — one stream per domain (DESIGN_PATTERNS §8).
    const masterSeed = Date.now() >>> 0;
    const worldgenRng = new Rng(streamSeed(masterSeed, 'worldgen'));
    const aiRng = new Rng(streamSeed(masterSeed, 'ai'));
    const combatRng = new Rng(streamSeed(masterSeed, 'combat'));
    const level = generateLevel(worldgenRng);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.sea = new SeaRenderer(this, level.grid); // animated wave-crest overlay on the (baked) deep water
    TerrainRenderer.bake(this, level.grid);
    TerrainRenderer.bakeMinimap(this, level.grid);

    const world = new World();
    this.world = world;
    const collision = new Collision(level.grid);
    const pathfinder = new Pathfinder(level.grid);
    const query = new SpatialQuery(world);
    const fx = new FxSystem(this);
    this.fx = fx;
    const damage = new Damage();
    const strikes = new StrikeResolver(damage);
    const effects = new EffectSystem(world);
    const abilities = new AbilitySystem(world, effects, strikes, combatRng);
    const ships = new ShipSystem(world, collision);
    const squads = new SquadSystem(world, query);
    const spawner = new Spawner(world, worldgenRng);

    const hero = spawner.spawnHero(level.playerSpawn.x, level.playerSpawn.y);
    // loot stashed in the village houses — walk in and press E (a Cutlass in one, the Gomu fruit in another)
    for (const pk of level.pickups) spawner.spawnPickup(pk.kind, pk.defId, pk.x, pk.y);
    // townsfolk — FULL units (same stack as everyone): they wander, can be Talked to (E), can be attacked, and
    // self-defend. Allied to the player; hostile to bandits (factions). Lead a bandit into town to see them fight.
    // the other villager is now an ALLIED Brute instead (faction override → straw_hat): friendly to you and the
    // townsfolk, hostile to bandits. Lead a bandit over to watch him defend the town.
    spawner.spawnUnit('unit.brute', level.playerSpawn.x + 70, level.playerSpawn.y - 12, undefined, undefined, 'straw_hat');
    spawner.spawnUnit('unit.villager', level.playerSpawn.x + 26, level.playerSpawn.y + 84);
    // passive wildlife grazing on the open grass south of the houses — they wander and bolt when struck (hunt them)
    spawner.spawnUnit('unit.cow', level.playerSpawn.x + 40, level.playerSpawn.y + 210);
    spawner.spawnUnit('unit.cow', level.playerSpawn.x + 120, level.playerSpawn.y + 205);
    spawner.spawnUnit('unit.pig', level.playerSpawn.x + 20, level.playerSpawn.y + 225);

    // enemy-isle gang (reachable by ship) — a squad; the captain fights solo. WHO spawns is level data
    // (EnemySpawn.unit, rolled from the seeded worldgen stream) — the scene just instantiates it.
    const isle = { id: 2, name: 'Isle Raiders' };
    for (const s of level.enemies) spawner.spawnUnit(s.unit, s.x, s.y, s.boss ? undefined : isle);
    // a 3-Bandit squad on the home island (east of spawn) — watch them fan into lanes + coordinate
    const gang = { id: 1, name: 'Dock Gang' };
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      spawner.spawnUnit('unit.bandit', level.playerSpawn.x + 500 + Math.cos(a) * 30, level.playerSpawn.y + Math.sin(a) * 30, { ...gang });
    }
    // an anchored Sloop at the home dock — board with E, sail east with W/S + A/D
    spawner.spawnShip('ship.sloop', level.boatSpawn.x, level.boatSpawn.y, 'straw_hat');

    const ctx: AIContext = { world, query, rng: aiRng, abilities, pathfinder };

    this.director = new GameDirector(world, level);
    this.abilitySys = abilities;
    this.effectSys = effects;
    this.shipSys = ships;
    this.squadSys = squads;
    this.meleeSys = new MeleeSystem(world, strikes);
    this.combatantSys = new CombatantSystem(world);
    this.doorSys = new DoorSystem(level.grid, level.doors, world);
    this.doorRenderer = new DoorRenderer(this, this.doorSys);
    this.debug = new DebugOverlay(this, world, level.grid);
    this.dialogueSys = new DialogueSystem();
    this.interactionSys = new InteractionSystem(world, ships, this.dialogueSys);
    this.inputSys = new InputSystem(this, world, query, abilities, ships, this.director, this.interactionSys, this.dialogueSys);
    this.aiSys = new AISystem(world, ctx);
    this.moveSys = new MovementSystem(world, collision);
    this.bodySys = new BodyCollisionSystem(world, query, collision);
    this.renderSys = new RenderSystem(this, world, level.grid);
    this.nameplateSys = new NameplateSystem(this, world);
    this.accessorySys = new AccessorySystem(this, world, this.renderSys);

    // roundPixels = false: smooth sub-pixel follow. (true rounds the lerped scroll each frame, which makes
    // everything jitter ~1px as the rounding boundary flickers — worse at zoom.) The camera follows a plain
    // point synced to the CONTROLLED entity each frame — no gfx handle, and possession retargets for free.
    this.camTarget.x = hero.transform!.x;
    this.camTarget.y = hero.transform!.y;
    this.cameras.main.startFollow(this.camTarget, false, 0.16, 0.16);
    this.cameras.main.setZoom(CAMERA_ZOOM); // closer view (moomoo.io-style), not the far-out default

    if (import.meta.env.DEV) {
      (window as Window & { __bp?: unknown }).__bp = { world, director: this.director, hero, abilities };
    }
  }

  private acc = 0; // fixed-timestep accumulator — sim advances in SIM_DT steps, render runs every frame

  override update(_t: number, delta: number): void {
    if (!this.world) return;
    // FIXED TIMESTEP: accumulate real time, step the sim in SIM_DT quanta. Clamp the carry-in so a suspended
    // tab doesn't spiral (drop the excess — slow-motion beats a death spiral). Presentation below still runs
    // once per render frame with the raw dt.
    this.inputSys.sample(); // latch edge-taps every render frame so none fall between sim steps
    this.acc = Math.min(this.acc + delta / 1000, 0.25);
    while (this.acc >= SIM_DT) {
      this.stepSim(SIM_DT);
      this.acc -= SIM_DT;
    }
    const dt = delta / 1000;
    const controlled = this.world.first('control');

    if (controlled?.transform) {
      this.camTarget.x = controlled.transform.x; // follow whoever is currently possessed
      this.camTarget.y = controlled.transform.y;
    }
    this.doorRenderer.update(); // redraw closed-door panels from the sim's door state
    this.sea.update(dt); // the sea drifts even while paused/dead
    this.fx.update(dt);
    this.renderSys.update(dt);
    this.accessorySys.update();
    this.nameplateSys.update();
    this.debug.update();
    this.publish();
  }

  /** ONE sim tick — engine-agnostic except InputSystem (the boundary). This method is the future headless
   *  server loop: everything it calls must stay constructible without Phaser (DESIGN_PATTERNS §5). */
  private stepSim(dt: number): void {
    if (this.director.state === 'play') {
      this.doorSys.update(); // open/close doors from current positions before AI + movement read the grid
      this.inputSys.update(dt); // player intent + ability presses (consumes taps latched by sample())
      this.squadSys.update(); // assign focus + attack tokens before brains run
      this.aiSys.update(dt);
      this.moveSys.update(dt);
      this.bodySys.update(); // resolve body-vs-body overlap (weighted) after movement integrates
      this.shipSys.update(dt); // integrate hulls + pin riders AFTER foot movement (deck position wins)
      this.meleeSys.update(dt); // resolve active swings by contact against current positions
      this.abilitySys.update(dt); // ability cooldowns
      this.combatantSys.update(dt); // stamina regen + combo decay
      this.effectSys.update(dt); // expire timed effects (i-frames, armament) after combat resolved this tick
      this.director.update(dt); // LAST: timers, death cleanup, win check — sees the tick's final state
    } else {
      this.inputSys.update(dt); // player intent + ability presses (consumes taps latched by sample()) // still allow E to recover / continue
    }
    // dialogue ticks on SIM time (always, even paused): its reveal state gates the sim's E-press handling,
    // so it must be deterministic/replayable — not tied to render rate
    this.dialogueSys.update(dt);
  }

  private publish(): void {
    const r = this.registry;
    const e = this.world.first('control');
    if (e?.health && e.combatant) {
      r.set(RegKey.Hp, e.health.hp);
      r.set(RegKey.MaxHp, e.health.maxHp);
      r.set(RegKey.Stam, e.combatant.stam);
      r.set(RegKey.MaxStam, e.combatant.maxStam);
      r.set(RegKey.Combo, e.combatant.combo);
      r.set(RegKey.Tier, e.identity?.tier ?? '');
    }
    if (e?.loadout) {
      const lo = e.loadout;
      const entries = ([
        { key: 'LMB', id: lo.primary },
        { key: 'RMB', id: lo.heavy },
        { key: 'Q', id: lo.dash },
        { key: 'U', id: lo.slots[0] },
        { key: 'I', id: lo.slots[1] },
      ] as Array<{ key: string; id?: string }>)
        .filter((x) => !!x.id && lo.granted.has(x.id))
        .map((x) => ({ key: x.key, id: x.id as string, cd: lo.cd.get(x.id as string) ?? 0 }));
      r.set(RegKey.AbilityBar, entries);
    }
    r.set(RegKey.Prompt, this.dialogueSys.active || !e ? '' : this.interactionSys.prompt(e)); // hide while talking
    r.set(RegKey.Dialogue, this.dialogueSys.view());
    r.set(RegKey.Gold, this.director.gold);
    r.set(RegKey.EnemiesLeft, this.director.enemiesAlive());
    r.set(RegKey.Objective, this.director.objective);
    r.set(RegKey.State, this.director.state);

    const pf = this.director.controlledFaction();
    const dots: MinimapDot[] = [];
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
