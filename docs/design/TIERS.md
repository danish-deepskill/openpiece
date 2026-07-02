# Power Tiers — Reference

The single power scale, weakest `F-` → strongest `SSS+`. Every letter (F E D C B A S SS SSS) has three
bands: `-`, base, `+` — 27 bands total. Tier is the dial that drives combat stats, nameplate color, and
(per the tables below) **bounty minimum** and **sea region**.

Designer source of truth. Code lives in `app/src/combat/PowerTier.ts`.

## Rank colors — implemented (`tierColor`)

The `-`/`+` bands share their letter's color.

| Letter | Color |
|---|---|
| F   | gray `#7c8085` |
| E   | gray `#a7adb3` |
| D   | light gray `#cfd4d8` |
| C   | green `#5ec84d` |
| B   | blue `#4a90e2` |
| A   | purple `#9b59f6` |
| S   | red `#ff4d4d` |
| SS  | orange `#ff8c1a` |
| SSS | gold `#ffd24a` |

## Sea regions

Everything is **Blue Sea**; the sub-regions, weakest → strongest. (F/E bands are pre-bounty / unbounty.)

| Region | Tier bands |
|---|---|
| Unbounty | F-, F, F+, E-, E, E+ |
| Quarter Sea (1/5) | D-, D, D+, C-, C |
| First Paradise (2/5) | C+, B-, B, B+ |
| Second Paradise (3/5) | A-, A, A+, S- |
| Beginning New World (4/5) | S, S+, SS-, SS |
| Final New World (5/5) | SS+, SSS-, SSS, SSS+ |

## Bounty minimum per tier

F/E bands are **Unbounty** (no bounty). Bountied tiers, ascending:

| Tier | Bounty min | Tier | Bounty min |
|---|---|---|---|
| D-  | 1,000   | A+   | 150,000 |
| D   | 1,500   | S-   | 250,000 |
| D+  | 2,500   | S    | 400,000 |
| C-  | 4,000   | S+   | 650,000 |
| C   | 6,500   | SS-  | 1,000,000 |
| C+  | 10,000  | SS   | 1,500,000 |
| B-  | 15,000  | SS+  | 2,500,000 |
| B   | 25,000  | SSS- | 4,000,000 |
| B+  | 40,000  | SSS  | 6,500,000 |
| A-  | 65,000  | SSS+ | 10,000,000 |
| A   | 100,000 |      |  |

> **Status:** `tierColor` and `tierStats` are live in code. `tierBounty(tier)` / `tierRegion(tier)` are
> not encoded yet — capture only for now. (Per design note: the original chart's 0–20 index and `M#/S#`
> codes are intentionally omitted.)
