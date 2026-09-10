/**
 * Helpers for linking the viewer to an answer-key case (studies, dicom_series, or URL).
 */

import { Visibility } from "./constants.js";
import { resolveSeriesPrefix } from "./seriesLink.js";

/** Viewer query param that pins questions to a specific studies row. */
export const CASE_ID_PARAM = "caseId";

export function extractSearchString(urlOrParams) {
  if (!urlOrParams) return "";
  const raw = String(urlOrParams);
  try {
    if (raw.startsWith("http")) {
      return new URL(raw).search.substring(1);
    }
  } catch {
    // fall through
  }
  return raw.startsWith("?") ? raw.slice(1) : raw;
}

export function getCaseIdFromSearch(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(extractSearchString(search));
  return params.get(CASE_ID_PARAM) || null;
}

/** Image-only URL key: strips session, demo, preview, and case identity. */
export function normalizeUrlParams(input) {
  if (!input) return "";
  const raw = extractSearchString(input);
  if (!raw) return "";

  const params = new URLSearchParams(raw);
  params.delete("s");
  params.delete("preview");
  params.delete("demo");
  params.delete(CASE_ID_PARAM);

  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

/** Open this teaching case in the viewer (same images, this case's questions). */
export function buildCaseViewerHref({ url_params, studyId, preview = false } = {}) {
  const rootUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
  const params = new URLSearchParams(extractSearchString(url_params));
  params.delete("s");
  if (studyId) params.set(CASE_ID_PARAM, studyId);
  else params.delete(CASE_ID_PARAM);
  if (preview) params.set("preview", "true");
  else params.delete("preview");
  return `${rootUrl}?${params.toString()}`;
}

export function buildUrlParamCandidates({ search, caseUrlParams }) {
  const candidates = new Set();

  const add = (value) => {
    if (!value) return;
    candidates.add(value);
    const params = new URLSearchParams(value);
    if (params.has("s")) {
      params.delete("s");
      const withoutSession = params.toString();
      if (withoutSession) candidates.add(withoutSession);
    }
  };

  if (search) {
    add(search.startsWith("?") ? search.slice(1) : search);
  }
  add(caseUrlParams);

  return [...candidates].filter(Boolean);
}

/** Stable key for direct viewer URLs (PACSbin, pasted links, etc.). */
export function resolveCaseUrlKey({ search, caseUrlParams }) {
  const normalized = buildUrlParamCandidates({ search, caseUrlParams })
    .map(normalizeUrlParams)
    .filter((key) => key.includes("vd."));
  if (normalized.length === 0) return null;
  return normalized.sort((a, b) => b.length - a.length)[0];
}

export async function findStudyForViewer(supabaseClient, { search, caseUrlParams, userId }) {
  const caseId =
    getCaseIdFromSearch(search) || getCaseIdFromSearch(caseUrlParams || "");
  if (caseId) {
    const { data, error } = await supabaseClient
      .from("studies")
      .select("id, name, owner, url_params")
      .eq("id", caseId)
      .maybeSingle();
    if (!error && data) return data;
    // RLS may hide the row; still bind questions to this case id.
    return { id: caseId, name: null, owner: null, url_params: null };
  }

  const candidates = buildUrlParamCandidates({ search, caseUrlParams });
  if (candidates.length === 0) return null;

  for (const raw of candidates) {
    const { data, error } = await supabaseClient
      .from("studies")
      .select("id, name, owner, url_params")
      .eq("url_params", raw)
      .limit(1);
    if (!error && data?.length) return data[0];
  }

  const normalizedSet = new Set(
    candidates.map(normalizeUrlParams).filter(Boolean)
  );
  if (normalizedSet.size === 0) return null;

  const matchFromList = (studies) => {
    for (const study of studies || []) {
      if (normalizedSet.has(normalizeUrlParams(study.url_params))) return study;
    }
    return null;
  };

  if (userId) {
    const { data: owned } = await supabaseClient
      .from("studies")
      .select("id, name, owner, url_params")
      .eq("owner", userId);
    const ownedMatch = matchFromList(owned);
    if (ownedMatch) return ownedMatch;
  }

  const { data: publicStudies } = await supabaseClient
    .from("studies")
    .select("id, name, owner, url_params")
    .eq("visibility", Visibility.PUBLIC);

  return matchFromList(publicStudies);
}

export async function findPacsbinStudyForViewer(supabaseClient, { search, caseUrlParams, vd }) {
  const caseKey = resolveCaseUrlKey({ search, caseUrlParams });
  const prefix = resolveSeriesPrefix({ search, vd });
  if (!caseKey && !prefix) return null;

  const { data, error } = await supabaseClient
    .from("pacsbinStudies")
    .select("id, name, metadata");
  if (error || !data?.length) return null;

  for (const study of data) {
    const urls = (study.metadata || []).map((m) => m?.url).filter(Boolean);
    for (const url of urls) {
      if (caseKey && normalizeUrlParams(url) === caseKey) return study;
      if (prefix && url.includes(prefix)) return study;
    }
  }
  return null;
}

export function isCaseLinked({ studyId, dicomSeriesId, caseUrlKey }) {
  return !!(studyId || dicomSeriesId || caseUrlKey);
}

/**
 * Stable per-case key used to scope session submissions. A session keeps the
 * same id across a transfer even though the case changes, so submissions (and
 * the "already submitted" lock) must be keyed by the case, not just the session.
 */
export function caseKeyFromLink({ studyId, dicomSeriesId, caseUrlKey } = {}) {
  if (studyId) return `study:${studyId}`;
  if (dicomSeriesId) return `series:${dicomSeriesId}`;
  if (caseUrlKey) return `url:${caseUrlKey}`;
  return null;
}

export function caseDisplayName({ studyName, dicomSeriesName, pacsbinStudyName }) {
  return studyName || dicomSeriesName || pacsbinStudyName || null;
}

export function buildAnnotationInsert({ studyId, dicomSeriesId, caseUrlKey, userId, fields }) {
  // series_annotations_case_check requires exactly one of these three.
  const study_id = studyId || null;
  const dicom_series_id = study_id ? null : dicomSeriesId || null;
  const case_url_params =
    !study_id && !dicom_series_id && caseUrlKey ? caseUrlKey : null;

  return {
    user_id: userId,
    study_id,
    dicom_series_id,
    case_url_params,
    ...fields,
  };
}

export function applyAnnotationCaseFilter(query, { studyId, dicomSeriesId, caseUrlKey, userId }) {
  if (!query || !isCaseLinked({ studyId, dicomSeriesId, caseUrlKey })) {
    return null;
  }
  // Questions and boxes belong to the case once a study id is known.
  if (studyId) return query.eq("study_id", studyId);
  if (!userId) return null;
  let filtered = query.eq("user_id", userId);
  if (dicomSeriesId) return filtered.eq("dicom_series_id", dicomSeriesId);
  return filtered.eq("case_url_params", caseUrlKey);
}

/** Load questions for this case (not "that user's questions on these images"). */
export function applyQuestionCaseFilter(
  query,
  { studyId, dicomSeriesId, caseUrlKey, authorId }
) {
  if (!query || !isCaseLinked({ studyId, dicomSeriesId, caseUrlKey })) {
    return null;
  }
  let filtered = query.eq("kind", "question");
  if (studyId) return filtered.eq("study_id", studyId);
  if (authorId) filtered = filtered.eq("user_id", authorId);
  if (dicomSeriesId) return filtered.eq("dicom_series_id", dicomSeriesId);
  return filtered.eq("case_url_params", caseUrlKey);
}
