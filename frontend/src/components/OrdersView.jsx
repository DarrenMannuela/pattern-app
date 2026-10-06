import { useEffect, useState } from "react";
import { api } from "../api";
import GarmentTypePicker from "./GarmentTypePicker";
import BackupStatus from "./BackupStatus.jsx";
import { GARMENT_LABELS } from "../lib/garmentTypes.js";

const STATUS_LABELS = {
  consultation: "Consultation",
  mockup: "Mockup",
  revision: "Revision",
  approved: "Approved",
};

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const pieces = (o) => (o.sizes || []).reduce((t, sz) => t + (Number(sz.quantity) || 0), 0);
const lastTouched = (o) => Date.parse(o.updatedAt || o.createdAt || 0) || 0;
const shortDate = (o) => {
  const t = lastTouched(o);
  return t ? new Date(t).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "";
};

// Whether an order matches what was typed: its customer, contact, garment or number.
function matches(o, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [o.customerName, o.contactInfo, GARMENT_LABELS[o.garmentType] || o.garmentType, `#${o.id}`].some((v) => String(v || "").toLowerCase().includes(q));
}

export default function OrdersView({ onOpenOrder }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [garmentType, setGarmentType] = useState("school_shirt");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formOpen, setFormOpen] = useState(false); // the new-order form, on a phone

  function reload() {
    api
      .listOrders()
      .then(setOrders)
      .catch((e) => setError(e.message));
  }

  useEffect(reload, []);

  // Most recently changed first, narrowed to what was searched for.
  const shown = (orders || [])
    .filter((o) => (statusFilter === "all" || o.status === statusFilter) && matches(o, query))
    .sort((a, b) => lastTouched(b) - lastTouched(a) || Number(b.id) - Number(a.id));

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const order = await api.createOrder({
        customerName: name.trim(),
        garmentType,
      });
      setName("");
      onOpenOrder(order.id);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(o, e) {
    e.stopPropagation();
    const what = `"${o.customerName || "Untitled order"}" (${GARMENT_LABELS[o.garmentType] || o.garmentType}, ${plural(o.mockups?.length || 0, "revision")})`;
    if (!confirm(`Delete ${what}? This can't be undone.`)) return;
    try {
      await api.deleteOrder(o.id);
      reload();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="tab-body">
      <aside className="sidebar">
        <div className="sidebar-head">
          <h1>Orders</h1>
          {/* On a phone the new-order form folds away behind this button. */}
          <button type="button" className="phone-only btn-add btn-inline" onClick={() => setFormOpen((o) => !o)} aria-expanded={formOpen}>
            {formOpen ? "Close" : "+ New order"}
          </button>
        </div>
        <p className="sub">
          Every uniform order starts here. Create one for a customer,
          then open it to build out the size chart, pick a fabric, and
          generate a mockup.
        </p>

        <div className={`phone-fold${formOpen ? " is-open" : ""}`}>
        <div className="field">
          <label>Customer / school name</label>
          <input
            type="text"
            placeholder="e.g. SDN 01 Menteng"
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <label style={{ display: "block", fontSize: "11.5px", color: "var(--text-3)", marginBottom: 8 }}>
          Garment type
        </label>
        <GarmentTypePicker value={garmentType} onChange={setGarmentType} />

        <button
          className="btn-generate"
          onClick={handleCreate}
          disabled={creating || !name.trim()}
        >
          {creating ? "Creating…" : "+ New order"}
        </button>
        </div>

        {error && <p className="error">{error}</p>}
        <BackupStatus />
      </aside>

      <main>
        {!orders && !error && <p className="empty">Loading orders…</p>}
        {!orders && error && (
          <div className="empty load-failed" role="alert">
            <p>Couldn't load your orders.</p>
            <p className="load-failed-detail">{error}</p>
            <div className="load-failed-actions">
              <button
                className="btn-add btn-inline"
                onClick={() => {
                  setError(null);
                  reload();
                }}
              >
                Try again
              </button>
            </div>
          </div>
        )}
        {orders && orders.length === 0 && (
          <p className="empty">
            No orders yet — create one on the left to get started.
          </p>
        )}
        {orders && orders.length > 0 && (
          <>
            <div className="orders-toolbar">
              <input
                type="search"
                className="orders-search"
                placeholder="Search customer, garment or order number"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search orders"
              />
              <div className="pm-fit-chips" role="radiogroup" aria-label="Show orders by status">
                {["all", ...Object.keys(STATUS_LABELS)].map((st) => {
                  const n = st === "all" ? orders.length : orders.filter((o) => o.status === st).length;
                  if (st !== "all" && !n) return null;
                  return (
                    <button type="button" key={st} role="radio" aria-checked={statusFilter === st} className={`pm-ref-chip${statusFilter === st ? " pm-ref-chip-on" : ""}`} onClick={() => setStatusFilter(st)}>
                      {st === "all" ? "All" : STATUS_LABELS[st]} <span className="orders-chip-count">{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {shown.length === 0 && <p className="empty">No orders match.</p>}
            <div className="order-list">
              {shown.map((o) => (
                <div className="order-row" key={o.id} onClick={() => onOpenOrder(o.id)}>
                  <div className="order-row-main">
                    <button
                      type="button"
                      className="order-row-name"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenOrder(o.id);
                      }}
                    >
                      {o.customerName || "Untitled order"}
                    </button>
                    <span className="order-row-garment mono">
                      {GARMENT_LABELS[o.garmentType] || o.garmentType} · #{o.id}
                    </span>
                  </div>
                  <div className="order-row-meta">
                    <span className="order-status" data-status={o.status}>
                      {STATUS_LABELS[o.status] || o.status}
                    </span>
                    <span className="mono order-row-count">
                      {plural(o.sizes?.length || 0, "size")}
                      {pieces(o) ? ` · ${pieces(o)} pcs` : ""} · {plural(o.mockups?.length || 0, "revision")}
                    </span>
                    <span className="mono order-row-date" title="Last changed">
                      {shortDate(o)}
                    </span>
                    <button className="order-row-delete" onClick={(e) => handleDelete(o, e)} title="Delete order" aria-label={`Delete ${o.customerName || "order"}`}>
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
