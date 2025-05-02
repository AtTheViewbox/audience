import { createContext, useState, useEffect, useReducer, useContext } from "react";
import { unflatten, flatten } from "flat";

import { recreateList} from '../lib/inputParser.ts';

import * as cornerstone from '@cornerstonejs/core';
import * as cornerstoneTools from '@cornerstonejs/tools';

import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import dicomParser from 'dicom-parser';
import { utilities } from '@cornerstonejs/core'; 
import { toast } from "sonner"
import defaultData from "./defaultData.jsx";
import discordSdk from '../discordSdk.tsx'
import { cl } from './SupabaseClient.jsx';
import { UserContext,UserDispatchContext } from "./UserContext.jsx";

export const DataContext = createContext({});    
export const DataDispatchContext = createContext({});

const queryParams = new URLSearchParams(window.location.search);
const isEmbedded = queryParams.get('frame_id') != null;
var initialData = unflatten(Object.fromEntries(new URLSearchParams(window.location.search)));
// create initial data object from URL query string



if (initialData.vd) {
    initialData.vd.forEach((vdItem) => {
        if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
            vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e,vdItem.s.D);
        }
    })
    initialData.isRequestLoading= false
} 

else if (initialData.s){
    initialData = Object.assign(defaultData.defaultData,initialData);
    initialData.isRequestLoading = true;
}

initialData.userData = null;

initialData.sharingUser = null;
initialData.sessionMeta = {mode:"TEAM",owner:""}
initialData.activeUsers = [];
initialData.toolSelected = "window";

export const DataProvider = ({ children }) => {

    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

    const [data, dispatch] = useReducer(dataReducer, initialData);
    const { userDispatch } = useContext(UserDispatchContext);
    const {userData,supabaseClient} = useContext(UserContext).data;
    const [discordUser, setDiscordUser] = useState();
    const [updateSession, setUpdateSession] = useState(null);


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
            dispatch({type: 'loading_request'})
            getSession(supabaseClient,updateSession.old.session_id).then((payload)=>{
                if (payload.length==0){
                    userDispatch({type: "clean_up_supabase"});
                }
            })
        }
        if(updateSession?.eventType==="UPDATE"){
            dispatch({type: 'loading_request'})
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

            //TODO: Fix buggy tranfering sessions, but reloading works for now.
            window.location.reload();
            }else{
                userDispatch({type: "clean_up_supabase"});
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
                ProbeTool
            } = cornerstoneTools;

            cornerstoneTools.addTool(PanTool);
            cornerstoneTools.addTool(WindowLevelTool);
            cornerstoneTools.addTool(StackScrollTool);
            cornerstoneTools.addTool(StackScrollMouseWheelTool);
            cornerstoneTools.addTool(ZoomTool);
            cornerstoneTools.addTool(ProbeTool);

            const eventListenerManager = new utilities.eventListener.MultiTargetEventListenerManager();

            dispatch({type: 'cornerstone_initialized', payload: {renderingEngine: re, eventListenerManager: eventListenerManager}})
        };
        
        const setupSupabase = async () => {
            
            //if there is a session id in url, get url metadata from session

            if (initialData.s ){
         
                var { data,errorSession } = await cl
                    .from("viewbox")
                    .select("user, url_params, session_id,mode")
                    .eq("session_id",initialData?.s);
      
                if (errorSession) throw errorSession;
               
                if (data?.length==0 ){
                    initialData.s = null
                }
                else{            
                    initialData.s = data[0].session_id
                    initialData.sessionMeta.mode =data[0].mode
                    initialData.sessionMeta.owner = data[0].user
                   
                    var newData =unflatten(Object.fromEntries(new URLSearchParams(data[0].url_params)));
                    if (newData.vd) {
                        newData.vd.forEach((vdItem) => {
                            if (vdItem.s && vdItem.s.pf && vdItem.s.sf && vdItem.s.s && vdItem.s.e && vdItem.s.D) {
                                vdItem.s = recreateList(vdItem.s.pf, vdItem.s.sf, vdItem.s.s, vdItem.s.e,vdItem.s.D);
                            }
                        })
                    }
                    dispatch({type: "update_viewport_data",payload: {...newData,mode:data[0].mode}} )
                }
            }
        
            //if there is a session for the current image, join that session
            var { data, errorCurrentSession } = await cl
                .from("viewbox")
                .select("user, url_params, session_id,mode")
                .eq("user", userData.id);
            if (errorCurrentSession) throw errorCurrentSession;
    
            
            if (data?.length != 0 && data[0].url_params==queryParams.toString()){
                initialData.s =data[0].session_id
                initialData.sessionMeta.mode =data[0].mode
                initialData.sessionMeta.owner = data[0].user
            }
            }
        
       
            setupCornerstone()
            if((!isEmbedded) || discordUser){

                setupSupabase().then(() => { // is this actually an async function? It doesn't seem to make async calls
                   
                  
                    dispatch({ type: 'connect_to_sharing_session', payload: { sessionId: initialData.s,mode:initialData.sessionMeta.mode,owner:initialData.sessionMeta.owner} })
                    
                    //TODO: fix discord later
                    //else{
                    //   dispatch({ type: 'connect_to_sharing_session', payload: { sessionId:discordSdk.instanceId  } })
                    //}
                })
            }
    
        
        return () => {
            if(!isEmbedded || discordUser){
            console.log("cleaning up supabase")
            userDispatch({ type: 'clean_up_supabase' })
            }
        }

    }, [discordUser]);


    
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
                    table:'viewbox'
                    },
                    (payload) => {
                        setUpdateSession(payload)
                    }
                )
                .subscribe()
           
            // configure presence room -- should this be in every client or just the initializing client??
            const share_controller = supabaseClient.channel(`${data.sessionId}-share-controller`, {
                config: {
                    broadcast: { self: true },
                    presence: {
                        key: userData.id
                    },
                }
            })

            // initialize presence with data
            share_controller.subscribe((status) => {
                // Wait for successful connection
                if (status === 'SUBSCRIBED') {
                    console.log("share-controller subscribed")
                    share_controller.track({ share: false, lastShareRequest: null,discordData:discordUser, email:userData.email  });
                    
                    return null
                }
            })
    
            // handler for when  presence events are received
            share_controller.on('presence', { event: 'sync'}, () => {

                const presenceState = share_controller.presenceState();

                const globalSharingStatus = Object.entries(presenceState).map(([user, info]) => {
                    const { lastShareRequest, share,discordData,email } = info[0];
                    return { user, shareStatus: share, timeOfLastShareStatusUpdated: lastShareRequest, discordData:discordData,email:email };
                });
                
                dispatch({type: "sharer_status_changed", payload: {globalSharingStatus: globalSharingStatus,userData:userData}})
            })

            const interaction_channel = supabaseClient.channel(`${data.sessionId}-interaction-channel`, {
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
            console.log(data)

            if(data.sessionMeta.mode=="TEAM" || userData.id==data.sessionMeta.owner){
            
                interaction_channel.on(
                    'broadcast',
                    { event: 'frame-changed' },
                    (payload) => {
                        data.renderingEngine.getViewport(payload.payload.viewport).setImageIdIndex(payload.payload.frame)
                        data.renderingEngine.getViewport(payload.payload.viewport).render()
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
                       dispatch({type: 'set_pointer', payload: {coordX: payload.payload.coordX, coordY: payload.payload.coordY, coordZ: payload.payload.coordZ,viewport: payload.payload.viewport}})
            
                    }
                )
        }

            dispatch({type: 'sharing_controller_initialized', payload: {shareController: share_controller, interactionChannel: interaction_channel}})
            
        }

        return () => {
            if (data.shareController) {
                data.shareController.untrack();
                data.shareController.unsubscribe();
            }
            console.log("share_controller unsubscribed");
        }
    }, [data.sessionId, supabaseClient]);

    useEffect(() => {
        //data.renderingEngine.getViewports()
        if(data.sessionMeta.mode=="TEAM" || userData.id!=data.sessionMeta.owner){
            if (data.shareController && data.renderingEngine && data.sharingUser === userData?.id && data.sessionId) {
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

                data.eventListenerManager.addEventListener(vp.element, 'CORNERSTONE_VOI_MODIFIED', (event) => {
                    const window = cornerstone.utilities.windowLevel.toWindowLevel(event.detail.range.lower,event.detail.range.upper)
                    data.interactionChannel.send({
                        type: 'broadcast',
                        event: 'voi-changed',
                        payload: { ww:window.windowWidth, wc:window.windowCenter, viewport: `${viewport_idx}-vp` },
                    })

                })
                if (data.toolSelected == "pointer") {
                    if (mobile) {
                        data.eventListenerManager.addEventListener(vp.element, cornerstoneTools.Enums.Events.TOUCH_DRAG, (event) => {

                            const eventData = event.detail;
                            const { currentPoints } = eventData;
                            if (currentPoints && currentPoints.world) {
                                data.interactionChannel.send({
                                    type: 'broadcast',
                                    event: 'pointer-changed',
                                    payload: { coordX: currentPoints.world[0], coordY: currentPoints.world[1], coordZ: currentPoints.world[2], viewport: `${viewport_idx}-vp` },
                                })
                            }
                        })
                    } else {
                        data.eventListenerManager.addEventListener(vp.element, cornerstoneTools.Enums.Events.MOUSE_MOVE, (event) => {
                            const eventData = event.detail;
                            const { currentPoints } = eventData;
                            if (currentPoints && currentPoints.world) {
                                data.interactionChannel.send({
                                    type: 'broadcast',
                                    event: 'pointer-changed',
                                    payload: { coordX: currentPoints.world[0], coordY: currentPoints.world[1], coordZ: currentPoints.world[2], viewport: `${viewport_idx}-vp` },
                                })
                            }

                        })
                    }
                }
                else {
                    data.interactionChannel.send({
                        type: 'broadcast',
                        event: 'pointer-changed',
                        payload: { coordX: 10000, coordY: 10000, coordZ: 10000 },
                    })
                    data.eventListenerManager.removeEventListener(vp.element, cornerstoneTools.Enums.Events.MOUSE_MOVE);
                }

            })

            }
        }
}, [data.shareController, data.renderingEngine, data.sharingUser, userData,data.toolSelected]);


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
        case 'loading_request':
            new_data = {...data, isRequestLoading:true}
            break;
        case 'update_viewport_data':
            var vd = action.payload.vd;
            var ld = action.payload.ld;
            var m = action.payload.m;
            
            var sessionMeta = {
                owner:action.payload.owner,
                mode:action.payload.mode
            }
            new_data = { ...data, ld:ld,vd:vd,m:m,
                sessionMeta:sessionMeta,
                isRequestLoading:false,
            };
            break;
        case 'sharing_controller_initialized':
            new_data = {...data, ...action.payload}
            break;
        case 'connect_to_sharing_session':
            var sessionId = action.payload.sessionId;
            var sessionMeta = {
                owner:action.payload.owner,
                mode:action.payload.mode
            }
            new_data = {...data, sessionId: sessionId, sessionMeta:sessionMeta}
            break;
        case 'sharer_status_changed':{
                // This can become more elegant for sure. This function should really just write globalSharingStatus to state
                // and the components that care should make updates as necessary
              
                let { globalSharingStatus,userData } = action.payload;
                const usersWhoAreSharing = globalSharingStatus.filter(sharer => sharer.shareStatus === true)
                if (usersWhoAreSharing.length > 0) {
                    const mostRecentShare = usersWhoAreSharing
                        .reduce((prev, current) => (prev.timeOfLastShareStatusUpdated > current.timeOfLastShareStatusUpdated) ? prev : current);
                    
                    const nonRecentSharers = usersWhoAreSharing
                        .filter(sharer => sharer.user !== mostRecentShare.user)
                        .map(sharer => sharer.user);
                    
                    // if the current user is sharing, and someone else has requested
                    // reset the listeners and update the presence state
                    if (nonRecentSharers.includes(userData.id)) {
                        data.eventListenerManager.reset()
                        data.shareController.track({ share: false, lastShareRequest: new Date().toISOString(),discordData:  data.activeUsers.filter(user => user.user === userData.id)[0].discordData });
                    }
    
                    if (nonRecentSharers.length !== 0) {
                        //toast(`"${mostRecentShare.user} has requested control`);
                        toast(`${mostRecentShare.discordData?.username??(mostRecentShare.email && !mostRecentShare.email=="")?mostRecentShare.email:mostRecentShare.user} has requested control`);
                        new_data = { ...data, sharingUser: null, activeUsers: globalSharingStatus };
                    } else {
                        //toast(`"${mostRecentShare.user} has taken control`);
                        toast(`${mostRecentShare.discordData?.username??(mostRecentShare.email && !mostRecentShare.email=="")?mostRecentShare.email:mostRecentShare.user} has taken control`);
                        new_data = { ...data, sharingUser: mostRecentShare.user, activeUsers: globalSharingStatus };
                    }
                } else {
                    data.eventListenerManager.reset()
                    new_data = { ...data, sharingUser: null, activeUsers: globalSharingStatus };
                }
    
                break;
            }
        case 'toggle_sharing':{

            let {userData} = action.payload;
            if (data.shareController) {
                // if the sharingUser is the same as the current user, share should be set to false
                // if the sharingUser is not the same as the current user, share should be set to true
                data.shareController.track({ share: data.sharingUser !== userData.id, lastShareRequest: new Date().toISOString(),discordData:  data.activeUsers.filter(user => user.user === userData.id)[0].discordData,email:userData.email });
                // there is an error here that will occur where data.sharingUser is only set once there is 1 and only 1 sharing user in presence state
                // if there is a request to share that hasn't fully processed, data.sharingUser will be out of date
                // so if you try to cancel while it is processing, it will try to create a new request rather than cancelling the request

                // the right thing to do is to remove interaction with the share button while in the transitioning state
            }
            break;
        }
        case 'select_tool':
                new_data = {...data, toolSelected: action.payload}
                break;
        case 'set_pointer':
                new_data = {...data, coordData:
                    {coord:[action.payload.coordX,action.payload.coordY,action.payload.coordZ],
                        viewport:action.payload.viewport} }
                break;
        case 'viewport_ready':
            console.log("viewport ready!", action.payload)

            const viewport = (
                data.renderingEngine.getViewport(`${action.payload.viewportId}-vp`)
            );
            break;
        default:
            throw Error('Unknown action: ' + action.type);
    }
    return new_data;
}