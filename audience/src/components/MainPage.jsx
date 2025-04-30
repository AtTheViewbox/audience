import Layout from '../layout/layout';
import Fab from './Fab'
import ToolsTab from './ToolsTab'
import SessionUsers from './SessionUsers'
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
        <ToolsTab/>
        <Fab />
        <SessionUsers />
        <Toaster position="top-right"/>
    </>
  )
}

export default MainPage;