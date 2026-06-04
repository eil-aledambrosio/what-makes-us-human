const BRANCH_PAIRS = [
  { ramo: 'ramo1', palla: 'palla1' },
  { ramo: 'ramo2', palla: 'palla2' },
  { ramo: 'ramo3', palla: 'palla3' },
  { ramo: 'ramo4', palla: 'palla4' },
];

const INTRO_DURATION = 2.8;
const HOLD_DURATION = 3.0;
const HOLD_FADE_IN = 0.5;
const HOLD_FADE_OUT = 0.5;
const HOLD_ROTATION_SWING = 2.2;
const HOLD_REFLECT_SWING = 0.05;
const HOLD_ROTATION_SPEED = 0.75;
const HOLD_REFLECT_SPEED = 0.95;
const HOLD_PHASE_STEP = 0.7;
const PAUSE_DURATION = 3.0;
const SETTLE_DURATION = 0.25;
const OUTRO_DURATION = 2.8;
const OUTRO_BLEND = 0.55;
const REFLECT_MID = 0.5;
const MICRO_AMP_SWING = 0.12;
const MICRO_AMP_PAUSE = 0.30;
const AXIS_ANGLE_LEFT = 180;
const AXIS_ANGLE_RIGHT = 0;

function findItemByName(item, name) {
  if (item.name === name) return item;
  if (!item.children) return null;
  for (let i = 0; i < item.children.length; i += 1) {
    const found = findItemByName(item.children[i], name);
    if (found) return found;
  }
  return null;
}

function snapshotSegment(segment) {
  return {
    point: segment.point.clone(),
    handleIn: segment.handleIn.clone(),
    handleOut: segment.handleOut.clone(),
  };
}

function snapshotPath(path) {
  return {
    matrix: path.matrix.clone(),
    segments: path.segments.map(snapshotSegment),
  };
}

function restorePath(path, snapshot) {
  path.matrix.set(snapshot.matrix);
  path.segments.forEach((segment, index) => {
    const original = snapshot.segments[index];
    segment.point = original.point.clone();
    segment.handleIn = original.handleIn.clone();
    segment.handleOut = original.handleOut.clone();
  });
}

function lowestPivotInParent(path, segmentSnapshot) {
  const first = segmentSnapshot[0].point;
  const last = segmentSnapshot[segmentSnapshot.length - 1].point;
  const lowest = first.y >= last.y ? first : last;
  return path.localToParent(lowest);
}

function normalizeAngle(delta) {
  let angle = delta % 360;
  if (angle > 180) angle -= 360;
  if (angle < -180) angle += 360;
  return angle;
}

function computeRotationForAxis(segmentSnapshot, targetAngle) {
  const first = segmentSnapshot[0].point;
  const last = segmentSnapshot[segmentSnapshot.length - 1].point;
  const pivot = first.y >= last.y ? first : last;
  const other = first.y >= last.y ? last : first;
  const axis = other.subtract(pivot);
  if (axis.length < 1e-6) return 0;
  return normalizeAngle(targetAngle - axis.angle);
}

function reflectPoint(point, lineStart, lineEnd) {
  const chord = lineEnd.subtract(lineStart);
  if (chord.length < 1e-6) return point.clone();
  const dir = chord.normalize();
  const projected = lineStart.add(
    dir.multiply(point.subtract(lineStart).dot(dir))
  );
  return projected.multiply(2).subtract(point);
}

function lerpPoint(from, to, amount) {
  return from.add(to.subtract(from).multiply(amount));
}

function applyBranchReflection(path, segmentSnapshot, amount) {
  const anchorA = segmentSnapshot[0].point;
  const anchorB = segmentSnapshot[segmentSnapshot.length - 1].point;

  path.segments.forEach((segment, index) => {
    const original = segmentSnapshot[index];
    const absPoint = original.point;
    const absHandleIn = original.point.add(original.handleIn);
    const absHandleOut = original.point.add(original.handleOut);

    const reflectedPoint = reflectPoint(absPoint, anchorA, anchorB);
    const reflectedHandleIn = reflectPoint(absHandleIn, anchorA, anchorB);
    const reflectedHandleOut = reflectPoint(absHandleOut, anchorA, anchorB);

    const point = lerpPoint(absPoint, reflectedPoint, amount);
    const handleInAbs = lerpPoint(absHandleIn, reflectedHandleIn, amount);
    const handleOutAbs = lerpPoint(absHandleOut, reflectedHandleOut, amount);

    segment.point = point;
    segment.handleIn = handleInAbs.subtract(point);
    segment.handleOut = handleOutAbs.subtract(point);
  });
}

function applyBranchState(ramo, palla, ramoSnapshot, pallaSnapshot, pivot, rotation, reflectAmount) {
  restorePath(ramo, ramoSnapshot);
  restorePath(palla, pallaSnapshot);
  applyBranchReflection(ramo, ramoSnapshot.segments, reflectAmount);
  if (rotation !== 0) {
    ramo.rotate(rotation, pivot);
    palla.rotate(rotation, pivot);
  }
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createBranchAnimator(ramo, palla, phaseOffset, swingMultiplier) {
  const ramoSnapshot = snapshotPath(ramo);
  const pallaSnapshot = snapshotPath(palla);
  const rotationToLeft = computeRotationForAxis(
    ramoSnapshot.segments,
    AXIS_ANGLE_LEFT
  );
  const rotationToRight = computeRotationForAxis(
    ramoSnapshot.segments,
    AXIS_ANGLE_RIGHT
  );

  restorePath(ramo, ramoSnapshot);
  const pivot = lowestPivotInParent(ramo, ramoSnapshot.segments);

  const apply = (rotation, reflectAmount) => {
    applyBranchState(
      ramo,
      palla,
      ramoSnapshot,
      pallaSnapshot,
      pivot,
      rotation,
      reflectAmount
    );
  };

  const microOsc = (totalTime, amplitude) => {
    const rot = Math.sin(totalTime * HOLD_ROTATION_SPEED + phaseOffset) *
      HOLD_ROTATION_SWING * amplitude * swingMultiplier;
    const ref = ((Math.sin(totalTime * HOLD_REFLECT_SPEED + phaseOffset * 1.3) + 1) / 2) *
      HOLD_REFLECT_SWING * amplitude * swingMultiplier;
    return { rot, ref };
  };

  return {
    applyIntro(progress, reverse, totalTime) {
      const eased = easeInOutCubic(progress);
      let mainRot, mainRef;
      if (!reverse) {
        mainRot = rotationToLeft * (1 - eased);
        mainRef = REFLECT_MID * (1 - eased);
      } else {
        mainRot = rotationToLeft * eased;
        mainRef = REFLECT_MID * eased;
      }
      let amp = MICRO_AMP_SWING;
      if (!reverse) {
        const blend = smoothstep(0, 0.5, progress * INTRO_DURATION);
        amp = MICRO_AMP_PAUSE + (MICRO_AMP_SWING - MICRO_AMP_PAUSE) * blend;
      } else {
        const remaining = (1 - progress) * INTRO_DURATION;
        const blend = smoothstep(0, 0.5, remaining);
        amp = MICRO_AMP_SWING + (MICRO_AMP_PAUSE - MICRO_AMP_SWING) * (1 - blend);
      }
      const micro = microOsc(totalTime, amp);
      apply(mainRot + micro.rot, mainRef + micro.ref);
    },
    applyHold(elapsed, fade, totalTime) {
      const amplitude = MICRO_AMP_SWING + (1 - MICRO_AMP_SWING) * fade;
      const micro = microOsc(totalTime, amplitude);
      apply(micro.rot, micro.ref);
    },
    applySettle(totalTime) {
      const micro = microOsc(totalTime, MICRO_AMP_SWING);
      apply(micro.rot, micro.ref);
    },
    applyPauseOutro(totalTime) {
      const micro = microOsc(totalTime, MICRO_AMP_PAUSE);
      apply(rotationToRight + micro.rot, REFLECT_MID + micro.ref);
    },
    applyPauseIntro(totalTime) {
      const micro = microOsc(totalTime, MICRO_AMP_PAUSE);
      apply(rotationToLeft + micro.rot, REFLECT_MID + micro.ref);
    },
    applyOutro(progress, outroElapsed, reverse, totalTime) {
      const ramp = reverse
        ? smoothstep(0, OUTRO_BLEND, OUTRO_DURATION - outroElapsed)
        : smoothstep(0, OUTRO_BLEND, outroElapsed);
      const eased = easeInOutCubic(reverse ? 1 - progress : progress);
      const mainRot = rotationToRight * eased * ramp;
      const mainRef = REFLECT_MID * eased * ramp;
      let amp = MICRO_AMP_SWING;
      if (!reverse) {
        const blend = smoothstep(OUTRO_DURATION - 0.5, OUTRO_DURATION, outroElapsed);
        amp = MICRO_AMP_SWING + (MICRO_AMP_PAUSE - MICRO_AMP_SWING) * blend;
      } else {
        const blend = smoothstep(0, 0.5, outroElapsed);
        amp = MICRO_AMP_PAUSE + (MICRO_AMP_SWING - MICRO_AMP_PAUSE) * blend;
      }
      const micro = microOsc(totalTime, amp);
      apply(mainRot + micro.rot, mainRef + micro.ref);
    },
  };
}

function startBranchAnimations(logoRoot) {
  const animators = [];

  BRANCH_PAIRS.forEach(({ ramo, palla }, index) => {
    const ramoPath = findItemByName(logoRoot, ramo);
    const pallaPath = findItemByName(logoRoot, palla);
    if (!(ramoPath instanceof paper.Path) || !(pallaPath instanceof paper.Path)) {
      return;
    }
    ramoPath.strokeWidth = 6.5;
    const swingMultiplier = index === 1 || index === 2 ? 2.5 : 0.5;
    animators.push(
      createBranchAnimator(ramoPath, pallaPath, index * HOLD_PHASE_STEP, swingMultiplier)
    );
  });

  if (!animators.length) return null;

  let phase = 'intro';
  let phaseStartTime = null;
  let animationStartTime = null;
  let isReversed = false;

  const holdFade = (elapsed) => {
    if (!isReversed) {
      if (elapsed < HOLD_FADE_IN) {
        return elapsed / HOLD_FADE_IN;
      }
      if (elapsed >= HOLD_DURATION - HOLD_FADE_OUT) {
        return Math.max(0, (HOLD_DURATION - elapsed) / HOLD_FADE_OUT);
      }
      return 1;
    }
    if (elapsed < HOLD_FADE_IN) {
      return elapsed / HOLD_FADE_IN;
    }
    if (elapsed >= HOLD_DURATION - HOLD_FADE_OUT) {
      return Math.max(0, (HOLD_DURATION - elapsed) / HOLD_FADE_OUT);
    }
    return 1;
  };

  const runPhase = (progress, elapsed, totalTime) => {
    if (phase === 'intro') {
      animators.forEach((animator) => animator.applyIntro(progress, isReversed, totalTime));
    } else if (phase === 'hold') {
      const holdElapsed = Math.min(elapsed, HOLD_DURATION);
      const fade = holdFade(holdElapsed);
      animators.forEach((animator) => animator.applyHold(holdElapsed, fade, totalTime));
    } else if (phase === 'settle') {
      animators.forEach((animator) => animator.applySettle(totalTime));
    } else if (phase === 'outro') {
      animators.forEach((animator) =>
        animator.applyOutro(progress, elapsed, isReversed, totalTime)
      );
    } else if (phase === 'pauseOutro') {
      animators.forEach((animator) => animator.applyPauseOutro(totalTime));
    } else if (phase === 'pauseIntro') {
      animators.forEach((animator) => animator.applyPauseIntro(totalTime));
    }
  };

  const advancePhase = (eventTime, totalTime) => {
    phaseStartTime = eventTime;

    if (!isReversed) {
      if (phase === 'intro') phase = 'hold';
      else if (phase === 'hold') phase = 'settle';
      else if (phase === 'settle') phase = 'outro';
      else if (phase === 'outro') phase = 'pauseOutro';
      else if (phase === 'pauseOutro') {
        isReversed = true;
        phase = 'outro';
      }
    } else if (phase === 'outro') phase = 'settle';
    else if (phase === 'settle') phase = 'hold';
    else if (phase === 'hold') phase = 'intro';
    else if (phase === 'intro') phase = 'pauseIntro';
    else if (phase === 'pauseIntro') {
      isReversed = false;
      phase = 'intro';
    }

    runPhase(0, 0, totalTime);
  };

  return (event) => {
    if (phaseStartTime === null) {
      phaseStartTime = event.time;
      animationStartTime = event.time;
      runPhase(0, 0, 0);
    }

    const elapsed = event.time - phaseStartTime;
    const totalTime = event.time - animationStartTime;

    if (phase === 'intro') {
      const progress = Math.min(elapsed / INTRO_DURATION, 1);
      runPhase(progress, elapsed, totalTime);
      if (progress >= 1) advancePhase(event.time, totalTime);
      return;
    }

    if (phase === 'hold') {
      runPhase(0, elapsed, totalTime);
      if (elapsed >= HOLD_DURATION) advancePhase(event.time, totalTime);
      return;
    }

    if (phase === 'settle') {
      runPhase(0, elapsed, totalTime);
      if (elapsed >= SETTLE_DURATION) advancePhase(event.time, totalTime);
      return;
    }

    if (phase === 'outro') {
      const progress = Math.min(elapsed / OUTRO_DURATION, 1);
      runPhase(progress, elapsed, totalTime);
      if (progress >= 1) advancePhase(event.time, totalTime);
      return;
    }

    if (phase === 'pauseOutro' || phase === 'pauseIntro') {
      runPhase(0, elapsed, totalTime);
      if (elapsed >= PAUSE_DURATION) advancePhase(event.time, totalTime);
    }
  };
}
