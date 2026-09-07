export default function TopNav({ tab, setTab }) {
  return (
    <nav className="topnav">
      <button
        className={tab === "draft" ? "tab active" : "tab"}
        onClick={() => setTab("draft")}
      >
        Draft Pieces
      </button>
      <button
        className={tab === "layout" ? "tab active" : "tab"}
        onClick={() => setTab("layout")}
      >
        Cutting Layout
      </button>
    </nav>
  );
}
