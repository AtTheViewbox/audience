import { createContext, useState, useEffect, useReducer, useContext, useRef } from "react";

import * as cornerstone from '@cornerstonejs/core';
import { eventTarget } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import { utilities } from '@cornerstonejs/core';
import { toast } from "sonner"
import defaultData from "./defaultData.jsx";
import { cl } from './SupabaseClient.jsx';
import { UserContext, UserDispatchContext } from "./UserContext.jsx";
import { resolveSeriesPrefix } from "../lib/seriesLink.js";
import { findStudyForViewer, findPacsbinStudyForViewer, resolveCaseUrlKey, caseKeyFromLink, buildAnnotationInsert, getPlaylistIdFromSearch } from "../lib/answerKeyCase.js";
import { resolveViewportIndex } from "../lib/answerKeyBoxes.js";
import { fetchSessionSubmissions } from "../lib/sessionSubmissions.js";
import { sameViewerSession, resolvePersistentDemoSession, resolveShareSession, VIEWBOX_SESSION_COLS } from "../lib/shareSession.js";
import { IGNORE_SESSION_UPDATE_KEY, viewerHref } from "../lib/transferSharedSession.js";
import { applyViewerUrl, parseViewerSearch } from "../lib/viewerLocation.js";
import { isDemoMode, isDemoPresenter, isDemoJoinParticipant, isPresenter, DEMO_SUBMISSION_CASE_KEY } from "../lib/demoCase.js";
import { recordDemoVisit } from "../lib/demoVisits.js";
import { setRemotePointer } from "../lib/pointerStore.js";
import { initCornerstone } from "../lib/initCornerstone.js";

export const DataContext = createContext({});
export const DataDispatchContext = createContext({});

/**
 * Per-key throttle that sends at most once per interval and always delivers the
 * latest value, so followers land on where the presenter actually stopped.
 */
function createLatestThrottle(intervalMs) {
    const state = new Map();
    const fire = (key) => {
        const entry = state.get(key);
        if (!entry?.pending) {
            state.delete(key);
            return;
        }
        const send = entry.pending;
        entry.pending = null;
        entry.last = performance.now();
        send();
        entry.timer = setTimeout(() => fire(key), intervalMs);
    };
    return {
        push(key, send) {
            const entry = state.get(key);
            if (entry) {
                entry.pending = send;
                return;
            }
            state.set(key, { pending: send, timer: null, last: 0 });
            fire(key);
        },
        cancel() {
            state.forEach((entry) => clearTimeout(entry.timer));
            state.clear();
        },
    };
}

const SYNC_INTERVAL_MS = 150;
const POINTER_INTERVAL_MS = 100;

/** Apply only the newest update per key, once per animation frame. */
function createFrameCoalescer() {
    const pending = new Map();
    let raf = null;
    const flush = () => {
        raf = null;
        const work = [...pending.values()];
        pending.clear();
        work.forEach((apply) => apply());
    };
    return {
        push(key, apply) {
            pending.set(key, apply);
            if (raf == null) raf = requestAnimationFrame(flush);
        },
        cancel() {
            if (raf != null) cancelAnimationFrame(raf);
            raf = null;
            pending.clear();
        },
    };
}

var initialData = parseViewerSearch(window.location.search);
const INITIAL_SEARCH = window.location.search;

if (initialData.vd) {
    initialData.isRequestLoading = false
}

else if (initialData.s) {
    initialData = Object.assign(defaultData.defaultData, initialData);
    initialData.isRequestLoading = true;
}

initialData.userData = null;

initialData.sharingUser = null;
initialData.sessionMeta = { mode: "TEAM", owner: "", joinCode: "" }
// Case identifiers shared by the author so participants can load questions even
// when they can't resolve the case themselves (RLS / stale URL after transfer).
initialData.sessionCaseLink = null;
initialData.activeUsers = [];
initialData.toolSelected = "scroll";
// Which viewport is maximized to fill the layout (null = normal multi-viewport grid)
initialData.fullscreenViewport = null;

// Compare with Normal state
initialData.lastSegmentation = null;   // { structures, results, orientation, maskTransform }
initialData.compareNormal = null;      // { active, structure, scrollOffset, normalCentroidSlice, patientCentroidSlice, normalMaskData, originalLd, originalVd }
initialData.chatHistory = [
    { role: 'assistant', content: "Hi! I'm MedGemma. I can help you analyze medical images with the following tools:\n\n- **Adjust Contrast/Brightness**: Optimize CT/X-Ray contrast\n- **Explain Finding**: Full pipeline analysis of report text\n- **Show Organ**: Anatomical segmentation & navigation\n- **Compare with Normal**: Side-by-side reference CT comparison (or press **N**)\n- **Detect Modality**: Identify scan type (CT, MRI, X-Ray)\n- **Share Session**: Generate a collaborative link\n\nHow can I assist you today?" }
];

// Bounding-box annotation submissions from viewers
initialData.submittedAnnotations = {};
initialData.submittedQuestionAnswers = {};
initialData.participantAnswerContentAvailable = false;
initialData.hostAnswerContentAvailable = false;
initialData.heatmapVisible = false;

// Resolved case link for the answer-key feature (studies and/or dicom_series).
initialData.studyId = null;
initialData.studyName = null;
initialData.dicomSeriesId = null;
initialData.dicomSeriesOwner = null;
initialData.dicomSeriesName = null;
initialData.pacsbinStudyName = null;
initialData.caseUrlParams = INITIAL_SEARCH ? INITIAL_SEARCH.replace(/^\?/, "") : null;
initialData.caseUrlKey = resolveCaseUrlKey({
  search: INITIAL_SEARCH,
  caseUrlParams: initialData.caseUrlParams,
}) || null;
initialData.playlistId = getPlaylistIdFromSearch(window.location.search);
// Toggled on while the user is authoring an answer key so the Annotate tool
// stays available outside of a share session.
initialData.answerKeyAuthoring = false;
initialData.persistedAnswerBoxes = [];

// Added for Broadcast-based ownership arbitration
initialData.shareClock = 0;  // last share change timestamp (ms since epoch)
initialData.shareBy = "";    // last user who changed it (tie-break)

export const DataProvider = ({ children }) => {

    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    const [data, dispatch] = useReducer(dataReducer, initialData);
    const { userDispatch } = useContext(UserDispatchContext);
    const { userData, supabaseClient } = useContext(UserContext).data;

    const [updateSession, setUpdateSession] = useState(null);

    // Tracks whether this user authors the active session. Kept in a ref so
    // realtime channel callbacks always see the latest value (ownership is
    // resolved asynchronously after the channels subscribe).
    const isSessionOwnerRef = useRef(false);
    useEffect(() => {
        isSessionOwnerRef.current = isPresenter({
            sessionId: data.sessionId,
            userId: userData?.id,
            ownerId: data.sessionMeta?.owner,
        });
    }, [userData?.id, data.sessionId, data.sessionMeta?.owner]);

    // The author's resolved case identifiers, broadcast to participants. RLS
    // stops participants from reading the studies/dicom_series tables, so they
    // can't resolve a (private) study to its id on their own — especially after
    // a transfer. Sharing the author's ids lets participants fetch questions
    // directly (the series_annotations "select questions" policy is world-read).
    const caseLinkRef = useRef({ studyId: null, dicomSeriesId: null, caseUrlKey: null });
    useEffect(() => {
        caseLinkRef.current = {
            studyId: data.studyId || null,
            dicomSeriesId: data.dicomSeriesId || null,
            caseUrlKey: data.caseUrlKey || null,
        };
    }, [data.studyId, data.dicomSeriesId, data.caseUrlKey]);

    // As author, publish the resolved case identifiers so participants can load
    // the right questions even when they can't resolve the case themselves
    // (RLS on studies, or a stale URL after a transfer).
    useEffect(() => {
        if (!data.shareController) return;
        const presenter = isPresenter({
            sessionId: data.sessionId,
            userId: userData?.id,
            ownerId: data.sessionMeta?.owner,
        });
        if (!presenter) return;
        const cl = caseLinkRef.current;
        if (!cl.studyId && !cl.dicomSeriesId && !cl.caseUrlKey) return;
        data.shareController.send({ type: 'broadcast', event: 'case-link', payload: cl });
    }, [data.shareController, data.sessionId, data.sessionMeta?.owner, userData?.id, data.studyId, data.dicomSeriesId, data.caseUrlKey]);

    // Load persisted submissions for this session+case so answers survive refresh
    // and are available to clients that join after others have submitted. Scoping
    // by case means a transfer to a new case starts everyone fresh.
    const effectiveCaseLink = data.sessionCaseLink && (
        data.sessionCaseLink.studyId || data.sessionCaseLink.dicomSeriesId || data.sessionCaseLink.caseUrlKey
    )
        ? data.sessionCaseLink
        : { studyId: data.studyId, dicomSeriesId: data.dicomSeriesId, caseUrlKey: data.caseUrlKey };
    const effectiveCaseKey = isDemoMode()
        ? DEMO_SUBMISSION_CASE_KEY
        : caseKeyFromLink(effectiveCaseLink);
    useEffect(() => {
        if (!data.sessionId || !supabaseClient || !effectiveCaseKey) return;
        let cancelled = false;
        fetchSessionSubmissions(supabaseClient, data.sessionId, effectiveCaseKey)
            .then((stored) => {
                if (!cancelled && stored) {
                    dispatch({ type: 'restore_submissions', payload: stored });
                }
            })
            .catch((e) => console.error("Failed to load session submissions:", e));
        return () => { cancelled = true; };
    }, [data.sessionId, supabaseClient, effectiveCaseKey]);

    useEffect(() => {
        if (!isDemoPresenter() || !data.sessionId || !supabaseClient || !userData?.id) return;
        recordDemoVisit(supabaseClient, {
            userId: userData.id,
            sessionId: data.sessionId,
        }).catch((e) => console.error("Failed to record demo visit:", e));
    }, [data.sessionId, supabaseClient, userData?.id]);

    useEffect(() => {

        //Can be optimized if session_id is a primary key
        const getSession = async (cl, session_id) => {
            if (!session_id) return [];
            const { data, error } = await cl
                .from("viewbox")
                .select("session_id")
                .eq("session_id", session_id)

            if (error) {
                // It is expected that we might not find the session or get an error if it was just deleted
                // It is expected that we might not find the session or get an error if it was just deleted
                return [];
            }
            return data || [];
        }

        // Realtime DELETEs reach every subscriber (RLS can't filter them) and only
        // carry the primary key, so only react when it is this session's host
        // row, and confirm the session is really gone before disconnecting.
        if (updateSession?.eventType === "DELETE") {
            const deletedUser = updateSession.old?.user;
            const owner = data.sessionMeta?.owner;
            if (data.sessionId && (!owner || !deletedUser || deletedUser === owner)) {
                getSession(supabaseClient, data.sessionId).then((payload) => {
                    if (payload.length == 0) {
                        userDispatch({ type: "clean_up_supabase" });
                    }
                })
            }
        }

        if (updateSession?.eventType === "UPDATE" && updateSession.new?.session_id === data.sessionId) {
            let ignoreOwnSwitch = false;
            try {
                ignoreOwnSwitch = sessionStorage.getItem(IGNORE_SESSION_UPDATE_KEY) === "1";
                if (ignoreOwnSwitch) sessionStorage.removeItem(IGNORE_SESSION_UPDATE_KEY);
            } catch {
                ignoreOwnSwitch = false;
            }

            const nextParams = updateSession.new.url_params || "";
            if (!ignoreOwnSwitch && nextParams && !sameViewerSession(nextParams, window.location.search)) {
                const token = updateSession.new.join_code || updateSession.new.session_id;
                applyViewerUrl(viewerHref(nextParams, token), dispatch);
            }
        }
        setUpdateSession(null)

    }, [updateSession, data, supabaseClient, userDispatch])

    useEffect(() => {
        // use effect to do basic house keeping on initial start
        // 1. Initialize Cornerstone
        // 2a. Initialize Supabase Client
        // 2b. Initialize Supabase Auth and get User Data (anonymous or logged in)
        // 3. If a sharing key is on URL at startup, place that into state after the above 
        //    are initialized as handling of the sharing key requires supabase client and
        //    auth to be initialized.

        const setupCornerstone = async () => {
            await initCornerstone();

            const renderingEngineId = 'myRenderingEngine';
            const re = new cornerstone.RenderingEngine(renderingEngineId);

            const {
                PanTool,
                WindowLevelTool,
                StackScrollTool,
                StackScrollMouseWheelTool,
                ZoomTool,
                ProbeTool,

                RectangleROITool,
            } = cornerstoneTools;

            cornerstoneTools.addTool(PanTool);
            cornerstoneTools.addTool(WindowLevelTool);
            cornerstoneTools.addTool(StackScrollTool);
            cornerstoneTools.addTool(StackScrollMouseWheelTool);
            cornerstoneTools.addTool(ZoomTool);
            cornerstoneTools.addTool(ProbeTool);
            cornerstoneTools.addTool(RectangleROITool);

            const existingDefaults = cornerstoneTools.annotation.config.style.getDefaultToolStyles();
            cornerstoneTools.annotation.config.style.setDefaultToolStyles({
                ...existingDefaults,
                RectangleROI: {
                    color: 'rgb(34, 211, 238)',
                    colorHighlighted: 'rgb(103, 232, 249)',
                    colorSelected: 'rgb(165, 243, 252)',
                    colorLocked: 'rgb(34, 211, 238)',
                    lineWidth: '2',
                    lineDash: '',
                    textBoxVisibility: false,
                },
            });

            const eventListenerManager = new utilities.eventListener.MultiTargetEventListenerManager();

            dispatch({ type: 'cornerstone_initialized', payload: { renderingEngine: re, eventListenerManager: eventListenerManager } })
        };

        const setupSupabase = async () => {

            //if there is a session id in url, get url metadata from session

            if (initialData.s) {
                const sessionRow = await resolveShareSession(cl, initialData.s);

                if (!sessionRow) {
                    initialData.s = null
                }
                else {
                    initialData.s = sessionRow.session_id
                    initialData.sessionMeta.mode = sessionRow.mode
                    initialData.sessionMeta.owner = sessionRow.user
                    initialData.sessionMeta.joinCode = sessionRow.join_code

                    var newData = parseViewerSearch(sessionRow.url_params);
                    initialData.playlistId = getPlaylistIdFromSearch(sessionRow.url_params) || initialData.playlistId;
                    // Explicitly pass owner here to ensure it is set even if not previously in state
                    dispatch({
                        type: "update_viewport_data",
                        payload: {
                            ...newData,
                            mode: sessionRow.mode,
                            owner: sessionRow.user,
                            chatHistory: sessionRow.chat_history,
                            caseUrlParams: sessionRow.url_params,
                        },
                    })
                }
            }

            // QR / copied join links must stay in that session as participants.
            // Do not swap them into a session they already host on the same case.
            const joiningViaLink = new URLSearchParams(INITIAL_SEARCH).has("s");

            // Only look for existing sessions for real (non-anonymous) logged-in users
            // Anonymous users cannot create sessions, so this query would never return results
            if (!joiningViaLink && userData && !userData.is_anonymous) {
                var { data, errorCurrentSession } = await cl
                    .from("viewbox")
                    .select(VIEWBOX_SESSION_COLS)
                    .eq("user", userData.id);
                if (errorCurrentSession) throw errorCurrentSession;

                if (data?.length != 0 && sameViewerSession(data[0].url_params, INITIAL_SEARCH)) {
                    initialData.s = data[0].session_id
                    initialData.sessionMeta.mode = data[0].mode
                    initialData.sessionMeta.owner = data[0].user
                    initialData.sessionMeta.joinCode = data[0].join_code
                }
            }

            // Demo launch: join the shared persistent session so answers and
            // visitor counts accumulate. Homepage (no s=) still gets host UI.
            if (!joiningViaLink && isDemoMode(INITIAL_SEARCH) && userData) {
                try {
                    const row = await resolvePersistentDemoSession(cl, userData.id);
                    initialData.s = row.session_id;
                    initialData.sessionMeta.mode = row.mode;
                    initialData.sessionMeta.owner = row.user;
                    initialData.sessionMeta.joinCode = row.join_code;
                } catch (demoErr) {
                    console.error("Demo session join failed:", demoErr);
                }
            }
        }


        setupCornerstone()

        setupSupabase().then(() => {
            dispatch({ type: 'connect_to_sharing_session', payload: { sessionId: initialData.s, mode: initialData.sessionMeta.mode, owner: initialData.sessionMeta.owner, joinCode: initialData.sessionMeta.joinCode } })
        }).catch((err) => {
            console.error('setupSupabase failed:', err);
            dispatch({ type: 'connect_to_sharing_session', payload: { sessionId: initialData.s, mode: initialData.sessionMeta.mode, owner: initialData.sessionMeta.owner, joinCode: initialData.sessionMeta.joinCode } })
        })

        return () => {
            userDispatch({ type: 'clean_up_supabase' })
        }

    }, []);

    // Update session owner when user logs in
    useEffect(() => {
        if (isDemoJoinParticipant()) return;
        if (userData && data.sessionId && supabaseClient) {
            // Check if this user owns the current session
            supabaseClient
                .from("viewbox")
                .select("user")
                .eq("session_id", data.sessionId)
                .eq("user", userData.id)
                .then(({ data: sessionData, error }) => {
                    if (sessionData && sessionData.length > 0 && !error) {
                        dispatch({ type: 'update_session_owner', payload: userData.id });

                        if (!data.shareController) {
                            dispatch({
                                type: 'connect_to_sharing_session',
                                payload: {
                                    sessionId: data.sessionId,
                                    mode: data.sessionMeta?.mode,
                                    owner: userData.id
                                }
                            });
                        }
                    }
                });
        }
    }, [userData?.id, data.sessionId]);


    // Keep caseUrlKey in sync with the loaded viewer URL (works for direct/PACSbin links).
    useEffect(() => {
        const caseUrlKey = resolveCaseUrlKey({
            search: window.location.search,
            caseUrlParams: data.caseUrlParams,
        });
        if (caseUrlKey !== data.caseUrlKey) {
            dispatch({ type: "set_case_link", payload: { caseUrlKey } });
        }
    }, [data.caseUrlParams]);

    // Resolve studies / dicom_series / pacsbin display name when possible.
    useEffect(() => {
        if (!supabaseClient) return;
        let cancelled = false;

        const resolveCase = async () => {
            try {
                if (!data.studyId) {
                    const study = await findStudyForViewer(supabaseClient, {
                        search: window.location.search,
                        caseUrlParams: data.caseUrlParams,
                        userId: userData?.id,
                    });

                    if (!cancelled && study) {
                        dispatch({
                            type: "set_case_link",
                            payload: {
                                studyId: study.id,
                                studyName: study.name,
                            },
                        });
                        return;
                    }
                }

                if (!data.dicomSeriesId) {
                    const prefix = resolveSeriesPrefix({
                        search: window.location.search,
                        vd: data.vd,
                    });

                    if (prefix) {
                        const { data: rows, error } = await supabaseClient
                            .from("dicom_series")
                            .select("id, user_id, name")
                            .eq("prefix", prefix)
                            .limit(1);

                        if (!error && !cancelled && rows?.length) {
                            dispatch({
                                type: "set_case_link",
                                payload: {
                                    dicomSeriesId: rows[0].id,
                                    dicomSeriesOwner: rows[0].user_id,
                                    dicomSeriesName: rows[0].name,
                                },
                            });
                            return;
                        }
                    }
                }

                if (!data.pacsbinStudyName) {
                    const pacsbinStudy = await findPacsbinStudyForViewer(supabaseClient, {
                        search: window.location.search,
                        caseUrlParams: data.caseUrlParams,
                        vd: data.vd,
                    });
                    if (!cancelled && pacsbinStudy) {
                        dispatch({
                            type: "set_case_link",
                            payload: { pacsbinStudyName: pacsbinStudy.name },
                        });
                    }
                }
            } catch (e) {
                console.error("Failed to resolve answer-key case link:", e);
            }
        };

        resolveCase();
        return () => {
            cancelled = true;
        };
    }, [supabaseClient, data.vd, data.studyId, data.dicomSeriesId, data.caseUrlParams, data.pacsbinStudyName, userData?.id]);

    // While authoring an answer key, persist each bounding box to the
    // series_annotations table as soon as the author finishes drawing it. This
    // runs from DataContext (always mounted) because the author closes the
    // Answer Key dialog to draw, which unmounts the tab component.
    useEffect(() => {
        if (!supabaseClient || !data.answerKeyAuthoring || !userData?.id) return;
        if (!data.studyId && !data.dicomSeriesId && !data.caseUrlKey) return;

        const handler = async (evt) => {
            try {
                const annotation = evt.detail?.annotation;
                if (!annotation || annotation.metadata?.toolName !== "RectangleROI") return;
                if (annotation.answerKeySaved) return;

                const imageId = annotation.metadata?.referencedImageId || "";
                const box = {
                    imageId,
                    points: annotation.data?.handles?.points || [],
                    viewPlaneNormal: annotation.metadata?.viewPlaneNormal,
                    viewUp: annotation.metadata?.viewUp,
                    FrameOfReferenceUID: annotation.metadata?.FrameOfReferenceUID,
                    viewportIndex: data.renderingEngine
                        ? resolveViewportIndex(data.renderingEngine, imageId)
                        : 0,
                };

                annotation.answerKeySaved = true;

                const { data: inserted, error } = await supabaseClient.from("series_annotations").insert(
                    buildAnnotationInsert({
                        studyId: data.studyId,
                        dicomSeriesId: data.dicomSeriesId,
                        caseUrlKey: data.caseUrlKey,
                        userId: userData.id,
                        fields: {
                            kind: "box",
                            boxes: [box],
                        },
                    })
                ).select("id").single();

                if (error) {
                    annotation.answerKeySaved = false;
                    throw error;
                }

                annotation.answerKeyRowId = inserted.id;

                dispatch({
                    type: "append_persisted_answer_box",
                    payload: { rowId: inserted.id, ...box },
                });
            } catch (e) {
                console.error("Failed to auto-save answer-key box:", e);
                toast.error("Failed to save box");
            }
        };

        eventTarget.addEventListener(cornerstoneTools.Enums.Events.ANNOTATION_COMPLETED, handler);
        return () => {
            eventTarget.removeEventListener(cornerstoneTools.Enums.Events.ANNOTATION_COMPLETED, handler);
        };
    }, [supabaseClient, data.answerKeyAuthoring, data.studyId, data.dicomSeriesId, data.caseUrlKey, data.renderingEngine, userData?.id, dispatch]);

    useEffect(() => {
        // This useEffect is to handle changes to sessionId and create the consequent
        // Supabase realtime rooms as necessary. It relies on supabaseClient to not
        // be null so the if statement just guards against that
        if (data.sessionId && supabaseClient) {
            const allChanges = supabaseClient
                .channel(`${data.sessionId}-viewbox-changes`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'viewbox',
                        filter: `session_id=eq.${data.sessionId}`,
                    },
                    (payload) => {
                        setUpdateSession(payload)
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'DELETE',
                        schema: 'public',
                        table: 'viewbox',
                    },
                    (payload) => {
                        setUpdateSession(payload)
                    }
                )
                .subscribe()

            const share_controller = supabaseClient.channel(`${data.sessionId}-share-controller`, {
                config: {
                    broadcast: { self: true },
                }
            })

            share_controller.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    return null
                }
            })

            share_controller.on('broadcast', { event: 'share-changed' }, ({ payload }) => {
                const iWillHaveControl = payload.user === userData.id;
                if (!iWillHaveControl) {
                    data?.eventListenerManager?.reset();
                }
                dispatch({ type: 'apply_share_change', payload });
            })

            share_controller.on('broadcast', { event: 'case-link' }, ({ payload }) => {
                dispatch({ type: 'set_session_case_link', payload });
            })

            // Roster channel — Presence + broadcast for initial state sync
            // Workaround for Supabase bug #43561: presence_state never fires,
            // so we use broadcast to let existing users announce themselves to newcomers.
            const rosterState = {};
            const myName = userData?.user_metadata?.full_name || userData.email;
            // Always include ourselves so our own avatar shows even before
            // presence/broadcast round-trips complete (e.g. right after a refresh,
            // or when we're the only person in the session).
            rosterState[userData.id] = myName;
            const roster_channel = supabaseClient.channel(`${data.sessionId}-roster`, {
                config: {
                    presence: { key: userData.id },
                    broadcast: { self: false },
                }
            });

            const dispatchRoster = () => {
                const list = Object.entries(rosterState).map(([id, name]) => ({ user: id, name }));
                dispatch({ type: 'roster_updated', payload: list });
            };

            roster_channel
                .on('presence_state', {}, (event) => {
                    Object.entries(event).forEach(([key, val]) => {
                        const meta = val?.metas?.[0] || val?.[0] || {};
                        rosterState[key] = meta.name || key;
                    });
                    dispatchRoster();
                })
                .on('presence_diff', {}, (event) => {
                    if (event.joins) {
                        Object.entries(event.joins).forEach(([key, val]) => {
                            const meta = val?.metas?.[0] || val?.[0] || {};
                            rosterState[key] = meta.name || key;
                        });
                    }
                    if (event.leaves) {
                        Object.entries(event.leaves).forEach(([key]) => {
                            // Never drop ourselves from our own roster.
                            if (key === userData.id) return;
                            delete rosterState[key];
                        });
                    }
                    dispatchRoster();
                    // When someone new joins, announce ourselves so they discover us
                    if (event.joins && !event.joins[userData.id]) {
                        roster_channel.send({
                            type: 'broadcast', event: 'roster-announce',
                            payload: { userId: userData.id, name: myName }
                        });
                        // As author, re-push case identifiers so the newcomer matches everyone else.
                        if (isSessionOwnerRef.current) {
                            const cl = caseLinkRef.current;
                            if (cl.studyId || cl.dicomSeriesId || cl.caseUrlKey) {
                                share_controller.send({ type: 'broadcast', event: 'case-link', payload: cl });
                            }
                        }
                    }
                })
                .on('broadcast', { event: 'roster-announce' }, ({ payload }) => {
                    if (!rosterState[payload.userId]) {
                        rosterState[payload.userId] = payload.name;
                        dispatchRoster();
                        // Reply so the announcer also discovers us
                        roster_channel.send({
                            type: 'broadcast', event: 'roster-announce',
                            payload: { userId: userData.id, name: myName }
                        });
                        // As author, make sure the newcomer gets the current case identifiers too.
                        if (isSessionOwnerRef.current) {
                            const cl = caseLinkRef.current;
                            if (cl.studyId || cl.dicomSeriesId || cl.caseUrlKey) {
                                share_controller.send({ type: 'broadcast', event: 'case-link', payload: cl });
                            }
                        }
                    }
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        await roster_channel.track({ name: myName });
                        // Render our own avatar immediately; peers get added as
                        // their presence/announce messages arrive.
                        dispatchRoster();
                        // Announce ourselves so existing users reply with their info
                        roster_channel.send({
                            type: 'broadcast', event: 'roster-announce',
                            payload: { userId: userData.id, name: myName }
                        });
                    }
                });

            // Interaction channel — broadcast only
            const interaction_channel = supabaseClient.channel(`${data.sessionId}-interaction-channel`, {
                config: {
                    broadcast: { self: false },
                }
            })

            interaction_channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    return null
                }
            })

            const incoming = createFrameCoalescer();

            if (data.sessionMeta.mode == "TEAM" || userData.id == data.sessionMeta.owner) {

                interaction_channel.on(
                    'broadcast',
                    { event: 'frame-changed' },
                    ({ payload }) => {
                        incoming.push(`frame:${payload.viewport}`, () => {
                            const viewport = data.renderingEngine?.getViewport(payload.viewport);
                            if (!viewport) return;
                            const localIndex = viewport.getImageIds().indexOf(payload.imageId);
                            const shownIndex = Number.isInteger(viewport.targetImageIdIndex)
                                ? viewport.targetImageIdIndex
                                : viewport.getCurrentImageIdIndex();
                            if (localIndex === -1 || localIndex === shownIndex) return;
                            viewport.setImageIdIndex(localIndex);
                        });
                    }
                )

                interaction_channel.on(
                    'broadcast',
                    { event: 'voi-changed' },
                    ({ payload }) => {
                        incoming.push(`voi:${payload.viewport}`, () => {
                            const viewport = data.renderingEngine?.getViewport(payload.viewport);
                            if (!viewport) return;
                            viewport.setProperties({
                                voiRange: cornerstone.utilities.windowLevel.toLowHighRange(payload.ww, payload.wc),
                                isComputedVOI: false,
                            });
                            viewport.render();
                            // Viewport.jsx re-applies its cached VOI on every slice change;
                            // mouseup makes it adopt the presenter's window instead.
                            viewport.element?.dispatchEvent(new MouseEvent("mouseup"));
                        });
                    }
                )

                interaction_channel.on(
                    'broadcast',
                    { event: 'fullscreen-changed' },
                    (payload) => {
                        const next = payload.payload?.viewport;
                        dispatch({
                            type: 'set_fullscreen_viewport',
                            payload: Number.isInteger(next) ? next : null,
                        });
                    }
                )

                interaction_channel.on(
                    'broadcast',
                    { event: 'pointer-changed' },
                    (payload) => {
                        const { coordX, coordY, coordZ, viewport } = payload.payload;
                        setRemotePointer({
                            coord: [coordX, coordY, coordZ],
                            viewport,
                        });
                    }
                )
            }

            interaction_channel.on(
                'broadcast',
                { event: 'chat-updated' },
                (payload) => {
                    dispatch({ type: 'update_chat_history', payload: payload.payload.messages })
                }
            )

            interaction_channel.on(
                'broadcast',
                { event: 'annotations-submitted' },
                (payload) => {
                    dispatch({ type: 'annotation_received', payload: payload.payload })
                }
            )

            interaction_channel.on(
                'broadcast',
                { event: 'question-answers-submitted' },
                (payload) => {
                    dispatch({ type: 'question_answer_received', payload: payload.payload })
                }
            )

            dispatch({ type: 'sharing_controller_initialized', payload: { shareController: share_controller, interactionChannel: interaction_channel, rosterChannel: roster_channel } })

            return () => {
                incoming.cancel();
                supabaseClient.removeChannel(allChanges);
                if (data.shareController) data.shareController.unsubscribe();
                if (data.rosterChannel) { data.rosterChannel.untrack?.(); data.rosterChannel.unsubscribe(); }
                if (data.interactionChannel) data.interactionChannel.unsubscribe();
            }
        }
    }, [data.sessionId, supabaseClient]);

    useEffect(() => {
        const canBroadcast =
            (data.sessionMeta.mode == "TEAM" || userData.id != data.sessionMeta.owner) &&
            data.shareController &&
            data.renderingEngine &&
            data.sharingUser === userData?.id &&
            data.sessionId;

        if (!canBroadcast) return;

        const manager = data.eventListenerManager;
        const channel = data.interactionChannel;
        if (!manager || !channel) return;

        // Drop previous bindings before re-attaching so tool toggles
        // (e.g. long-press pointer) cannot stack duplicate listeners.
        manager.reset();

        const outgoing = createLatestThrottle(SYNC_INTERVAL_MS);
        const pointerOutgoing = createLatestThrottle(POINTER_INTERVAL_MS);
        const broadcast = (event, key, payload, throttle = outgoing) =>
            throttle.push(`${event}:${key}`, () =>
                channel.send({ type: 'broadcast', event, payload })
            );

        const viewports = data.renderingEngine.getViewports().sort((a, b) => {
            const idA = Number(a.id.split("-")[0]);
            const idB = Number(b.id.split("-")[0]);
            if (idA < idB) return -1;
            if (idA > idB) return 1;
            return 0;
        });

        viewports.forEach((vp, viewport_idx) => {
            const viewportKey = `${viewport_idx}-vp`;
            let lastVoi = null;

            manager.addEventListener(vp.element, 'CORNERSTONE_STACK_NEW_IMAGE', () => {
                broadcast('frame-changed', viewportKey, {
                    imageId: vp.getCurrentImageId(),
                    viewport: viewportKey,
                });
            });

            // Scrolling re-applies the same VOI on every slice; only send real changes.
            manager.addEventListener(vp.element, 'CORNERSTONE_VOI_MODIFIED', (event) => {
                const { windowWidth: ww, windowCenter: wc } = cornerstone.utilities.windowLevel.toWindowLevel(
                    event.detail.range.lower,
                    event.detail.range.upper
                );
                if (lastVoi && Math.abs(lastVoi.ww - ww) < 0.5 && Math.abs(lastVoi.wc - wc) < 0.5) return;
                lastVoi = { ww, wc };
                broadcast('voi-changed', viewportKey, { ww, wc, viewport: viewportKey });
            });

            if (data.toolSelected == "pointer") {
                const pointerEvent = mobile
                    ? cornerstoneTools.Enums.Events.TOUCH_DRAG
                    : cornerstoneTools.Enums.Events.MOUSE_MOVE;

                manager.addEventListener(vp.element, pointerEvent, (event) => {
                    const { currentPoints } = event.detail || {};
                    if (currentPoints?.world) {
                        broadcast('pointer-changed', 'pointer', {
                            coordX: currentPoints.world[0],
                            coordY: currentPoints.world[1],
                            coordZ: currentPoints.world[2],
                            viewport: viewportKey,
                        }, pointerOutgoing);
                    }
                });
            }
        });

        // Hide remote pointer once when leaving pointer tool (not once per viewport)
        if (data.toolSelected != "pointer") {
            channel.send({
                type: 'broadcast',
                event: 'pointer-changed',
                payload: { coordX: 10000, coordY: 10000, coordZ: 10000 },
            });
        }

        return () => {
            manager.reset();
            outgoing.cancel();
            pointerOutgoing.cancel();
        };
    }, [data.shareController, data.renderingEngine, data.sharingUser, userData, data.toolSelected, data.sessionId, data.sessionMeta.mode, data.sessionMeta.owner]);


    useEffect(() => {
        // BroadCast Initial State when taking control
        if (data.sharingUser === userData?.id && data.renderingEngine && data.interactionChannel && data.sessionId) {



            try {
                data.renderingEngine.getViewports().sort((a, b) => {
                    const idA = Number(a.id.split("-")[0])
                    const idB = Number(b.id.split("-")[0])
                    if (idA < idB) { return -1; }
                    if (idA > idB) { return 1; }
                    return 0
                }).forEach((vp, viewport_idx) => {
                    // 1. Sync Frame/Slice using absolute imageId
                    const currentImageId = vp.getCurrentImageId();
                    if (currentImageId) {
                        data.interactionChannel.send({
                            type: 'broadcast',
                            event: 'frame-changed',
                            payload: { imageId: currentImageId, viewport: `${viewport_idx}-vp` },
                        });
                    }

                    // 2. Sync Window/Level (VOI)
                    const { voiRange } = vp.getProperties();
                    if (voiRange) {
                        const window = cornerstone.utilities.windowLevel.toWindowLevel(voiRange.lower, voiRange.upper)
                        data.interactionChannel.send({
                            type: 'broadcast',
                            event: 'voi-changed',
                            payload: { ww: window.windowWidth, wc: window.windowCenter, viewport: `${viewport_idx}-vp` }
                        });
                    }
                })
            } catch (error) {
                console.error("Error syncing initial state:", error);
            }
        }
    }, [data.sharingUser, data.renderingEngine, data.interactionChannel, userData, data.sessionId]);

    useEffect(() => {
        if (!data.interactionChannel || !data.sessionId) return;
        if (!userData?.id || data.sharingUser !== userData.id) return;
        data.interactionChannel.send({
            type: 'broadcast',
            event: 'fullscreen-changed',
            payload: { viewport: data.fullscreenViewport ?? null },
        });
    }, [data.fullscreenViewport, data.sharingUser, data.interactionChannel, userData?.id, data.sessionId]);

    return (
        <DataContext.Provider value={{ data }}>
            <DataDispatchContext.Provider value={{ dispatch }}>
                {children}
            </DataDispatchContext.Provider>
        </DataContext.Provider>
    );
};

export function dataReducer(data, action) {

    let new_data = { ...data };

    switch (action.type) {

        // Initialization events
        case 'cornerstone_initialized':
            new_data = { ...data, ...action.payload };
            break;
        case 'update_viewport_data':
            var vd = action.payload.vd;
            var ld = action.payload.ld;
            var m = action.payload.m;

            var sessionMeta = {
                owner: action.payload.owner ?? data.sessionMeta?.owner,
                mode: action.payload.mode ?? data.sessionMeta?.mode,
                joinCode: action.payload.joinCode ?? data.sessionMeta?.joinCode
            }
            new_data = {
                ...data, ld: ld, vd: vd, m: m,
                sessionMeta: sessionMeta,
                isRequestLoading: false,
            };
            if (action.payload.chatHistory) {
                new_data.chatHistory = action.payload.chatHistory;
            }
            if (action.payload.caseUrlParams) {
                new_data.caseUrlParams = action.payload.caseUrlParams;
            }
            const nextPlaylistId = action.payload.p || getPlaylistIdFromSearch(action.payload.caseUrlParams);
            if (nextPlaylistId) new_data.playlistId = nextPlaylistId;
            break;
        case 'sharing_controller_initialized':
            new_data = { ...data, ...action.payload }
            break;
        case 'connect_to_sharing_session':
            var sessionId = action.payload.sessionId;
            var sessionMeta2 = {
                owner: action.payload.owner ?? data.sessionMeta?.owner,
                mode: action.payload.mode ?? data.sessionMeta?.mode,
                joinCode: action.payload.joinCode ?? data.sessionMeta?.joinCode
            }
            var sessionChanged = data.sessionId !== sessionId;
            new_data = {
                ...data,
                sessionId: sessionId,
                sessionMeta: sessionMeta2,
                isRequestLoading: false,
                toolSelected: 'scroll',
                answerKeyAuthoring: false,
                heatmapVisible: false,
                participantAnswerContentAvailable: false,
                hostAnswerContentAvailable: false,
            };
            if (sessionChanged) {
                new_data.submittedQuestionAnswers = {};
                new_data.submittedAnnotations = {};
            }
            break;
        case 'update_chat_history':
            new_data = { ...data, chatHistory: action.payload };
            break;

        case 'apply_share_change': {
            const { user, ts, by, override } = action.payload;
            const prevTs = data.shareClock ?? 0;
            const prevBy = data.shareBy ?? "";
            const wins = ts > prevTs || (ts === prevTs && String(by) > String(prevBy));
            if (!wins) return data;

            const isTakeover = user && data.sharingUser && user !== data.sharingUser;
            const byIsOwner = Boolean(by && data.sessionMeta?.owner && by === data.sessionMeta.owner);
            // Someone else is already broadcasting: only the session owner / presenter
            // can steal. Everyone else must wait for a release.
            if (isTakeover && !override && !byIsOwner) {
                return data;
            }

            const sharingUser = user ?? null;
            // update roster flags
            const updatedActive = (data.activeUsers || []).map(u => ({
                ...u,
                isSharing: u.user === sharingUser
            }));

            if (sharingUser && sharingUser !== data.sharingUser) {
                // Find the user's name from the active users roster
                const sharingUserInfo = updatedActive.find(u => u.user === sharingUser);
                const displayName = sharingUserInfo?.name || sharingUser;
                toast(`${displayName} has taken control`);
            } else if (!sharingUser && data.sharingUser) {
                data?.eventListenerManager?.reset();
                toast(`Control released`);
            }

            new_data = { ...data, sharingUser, shareClock: ts, shareBy: by, activeUsers: updatedActive };
            break;
        }

        case 'set_session_case_link': {
            new_data = { ...data, sessionCaseLink: action.payload || null };
            break;
        }
        case 'roster_updated': {
            const list = (action.payload || []).map(u => ({
                ...u,
                isSharing: u.user === data.sharingUser
            }));
            new_data = { ...data, activeUsers: list };
            break;
        }
        case 'toggle_sharing': {
            let { userData } = action.payload;
            if (data.shareController) {
                const iAmPresenter = isPresenter({
                    sessionId: data.sessionId,
                    userId: userData?.id,
                    ownerId: data.sessionMeta?.owner,
                });
                const current = data.sharingUser;
                const iAmSharing = current === userData.id;
                if (current && !iAmSharing && !iAmPresenter) {
                    toast("Wait for the current user to release control");
                    return data;
                }

                // If I'm not current owner, I'll take; else I'll release
                const taking = !iAmSharing;
                if (!taking) {
                    // releasing — stop emitting interaction events immediately
                    data?.eventListenerManager?.reset();
                }
                const ts = Date.now();
                data.shareController.send({
                    type: 'broadcast',
                    event: 'share-changed',
                    payload: {
                        user: taking ? userData.id : null,
                        ts,
                        by: userData.id,
                        override: iAmPresenter,
                    },
                });
            }
            break;
        }

        case 'select_tool':
            new_data = { ...data, toolSelected: action.payload }
            break;
        case 'toggle_fullscreen_viewport': {
            const idx = action.payload;
            const next = data.fullscreenViewport === idx ? null : idx;
            new_data = { ...data, fullscreenViewport: next };
            break;
        }
        case 'set_fullscreen_viewport':
            new_data = { ...data, fullscreenViewport: action.payload };
            break;
        case 'set_pointer': {
            // Pointer is applied outside React so sharing does not re-render the viewer.
            setRemotePointer({
                coord: [action.payload.coordX, action.payload.coordY, action.payload.coordZ],
                viewport: action.payload.viewport,
            });
            return data;
        }
        case 'update_session_owner':
            new_data = {
                ...data,
                sessionMeta: {
                    ...data.sessionMeta,
                    owner: action.payload
                }
            };
            break;
        case 'store_segmentation':
            new_data = { ...data, lastSegmentation: action.payload };
            break;
        case 'activate_compare_normal': {
            const { normalVd, scrollOffset, normalCentroidSlice, patientCentroidSlice, normalMaskDataList, structure } = action.payload;
            new_data = {
                ...data,
                fullscreenViewport: null,
                compareNormal: {
                    active: true,
                    structure,
                    scrollOffset,
                    normalCentroidSlice,
                    patientCentroidSlice,
                    normalMaskDataList,
                    originalLd: { ...data.ld },
                    originalVd: [...data.vd],
                },
                ld: { r: 1, c: 2 },
                vd: [...data.vd, normalVd],
            };
            break;
        }
        case 'deactivate_compare_normal': {
            if (!data.compareNormal) { new_data = data; break; }
            new_data = {
                ...data,
                fullscreenViewport: null,
                ld: data.compareNormal.originalLd,
                vd: data.compareNormal.originalVd,
                compareNormal: null,
            };
            break;
        }
        case 'request_compare_normal':
            new_data = { ...data, compareNormalRequested: true };
            break;
        case 'clear_compare_normal_request':
            new_data = { ...data, compareNormalRequested: false };
            break;
        case 'annotation_received': {
            const { userId, userName, boxes } = action.payload;
            if (data.submittedAnnotations?.[userId]) return data;
            new_data = {
                ...data,
                submittedAnnotations: {
                    ...data.submittedAnnotations,
                    [userId]: { userName, boxes }
                }
            };
            break;
        }
        case 'question_answer_received': {
            const { userId, userName, answers } = action.payload;
            if (data.submittedQuestionAnswers?.[userId]) return data;
            new_data = {
                ...data,
                submittedQuestionAnswers: {
                    ...data.submittedQuestionAnswers,
                    [userId]: { userName, answers }
                }
            };
            break;
        }
        case 'restore_submissions': {
            // Merge persisted submissions under any already in memory (live data
            // wins) so a restore never clobbers freshly received answers.
            const restoredQ = action.payload?.submittedQuestionAnswers || {};
            const restoredA = action.payload?.submittedAnnotations || {};
            new_data = {
                ...data,
                submittedQuestionAnswers: { ...restoredQ, ...data.submittedQuestionAnswers },
                submittedAnnotations: { ...restoredA, ...data.submittedAnnotations },
            };
            break;
        }
        case 'clear_all_annotations':
            new_data = { ...data, submittedAnnotations: {}, submittedQuestionAnswers: {} };
            break;
        case 'set_case_link':
            new_data = {
                ...data,
                studyId: action.payload.studyId ?? data.studyId,
                studyName: action.payload.studyName ?? data.studyName,
                dicomSeriesId: action.payload.dicomSeriesId ?? data.dicomSeriesId,
                dicomSeriesOwner: action.payload.dicomSeriesOwner ?? data.dicomSeriesOwner,
                dicomSeriesName: action.payload.dicomSeriesName ?? data.dicomSeriesName,
                pacsbinStudyName: action.payload.pacsbinStudyName ?? data.pacsbinStudyName,
                caseUrlParams: action.payload.caseUrlParams ?? data.caseUrlParams,
                caseUrlKey: action.payload.caseUrlKey ?? data.caseUrlKey,
            };
            break;
        case 'set_answer_key_authoring':
            new_data = { ...data, answerKeyAuthoring: action.payload };
            break;
        case 'set_persisted_answer_boxes':
            new_data = { ...data, persistedAnswerBoxes: action.payload || [] };
            break;
        case 'append_persisted_answer_box':
            new_data = {
                ...data,
                persistedAnswerBoxes: [...(data.persistedAnswerBoxes || []), action.payload],
            };
            break;
        case 'remove_persisted_answer_box':
            new_data = {
                ...data,
                persistedAnswerBoxes: (data.persistedAnswerBoxes || []).filter(
                    (b) => b.rowId !== action.payload
                ),
            };
            break;
        case 'toggle_heatmap':
            new_data = { ...data, heatmapVisible: !data.heatmapVisible };
            break;
        case 'set_participant_answer_content':
            new_data = { ...data, participantAnswerContentAvailable: !!action.payload };
            break;
        case 'set_host_answer_content':
            new_data = { ...data, hostAnswerContentAvailable: !!action.payload };
            break;
        case 'switch_viewer': {
            const next = action.payload || {};
            new_data = {
                ...data,
                vd: next.vd ?? data.vd,
                ld: next.ld ?? data.ld,
                m: next.m ?? data.m,
                caseUrlParams: next.caseUrlParams ?? null,
                playlistId: next.playlistId ?? null,
                caseUrlKey: next.caseUrlKey ?? null,
                studyId: null,
                studyName: null,
                dicomSeriesId: null,
                dicomSeriesOwner: null,
                dicomSeriesName: null,
                pacsbinStudyName: null,
                sessionCaseLink: null,
                persistedAnswerBoxes: [],
                submittedAnnotations: {},
                submittedQuestionAnswers: {},
                participantAnswerContentAvailable: false,
                hostAnswerContentAvailable: false,
                heatmapVisible: false,
                answerKeyAuthoring: false,
                compareNormal: null,
                fullscreenViewport: null,
                isRequestLoading: false,
            };
            break;
        }
        default:
            throw Error('Unknown action: ' + action.type);
    }
    return new_data;
}
