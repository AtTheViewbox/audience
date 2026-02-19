import './App.css';
import MainPage from './components/MainPage'
import { DataProvider } from './context/DataContext';
import { UserProvider } from './context/UserContext';
import HomePage from "./components/Home/HomePage"
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { useLocation } from 'react-router-dom';
import UpdatePassword from './login/UpdatePassword';

const AudienceRoute = () => {
  const { search } = useLocation();
  return search ?
    <UserProvider>
      <DataProvider>
        <MainPage />
      </DataProvider>
    </UserProvider> :
    <UserProvider> <HomePage /></UserProvider>;
};

function App() {

  const basename = import.meta.env.BASE_URL

  return (
    <div className="App overflow-y-scroll no-scrollbar">
      <Helmet>
        <link
          rel="iframely"
          href="https://attheviewbox.github.io/audience/"
          media="(aspect-ratio: 1280/720)"
        />
        <meta property="title" content="AtTheViewBox" />
        <meta property="description" content="get started reading images" />
      </Helmet>
      <Router basename={basename}>
        <Routes>
          <Route path="/" element={<AudienceRoute />} />
          <Route path="/passwordreset" element={<UpdatePassword />} />
        </Routes>
      </Router>
    </div>
  );
}

export default App;