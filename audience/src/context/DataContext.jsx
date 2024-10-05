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

import defaultData from "./defaultData.jsx";
import discordSdk from '../discordSdk.tsx'

export const DataContext = createContext({});    
export const DataDispatchContext = createContext({});

const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get('frame_id') != null;

// create initial data object from URL query string
var initialData = unflatten(Object.fromEntries(new URLSearchParams(window.location.search)));
if (initialData.vd) {
    initialData.vd.forEach((vdItem) => {
        if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
            vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e,vdItem.s.D);
        }
    })
} 
else if (initialData.s){
    initialData = Object.assign(initialData, defaultData.defaultData);
}
else {
    initialData = defaultData.defaultData;
}
initialData.userData = null;
initialData.sharingUser = null;
initialData.activeUsers = [];
initialData.toolSelected = "window";

export const DataProvider = ({ children }) => {
    const [data, dispatch] = useReducer(dataReducer, initialData);
    const [discordUser, setDiscordUser] = useState()
    const [updateSession, setUpdateSession] = useState(null)

    useEffect(() => {
        
        const setupDiscord = async () => {

            await discordSdk.ready();
            const { enabled } = await discordSdk.commands.encourageHardwareAcceleration();
            console.log(`Hardware Acceleration is ${enabled === true ? 'enabled' : 'disabled'}`);

            const { code } = await discordSdk.commands.authorize({
                client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
                response_type: "code",
                state: "",
                prompt: "none",
                scope: [
                    'identify',
                    'guilds',
                    'applications.commands',
                    'guilds.members.read',
                    'rpc.activities.write',
                    'rpc.voice.write',
                    'rpc.voice.read',
                ],
            });
         
            const response = await fetch("api/token", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    code,
                }),
            });

            const { access_token } = await response.json();
            // Authenticate with Discord client (using the access_token)
            const newAuth = await discordSdk.commands.authenticate({
                access_token,
            });
            setDiscordUser(newAuth.user)
  
        }
        if (isEmbedded){
            setupDiscord()
        }

    },[])

    useEffect(()=>{

        //Can be optimized if session_id is a primary key
        const getSession = async (cl, session_id)=>{
            const { data, error } = await cl
            .from("viewbox")
            .select("session_id")
            .eq("session_id",session_id)
            return data
        }

        if(updateSession?.eventType==="DELETE"){
            getSession(data.supabaseClient,updateSession.old.session_id).then((payload)=>{
                if (payload.length==0){
                    dispatch({type: "clean_up_supabase"});
                }
            })
        }
        if(updateSession?.eventType==="UPDATE"){
            var currentURL =unflatten(Object.fromEntries(new URLSearchParams(window.location.search)));
            if (!currentURL.vd){
            var newData =unflatten(Object.fromEntries(new URLSearchParams(updateSession.new.url_params)));
            if (newData.vd) {
                newData.vd.forEach((vdItem) => {
                    if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
                        vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e,vdItem.s.D);
                    }
                })
            }
            dispatch({type: "update_viewport_data",payload: {...newData}} )
            }else{
                dispatch({type: "clean_up_supabase"});
            }
        }
        setUpdateSession(null)

    },[updateSession])

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
        
        //var initialData =unflatten(Object.fromEntries(new URLSearchParams(window.location.search)));

        const setupSupabase = async () => {
            //const cl = createClient("https://vnepxfkzfswqwmyvbyug.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuZXB4Zmt6ZnN3cXdteXZieXVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE2OTM0MzI1NTksImV4cCI6MjAwOTAwODU1OX0.JAPtogIHwJyiSmXji4o1mpa2Db55amhCYe6r3KwNrYo");
            const cl = createClient("https://gcoomnnwmbehpkmbgroi.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdjb29tbm53bWJlaHBrbWJncm9pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjUzNDE5NDEsImV4cCI6MjA0MDkxNzk0MX0.S3Supif3vuWlAIz3JlRTeWDx6vMttsP5ynx_XM9Kvyw");
            
            // if there is a user logged in, store that as user
            let { data: { user }, error } = await cl.auth.getUser();
           
            if (!user) {
                // otherwise, use anonymous login
                ({ data: { user }, error } = await cl.auth.signInAnonymously());
                
            }

            //if there is a session id in url, get url metadata from session
            if (initialData.s){
                var { data,errorSession } = await cl
                    .from("viewbox")
                    .select("user, url_params, session_id")
                    .eq("session_id",initialData?.s);
      
                if (errorSession) throw errorSession;
                console.log(data)
                if (data?.length==0 ){
                    initialData.s = null
                }
                else{
                    initialData.s = data[0].session_id
                    var newData =unflatten(Object.fromEntries(new URLSearchParams(data[0].url_params)));
                    if (newData.vd) {
                        newData.vd.forEach((vdItem) => {
                            if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
                                vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e,vdItem.s.D);
                            }
                        })
                    }
                    dispatch({type: "update_viewport_data",payload: {...newData}} )
                }
            }
            
                
            //if there is a session for the current image, join that session
            var { data, errorCurrentSession } = await cl
                .from("viewbox")
                .select("user, url_params, session_id")
                .eq("user", user.id);
            if (errorCurrentSession) throw errorCurrentSession;

            if (data?.length != 0 && data[0].url_params==queryParams.toString()){
                initialData.s =data[0].session_id
            }
          
            // TODO: error handling for auth
            const ss = cl.auth.onAuthStateChange(
                (event, session) => {
                        if (event === 'SIGNED_IN') {
                        dispatch({type: 'auth_update', payload: {session}})
                      } else if (event === 'SIGNED_OUT') {
                        dispatch({type: 'log_out', payload: {session}})
                      }
                }
            )

            dispatch({type: 'supabase_initialized', payload: {supabaseClient: cl, supabaseAuthSubscription: ss, userData: user}})
        }
        
            
            setupCornerstone()
            if((!isEmbedded) || discordUser){

                setupSupabase().then(() => { // is this actually an async function? It doesn't seem to make async calls
                   
                  
                    dispatch({ type: 'connect_to_sharing_session', payload: { sessionId: initialData.s } })
                    
                    
                    //TODO: fix discord later
                    //else{
                    //   dispatch({ type: 'connect_to_sharing_session', payload: { sessionId:discordSdk.instanceId  } })
                    //}
                })
            }
    
        
        return () => {
            if(!isEmbedded || discordUser){
            console.log("cleaning up supabase")
            dispatch({ type: 'clean_up_supabase' })
            }
        }

    }, [discordUser]);


    
    useEffect(() => {
        // This useEffect is to handle changes to sessionId and create the consequent
        // Supabase realtime rooms as necessary. It relies on supabaseClient to not
        // be null so the if statement just guards against that
        if (data.sessionId && data.supabaseClient) {
            const allChanges = data.supabaseClient
                .channel('schema-db-changes')
                .on(
                    'postgres_changes',
                    {
                    event: '*',
                    schema: 'public',
                    table:'viewbox'
                    },
                    (payload) => {
                        setUpdateSession(payload)
                    }
                )
                .subscribe()
           
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
                if (status === 'SUBSCRIBED') {
                    console.log("share-controller subscribed")
                    share_controller.track({ share: false, lastShareRequest: null,discordData:discordUser  });
                    return null
                }
            })
    
            // handler for when  presence events are received
            share_controller.on('presence', { event: 'sync'}, () => {

                const presenceState = share_controller.presenceState();

                const globalSharingStatus = Object.entries(presenceState).map(([user, info]) => {
                    const { lastShareRequest, share,discordData } = info[0];
                    return { user, shareStatus: share, timeOfLastShareStatusUpdated: lastShareRequest, discordData:discordData };
                });
                
                dispatch({type: "sharer_status_changed", payload: {globalSharingStatus: globalSharingStatus}})
            })

            const interaction_channel = data.supabaseClient.channel(`${data.sessionId}-interaction-channel`, {
                config: {
                    broadcast: { self: false },
                }
            })

            interaction_channel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log("I think I'm subscribed?");
                    return null
                }
            })

            interaction_channel.on(
                'broadcast',
                { event: 'frame-changed' },
                (payload) => {
                    data.renderingEngine.getViewport(payload.payload.viewport).setImageIdIndex(payload.payload.frame)
                    data.renderingEngine.getViewport(payload.payload.viewport).render()
                }
            )

            dispatch({type: 'sharing_controller_initialized', payload: {shareController: share_controller, interactionChannel: interaction_channel}})
            
        }

        return () => {
            if (data.shareController) {
                data.shareController.untrack();
                data.shareController.unsubscribe();
            }
            console.log("share_controller unsubscribed");
        }
    }, [data.sessionId, data.supabaseClient]);

    useEffect(() => {
        //data.renderingEngine.getViewports()
        if (data.shareController && data.renderingEngine && data.sharingUser === data.userData?.id && data.sessionId) {
            data.renderingEngine.getViewports().sort((a,b)=>{
                const idA = Number(a.id.split("-")[0])
                const idB = Number(b.id.split("-")[0])
                if (idA < idB) {return -1;}
                if (idA > idB) {return 1;}
                return 0
            }).forEach((vp, viewport_idx) => {
                data.eventListenerManager.addEventListener(vp.element, 'CORNERSTONE_STACK_NEW_IMAGE', (event) => {
                    data.interactionChannel.send({
                        type: 'broadcast',
                        event: 'frame-changed',
                        payload: { frame: event.detail.imageIdIndex, viewport: `${viewport_idx}-vp` },
                    })
                })
            })

        }
    }, [data.shareController, data.renderingEngine, data.sharingUser, data.userData]);


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
   
    switch (action.type) {

        // Initialization events
        case 'cornerstone_initialized':
            new_data = {...data, ...action.payload};
            break;
        case 'supabase_initialized':
            new_data = { ...data, ...action.payload };
            break;
        case 'update_viewport_data':
            let vd = action.payload.vd;
            let ld = action.payload.ld;
            let m = action.payload.m;
            new_data = { ...data, ld:ld,vd:vd,m:m};

            break;
        // case 'export_layout_to_link':
        //     let vp_dt = [];
        //     data.renderingEngine.getViewports().forEach((vp) => {
        //         const {imageIds, voiRange, currentImageIdIndex} = vp;
        //         const window = cornerstone.utilities.windowLevel.toWindowLevel(voiRange.lower, voiRange.upper);
        //         vp_dt.push({imageIds, ww: window.windowWidth, wc: window.windowCenter, currentImageIdIndex})
        //     })
        //     // print the query string to the console so it can be copied and pasted into the URL bar
        //     console.log(new URLSearchParams(flatten({layout_data: data.layout_data, viewport_data: vp_dt})).toString());
        //     break;
        
        case 'sharing_controller_initialized':
            new_data = {...data, ...action.payload}
            break;
        case 'connect_to_sharing_session':
            let sessionId = action.payload.sessionId;
            new_data = {...data, sessionId: sessionId}
            break;
        case 'sharer_status_changed':
            // This can become more elegant for sure. This function should really just write globalSharingStatus to state
            // and the components that care should make updates as necessary

            let { globalSharingStatus } = action.payload;
  
            const usersWhoAreSharing = globalSharingStatus.filter(sharer => sharer.shareStatus === true)
            if (usersWhoAreSharing.length > 0) {
                const mostRecentShare = usersWhoAreSharing
                    .reduce((prev, current) => (prev.timeOfLastShareStatusUpdated > current.timeOfLastShareStatusUpdated) ? prev : current);
                
                const nonRecentSharers = usersWhoAreSharing
                    .filter(sharer => sharer.user !== mostRecentShare.user)
                    .map(sharer => sharer.user);
                
                // if the current user is sharing, and someone else has requested
                // reset the listeners and update the presence state
                if (nonRecentSharers.includes(data.userData.id)) {
                    data.eventListenerManager.reset()
                    data.shareController.track({ share: false, lastShareRequest: new Date().toISOString(),discordData:  data.activeUsers.filter(user => user.user === data.userData.id)[0].discordData });
                }

                if (nonRecentSharers.length !== 0) {
                    //toast(`"${mostRecentShare.user} has requested control`);
                    toast(`${mostRecentShare.discordData?mostRecentShare.discordData.username:mostRecentShare.user} has requested control`);
                    new_data = { ...data, sharingUser: null, activeUsers: globalSharingStatus };
                } else {
                    //toast(`"${mostRecentShare.user} has taken control`);
                    toast(`${mostRecentShare.discordData?mostRecentShare.discordData.username:mostRecentShare.user} has taken control`);
                    new_data = { ...data, sharingUser: mostRecentShare.user, activeUsers: globalSharingStatus };
                }
            } else {
                data.eventListenerManager.reset()
                new_data = { ...data, sharingUser: null, activeUsers: globalSharingStatus };
            }

            break;

        case 'toggle_sharing':
            console.log(data.shareController)
            if (data.shareController) {
                // if the sharingUser is the same as the current user, share should be set to false
                // if the sharingUser is not the same as the current user, share should be set to true
                data.shareController.track({ share: data.sharingUser !== data.userData.id, lastShareRequest: new Date().toISOString(),discordData:  data.activeUsers.filter(user => user.user === data.userData.id)[0].discordData });
                // there is an error here that will occur where data.sharingUser is only set once there is 1 and only 1 sharing user in presence state
                // if there is a request to share that hasn't fully processed, data.sharingUser will be out of date
                // so if you try to cancel while it is processing, it will try to create a new request rather than cancelling the request

                // the right thing to do is to remove interaction with the share button while in the transitioning state
            }
            break;
        case 'select_tool':
                new_data = {...data, toolSelected: action.payload}
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
        case 'log_out':
            new_data = { ...data, userData:null };
            break;
        case 'clean_up_supabase':
            new_data = {...data, sessionId: null}
            data.supabaseAuthSubscription.data.subscription.unsubscribe();
            data.supabaseClient.removeAllChannels();
            break;
        default:
            throw Error('Unknown action: ' + action.type);
    }
    return new_data;
}