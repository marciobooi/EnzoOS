import React, { useState, useEffect } from 'react';
import Kiosk from './pages/Kiosk';
import RemoteControl from './pages/RemoteControl';
import ToastContainer from './components/ui/ToastContainer';

export default function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  const isRemote = currentPath === '/remote';

  return (
    <>
      <ToastContainer bottomOffset={isRemote ? 80 : 24} />
      {isRemote ? <RemoteControl /> : <Kiosk />}
    </>
  );
}
