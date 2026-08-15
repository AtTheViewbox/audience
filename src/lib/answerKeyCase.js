/**
 * Helpers for linking the viewer to an answer-key case (studies, dicom_series, or URL).
 */

import { Visibility } from "./constants.js";
import { resolveSeriesPrefix } from "./seriesLink.js";

export function normalizeUrlParams(input) {
  if (!input) return "";
  const raw = String(input).startsWith("?") ? String(input).slice(1) : String(input);
  if (!raw) return "";

  const params = new URLSearchParams(raw);
  params.delete("s");
  params.delete("preview");

  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
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
  if (!query || !userId || !isCaseLinked({ studyId, dicomSeriesId, caseUrlKey })) {
    return null;
  }
  let filtered = query.eq("user_id", userId);
  if (studyId) return filtered.eq("study_id", studyId);
  if (dicomSeriesId) return filtered.eq("dicom_series_id", dicomSeriesId);
  return filtered.eq("case_url_params", caseUrlKey);
}

/** Load session questions for participants (any author on this case). */
export function applyQuestionCaseFilter(
  query,
  { studyId, dicomSeriesId, caseUrlKey, authorId }
) {
  if (!query || !isCaseLinked({ studyId, dicomSeriesId, caseUrlKey })) {
    return null;
  }
  let filtered = query.eq("kind", "question");
  if (authorId) filtered = filtered.eq("user_id", authorId);
  if (studyId) return filtered.eq("study_id", studyId);
  if (dicomSeriesId) return filtered.eq("dicom_series_id", dicomSeriesId);
  return filtered.eq("case_url_params", caseUrlKey);
}
