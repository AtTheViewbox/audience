import './App.css';
import Layout from './layout/layout';
import Fab from './components/fab'
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
        <Toaster />
      </DataProvider>
    </div>
  );
}

export default App;