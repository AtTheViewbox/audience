import { createContext, useState, useEffect, useReducer, useContext } from "react";
import { unflatten, flatten } from "flat";
import { recreateList } from '../lib/inputParser.ts';

import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { utilities } from '@cornerstonejs/core';
import { toast } from "sonner"
import defaultData from "./defaultData.jsx";
import { cl } from './SupabaseClient.jsx';
import { UserContext, UserDispatchContext } from "./UserContext.jsx";

export const DataContext = createContext({});
export const DataDispatchContext = createContext({});

const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get('frame_id') != null;
var initialData = unflatten(Object.fromEntries(new URLSearchParams(window.location.search)));
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
initialData.activeUsers = [];
initialData.toolSelected = "scroll";

// Compare with Normal state
initialData.lastSegmentation = null;   // { structures, results, orientation, maskTransform }
initialData.compareNormal = null;      // { active, structure, scrollOffset, normalCentroidSlice, patientCentroidSlice, normalMaskData, originalLd, originalVd }

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

            } = cornerstoneTools;

            cornerstoneTools.addTool(PanTool);
            cornerstoneTools.addTool(WindowLevelTool);
            cornerstoneTools.addTool(StackScrollTool);
            cornerstoneTools.addTool(StackScrollMouseWheelTool);
            cornerstoneTools.addTool(ZoomTool);
            cornerstoneTools.addTool(ProbeTool);


            const eventListenerManager = new utilities.eventListener.MultiTargetEventListenerManager();

            dispatch({ type: 'cornerstone_initialized', payload: { renderingEngine: re, eventListenerManager: eventListenerManager } })
        };

        const setupSupabase = async () => {

            //if there is a session id in url, get url metadata from session

            if (initialData.s) {

                var { data, errorSession } = await cl
                    .from("viewbox")
                    .select("user, url_params, session_id,mode")
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
                    dispatch({ type: "update_viewport_data", payload: { ...newData, mode: data[0].mode, owner: data[0].user } })
                }
            }

            // Only look for existing sessions for real (non-anonymous) logged-in users
            // Anonymous users cannot create sessions, so this query would never return results
            if (!userData.is_anonymous) {
                var { data, errorCurrentSession } = await cl
                    .from("viewbox")
                    .select("user, url_params, session_id,mode")
                    .eq("user", userData.id);
                if (errorCurrentSession) throw errorCurrentSession;

                if (data?.length != 0 && data[0].url_params == queryParams.toString()) {
                    initialData.s = data[0].session_id
                    initialData.sessionMeta.mode = data[0].mode
                    initialData.sessionMeta.owner = data[0].user
                }
            }
        }


        setupCornerstone()
        // Set up Supabase if not embedded, OR if embedded but user is the session owner
        const isOwner = userData && initialData.sessionMeta.owner === userData.id;
        if (!isEmbedded || isOwner) {

            setupSupabase().then(() => { // is this actually an async function? It doesn't seem to make async calls


                dispatch({ type: 'connect_to_sharing_session', payload: { sessionId: initialData.s, mode: initialData.sessionMeta.mode, owner: initialData.sessionMeta.owner } })


            })
        }


        return () => {
            // Clean up if we set up Supabase (not embedded OR is owner)
            if (!isEmbedded || isOwner) {

                userDispatch({ type: 'clean_up_supabase' })
            }
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
                .single()
                .then(({ data: sessionData, error }) => {
                    if (sessionData && !error) {
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

            const roster_channel = supabaseClient.channel(`${data.sessionId}-roster`, {
                config: { presence: { key: userData.id } }
            });

            roster_channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    roster_channel.track({
                        email: userData.email,
                        name: userData?.user_metadata?.full_name || userData.email,
                    });
                }
            });

            roster_channel.on('presence', { event: 'sync' }, () => {
                const presenceState = roster_channel.presenceState();
                const list = Object.entries(presenceState).map(([id, infos]) => {
                    const info = (infos && infos[0]) || {};
                    return {
                        user: id,
                        name: info.name || id,
                        isSharing: id === data.sharingUser
                    };
                });
                dispatch({ type: 'roster_updated', payload: list });
            });

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

                        // Find the imageId in local stack
                        const localStack = viewport.getImageIds();
                        const localIndex = localStack.indexOf(sharedImageId);

                        if (localIndex !== -1) {
                            // Image loaded locally, display it
                            const currentCamera = viewport.getCamera();
                            viewport.setImageIdIndex(localIndex);
                            viewport.setCamera(currentCamera);
                            viewport.render();
                        } else {
                            // Image not loaded yet, skip gracefully
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

                {/*  interaction_channel.on(
                    'broadcast',
                    { event: 'camera-changed' },
                    (payload) => {
                        const viewport = data.renderingEngine.getViewport(payload.payload.viewport);
                        if (payload.payload.camera) {
                            // viewport.setCamera(payload.payload.camera);
                            // viewport.render();
                        }
                    }
                ) */}


                interaction_channel.on(
                    'broadcast',
                    { event: 'pointer-changed' },
                    (payload) => {
                        dispatch({ type: 'set_pointer', payload: { coordX: payload.payload.coordX, coordY: payload.payload.coordY, coordZ: payload.payload.coordZ, viewport: payload.payload.viewport } })

                    }
                )
            }

            dispatch({ type: 'sharing_controller_initialized', payload: { shareController: share_controller, interactionChannel: interaction_channel, rosterChannel: roster_channel } })

        }

        return () => {
            if (data.shareController) {
                data.shareController.unsubscribe();
            }
            if (data.rosterChannel) {
                data.rosterChannel.untrack?.();
                data.rosterChannel.unsubscribe();
            }
            if (data.interactionChannel) data.interactionChannel.unsubscribe();
        }
    }, [data.sessionId, supabaseClient]);

    let lastSendPointer = 0;
    const sendPointer = (payload) => {
        if (!data.interactionChannel) return;
        const now = performance.now();
        if (now - lastSendPointer < 50) return; // ~20 Hz
        lastSendPointer = now;
        data.interactionChannel.send({
            type: 'broadcast',
            event: 'pointer-changed',
            payload
        });
    };

    let lastSendCamera = 0;
    let cameraDebounceTimeout = null;
    const sendCamera = (payload) => {
        if (!data.interactionChannel) return;
        const now = performance.now();
        if (now - lastSendCamera < 50) return; // ~20 Hz throttle

        // Debounce to prevent sending transient states during scroll
        if (cameraDebounceTimeout) {
            clearTimeout(cameraDebounceTimeout);
        }

        cameraDebounceTimeout = setTimeout(() => {
            lastSendCamera = now;
            if (data.interactionChannel) {
                data.interactionChannel.send({
                    type: 'broadcast',
                    event: 'camera-changed',
                    payload
                });
            }
        }, 150); // 150ms debounce
    };

    let lastSendVOI = 0;
    const sendVOI = (payload) => {
        if (!data.interactionChannel) return;
        const now = performance.now();
        if (now - lastSendVOI < 100) return; // ~10 Hz
        lastSendVOI = now;
        data.interactionChannel.send({
            type: 'broadcast',
            event: 'voi-changed',
            payload
        });
    };

    useEffect(() => {
        //data.renderingEngine.getViewports()
        if (data.sessionMeta.mode == "TEAM" || userData.id != data.sessionMeta.owner) {
            if (data.shareController && data.renderingEngine && data.sharingUser === userData?.id && data.sessionId) {

                data.renderingEngine.getViewports().sort((a, b) => {
                    const idA = Number(a.id.split("-")[0])
                    const idB = Number(b.id.split("-")[0])
                    if (idA < idB) { return -1; }
                    if (idA > idB) { return 1; }
                    return 0
                }).forEach((vp, viewport_idx) => {

                    data.eventListenerManager.addEventListener(vp.element, 'CORNERSTONE_STACK_NEW_IMAGE', (event) => {
                        if (data.interactionChannel) {
                            // Send actual imageId instead of sparse array index
                            const currentImageId = vp.getCurrentImageId();
                            data.interactionChannel.send({
                                type: 'broadcast',
                                event: 'frame-changed',
                                payload: { imageId: currentImageId, viewport: `${viewport_idx}-vp` },
                            })
                        }
                    })

                    data.eventListenerManager.addEventListener(vp.element, 'CORNERSTONE_VOI_MODIFIED', (event) => {
                        const window = cornerstone.utilities.windowLevel.toWindowLevel(event.detail.range.lower, event.detail.range.upper)
                        sendVOI({ ww: window.windowWidth, wc: window.windowCenter, viewport: `${viewport_idx}-vp` })
                    })

                    data.eventListenerManager.addEventListener(vp.element, 'CORNERSTONE_CAMERA_MODIFIED', (event) => {
                        const camera = vp.getCamera();
                        // sendCamera({ camera: camera, viewport: `${viewport_idx}-vp` })
                    })

                    if (data.toolSelected == "pointer") {
                        if (mobile) {
                            data.eventListenerManager.addEventListener(vp.element, cornerstoneTools.Enums.Events.TOUCH_DRAG, (event) => {

                                const eventData = event.detail;
                                const { currentPoints } = eventData;
                                if (currentPoints && currentPoints.world) {
                                    sendPointer({ coordX: currentPoints.world[0], coordY: currentPoints.world[1], coordZ: currentPoints.world[2], viewport: `${viewport_idx}-vp` },)
                                }
                            })
                        } else {
                            data.eventListenerManager.addEventListener(vp.element, cornerstoneTools.Enums.Events.MOUSE_MOVE, (event) => {
                                const eventData = event.detail;
                                const { currentPoints } = eventData;
                                if (currentPoints && currentPoints.world) {
                                    sendPointer({ coordX: currentPoints.world[0], coordY: currentPoints.world[1], coordZ: currentPoints.world[2], viewport: `${viewport_idx}-vp` },)

                                }

                            })
                        }
                    }
                    else {
                        if (data.interactionChannel) {
                            data.interactionChannel.send({
                                type: 'broadcast',
                                event: 'pointer-changed',
                                payload: { coordX: 10000, coordY: 10000, coordZ: 10000 },
                            })
                        }
                        data.eventListenerManager.removeEventListener(vp.element, cornerstoneTools.Enums.Events.MOUSE_MOVE);
                        data.eventListenerManager.removeEventListener(vp.element, cornerstoneTools.Enums.Events.TOUCH_DRAG);
                    }

                })

            }
        }
    }, [data.shareController, data.renderingEngine, data.sharingUser, userData, data.toolSelected]);


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
            new_data = { ...data, sessionId: sessionId, sessionMeta: sessionMeta2, isRequestLoading: false }
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
        case 'set_pointer':
            new_data = {
                ...data, coordData:
                {
                    coord: [action.payload.coordX, action.payload.coordY, action.payload.coordZ],
                    viewport: action.payload.viewport
                }
            }
            break;
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
        default:
            throw Error('Unknown action: ' + action.type);
    }
    return new_data;
}
