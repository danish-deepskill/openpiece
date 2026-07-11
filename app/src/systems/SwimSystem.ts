import { BREATH_DRAIN, BREATH_REFILL, DROWN_DAMAGE, DROWN_INTERVAL, MAX_BREATH, SWIM_STAM_DRAIN } from '../config/constants';
import { SWIM_BREATH_STAT, SWIM_STAM_STAT } from '../defs/traits';
import type { World } from '../ecs/World';
import type { Damage } from './Damage';

/**
 * Water upkeep (docs/design/MOVEMENT_AIR.md) — the two-resource swim/dive loop, per tick:
 *   SURFACE SWIM (mode 'swim', not submerged): drains STAMINA (swimming is exertion, like sprint/Geppo). When
 *     stamina hits 0 you SINK — go submerged.
 *   SUBMERGED (underwater): drains BREATH (a distinct resource — the underwater clock, the foundation for a
 *     future dive mode + underwater combat). Empty breath = DROWNING (health damage). You SURFACE (clear
 *     submerged) once stamina has recovered enough to swim again.
 *   ON LAND / not swimming: breath refills.
 * Keeps ALL the water-resource rules in ONE place — the mode/submerged flags are set elsewhere (MovementSystem
 * transitions, the dive toggle); this only spends/refills the resources they gate.
 */
export class SwimSystem {
  constructor(
    private readonly world: World,
    private readonly damage: Damage, // drown ticks go through the ONE hit path (a clean "−N" popup + death handling)
  ) {}

  update(dt: number): void {
    for (const e of this.world.with('mover', 'combatant')) {
      const m = e.mover!;
      const c = e.combatant!;
      // GREAT SWIMMER trait: a bigger breath pool + slower breath drain + less stamina drain. breathMul scales
      // the POOL up and the DRAIN down (1/mul) — the same knob makes long-breath dives. Spawned StatBlocks seed
      // multiplier stats at base 1 (MULTIPLIER_STAT_SEEDS); ?? 1 covers only an attribute-less body.
      const breathMul = e.attributes?.get(SWIM_BREATH_STAT) ?? 1;
      const stamMul = e.attributes?.get(SWIM_STAM_STAT) ?? 1;
      c.maxBreath ??= MAX_BREATH * breathMul;
      c.breath ??= c.maxBreath;

      // The resource drain keys on the SWIM mode, which is now TRUTHFUL — MovementSystem derives it from the tile
      // you're actually over (deep Water ⇒ swim), so it's exactly "in deep water". No separate depth re-check.
      if (m.mode !== 'swim') {
        // wading shallows / on land → not truly swimming: breath recovers, never submerged
        m.submerged = false;
        c.breath = Math.min(c.maxBreath, c.breath + BREATH_REFILL * dt);
        continue;
      }

      if (!m.submerged) {
        // SURFACE SWIM — pay stamina to keep afloat; run dry → SINK (involuntary submerge). Breathing up top.
        c.stam = Math.max(0, c.stam - SWIM_STAM_DRAIN * stamMul * dt); // a great swimmer barely tires (stamMul < 1)
        c.regenT = Math.max(c.regenT ?? 0, 0.2); // hold off stamina regen while actively swimming
        if (c.stam <= 0) m.submerged = true; // sank
        else c.breath = Math.min(c.maxBreath, c.breath + BREATH_REFILL * dt);
      } else {
        // SUBMERGED (a DIVE toggle, or a sink) — hold your breath. Empty → drown. Stamina is FROZEN underwater
        // (regenT held) — being under holding your breath is NOT rest, and letting it regen created a perpetual
        // cycle (surface drains stam/refills breath → sink → submerged regens stam/drains breath → gasp up →
        // repeat forever, never dying). Freezing it means a unit that SANK from exhaustion (stam 0) stays at 0,
        // can't meet the gasp condition, and actually DROWNS. GASP: surface if breath is nearly gone AND you have
        // stamina to swim up (a deliberate dive with spare stamina); an exhausted sinker has none, so it drowns.
        c.regenT = Math.max(c.regenT ?? 0, 0.2); // hold stamina regen off while under (no resting while drowning)
        c.breath = Math.max(0, c.breath - (BREATH_DRAIN / breathMul) * dt); // a great swimmer holds their breath far longer (drain ÷ breathMul)
        // DROWNING — a DISCRETE tick, not a per-frame slide: once breath is empty, count down DROWN_INTERVAL and
        // then deal ONE DROWN_DAMAGE hit through the normal Damage path (a clean "−12" popup + death handling),
        // instead of a fractional drain that made the integer HP counter step 1-by-1 rapidly. Reads as a clear
        // per-second chunk of drowning damage. (Damage.apply respects godMode/iframes; GameDirector handles death.)
        if (c.breath <= 0) {
          let dT = (c.drownT ?? 0) <= 0 ? DROWN_INTERVAL : c.drownT!; // just ran out of air → wait a FULL interval before the first hit
          dT -= dt;
          if (dT <= 0) {
            dT = DROWN_INTERVAL; // re-arm for the next tick
            this.damage.apply(e, DROWN_DAMAGE, 0, 0, false, true); // one whole hit — TRUE damage (ignores def/i-frames: you can't armor drowning)
          }
          c.drownT = dT;
        } else {
          c.drownT = 0; // still have air → no drown clock running
        }
        if (c.breath <= c.maxBreath * 0.1 && c.stam > 0) m.submerged = false; // gasp up if you can still swim
      }
    }
  }
}
