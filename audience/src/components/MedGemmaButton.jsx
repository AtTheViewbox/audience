import { useState, useContext, useRef, useEffect } from 'react';
import { UserContext } from '../context/UserContext';
import { Sparkles, X } from 'lucide-react';
import { createPortal } from 'react-dom';

import MedGemmaImpression from './MedGemmaImpression';
import MedGemmaChat from './MedGemmaChat';

const R = 12; // margin from edges

export default function MedGemmaButton() {
  const { userData, supabaseClient } = useContext(UserContext).data || {};
  const [contentVisible, setContentVisible] = useState(false);
  const [phase, setPhase] = useState('button'); // 'button' | 'open'
  const cardRef = useRef(null);
  const measuredBtn = useRef({ w: 148, h: 40 }); // fallback dims

  const [activeTab, setActiveTab] = useState('pipeline');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hello! I'm MedGemma (27B). Ask me any medical questions." },
  ]);

  const BASE_URL = `https://mfei1225--medgemma-dual-agent-v11-api.modal.run`;
  const handleAddToChat = (content) =>
    setMessages((prev) => [...prev, { role: 'assistant', content }]);

  // Measure button size before first interaction
  useEffect(() => {
    if (cardRef.current) {
      measuredBtn.current = {
        w: cardRef.current.offsetWidth,
        h: cardRef.current.offsetHeight,
      };
    }
  }, []);

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

    // small delay so content fade-out starts before shrink
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

  // Always the same single element — no swap, no flicker
  const portal = createPortal(
    <div
      ref={cardRef}
      onClick={phase === 'button' ? handleOpen : undefined}
      className="fixed z-50 flex flex-col overflow-hidden shadow-2xl select-none"
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
      {/* ── Header row — always visible, always same height as original button ── */}
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
        <button
          onClick={(e) => { e.stopPropagation(); handleClose(); }}
          className="flex items-center justify-center h-6 w-6 rounded-md hover:bg-slate-800 text-slate-400 transition-colors"
          style={{
            opacity: contentVisible ? 1 : 0,
            transition: 'opacity 0.15s ease',
            pointerEvents: contentVisible ? 'auto' : 'none',
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Body — fades in/out, never affects layout ── */}
      <div
        className="flex-1 flex flex-col overflow-hidden"
        style={{
          opacity: contentVisible ? 1 : 0,
          transition: 'opacity 0.16s ease',
          pointerEvents: contentVisible ? 'auto' : 'none',
        }}
      >
        {/* Tab bar */}
        <div
          className="px-2 bg-slate-950"
          style={{
            borderTop: '1px solid #1e293b',
            borderBottom: '1px solid #1e293b',
          }}
        >
          <div className="flex h-10 gap-6 px-2">
            {['pipeline', 'chat'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="text-[11px] uppercase tracking-wider font-bold py-2 transition-colors relative"
                style={{
                  color: activeTab === tab ? '#60a5fa' : '#64748b',
                }}
              >
                {tab === 'pipeline' ? 'Assistant' : 'Chat'}
                {activeTab === tab && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'pipeline' && (
            <MedGemmaImpression
              BASE_URL={BASE_URL}
              onAddToChat={handleAddToChat}
              onSwitchToChat={() => setActiveTab('chat')}
              onClose={handleClose}
            />
          )}
          {activeTab === 'chat' && (
            <MedGemmaChat
              messages={messages}
              setMessages={setMessages}
              BASE_URL={BASE_URL}
              userData={userData}
              supabaseClient={supabaseClient}
            />
          )}
        </div>
      </div>
    </div>,
    document.body
  );

  return portal;
}