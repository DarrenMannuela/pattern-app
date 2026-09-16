import { useEffect, useState } from "react";
import { api } from "../api";
import GarmentTypePicker, { GARMENT_LABELS } from "./GarmentTypePicker";

const STATUS_LABELS = {
  consultation: "Consultation",
  mockup: "Mockup",
  revision: "Revision",
  approved: "Approved",
};

const STATUS_COLORS = {
  consultation: "#7A5B9C",
  mockup: "#5B6E9C",
  revision: "#B5453D",
  approved: "#4B8C5A",
};

export default function OrdersView({ onOpenOrder }) {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [garmentType, setGarmentType] = useState("school_shirt");

  function reload() {
    api
      .listOrders()
      .then(setOrders)
      .catch((e) => setError(e.message));
  }

  useEffect(reload, []);

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

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!confirm("Delete this order? This can't be undone.")) return;
    try {
      await api.deleteOrder(id);
      reload();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="tab-body">
      <aside className="sidebar">
        <h1>Orders</h1>
        <p className="sub">
          Every uniform order starts here. Create one for a customer,
          then open it to build out the size chart, pick a fabric, and
          generate a mockup.
        </p>

        <div className="field">
          <label>Customer / school name</label>
          <input
            type="text"
            placeholder="e.g. SDN 01 Menteng"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <label style={{ display: "block", fontSize: "11.5px", color: "#9aa0a5", marginBottom: 8 }}>
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

        {error && <p className="error">{error}</p>}

        <p className="note">
          "Other merch" doesn't have pattern drafting built yet — the
          order still gets tracked (customer, size chart, notes), and
          the mockup step will tell you directly when you try.
        </p>
      </aside>

      <main>
        {!orders && !error && <p className="empty">Loading orders…</p>}
        {orders && orders.length === 0 && (
          <p className="empty">
            No orders yet — create one on the left to get started.
          </p>
        )}
        {orders && orders.length > 0 && (
          <div className="order-list">
            {orders
              .slice()
              .reverse()
              .map((o) => (
                <div
                  className="order-row"
                  key={o.id}
                  onClick={() => onOpenOrder(o.id)}
                >
                  <div className="order-row-main">
                    <span className="order-row-name">
                      {o.customerName || "Untitled order"}
                    </span>
                    <span className="order-row-garment mono">
                      {GARMENT_LABELS[o.garmentType] || o.garmentType}
                    </span>
                  </div>
                  <div className="order-row-meta">
                    <span
                      className="order-status"
                      style={{ background: STATUS_COLORS[o.status] || "#787e82" }}
                    >
                      {STATUS_LABELS[o.status] || o.status}
                    </span>
                    <span className="mono order-row-count">
                      {o.sizes?.length || 0} sizes · {o.mockups?.length || 0} revisions
                    </span>
                    <button
                      className="order-row-delete"
                      onClick={(e) => handleDelete(o.id, e)}
                      title="Delete order"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>
    </div>
  );
}
