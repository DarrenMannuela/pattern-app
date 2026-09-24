// Small pure helpers for working with the fabric catalog (backend/catalog/
// fabric.go via GET /api/fabrics), shared between the sidebar Fabric section
// and the Design Preview panel's own compact picker so both read a fabric's
// identity and grouping the same way.

// A catalog fabric's stored/displayed identity: brand-qualified when it has
// one, since two brands can share a plain name (Verlando and Maryland both
// sell a "Tropical Deluxe").
export const fabricLabel = (f) => (f.brand ? `${f.brand} — ${f.name}` : f.name);

// The key fabricColors (colors.json) is keyed by — the image filename
// stem, since that's the one identifier already unique per catalog entry.
export function fabricSlug(f) {
  return f.imageUrl?.match(/([^/]+)\.[a-z]+$/)?.[1];
}

// Groups the fabric list by brand, in the order each brand first appears,
// with the older brandless reference entries collected under one heading.
export function groupFabrics(fabrics) {
  const groups = new Map();
  for (const f of fabrics) {
    const key = f.brand || "Other reference fabrics";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  return [...groups.entries()];
}
