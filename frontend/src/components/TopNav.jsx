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
        className={tab === "grading" ? "tab active" : "tab"}
        onClick={() => setTab("grading")}
      >
        Size Grading
      </button>
      <button
        className={tab === "child-grading" ? "tab active" : "tab"}
        onClick={() => setTab("child-grading")}
      >
        Kids' Sizing
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
