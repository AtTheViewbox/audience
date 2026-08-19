/** Featured case used by the home-page Demo launch. */
export const DEMO_CASE_SEARCH =
  "m=true&ld.r=1&ld.c=1&vd.0.s.pf=wadouri%3Ahttps%3A%2F%2Fdicom.attheviewbox.dev%2Fupload_1786768079057_0_4mo5yia6c%2F&vd.0.s.sf=.dcm&vd.0.s.s=70&vd.0.s.e=100&vd.0.s.D=1&vd.0.ww=375&vd.0.wc=1074&vd.0.ci=100&vd.0.z=1&vd.0.px=0&vd.0.py=0&vd.0.r=0";

export const DEMO_QUERY_PARAM = "demo";

export function isDemoMode(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get(DEMO_QUERY_PARAM);
  return value === "1" || value === "true";
}

/** True when this tab joined via a session link (`?s=`). */
export function isSessionJoin(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.has("s");
}

export function getDemoCaseHref() {
  const rootUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const params = new URLSearchParams(DEMO_CASE_SEARCH);
  params.set(DEMO_QUERY_PARAM, "1");
  return `${rootUrl}?${params.toString()}`;
}
