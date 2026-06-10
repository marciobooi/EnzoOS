import { useState } from 'react';
import { Lock, Unlock, LogIn } from 'lucide-react';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username === 'enzoOS' && password === 'enzoOS') {
      localStorage.setItem('enzoOS_auth', 'authenticated');
      onLoginSuccess();
    } else {
      setError('Invalid username or password');
      setTimeout(() => setError(''), 3000);
    }
  };

  return (
    <div className="w-full h-full min-h-screen bg-[var(--bg-main)] flex flex-col items-center justify-center p-6 text-[var(--text-main)]">
      <div className="w-full max-w-sm glass-panel p-8 rounded-3xl shadow-2xl border border-white/10 flex flex-col items-center">

        <div className="w-16 h-16 bg-[var(--accent)] rounded-full flex items-center justify-center mb-6 shadow-[0_0_15px_var(--accent)]">
           <Lock size={32} className="text-white" />
        </div>

        <h1 className="text-2xl font-bold tracking-widest uppercase mb-2">EnzoOS Remote</h1>
        <p className="text-sm text-[var(--text-muted)] mb-8 text-center">Authenticate to access the audio streamer controls.</p>

        <form onSubmit={handleSubmit} className="w-full flex flex-col space-y-4">
          <div>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-black/40 border border-white/20 text-[var(--text-main)] px-4 py-3 rounded-xl outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>
          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-black/40 border border-white/20 text-[var(--text-main)] px-4 py-3 rounded-xl outline-none focus:border-[var(--accent)] transition-colors"
            />
          </div>

          {error && <div className="text-red-400 text-sm text-center font-medium">{error}</div>}

          <button
            type="submit"
            className="w-full mt-4 py-4 bg-[var(--accent)] text-white font-bold rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-lg"
          >
            <LogIn size={20} />
            <span>Connect</span>
          </button>
        </form>

      </div>
    </div>
  );
}
