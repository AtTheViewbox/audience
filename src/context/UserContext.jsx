import { createContext, useState, useReducer, useEffect, useCallback } from 'react';
import LoadingPage from '../components/LoadingPage.jsx';
import NetworkBlockedNotice from '../components/NetworkBlockedNotice.jsx';
import { cl } from './SupabaseClient.jsx';
import { generateRandomName } from '../lib/constants.js';
import { toast } from "sonner";
import {
  probeSupabase,
  shouldSimulateSupabaseError,
} from '../lib/supabaseConnectivity.js';

function isMissingAuthSession(error) {
  if (!error) return false;
  const name = String(error.name || "");
  const msg = String(error.message || error.error_description || "").toLowerCase();
  return name === "AuthSessionMissingError" || msg.includes("auth session missing");
}


// Create the context
export const UserContext = createContext({});
export const UserDispatchContext = createContext({});

// Create a provider component
export const UserProvider = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [networkError, setNetworkError] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [data, userDispatch] = useReducer(dataReducer, []);


  useEffect(() => {
    let cancelled = false;

    const setupSupabase = async () => {
        setLoading(true);
        setNetworkError(null);

        if (shouldSimulateSupabaseError()) {
            const simulated = new Error("Simulated Supabase error (?supabase_error=1)");
            setNetworkError(simulated);
            setLoading(false);
            setRetrying(false);
            return;
        }

        const probe = await probeSupabase();
        if (cancelled) return;
        if (!probe.ok) {
            setNetworkError(probe.error);
            setLoading(false);
            setRetrying(false);
            return;
        }

        try {
            const { data: { session } } = await cl.auth.getSession();
            let user = session?.user ?? null;
            if (user) {
                const { data: { user: verified }, error } = await cl.auth.getUser();
                if (error && !isMissingAuthSession(error)) throw error;
                user = verified || user;
            }
            if (!user) {
                const { data, error } = await cl.auth.signInAnonymously();
                if (error) throw error;
                user = data?.user ?? null;
            }

            if (cancelled) return;

            let decoratedUser = null;
            if (user) {
               if (user.is_anonymous) {
                   const randomName = generateRandomName();
                   decoratedUser = { ...user, email: randomName };
                   toast(`You are playing as guest: ${randomName}`);
               } else {
                   decoratedUser = user;
               }
            }
            const ss = cl.auth.onAuthStateChange(
                (event, session) => {
                        if (event === 'SIGNED_IN') {
                            userDispatch({type: 'auth_update', payload: {session}})
                      } else if (event === 'SIGNED_OUT') {
                        userDispatch({type: 'log_out', payload: {session}})
                      }
                }
            )

            userDispatch({type: 'supabase_initialized', payload: {supabaseClient: cl, supabaseAuthSubscription: ss, userData: decoratedUser}})
            setLoading(false);
            setRetrying(false);
        } catch (error) {
            if (cancelled) return;
            console.error("Supabase setup failed:", error);
            setNetworkError(error);
            setLoading(false);
            setRetrying(false);
        }
    }
    setupSupabase()
    return () => {
        cancelled = true;
        userDispatch({ type: 'clean_up_supabase' })
    }

}, [attempt]);

  const retry = useCallback(() => {
    setRetrying(true);
    setNetworkError(null);
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  if (networkError) {
    return <NetworkBlockedNotice error={networkError} onRetry={retry} retrying={retrying} />;
  }

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
            data?.supabaseAuthSubscription?.data?.subscription?.unsubscribe?.();
            data?.supabaseClient?.removeAllChannels?.();
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
