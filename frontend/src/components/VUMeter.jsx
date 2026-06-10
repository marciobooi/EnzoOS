import { useEffect, useRef } from 'react';

// A dedicated component for the physics-based Canvas VU Meter
function AnalogVUMeter({ dbLevel }) {
  const canvasRef = useRef(null);

  // Physics state
  const physicsRef = useRef({
    currentAngle: -45,
    velocity: 0,
    targetAngle: -45
  });

  useEffect(() => {
    // Normalize dB (-60 to 0) to angle (-45 to 45)
    const normalized = Math.max(0, Math.min(100, 100 + dbLevel));
    physicsRef.current.targetAngle = -45 + (normalized * 0.9);
  }, [dbLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const render = () => {
      const { targetAngle, currentAngle, velocity } = physicsRef.current;

      // Ballistic Physics parameters
      const spring = 0.2;  // Spring stiffness
      const damping = 0.8; // Friction/damping

      // Calculate new physics
      const acceleration = (targetAngle - currentAngle) * spring;
      physicsRef.current.velocity += acceleration;
      physicsRef.current.velocity *= damping; // Apply friction
      physicsRef.current.currentAngle += physicsRef.current.velocity;

      // Draw
      const w = canvas.width;
      const h = canvas.height;
      const centerX = w / 2;
      const centerY = h + 10; // Pivot point slightly below the canvas

      ctx.clearRect(0, 0, w, h);

      // Get CSS variable color for the needle
      const computedStyle = getComputedStyle(document.documentElement);
      const accentColor = computedStyle.getPropertyValue('--accent').trim() || '#3b82f6';

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate((physicsRef.current.currentAngle * Math.PI) / 180);

      // Draw Needle
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.lineTo(-1, -h + 15);
      ctx.lineTo(1, -h + 15);
      ctx.lineTo(1, 0);
      ctx.fillStyle = accentColor;
      ctx.shadowColor = accentColor;
      ctx.shadowBlur = 10;
      ctx.fill();

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="relative w-32 h-24 overflow-hidden rounded-t-full border-t-4 border-l-4 border-r-4 border-[var(--bg-card)] shadow-inner bg-black/40">
      <div className="absolute inset-0 flex justify-around px-4 pt-2 text-[8px] text-[var(--text-muted)] opacity-50 z-0">
        <span>-40</span><span>-20</span><span>-10</span><span>0</span>
      </div>

      <canvas ref={canvasRef} width="128" height="96" className="absolute top-0 left-0 z-10 block" />

      <div className="absolute bottom-[-15px] left-1/2 w-6 h-6 bg-[var(--bg-card)] rounded-full transform -translate-x-1/2 border border-gray-600 z-20 shadow-lg"></div>
    </div>
  );
}

export default function VUMeter({ left, right, styleType = 'digital' }) {
  if (styleType === 'analog') {
    return (
      <div className="flex space-x-8 items-center justify-center p-4">
        <AnalogVUMeter dbLevel={left} />
        <AnalogVUMeter dbLevel={right} />
      </div>
    );
  }

  // Normalize the dB value (-60 to 0) into a percentage (0 to 100)
  const calculateHeight = (db) => Math.max(0, Math.min(100, 100 + db));
  const leftHeight = calculateHeight(left);
  const rightHeight = calculateHeight(right);


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
