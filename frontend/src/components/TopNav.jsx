export default function TopNav({ tab, setTab }) {
  return (
    <nav className="topnav">
      <div className="brand">
        <span className="brand-mark" />
        Konveksi Studio
      </div>
      <div className="topnav-tabs">
        <button
          className={tab === "orders" ? "tab active" : "tab"}
          onClick={() => setTab("orders")}
        >
          Orders
        </button>
        <button
          className={tab === "layout" ? "tab active" : "tab"}
          onClick={() => setTab("layout")}
        >
          Cutting Layout
        </button>
      </div>
    </nav>
  );
}
