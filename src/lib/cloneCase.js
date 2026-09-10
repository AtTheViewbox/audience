import {
  applyAnnotationCaseFilter,
  buildCaseViewerHref,
  normalizeUrlParams,
} from "./answerKeyCase.js";

function annotationCopy(row, { userId, studyId }) {
  return {
    user_id: userId,
    study_id: studyId,
    dicom_series_id: null,
    case_url_params: null,
    kind: row.kind,
    boxes: row.boxes ?? null,
    question: row.question ?? null,
    answer: row.answer ?? null,
    label: row.label ?? null,
    question_type: row.question_type ?? null,
    options: row.options ?? null,
  };
}

async function fetchRowsToCopy(supabaseClient, { sourceStudyId, caseLink, userId }) {
  let query = supabaseClient
    .from("series_annotations")
    .select("*")
    .order("created_at", { ascending: true });

  if (sourceStudyId) {
    query = query.eq("study_id", sourceStudyId);
  } else {
    query = applyAnnotationCaseFilter(query, { ...caseLink, userId });
  }
  if (!query) return [];

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Create a new studies row that points at the same images.
 * mode "images" — empty teaching set
 * mode "fork" — copy questions (and any boxes this user can read)
 */
export async function duplicateCase(supabaseClient, {
  userId,
  sourceStudy,
  sourceStudyId,
  urlParams,
  caseLink,
  mode = "images",
}) {
  if (!supabaseClient || !userId) {
    throw new Error("Sign in to duplicate a case");
  }

  const sourceId = sourceStudy?.id || sourceStudyId || null;
  let source = sourceStudy || null;
  if (!source && sourceId) {
    const { data } = await supabaseClient
      .from("studies")
      .select("id, name, description, url_params, visibility")
      .eq("id", sourceId)
      .maybeSingle();
    source = data;
  }

  const imageParams = normalizeUrlParams(source?.url_params || urlParams);
  if (!imageParams) {
    throw new Error("This viewer has no images to clone");
  }

  const baseName = (source?.name || "Case").replace(/\s+\((copy|fork)\)$/i, "");
  const name = mode === "fork" ? `${baseName} (fork)` : `${baseName} (copy)`;

  const { data: created, error } = await supabaseClient
    .from("studies")
    .insert({
      owner: userId,
      name,
      description: source?.description ?? null,
      url_params: imageParams,
      visibility: "PRIVATE",
    })
    .select("id, name, url_params, description, visibility")
    .single();
  if (error) throw error;

  let copied = 0;
  if (mode === "fork") {
    const rows = await fetchRowsToCopy(supabaseClient, {
      sourceStudyId: sourceId,
      caseLink,
      userId,
    });
    if (rows.length) {
      const { error: copyError } = await supabaseClient
        .from("series_annotations")
        .insert(rows.map((row) => annotationCopy(row, { userId, studyId: created.id })));
      if (copyError) throw copyError;
      copied = rows.length;
    }
  }

  return {
    study: created,
    copied,
    href: buildCaseViewerHref({
      url_params: created.url_params,
      studyId: created.id,
    }),
  };
}
