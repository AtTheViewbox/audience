import { createContext, useState, useEffect, useReducer, useContext, useRef } from "react";
import { unflatten, flatten } from "flat";
import { recreateList } from '../lib/inputParser.ts';

import * as cornerstone from '@cornerstonejs/core';
import { eventTarget } from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { utilities } from '@cornerstonejs/core';
import { toast } from "sonner"
import defaultData from "./defaultData.jsx";
import { cl } from './SupabaseClient.jsx';
import { UserContext, UserDispatchContext } from "./UserContext.jsx";
import { resolveSeriesPrefix } from "../lib/seriesLink.js";
import { findStudyForViewer, findPacsbinStudyForViewer, resolveCaseUrlKey, caseKeyFromLink, buildAnnotationInsert } from "../lib/answerKeyCase.js";
import { resolveViewportIndex } from "../lib/answerKeyBoxes.js";
import { getLeaderboardEnabled } from "../lib/userPreferences.js";
import { fetchSessionSubmissions } from "../lib/sessionSubmissions.js";
import { isDemoMode } from "../lib/demoCase.js";
import { createShareSession, sameViewerStudy } from "../lib/shareSession.js";

export const DataContext = createContext({});
export const DataDispatchContext = createContext({});

const queryParams = new URLSearchParams(window.location.search);
var initialData = unflatten(Object.fromEntries(queryParams));
// create initial data object from URL query string

if (initialData.vd) {
    initialData.vd.forEach((vdItem) => {
        if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
            vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e, vdItem.s.D);
        }
    })
    initialData.isRequestLoading = false
}

else if (initialData.s) {
    initialData = Object.assign(defaultData.defaultData, initialData);
    initialData.isRequestLoading = true;
}

initialData.userData = null;

initialData.sharingUser = null;
initialData.sessionMeta = { mode: "TEAM", owner: "" }
// Session-wide leaderboard visibility, controlled by the session author and
// broadcast to every participant. Defaults on until the owner says otherwise.
initialData.leaderboardEnabled = true;
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
initialData.heatmapVisible = false;

// Resolved case link for the answer-key feature (studies and/or dicom_series).
initialData.studyId = null;
initialData.studyName = null;
initialData.dicomSeriesId = null;
initialData.dicomSeriesOwner = null;
initialData.dicomSeriesName = null;
initialData.pacsbinStudyName = null;
initialData.caseUrlParams = queryParams.toString() || null;
initialData.caseUrlKey = resolveCaseUrlKey({
  search: window.location.search,
  caseUrlParams: queryParams.toString() || null,
}) || null;
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

    // Always reflects this user's own leaderboard preference so the session
    // effect can broadcast the latest value to late-joining participants
    // without re-subscribing the realtime channels.
    const leaderboardPrefRef = useRef(getLeaderboardEnabled(userData));
    useEffect(() => {
        leaderboardPrefRef.current = getLeaderboardEnabled(userData);
    }, [userData, userData?.user_metadata?.show_leaderboard]);

    // Tracks whether this user authors the active session. Kept in a ref so
    // realtime channel callbacks always see the latest value (ownership is
    // resolved asynchronously after the channels subscribe).
    const isSessionOwnerRef = useRef(false);
    const lastSendPointerRef = useRef(0);
    const lastSendCameraRef = useRef(0);
    const lastSendVOIRef = useRef(0);
    const cameraDebounceTimeoutRef = useRef(null);
    useEffect(() => {
        isSessionOwnerRef.current = !!userData?.id && data.sessionMeta?.owner === userData.id;
    }, [userData?.id, data.sessionMeta?.owner]);

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

    // Whenever we own a live session, publish the current leaderboard setting so
    // everyone (and our own state) stays in sync — fires when the share channel
    // comes up, when ownership is established, and when the author flips the
    // preference. This is what makes the setting persist across transfers.
    useEffect(() => {
        if (!data.shareController) return;
        const iAmOwner = !!userData?.id && data.sessionMeta?.owner === userData.id;
        if (!iAmOwner) return;
        data.shareController.send({
            type: 'broadcast', event: 'leaderboard-changed',
            payload: { enabled: getLeaderboardEnabled(userData) }
        });
    }, [data.shareController, data.sessionMeta?.owner, userData?.id, userData?.user_metadata?.show_leaderboard]);

    // As author, publish the resolved case identifiers so participants can load
    // the right questions even when they can't resolve the case themselves
    // (RLS on studies, or a stale URL after a transfer).
    useEffect(() => {
        if (!data.shareController) return;
        const iAmOwner = !!userData?.id && data.sessionMeta?.owner === userData.id;
        if (!iAmOwner) return;
        const cl = caseLinkRef.current;
        if (!cl.studyId && !cl.dicomSeriesId && !cl.caseUrlKey) return;
        data.shareController.send({ type: 'broadcast', event: 'case-link', payload: cl });
    }, [data.shareController, data.sessionMeta?.owner, userData?.id, data.studyId, data.dicomSeriesId, data.caseUrlKey]);

    // Load persisted submissions for this session+case so the leaderboard is
    // authoritative and survives transfers/refreshes (which reload every client)
    // and is available to clients that join after others have submitted. Scoping
    // by case means a transfer to a new case starts everyone fresh.
    const effectiveCaseLink = data.sessionCaseLink && (
        data.sessionCaseLink.studyId || data.sessionCaseLink.dicomSeriesId || data.sessionCaseLink.caseUrlKey
    )
        ? data.sessionCaseLink
        : { studyId: data.studyId, dicomSeriesId: data.dicomSeriesId, caseUrlKey: data.caseUrlKey };
    const effectiveCaseKey = caseKeyFromLink(effectiveCaseLink);
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

        if (updateSession?.eventType === "DELETE") {
            dispatch({ type: 'loading_request' })
            if (updateSession.old && updateSession.old.session_id) {
                getSession(supabaseClient, updateSession.old.session_id).then((payload) => {
                    if (payload.length == 0) {
                        userDispatch({ type: "clean_up_supabase" });
                    }
                })
            } else {
                // Fallback if we can't identify the session, just cleanup
                userDispatch({ type: "clean_up_supabase" });
            }
        }

        if (updateSession?.eventType === "UPDATE") {
            dispatch({ type: 'loading_request' })
            var currentURL = unflatten(Object.fromEntries(new URLSearchParams(window.location.search)));
            if (!currentURL.vd) {
                var newData = unflatten(Object.fromEntries(new URLSearchParams(updateSession.new.url_params)));
                if (newData.vd) {
                    newData.vd.forEach((vdItem) => {
                        if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
                            vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e, vdItem.s.D);
                        }
                    })
                }
                dispatch({ type: "update_viewport_data", payload: { ...newData } })

                // Log before reload to help diagnose mobile refresh issues
                console.warn('SESSION UPDATE RELOAD TRIGGERED - Session transfer detected');
                console.warn('If you see this on mobile during normal loading, this is the bug!');

                //TODO: Fix buggy tranfering sessions, but reloading works for now.
                window.location.reload();
            } else {
                userDispatch({ type: "clean_up_supabase" });
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
            window.cornerstone = cornerstone;
            window.cornerstoneTools = cornerstoneTools;
            cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
            cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;

            // Configure DICOM image loader with web workers for codec support
            cornerstoneDICOMImageLoader.configure({
                useWebWorkers: true,
                decodeConfig: {
                    convertFloatPixelDataToInt: false,
                    use16BitDataType: true
                }
            });


            // Cap at 4 workers to prevent WASM memory exhaustion
            // (concurrency is 3-6, so 4 workers is plenty)
            const workerCount = Math.min(navigator.hardwareConcurrency || 4, 4);

            cornerstoneDICOMImageLoader.webWorkerManager.initialize({
                maxWebWorkers: workerCount,
                startWebWorkersOnDemand: false,  // Pre-spawn workers
                taskConfiguration: {
                    decodeTask: {
                        initializeCodecsOnStartup: true,  // Initialize codecs early
                        strict: false,
                    },
                },
            });


            // Register the wadouri image loader
            cornerstone.imageLoader.registerImageLoader(
                'wadouri',
                cornerstoneDICOMImageLoader.wadouri.loadImage
            );

            await cornerstone.init();

            // Reduce cache size on mobile to prevent WASM memory exhaustion
            const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
            const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
            const cacheSizeBytes = isMobile
                ? 384 * 1024 * 1024  // 384MB for mobile (reduced from 512MB)
                : 3000 * 1024 * 1024; // 3GB for desktop
            cornerstone.cache.setMaxCacheSize(cacheSizeBytes);

            await cornerstoneTools.init();

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

                var { data, errorSession } = await cl
                    .from("viewbox")
                    .select("user, url_params, session_id,mode,chat_history")
                    .eq("session_id", initialData?.s);

                if (errorSession) throw errorSession;

                if (data?.length == 0) {
                    initialData.s = null
                }
                else {
                    initialData.s = data[0].session_id
                    initialData.sessionMeta.mode = data[0].mode
                    initialData.sessionMeta.owner = data[0].user

                    var newData = unflatten(Object.fromEntries(new URLSearchParams(data[0].url_params)));
                    if (newData.vd) {
                        newData.vd.forEach((vdItem) => {
                            if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
                                vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e, vdItem.s.D);
                            }
                        })
                    }
                    // Explicitly pass owner here to ensure it is set even if not previously in state
                    dispatch({
                        type: "update_viewport_data",
                        payload: {
                            ...newData,
                            mode: data[0].mode,
                            owner: data[0].user,
                            chatHistory: data[0].chat_history,
                            caseUrlParams: data[0].url_params,
                        },
                    })
                }
            }

            // Only look for existing sessions for real (non-anonymous) logged-in users
            // Anonymous users cannot create sessions, so this query would never return results
            if (userData && !userData.is_anonymous) {
                var { data, errorCurrentSession } = await cl
                    .from("viewbox")
                    .select("user, url_params, session_id,mode,chat_history")
                    .eq("user", userData.id);
                if (errorCurrentSession) throw errorCurrentSession;

                if (data?.length != 0 && sameViewerStudy(data[0].url_params, queryParams.toString())) {
                    initialData.s = data[0].session_id
                    initialData.sessionMeta.mode = data[0].mode
                    initialData.sessionMeta.owner = data[0].user
                }
            }

            // Demo launch: this visitor is the host. Create (or reuse) a session
            // so the QR in the demo overlay is immediately joinable.
            const joiningViaLink = !!queryParams.get("s");
            if (!joiningViaLink && isDemoMode(queryParams.toString()) && userData) {
                try {
                    const { data: existingDemo } = await cl
                        .from("viewbox")
                        .select("user, url_params, session_id, mode, chat_history")
                        .eq("user", userData.id);

                    if (
                        existingDemo?.length &&
                        sameViewerStudy(existingDemo[0].url_params, queryParams.toString())
                    ) {
                        initialData.s = existingDemo[0].session_id;
                        initialData.sessionMeta.mode = existingDemo[0].mode;
                        initialData.sessionMeta.owner = userData.id;
                    } else {
                        const row = await createShareSession({
                            supabaseClient: cl,
                            userId: userData.id,
                            chatHistory: [],
                        });
                        initialData.s = row.session_id;
                        initialData.sessionMeta.mode = row.mode;
                        initialData.sessionMeta.owner = userData.id;
                    }
                } catch (demoErr) {
                    console.error("Demo session create failed:", demoErr);
                }
            }
        }


        setupCornerstone()

        setupSupabase().then(() => {
            dispatch({ type: 'connect_to_sharing_session', payload: { sessionId: initialData.s, mode: initialData.sessionMeta.mode, owner: initialData.sessionMeta.owner } })
        }).catch((err) => {
            console.error('setupSupabase failed:', err);
            dispatch({ type: 'connect_to_sharing_session', payload: { sessionId: initialData.s, mode: initialData.sessionMeta.mode, owner: initialData.sessionMeta.owner } })
        })

        return () => {
            userDispatch({ type: 'clean_up_supabase' })
        }

    }, []);

    // Update session owner when user logs in
    useEffect(() => {
        if (userData && data.sessionId && supabaseClient) {
            // Check if this user owns the current session
            supabaseClient
                .from("viewbox")
                .select("user")
                .eq("session_id", data.sessionId)
                .eq("user", userData.id)
                .then(({ data: sessionData, error }) => {
                    if (sessionData && sessionData.length > 0 && !error) {
                        // This user owns the session - update sessionMeta.owner
                        console.log('Updating session owner to:', userData.id);
                        console.log('shareController exists:', !!data.shareController);
                        dispatch({ type: 'update_session_owner', payload: userData.id });

                        // If Supabase not set up yet, set it up now
                        if (!data.shareController) {
                            console.log('Setting up Supabase after login');
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
                .channel('schema-db-changes')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'viewbox'
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

            share_controller.on('broadcast', { event: 'leaderboard-changed' }, ({ payload }) => {
                dispatch({ type: 'set_session_leaderboard', payload: payload.enabled });
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
                        // As author, re-push the leaderboard setting and case
                        // identifiers so the newcomer matches everyone else.
                        if (isSessionOwnerRef.current) {
                            share_controller.send({
                                type: 'broadcast', event: 'leaderboard-changed',
                                payload: { enabled: leaderboardPrefRef.current }
                            });
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
                        // As author, make sure the newcomer gets the current
                        // leaderboard setting and case identifiers too.
                        if (isSessionOwnerRef.current) {
                            share_controller.send({
                                type: 'broadcast', event: 'leaderboard-changed',
                                payload: { enabled: leaderboardPrefRef.current }
                            });
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

            if (data.sessionMeta.mode == "TEAM" || userData.id == data.sessionMeta.owner) {

                interaction_channel.on(
                    'broadcast',
                    { event: 'frame-changed' },
                    (payload) => {
                        const viewport = data.renderingEngine.getViewport(payload.payload.viewport);
                        const sharedImageId = payload.payload.imageId;

                        const localStack = viewport.getImageIds();
                        const localIndex = localStack.indexOf(sharedImageId);

                        if (localIndex !== -1) {
                            const currentCamera = viewport.getCamera();
                            viewport.setImageIdIndex(localIndex);
                            viewport.setCamera(currentCamera);
                            viewport.render();
                        } else {
                            console.log('Shared image not loaded yet:', sharedImageId);
                        }
                    }
                )

                interaction_channel.on(
                    'broadcast',
                    { event: 'voi-changed' },
                    (payload) => {
                        data.renderingEngine.getViewport(payload.payload.viewport).setProperties({
                            voiRange: cornerstone.utilities.windowLevel.toLowHighRange(payload.payload.ww, payload.payload.wc),
                            isComputedVOI: false,
                        });
                        data.renderingEngine.getViewport(payload.payload.viewport).render()
                    }
                )

                interaction_channel.on(
                    'broadcast',
                    { event: 'pointer-changed' },
                    (payload) => {
                        const { coordX, coordY, coordZ, viewport } = payload.payload;
                        dispatch({
                            type: 'set_pointer',
                            payload: { coordX, coordY, coordZ, viewport },
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
                if (data.shareController) data.shareController.unsubscribe();
                if (data.rosterChannel) { data.rosterChannel.untrack?.(); data.rosterChannel.unsubscribe(); }
                if (data.interactionChannel) data.interactionChannel.unsubscribe();
            }
        }
    }, [data.sessionId, supabaseClient]);

    const sendPointer = (payload) => {
        if (!data.interactionChannel) return;
        const now = performance.now();
        if (now - lastSendPointerRef.current < 50) return; // ~20 Hz
        lastSendPointerRef.current = now;
        data.interactionChannel.send({
            type: 'broadcast',
            event: 'pointer-changed',
            payload
        });
    };

    const sendCamera = (payload) => {
        if (!data.interactionChannel) return;
        const now = performance.now();
        if (now - lastSendCameraRef.current < 50) return; // ~20 Hz throttle

        // Debounce to prevent sending transient states during scroll
        if (cameraDebounceTimeoutRef.current) {
            clearTimeout(cameraDebounceTimeoutRef.current);
        }

        cameraDebounceTimeoutRef.current = setTimeout(() => {
            lastSendCameraRef.current = now;
            if (data.interactionChannel) {
                data.interactionChannel.send({
                    type: 'broadcast',
                    event: 'camera-changed',
                    payload
                });
            }
        }, 150); // 150ms debounce
    };

    const sendVOI = (payload) => {
        if (!data.interactionChannel) return;
        const now = performance.now();
        if (now - lastSendVOIRef.current < 100) return; // ~10 Hz
        lastSendVOIRef.current = now;
        data.interactionChannel.send({
            type: 'broadcast',
            event: 'voi-changed',
            payload
        });
    };

    useEffect(() => {
        const canBroadcast =
            (data.sessionMeta.mode == "TEAM" || userData.id != data.sessionMeta.owner) &&
            data.shareController &&
            data.renderingEngine &&
            data.sharingUser === userData?.id &&
            data.sessionId;

        if (!canBroadcast) return;

        const manager = data.eventListenerManager;
        if (!manager) return;

        // Drop previous bindings before re-attaching so tool toggles
        // (e.g. long-press pointer) cannot stack duplicate listeners.
        manager.reset();

        const viewports = data.renderingEngine.getViewports().sort((a, b) => {
            const idA = Number(a.id.split("-")[0]);
            const idB = Number(b.id.split("-")[0]);
            if (idA < idB) return -1;
            if (idA > idB) return 1;
            return 0;
        });

        viewports.forEach((vp, viewport_idx) => {
            manager.addEventListener(vp.element, 'CORNERSTONE_STACK_NEW_IMAGE', () => {
                if (!data.interactionChannel) return;
                const currentImageId = vp.getCurrentImageId();
                data.interactionChannel.send({
                    type: 'broadcast',
                    event: 'frame-changed',
                    payload: { imageId: currentImageId, viewport: `${viewport_idx}-vp` },
                });
            });

            manager.addEventListener(vp.element, 'CORNERSTONE_VOI_MODIFIED', (event) => {
                const window = cornerstone.utilities.windowLevel.toWindowLevel(
                    event.detail.range.lower,
                    event.detail.range.upper
                );
                sendVOI({ ww: window.windowWidth, wc: window.windowCenter, viewport: `${viewport_idx}-vp` });
            });

            manager.addEventListener(vp.element, 'CORNERSTONE_CAMERA_MODIFIED', () => {
                // Camera sync intentionally disabled — kept as a no-op hook.
                // const camera = vp.getCamera();
                // sendCamera({ camera: camera, viewport: `${viewport_idx}-vp` })
            });

            if (data.toolSelected == "pointer") {
                const pointerEvent = mobile
                    ? cornerstoneTools.Enums.Events.TOUCH_DRAG
                    : cornerstoneTools.Enums.Events.MOUSE_MOVE;

                manager.addEventListener(vp.element, pointerEvent, (event) => {
                    const { currentPoints } = event.detail || {};
                    if (currentPoints?.world) {
                        sendPointer({
                            coordX: currentPoints.world[0],
                            coordY: currentPoints.world[1],
                            coordZ: currentPoints.world[2],
                            viewport: `${viewport_idx}-vp`,
                        });
                    }
                });
            }
        });

        // Hide remote pointer once when leaving pointer tool (not once per viewport)
        if (data.toolSelected != "pointer" && data.interactionChannel) {
            data.interactionChannel.send({
                type: 'broadcast',
                event: 'pointer-changed',
                payload: { coordX: 10000, coordY: 10000, coordZ: 10000 },
            });
        }

        return () => {
            manager.reset();
            if (cameraDebounceTimeoutRef.current) {
                clearTimeout(cameraDebounceTimeoutRef.current);
                cameraDebounceTimeoutRef.current = null;
            }
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

                    // 3. Explicitly NO Camera/Zoom sync here
                })
            } catch (error) {
                console.error("Error syncing initial state:", error);
            }
        }
    }, [data.sharingUser, data.renderingEngine, data.interactionChannel, userData, data.sessionId]);

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
        case 'loading_request':
            new_data = { ...data, isRequestLoading: true }
            break;
        case 'update_viewport_data':
            var vd = action.payload.vd;
            var ld = action.payload.ld;
            var m = action.payload.m;

            var sessionMeta = {
                owner: action.payload.owner ?? data.sessionMeta?.owner,
                mode: action.payload.mode ?? data.sessionMeta?.mode
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
            break;
        case 'sharing_controller_initialized':
            new_data = { ...data, ...action.payload }
            break;
        case 'connect_to_sharing_session':
            var sessionId = action.payload.sessionId;
            var sessionMeta2 = {
                owner: action.payload.owner ?? data.sessionMeta?.owner,
                mode: action.payload.mode ?? data.sessionMeta?.mode
            }
            new_data = {
                ...data,
                sessionId: sessionId,
                sessionMeta: sessionMeta2,
                isRequestLoading: false,
                toolSelected: 'scroll',
                answerKeyAuthoring: false,
                heatmapVisible: false,
                submittedQuestionAnswers: {},
                participantAnswerContentAvailable: false,
            };
            break;
        case 'update_chat_history':
            new_data = { ...data, chatHistory: action.payload };
            break;

        case 'apply_share_change': {
            const { user, ts, by } = action.payload;
            const prevTs = data.shareClock ?? 0;
            const prevBy = data.shareBy ?? "";
            const wins = ts > prevTs || (ts === prevTs && String(by) > String(prevBy));
            if (!wins) return data;

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

        case 'set_session_leaderboard': {
            new_data = { ...data, leaderboardEnabled: action.payload !== false };
            break;
        }
        case 'set_session_case_link': {
            new_data = { ...data, sessionCaseLink: action.payload || null };
            break;
        }
        case 'broadcast_leaderboard': {
            // Author toggled the leaderboard: push to everyone in the session
            // (share controller is self:true, so our own state updates too).
            const enabled = action.payload !== false;
            if (data.shareController) {
                data.shareController.send({
                    type: 'broadcast', event: 'leaderboard-changed',
                    payload: { enabled }
                });
            }
            new_data = { ...data, leaderboardEnabled: enabled };
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
                // If I'm not current owner, I'll take; else I'll release
                const taking = data.sharingUser !== userData.id;
                if (!taking) {
                    // releasing — stop emitting interaction events immediately
                    data?.eventListenerManager?.reset();
                }
                const ts = Date.now();
                data.shareController.send({
                    type: 'broadcast',
                    event: 'share-changed',
                    payload: { user: taking ? userData.id : null, ts, by: userData.id },
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
            const nextCoord = [action.payload.coordX, action.payload.coordY, action.payload.coordZ];
            const prev = data.coordData;
            // Skip no-op updates (e.g. repeated hide-pointer parks) to avoid extra renders
            if (
                prev &&
                prev.viewport === action.payload.viewport &&
                prev.coord?.[0] === nextCoord[0] &&
                prev.coord?.[1] === nextCoord[1] &&
                prev.coord?.[2] === nextCoord[2]
            ) {
                return data;
            }
            new_data = {
                ...data,
                coordData: {
                    coord: nextCoord,
                    viewport: action.payload.viewport,
                },
            };
            break;
        }
        case 'viewport_ready':


            const viewport = (
                data.renderingEngine.getViewport(`${action.payload.viewportId}-vp`)
            );
            break;
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
        default:
            throw Error('Unknown action: ' + action.type);
    }
    return new_data;
}
