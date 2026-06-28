/**
 * Derive the dicom_series.prefix value used for DB lookup from viewer inputs.
 * The viewer URL encodes this as vd.*.s.pf; after load it may only exist on data.vd.
 */

function stripLoaderScheme(value) {
  return decodeURI(String(value)).replace(/^(dicomweb:|wadouri:|wadors:)/, "");
}

function longestCommonPrefix(strs) {
  if (!strs.length) return "";
  if (strs.length === 1) {
    const parts = strs[0].split("/");
    return parts.slice(0, parts.length - 1).join("/") + "/";
  }
  const sorted = [...strs].sort();
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  let prefix = "";
  for (let i = 0; i < first.length; i++) {
    if (first[i] === last[i]) prefix += first[i];
    else break;
  }
  return prefix;
}

export function prefixFromSearchParams(search = window.location.search) {
  const params = new URLSearchParams(search);
  for (const [key, value] of params.entries()) {
    if (key.endsWith(".s.pf")) {
      const prefix = stripLoaderScheme(value);
      return prefix || null;
    }
  }
  return null;
}

export function prefixFromViewportData(vd) {
  if (!Array.isArray(vd) || vd.length === 0) return null;

  for (const vdItem of vd) {
    const s = vdItem?.s;
    if (!s) continue;

    // URL params not yet expanded into a slice list.
    if (s.pf) {
      const prefix = stripLoaderScheme(s.pf);
      if (prefix) return prefix;
    }

    // Expanded stack: derive prefix from image URLs.
    if (Array.isArray(s) && s.length > 0) {
      const urls = s.map((url) => stripLoaderScheme(url));
      const prefix = longestCommonPrefix(urls);
      if (prefix) return prefix;
    }
  }

  return null;
}

export function resolveSeriesPrefix({ search, vd }) {
  return prefixFromSearchParams(search) || prefixFromViewportData(vd);
}
