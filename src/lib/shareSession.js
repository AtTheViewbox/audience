import { Visibility } from "./constants.js";
import { normalizeUrlParams, sessionViewerUrlParams } from "./answerKeyCase.js";
import { isDemoMode, DEMO_QUERY_PARAM, DEMO_SESSION_ID, DEMO_CASE_SEARCH } from "./demoCase.js";

export const ShareMode = {
  PRESENTATION: "PRESENTATION",
  TEAM: "TEAM",
};

export const VIEWBOX_SESSION_COLS =
  "user, url_params, session_id, mode, chat_history, join_code, visibility";

const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const JOIN_CODE_LENGTH = 5;

export function currentViewerUrlParams(search = window.location.search) {
  return sessionViewerUrlParams(search);
}

export function sameViewerStudy(a, b) {
  return normalizeUrlParams(a) === normalizeUrlParams(b);
}

export function normalizeJoinCode(value) {
  return String(value || "").replace(/[^A-Za-z]/g, "").toUpperCase();
}

function isJoinCodeToken(value) {
  return /^[A-Z]{4,6}$/.test(normalizeJoinCode(value));
}

function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "").trim()
  );
}

function generateJoinCode(length = JOIN_CODE_LENGTH) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => JOIN_CODE_ALPHABET[b % JOIN_CODE_ALPHABET.length]).join("");
}

function buildJoinHref(token) {
  if (!token) return "";
  const params = new URLSearchParams();
  params.set("s", token);
  if (isDemoMode()) params.set(DEMO_QUERY_PARAM, "1");
  const base = import.meta.env.BASE_URL || "/";
  const path = base.endsWith("/") ? base : `${base}/`;
  return `${window.location.origin}${path}?${params.toString()}`;
}

export function buildJoinLink(sessionId, joinCode) {
  return buildJoinHref(joinCode || sessionId);
}

export async function resolveShareSession(supabaseClient, token) {
  const raw = String(token || "").trim();
  if (!raw || !supabaseClient) return null;

  let query = supabaseClient.from("viewbox").select(VIEWBOX_SESSION_COLS);
  if (looksLikeUuid(raw)) {
    query = query.eq("session_id", raw);
  } else if (isJoinCodeToken(raw)) {
    query = query.eq("join_code", normalizeJoinCode(raw));
  } else {
    return null;
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function joinSessionByCode(supabaseClient, rawCode) {
  const raw = String(rawCode || "").trim();
  const code = normalizeJoinCode(raw);

  if (!isJoinCodeToken(code) && !looksLikeUuid(raw)) {
    throw new Error("Enter a 4–5 letter session code.");
  }

  const row = await resolveShareSession(
    supabaseClient,
    looksLikeUuid(raw) ? raw : code
  );
  if (!row) {
    throw new Error("No live session found for that code.");
  }

  window.location.href = buildJoinLink(row.session_id, row.join_code);
  return row;
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

  let lastError = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data, error } = await supabaseClient
      .from("viewbox")
      .upsert([
        {
          user: userId,
          url_params: currentViewerUrlParams(),
          visibility,
          mode,
          chat_history: chatHistory || [],
          join_code: generateJoinCode(),
        },
      ])
      .select();

    if (!error && data?.[0]) return data[0];
    lastError = error;
    if (error?.code !== "23505") throw error;
  }

  throw lastError || new Error("createShareSession: could not allocate a join code");
}

/**
 * Join the canonical public demo session so answers and visitor counts persist.
 * Falls back to any public session on the demo case, then creates one.
 */
export async function resolvePersistentDemoSession(supabaseClient, userId) {
  const { data: pinned, error: pinnedError } = await supabaseClient
    .from("viewbox")
    .select(VIEWBOX_SESSION_COLS)
    .eq("session_id", DEMO_SESSION_ID)
    .maybeSingle();
  if (!pinnedError && pinned) return pinned;

  const { data: publics } = await supabaseClient
    .from("viewbox")
    .select(VIEWBOX_SESSION_COLS)
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
