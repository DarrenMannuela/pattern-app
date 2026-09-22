import { useEffect, useState } from "react";
import TopNav from "./components/TopNav";
import OrdersView from "./components/OrdersView";
import OrderDetailView from "./components/OrderDetailView";
import LayoutView from "./components/LayoutView";

const hashOrderId = () => window.location.hash.match(/^#order-(\w+)$/)?.[1] || null;

export default function App() {
  const [tab, setTab] = useState("orders");
  // An order can be opened by link: http://localhost:5175/#order-12
  const [openOrderId, setOpenOrderIdState] = useState(hashOrderId);

  // The app writes the hash itself (below) whenever the user opens or closes
  // an order — but the hash can also change without the app's own doing: the
  // browser's back/forward buttons, or a link to a different order pasted or
  // clicked while this tab is already open. Without this, only the address
  // bar would update; the order actually shown would silently stay whatever
  // was open before.
  useEffect(() => {
    function onHashChange() {
      const id = hashOrderId();
      setOpenOrderIdState(id);
      setTab("orders"); // an order link always means "show me that order"
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
