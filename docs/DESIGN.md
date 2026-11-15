# Glidepost — Design

A 3D browser game about delivering parcels between floating islands on a small glider.
Flying is the game: it should feel good with nothing to do, and reward players who find
faster, riskier lines. Cosy to look at, sharp to play.

- **Platform:** browser, desktop first, no install, playable within a few seconds of opening the page.
- **Tone:** cosy world, arcade flying.
- **Touchstones:** instant-play browser shooters for the "one more run" loop and movement skill;
  hand-painted, low-poly exploration games for the mood.

This document is the source of truth for what gets built. The [prototype](#prototype) section is
the current target; everything under [Later](#later) is deliberately out of scope until the
prototype answers its question.

---

## Design pillars

1. **Energy is the whole game.** Height and speed are one currency. Every mechanic either trades
   one for the other or adds to the pot. Nothing else gives you speed for free.
2. **Risk buys time.** The safe line always works. The fast line is lower, closer to rock, and
   easier to crash on.
3. **Retry in one second.** A run is 20–40 seconds. Crashing costs a keypress, never a menu.
4. **Readable at a glance.** You can always see where you are going, where the lift is, and how
   much boost you have.

## Flight model

The glider always flies where its nose points. There is no engine.

| Rule | Effect |
| --- | --- |
| **Dive** | Nose down converts height into speed. |
| **Climb** | Nose up converts speed back into height. A fast dive followed by a pull-up recovers most of the height lost. |
| **Drag** | Grows with the square of speed, and gets worse in hard turns. This is the only thing that removes energy, so fast lines are expensive to hold. |
| **Stall** | Below stall speed the wing stops flying: the nose drops and the glider sinks until it picks up speed again. |
| **Airbrake** | Held, it multiplies drag. Used to set up landings and tight turns. |

In steady flight the glider covers roughly nine to ten metres for every metre it drops. The course
is laid out so that this is *not quite enough* to reach the destination from the launch deck: every
route has to find extra energy somewhere.

### Where extra energy comes from

Three sources, each with a different shape so they feel distinct:

| Source | Shape | Risk |
| --- | --- | --- |
| **Updrafts** | Slow and safe. A visible column of rising air over chimneys and waterfalls. Circle inside it to gain height. | None, but it costs time. |
| **Boost rings** | Instant. Each ring gives a speed kick. Hitting the next ring inside the chain window raises a multiplier, so a clean line through the whole course is worth far more than its parts. | Rings sit on the low, tight line. |
| **Wall-skimming** | Banked. Flying within a few metres of any surface charges the boost meter; closer and faster charges more. The meter is spent as thrust by holding boost. | Touching the surface is a crash. |

Rings do not fill the meter and skimming gives no instant speed. Rings reward precision *now*;
skimming rewards nerve and lets you choose *when* to cash it in.

## Controls

Keyboard alone is fully playable (many laptop players are on a trackpad). The mouse is the
higher-skill option.

| Action | Keys | Mouse |
| --- | --- | --- |
| Pitch | `W` dive / `S` pull up (or arrows) | Move up/down |
| Turn | `A` / `D` (or arrows) | Move left/right |
| Boost | `Space` | Left button |
| Airbrake | `Shift` | Right button |
| Launch | `Space` | Click |
| Restart | `R` | |

The mouse is **aim-style**: moving it sets where you want the nose to go, and the glider carves
towards that point at its own turn rate. A flick does not snap the glider around; it commits it to
a turn. Bank is automatic and visual.

## A delivery

1. **Launch.** You start on the launch deck of the post office with the parcel already on board.
   The clock starts the moment you leave the deck.
2. **Fly.** No fixed route. A beacon of light marks the destination from anywhere on the map.
3. **Land.** Touch down on the landing pad below the maximum landing speed. Too fast is a crash.
   Slowing down means pulling up to bleed speed (a flare) or using the airbrake. A touchdown well
   under the limit is a *perfect landing*.
4. **Result.** Your time, and your best time for the route (kept locally).

Failure states, all followed by an instant return to the launch deck:

- **Crash:** touching anything that is not the landing pad, or landing too fast.
- **Lost in the clouds:** dropping into the cloud sea beneath the islands.

## World

The full game is one cluster of 8–10 islands. The prototype has four, arranged to offer two clear
routes between the post office and the lighthouse:

| Island | Role |
| --- | --- |
| **Post office** | High start. Launch deck on a tower. |
| **Market town** | The safe route. Chimney updrafts carry you back up for the long glide to the lighthouse. |
| **Waterfall rock** | The fast route. A cliff face to skim, a ring line threaded past it, and a strong updraft in the mist at its base. |
| **Lighthouse** | Destination. Landing pad on a small plateau; the lighthouse itself is the landmark. |

Below everything is a sea of clouds. Above is a lot of open sky.

## Look, sound and feel

- Low-poly, flat-shaded, soft pastel palette, warm sun, distance haze.
- Camera sits behind the glider, widens its field of view with speed, and shakes slightly under boost.
- Wind noise rises with speed. Rings, boost, landing and crashing each have their own sound.
- All sound is synthesised; there are no audio files to download.

## Tech

- **Three.js + TypeScript, bundled with Vite.** No game engine, no physics engine.
- **Flight** is a small, pure function of state, input and timestep, covered by unit tests
  (energy never increases on its own; diving and climbing trade as designed; glide ratio stays in
  the band the level is built for).
- **World** is built from a handful of primitives (boxes, cones, cylinders, spheres). The same
  definitions produce both the meshes and an analytic distance function, so one query answers
  "did I crash?" and "how close am I skimming?".
- **Tuning** lives in a single config file: gravity, drag, turn rates, boost, rings, landing limits.
- **Targets:** 60 fps on a typical laptop, initial load well under five seconds.

---

## Prototype

One question: **is flying fun?**

In scope:

- Four islands, cloud sea, sky
- Flight model: glide, dive/climb trade, turning, stall, airbrake
- Three or more updrafts, visible in the world
- A ring line with chaining
- Wall-skim boost charging and the boost meter
- One timed delivery from the post office to the lighthouse, with landing
- HUD: speed, altitude, boost meter, timer, ring chain, distance to destination, best time
- Chase camera with speed-based field of view
- Keyboard and mouse controls, instant restart
- Synthesised wind and feedback sounds

Done when:

- It loads and runs in a browser with no install.
- A new player can launch, fly and complete the delivery within a couple of minutes.
- Diving and pulling up visibly trade speed and altitude.
- Updrafts, rings and skimming all work and feel different from one another.
- Crashes are clean: a short beat, then back on the launch deck.
- It holds a smooth frame rate on a typical laptop.
- Every flight tuning value is in one config file.

## Later

Roughly in the order they are worth building, each only if the one before it earned it:

1. **Ghosts.** Record the best run and race it. Cheap to build, and it makes a single route
   replayable for much longer.
2. **Parcel types.** *Heavy* (sinks faster), *fragile* (no skimming tolerance, gentle landing
   only), *urgent* (hard time limit). Each is a modifier on the flight config, not new systems.
3. **More islands and routes**, then chained deliveries where you plan the order.
4. **Daily route** with a global leaderboard, shared ghosts.
5. **Career**, weather (gusts, fog over updrafts, storms closing routes), day/night.
6. **Live multiplayer races.**

Two decisions already made for later:

- **Upgrades are sidegrades.** Wings trade glide ratio against turn rate rather than improving
  both, and leaderboard runs use a standard glider. Otherwise the daily route measures hours
  played, not skill.
- **Cosmetics never affect flight.** Paint, scarves, trails and hats only.
