/**
 * Viewer preferences: defaults are OFF for both toggles.
 * Logged-in users: persisted in Supabase Auth user_metadata.
 * Anonymous: localStorage (same machine only).
 */

export const PREF_EVENT = 'atvb-prefs-changed';

const LS_SHOW_MEDGEMMA = 'atvb_pref_show_medgemma';

export function getShowMedGemmaButton(userData) {
  if (!userData || userData.is_anonymous) {
    return localStorage.getItem(LS_SHOW_MEDGEMMA) === 'true';
  }
  return userData.user_metadata?.show_medgemma_button === true;
}

/** Signed-in only — share sessions are not tied to anonymous guests. */
export function getAutoTransferSession(userData) {
  if (!userData || userData.is_anonymous) return false;
  return userData.user_metadata?.auto_transfer_session === true;
}

const LS_SHOW_LEADERBOARD = 'atvb_pref_show_leaderboard';

export function setShowMedGemmaLocal(value) {
  if (value) localStorage.setItem(LS_SHOW_MEDGEMMA, 'true');
  else localStorage.removeItem(LS_SHOW_MEDGEMMA);
  window.dispatchEvent(new CustomEvent(PREF_EVENT));
}

/** Leaderboard visible after submit / in owner panel (default on). */
export function getLeaderboardEnabled(userData) {
  if (!userData || userData.is_anonymous) {
    return localStorage.getItem(LS_SHOW_LEADERBOARD) !== 'false';
  }
  return userData.user_metadata?.show_leaderboard !== false;
}

export function setLeaderboardEnabledLocal(value) {
  if (value) localStorage.removeItem(LS_SHOW_LEADERBOARD);
  else localStorage.setItem(LS_SHOW_LEADERBOARD, 'false');
  window.dispatchEvent(new CustomEvent(PREF_EVENT));
}
