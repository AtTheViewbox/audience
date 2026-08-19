import { DEMO_SESSION_ID, DEMO_SUBMISSION_CASE_KEY } from "./demoCase.js";

const VISITS = "demo_visits";

/** Count unique homepage Demo launches (not phone QR joins). */
export async function recordDemoVisit(supabaseClient, { userId, sessionId }) {
  if (!supabaseClient || !userId || !sessionId) return;
  const now = new Date().toISOString();
  const { data: existing } = await supabaseClient
    .from(VISITS)
    .select("visit_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    await supabaseClient
      .from(VISITS)
      .update({
        session_id: sessionId,
        last_seen_at: now,
        visit_count: (existing.visit_count || 1) + 1,
      })
      .eq("user_id", userId);
    return;
  }

  await supabaseClient.from(VISITS).insert({
    user_id: userId,
    session_id: sessionId,
    first_seen_at: now,
    last_seen_at: now,
    visit_count: 1,
  });
}

export async function fetchDemoStats(supabaseClient, sessionId = DEMO_SESSION_ID) {
  const empty = { visitors: 0, answers: 0 };
  if (!supabaseClient || !sessionId) return empty;

  const [{ count: visitors }, { count: answers }] = await Promise.all([
    supabaseClient
      .from(VISITS)
      .select("user_id", { count: "exact", head: true })
      .eq("session_id", sessionId),
    supabaseClient
      .from("session_submissions")
      .select("user_id", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("case_key", DEMO_SUBMISSION_CASE_KEY),
  ]);

  return {
    visitors: visitors || 0,
    answers: answers || 0,
  };
}
