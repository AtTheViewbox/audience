/**
 * Conventional CT window/level presets (Hounsfield units).
 * Applied values are converted to stored pixel space via rescale slope/intercept.
 */
export const WINDOW_PRESETS = [
  { id: "soft", label: "Soft Tissue", ww: 400, wc: 40, key: "1" },
  { id: "lung", label: "Lung", ww: 1500, wc: -600, key: "2" },
  { id: "bone", label: "Bone", ww: 2000, wc: 300, key: "3" },
  { id: "brain", label: "Brain", ww: 80, wc: 40, key: "4" },
  { id: "liver", label: "Liver", ww: 150, wc: 30, key: "5" },
];

export function presetFromDigitKey(key) {
  return WINDOW_PRESETS.find((p) => p.key === key) ?? null;
}

/** Apply a HU window/level preset to every viewport on the rendering engine. */
export function applyWindowPreset(renderingEngine, wwHU, wcHU) {
  const cornerstone = typeof window !== "undefined" ? window.cornerstone : null;
  if (!renderingEngine || !cornerstone?.utilities?.windowLevel) return;

  for (const viewport of renderingEngine.getViewports()) {
    let ww = wwHU;
    let wc = wcHU;

    const imageId = viewport.getCurrentImageId?.();
    const image = imageId ? cornerstone.cache.getImage(imageId) : null;
    if (image) {
      const slope = image.slope ?? 1;
      const intercept = image.intercept ?? 0;
      ww = wwHU / slope;
      wc = (wcHU - intercept) / slope;
    }

    viewport.setProperties({
      voiRange: cornerstone.utilities.windowLevel.toLowHighRange(ww, wc),
      isComputedVOI: false,
    });
    viewport.render();
    // Viewport.jsx caches VOI on mouseup so scroll doesn't revert the preset.
    viewport.element?.dispatchEvent(new MouseEvent("mouseup"));
  }
}
