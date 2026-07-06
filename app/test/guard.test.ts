import { describe, expect, it } from 'vitest';
import { Abilities } from '../src/combat/Ability';
import { giveWeapon } from '../src/combat/equip';
import {
  GUARD_BREAK_STUN,
  PARRY_GRACE,
  PARRY_POSTURE,
  PARRY_STUN,
  POSTURE_REGEN,
  tryGuard,
  WEIGHT_POSTURE,
} from '../src/combat/guard';
import { Rng } from '../src/core/Rng';
import type { Entity } from '../src/ecs/components';
import { Spawner } from '../src/ecs/Spawner';
import { World } from '../src/ecs/World';
import { AbilitySystem } from '../src/systems/AbilitySystem';
import { CombatantSystem } from '../src/systems/CombatantSystem';
import { Damage } from '../src/systems/Damage';
import { EffectSystem } from '../src/systems/EffectSystem';
import { StrikeResolver } from '../src/systems/StrikeResolver';

const SLASH = Abilities.get('ability.swordSlash1'); // in the sword's kit → HEAVY weight vs a guard
const PUNCH = Abilities.get('ability.punch'); // NOT in the sword's kit → bare (light) weight even while armed

/** Attacker (sworded hero) squared up against a defender (thug) 30px east — the defender faces the blow. */
function duel() {
  const world = new World();
  const sp = new Spawner(world, new Rng(7));
  const attacker = sp.spawnHero(30, 0);
  giveWeapon(attacker, 'weapon.sword');
  const defender = sp.spawnUnit('unit.thug', 0, 0); // bandits — mutually hostile with the hero
  giveWeapon(defender, 'weapon.sword'); // ARMED so it can PARRY (parry now requires a weapon; unarmed is block-only)
  defender.transform!.angle = 0; // facing the attacker: the incoming blow is inside the guard arc
  const strikes = new StrikeResolver(new Damage(), new Rng(1));
  return { world, attacker, defender, strikes };
}

/** A live swing for the attacker (so a parry has something to interrupt / a feint something to cancel). */
function midSwing(e: Entity, t = 0.05): void {
  e.melee = { ability: SLASH.id, t, dur: 0.6, motion: 'arc', phases: { windup: 0.38, active: 0.34, recover: 0.28 }, side: 1, angle: Math.PI, hitByVolume: [] };
}

describe('guard is a CAPABILITY — the granted ability, not a hardcoded flag (the Moat)', () => {
  it('a fighter is granted block + parry (in loadout.granted); tryGuard works', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(1));
    const fighter = sp.spawnUnit('unit.thug', 0, 0);
    expect(fighter.loadout!.granted.has('ability.block')).toBe(true);
    expect(fighter.loadout!.granted.has('ability.parry')).toBe(true);
    expect(tryGuard(fighter)).toBe(true);
    expect(fighter.combatant!.blocking).toBe(true);
  });

  it('a non-fighter (noGuard) is NOT granted the guard verbs; tryGuard refuses', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(1));
    const villager = sp.spawnUnit('unit.villager', 0, 0);
    expect(villager.loadout!.granted.has('ability.block')).toBe(false);
    expect(tryGuard(villager)).toBe(false); // no capability → cannot raise a guard
    expect(villager.combatant!.blocking ?? false).toBe(false);
  });

  it('block WITHOUT parry granted: tryGuard raises the block but opens NO parry window', () => {
    const world = new World();
    const sp = new Spawner(world, new Rng(1));
    const e = sp.spawnUnit('unit.thug', 0, 0);
    e.loadout!.granted.delete('ability.parry'); // block-capable, parry-incapable
    expect(tryGuard(e, true)).toBe(true); // asks for a parry…
    expect(e.combatant!.blocking).toBe(true); // …gets a block
    expect(e.combatant!.parryT ?? 0).toBe(0); // but NO parry window (lacks the grant)
  });

  it('the incapable defender takes a clean hit (guard never engages)', () => {
    const { attacker, defender, strikes } = duel();
    defender.loadout!.granted.delete('ability.block'); // strip the capability
    defender.loadout!.granted.delete('ability.parry');
    tryGuard(defender); // no-op now
    const hp = defender.health!.hp;
    strikes.hit(attacker, defender, SLASH, 10, 0, 0);
    expect(defender.health!.hp).toBeLessThan(hp); // lands clean — no guard to reroute it
  });
});

describe('parry — a timed deflection that punishes the attacker', () => {
  it('negates the hit, spikes + staggers the attacker, interrupts their swing, re-arms the defender', () => {
    const { attacker, defender, strikes } = duel();
    midSwing(attacker);
    expect(tryGuard(defender)).toBe(true); // the tap: parry window opens (+ blocking held)
    const hp = defender.health!.hp;
    expect(strikes.hit(attacker, defender, SLASH, 10, 0, 0)).toBe(false); // deflected — nothing landed
    expect(defender.health!.hp).toBe(hp); // fully negated
    expect(attacker.melee).toBeUndefined(); // the swing died on the deflection
    expect(attacker.combatant!.stunT).toBeGreaterThanOrEqual(PARRY_STUN); // the punish opening
    expect(attacker.combatant!.posture).toBe(PARRY_POSTURE); // parry pressure banks on the aggressor
    expect(defender.combatant!.parryT).toBeCloseTo(PARRY_GRACE, 5); // auto-parry grace vs strings
    expect(defender.combatant!.parryCd).toBe(0); // success re-arms instantly — only a whiff pays
    expect(attacker.combatant!.combo).toBe(0); // a deflected cut feeds no combo
  });

  it('with the back turned, the same parry window catches NOTHING (guards are directional)', () => {
    const { attacker, defender, strikes } = duel();
    tryGuard(defender);
    defender.transform!.angle = Math.PI; // spun away — the blow arrives from the open rear arc
    const hp = defender.health!.hp;
    strikes.hit(attacker, defender, SLASH, 10, 0, 0);
    expect(defender.health!.hp).toBeLessThan(hp); // lands clean — flanking beats every guard
  });
});

describe('tryGuard parry flag — block and parry are distinct (the AI block-decision bug)', () => {
  it('tryGuard(e, false) raises a PURE block — no parry window armed', () => {
    const { defender } = duel();
    expect(tryGuard(defender, false)).toBe(true);
    expect(defender.combatant!.blocking).toBe(true);
    expect(defender.combatant!.parryT ?? 0).toBe(0); // a rolled BLOCK must NOT smuggle in a free parry window
  });

  it('tryGuard(e, true) — the player F tap — DOES arm the parry window', () => {
    const { defender } = duel(); // duel()'s defender is ARMED (a sword)
    expect(tryGuard(defender, true)).toBe(true);
    expect(defender.combatant!.blocking).toBe(true);
    expect(defender.combatant!.parryT).toBeGreaterThan(0);
  });

  it('UNARMED can BLOCK but NOT parry — a bare fist deflects nothing (parry requires a weapon)', () => {
    const world = new World();
    const fists = new Spawner(world, new Rng(2)).spawnUnit('unit.thug', 0, 0); // no weapon (style.brawl)
    expect(tryGuard(fists, true)).toBe(true); // the F tap raises the guard…
    expect(fists.combatant!.blocking).toBe(true); // …block is up
    expect(fists.combatant!.parryT ?? 0).toBe(0); // …but NO parry window (unarmed)
  });

  it('a pure-block defender BLOCKS an incoming hit (never parries it)', () => {
    const { attacker, defender, strikes } = duel();
    defender.combatant!.maxPosture = 100;
    midSwing(attacker);
    tryGuard(defender, false); // rolled block
    const hp = defender.health!.hp;
    strikes.hit(attacker, defender, SLASH, 10, 0, 0);
    expect(defender.health!.hp).toBe(hp); // no HP damage (it's a block)…
    expect(defender.combatant!.posture).toBe(WEIGHT_POSTURE.heavy); // …posture climbed (block), not a parry
    expect(attacker.melee).toBeDefined(); // and the attacker was NOT interrupted — a parry would have cancelled it
  });
});

describe('block — HP rerouted to posture, by the attacker\'s WEIGHT', () => {
  it('a blocked hit deals no HP damage; posture climbs by the weight rung (kit rule: a punch while armed is a bare light hit)', () => {
    const { attacker, defender, strikes } = duel();
    defender.combatant!.maxPosture = 100; // isolate WEIGHT scaling — a big pool so neither block breaks the guard
    defender.combatant!.blocking = true; // holding (no parry window)
    const hp = defender.health!.hp;
    expect(strikes.hit(attacker, defender, SLASH, 10, 0, 0)).toBe(false);
    expect(defender.health!.hp).toBe(hp);
    expect(defender.combatant!.posture).toBe(WEIGHT_POSTURE.heavy); // the sword crushes guards…
    strikes.hit(attacker, defender, PUNCH, 10, 0, 0);
    expect(defender.combatant!.posture).toBe(WEIGHT_POSTURE.heavy + WEIGHT_POSTURE.light); // …the bare fist rattles them (weaponless → light)
  });

  it('posture overflow = GUARD BREAK: long stagger, guard down, posture reset', () => {
    const { attacker, defender, strikes } = duel();
    const c = defender.combatant!;
    c.blocking = true;
    c.posture = c.maxPosture - 1; // one heavy hit from the brink
    strikes.hit(attacker, defender, SLASH, 10, 0, 0);
    expect(c.blocking).toBe(false); // arms blown open
    expect(c.posture).toBe(0);
    expect(c.stunT).toBeGreaterThanOrEqual(GUARD_BREAK_STUN); // the price of turtling
  });
});

describe('feint — raising the guard during your OWN windup pulls the swing', () => {
  it('cancels a windup; refuses once the cut is committed (active/recover)', () => {
    const { attacker } = duel();
    midSwing(attacker, 0.05); // p ≈ 0.08 — still winding up
    expect(tryGuard(attacker)).toBe(true);
    expect(attacker.melee).toBeUndefined(); // the tell was shown, the cut never came
    expect(attacker.combatant!.blocking).toBe(true);
    attacker.combatant!.blocking = false;
    midSwing(attacker, 0.3); // p = 0.5 — the blade is travelling
    expect(tryGuard(attacker)).toBe(false); // committed: no guard, no cancel
    expect(attacker.melee).toBeDefined();
  });

  it('attacking DROPS the guard (the mirror rule) — no free deflection smuggled into a swing', () => {
    const world = new World();
    const hero = new Spawner(world, new Rng(3)).spawnHero(0, 0);
    giveWeapon(hero, 'weapon.sword'); // armed → the parry window arms (parry now requires a weapon)
    const abilities = new AbilitySystem(world, new EffectSystem(world), {} as StrikeResolver, new Rng(3));
    tryGuard(hero);
    expect(hero.combatant!.parryT).toBeGreaterThan(0);
    expect(abilities.activate(hero, 'ability.punch')).toBe(true);
    expect(hero.combatant!.blocking).toBe(false);
    expect(hero.combatant!.parryT).toBe(0); // the window died with the guard
  });
});

describe('posture upkeep (CombatantSystem)', () => {
  it('recovers only while the guard is DOWN', () => {
    const world = new World();
    const e = new Spawner(world, new Rng(1)).spawnHero(0, 0);
    const c = e.combatant!;
    const sys = new CombatantSystem(world);
    c.posture = 10;
    c.blocking = true;
    sys.update(0.5);
    expect(c.posture).toBe(10); // banked while holding — turtling never heals
    c.blocking = false;
    sys.update(0.5);
    expect(c.posture).toBeCloseTo(10 - POSTURE_REGEN * 0.5, 5);
  });

  it('ticks the parry window shut and the whiff cooldown down', () => {
    const world = new World();
    const e = new Spawner(world, new Rng(1)).spawnHero(0, 0);
    giveWeapon(e, 'weapon.sword'); // armed → parry window opens (parry requires a weapon)
    tryGuard(e);
    const sys = new CombatantSystem(world);
    sys.update(0.3); // > PARRY_WINDOW
    expect(e.combatant!.parryT).toBe(0); // the tap's window closed — now it's just a block
    expect(e.combatant!.parryCd).toBeGreaterThan(0); // the whiff is re-arming
  });
});
