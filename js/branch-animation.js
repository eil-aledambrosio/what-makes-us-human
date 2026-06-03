const BRANCH_PAIRS = [
  { ramo: 'ramo1', palla: 'palla1' },
  { ramo: 'ramo2', palla: 'palla2' },
  { ramo: 'ramo3', palla: 'palla3' },
  { ramo: 'ramo4', palla: 'palla4' },
];

const INTRO_DURATION = 2.8;
const HOLD_DURATION = 1.2;
const HOLD_FADE_OUT = 0.35;
const HOLD_ROTATION_SWING = 2.2;
const HOLD_REFLECT_SWING = 0.05;
const HOLD_ROTATION_SPEED = 0.75;
const HOLD_REFLECT_SPEED = 0.95;
const HOLD_PHASE_STEP = 0.7;
const SETTLE_DURATION = 0.25;
const OUTRO_DURATION = 2.8;
const OUTRO_BLEND = 0.55;
const REFLECT_MID = 0.5;
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

function createBranchAnimator(ramo, palla, phaseOffset) {
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

  return {
    applyIntro(progress, reverse) {
      const eased = easeInOutCubic(progress);
      if (!reverse) {
        apply(rotationToLeft * (1 - eased), REFLECT_MID * (1 - eased));
      } else {
        apply(rotationToLeft * eased, REFLECT_MID * eased);
      }
    },
    applyHold(elapsed, fade) {
      const rotation =
        Math.sin(elapsed * HOLD_ROTATION_SPEED + phaseOffset) *
        HOLD_ROTATION_SWING *
        fade;
      const reflectAmount =
        ((Math.sin(elapsed * HOLD_REFLECT_SPEED + phaseOffset * 1.3) + 1) / 2) *
        HOLD_REFLECT_SWING *
        fade;
      apply(rotation, reflectAmount);
    },
    applySettle() {
      apply(0, 0);
    },
    applyOutro(progress, outroElapsed, reverse) {
      const ramp = reverse
        ? smoothstep(0, OUTRO_BLEND, OUTRO_DURATION - outroElapsed)
        : smoothstep(0, OUTRO_BLEND, outroElapsed);
      const eased = easeInOutCubic(reverse ? 1 - progress : progress);
      apply(rotationToRight * eased * ramp, REFLECT_MID * eased * ramp);
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
    animators.push(
      createBranchAnimator(ramoPath, pallaPath, index * HOLD_PHASE_STEP)
    );
  });

  if (!animators.length) return null;

  let phase = 'intro';
  let phaseStartTime = null;
  let isReversed = false;

  const holdFade = (elapsed) => {
    if (!isReversed) {
      if (elapsed >= HOLD_DURATION - HOLD_FADE_OUT) {
        return Math.max(0, (HOLD_DURATION - elapsed) / HOLD_FADE_OUT);
      }
      return 1;
    }
    if (elapsed < HOLD_FADE_OUT) {
      return elapsed / HOLD_FADE_OUT;
    }
    if (elapsed >= HOLD_DURATION - HOLD_FADE_OUT) {
      return Math.max(0, (HOLD_DURATION - elapsed) / HOLD_FADE_OUT);
    }
    return 1;
  };

  const runPhase = (progress, elapsed) => {
    if (phase === 'intro') {
      animators.forEach((animator) => animator.applyIntro(progress, isReversed));
    } else if (phase === 'hold') {
      const holdElapsed = Math.min(elapsed, HOLD_DURATION);
      const fade = holdFade(holdElapsed);
      animators.forEach((animator) => animator.applyHold(holdElapsed, fade));
    } else if (phase === 'settle') {
      animators.forEach((animator) => animator.applySettle());
    } else if (phase === 'outro') {
      animators.forEach((animator) =>
        animator.applyOutro(progress, elapsed, isReversed)
      );
    }
  };

  const advancePhase = (eventTime) => {
    phaseStartTime = eventTime;

    if (!isReversed) {
      if (phase === 'intro') phase = 'hold';
      else if (phase === 'hold') phase = 'settle';
      else if (phase === 'settle') phase = 'outro';
      else if (phase === 'outro') {
        isReversed = true;
        phase = 'outro';
      }
    } else if (phase === 'outro') phase = 'settle';
    else if (phase === 'settle') phase = 'hold';
    else if (phase === 'hold') phase = 'intro';
    else if (phase === 'intro') {
      isReversed = false;
      phase = 'intro';
    }

    runPhase(0, 0);
  };

  return (event) => {
    if (phaseStartTime === null) {
      phaseStartTime = event.time;
      runPhase(0, 0);
    }

    const elapsed = event.time - phaseStartTime;

    if (phase === 'intro') {
      const progress = Math.min(elapsed / INTRO_DURATION, 1);
      runPhase(progress, elapsed);
      if (progress >= 1) advancePhase(event.time);
      return;
    }

    if (phase === 'hold') {
      runPhase(0, elapsed);
      if (elapsed >= HOLD_DURATION) advancePhase(event.time);
      return;
    }

    if (phase === 'settle') {
      runPhase(0, elapsed);
      if (elapsed >= SETTLE_DURATION) advancePhase(event.time);
      return;
    }

    if (phase === 'outro') {
      const progress = Math.min(elapsed / OUTRO_DURATION, 1);
      runPhase(progress, elapsed);
      if (progress >= 1) advancePhase(event.time);
    }
  };
}
