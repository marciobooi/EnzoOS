export default function VUMeter({ left, right, styleType = 'digital' }) {
  // Normalize the dB value (-60 to 0) into a percentage (0 to 100)
  const calculateHeight = (db) => Math.max(0, Math.min(100, 100 + db));

  const leftHeight = calculateHeight(left);
  const rightHeight = calculateHeight(right);

  if (styleType === 'analog') {
    // Premium Analog Needle Style (simulated rotation)
    // -60dB -> -45deg, 0dB -> 45deg
    const leftAngle = -45 + (leftHeight * 0.9);
    const rightAngle = -45 + (rightHeight * 0.9);

    return (
      <div className="flex space-x-8 items-center justify-center p-4">
        {[leftAngle, rightAngle].map((angle, idx) => (
          <div key={idx} className="relative w-32 h-24 overflow-hidden rounded-t-full border-t-4 border-l-4 border-r-4 border-[var(--bg-card)] shadow-inner bg-black/40">
            {/* The dial background marks */}
            <div className="absolute inset-0 flex justify-around px-4 pt-2 text-[8px] text-[var(--text-muted)] opacity-50">
              <span>-40</span><span>-20</span><span>-10</span><span>0</span>
            </div>
            {/* The needle */}
            <div
              className="absolute bottom-[-10px] left-1/2 w-1 h-20 bg-[var(--accent)] origin-bottom transition-transform duration-[50ms] ease-out shadow-[0_0_8px_var(--accent)]"
              style={{ transform: `translateX(-50%) rotate(${angle}deg)` }}
            ></div>
            <div className="absolute bottom-[-15px] left-1/2 w-6 h-6 bg-[var(--bg-card)] rounded-full transform -translate-x-1/2 border border-gray-600"></div>
          </div>
        ))}
      </div>
    );
  }

  // Classic Digital Bar Style
  return (
    <div className="flex flex-row justify-center space-x-4 h-full items-end p-2">
      <div className="w-8 bg-black/50 rounded-t overflow-hidden relative shadow-inner border border-white/5">
        <div
          className="absolute bottom-0 w-full bg-[var(--accent)] vu-bar shadow-[0_0_12px_var(--accent)]"
          style={{ height: `${leftHeight}%` }}
        ></div>
      </div>
      <div className="w-8 bg-black/50 rounded-t overflow-hidden relative shadow-inner border border-white/5">
        <div
          className="absolute bottom-0 w-full bg-[var(--accent)] vu-bar shadow-[0_0_12px_var(--accent)]"
          style={{ height: `${rightHeight}%` }}
        ></div>
      </div>
    </div>
  );
}
