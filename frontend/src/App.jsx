import { useEffect, useState } from "react";
import TopNav from "./components/TopNav";
import OrdersView from "./components/OrdersView";
import OrderDetailView from "./components/OrderDetailView";
import LayoutView from "./components/LayoutView";
import ErrorBoundary from "./components/ErrorBoundary";
import PatternSheet from "./components/PatternSheet.jsx";

const hashOrderId = () => window.location.hash.match(/^#order-(\w+)$/)?.[1] || null;
// A pattern sheet opens in its own tab: #sheet-12-v3 is order 12, revision 3.
const hashSheet = () => {
  const m = window.location.hash.match(/^#sheet-(\w+)-v(\d+)$/);
  return m ? { orderId: m[1], version: Number(m[2]) } : null;
};

// Shown when a screen fails to draw. The rest of the app (the nav, the other
// tabs) keeps working, and nothing saved is affected.
function ScreenCrashed({ error, onRetry, onHome }) {
  return (
    <div className="tab-body">
      <main>
        <div className="empty load-failed" role="alert">
          <p>
            This screen ran into a problem and couldn't be shown. Your saved orders are safe.
          </p>
          {error?.message && <p className="load-failed-detail">{error.message}</p>}
          <div className="load-failed-actions">
            <button className="btn-add btn-inline" onClick={onRetry}>Try again</button>
            <button className="btn-add btn-inline btn-ghost" onClick={onHome}>Back to orders</button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [sheet, setSheet] = useState(hashSheet);
  useEffect(() => {
    const onHash = () => setSheet(hashSheet());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (sheet) {
    return (
      <ErrorBoundary fallback={<p className="empty">The pattern sheet couldn't be shown.</p>}>
        <PatternSheet
          orderId={sheet.orderId}
          version={sheet.version}
          onBack={() => {
            window.location.hash = `#order-${sheet.orderId}`;
          }}
        />
      </ErrorBoundary>
    );
  }
  return <Studio />;
}

function Studio() {
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
      <ErrorBoundary
        key={`${tab}:${openOrderId || ""}`}
        fallback={(error, retry) => (
          <ScreenCrashed
            error={error}
            onRetry={retry}
            onHome={() => {
              setOpenOrderId(null);
              setTab("orders");
            }}
          />
        )}
      >
        {tab === "orders" && !openOrderId && <OrdersView onOpenOrder={setOpenOrderId} />}
        {tab === "orders" && openOrderId && (
          <OrderDetailView orderId={openOrderId} onBack={() => setOpenOrderId(null)} />
        )}
        {tab === "layout" && <LayoutView />}
      </ErrorBoundary>
    </div>
  );
}
