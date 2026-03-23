import Layout from '../layout/layout';
import Fab from './Fab'
import Tools from './Tools'
import SessionUsers from './SessionUsers'
import MedGemmaButton from './MedGemma/MedGemmaButton'
import CompareNormal from './MedGemma/CompareNormal'
import AtlasOverlayMenu from './MedGemma/AtlasOverlayMenu'
import OnboardingOverlay from './OnboardingOverlay'
import AnnotationPanel from './AnnotationPanel'
import HeatmapOverlay from './HeatmapOverlay'
import { Toaster } from 'sonner';
import { useLocation } from "react-router-dom";
import { useContext, useEffect, useState } from 'react';
import { UserContext } from '../context/UserContext';
import { getShowMedGemmaButton, PREF_EVENT } from '../lib/userPreferences';
import { useAutoTransferSession } from '../hooks/useAutoTransferSession';

function MainPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isPreview = searchParams.get("preview") === "true";
  const { userData } = useContext(UserContext).data;
  const [prefTick, setPrefTick] = useState(0);

  // Skip auto-transfer work in preview mode; narrow hook deps avoid extra DB reads
  useAutoTransferSession({ enabled: !isPreview });

  useEffect(() => {
    const onPrefs = () => setPrefTick((t) => t + 1);
    window.addEventListener(PREF_EVENT, onPrefs);
    return () => window.removeEventListener(PREF_EVENT, onPrefs);
  }, []);

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
          </div>
        </div>
        <CompareNormal />
        <AnnotationPanel />
        <HeatmapOverlay />
        <OnboardingOverlay page="viewer" />
        <Toaster position="top-right" />
      </>
  )
}

export default MainPage;