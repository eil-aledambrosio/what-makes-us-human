const BRANCH_PAIRS = [
  { ramo: 'ramo1', palla: 'palla1' },
  { ramo: 'ramo2', palla: 'palla2' },
  { ramo: 'ramo3', palla: 'palla3' },
  { ramo: 'ramo4', palla: 'palla4' },
];

const BRANCH_SPEED = 0.85;
const BRANCH_PHASE_STEP = Math.PI * 0.35;
const BRANCH_SWING = 14;

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

function createBranchAnimator(ramo, palla, phase) {
  const ramoSnapshot = snapshotPath(ramo);
  const pallaSnapshot = snapshotPath(palla);

  restorePath(ramo, ramoSnapshot);
  const pivot = lowestPivotInParent(ramo, ramoSnapshot.segments);

  return (time) => {
    const wave = Math.sin(time * BRANCH_SPEED + phase);
    const reflectAmount = (wave + 1) / 2;
    const angle = wave * BRANCH_SWING;

    restorePath(ramo, ramoSnapshot);
    restorePath(palla, pallaSnapshot);
    applyBranchReflection(ramo, ramoSnapshot.segments, reflectAmount);
    ramo.rotate(angle, pivot);
    palla.rotate(angle, pivot);
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
      createBranchAnimator(ramoPath, pallaPath, index * BRANCH_PHASE_STEP)
    );
  });

  if (!animators.length) return null;

  return (event) => {
    animators.forEach((update) => update(event.time));
  };
}
