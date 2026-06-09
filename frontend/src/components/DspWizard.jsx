import { useState } from 'react';
import GraphicEQ from './GraphicEQ';

const QUESTIONS = [
  {
    id: 'speakerSize',
    title: '1. What size are your speakers?',
    options: [
      { label: 'Small (Bookshelf, low bass)', value: 'small' },
      { label: 'Medium (Large Bookshelf/Small Tower)', value: 'medium' },
      { label: 'Large (Full range Tower)', value: 'large' },
    ]
  },
  {
    id: 'hasSubwoofer',
    title: '2. Do you have a dedicated Subwoofer?',
    options: [
      { label: 'Yes, crossed over at 80Hz', value: true },
      { label: 'No, speakers handle all bass', value: false },
    ]
  },
  {
    id: 'distance',
    title: '3. What is your listening distance?',
    options: [
      { label: 'Close (Desktop / Nearfield)', value: 'close' },
      { label: 'Medium (Living room couch)', value: 'medium' },
      { label: 'Far (Large room)', value: 'far' },
    ]
  },
  {
    id: 'roomAcoustics',
    title: '4. How would you describe your room acoustics?',
    options: [
      { label: 'Live (Many hard surfaces, echoes)', value: 'live' },
      { label: 'Neutral (Balanced)', value: 'neutral' },
      { label: 'Dead (Thick carpets, heavily treated)', value: 'dead' },
    ]
  },
  {
    id: 'soundSignature',
    title: '5. What is your preferred sound signature?',
    options: [
      { label: 'Flat (Reference / Studio)', value: 'flat' },
      { label: 'V-Shape (Exciting, boosted bass/treble)', value: 'v-shape' },
      { label: 'Warm (Relaxed highs, rich bass)', value: 'warm' },
    ]
  },
  {
    id: 'wallProximity',
    title: '6. Where are your speakers placed?',
    options: [
      { label: 'Free space (Far from walls)', value: 'free' },
      { label: 'Close to a wall', value: 'wall' },
      { label: 'In a corner', value: 'corner' },
    ]
  },
  {
    id: 'maxVolumeLimit',
    title: '7. Set a Maximum Volume Limit (%)',
    isSlider: true
  },
  {
    id: 'subsonicFilter',
    title: '8. Enable Subsonic Filter (Protects speakers from sub-20Hz frequencies)?',
    options: [
      { label: 'Yes', value: true },
      { label: 'No', value: false },
    ]
  },
  {
    id: 'nightMode',
    title: '9. Enable Night Mode (Reduces heavy bass for nighttime listening)?',
    options: [
      { label: 'Yes', value: true },
      { label: 'No', value: false },
    ]
  },
  {
    id: 'lrBalance',
    title: '10. Adjust L/R Channel Balance',
    isSlider: true,
    min: -10,
    max: 10,
    labelFormatter: (val) => val === 0 ? 'Center' : (val < 0 ? `Left +${Math.abs(val)}dB` : `Right +${val}dB`)
  },
  {
    id: 'graphicEQ',
    title: '11. Custom 10-Band Graphic EQ',
    isEQ: true
  }
];

export default function DspWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({
    speakerSize: 'medium',
    hasSubwoofer: false,
    distance: 'medium',
    roomAcoustics: 'neutral',
    soundSignature: 'flat',
    wallProximity: 'free',
    maxVolumeLimit: 100,
    subsonicFilter: true,
    nightMode: false,
    lrBalance: 0,
    graphicEQ: Array(10).fill(0)
  });
  const [isSaving, setIsSaving] = useState(false);

  const currentQ = QUESTIONS[step];

  const handleSelect = (val) => {
    setAnswers(prev => ({ ...prev, [currentQ.id]: val }));
    if (step < QUESTIONS.length - 1 && !currentQ.isSlider && !currentQ.isEQ) {
      setStep(step + 1);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const portString = window.location.port ? `:${window.location.port}` : '';
      const url = `${window.location.protocol}//${window.location.hostname}${portString}/api/config-dsp`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers)
      });
      if (response.ok) {
        alert('DSP Config saved successfully!');
        onClose();
      } else {
        alert('Failed to save configuration');
      }
    } catch (e) {
      console.error(e);
      alert('Error connecting to backend');
    }
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 w-full max-w-2xl rounded-lg shadow-2xl p-6 flex flex-col h-full max-h-[90vh]">

        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-white">CamillaDSP Setup Wizard</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
             <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-800 h-2 rounded mb-6">
          <div
            className="bg-accent h-2 rounded transition-all duration-300"
            style={{ width: `${((step + 1) / QUESTIONS.length) * 100}%` }}
          ></div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-center">
          <h3 className="text-xl text-gray-200 mb-6 text-center">{currentQ.title}</h3>

          <div className="flex flex-col space-y-3">
            {currentQ.isEQ ? (
              <GraphicEQ
                 bands={answers.graphicEQ}
                 onChange={(newBands) => setAnswers(prev => ({ ...prev, graphicEQ: newBands }))}
              />
            ) : currentQ.isSlider ? (
              <div className="px-8">
                <input
                  type="range"
                  min={currentQ.min || "50"} max={currentQ.max || "100"}
                  value={answers[currentQ.id]}
                  onChange={(e) => setAnswers(prev => ({ ...prev, [currentQ.id]: parseInt(e.target.value) }))}
                  className="w-full accent-accent"
                />
                <div className="text-center mt-4 text-2xl font-bold text-accent">
                  {currentQ.labelFormatter ? currentQ.labelFormatter(answers[currentQ.id]) : `${answers[currentQ.id]}%`}
                </div>
              </div>
            ) : (
              currentQ.options.map((opt, idx) => {
                const isSelected = answers[currentQ.id] === opt.value;
                return (
                  <button
                    key={idx}
                    onClick={() => handleSelect(opt.value)}
                    className={`p-4 rounded border text-left transition-all ${
                      isSelected
                        ? 'border-accent bg-accent/20 text-white'
                        : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {opt.label}
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Footer Navigation */}
        <div className="mt-8 flex justify-between">
          <button
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
            className="px-6 py-2 rounded bg-gray-800 text-gray-300 disabled:opacity-50"
          >
            Back
          </button>

          {step === QUESTIONS.length - 1 ? (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2 rounded bg-accent text-white font-bold disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Apply & Restart DSP'}
            </button>
          ) : (
            <button
              onClick={() => setStep(step + 1)}
              className="px-6 py-2 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold"
            >
              Next
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
