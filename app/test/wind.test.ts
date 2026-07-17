import { describe, expect, it } from 'vitest';
import { sailCurveAt, ShipHulls } from '../src/defs/ships';
import { WindSystem } from '../src/systems/WindSystem';

/**
 * The wind is an EVALUATED FIELD, not a stepped simulation (SAILING_RESEARCH.md §1 / SEAMLESS_WORLD's
 * evaluated-not-ticked thesis): `at(x, y, t)` is a pure function of (seed, position, time). These tests ARE
 * that contract — if someone reintroduces hidden stepped state, the forecast test fails first.
 */

const SIM = 1 / 60;

describe('WindSystem — a pure field of (seed, position, time)', () => {
  it('EVALUATED, not ticked: sampling any t needs no stepping, and stepping never changes what t reads', () => {
    const a = new WindSystem(42);
    const forecast = a.at(0, 0, 777.5); // read the future the sim already knows — no simulation ran
    for (let i = 0; i < 600; i++) a.update(SIM); // now actually live through ten seconds…
    const again = a.at(0, 0, 777.5);
    expect(again.dir).toBe(forecast.dir); // …and the forecast is EXACTLY what that moment still reads
    expect(again.strength).toBe(forecast.strength);
    const fresh = new WindSystem(42); // a cold evaluator (the dehydrated ledger's view) agrees bit-for-bit
    expect(fresh.at(0, 0, 777.5).dir).toBe(forecast.dir);
    expect(fresh.at(0, 0, 777.5).strength).toBe(forecast.strength);
  });

  it('same seed ⇒ the same weather; a different seed diverges', () => {
    const a = new WindSystem(7);
    const b = new WindSystem(7);
    const c = new WindSystem(8);
    let diverged = false;
    for (let t = 0; t < 300; t += 1.7) {
      expect(a.at(0, 0, t)).toEqual(b.at(0, 0, t));
      diverged ||= a.at(0, 0, t).dir !== c.at(0, 0, t).dir;
    }
    expect(diverged).toBe(true);
  });

  it('the weather is WEATHER: strength stays in the everyday band and the vane never snaps', () => {
    const w = new WindSystem(11);
    let prev = w.at(0, 0, 0);
    for (let t = SIM; t < 300; t += SIM) {
      const cur = w.at(0, 0, t);
      expect(cur.strength).toBeGreaterThan(0.5); // calm-to-fresh band (gusts ride ±7% inside it)
      expect(cur.strength).toBeLessThan(1.05); // >1 is reserved for storm MODIFIERS (event director, later)
      expect(Math.abs(cur.dir - prev.dir)).toBeLessThan(0.03); // a veer is a swing over seconds, never a per-tick jump
      prev = cur;
    }
  });

  it('update() only advances the clock and refreshes the cached sample — no hidden draws', () => {
    const w = new WindSystem(5);
    w.update(2.5);
    expect(w.time).toBeCloseTo(2.5, 12);
    const direct = w.at(0, 0, 2.5);
    expect(w.dir).toBe(direct.dir);
    expect(w.strength).toBe(direct.strength);
  });
});

describe('sailCurveAt — the points-of-sail sampler', () => {
  it('oars are wind-independent: the flat curve reads 1 at every angle (the starter boat as DATA)', () => {
    const rowboat = ShipHulls.get('ship.rowboat');
    for (const a of [0, 0.4, Math.PI / 2, Math.PI, 5.1]) expect(sailCurveAt(rowboat, a)).toBe(1);
  });

  it('a square rig luffs dead upwind (the no-go) and pulls hardest on the broad reach', () => {
    const galleon = ShipHulls.get('ship.caravel');
    expect(sailCurveAt(galleon, 0)).toBe(0); // in irons
    expect(sailCurveAt(galleon, (120 * Math.PI) / 180)).toBe(1); // the broad reach IS maxSpeed
    expect(sailCurveAt(galleon, Math.PI)).toBeCloseTo(0.9, 6); // a dead run is good, not best
  });

  it('interpolates between buckets and folds port/starboard + wrapped angles to the same reading', () => {
    const caravel = ShipHulls.get('ship.sloop');
    expect(sailCurveAt(caravel, (15 * Math.PI) / 180)).toBeCloseTo(0.2, 6); // halfway through the 0→0.4 bucket
    const a = (40 * Math.PI) / 180;
    expect(sailCurveAt(caravel, -a)).toBeCloseTo(sailCurveAt(caravel, a), 12); // port tack = starboard tack
    expect(sailCurveAt(caravel, a + Math.PI * 2)).toBeCloseTo(sailCurveAt(caravel, a), 12); // wrap folds home
  });
});
