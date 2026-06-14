import React, { useEffect, useRef } from 'react';

export default function SpectrumVisualizer({ isPlaying }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI screens
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const numBars = 24;
    const barWidth = 6;
    const gap = 4;
    const totalWidth = numBars * barWidth + (numBars - 1) * gap;

    // Visualizer state
    const heights = new Array(numBars).fill(0);
    const peaks = new Array(numBars).fill(0);
    const peakDecay = 0.4;
    const riseSpeed = 0.3;
    const fallSpeed = 0.08;

    let lastBeatTime = 0;
    const beatInterval = 500; // 120 BPM

    const animate = (time) => {
      // Clear canvas
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Draw background pattern (matrix grid lines)
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.03)';
      ctx.lineWidth = 1;
      for (let y = 4; y < rect.height; y += 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(rect.width, y);
        ctx.stroke();
      }

      // Update target values
      const targetHeights = [];
      const isBeat = isPlaying && (time - lastBeatTime > beatInterval);
      if (isBeat) {
        lastBeatTime = time;
      }

      for (let i = 0; i < numBars; i++) {
        let target = 0.05; // Base breathing level

        if (isPlaying) {
          // 1. Bass region (0 - 5) - highly responsive to beat
          if (i < 6) {
            const beatStrength = isBeat ? 0.7 + Math.random() * 0.3 : 0;
            const rumble = Math.sin(time * 0.01 + i) * 0.15 + 0.15;
            target = Math.max(0.1, beatStrength, rumble);
          }
          // 2. Mid region (6 - 15) - melody/vocal waves
          else if (i < 16) {
            const wave1 = Math.sin(time * 0.005 + i * 0.4) * 0.25 + 0.25;
            const wave2 = Math.cos(time * 0.002 - i * 0.2) * 0.2 + 0.2;
            const jitter = Math.random() * 0.15;
            target = Math.max(0.08, wave1 + wave2 + jitter);
          }
          // 3. Treble region (16 - 23) - high frequency sizzle
          else {
            const wave = Math.sin(time * 0.015 + i * 0.8) * 0.1 + 0.1;
            const noise = Math.random() * 0.3;
            target = Math.max(0.05, wave + noise);
          }

          // Smooth out overall envelope
          target = Math.min(1.0, target);
        } else {
          // Faint breathing idle wave when paused
          target = 0.05 + Math.sin(time * 0.002 + i * 0.3) * 0.03;
        }

        // Apply physics (rise fast, decay slow)
        if (target > heights[i]) {
          heights[i] += (target - heights[i]) * riseSpeed;
        } else {
          heights[i] -= (heights[i] - target) * fallSpeed;
        }

        // Keep heights in bounds
        heights[i] = Math.max(0, Math.min(1, heights[i]));

        // Update peaks
        if (heights[i] >= peaks[i]) {
          peaks[i] = heights[i];
        } else {
          peaks[i] = Math.max(heights[i], peaks[i] - (peakDecay / 60)); // target 60fps decay
        }
      }

      // Draw the bars
      const startX = (rect.width - totalWidth) / 2;
      
      for (let i = 0; i < numBars; i++) {
        const x = startX + i * (barWidth + gap);
        const barHeight = heights[i] * (rect.height - 8);
        const y = rect.height - 4 - barHeight;

        // Draw bar shadow/glow
        ctx.shadowColor = 'rgba(245, 158, 11, 0.4)';
        ctx.shadowBlur = 6;

        // Create amber gradient for the bar
        const gradient = ctx.createLinearGradient(x, rect.height - 4, x, y);
        gradient.addColorStop(0, 'rgba(217, 119, 6, 0.8)');   // Amber-600
        gradient.addColorStop(0.6, 'rgba(245, 158, 11, 0.9)'); // Amber-500
        gradient.addColorStop(1.0, 'rgba(252, 211, 7, 1.0)');  // Yellow-300

        ctx.fillStyle = gradient;

        // Draw rounded bar using rect
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, y, barWidth, Math.max(2, barHeight), 1.5);
        } else {
          ctx.rect(x, y, barWidth, Math.max(2, barHeight));
        }
        ctx.fill();

        // Draw peak dot
        ctx.shadowColor = 'rgba(251, 191, 36, 0.6)';
        ctx.shadowBlur = 4;
        ctx.fillStyle = 'rgba(251, 191, 36, 0.9)'; // Amber peak dots

        const peakY = rect.height - 4 - (peaks[i] * (rect.height - 8));
        
        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, Math.max(0, peakY - 2), barWidth, 1.5, 0.5);
        } else {
          ctx.rect(x, Math.max(0, peakY - 2), barWidth, 1.5);
        }
        ctx.fill();
      }

      // Reset shadow for next render pass
      ctx.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    // Resize observer to handle container scaling
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        ctx.resetTransform();
        ctx.scale(dpr, dpr);
      }
    });

    resizeObserver.observe(canvas.parentElement);

    return () => {
      cancelAnimationFrame(animationRef.current);
      resizeObserver.disconnect();
    };
  }, [isPlaying]);

  return (
    <div className="w-full h-12 bg-black/45 border border-slate-900/60 rounded-xl p-1 mb-6 relative overflow-hidden flex items-center justify-center">
      {/* CRT scan lines texture */}
      <div className="absolute inset-0 bg-radial-gradient(var(--color-amber-matrix-dim) 15%, transparent 15%) bg-[size:4px_4px] pointer-events-none opacity-40 z-10" />
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block"
        style={{ imageRendering: 'pixelated' }}
      />
    </div>
  );
}
