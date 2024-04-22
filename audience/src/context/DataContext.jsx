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
initialData.sharing = false;
initialData.user_data = null;
initialData.sharingUser = null;
console.log(initialData);

export const DataProvider = ({ children }) => {
    const [data, dispatch] = useReducer(dataReducer, initialData);

    useEffect(() => {
        console.log("Data provider loaded!", data);

        const setupCornerstone = async () => {
            window.cornerstone = cornerstone;
            window.cornerstoneTools = cornerstoneTools;
            cornerstoneDICOMImageLoader.external.cornerstone = cornerstone;
            cornerstoneDICOMImageLoader.external.dicomParser = dicomParser;
            await cornerstone.init();
            await cornerstoneTools.init();

            const renderingEngineId = 'myRenderingEngine';
            const re = new cornerstone.RenderingEngine(renderingEngineId);
            dispatch({type: 'cornerstone_initialized', payload: {renderingEngine: re}})

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
        };

        const setupSupabase = async () => {
            const cl = createClient("https://vnepxfkzfswqwmyvbyug.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZXB4Zmt6ZnN3cXdteXZieXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTM0MzI1NTksImV4cCI6MjAwOTAwODU1OX0.JAPtogIHwJyiSmXji4o1mpa2Db55amhCYe6r3KwNrYo");
            const ss = cl.auth.onAuthStateChange(
                (event, session) => {
                    console.log(event, session)
                    dispatch({type: 'auth_update', payload: {session}})
                }
            )

            // const share_controller = cl.channel('share-controller', {
            //     config: {
            //         broadcast: { self: false },
            //     }
            // })

            // share_controller.subscribe((status) => {
            //     // Wait for successful connection
            //     console.log(status)
            //     if (status === 'SUBSCRIBED') {
            //         console.log("share-controller subscribed")
            //         return null
            //     }
            // })
            
            // share_controller.on(
            //     'broadcast',
            //     { event: 'master' },
            //     (payload) => {
            //         console.log("hello---------");
            //         toast("Event has been created.");
            //         dispatch({type: 'sharing_off'});
            //     }
            // )
            console.log("about to dispatch supabase_initialized")
            dispatch({type: 'supabase_initialized', payload: {supabaseClient: cl, supabaseAuthSubscription: ss}})
        }

        setupCornerstone();
        setupSupabase().then(() => { // is this actually an async function? It doesn't seem to make async calls
            console.log("Supabase setup completed");
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
        if (data.sessionId && data.supabaseClient) {
            const share_controller = data.supabaseClient.channel(`${data.sessionId}-share-controller`, {
                config: {
                    broadcast: { self: false },
                    presence: {
                        key: data.user_data.user.email
                    },
                }
            })
    
            share_controller.subscribe((status) => {
                // Wait for successful connection
                console.log(status)
                if (status === 'SUBSCRIBED') {
                    console.log("share-controller subscribed")
                    share_controller.track({ lastShareRequest: null });
                    return null
                }
            })
    
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
            if (data.shareController) data.share_controller.unsubscribe();
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
   

    console.log(new_data)
    switch (action.type) {

        case 'cornerstone_initialized':
            console.log("cornerstone initialized")
            const eventListenerManager = new utilities.eventListener.MultiTargetEventListenerManager();
            new_data = {...data, ...action.payload, eventListenerManager: eventListenerManager};
            break;
        case 'export_layout_to_link':
            console.log("export layout to link")
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
            console.log("connect_to_sharing_session")
            let sessionId = action.payload.sessionId;
            new_data = {...data, sessionId: sessionId}
            break;
        case 'sharer_status_changed':
            console.log("SHARING STATUS CHANGED", action.payload)

            const { globalSharingStatus } = action.payload;
            if (globalSharingStatus) {
                const sharersWithShareStatus = globalSharingStatus.filter(sharer => sharer.shareStatus === true);
                if (sharersWithShareStatus.length > 0) {
                    const mostRecentSharer = sharersWithShareStatus.reduce((prev, current) => (prev.timeOfLastShareStatusUpdated > current.timeOfLastShareStatusUpdated) ? prev : current);
                    console.log("Most recent sharer with share status true:", mostRecentSharer);
                }

            }



            http://localhost:5173/?m=true&ld.r=2&ld.c=1&vd.0.s.pf=dicomweb%3Ahttps%3A%2F%2Fs3.amazonaws.com%2Felasticbeanstalk-us-east-1-843279806438%2Fdicom%2Fproduction%2F-ywXf2R16d_1.3.12.2.1107.5.1.4.73513.30000019073110243989500020904%2F&vd.0.s.sf=.dcm.gz&vd.0.s.s=202&vd.0.s.e=301&vd.0.ww=1400&vd.0.wc=1200&vd.0.ci=0&vd.0.z=1&vd.0.px=0&vd.0.py=0&vd.0.r=0&vd.1.s.pf=dicomweb%3Ahttps%3A%2F%2Fs3.amazonaws.com%2Felasticbeanstalk-us-east-1-843279806438%2Fdicom%2Fproduction%2F-ywXf2R16d_1.3.12.2.1107.5.1.4.73513.30000019073110243989500021446%2F&vd.1.s.sf=.dcm.gz&vd.1.s.s=050&vd.1.s.e=100&vd.1.ww=1401&vd.1.wc=1201&vd.1.ci=0&vd.1.z=1&vd.1.px=0&vd.1.py=0&vd.1.r=0&s=94db444d-bd9f-4efb-89ab-596d48777fc1
            // const share_controller = data.supabaseClient.channel(`${sessionId}-share-controller`, {
            //     config: {
            //         broadcast: { self: false },
            //     }
            // })

            // share_controller.subscribe((status) => {
            //     // Wait for successful connection
            //     console.log(status)
            //     if (status === 'SUBSCRIBED') {
            //         console.log("share-controller subscribed")
            //         share_controller.track({ sharing: false });
            //         return null
            //         // TODO: will need to eventually keep track of the users who have subscribed
            //         // this will be good for
            //     }
            // })
            
            // // share_controller.on(
            // //     'broadcast',
            // //     { event: 'master' },
            // //     (payload) => {
            // //         toast("Event has been created.");
            // //         dispatch({type: 'sharing_off'});
            // //     }
            // // )

            // share_controller.on('presence', { event: 'sync'}, () => {
            //     const presenceState = share_controller.presenceState();
            //     console.log(presenceState)
            //     dispatch({type: 'stop_sharing'})
            // })

            // new_data = {...data, shareController: share_controller}
            //new_data = {...data, sessionId: sessionId}

            break;

        case 'toggle_sharing':
            console.log("toggle sharing")
            if (!data.sharing) {
                console.log("now sharing")

                data.shareController.track({ share: true, lastShareRequest: new Date().toISOString() });
            } else {
                console.log("not sharing")
                //data.shareController.track({ sharing: false });

                data.shareController.track({ share: false, lastShareRequest: new Date().toISOString() });
            }
            new_data = {...data, sharing: !data.sharing}
            break;
        
        case 'stop_sharing':
            console.log("stop sharing")
            //data.shareController.track({ sharing: false });
            //new_data = {...data, sharing: false}
            break;

        case 'enable_sharing':
            console.log("attempt to enable sharing")
            // confirm user is authenticated

            // request that supabase create a session with:
            // author | layout_string | generated session key | generated room name | number of users in the session

            // call to supabase will return the session key which can then be copied
            break;
        case 'start_sharing':
            console.log("start sharing")
            data.shareController.send({
                type: 'broadcast',
                event: 'master',
                payload: { message: "x took control" },
            })
            console.log("WOOG", data.supabaseClient.getChannels())
            new_data = {...data, sharing: true}
            
            // data.supabaseClient.removeAllChannels()
            // iterate over cornerstone elements and add cornerstone listeners to trigger supabase realtime events
            data.renderingEngine.getViewports().forEach((vp, viewport_idx) => {
                console.log(vp)
                data.eventListenerManager.addEventListener(vp.element, 'CORNERSTONE_STACK_NEW_IMAGE', (event) => {
                    console.log(event.detail.imageIdIndex)
                    data.channels[viewport_idx].send({
                      type: 'broadcast',
                      event: 'master',
                      payload: { message: event.detail.imageIdIndex, viewport: `${viewport_idx}-vp` },
                    })
                })
            })


            // unsubscribe to supabase events
            break;
        case 'stop_sharing':
            console.log("stop sharing")
            new_data = {...data, sharing: false}
            // delete all listeners
            console.log("turning off sharing")
            data.eventListenerManager.reset()
            break;
        case 'disable_sharing':
            console.log("disable sharing")
            break

        case 'viewport_ready':
            console.log("viewport ready!", action.payload)

            const viewport = (
                data.renderingEngine.getViewport(`${action.payload.viewportId}-vp`)
            );
            // console.log(viewport)

            // if (data.m === 'true') {
            //     data.channels[action.payload.viewportId].subscribe((status) => {
            //         // Wait for successful connection
            //         console.log(status)
            //         if (status === 'SUBSCRIBED') {
            //             console.log(action.payload.viewportId, "channel subscribed")
            //             return null
            //         }
            //     })

            //     data.channels[action.payload.viewportId].on(
            //         'broadcast',
            //         { event: 'master' },
            //         (payload) => {
            //         console.log(payload, payload.payload.viewport, `${action.payload.viewportId}-vp`)
            //         // if (m == 'false') {
            //             if (payload.payload.viewport == `${action.payload.viewportId}-vp`) {
            //                 console.log(payload.payload.message)
            //                 viewport.setImageIdIndex(payload.payload.message);
            //                 viewport.render()
            //             }
            //         // } 
            //         }
            //     )
            // }




            break;
        case 'supabase_initialized':
            console.log("supabase_initialized")
            new_data = { ...data, ...action.payload };
            break;
        case 'auth_update':
            new_data = { ...data, user_data: action.payload.session };
            break;
        case 'clean_up_supabase':
            data.supabaseAuthSubscription.unsubscribe();
            data.client.removeAllChannels();
            break;
        default:
            throw Error('Unknown action: ' + action.type);
    }
    return new_data;
}