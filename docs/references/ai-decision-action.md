Unit layer — decisions that resolve into intents, then get executed (30)
Each of these is picked by the scoring engine as an intent, then handed to execution (animation/movement/hitbox). One pipeline, same event, two stages.
Universal (any style, 14)

rush_attack
retreat
wait
reposition
flee
flank
take_cover
focus_target
switch_target
feint
block_guard
throw_item
use_terrain_hazard
call_for_backup (a unit-level signal — see note below)

Sword-specific (6)
15. feint_attack
16. parry_riposte
17. lunge_thrust
18. sweep_low
19. guard_break
20. sheath_draw_strike
Gun-specific (5)
21. kite_shoot
22. reload_dodge
23. suppress_fire
24. aimed_shot
25. pistol_whip
Devil fruit (Flame, example — 5)
26. flame_burst
27. heat_wave
28. flame_dash
29. ignite_terrain
30. flame_shield

Command layer — orders that bias subordinate decisions, not actions themselves (7)
These don't move a body or play an animation directly. Each one is a squad/fleet-leader decision that gets injected as a weight adjustment into the units below, which then run their own unit-layer decide→execute pipeline as usual — just nudged.

hold_formation — dampens rush_attack/flank scores, boosts reposition toward staying grouped
order_focus_fire — heavily boosts focus_target toward one specified enemy, for every subordinate
order_flank_route — boosts flank for a subset of the squad, toward a specific side
order_regroup — boosts retreat/reposition toward a rally point
sacrifice_delay — for one designated unit, suppresses retreat/flee entirely and boosts block_guard/take_cover
request_reinforcement — not a bias at all, it's an escalation — sends a request up to the base/fleet layer (Layer 4/5), outside unit-level scoring entirely
feigned_retreat — temporarily boosts retreat scores squad-wide on a timer, then flips to boost rush_attack once bait conditions are met

