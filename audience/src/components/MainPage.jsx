import Layout from '../layout/layout';
import Fab from './Fab'
import ToolsTab from './ToolsTab'
import SessionUsers from './SessionUsers'
import { Toaster } from 'sonner';

function MainPage() {
  return (
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