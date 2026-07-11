import Phaser from 'phaser';
import { CAMERA_ZOOM, RegKey, SIM_DT, WORLD_H, WORLD_W, type MinimapDot } from '../config/constants';
import { angleDiff, smoothFactor } from '../core/math';
import { setBarRotation } from '../draw/actorDraws';
import { factions } from '../defs/factions';
import { Units } from '../defs/units';
import type { AIContext } from '../ai/Brain';
import { Rng, streamSeed } from '../core/Rng';
import { World } from '../ecs/World';
import { Spawner } from '../ecs/Spawner';
import { AbilitySystem } from '../systems/AbilitySystem';
import { AISystem } from '../systems/AISystem';
import { CombatantSystem } from '../systems/CombatantSystem';
import { Debug } from '../core/Debug';
import { DebugOverlay } from '../systems/DebugOverlay';
import { Damage } from '../systems/Damage';
import { DoorSystem } from '../systems/DoorSystem';
import { DoorRenderer } from '../draw/DoorRenderer';
import { EffectSystem } from '../systems/EffectSystem';
import { FxSystem } from '../systems/FxSystem';
import { GameDirector } from '../systems/GameDirector';
import { InputSystem } from '../systems/InputSystem';
import { InspectSystem } from '../systems/InspectSystem';
import { AimReticle } from '../systems/AimReticle';
import { PossessButton } from '../systems/PossessButton';
import { AccessorySystem } from '../systems/AccessorySystem';
import { MeleeSystem } from '../systems/MeleeSystem';
import { MovementSystem } from '../systems/MovementSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { SwimSystem } from '../systems/SwimSystem';
import { BodyCollisionSystem } from '../systems/BodyCollisionSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { DialogueSystem } from '../systems/DialogueSystem';
import { NameplateSystem } from '../systems/NameplateSystem';
import { StunIndicator } from '../systems/StunIndicator';
import { RenderSystem } from '../systems/RenderSystem';
import { WeaponSpriteSystem } from '../systems/WeaponSpriteSystem';
import { ProjectileRenderer } from '../systems/ProjectileRenderer';
import { ShipSystem } from '../systems/ShipSystem';
import { HullCollisionSystem } from '../systems/HullCollisionSystem';
import { StrikeResolver } from '../systems/StrikeResolver';
import { SquadSystem } from '../systems/SquadSystem';
import { validateAllContent } from '../defs/validateContent';
import { Collision } from '../world/Collision';
import { Pathfinder } from '../world/Pathfinder';
import { SpatialQuery } from '../world/SpatialQuery';
import { placeStructure } from '../world/StructureIndex';
import { SeaRenderer } from '../draw/SeaRenderer';
import { StructureRenderer } from '../draw/StructureRenderer';
import { TerrainRenderer } from '../draw/TerrainRenderer';
import { generateLevel } from '../world/WorldGen';
import { unitPlateView } from '../ui/plateView';

/** Owns the ECS world + systems, drives the fixed update order, and publishes HUD state. */
export class WorldScene extends Phaser.Scene {
  private world!: World;
  private director!: GameDirector;
  private inputSys!: InputSystem;
  private interactionSys!: InteractionSystem;
  private dialogueSys!: DialogueSystem;
  private aiSys!: AISystem;
  private moveSys!: MovementSystem;
  private swimSys!: SwimSystem;
  private bodySys!: BodyCollisionSystem;
  private meleeSys!: MeleeSystem;
  private projectileSys!: ProjectileSystem;
  private combatantSys!: CombatantSystem;
  private renderSys!: RenderSystem;
  private weaponSpriteSys!: WeaponSpriteSystem;
  private projectileRenderer!: ProjectileRenderer;
  private nameplateSys!: NameplateSystem;
  private stunIndicator!: StunIndicator;
  private accessorySys!: AccessorySystem;
  private abilitySys!: AbilitySystem;
  private effectSys!: EffectSystem;
  private shipSys!: ShipSystem;
  private hullSys!: HullCollisionSystem;
  private squadSys!: SquadSystem;
  private doorSys!: DoorSystem;
  private doorRenderer!: DoorRenderer;
  private structureRenderer!: StructureRenderer;
  private debug!: DebugOverlay;
  private inspectSys!: InspectSystem;
  private aimReticle!: AimReticle;
  private possessButton!: PossessButton;
  private fx!: FxSystem;
  private sea!: SeaRenderer;
  private readonly camTarget = { x: 0, y: 0 }; // camera follows the CONTROLLED entity (possession-safe)
  /** Shift-lock view. `camRot` is applied to the camera each frame. `camBlend` (0→1) eases ONLY the toggle
   *  (Alt on/off): the rotation itself always tracks the facing 1:1 (no lag at any turn speed), scaled by the
   *  blend so entering/leaving lock glides instead of snapping. InputSystem owns the mode (Alt). */
  private camRot = 0;
  private camBlend = 0;

  constructor() {
    super('World');
  }

  create(): void {
    validateAllContent(); // fail-loud-at-boot: every def + cross-registry id checked BEFORE anything spawns
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

    const world = new World();
    this.world = world;
    // the STRUCTURE layer: worldgen's pure records become entities + grid occupancy, BEFORE anything
    // (minimap, colliders' first queries, door sweep) reads the composed world
    for (const s of level.structures) placeStructure(world, level.grid.structures, s.def, s.tx, s.ty);
    TerrainRenderer.bakeMinimap(this, level.grid); // composes BOTH layers — after placement, by contract
    this.structureRenderer = new StructureRenderer(this, level.grid);
    const collision = new Collision(level.grid);
    const pathfinder = new Pathfinder(level.grid);
    const query = new SpatialQuery(world);
    const fx = new FxSystem(this);
    this.fx = fx;
    const damage = new Damage();
    const strikes = new StrikeResolver(damage, combatRng);
    const effects = new EffectSystem(world);
    const abilities = new AbilitySystem(world, effects, strikes, combatRng);
    const ships = new ShipSystem(world, collision);
    const hulls = new HullCollisionSystem(world); // boarding handoffs (gangplank / leap-on) + embedded-in-hull eject fallback
    const squads = new SquadSystem(world, query);
    const spawner = new Spawner(world, worldgenRng);

    const hero = spawner.spawnHero(level.playerSpawn.x, level.playerSpawn.y);
    // loot stashed in the village houses — walk in and press E (a Cutlass in one, the Gomu fruit in another)
    for (const pk of level.pickups) spawner.spawnPickup(pk.item, pk.x, pk.y);
    // townsfolk — FULL units (same stack as everyone): they wander, can be Talked to (E), can be attacked, and
    // self-defend. Allied to the player; hostile to bandits (factions). Lead a bandit into town to see them fight.
    // a townsfolk Soldier (faction override → civilians): allied to you + the villagers, hostile to bandits.
    // The recruit test unit — talk to him (E) to bring him into your crew.
    spawner.spawnUnit('unit.soldier', level.playerSpawn.x + 70, level.playerSpawn.y - 12, undefined, undefined, 'civilians');
    spawner.spawnUnit('unit.villager', level.playerSpawn.x + 26, level.playerSpawn.y + 84);
    // passive wildlife grazing on the open grass south of the houses — they wander and bolt when struck (hunt them)
    spawner.spawnUnit('unit.cow', level.playerSpawn.x + 40, level.playerSpawn.y + 210);
    spawner.spawnUnit('unit.pig', level.playerSpawn.x + 20, level.playerSpawn.y + 225);
    // a TERRITORIAL bull among the grazers (replaces the 2nd cow) — calm until you strike it, then it charges
    spawner.spawnUnit('unit.bull', level.playerSpawn.x + 120, level.playerSpawn.y + 205);

    // enemy-isle gang (reachable by ship) — a squad; the captain fights solo. WHO spawns is level data
    // (EnemySpawn.unit, rolled from the seeded worldgen stream) — the scene just instantiates it. The squad is
    // the BANDIT gang ("Isle Raiders"): only bandit-faction units join it — a Marine among them is an enemy of
    // the gang, not a member, so it spawns SOLO (faction-scoped squad, not a per-unit hardcode).
    const isle = { id: 2, name: 'Isle Raiders' };
    for (const s of level.enemies) {
      const inGang = !s.boss && Units.get(s.unit).faction === 'bandits';
      spawner.spawnUnit(s.unit, s.x, s.y, inGang ? isle : undefined);
    }
    // an anchored Sloop off the home dock — walk aboard via the gangplank, E on the wheel to steer
    spawner.spawnShip('ship.sloop', level.boatSpawn.x, level.boatSpawn.y, 'straw_hat');

    const ctx: AIContext = { world, query, rng: aiRng, abilities, pathfinder };

    this.director = new GameDirector(world, level);
    this.abilitySys = abilities;
    this.effectSys = effects;
    this.shipSys = ships;
    this.hullSys = hulls;
    this.squadSys = squads;
    this.meleeSys = new MeleeSystem(world, strikes);
    this.projectileSys = new ProjectileSystem(world, strikes, collision, combatRng);
    this.combatantSys = new CombatantSystem(world);
    this.doorSys = new DoorSystem(world);
    this.doorRenderer = new DoorRenderer(this, world);
    this.debug = new DebugOverlay(this, world, level.grid);
    this.dialogueSys = new DialogueSystem();
    this.interactionSys = new InteractionSystem(world, this.dialogueSys);
    this.inspectSys = new InspectSystem(this, world, query);
    this.inputSys = new InputSystem(this, world, query, abilities, ships, this.director, this.interactionSys, this.dialogueSys, this.inspectSys);
    this.aiSys = new AISystem(world, ctx);
    this.moveSys = new MovementSystem(world, collision);
    this.swimSys = new SwimSystem(world, damage);
    this.bodySys = new BodyCollisionSystem(world, query, collision);
    this.renderSys = new RenderSystem(this, world, level.grid);
    this.weaponSpriteSys = new WeaponSpriteSystem(this, world, this.renderSys);
    this.projectileRenderer = new ProjectileRenderer(this, world);
    this.nameplateSys = new NameplateSystem(this, world);
    this.stunIndicator = new StunIndicator(this, world); // "seeing stars" tell over stunned units
    this.accessorySys = new AccessorySystem(this, world, this.renderSys);
    this.aimReticle = new AimReticle(this, world, this.inputSys); // the '+' aim marker ahead of the controlled unit
    this.possessButton = new PossessButton(this, world, this.inspectSys, this.director); // debug: V+click a unit → "Control" button → possess

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

    // SHIFT-LOCK CAMERA: rotate the VIEW so the controlled unit's aim points up (Roblox-style). The rotation
    // ALWAYS tracks the facing 1:1 — `aimRot` is the exact target, no smoothing, so the view is welded to the
    // character at ANY turn speed (the earlier gap-threshold made FAST spins ease slowly — wrong). The ONLY
    // easing is `camBlend` (0→1), a per-TOGGLE glide: it ramps in when Alt turns on and out when off, so the
    // world eases into/out of the rotated view without snapping. rotation = aimRot × blend.
    const locked = this.inputSys.shiftLocked && !!controlled?.transform;
    const aimRot = controlled?.transform ? -(controlled.transform.angle + Math.PI / 2) : 0;
    this.camBlend += ((locked ? 1 : 0) - this.camBlend) * smoothFactor(9, dt); // toggle ramp only (0↔1)
    // rotation = 0 blended toward aimRot along the SHORTEST arc (so it can't sweep the long way as the facing
    // wraps ±π). At blend 1 it's exactly aimRot → welded to the facing, 1:1 at any turn speed.
    this.camRot = angleDiff(aimRot, 0) * this.camBlend;
    this.cameras.main.setRotation(this.camRot);
    // DEBUG zoom-out: halve the zoom (see 2× the area — off-screen shooters). Applied per-frame so the flag
    // toggles live. Off → the normal close CAMERA_ZOOM.
    this.cameras.main.setZoom(Debug.on('view.zoomOut') ? CAMERA_ZOOM / 2 : CAMERA_ZOOM);
    // counter-rotate the world-space READOUTS so they stay screen-upright while the view spins: the
    // nameplate + damage-number text, AND the overhead hp/stamina/posture bars (set before renderSys draws
    // the actors below). The actor bodies/sprites still rotate with the world — only the readouts stay level.
    this.nameplateSys.setTextRotation(-this.camRot);
    this.fx.setTextRotation(-this.camRot);
    setBarRotation(-this.camRot);
    this.aimReticle.setRotation(-this.camRot); // the '+' stays screen-upright while the shift-lock view spins
    this.stunIndicator.setRotation(-this.camRot); // dizzy stars stay level under the spin

    this.structureRenderer.update(); // rebake the structure layer only if place/remove changed it (version check)
    this.doorRenderer.update(); // redraw closed-door panels from the sim's door state
    this.sea.update(dt); // the sea drifts even while paused/dead
    this.fx.update(dt);
    this.renderSys.update(dt);
    this.weaponSpriteSys.update(); // sprite weapons pin to the same grip anchor the body draw just used
    this.projectileRenderer.update(); // pin bullet sprites to shots in flight
    this.accessorySys.update();
    this.nameplateSys.update();
    this.stunIndicator.update(); // "Stunned" label over any stunned unit (after actors, drawn on top)
    this.inspectSys.update(); // publish the inspected unit's plate + selection ring (presentation-only)
    this.aimReticle.update(); // the '+' aim marker (after actors, so it draws on top)
    this.possessButton.update(); // debug possess: the "Control" button over the inspected unit
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
      this.swimSys.update(dt); // water upkeep AFTER movement sets mode/submerged: swim stamina, breath, drowning
      this.bodySys.update(); // resolve body-vs-body overlap (weighted) after movement integrates
      this.shipSys.update(dt); // integrate hulls + parent on-deck actors AFTER foot movement (deck position wins)
      this.hullSys.update(); // solid hull: push world walkers out of any ship (except the gangplank) + board handoff
      this.meleeSys.update(dt); // resolve active swings by contact against current positions
      this.projectileSys.update(dt); // travel + swept-contact resolve of shots in flight (after melee; a ball fired this tick starts moving next)
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
    // ONE view-model for the controlled unit — the same shape InspectSystem publishes for any clicked
    // unit, so the player HUD can never drift from the universal unit readout (the Moat at the UI layer)
    r.set(RegKey.Player, e ? unitPlateView(e) : null);
    if (e?.combatant) r.set(RegKey.Combo, e.combatant.combo);
    if (e?.loadout) {
      const lo = e.loadout;
      const entries = ([
        { key: 'LMB', id: lo.primary },
        { key: 'RMB', id: lo.heavy },
        { key: 'Q', id: lo.dash },
        { key: '1', id: lo.slots[0] },
        { key: '2', id: lo.slots[1] },
        { key: '3', id: lo.slots[2] },
      ] as Array<{ key: string; id?: string }>)
        .filter((x) => !!x.id && lo.granted.has(x.id))
        .map((x) => ({ key: x.key, id: x.id as string, cd: lo.cd.get(x.id as string) ?? 0, cdMax: lo.cdMax.get(x.id as string) ?? 0 }));
      r.set(RegKey.AbilityBar, entries);
    }
    r.set(RegKey.Prompt, this.dialogueSys.active || !e ? '' : this.interactionSys.prompt(e)); // hide while talking
    r.set(RegKey.Dialogue, this.dialogueSys.view());
    r.set(RegKey.Gold, this.director.gold);
    r.set(RegKey.State, this.director.state); // still drives the death/respawn card

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
