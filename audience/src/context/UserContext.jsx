import { createContext, useState,useReducer,useEffect } from 'react';
import LoadingPage from '../components/LoadingPage.jsx';
import { cl } from './SupabaseClient.jsx';


// Create the context
export const UserContext = createContext({});    
export const UserDispatchContext = createContext({});

// Create a provider component
export const UserProvider = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [data, userDispatch] = useReducer(dataReducer, []);


  useEffect(() => {
   
    const setupSupabase = async () => {

        // if there is a user logged in, store that as user
        let { data: { user }, error } = await cl.auth.getUser();
       
        if (!user) {
            // otherwise, use anonymous login
            ({ data: { user }, error } = await cl.auth.signInAnonymously());
        }
        // TODO: error handling for auth
        const ss = cl.auth.onAuthStateChange(
            (event, session) => {
                    if (event === 'SIGNED_IN') {
                        userDispatch({type: 'auth_update', payload: {session}})
                  } else if (event === 'SIGNED_OUT') {
                    userDispatch({type: 'log_out', payload: {session}})
                  }
            }
        )

        userDispatch({type: 'supabase_initialized', payload: {supabaseClient: cl, supabaseAuthSubscription: ss, userData: user}})
        setLoading(false);
    }
    setupSupabase()
    return () => {
        userDispatch({ type: 'clean_up_supabase' })    
    }

}, []);


if (loading) return <LoadingPage />;

  return (
    <UserContext.Provider value={{ data }}>
        <UserDispatchContext.Provider value={{ userDispatch }}>
      {children}
     </UserDispatchContext.Provider>
    </UserContext.Provider>
  );
};

export function dataReducer(data, action) {
   
    let new_data = {...data};
   
    switch (action.type) {

        case 'supabase_initialized':
            new_data = { ...data, ...action.payload };
            break;
        case 'clean_up_supabase':
            new_data = {...data}
            data.supabaseAuthSubscription.data.subscription.unsubscribe();
            data.supabaseClient.removeAllChannels();
            break;
        case 'auth_update':
            new_data = { ...data, userData: action.payload.session.user };
            break;
        case 'log_out':
            new_data = { ...data, userData:null };
            break;
    }
    return new_data;
}
