# Branch Animation — Technical Documentation

## Overview

An infinite loop animation of 4 branches (ramo1–ramo4) with circular endpoints (palla1–palla4) that swing from side to side with varying oscillation. The branches are paths imported from `logo.svg` and animated using Paper.js.

## File Structure

- `index.html` — Entry point. Loads Paper.js CDN, then `branch-animation.js`, then `logo.js`.
- `logo.js` — Imports `logo.svg` via Paper.js, scales it to fit the canvas, and starts the animation by calling `startBranchAnimations(logoItem)`.
- `branch-animation.js` — All animation logic.

## The SVG (`logo.svg`)

The logo is a tree-like structure with:

| Branch ID | Class | Stroke Width | Direction from center |
|-----------|-------|-------------|----------------------|
| `ramo1` | cls-1 | 5.61px | Left |
| `ramo2` | cls-4 | 5.77px | Upper-left |
| `ramo3` | cls-3 | 5.75px | Upper-right |
| `ramo4` | cls-2 | 5.83px | Right |

Each branch has a corresponding circular endpoint (`palla1`–`palla4`). An unpaired `palla5` sits at the center.

In the animation, all branch strokes are set to `strokeWidth = 14` with `strokeScaling = false` to maintain visual thickness regardless of canvas scaling.

## Architecture

### Constants (top of file)

| Constant | Value | Description |
|----------|-------|-------------|
| `INTRO_DURATION` | 2.8 | Duration of intro/outro swing phases (seconds) |
| `HOLD_DURATION` | 3.0 | Duration of center hold oscillation (seconds) |
| `HOLD_FADE_IN` | 0.5 | Fade-in time for hold oscillation amplitude |
| `HOLD_FADE_OUT` | 0.5 | Fade-out time for hold oscillation amplitude |
| `HOLD_ROTATION_SWING` | 2.2 | Max rotation amplitude of oscillation (degrees) |
| `HOLD_REFLECT_SWING` | 0.05 | Max reflection amplitude of oscillation |
| `HOLD_ROTATION_SPEED` | 0.75 | Frequency of rotation oscillation |
| `HOLD_REFLECT_SPEED` | 0.95 | Frequency of reflection oscillation |
| `HOLD_PHASE_STEP` | 0.7 | Phase offset difference between consecutive branches |
| `PAUSE_DURATION` | 3.0 | Duration of pause at extreme positions (seconds) |
| `SETTLE_DURATION` | 0.25 | Duration of settle phase |
| `OUTRO_DURATION` | 2.8 | Same as INTRO_DURATION |
| `OUTRO_BLEND` | 0.55 | Smoothstep blend time for outro ramp |
| `REFLECT_MID` | 0.5 | Mid-point reflection amount |
| `MICRO_AMP_SWING` | 0.12 | Micro-oscillation amplitude during swing phases |
| `MICRO_AMP_PAUSE` | 0.30 | Micro-oscillation amplitude during pause phases |
| `AXIS_ANGLE_LEFT` | 180° | Target angle for "left" position |
| `AXIS_ANGLE_RIGHT` | 0° | Target angle for "right" position |

### Snapshot & Restore System

Because Paper.js paths are modified in-place, the animation snapshots each branch's original geometry at creation time:

- `snapshotPath(path)` — Clones the path's matrix and all segment points/handles.
- `restorePath(path, snapshot)` — Restores the path to its snapshot before applying transformations each frame.
- `lowestPivotInParent(path, segments)` — Finds the lowest endpoint to use as rotation pivot in parent coordinates.

This ensures transformations are applied from a clean base state every frame.

### Branch Reflection

The branches don't just rotate — they also "reflect" (mirror across their chord) by a certain amount. This creates a subtle bending/origami-like effect.

- `applyBranchReflection(path, segmentSnapshot, amount)` — Lerps each point between its original position and its reflection across the branch's chord line (anchorA–anchorB). Amount ranges from 0 (original) to 1 (fully mirrored).

### Rotation Computation

- `computeRotationForAxis(segmentSnapshot, targetAngle)` — Calculates the rotation needed to make the branch's axis (vector from its lowest point to highest point) align with `targetAngle` (AXIS_ANGLE_LEFT = 180° or AXIS_ANGLE_RIGHT = 0°).
- `normalizeAngle(delta)` — Keeps angles in the range (-180°, 180°].

### Per-Branch Animator (`createBranchAnimator`)

Each branch gets its own animator instance with:

- **Snapshotted geometry** (ramo, palla paths)
- **Pre-computed rotation targets** (`rotationToLeft`, `rotationToRight`)
- **Pivot point** (lowest point of the branch)
- **Phase offset** (staggered per branch via `index * HOLD_PHASE_STEP`)
- **Swing multiplier** (controls oscillation amplitude per branch)

*Swing multiplier by branch index:*

| Index | Branch | Swing Multiplier |
|-------|--------|-----------------|
| 0 | ramo1 (outer left) | 0.5× |
| 1 | ramo2 (inner left) | 2.5× |
| 2 | ramo3 (inner right) | 2.5× |
| 3 | ramo4 (outer right) | 0.5× |

#### The `microOsc` Function — Core Innovation

All oscillation across ALL phases uses a single, continuous time counter (`totalTime`):

```
microOsc(totalTime, amplitude) → { rot, ref }
```

- `rot = sin(totalTime * HOLD_ROTATION_SPEED + phaseOffset) * HOLD_ROTATION_SWING * amplitude * swingMultiplier`
- `ref = ((sin(totalTime * HOLD_REFLECT_SPEED + phaseOffset * 1.3) + 1) / 2) * HOLD_REFLECT_SWING * amplitude * swingMultiplier`

**Key property**: `totalTime` is the time since the animation STARTED, NOT since the current phase started. This means the sin wave is always continuous across phase transitions — there is never a phase reset that causes a discontinuity.

#### Animator Methods

| Method | Parameters | Main Motion | Micro-oscillation amplitude |
|--------|-----------|-------------|-----------------------------|
| `applyIntro` | progress, reverse, totalTime | `rotationToLeft → 0` (or reverse) | `MICRO_AMP_SWING` (0.12) |
| `applyHold` | elapsed, fade, totalTime | `0` (center) | Blends `MICRO_AMP_SWING → 1.0 → MICRO_AMP_SWING` via `holdFade` |
| `applySettle` | totalTime | `0` | `MICRO_AMP_SWING` (0.12) |
| `applyPauseOutro` | totalTime | `rotationToRight` | `MICRO_AMP_PAUSE` (0.30) |
| `applyPauseIntro` | totalTime | `rotationToLeft` | `MICRO_AMP_PAUSE` (0.30) |
| `applyOutro` | progress, elapsed, reverse, totalTime | `0 → rotationToRight` (or reverse) | `MICRO_AMP_SWING` (0.12) |

The micro-oscillation is **always added on top** of the main rotation/reflection. There is never a frame where `microOsc` is not called, ensuring continuous motion.

### Phase State Machine (`startBranchAnimations`)

The animation is a state machine that cycles through phases bidirectionally:

```
Forward (isReversed = false):
  intro → hold → settle → outro → pauseOutro → [flip] →

Reverse (isReversed = true):
  outro → settle → hold → intro → pauseIntro → [unflip] → repeat
```

| Phase | Branch Position | Movement | Duration |
|-------|----------------|----------|----------|
| `intro` | `rotationToLeft → 0` | Main swing with easeInOutCubic + micro-oscillation (12%) | 2.8s |
| `hold` | `0` | Micro-oscillation amplitude ramps from 12% → 100% → 12% (via holdFade) | 3.0s |
| `settle` | `0` | Micro-oscillation at 12% (no longer zero/static) | 0.25s |
| `outro` | `0 → rotationToRight` | Main swing with easeInOutCubic + ramp + micro-oscillation (12%) | 2.8s |
| `pauseOutro` | `rotationToRight` | Micro-oscillation at 30% (constant, no fade) | 3.0s |
| — flip — | | | |
| `outro` (rev) | `rotationToRight → 0` | Reverse swing | 2.8s |
| `settle` (rev) | `0` | Micro-oscillation at 12% | 0.25s |
| `hold` (rev) | `0` | Micro-oscillation ramp | 3.0s |
| `intro` (rev) | `0 → rotationToLeft` | Reverse swing | 2.8s |
| `pauseIntro` | `rotationToLeft` | Micro-oscillation at 30% (constant, no fade) | 3.0s |
| — unflip — | | | |

#### State Transition (`advancePhase`)

Called when a phase completes. It resets `phaseStartTime` to the current event time and calls `runPhase(0, 0, totalTime)` to render the first frame of the new phase.

The `totalTime` parameter is NEVER reset — it keeps increasing from the original `animationStartTime`.

#### Main Loop

The returned function is Paper.js's `onFrame` handler. Each frame it:

1. Computes `elapsed = event.time - phaseStartTime` (time in current phase)
2. Computes `totalTime = event.time - animationStartTime` (time since animation start)
3. Based on `phase`, computes progress and calls `runPhase`
4. If the phase duration has elapsed, calls `advancePhase`

### Easing Functions

- `easeInOutCubic(t)` — Standard cubic ease for smooth acceleration/deceleration of main swings.
- `smoothstep(edge0, edge1, x)` — Hermite smoothstep for the outro ramp (blend at boundaries).
- `holdFade(elapsed)` — Linear fade-in/fade-out for hold oscillation amplitude (0→1→0).

### Continuous Flow Design

The key design decisions for eliminating abrupt transitions:

1. **Single `totalTime` counter** for all oscillation — The sin wave is phase-continuous because it's based on a monotonically increasing counter. Phase transitions don't reset the oscillation.

2. **Micro-oscillation always active** — Every phase applies `microOsc()` at some amplitude. There is no frame where the branches are perfectly still.

3. **Amplitude envelope bridging** — The hold phase's amplitude starts at `MICRO_AMP_SWING` (matching the preceding intro) and smoothly ramps to full 1.0, then back down. This creates a seamless amplitude transition at both boundaries.

4. **Pause phases have constant oscillation** — No fade-in/out on pause oscillations, just a steady gentle sway at 30% amplitude.

5. **Settle retains micro-movement** — Unlike a traditional "settle" that snaps to exact 0, this settle includes the 12% micro-oscillation.

## Summary of Complete Cycle Timing

1. Intro: 2.8s
2. Hold: 3.0s
3. Settle: 0.25s
4. Outro: 2.8s
5. PauseOutro: 3.0s
6. Outro (rev): 2.8s
7. Settle: 0.25s
8. Hold: 3.0s
9. Intro (rev): 2.8s
10. PauseIntro: 3.0s

**Total: ~23.7s per full cycle**
