import { createContext, useState, useEffect, useReducer } from "react";
import { unflatten, flatten } from "flat";

import { recreateList } from '../lib/inputParser.ts';

import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';

import { createClient } from '@supabase/supabase-js'

import { utilities } from '@cornerstonejs/core'; 
import { toast } from "sonner"



export const DataContext = createContext({});    
export const DataDispatchContext = createContext({});

// create initial data object from URL query string
const initialData = unflatten(Object.fromEntries(new URLSearchParams(window.location.search)));
initialData.vd.forEach((vdItem) => {
    if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e) {
        vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e);
    }
});
initialData.userData = null;
initialData.sharingUser = null;

export const DataProvider = ({ children }) => {
    const [data, dispatch] = useReducer(dataReducer, initialData);

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
            await cornerstone.init();
            await cornerstoneTools.init();

            const renderingEngineId = 'myRenderingEngine';
            const re = new cornerstone.RenderingEngine(renderingEngineId);

            const {
                PanTool,
                WindowLevelTool,
                StackScrollTool,
                StackScrollMouseWheelTool,
                ZoomTool,
                PlanarRotateTool,
            } = cornerstoneTools;

            cornerstoneTools.addTool(PanTool);
            cornerstoneTools.addTool(WindowLevelTool);
            cornerstoneTools.addTool(StackScrollTool);
            cornerstoneTools.addTool(StackScrollMouseWheelTool);
            cornerstoneTools.addTool(ZoomTool);
            cornerstoneTools.addTool(PlanarRotateTool);

            const eventListenerManager = new utilities.eventListener.MultiTargetEventListenerManager();

            dispatch({type: 'cornerstone_initialized', payload: {renderingEngine: re, eventListenerManager: eventListenerManager}})
        };

        const setupSupabase = async () => {
            const cl = createClient("https://vnepxfkzfswqwmyvbyug.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZXB4Zmt6ZnN3cXdteXZieXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTM0MzI1NTksImV4cCI6MjAwOTAwODU1OX0.JAPtogIHwJyiSmXji4o1mpa2Db55amhCYe6r3KwNrYo");
            
            // if there is a user logged in, store that as user
            let { data: { user }, error } = await cl.auth.getUser();
            if (!user) {
                // otherwise, use anonymous login
                ({ data: { user }, error } = await cl.auth.signInAnonymously());
            }

            // TODO: error handling for auth

            const ss = cl.auth.onAuthStateChange(
                (event, session) => {
                    console.log(event, session)
                    dispatch({type: 'auth_update', payload: {session}})
                }
            )

            dispatch({type: 'supabase_initialized', payload: {supabaseClient: cl, supabaseAuthSubscription: ss, userData: user}})
        }

        setupCornerstone();
        setupSupabase().then(() => { // is this actually an async function? It doesn't seem to make async calls
            console.log("Supabase setup completed");
            // if there is already a sharing key embedded in the url on start, connect to the sharing session
            if (initialData.s) {
                dispatch({type: 'connect_to_sharing_session', payload: {sessionId: initialData.s}})
            }
        });

        return () => {
            console.log("cleaning up supabase")
            dispatch({type: 'clean_up_supabase'})   
        }
    
    }, []);

    useEffect(() => {
        // This useEffect is to handle changes to sessionId and create the consequent
        // Supabase realtime rooms as necessary. It relies on supabaseClient to not
        // be null so the if statement just guards against that
        if (data.sessionId && data.supabaseClient) {
            console.log(data.userData)
            // configure presence room -- should this be in every client or just the initializing client??
            const share_controller = data.supabaseClient.channel(`${data.sessionId}-share-controller`, {
                config: {
                    broadcast: { self: true },
                    presence: {
                        key: data.userData.id
                    },
                }
            })
    
            // initialize presence with data
            share_controller.subscribe((status) => {
                // Wait for successful connection
                console.log(status)
                if (status === 'SUBSCRIBED') {
                    console.log("share-controller subscribed")
                    share_controller.track({ share: false, lastShareRequest: null });
                    return null
                }
            })
    
            // handler for when  presence events are received
            share_controller.on('presence', { event: 'sync'}, () => {

                const presenceState = share_controller.presenceState();
                console.log(presenceState)

                const globalSharingStatus = Object.entries(presenceState).map(([user, info]) => {
                    const { lastShareRequest, share } = info[0];
                    return { user, shareStatus: share, timeOfLastShareStatusUpdated: lastShareRequest };
                });
                
                dispatch({type: "sharer_status_changed", payload: {globalSharingStatus: globalSharingStatus}})
            })

            dispatch({type: 'sharing_controller_initialized', payload: {shareController: share_controller}})
            
        }

        return () => {
            if (data.shareController) {
                data.shareController.untrack();
                data.shareController.unsubscribe();
            }
            console.log("share_controller unsubscribed");
        }
    }, [data.sessionId, data.supabaseClient]);

    return (
        <DataContext.Provider value={{ data }}>
            <DataDispatchContext.Provider value={{ dispatch }}>
                {children}
            </DataDispatchContext.Provider>
        </DataContext.Provider>
    );
};

export function dataReducer(data, action) {
    let new_data = {...data};
   
    console.log(action, data)
    switch (action.type) {

        // Initialization events
        case 'cornerstone_initialized':
            
            new_data = {...data, ...action.payload};
            break;
        case 'supabase_initialized':
            new_data = { ...data, ...action.payload };
            break;

        case 'export_layout_to_link':
            let vp_dt = [];
            data.renderingEngine.getViewports().forEach((vp) => {
                const {imageIds, voiRange, currentImageIdIndex} = vp;
                const window = cornerstone.utilities.windowLevel.toWindowLevel(voiRange.lower, voiRange.upper);
                vp_dt.push({imageIds, ww: window.windowWidth, wc: window.windowCenter, currentImageIdIndex})
            })
            // print the query string to the console so it can be copied and pasted into the URL bar
            console.log(new URLSearchParams(flatten({layout_data: data.layout_data, viewport_data: vp_dt})).toString());
            break;
        
        case 'sharing_controller_initialized':
            new_data = {...data, ...action.payload}
            break;
        case 'connect_to_sharing_session':
            let sessionId = action.payload.sessionId;
            new_data = {...data, sessionId: sessionId}
            break;
        case 'sharer_status_changed':
            let { globalSharingStatus } = action.payload;
            globalSharingStatus = globalSharingStatus.filter(sharer => sharer.timeOfLastShareStatusUpdated !== null)
            if (globalSharingStatus.length > 0) {
                const mostRecentUpdate = globalSharingStatus
                    .reduce((prev, current) => (prev.timeOfLastShareStatusUpdated > current.timeOfLastShareStatusUpdated) ? prev : current);
                console.log(mostRecentUpdate.shareStatus, mostRecentUpdate.user, data.userData.id)
                if (mostRecentUpdate.shareStatus == true) {
                    if (mostRecentUpdate.user !== data.userData.id) {
                        toast(`"${mostRecentUpdate.user} has taken control`);
                    }
                    new_data = {...data, sharingUser: mostRecentUpdate.user};
                } else {
                    new_data = {...data, sharingUser: null};
                }
                console.log(globalSharingStatus)
                console.log(mostRecentUpdate)
            } else {
                new_data = {...data, sharingUser: null};
            }

            break;

        case 'toggle_sharing':
            console.log("toggle sharing")
            if (data.shareController) {
                // if the sharingUser is the same as the current user, share should be set to false
                // if the sharingUser is not the same as the current user, share should be set to true
                data.shareController.track({ share: data.sharingUser !== data.userData.id, lastShareRequest: new Date().toISOString() });
            }
            break;
        case 'viewport_ready':
            console.log("viewport ready!", action.payload)

            const viewport = (
                data.renderingEngine.getViewport(`${action.payload.viewportId}-vp`)
            );
            break;

        case 'auth_update':
            new_data = { ...data, userData: action.payload.session.user };
            break;
        case 'clean_up_supabase':
            data.supabaseAuthSubscription.data.subscription.unsubscribe();
            data.supabaseClient.removeAllChannels();
            break;
        default:
            throw Error('Unknown action: ' + action.type);
    }
    return new_data;
}