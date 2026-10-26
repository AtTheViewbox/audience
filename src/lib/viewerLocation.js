import { unflatten } from "flat";
import * as cornerstoneTools from "@cornerstonejs/tools";
import { recreateList } from "./inputParser.ts";
import {
  extractSearchString,
  getPlaylistIdFromSearch,
  resolveCaseUrlKey,
  sessionViewerUrlParams,
} from "./answerKeyCase.js";

/** Same parse the viewer uses on first load, so a transfer can reuse it. */
export function parseViewerSearch(search) {
  const params = new URLSearchParams(extractSearchString(search));
  const data = unflatten(Object.fromEntries(params));
  if (Array.isArray(data.vd)) {
    data.vd.forEach((vdItem) => {
      if (vdItem?.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
        vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e, vdItem.s.D);
      }
    });
  }
  return data;
}

export const VIEWER_DIALOG_CLOSE_EVENT = "atvb-close-viewer-dialog";

/** Close the share / series dialog after a transfer or series switch. */
export function closeViewerDialog() {
  window.dispatchEvent(new Event(VIEWER_DIALOG_CLOSE_EVENT));
}

/** Point the address bar at the case without reloading the app. */
export function replaceViewerUrl(href) {
  const url = new URL(href, window.location.origin);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  window.history.replaceState(window.history.state, "", next);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * Switch the open viewer to another case. Keeps the session connection and
 * swaps images, questions, and the URL in place.
 */
export function applyViewerUrl(href, dispatch) {
  if (!dispatch) {
    window.location.assign(href);
    return;
  }
  replaceViewerUrl(href);
  const search = window.location.search;
  const parsed = parseViewerSearch(search);
  if (!Array.isArray(parsed.vd) || parsed.vd.length === 0) return;

  try {
    cornerstoneTools.annotation.state.removeAllAnnotations();
  } catch {
    // Tools are not ready until the viewer has mounted.
  }

  const caseUrlParams = sessionViewerUrlParams(search);
  dispatch({
    type: "switch_viewer",
    payload: {
      vd: parsed.vd,
      ld: parsed.ld,
      m: parsed.m,
      caseUrlParams,
      playlistId: getPlaylistIdFromSearch(search) || null,
      caseUrlKey: resolveCaseUrlKey({ search, caseUrlParams }) || null,
    },
  });
  closeViewerDialog();
}
