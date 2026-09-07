import { useState } from "react";
import TopNav from "./components/TopNav";
import DraftView from "./components/DraftView";
import LayoutView from "./components/LayoutView";

export default function App() {
  const [tab, setTab] = useState("draft");

  return (
    <div className="app-shell">
      <TopNav tab={tab} setTab={setTab} />
      {tab === "draft" ? <DraftView /> : <LayoutView />}
    </div>
  );
}
