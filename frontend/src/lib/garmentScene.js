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
function dressFormTorso(topRadius, height, waistFactor = 0.8, hemFactor = 0.88, bellyFactor = 1.0, maxRadius = Infinity) {
  const top = Math.min(topRadius, maxRadius);
  const waistR = Math.min(top * waistFactor, maxRadius);
  const hemR = Math.min(top * hemFactor, maxRadius);
  const bellyR = Math.min(top * ((waistFactor + hemFactor) / 2) * bellyFactor, maxRadius);
  const profile = [
    new THREE.Vector2(Math.max(1, hemR * 0.4), -height), // tapered base so it doesn't show as a flat disc
    new THREE.Vector2(hemR, -height * 0.97),
    new THREE.Vector2(bellyR, -height * 0.7), // lower-torso/belly point, between hem and waist
    new THREE.Vector2(waistR, -height * 0.55),
    new THREE.Vector2(top * 0.97, -height * 0.18),
    new THREE.Vector2(top, -height * 0.04),
    new THREE.Vector2(top * 0.9, 0),
  ];
  return new THREE.LatheGeometry(profile, 28);
}

// Builds one wrapped-fabric mesh from a pattern piece. Fold pieces
// (bodice/skirt halves) wrap from their x=0 fold edge and get a
// mirrored twin to cover both sides; full pieces (sleeve, pants
// panels, waistband) are centered on their own width and wrapped
// without a twin, since they already represent the whole piece.
// secondaryColor, when given, colors the mirrored twin differently
// from the first half — a two-tone/color-block panel split exactly at
// the piece's own center-front or center-back fold line.
function wrappedMesh(piece, radius, angleOffset, color, secondaryColor) {
  const group = new THREE.Group();
  const depth = 0.5;
  const isFold = piece.foldEdge === "left";

  function build(mirror, meshColor) {
    const shape = pathDataToShape(piece.pathData);
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 16 });
    if (!isFold) geo.translate(-piece.width / 2, 0, 0);
    subdivideWideTriangles(geo, radius * 0.3);
    bendAroundCylinder(geo, radius, angleOffset, mirror);
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
function attachAddOnPiece(root, addOn, parentPiece, radius, angleOffset, parentY, color, mirror = false, offsetX = 0, offsetZ = 0) {
  if (!addOn.anchor) return;
  const isFold = parentPiece.foldEdge === "left";
  const localX = isFold ? addOn.anchor.x : addOn.anchor.x - parentPiece.width / 2;
  const sign = mirror ? -1 : 1;
  const theta = (localX / radius) * sign + angleOffset;

  const shape = pathDataToShape(addOn.pathData);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: false });
  geo.translate(-addOn.width / 2, 0, 0);
  bendAroundCylinder(geo, radius + 0.55, theta, false);
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

function attachEmbroideryDecal(root, embroidery, anchorX, anchorY, parentPiece, radius, angleOffset, parentY, mirror = false, offsetX = 0, offsetZ = 0) {
  const isFold = parentPiece.foldEdge === "left";
  const localX = isFold ? anchorX : anchorX - parentPiece.width / 2;
  const sign = mirror ? -1 : 1;
  const theta = (localX / radius) * sign + angleOffset;

  const w = embroidery.width || 8;
  const h = embroidery.height || 8;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2, -h);
  shape.lineTo(-w / 2, -h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
  bendAroundCylinder(geo, radius + 0.6, theta, false);
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
    const torsoGroup = new THREE.Group();
    torsoGroup.add(wrappedMesh(front, radius, 0, color, secondary));
    torsoGroup.add(wrappedMesh(back, radius, Math.PI, color, secondary));
    torsoGroup.position.y = neckBaseY;
    root.add(torsoGroup);
    hipY = neckBaseY - front.height;

    // dress-form body just inside the garment, so it reads as a
    // figure filling the fabric rather than fabric floating in space
    const torsoFill = Math.min(0.94, preset.torsoFill * widthScale);
    const form = new THREE.Mesh(
      dressFormTorso(radius * torsoFill, front.height, preset.waistFactor, preset.hemFactor, preset.bellyFactor, radius * 0.97),
      mat,
    );
    form.position.y = neckBaseY;
    root.add(form);

    if (collar) {
      // Same fold-piece formula as the torso (width/π) — the collar
      // is a half piece too, so this is the radius that makes its
      // mirrored twin meet seamlessly at center back. The earlier
      // extra ×0.6 shrink made the collar wrap around itself more
      // than once, producing a self-overlapping mess.
      const collarRadius = Math.max(3, collar.width / Math.PI);
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
      attachAddOnPiece(root, pocket, front, radius, 0, neckBaseY, color);
    }
    if (embroidery && embroidery.placement !== "sleeve") {
      if (embroidery.placement === "back") {
        const anchorX = back.width * 0.5;
        const anchorY = back.height * 0.2;
        attachEmbroideryDecal(root, embroidery, anchorX, anchorY, back, radius, Math.PI, neckBaseY, false);
      } else {
        // left_chest / right_chest (and the unset default) — upper
        // chest, above where the pocket sits, mirrored to whichever
        // side was requested since front is a folded half-piece.
        const mirror = embroidery.placement === "right_chest";
        const anchorX = front.width * 0.4;
        const anchorY = front.height * 0.13;
        attachEmbroideryDecal(root, embroidery, anchorX, anchorY, front, radius, 0, neckBaseY, mirror);
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
    skirtGroup.add(wrappedMesh(front, radius, 0, color, secondary));
    skirtGroup.add(wrappedMesh(back, radius, Math.PI, color, secondary));
    skirtGroup.position.y = neckBaseY;
    root.add(skirtGroup);
    hipY = neckBaseY - front.height;

    if (pocket) {
      attachAddOnPiece(root, pocket, back, radius, Math.PI, neckBaseY, color);
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
