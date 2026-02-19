import "./layout.css";
import { useContext, useEffect } from "react";
import {
  DataContext,
  DataDispatchContext,
  dataReducer,
} from "../context/DataContext.jsx";
import Viewport from "../viewport/viewport.jsx";
import { toast } from "sonner";
import LoadingPage from "../components/LoadingPage.jsx";

export default function Layout() {
  const { ld, renderingEngine, sessionId, isRequestLoading } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);

  useEffect(() => {
    var urlData = Object.fromEntries(new URLSearchParams(window.location.search));
    if (sessionId == null && urlData?.s != null && sessionId !== undefined) {
      toast("The session does not exist or you do not have access");
    }
  }, [sessionId]);

  useEffect(() => {
    const handleResize = () => { renderingEngine.resize(true); };
    if (renderingEngine) window.addEventListener("resize", handleResize);
    return () => { window.removeEventListener("resize", handleResize); };
  }, [renderingEngine]);

  // Guard: ld is undefined while session data is being fetched — return early before destructuring
  if (isRequestLoading || !ld) {
    return <LoadingPage />;
  }

  const { r, c } = ld;

  const items = Array.from({ length: r * c }).map((_, idx) => (
    <div key={idx} className="grid-item">
      <Viewport viewport_idx={idx} rendering_engine={renderingEngine} />
    </div>
  ));

  return renderingEngine ? (
    <div
      className="grid-container"
      style={{
        gridTemplateColumns: `repeat(${c}, 1fr)`,
        gridTemplateRows: `repeat(${r}, 1fr)`,
      }}
    >
      {items}
    </div>
  ) : null;
}
