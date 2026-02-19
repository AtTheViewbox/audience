import Layout from '../layout/layout';
import Fab from './Fab'
import Tools from './Tools'
import SessionUsers from './SessionUsers'
import MedGemmaButton from './MedGemma/MedGemmaButton'
import { Toaster } from 'sonner';
import { useLocation } from "react-router-dom";

function MainPage() {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const isPreview = searchParams.get("preview") === "true";

  return (
    isPreview ? (<Layout />) :
      <>
        <Layout />
        <Tools />
        <Fab />
        <SessionUsers />
        <MedGemmaButton />
        <Toaster position="top-right" />
      </>
  )
}

export default MainPage;