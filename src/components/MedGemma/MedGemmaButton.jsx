import { useState, useContext, useRef, useEffect } from 'react';
import { UserContext } from '../../context/UserContext';
import { DataContext, DataDispatchContext } from '../../context/DataContext';
import { Sparkles, X } from 'lucide-react';
import { createPortal } from 'react-dom';

import AgentChat from './AgentChat';

const R = 12; // margin from edges

export default function MedGemmaButton() {
  const { userData, supabaseClient } = useContext(UserContext).data || {};
  const { data } = useContext(DataContext);
  const { dispatch } = useContext(DataDispatchContext);
  const { renderingEngine } = data;

  const [isMounted, setIsMounted] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const [phase, setPhase] = useState('button'); // 'button' | 'open'
  const cardRef = useRef(null);
  const measuredBtn = useRef({ w: 148, h: 40 }); // fallback dims

  const messages = data.chatHistory || [];
  const latestMessages = useRef(messages);
  latestMessages.current = messages; // Always keep the latest reference synchronously

  const setMessages = (newMessagesOrUpdater) => {
    let newHistory;
    if (typeof newMessagesOrUpdater === 'function') {
      newHistory = newMessagesOrUpdater(latestMessages.current);
    } else {
      newHistory = newMessagesOrUpdater;
    }

    latestMessages.current = newHistory; // Update immediately for synchronous setMessages calls

    dispatch({ type: 'update_chat_history', payload: newHistory });

    if (data.interactionChannel) {
      data.interactionChannel.send({
        type: 'broadcast',
        event: 'chat-updated',
        payload: { messages: newHistory }
      });
    }
  };

  //const BASE_URL = `https://mfei1225--medgemma-dual-agent-v11-api.modal.run`;

  const BASE_URL = `https://mfei1225--medgemma-dual-agent-v11-api-dev.modal.run`;

  // Measure button size before first interaction
  useEffect(() => {
    setIsMounted(true);
    if (cardRef.current) {
      measuredBtn.current = {
        w: cardRef.current.offsetWidth,
        h: cardRef.current.offsetHeight,
      };
    }
  }, []);

  useEffect(() => {
    const onOpenRequest = () => {
      if (phase === 'button') {
        handleOpen();
      }
    };
    window.addEventListener('medgemma-open-chat', onOpenRequest);
    return () => window.removeEventListener('medgemma-open-chat', onOpenRequest);
  }, [phase]);

  const handleOpen = () => {
    const { w: bw, h: bh } = measuredBtn.current;
    const pw = Math.min(440, window.innerWidth - R * 2);
    const ph = window.innerHeight - R * 2;
    const card = cardRef.current;
    if (!card) return;

    setPhase('open');
    card.animate(
      [
        { width: `${bw}px`, height: `${bh}px`, borderRadius: '10px' },
        { width: `${pw}px`, height: `${ph}px`, borderRadius: '16px' },
      ],
      { duration: 380, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
    ).finished.then(() => setContentVisible(true));
  };

  const handleClose = () => {
    const { w: bw, h: bh } = measuredBtn.current;
    const card = cardRef.current;
    if (!card) return;
    setContentVisible(false);
    setTimeout(() => {
      card.animate(
        [
          { width: `${card.offsetWidth}px`, height: `${card.offsetHeight}px`, borderRadius: '16px' },
          { width: `${bw}px`, height: `${bh}px`, borderRadius: '10px' },
        ],
        { duration: 320, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
      ).finished.then(() => setPhase('button'));
    }, 80);
  };

  const card = {
    background: '#020617', // slate-950
    border: '1px solid #1e293b', // slate-800
  };

  // Safe guard: Do not create portal if we are not mounted or on main branch
  if (!isMounted || typeof document === 'undefined' || !document.body) {
    return null;
  }

  // Hide on main branch
  if (import.meta.env.BUILD_ENV === 'main') {
    return null;
  }

  const portal = createPortal(
    <div
      ref={cardRef}
      onClick={phase === 'button' ? handleOpen : undefined}
      className="fixed z-50 flex flex-col overflow-hidden shadow-2xl select-text"
      style={{
        top: R,
        right: R,
        width: measuredBtn.current.w,
        height: measuredBtn.current.h,
        borderRadius: 10,
        cursor: phase === 'button' ? 'pointer' : 'default',
        ...card,
      }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between flex-shrink-0 px-4 bg-slate-900/40"
        style={{ height: measuredBtn.current.h, minHeight: measuredBtn.current.h }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span className="font-semibold text-sm tracking-tight text-slate-100 whitespace-nowrap">
            MedGemma AI
          </span>
        </div>

        <div className="flex items-center gap-1" style={{ opacity: contentVisible ? 1 : 0, transition: 'opacity 0.15s ease', pointerEvents: contentVisible ? 'auto' : 'none' }}>
          <button
            onClick={(e) => { e.stopPropagation(); handleClose(); }}
            className="flex items-center justify-center h-6 w-6 rounded-md hover:bg-slate-800 text-slate-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          opacity: contentVisible ? 1 : 0,
          transition: 'opacity 0.16s ease',
          pointerEvents: contentVisible ? 'auto' : 'none',
        }}
      >
        <AgentChat
          messages={messages}
          setMessages={setMessages}
          BASE_URL={BASE_URL}
          renderingEngine={renderingEngine}
          userData={userData}
          supabaseClient={supabaseClient}
          dispatch={dispatch}
          dataDispatch={dispatch}
          onMaskReady={() => { }}
        />
      </div>
    </div>,
    document.body
  );

  return portal;
}