import { Visibility } from "./constants.js";
import { normalizeUrlParams } from "./answerKeyCase.js";
import { isDemoMode, DEMO_QUERY_PARAM, DEMO_SESSION_ID, DEMO_CASE_SEARCH } from "./demoCase.js";

export const ShareMode = {
  PRESENTATION: "PRESENTATION",
  TEAM: "TEAM",
};

export function currentViewerUrlParams(search = window.location.search) {
  return normalizeUrlParams(search);
}

export function sameViewerStudy(a, b) {
  return normalizeUrlParams(a) === normalizeUrlParams(b);
}

export function buildJoinLink(sessionId) {
  if (!sessionId) return "";
  const params = new URLSearchParams();
  params.set("s", sessionId);
  if (isDemoMode()) params.set(DEMO_QUERY_PARAM, "1");
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}

/**
 * Create (or replace) a share session for this user on the current study.
 * Demo mode allows anonymous hosts so interviewers can try the product without an account.
 */
export async function createShareSession({
  supabaseClient,
  userId,
  visibility = Visibility.PUBLIC,
  mode = ShareMode.TEAM,
  chatHistory = [],
}) {
  const { error: deleteError } = await supabaseClient
    .from("viewbox")
    .delete()
    .eq("user", userId);
  if (deleteError) throw deleteError;

  const { data, error } = await supabaseClient
    .from("viewbox")
    .upsert([
      {
        user: userId,
        url_params: currentViewerUrlParams(),
        visibility,
        mode,
        chat_history: chatHistory || [],
      },
    ])
    .select();

  if (error) throw error;
  if (!data?.[0]) throw new Error("createShareSession: no row returned");
  return data[0];
}

/**
 * Join the canonical public demo session so answers and visitor counts persist.
 * Falls back to any public session on the demo case, then creates one.
 */
export async function resolvePersistentDemoSession(supabaseClient, userId) {
  const { data: pinned, error: pinnedError } = await supabaseClient
    .from("viewbox")
    .select("user, url_params, session_id, mode, chat_history")
    .eq("session_id", DEMO_SESSION_ID)
    .limit(1);
  if (!pinnedError && pinned?.[0]) return pinned[0];

  const { data: publics } = await supabaseClient
    .from("viewbox")
    .select("user, url_params, session_id, mode, chat_history")
    .eq("visibility", Visibility.PUBLIC);

  const match = (publics || []).find((row) =>
    sameViewerStudy(row.url_params, DEMO_CASE_SEARCH)
  );
  if (match) return match;

  return createShareSession({
    supabaseClient,
    userId,
    chatHistory: [],
  });
}
