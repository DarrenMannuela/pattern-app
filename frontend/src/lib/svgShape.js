import * as THREE from "three";

// Converts one of this app's drafted SVG path strings (built by the
// backend's pathBuilder: M/L/C/Z commands, absolute coordinates) into
// a THREE.Shape — as a densely-sampled polyline rather than native
// THREE.Shape curve commands. Extrusion triangulates the shape with
// earcut, which is free to connect any two boundary points with an
// interior diagonal; with only the pattern's own sparse vertices to
// work with (a handful of points around a dart notch, a single long
// straight side seam), it can produce a diagonal spanning most of the
// piece's width. Wrapped around a small radius, that one triangle's
// three corners land at wildly different angles and the triangle
// tears itself into a visible gap. Resampling every segment — lines
// included — to a fixed maximum length gives earcut many nearby
// boundary points to choose from instead, which keeps every triangle
// local and well-behaved once bent. SVG y grows downward; we negate
// it so the pattern's "up" (toward the neckline) becomes 3D "up" (+Y).
const MAX_SEGMENT_LENGTH = 0.6; // cm

function sampleLine(shape, x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / MAX_SEGMENT_LENGTH));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    shape.lineTo(x0 + (x1 - x0) * t, -(y0 + (y1 - y0) * t));
  }
}

function sampleBezier(shape, x0, y0, c1x, c1y, c2x, c2y, x1, y1) {
  // Control-polygon length is a cheap, safe overestimate of the
  // curve's true length — fine here since it only sets step count.
  const approxLen = Math.hypot(c1x - x0, c1y - y0) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(x1 - c2x, y1 - c2y);
  const steps = Math.max(6, Math.ceil(approxLen / MAX_SEGMENT_LENGTH));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x = mt * mt * mt * x0 + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * x1;
    const y = mt * mt * mt * y0 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * y1;
    shape.lineTo(x, -y);
  }
}

export function pathDataToShape(d) {
  const shape = new THREE.Shape();
  const tokens = d
    .trim()
    .split(/(?=[MLCZ])/)
    .map((t) => t.trim())
    .filter(Boolean);

  let cur = { x: 0, y: 0 };
  for (const tok of tokens) {
    const cmd = tok[0];
    const nums = tok
      .slice(1)
      .trim()
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    switch (cmd) {
      case "M":
        shape.moveTo(nums[0], -nums[1]);
        cur = { x: nums[0], y: nums[1] };
        break;
      case "L":
        sampleLine(shape, cur.x, cur.y, nums[0], nums[1]);
        cur = { x: nums[0], y: nums[1] };
        break;
      case "C":
        sampleBezier(shape, cur.x, cur.y, nums[0], nums[1], nums[2], nums[3], nums[4], nums[5]);
        cur = { x: nums[4], y: nums[5] };
        break;
      case "Z":
        shape.closePath();
        break;
      default:
        break;
    }
  }
  return shape;
}

// Densely sampling the boundary (above) sharply reduces how often
// earcut's interior triangulation produces a diagonal spanning most
// of the piece's width, but doesn't guarantee it — earcut is free to
// connect any two boundary vertices, dense or not, if that's what its
// ear-clipping order calls for. Rather than chase the exact shape
// that still triggers one, this subdivides any triangle whose local X
// span exceeds maxSpan (repeatedly, in case a split still leaves a
// wide piece) — cheap insurance directly against the failure mode
// (a wide-angle triangle tearing itself apart once bent) instead of
// its cause.
export function subdivideWideTriangles(geometry, maxSpan, maxPasses = 4) {
  for (let pass = 0; pass < maxPasses; pass++) {
    const pos = geometry.attributes.position;
    const idx = geometry.index;
    if (!idx) return;
    const positions = Array.from(pos.array);
    let vertCount = pos.count;
    const midCache = new Map();
    function midpoint(i1, i2) {
      const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
      const cached = midCache.get(key);
      if (cached !== undefined) return cached;
      const a = i1 * 3, b = i2 * 3;
      positions.push((positions[a] + positions[b]) / 2, (positions[a + 1] + positions[b + 1]) / 2, (positions[a + 2] + positions[b + 2]) / 2);
      const newIndex = vertCount++;
      midCache.set(key, newIndex);
      return newIndex;
    }

    const newIndices = [];
    let changed = false;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      const ax = positions[a * 3], bx = positions[b * 3], cx = positions[c * 3];
      const span = Math.max(ax, bx, cx) - Math.min(ax, bx, cx);
      if (span > maxSpan) {
        changed = true;
        const ab = midpoint(a, b);
        const bc = midpoint(b, c);
        const ca = midpoint(c, a);
        newIndices.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      } else {
        newIndices.push(a, b, c);
      }
    }
    if (!changed) return;
    geometry.setIndex(newIndices);
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  }
}

// Bends an extruded piece's flat geometry around a vertical cylinder
// of the given radius — the technique that turns a flat pattern piece
// into a garment wrapped around a body. `x` in the source shape
// (distance from the piece's fold/center edge) becomes arc length;
// `angleOffset` rotates where that center sits (0 = facing +Z/front,
// Math.PI = facing -Z/back); `mirror` flips which side the piece
// wraps toward, so a piece and its mirrored copy cover both sides of
// center without overlapping.
export function bendAroundCylinder(geometry, radius, angleOffset = 0, mirror = false) {
  const pos = geometry.attributes.position;
  const sign = mirror ? -1 : 1;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const theta = (x / radius) * sign + angleOffset;
    const r = radius + z;
    pos.setXYZ(i, Math.sin(theta) * r, y, Math.cos(theta) * r);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}
