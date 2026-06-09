import { useState, useEffect } from 'react';

const FREQUENCIES = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

export default function GraphicEQ({ bands, onChange }) {
  // `bands` is an array of 10 dB values (-12 to 12). Default if missing.
  const [values, setValues] = useState(bands || Array(10).fill(0));

  useEffect(() => {
    if (bands) setValues(bands);
  }, [bands]);

  const handleChange = (index, value) => {
    const newValues = [...values];
    newValues[index] = value;
    setValues(newValues);
    if (onChange) onChange(newValues);
  };

  const formatFreq = (f) => f >= 1000 ? `${f/1000}k` : f;

  return (
    <div className="flex justify-between items-center w-full h-48 bg-black/30 p-4 rounded-xl border border-white/10 my-6">
      {FREQUENCIES.map((freq, idx) => (
        <div key={freq} className="flex flex-col items-center h-full">
          <span className="text-xs text-[var(--text-main)] font-mono mb-2">{values[idx] > 0 ? '+' : ''}{values[idx]}</span>
          <input
            type="range"
            min="-12"
            max="12"
            step="1"
            value={values[idx]}
            onChange={(e) => handleChange(idx, parseInt(e.target.value))}
            className="flex-1 appearance-none w-2 bg-black/50 rounded-full outline-none slider-vertical accent-[var(--accent)] cursor-pointer"
            style={{ writingMode: 'bt-lr', WebkitAppearance: 'slider-vertical' }}
          />
          <span className="text-[10px] text-[var(--text-muted)] mt-2">{formatFreq(freq)}</span>
        </div>
      ))}
    </div>
  );
}
