import './App.css';
import Layout from './layout/layout';
import Fab from './components/Fab'
import ToolsTab from './components/ToolsTab'
import SessionUsers from './components/SessionUsers'
import { DataProvider } from './context/DataContext';
import { useEffect } from 'react';
import { Toaster } from 'sonner';

function App() {

  useEffect(() => {
    console.log("App loaded")
  }, []);
  

  return (
    <div className="App overflow-y-scroll no-scrollbar">
      <DataProvider>
        <Layout />
        <ToolsTab/>
        <Fab />
        <SessionUsers />
        <Toaster position="top-right"/>
      </DataProvider>
    </div>
  );
}

export default App;