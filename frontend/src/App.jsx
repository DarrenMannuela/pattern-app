import { useState } from "react";
import TopNav from "./components/TopNav";
import OrdersView from "./components/OrdersView";
import OrderDetailView from "./components/OrderDetailView";
import LayoutView from "./components/LayoutView";

export default function App() {
  const [tab, setTab] = useState("orders");
  // An order can be opened by link: http://localhost:5175/#order-12
  const [openOrderId, setOpenOrderIdState] = useState(() => window.location.hash.match(/^#order-(\w+)$/)?.[1] || null);

  function setOpenOrderId(id) {
    window.history.replaceState(null, "", id ? `#order-${id}` : window.location.pathname);
    setOpenOrderIdState(id);
  }

  function handleSetTab(next) {
    setOpenOrderId(null);
    setTab(next);
  }

  return (
    <div className="app-shell">
      <TopNav tab={tab} setTab={handleSetTab} />
      {tab === "orders" && !openOrderId && <OrdersView onOpenOrder={setOpenOrderId} />}
      {tab === "orders" && openOrderId && (
        <OrderDetailView orderId={openOrderId} onBack={() => setOpenOrderId(null)} />
      )}
      {tab === "layout" && <LayoutView />}
    </div>
  );
}
