import "./layout.css";
import { useContext, useEffect } from "react";
import {
  DataContext,
} from "../context/DataContext.jsx";
import Viewport from "../viewport/viewport.jsx";
import { toast } from "sonner";
import LoadingPage from "../components/LoadingPage.jsx";

export default function Layout() {
  const { ld, renderingEngine, sessionId, isRequestLoading, compareNormal, fullscreenViewport } = useContext(DataContext).data;

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

  // Trigger resize when layout dimensions or fullscreen mode change
  useEffect(() => {
    if (renderingEngine && ld) {
      requestAnimationFrame(() => renderingEngine.resize(true));
    }
  }, [renderingEngine, ld?.r, ld?.c, fullscreenViewport]);

  // Guard: ld is undefined while session data is being fetched — return early before destructuring
  if (isRequestLoading || !ld) {
    return <LoadingPage />;
  }

  const { r, c } = ld;
  const isFullscreen = fullscreenViewport != null && r * c > 1;

  const isComparing = compareNormal?.active;
  const items = Array.from({ length: r * c }).map((_, idx) => (
    <div
      key={idx}
      className={`grid-item${isFullscreen && fullscreenViewport === idx ? ' grid-item--fullscreen' : ''}${isFullscreen && fullscreenViewport !== idx ? ' grid-item--hidden' : ''}`}
      style={{ position: 'relative' }}
    >
      <Viewport viewport_idx={idx} rendering_engine={renderingEngine} />
      {isComparing && (
        <div style={{
          position: 'absolute',
          top: 8,
          ...(idx === 0 ? { right: 8 } : { left: 8 }),
          zIndex: 20,
          background: idx === 0 ? 'rgba(59, 130, 246, 0.8)' : 'rgba(34, 197, 94, 0.8)',
          color: 'white',
          padding: '2px 10px',
          borderRadius: 6,
          fontSize: 11,
          fontWeight: 600,
          pointerEvents: 'none',
          letterSpacing: '0.02em',
        }}>
          {idx === 0 ? 'Patient' : 'Normal'}
        </div>
      )}
    </div>
  ));

  return renderingEngine ? (
    <div
      className={`grid-container${isFullscreen ? ' grid-container--fullscreen' : ''}`}
      style={isFullscreen ? undefined : {
        gridTemplateColumns: `repeat(${c}, 1fr)`,
        gridTemplateRows: `repeat(${r}, 1fr)`,
      }}
    >
      {items}
    </div>
  ) : null;
}
