import { useState, useEffect } from 'react';

export default function ClockMode({ onWake }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const formatDate = (date) => {
    return date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  };

  return (
    <div
      className="fixed inset-0 bg-black flex flex-col items-center justify-center z-[100] cursor-pointer"
      onClick={onWake}
    >
      {/* Dimmed text to prevent OLED burn-in */}
      <div className="text-[var(--text-muted)] opacity-50 flex flex-col items-center select-none transition-opacity duration-[2000ms]">
        <div className="text-[12rem] font-light tracking-tighter leading-none">
          {formatTime(time)}
        </div>
        <div className="text-2xl font-medium tracking-widest uppercase mt-4">
          {formatDate(time)}
        </div>
      </div>
    </div>
  );
}
