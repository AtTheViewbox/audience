import './App.css';
import Layout from './layout/layout';
import Fab from './components/fab'
import SessionUsers from './components/SessionUsers'
import { DataProvider } from './context/DataContext';
import { useEffect } from 'react';
import { Toaster } from "@/components/ui/sonner"


function App() {

  useEffect(() => {
    console.log("App loaded")
  }, []);

  return (
    <div className="App">
      <DataProvider>
        <Layout />
        <Fab />
        <SessionUsers />
        <Toaster />
      </DataProvider>
    </div>
  );
}

export default App;