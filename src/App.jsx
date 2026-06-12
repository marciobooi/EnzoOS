import React, { useState, useEffect } from 'react';
import Kiosk from './pages/Kiosk';
import RemoteControl from './pages/RemoteControl';

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

  if (currentPath === '/remote') {
    return <RemoteControl />;
  }

  return <Kiosk />;
}
