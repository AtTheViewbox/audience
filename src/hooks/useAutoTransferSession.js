import { useEffect, useRef, useContext } from 'react';
import { useLocation } from 'react-router-dom';
import { UserContext } from '../context/UserContext';
import { DataContext, DataDispatchContext } from '../context/DataContext';
import { transferSessionToCurrentUrl } from '../lib/transferSharedSession';
import { sameViewerSession } from '../lib/shareSession';

const URL_SETTLE_MS = 400;

/**
 * When enabled in user preferences, if this user already has a share session
 * in viewbox but the current URL (study) differs, run the same transfer as ShareTab.
 *
 * Uses narrow deps + debounce so we don't spam viewbox queries on re-renders.
 */
export function useAutoTransferSession(options = {}) {
  const { enabled = true } = options;
  const location = useLocation();
  const { userData, supabaseClient } = useContext(UserContext).data;
  const { data } = useContext(DataContext);
  const { dispatch } = useContext(DataDispatchContext);
  const busy = useRef(false);
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const chatRef = useRef(data.chatHistory);
  chatRef.current = data.chatHistory;

  const userId = userData?.id;
  const isAnon = userData?.is_anonymous;
  const autoTransferOn = userData?.user_metadata?.auto_transfer_session === true;

  useEffect(() => {
    if (!enabled || !userId || isAnon || !autoTransferOn) return;

    let cancelled = false;
    const t = window.setTimeout(() => {
      (async () => {
        if (busy.current) return;

        // Following a join link (s=) means viewing a session, not moving ours.
        if (new URLSearchParams(location.search).get('s')) return;

        const { data: rows, error } = await supabaseClient
          .from('viewbox')
          .select('url_params')
          .eq('user', userId)
          .limit(1);

        if (cancelled || error || !rows?.length) return;
        if (sameViewerSession(rows[0].url_params, location.search)) return;

        busy.current = true;
        try {
          await transferSessionToCurrentUrl({
            supabaseClient,
            userId,
            chatHistory: chatRef.current,
            dispatch: dispatchRef.current,
          });
        } catch (e) {
          console.error('Auto session transfer failed:', e);
          busy.current = false;
        }
      })();
    }, URL_SETTLE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    enabled,
    location.search,
    userId,
    isAnon,
    autoTransferOn,
    supabaseClient,
  ]);
}
