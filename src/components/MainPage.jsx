import Layout from '../layout/layout';
import Fab from './Fab'
import Tools from './Tools'
import SessionUsers from './SessionUsers'
import MedGemmaButton from './MedGemma/MedGemmaButton'
import CompareNormal from './MedGemma/CompareNormal'
import AtlasOverlayMenu from './MedGemma/AtlasOverlayMenu'
import OnboardingOverlay from './OnboardingOverlay'
import DemoOnboardingOverlay from './DemoOnboardingOverlay'
import { isDemoMode } from '../lib/demoCase.js';
import AnnotationPanel from './AnnotationPanel'
import AnswerKeyBoxLoader from './AnswerKeyBoxLoader'
import HeatmapOverlay from './HeatmapOverlay'
import QuestionAnswerOverlay from './QuestionAnswerOverlay'
import OwnerResultsOverlay from './OwnerResultsOverlay'
import { Toaster } from 'sonner';
import { useLocation } from "react-router-dom";
import { useContext, useEffect, useState } from 'react';
import { UserContext } from '../context/UserContext';
import { DataContext, DataDispatchContext } from '../context/DataContext.jsx';
import { getShowMedGemmaButton, PREF_EVENT } from '../lib/userPreferences';
import { useAutoTransferSession } from '../hooks/useAutoTransferSession';

function MainPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isPreview = searchParams.get("preview") === "true";
  const demoMode = isDemoMode(location.search);
  const { userData } = useContext(UserContext).data;
  const { sessionId, sessionMeta } = useContext(DataContext).data;
  const { dispatch } = useContext(DataDispatchContext);
  const [prefTick, setPrefTick] = useState(0);

  const isSessionOwner = sessionId && userData && sessionMeta?.owner === userData.id;

  // Skip auto-transfer work in preview mode; narrow hook deps avoid extra DB reads
  useAutoTransferSession({ enabled: !isPreview && !demoMode });

  useEffect(() => {
    const onPrefs = () => setPrefTick((t) => t + 1);
    window.addEventListener(PREF_EVENT, onPrefs);
    return () => window.removeEventListener(PREF_EVENT, onPrefs);
  }, []);

  useEffect(() => {
    if (!isSessionOwner) return;

    const onKeyDown = (e) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable) return;
      e.preventDefault();
      dispatch({ type: "toggle_heatmap" });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSessionOwner, dispatch]);

  void prefTick;
  const showMedGemma = getShowMedGemmaButton(userData);

  return (
    isPreview ? (<Layout />) :
      <>
        <Layout />
        <Tools />
        <Fab />
        <SessionUsers />
        {/* Right-edge rail: MedGemma + Atlas side by side, same top/right inset */}
        <div
          className="fixed z-[90] flex flex-row items-center gap-2 pointer-events-none"
          style={{ top: 12, right: 12 }}
        >
          <div className="pointer-events-auto flex flex-row items-center gap-2">
            <AtlasOverlayMenu />
            {import.meta.env.BUILD_ENV !== 'main' && showMedGemma ? <MedGemmaButton /> : null}
            <OwnerResultsOverlay />
            <QuestionAnswerOverlay />
            {demoMode ? <DemoOnboardingOverlay /> : null}
          </div>
        </div>
        <CompareNormal />
        <AnswerKeyBoxLoader />
        <AnnotationPanel />
        <HeatmapOverlay />
        {demoMode ? null : <OnboardingOverlay page="viewer" />}
        <Toaster position="top-right" />
      </>
  )
}

export default MainPage;