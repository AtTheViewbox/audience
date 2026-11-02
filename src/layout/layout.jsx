import "./layout.css";
import { useContext, useEffect, useState } from "react";
import {
  DataContext,
} from "../context/DataContext.jsx";
import Viewport from "../viewport/viewport.jsx";
import { toast } from "sonner";
import LoadingPage from "../components/LoadingPage.jsx";

const PORTRAIT_QUERY = "(max-aspect-ratio: 1/1)";

function usePortraitScreen() {
  const [portrait, setPortrait] = useState(() =>
    typeof window !== "undefined" && window.matchMedia(PORTRAIT_QUERY).matches
  );
  useEffect(() => {
    const media = window.matchMedia(PORTRAIT_QUERY);
    const update = () => setPortrait(media.matches);
    update();
    media.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      media.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return portrait;
}

/** A 3-by-2 grid is too wide on a tall phone. Show the same viewports as 2-by-3. */
function gridForScreen(rows, cols, portrait) {
  const r = Number(rows) || 1;
  const c = Number(cols) || 1;
  if (portrait && c === 3 && r === 2) return { r: 3, c: 2 };
  return { r, c };
}

/**
 * Five series sit as three plus two. Portrait puts three across the top and
 * two across the bottom. Landscape stacks three on the left and two on the right.
 */
function quintPlacement(portrait) {
  if (portrait) {
    return {
      r: 2,
      c: 6,
      cells: [
        { gridColumn: "1 / 3", gridRow: "1" },
        { gridColumn: "3 / 5", gridRow: "1" },
        { gridColumn: "5 / 7", gridRow: "1" },
        { gridColumn: "1 / 4", gridRow: "2" },
        { gridColumn: "4 / 7", gridRow: "2" },
      ],
    };
  }
  return {
    r: 6,
    c: 2,
    cells: [
      { gridColumn: "1", gridRow: "1 / 3" },
      { gridColumn: "1", gridRow: "3 / 5" },
      { gridColumn: "1", gridRow: "5 / 7" },
      { gridColumn: "2", gridRow: "1 / 4" },
      { gridColumn: "2", gridRow: "4 / 7" },
    ],
  };
}

/**
 * Three series sit as two plus one. Portrait puts the pair on top and the
 * single series across the bottom. Landscape stacks the pair and gives the
 * single series the full height beside them.
 */
function pairedPlacement(count, portrait) {
  const pairs = Math.floor(count / 2);
  const cells = [];
  if (portrait) {
    for (let i = 0; i < pairs; i++) {
      const row = String(i + 1);
      cells.push({ gridColumn: "1", gridRow: row });
      cells.push({ gridColumn: "2", gridRow: row });
    }
    cells.push({ gridColumn: "1 / -1", gridRow: String(pairs + 1) });
    return { r: pairs + 1, c: 2, cells };
  }
  for (let i = 0; i < pairs; i++) {
    const column = String(i + 1);
    cells.push({ gridColumn: column, gridRow: "1" });
    cells.push({ gridColumn: column, gridRow: "2" });
  }
  cells.push({ gridColumn: String(pairs + 1), gridRow: "1 / -1" });
  return { r: 2, c: pairs + 1, cells };
}

export default function Layout() {
  const { ld, renderingEngine, sessionId, isRequestLoading, compareNormal, fullscreenViewport } = useContext(DataContext).data;
  const portrait = usePortraitScreen();

  useEffect(() => {
    var urlData = Object.fromEntries(new URLSearchParams(window.location.search));
    if (sessionId == null && urlData?.s != null && sessionId !== undefined) {
      toast("The session does not exist or you do not have access");
    }
  }, [sessionId]);

  useEffect(() => {
    if (!renderingEngine) return;
    let rafId = 0;
    const handleResize = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        renderingEngine.resize(true);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [renderingEngine]);

  // Trigger resize when the series count or the fitted grid changes. A second
  // frame lets the new cells finish layout before Cornerstone measures them.
  useEffect(() => {
    if (!renderingEngine || !ld) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => renderingEngine.resize(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      if (inner) cancelAnimationFrame(inner);
    };
  }, [renderingEngine, ld?.r, ld?.c, fullscreenViewport, portrait]);

  // Guard: ld is undefined while session data is being fetched — return early before destructuring
  if (isRequestLoading || !ld) {
    return <LoadingPage />;
  }

  const sourceRows = Number(ld.r) || 1;
  const sourceCols = Number(ld.c) || 1;
  const sourceCount = sourceRows * sourceCols;
  const paired = sourceCount === 5 ? quintPlacement(portrait) : sourceCount === 3 ? pairedPlacement(sourceCount, portrait) : null;
  const { r, c } = paired ?? gridForScreen(sourceRows, sourceCols, portrait);
  const isFullscreen = fullscreenViewport != null && sourceCount > 1;

  const isComparing = compareNormal?.active;
  const items = Array.from({ length: sourceCount }).map((_, idx) => (
    <div
      key={idx}
      className={`grid-item${isFullscreen && fullscreenViewport === idx ? ' grid-item--fullscreen' : ''}${isFullscreen && fullscreenViewport !== idx ? ' grid-item--hidden' : ''}`}
      style={{ position: 'relative', ...(paired && !isFullscreen ? paired.cells[idx] : {}) }}
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
