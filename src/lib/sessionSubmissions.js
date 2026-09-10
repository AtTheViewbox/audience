/**
 * Database-backed participant submissions for share sessions.
 *
 * Submissions are still broadcast over realtime for instant updates, but they
 * are also persisted here so the leaderboard is authoritative and survives
 * refreshes, session transfers (which reload every client), and late joins.
 */

const TABLE = "session_submissions";

/** Upsert this participant's submission for the session+case (fire-and-forget safe). */
export async function persistSubmission({
  supabaseClient,
  sessionId,
  caseKey,
  userId,
  userName,
  answers,
  boxes,
}) {
  if (!supabaseClient || !sessionId || !userId || !caseKey) return;
  const row = {
    session_id: sessionId,
    case_key: caseKey,
    user_id: userId,
    user_name: userName || null,
    answers: answers && Object.keys(answers).length ? answers : null,
    boxes: boxes && boxes.length ? boxes : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseClient
    .from(TABLE)
    .upsert(row, { onConflict: "session_id,user_id,case_key" });
  if (error) throw error;
}

/** Load submissions for a session+case as the in-memory leaderboard maps. */
export async function fetchSessionSubmissions(supabaseClient, sessionId, caseKey) {
  const empty = { submittedQuestionAnswers: {}, submittedAnnotations: {} };
  if (!supabaseClient || !sessionId || !caseKey) return empty;

  const { data, error } = await supabaseClient
    .from(TABLE)
    .select("user_id, user_name, answers, boxes")
    .eq("session_id", sessionId)
    .eq("case_key", caseKey);
  if (error) throw error;

  const submittedQuestionAnswers = {};
  const submittedAnnotations = {};
  for (const r of data || []) {
    if (r.answers && Object.keys(r.answers).length) {
      submittedQuestionAnswers[r.user_id] = {
        userName: r.user_name || "Anonymous",
        answers: r.answers,
      };
    }
    if (Array.isArray(r.boxes) && r.boxes.length) {
      submittedAnnotations[r.user_id] = {
        userName: r.user_name || "Anonymous",
        boxes: r.boxes,
      };
    }
  }
  return { submittedQuestionAnswers, submittedAnnotations };
}

/** Author-only: remove submissions for the session (optionally a single case). */
export async function clearSessionSubmissions(supabaseClient, sessionId, caseKey) {
  if (!supabaseClient || !sessionId) return;
  let query = supabaseClient.from(TABLE).delete().eq("session_id", sessionId);
  if (caseKey) query = query.eq("case_key", caseKey);
  const { error } = await query;
  if (error) throw error;
}

/** All persisted answers for a case, across share sessions. */
export async function fetchCaseSubmissions(supabaseClient, caseKey) {
  if (!supabaseClient || !caseKey) return [];
  const { data, error } = await supabaseClient
    .from(TABLE)
    .select("id, session_id, user_id, user_name, answers, boxes, created_at, updated_at")
    .eq("case_key", caseKey)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Case owner: wipe answer history for this case. */
export async function clearCaseSubmissions(supabaseClient, caseKey) {
  if (!supabaseClient || !caseKey) return [];
  const { data, error } = await supabaseClient
    .from(TABLE)
    .delete()
    .eq("case_key", caseKey)
    .select("id");
  if (error) throw error;
  return data || [];
}
