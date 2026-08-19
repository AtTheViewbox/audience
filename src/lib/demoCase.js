/** Featured case used by the home-page Demo launch. */
export const DEMO_CASE_SEARCH =
  "m=true&ld.r=1&ld.c=1&vd.0.s.pf=wadouri%3Ahttps%3A%2F%2Fdicom.attheviewbox.dev%2Fupload_1786768079057_0_4mo5yia6c%2F&vd.0.s.sf=.dcm&vd.0.s.s=70&vd.0.s.e=100&vd.0.s.D=1&vd.0.ww=375&vd.0.wc=1074&vd.0.ci=100&vd.0.z=1&vd.0.px=0&vd.0.py=0&vd.0.r=0";

export const DEMO_QUERY_PARAM = "demo";

/** Shared live session every Demo launch joins so answers and visitor counts persist. */
export const DEMO_SESSION_ID = "987e2f3d-79b1-4bc5-8e19-24cfe60c6204";
export const DEMO_STUDY_ID = "7db9bad5-ef0c-412c-8f2c-5acc01cd37b4";
export const DEMO_SUBMISSION_CASE_KEY = `study:${DEMO_STUDY_ID}`;

/** Canonical demo answer key. Shipped with the case so every Demo visitor sees it. */
export const DEMO_QUESTION = {
  id: "8f8b28c8-78cc-4637-82ff-51a6e28c83c1",
  kind: "question",
  question: "ddx?",
  question_type: "mcq",
  answer: null,
  options: {
    choices: ["appendicitis", "ectopic pregnancy", "ovarian torsion"],
    correctIndex: 0,
  },
};

export const DEMO_BOX_ROW = {
  id: "c34ec342-82dc-4d25-90a5-faac29dcbaeb",
  kind: "box",
  boxes: [
    {
      points: [
        [-88.80647830093831, -169.98774715147454, -328.5],
        [-57.43088136729221, -169.98774715147454, -328.5],
        [-88.80647830093828, -151.16238899128686, -328.5],
        [-57.43088136729221, -151.16238899128686, -328.5],
      ],
      viewUp: [0, -1, 0],
      imageId: "wadouri:https://dicom.attheviewbox.dev/upload_1786768079057_0_4mo5yia6c/92.dcm",
      viewportIndex: 0,
      viewPlaneNormal: [0, 0, -1],
      FrameOfReferenceUID: "1.3.12.2.1107.5.1.4.73623.30000015081913373524300000018",
    },
  ],
};

export function getDemoQuestions() {
  return [DEMO_QUESTION];
}

export function getDemoBoxRows() {
  return [DEMO_BOX_ROW];
}

export function isDemoMode(search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const value = params.get(DEMO_QUERY_PARAM);
  return value === "1" || value === "true";
}

/** Clicked Launch Demo (URL has demo=1 and no session id). */
export function isDemoPresenter(search = typeof window !== "undefined" ? window.location.search : "") {
  return isDemoMode(search) && !isSessionJoin(search);
}

/** Joined via QR or copied link (`s=` in the URL). */
export function isDemoJoinParticipant(search = typeof window !== "undefined" ? window.location.search : "") {
  return isDemoMode(search) && isSessionJoin(search);
}

/**
 * Host / review UI: Launch Demo is always presenter. QR/copy-link joiners are
 * always participants, even if they own the underlying share row.
 */
export function isPresenter({ sessionId, userId, ownerId, search } = {}) {
  if (isDemoJoinParticipant(search)) return false;
  if (isDemoPresenter(search)) return true;
  return !!(sessionId && userId && ownerId && ownerId === userId);
}

/** Participant UI: QR/copy-link in demo, or non-owner in a normal session. */
export function isJoinParticipant({ sessionId, userId, ownerId, search } = {}) {
  if (isDemoJoinParticipant(search)) return true;
  if (!sessionId) return false;
  if (isDemoPresenter(search)) return false;
  return !!(userId && ownerId && ownerId !== userId);
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
