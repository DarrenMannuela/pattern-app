import * as THREE from "three";
import { pathDataToShape, bendAroundCylinder, subdivideWideTriangles } from "./svgShape.js";

// Pure Three.js scene-construction logic, kept separate from the
// React component (Garment3DPreview.jsx) so it can be exercised
// directly — in the browser or from a plain Node script — without
// needing a WebGL context, since none of this touches the renderer.

// Default mannequin proportions (cm) used for whichever body part the
// current pieces don't cover — a shirt-only mockup still gets legs to
// stand on, pants-only still gets a torso and head for context.
export const DEFAULT_TORSO_HEIGHT = 42;
export const DEFAULT_LEG_LENGTH = 75;

// A dress-form canvas tone rather than a skin tone — this is a
// patternmaking mannequin, not an attempt at a realistic person, and
// pretending otherwise would look worse, not better.
const FORM_COLOR = 0xc9b896;

// Body-build presets for the dress-form mannequin. The original form
// nipped the waist in hard relative to bust/hip (waistFactor 0.8,
// hemFactor 0.88) — a feminine dress-form silhouette that didn't read
// as a men's/boys' seragam build. These three presets straighten that
// out (less waist nip, closer to a real torso taper) and give three
// distinct builds instead of one fixed shape:
// - torsoFill: how much of the garment's own wrap radius the body
//   fills (kept below 1 so it never pokes through the fabric).
// - waistFactor/hemFactor: waist and hem radius as a fraction of the
//   chest/top radius — closer to 1 means less taper.
// - bellyFactor: how far the lower-torso profile point bulges past
//   the straight-line taper between waist and hem.
// - limbScale/headScale: bare-limb and head/neck size multipliers for
//   the decorative parts not driven by the actual garment pattern.
export const BODY_BUILDS = {
  slim: {
    label: "Slim",
    torsoFill: 0.74,
    waistFactor: 0.76,
    hemFactor: 0.86,
    bellyFactor: 0.92,
    limbScale: 0.86,
    headScale: 0.95,
  },
  regular: {
    label: "Regular",
    torsoFill: 0.82,
    waistFactor: 0.9,
    hemFactor: 0.95,
    bellyFactor: 1.0,
    limbScale: 1.0,
    headScale: 1.0,
  },
  plus: {
    label: "Plus size",
    torsoFill: 0.92,
    waistFactor: 0.98,
    hemFactor: 1.03,
    bellyFactor: 1.12,
    limbScale: 1.24,
    headScale: 1.08,
  },
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

// How much a torso/skirt panel's wrap radius should scale at a given
// normalized height t (0 = top edge, 1 = hem), so the fabric follows
// the body's own waist-and-belly taper instead of hanging as a rigid
// tube. Shares breakpoints with dressFormTorso's profile (minus its
// two mannequin-only rounding points at the very top and base, which
// exist so the lathe cap doesn't read as a flat disc — a garment has
// no cap to hide) so a shirt visibly nips in at the same height its
// build's mannequin does, and bulges over the same belly point for a
// "plus" build, rather than the two silhouettes disagreeing.
function bodyProfileScale(t, profile) {
  const { waistFactor, hemFactor, bellyFactor } = profile;
  const bellyScale = ((waistFactor + hemFactor) / 2) * bellyFactor;
  const points = [
    [0, 1],
    [0.18, 0.99],
    [0.55, waistFactor],
    [0.7, bellyScale],
    [0.86, hemFactor],
    [1, hemFactor],
  ];
  for (let i = 0; i < points.length - 1; i++) {
    const [t0, s0] = points[i];
    const [t1, s1] = points[i + 1];
    if (t <= t1) {
      const localT = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return s0 + (s1 - s0) * clamp(localT, 0, 1);
    }
  }
  return hemFactor;
}

// Mirrors dressFormTorso's own neckTaper shape (flat at targetRadius
// within depthCore, linear back out to chestRadius over the next
// depthFalloff cm) so the fabric's neckline blend can be floored
// against the mannequin's ACTUAL radius at a given depth, not a rough
// guess — the two need to agree exactly or one taper ends up
// clamping the other away entirely (as the first version of this fix
// did: the mannequin had no taper of its own, so flooring against its
// full chest width undid almost all of the fabric's own taper).
function mannequinNeckRadius(depth, chestRadius, neckTaper) {
  const { targetRadius, depthCore, depthFalloff } = neckTaper;
  if (depth <= depthCore) return targetRadius;
  if (depth >= depthCore + depthFalloff) return chestRadius;
  const localT = (depth - depthCore) / depthFalloff;
  return targetRadius + (chestRadius - targetRadius) * localT;
}

// Bends a piece around a vertical cylinder the same way
// bendAroundCylinder does (x becomes arc length at the given base
// radius), but scales the radius at each vertex by its own normalized
// height against bodyProfileScale — so the cross-section narrows at
// the waist and eases back out toward the hem instead of staying a
// constant-diameter tube top to bottom. angleOffset/mirror keep the
// exact same meaning as bendAroundCylinder.
//
// necklineBlend (optional) additionally pulls the radius toward the
// collar's own, much smaller radius for vertices near the fold edge
// (x≈0 — center front/back, where the neckline actually is) at the
// top of the piece. Without this, every point on the piece — even
// the very edge of the neck-hole cutout — sits at the same radius as
// the rest of the chest, because this bend only ever varies radius by
// height (and now the waist curve), never by how close a point is to
// the neckline. That leaves the torso's own neck opening the same
// width as the chest in 3D, with the actual (much narrower) collar
// band floating deep inside it — a visibly disconnected gap, not a
// seam. This is an approximation (a real neckline curve isn't a
// simple corner blend), but it closes that gap without needing the
// bend to know the piece's actual 2D neckline curve shape.
function bendAroundBody(geometry, baseRadius, angleOffset, mirror, pieceHeight, profile, necklineBlend) {
  const pos = geometry.attributes.position;
  const sign = mirror ? -1 : 1;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const theta = (x / baseRadius) * sign + angleOffset;
    const t = clamp(-y / pieceHeight, 0, 1);
    const scale = bodyProfileScale(t, profile);
    let r = baseRadius * scale + z;
    if (necklineBlend) {
      const { collarRadius, depthCore, depthFalloff, blendWidth, strength = 0.85, mannequinNeckTaper, torsoFill } = necklineBlend;
      // A real front neckline curve dips well below the piece's
      // absolute top edge even right at center front (a plain ramp
      // from y=0 would already be half-decayed by the time it reaches
      // that dip, undershooting exactly where the blend needs to be
      // strongest) — so anything within depthCore stays at full
      // strength, and only fades out over the next depthFalloff cm.
      const depth = -y;
      const heightFactor = depth <= depthCore ? 1 : clamp(1 - (depth - depthCore) / depthFalloff, 0, 1);
      const widthFactor = clamp(1 - x / blendWidth, 0, 1);
      const blend = heightFactor * widthFactor * strength;
      const target = collarRadius + z;
      r += (target - r) * blend;
      // The dress-form mannequin now tapers its own neck the same way
      // (see dressFormTorso's neckTaper) — floor the fabric against
      // its ACTUAL radius at this depth, not its full chest width, or
      // this clamp undoes almost all of the taper above.
      if (mannequinNeckTaper) {
        const chestR = baseRadius * torsoFill * scale;
        const floor = mannequinNeckRadius(depth, chestR, mannequinNeckTaper) + 1.5;
        r = Math.max(r, floor);
      }
    }
    pos.setXYZ(i, Math.sin(theta) * r, y, Math.cos(theta) * r);
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();
}

function findPiece(pieces, re) {
  return pieces.find((p) => re.test(p.name));
}

function formMaterial() {
  return new THREE.MeshStandardMaterial({ color: FORM_COLOR, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
}

// A dress-form torso built as a lathe (a profile curve spun around Y),
// sized just inside the garment's own wrap radius so it doesn't poke
// through the fabric. maxRadius caps every profile radius so a wide
// hemFactor/bellyFactor (plus-size build) still can't push past the
// garment surface and z-fight with it.
//
// neckTaper (optional) narrows the very top of the torso down toward
// a neck-sized radius instead of staying at ~full chest width right
// up to where the head/neck cylinder begins. Without it, a garment's
// own neckline can never safely taper toward the collar either: the
// mannequin's torso underneath has nothing to recede into, so pulling
// the fabric in just exposes bare mannequin at the neckline instead
// of closing the gap to the collar (measured directly: the fabric
// taper had to be clamped back to ~22cm, barely narrower than the
// ~27cm chest, when the mannequin stayed at ~21cm right under it).
function dressFormTorso(topRadius, height, waistFactor = 0.8, hemFactor = 0.88, bellyFactor = 1.0, maxRadius = Infinity, neckTaper = null) {
  const top = Math.min(topRadius, maxRadius);
  const waistR = Math.min(top * waistFactor, maxRadius);
  const hemR = Math.min(top * hemFactor, maxRadius);
  const bellyR = Math.min(top * ((waistFactor + hemFactor) / 2) * bellyFactor, maxRadius);
  const profile = [
    new THREE.Vector2(Math.max(1, hemR * 0.4), -height), // tapered base so it doesn't show as a flat disc
    new THREE.Vector2(hemR, -height * 0.97),
    new THREE.Vector2(bellyR, -height * 0.7), // lower-torso/belly point, between hem and waist
    new THREE.Vector2(waistR, -height * 0.55),
  ];
  if (neckTaper) {
    // Each point here is derived from the one before it (never an
    // independent clamp against the fixed depthCore/depthFalloff
    // constants), so the profile's Y values are guaranteed strictly
    // increasing regardless of how short this particular piece is —
    // an earlier version clamped falloffStart and peakDepth against
    // height independently, which could let the "shallower" point end
    // up deeper than the "start" point, folding the lathe profile
    // back on itself (LatheGeometry doesn't validate this — it just
    // silently produces a self-intersecting surface, seen as a
    // sudden jump in radius partway up the torso).
    const { targetRadius, depthCore, depthFalloff } = neckTaper;
    const falloffStart = Math.min(depthCore + depthFalloff, height * 0.45); // stay well above the waist point at -height*0.55
    const peakDepth = Math.min(depthCore, falloffStart * 0.6);
    profile.push(
      new THREE.Vector2(top, -falloffStart), // still full chest/back width here
      new THREE.Vector2(targetRadius, -peakDepth), // tapered down toward the neck by this depth
      new THREE.Vector2(targetRadius, 0), // flat the rest of the way to the top
    );
  } else {
    profile.push(
      new THREE.Vector2(top * 0.97, -height * 0.18),
      new THREE.Vector2(top, -height * 0.04),
      new THREE.Vector2(top * 0.9, 0),
    );
  }
  return new THREE.LatheGeometry(profile, 28);
}

// Builds one wrapped-fabric mesh from a pattern piece. Fold pieces
// (bodice/skirt halves) wrap from their x=0 fold edge and get a
// mirrored twin to cover both sides; full pieces (sleeve, pants
// panels, waistband) are centered on their own width and wrapped
// without a twin, since they already represent the whole piece.
// secondaryColor, when given, colors the mirrored twin differently
// from the first half — a two-tone/color-block panel split exactly at
// the piece's own center-front or center-back fold line. bodyProfile,
// when given (a BODY_BUILDS preset), bends with bendAroundBody instead
// of a constant-radius bendAroundCylinder, so the panel follows the
// body's waist/belly taper — used for torso and skirt front/back, not
// for pieces like the collar that should stay a simple even band.
function wrappedMesh(piece, radius, angleOffset, color, secondaryColor, bodyProfile, necklineBlend) {
  const group = new THREE.Group();
  const depth = 0.5;
  const isFold = piece.foldEdge === "left";

  function build(mirror, meshColor) {
    const shape = pathDataToShape(piece.pathData);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
    if (!isFold) geo.translate(-piece.width / 2, 0, 0);
    // The body-profile bend varies radius by height, not just by the
    // wrap angle — a triangle can have a narrow X span (fine for a
    // constant-radius wrap) but still be tall enough to cross most of
    // the waist/belly taper with no vertex in between, which shows up
    // as a flat facet instead of a smooth curve. Needs a much finer
    // cap than the plain cylindrical wrap to render that curve smoothly.
    subdivideWideTriangles(geo, bodyProfile ? 2.5 : radius * 0.3, bodyProfile ? 5 : 4);
    if (bodyProfile) {
      bendAroundBody(geo, radius, angleOffset, mirror, piece.height, bodyProfile, necklineBlend);
    } else {
      bendAroundCylinder(geo, radius, angleOffset, mirror);
    }
    const mat = new THREE.MeshStandardMaterial({ color: meshColor, roughness: 0.82, metalness: 0.04, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }

  group.add(build(false, color));
  if (isFold) group.add(build(true, secondaryColor ?? color));
  return group;
}

function addHand(parent, x, y, z, scale = 1) {
  const hand = new THREE.Mesh(new THREE.SphereGeometry(2.6 * scale, 12, 12), formMaterial());
  hand.scale.set(0.85, 1, 1.1);
  hand.position.set(x, y, z);
  parent.add(hand);
}

function addFoot(parent, x, y, z, scale = 1) {
  const foot = new THREE.Mesh(new THREE.BoxGeometry(6 * scale, 4 * scale, 12 * scale), formMaterial());
  foot.position.set(x, y + 2 * scale, z + 4 * scale);
  parent.add(foot);
}

// A soft, cheap "contact shadow" — a flat translucent disc under the
// figure's feet — rather than real shadow mapping, which would need
// every mesh re-flagged on every rebuild for little visual gain at
// this scale.
function groundShadow(y, radius) {
  const geo = new THREE.CircleGeometry(radius, 32);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = y;
  return mesh;
}

function buildSleeve(sleeve, shoulder, mirror, color, embroidery, handScale = 1) {
  const group = new THREE.Group();
  const shape = pathDataToShape(sleeve.pathData);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: false, curveSegments: 16 });
  const halfBicep = sleeve.crown?.x ?? sleeve.width / 2;
  geo.translate(-halfBicep, 0, 0);
  const armRadius = Math.max(2, sleeve.width / (2 * Math.PI));
  subdivideWideTriangles(geo, armRadius * 0.3);
  bendAroundCylinder(geo, armRadius, 0, false);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.04, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  group.add(mesh);
  // mirror=false is the +X (right) shoulder — it needs a positive
  // rotation so the tube swings down-and-outward (+X), not inward
  // across the body; mirror=true (-X shoulder) needs the opposite.
  const hangAngle = THREE.MathUtils.degToRad(22);
  group.rotation.z = mirror ? -hangAngle : hangAngle;
  group.position.copy(shoulder);
  addHand(group, 0, -sleeve.height - 1.5, armRadius * 0.6, handScale);

  if (embroidery) {
    // Built in the sleeve's own local frame (before the group's
    // position/rotation are applied above) so it rides along with the
    // sleeve's hang angle instead of needing its own cylinder math.
    const w = embroidery.width || 8;
    const h = embroidery.height || 8;
    const eShape = new THREE.Shape();
    eShape.moveTo(-w / 2, 0);
    eShape.lineTo(w / 2, 0);
    eShape.lineTo(w / 2, -h);
    eShape.lineTo(-w / 2, -h);
    eShape.closePath();
    const eGeo = new THREE.ExtrudeGeometry(eShape, { depth: 0.1, bevelEnabled: false });
    bendAroundCylinder(eGeo, armRadius + 0.5, 0, false);
    const eMesh = new THREE.Mesh(eGeo, new THREE.MeshStandardMaterial({ color: EMBROIDERY_COLOR, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }));
    eMesh.position.y = -sleeve.height * 0.22;
    group.add(eMesh);
  }

  return group;
}

// Attaches a real add-on piece (currently just the patch pocket) onto
// a parent body piece at the add-on's own reported anchor point,
// wrapping it around the same cylinder the parent uses so it curves
// naturally with the body instead of floating flat in front of it.
// Sits a little further out than the parent's own outer surface
// (radius+0.5) so the two don't share a depth and z-fight.
function attachAddOnPiece(root, addOn, parentPiece, radius, angleOffset, parentY, color, mirror = false, offsetX = 0, offsetZ = 0, bodyProfile = null) {
  if (!addOn.anchor) return;
  const isFold = parentPiece.foldEdge === "left";
  const localX = isFold ? addOn.anchor.x : addOn.anchor.x - parentPiece.width / 2;
  const sign = mirror ? -1 : 1;
  const theta = (localX / radius) * sign + angleOffset;
  // Matches whatever bend the parent panel itself used at this
  // height, so the add-on sits flush against a curved (not flat)
  // parent surface instead of floating off it or sinking into it.
  const surfaceRadius = bodyProfile ? radius * bodyProfileScale(clamp(addOn.anchor.y / parentPiece.height, 0, 1), bodyProfile) : radius;

  const shape = pathDataToShape(addOn.pathData);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
  geo.translate(-addOn.width / 2, 0, 0);
  bendAroundCylinder(geo, surfaceRadius + 0.55, theta, false);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0.05, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(offsetX, parentY - addOn.anchor.y, offsetZ);
  mesh.castShadow = true;
  root.add(mesh);
}

// Embroidery has no cut piece of its own — just a placement, size and
// label — so it's drawn as a simple flat rectangle decal in a
// contrasting color rather than reusing pathData that doesn't exist.
const EMBROIDERY_COLOR = 0xd9c589;

function attachEmbroideryDecal(root, embroidery, anchorX, anchorY, parentPiece, radius, angleOffset, parentY, mirror = false, offsetX = 0, offsetZ = 0, bodyProfile = null) {
  const isFold = parentPiece.foldEdge === "left";
  const localX = isFold ? anchorX : anchorX - parentPiece.width / 2;
  const sign = mirror ? -1 : 1;
  const theta = (localX / radius) * sign + angleOffset;
  const surfaceRadius = bodyProfile ? radius * bodyProfileScale(clamp(anchorY / parentPiece.height, 0, 1), bodyProfile) : radius;

  const w = embroidery.width || 8;
  const h = embroidery.height || 8;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, -h);
  shape.lineTo(-w / 2, -h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
  bendAroundCylinder(geo, surfaceRadius + 0.6, theta, false);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: EMBROIDERY_COLOR, roughness: 0.5, metalness: 0.25, side: THREE.DoubleSide }));
  mesh.position.set(offsetX, parentY - anchorY, offsetZ);
  root.add(mesh);
}

// Assembles the full scene group (mannequin + wrapped garment pieces)
// from one size's drafted pieces. Rebuilt from scratch whenever
// pieces or options change — geometry construction is cheap at this
// scale, and it keeps disposal simple (throw the old group away).
//
// options:
// - color: base fabric color (hex string).
// - embroidery: optional {placement, width, height, label}.
// - build: "slim" | "regular" | "plus" — a BODY_BUILDS preset.
// - bodyScale: {width, height} multipliers layered on top of the
//   preset, for direct fine-tuning beyond the three presets. Only
//   scales the decorative mannequin (limbs, head, the torso shown
//   above/below whatever the actual garment covers) — the garment
//   fabric itself always matches the customer's real measurements and
//   never stretches to fit a mannequin setting.
// - colorBlock: optional {enabled, secondaryColor} — a two-tone panel
//   split exactly at center front/back, matching how a color-block
//   "kombinasi" shirt is actually cut from two fabics and sewn at
//   that seam (not a diagonal or offset panel — see garmentScene.js
//   history for why: it reuses the piece's own fold/mirror halves
//   instead of clipping new geometry, which is what keeps this safe
//   from the earcut/z-fight issues a real polygon split would risk).
export function buildScene(pieces, options = {}) {
  const { color = "#33475B", embroidery = null, build = "regular", bodyScale = {}, colorBlock = null } = options;
  const preset = BODY_BUILDS[build] || BODY_BUILDS.regular;
  const widthScale = clamp(bodyScale.width ?? 1, 0.6, 1.6);
  const heightScale = clamp(bodyScale.height ?? 1, 0.7, 1.4);
  const limbScale = preset.limbScale * widthScale;
  const secondary = colorBlock?.enabled ? colorBlock.secondaryColor || "#c0392b" : null;

  const root = new THREE.Group();
  const mat = formMaterial();

  const frontName = (findPiece(pieces, /front/i)?.name || "").toLowerCase();
  const kind = /pants|shorts/.test(frontName) ? "legs" : /skirt/.test(frontName) ? "skirt" : "torso";

  const front = findPiece(pieces, /front/i);
  const back = findPiece(pieces, /back/i);
  const sleeve = findPiece(pieces, /sleeve/i);
  const collar = findPiece(pieces, /collar/i);
  const placket = findPiece(pieces, /placket/i);
  const waistband = findPiece(pieces, /waistband/i);
  const pocket = findPiece(pieces, /pocket/i);

  let neckBaseY = DEFAULT_TORSO_HEIGHT; // world Y where the neck/waist boundary sits
  let hipY = 0; // world Y where legs begin
  let floorY = -DEFAULT_LEG_LENGTH; // lowest point the figure's feet reach, for the ground shadow
  let stanceRadius = 14; // roughly how wide the figure stands, for the shadow's size

  if (kind === "torso" && front && back) {
    const radius = Math.max(4, (front.width + back.width) / Math.PI);
    neckBaseY = DEFAULT_TORSO_HEIGHT + front.height; // build torso hanging from a fixed head position

    // Collar radius computed up front (not just inside the `if (collar)`
    // block below) so front/back can taper their own neckline edge
    // toward it — otherwise the torso's neck-hole boundary sits at
    // full chest radius while the collar band sits at true neck
    // radius, ~15-20cm apart with nothing bridging the gap.
    const collarRadius = collar ? Math.max(3, collar.width / Math.PI) : null;
    const torsoFill = Math.min(0.94, preset.torsoFill * widthScale);
    // Shared by both the fabric's neckline taper and the mannequin's
    // own neck taper below, so the two curves agree on where and how
    // far to narrow — mismatched depths are what caused the earlier
    // version of this fix to clamp the fabric taper away entirely.
    const neckDepthCore = 10; // covers a typical ~7-9cm front-neckline dip at full strength
    const neckDepthFalloff = 7; // eases back out to full chest/torso width by ~17cm down
    const necklineBlend = collar
      ? {
          collarRadius,
          depthCore: neckDepthCore,
          depthFalloff: neckDepthFalloff,
          blendWidth: Math.min(14, front.width * 0.3),
          strength: 0.85,
          torsoFill,
          mannequinNeckTaper: { targetRadius: collarRadius * 0.7, depthCore: neckDepthCore, depthFalloff: neckDepthFalloff },
        }
      : null;

    const torsoGroup = new THREE.Group();
    torsoGroup.add(wrappedMesh(front, radius, 0, color, secondary, preset, necklineBlend));
    torsoGroup.add(wrappedMesh(back, radius, Math.PI, color, secondary, preset, necklineBlend));
    torsoGroup.position.y = neckBaseY;
    root.add(torsoGroup);
    hipY = neckBaseY - front.height;

    // dress-form body just inside the garment, so it reads as a
    // figure filling the fabric rather than fabric floating in space
    // (torsoFill computed above, shared with the neckline taper's floor)
    const form = new THREE.Mesh(
      dressFormTorso(
        radius * torsoFill,
        front.height,
        preset.waistFactor,
        preset.hemFactor,
        preset.bellyFactor,
        radius * 0.97,
        collar ? { targetRadius: collarRadius * 0.7, depthCore: neckDepthCore, depthFalloff: neckDepthFalloff } : null,
      ),
      mat,
    );
    form.position.y = neckBaseY;
    root.add(form);

    if (collar) {
      // collarRadius computed above (shared with the neckline taper on
      // front/back) — same fold-piece formula as the torso (width/π),
      // since the collar is a half piece too and this is the radius
      // that makes its mirrored twin meet seamlessly at center back.
      const collarGroup = wrappedMesh(collar, collarRadius, 0, color, secondary);
      collarGroup.position.y = neckBaseY + 1;
      root.add(collarGroup);
    }
    if (placket) {
      const geo = new THREE.BoxGeometry(placket.width, placket.height, 0.6);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x000000, opacity: 0.25, transparent: true }));
      mesh.position.set(0, neckBaseY - placket.height / 2, radius + 0.3);
      root.add(mesh);
    }
    if (sleeve) {
      // The sleeve cap and the torso's armhole curve were never
      // designed to be geometrically continuous (a real set-in sleeve
      // is eased into the armhole along a matched arc length, not a
      // literal shared edge) — attaching it exactly on the torso's
      // surface leaves a gap there the background shows through.
      // Pulling the attachment point inward, using the torso's true
      // radius only to get the angle right, makes the sleeve start
      // inside the torso volume so the two overlap with no seam.
      const shoulderInset = 3.5;
      let shoulder;
      if (front.shoulderTip) {
        const theta = front.shoulderTip.x / radius;
        const insetRadius = radius - shoulderInset;
        shoulder = new THREE.Vector3(Math.sin(theta) * insetRadius, -front.shoulderTip.y, Math.cos(theta) * insetRadius);
      } else {
        shoulder = new THREE.Vector3((radius - shoulderInset) * 0.7, 0, (radius - shoulderInset) * 0.7);
      }
      shoulder.y += neckBaseY;
      const sleeveEmbroidery = embroidery?.placement === "sleeve" ? embroidery : null;
      root.add(buildSleeve(sleeve, shoulder, false, color, sleeveEmbroidery, limbScale));
      const shoulderMirror = shoulder.clone();
      shoulderMirror.x = -shoulderMirror.x;
      root.add(buildSleeve(sleeve, shoulderMirror, true, secondary ?? color, null, limbScale));
    } else {
      // no sleeve drafted — show bare mannequin arms for context
      [-1, 1].forEach((side) => {
        const armGroup = new THREE.Group();
        const arm = new THREE.Mesh(new THREE.CapsuleGeometry(2.6 * limbScale, 26, 4, 8), mat);
        armGroup.add(arm);
        addHand(armGroup, 0, -16, 0, limbScale);
        armGroup.position.set(side * (radius + 2), neckBaseY - 14, 0);
        armGroup.rotation.z = side * THREE.MathUtils.degToRad(12);
        root.add(armGroup);
      });
    }

    if (pocket) {
      attachAddOnPiece(root, pocket, front, radius, 0, neckBaseY, color, false, 0, 0, preset);
    }
    if (embroidery && embroidery.placement !== "sleeve") {
      if (embroidery.placement === "back") {
        const anchorX = back.width * 0.5;
        const anchorY = back.height * 0.2;
        attachEmbroideryDecal(root, embroidery, anchorX, anchorY, back, radius, Math.PI, neckBaseY, false, 0, 0, preset);
      } else {
        // left_chest / right_chest (and the unset default) — upper
        // chest, above where the pocket sits, mirrored to whichever
        // side was requested since front is a folded half-piece.
        const mirror = embroidery.placement === "right_chest";
        const anchorX = front.width * 0.4;
        const anchorY = front.height * 0.13;
        attachEmbroideryDecal(root, embroidery, anchorX, anchorY, front, radius, 0, neckBaseY, mirror, 0, 0, preset);
      }
    }

    const headR = 8 * preset.headScale;
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR, 20, 20), mat);
    head.position.y = neckBaseY + 10;
    root.add(head);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(3.2 * preset.headScale, 3.6 * preset.headScale, 5, 16), mat);
    neck.position.y = neckBaseY + 2;
    root.add(neck);
    stanceRadius = radius * 1.3;
  } else if (kind === "skirt" && front && back) {
    const radius = Math.max(4, (front.width + back.width) / Math.PI);
    neckBaseY = DEFAULT_TORSO_HEIGHT;
    const skirtGroup = new THREE.Group();
    skirtGroup.add(wrappedMesh(front, radius, 0, color, secondary, preset));
    skirtGroup.add(wrappedMesh(back, radius, Math.PI, color, secondary, preset));
    skirtGroup.position.y = neckBaseY;
    root.add(skirtGroup);
    hipY = neckBaseY - front.height;

    if (pocket) {
      attachAddOnPiece(root, pocket, back, radius, Math.PI, neckBaseY, color, false, 0, 0, preset);
    }

    // torso mannequin above the skirt for context (not part of the
    // order, so free to follow the build/size settings fully)
    const torsoHeight = DEFAULT_TORSO_HEIGHT * heightScale;
    const torso = new THREE.Mesh(dressFormTorso(radius * 0.82 * widthScale, torsoHeight, preset.waistFactor, 1, preset.bellyFactor), mat);
    torso.position.y = neckBaseY + torsoHeight;
    root.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(8 * preset.headScale, 20, 20), mat);
    head.position.y = neckBaseY + torsoHeight + 10;
    root.add(head);
    stanceRadius = radius * 1.2;
  } else if (kind === "legs" && front && back) {
    // Unlike the torso/skirt panels, pants front/back are already
    // full (non-folded) pieces — each wraps a full circle centered on
    // its own width, so the two together need width/(2π), not the
    // fold-piece doubling of width/π used above.
    const legRadius = Math.max(3, (front.width + back.width) / (2 * Math.PI));
    const legGap = legRadius * 1.15;
    hipY = DEFAULT_TORSO_HEIGHT;
    const legLen = front.height;
    const bareTarget = DEFAULT_LEG_LENGTH * heightScale;
    [-1, 1].forEach((side) => {
      const legGroup = new THREE.Group();
      legGroup.add(wrappedMesh(front, legRadius, 0, color));
      legGroup.add(wrappedMesh(back, legRadius, Math.PI, color));
      legGroup.position.set(side * legGap, hipY, 0);
      root.add(legGroup);

      if (pocket) {
        attachAddOnPiece(root, pocket, back, legRadius, Math.PI, hipY, color, false, side * legGap, 0);
      }

      // shorts leave the lower leg bare down to the floor
      const bareLen = bareTarget - legLen;
      if (bareLen > 4) {
        const shin = new THREE.Mesh(new THREE.CapsuleGeometry(legRadius * 0.55 * limbScale, bareLen - 6, 4, 12), mat);
        shin.position.set(side * legGap, hipY - legLen - bareLen / 2, 0);
        root.add(shin);
        addFoot(root, side * legGap, hipY - legLen - bareLen, 0, limbScale);
      } else {
        addFoot(root, side * legGap, hipY - legLen, 0, limbScale);
      }
    });
    // torso mannequin above the waist for context
    const torsoHeight = DEFAULT_TORSO_HEIGHT * heightScale;
    const torso = new THREE.Mesh(
      dressFormTorso((legGap + legRadius * 0.55) * widthScale, torsoHeight, preset.waistFactor, 1, preset.bellyFactor),
      mat,
    );
    torso.position.y = hipY + torsoHeight;
    root.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(8 * preset.headScale, 20, 20), mat);
    head.position.y = hipY + torsoHeight + 10;
    root.add(head);
    neckBaseY = hipY + torsoHeight;
    floorY = hipY - bareTarget;
    stanceRadius = legGap + legRadius * 1.6;
  }

  if (waistband) {
    const wbRadius = Math.max(3, waistband.width / (2 * Math.PI));
    const wbGeo = new THREE.CylinderGeometry(wbRadius, wbRadius, waistband.height, 32, 1, true);
    const wbMesh = new THREE.Mesh(wbGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide }));
    wbMesh.position.y = hipY;
    root.add(wbMesh);
  }

  // legs below the hip when this preview has no pants/shorts of its
  // own — purely decorative, so free to follow the height setting
  if (kind !== "legs") {
    const legLenEff = DEFAULT_LEG_LENGTH * heightScale;
    floorY = hipY - legLenEff;
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(4 * limbScale, legLenEff - 8, 4, 12), mat);
      leg.position.set(side * 5, hipY - legLenEff / 2, 0);
      root.add(leg);
      addFoot(root, side * 5, floorY, 0, limbScale);
    });
  }

  root.add(groundShadow(floorY - 0.2, stanceRadius * Math.max(1, widthScale)));

  root.traverse((obj) => {
    if (obj.isMesh) {
      obj.castShadow = obj.castShadow ?? true;
      obj.receiveShadow = true;
    }
  });

  return root;
}
