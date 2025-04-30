import './App.css';
import Layout from './layout/layout';
import Fab from './components/Fab'
import ToolsTab from './components/ToolsTab'
import SessionUsers from './components/SessionUsers'
import { DataProvider } from './context/DataContext';
import { useEffect } from 'react';
import { Toaster } from 'sonner';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

function App() {

  const basename = import.meta.env.BASE_URL
  console.log("basename", basename)

  useEffect(() => {
    console.log("App loaded")
  }, []);
  

  return (
    <div className="App overflow-y-scroll no-scrollbar">

      <link
  rel="iframely"
  href="https://attheviewbox.github.io/audience/"
  media="(aspect-ratio: 1280/720)"
/>
<meta property="title" content="AtTheViewBox" />
<meta property="description" content="get started reading images" />

<Router basename={basename}>
          <Routes>
            <Route path="/" element={  
              <DataProvider>
        <Layout />
        <ToolsTab/>
        <Fab />
        <SessionUsers />
        <Toaster position="top-right"/>
      </DataProvider>
    } />

          </Routes>
        </Router>

    
    </div>
  );
}

export default App;