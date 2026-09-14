import { useState } from "react";
import TopNav from "./components/TopNav";
import DraftView from "./components/DraftView";
import GradingView from "./components/GradingView";
import ChildGradingView from "./components/ChildGradingView";
import LayoutView from "./components/LayoutView";

export default function App() {
  const [tab, setTab] = useState("draft");

  return (
    <div className="app-shell">
      <TopNav tab={tab} setTab={setTab} />
      {tab === "draft" && <DraftView />}
      {tab === "grading" && <GradingView />}
      {tab === "child-grading" && <ChildGradingView />}
      {tab === "layout" && <LayoutView />}
    </div>
  );
}
