// 2D drawings of merchandise items, drawn from the drafted pieces
// (backend/draft/merch.go): the body outline is the piece's own path, and
// straps, pockets, brims and so on are placed from the other pieces'
// dimensions. Coordinates are cm, x = 0 on the center line, y = 0 at the top
// of the item's body.

const find = (pieces, re) => pieces.find((p) => re.test(p.name));

// A rounded-strap loop between two attachment points: a band `bandW` thick
// standing `rise` above y = 0.
function handleLoop(x1, x2, rise, bandW) {
  const o = bandW;
  return [
    `M ${x1 - o / 2} 0`,
    `C ${x1 - o / 2} ${-rise} ${x2 + o / 2} ${-rise} ${x2 + o / 2} 0`,
    `L ${x2 - o / 2} 0`,
    `C ${x2 - o / 2} ${-rise + o * 1.2} ${x1 + o / 2} ${-rise + o * 1.2} ${x1 + o / 2} 0`,
    "Z",
  ].join(" ");
}

function view(items, halfW, height, top, segments) {
  return { items, segments, width: Math.ceil(halfW), height, topPadding: top };
}

export function layoutMerchView(pieces, viewName, opts) {
  const { merchItem: item, accessories = [] } = opts;
  const front = viewName === "front";
  const items = [];
  const seam = (key, x1, y1, x2, y2) => items.push({ key, kind: "line", x1, y1, x2, y2, category: "seam" });
  // An open curve drawn as short line segments (paths are always filled).
  const curve = (key, [p0, c1, c2, p1], steps = 14) => {
    let prev = p0;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const cur = [
        u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
        u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1],
      ];
      seam(`${key}-${i}`, prev[0], prev[1], cur[0], cur[1]);
      prev = cur;
    }
  };
  const shape = (key, d, transform = "", category = "body") => items.push({ key, kind: "path", d, transform, category });

  let halfW = 20;
  let height = 40;
  let top = 4;
  let bodyBox = { x: -10, y: 0, width: 20, height: 20 };

  const body = find(pieces, /^body panel$/i);
  const pocket = find(pieces, /^pocket$/i);

  const centered = (p) => `translate(${-p.width / 2} 0)`;
  const addPocket = (p, body, y) => {
    if (!front || !p) return;
    shape("pocket", p.pathData, `translate(${-p.width / 2} ${y})`, "body");
    seam("pocket-hem", -p.width / 2, y + 2, p.width / 2, y + 2);
  };

  switch (item) {
    case "tote_bag": {
      if (!body) return null;
      halfW = body.width / 2 + 3;
      height = body.height;
      const handle = find(pieces, /^handle$/i);
      if (handle) {
        const rise = Math.max(8, (handle.width - body.width * 0.5) / 1.9);
        const x = body.width * 0.27;
        shape("handle", handleLoop(-x, x, rise, handle.height * 0.5));
        top = rise + 3;
      }
      shape("body", body.pathData, centered(body));
      if (find(pieces, /gusset/i)) seam("gusset", -body.width / 2 + 1, body.height - 3, body.width / 2 - 1, body.height - 3);
      addPocket(pocket, body, body.height * 0.35);
      bodyBox = { x: -body.width / 2, y: 0, width: body.width, height: body.height };
      break;
    }
    case "drawstring_bag": {
      if (!body) return null;
      halfW = body.width / 2 + 2;
      height = body.height;
      shape("body", body.pathData, centered(body));
      seam("channel", -body.width / 2, 4, body.width / 2, 4);
      if (find(pieces, /cord/i)) {
        for (const s of [-1, 1]) {
          curve(`cord-${s}`, [[s * 2, 4], [s * 2, -6], [s * 9, -6], [s * 6, 4]]);
        }
        top = 9;
      }
      addPocket(pocket, body, body.height * 0.4);
      bodyBox = { x: -body.width / 2, y: 0, width: body.width, height: body.height };
      break;
    }
    case "pouch": {
      if (!body) return null;
      halfW = body.width / 2 + 2;
      height = body.height;
      shape("body", body.pathData, centered(body));
      const flap = find(pieces, /^flap$/i);
      if (flap && front) {
        shape("flap", flap.pathData, centered(flap));
      } else {
        seam("zip", -body.width / 2 + 1.5, 1.6, body.width / 2 - 1.5, 1.6);
        if (front) items.push({ key: "zip-pull", kind: "circle", cx: body.width / 2 - 3, cy: 1.6, r: 0.7, category: "button" });
      }
      bodyBox = { x: -body.width / 2, y: 0, width: body.width, height: body.height };
      break;
    }
    case "apron": {
      const apron = find(pieces, /^apron body$/i);
      if (!apron) return null;
      const bib = find(pieces, /^bib$/i);
      const bibH = bib ? bib.height : 0;
      halfW = apron.width / 2 + 14;
      height = apron.height + bibH;
      if (bib) {
        shape("bib", bib.pathData, `translate(${-bib.width / 2} 0)`);
        curve("neck-strap", [[-bib.width / 2 + 2, 0], [-bib.width / 2 + 2, -14], [bib.width / 2 - 2, -14], [bib.width / 2 - 2, 0]]);
        top = 12;
      }
      shape("body", apron.pathData, `translate(${-apron.width / 2} ${bibH})`);
      // Waist ties, one each side, tapering off.
      const tie = find(pieces, /waist tie/i);
      for (const s of [-1, 1]) {
        const x0 = s * apron.width / 2;
        shape(`tie-${s}`, `M ${x0} ${bibH + 1} L ${x0 + s * 13} ${bibH + 5} L ${x0 + s * 13} ${bibH + 5 + (tie ? tie.height * 0.5 : 3)} L ${x0} ${bibH + 3.5} Z`);
      }
      addPocket(pocket, apron, bibH + apron.height * 0.35);
      bodyBox = { x: -apron.width / 2, y: bibH, width: apron.width, height: apron.height };
      break;
    }
    case "bucket_hat": {
      const crown = find(pieces, /crown top/i);
      const band = find(pieces, /side band/i);
      if (!crown || !band) return null;
      const R = crown.width / 2;
      const h = band.height;
      const brimHalf = find(pieces, /brim half/i);
      const brimR = brimHalf ? brimHalf.width / 2 : R;
      const ry = 0.3;
      halfW = brimR + 2;
      top = R * ry + 3;
      // Brim behind, side band, then the crown cap.
      if (brimHalf) shape("brim", `M ${-brimR} ${h} A ${brimR} ${brimR * ry} 0 0 0 ${brimR} ${h} A ${brimR} ${brimR * ry} 0 0 0 ${-brimR} ${h} Z`);
      const topR = R * 0.9;
      shape("side", `M ${-R} ${h} L ${-topR} 0 A ${topR} ${topR * ry} 0 0 1 ${topR} 0 L ${R} ${h} A ${R} ${R * ry} 0 0 1 ${-R} ${h} Z`);
      shape("crown", `M ${-topR} 0 A ${topR} ${topR * ry} 0 0 1 ${topR} 0 A ${topR} ${topR * ry} 0 0 1 ${-topR} 0 Z`);
      height = h + brimR * ry;
      bodyBox = { x: -R, y: 0, width: R * 2, height: h };
      break;
    }
    case "headband": {
      const band = find(pieces, /^band$/i);
      if (!band) return null;
      halfW = band.width / 2 + 2;
      height = band.height;
      shape("band", band.pathData, `translate(${-band.width / 2} 0)`);
      seam("seam", 0, 0, 0, band.height);
      bodyBox = { x: -band.width / 2, y: 0, width: band.width, height: band.height };
      break;
    }
    case "patch": {
      const p = find(pieces, /^patch$/i);
      if (!p) return null;
      halfW = p.width / 2 + 1;
      height = p.height;
      shape("patch", p.pathData, `translate(${-p.width / 2} 0)`);
      const inset = Math.min(p.width, p.height) * 0.12;
      items.push({ key: "stitch", kind: "rect", x: -p.width / 2 + inset, y: inset, width: p.width - inset * 2, height: p.height - inset * 2, rx: inset, category: "seam", stitch: true });
      bodyBox = { x: -p.width / 2, y: 0, width: p.width, height: p.height };
      break;
    }
    case "lanyard": {
      const s = find(pieces, /^strap$/i);
      if (!s) return null;
      // Laid out as a loop: two long sides and a clip at the bottom.
      const len = s.width / 2;
      const w = Math.max(2.5, s.height / 2);
      halfW = 9;
      height = len * 0.7;
      shape("left", `M -8 0 L ${-8 + w} 0 L ${-1 + w / 2} ${height - 6} L ${-1 - w / 2} ${height - 6} Z`);
      shape("right", `M ${8 - w} 0 L 8 0 L ${1 + w / 2} ${height - 6} L ${1 - w / 2} ${height - 6} Z`);
      shape("clip", `M -3 ${height - 6} L 3 ${height - 6} L 3 ${height} L -3 ${height} Z`);
      items.push({ key: "clip-hole", kind: "circle", cx: 0, cy: height - 3, r: 0.9, category: "button" });
      bodyBox = { x: -3, y: height - 6, width: 6, height: 6 };
      break;
    }
    case "banner": {
      const b = find(pieces, /^banner$/i);
      if (!b) return null;
      halfW = b.width / 2 + 3;
      height = b.height;
      shape("banner", b.pathData, `translate(${-b.width / 2} 0)`);
      // A pennant is a triangle (two straight edges after the start); a
      // rectangle has a pole channel folded across the top.
      if ((b.pathData.match(/L/g) || []).length > 2) seam("channel", -b.width / 2, 4, b.width / 2, 4);
      bodyBox = { x: -b.width / 2, y: 0, width: b.width, height: b.height };
      break;
    }
    default:
      return null;
  }

  // Embroidery and sablon placed on the body, in fractions of the frame.
  const segment = front ? "center_front" : "back";
  for (const acc of accessories) {
    if (acc.type === "pocket" || acc.segment !== segment) continue;
    const w = acc.width || 6;
    const h = acc.height || 6;
    const fx = acc.position ? acc.position.x : 0;
    const fy = acc.position ? acc.position.y : (bodyBox.y + bodyBox.height * 0.35) / height;
    items.push({
      key: `acc-${acc.id}`,
      accessoryId: acc.id,
      segment,
      kind: "rect",
      x: fx * halfW - w / 2,
      y: fy * height - h / 2,
      width: w,
      height: h,
      category: acc.type,
      label: acc.label,
      rotation: acc.rotation || 0,
      fraction: { x: fx, y: fy },
      fractionKind: "signed",
    });
  }

  const segments = [{ key: `seg-${segment}`, segment, x: bodyBox.x, y: bodyBox.y, width: bodyBox.width, height: bodyBox.height, label: front ? "Front" : "Back", allowsPocket: false }];
  return view(items, halfW, height, top, segments);
}
