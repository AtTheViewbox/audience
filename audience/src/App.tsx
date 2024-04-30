import './App.css';
import Layout from './layout/layout';
import Fab from './components/fab'
import ToolsTab from './components/ToolsTab'
import SessionUsers from './components/SessionUsers'
import { DataProvider } from './context/DataContext';
import { useEffect } from 'react';
import { Toaster } from "@/components/ui/sonner"

import { attach } from './context/AnnotationContext.js'

attach()

function App() {

  useEffect(() => {
    console.log("App loaded")
  }, []);

  return (
    <div className="App">
      <DataProvider>
        <Layout />
        <ToolsTab/>
        <Fab />
        <SessionUsers />
        <Toaster />
      </DataProvider>
    </div>
  );
}

export default App;
