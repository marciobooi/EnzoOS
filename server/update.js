import express from 'express';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const execPromise = promisify(exec);
const router = express.Router();

// GET /api/system/update/status -> Check git commit difference
router.get('/status', async (req, res) => {
  try {
    // Run git fetch to update tracking branches
    await execPromise('git fetch origin main', { cwd: projectRoot });
    
    // Get local and remote hashes
    const { stdout: localHash } = await execPromise('git rev-parse HEAD', { cwd: projectRoot });
    const { stdout: remoteHash } = await execPromise('git rev-parse origin/main', { cwd: projectRoot });
    
    const local = localHash.trim();
    const remote = remoteHash.trim();
    
    res.json({
      success: true,
      updateAvailable: local !== remote,
      localCommit: local.substring(0, 7),
      remoteCommit: remote.substring(0, 7)
    });
  } catch (err) {
    console.error('[Resonance Server] Failed checking git update status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/system/update -> Trigger update bash script
router.post('/', (req, res) => {
  console.log('[Resonance Server] Initiating OTA Update...');
  
  try {
    const scriptPath = path.resolve(__dirname, '../scripts/update.sh');
    const logPath = path.resolve(__dirname, '../ota_update.log');
    
    // Reset/truncate log file and write initiation header
    fs.writeFileSync(logPath, `=== OTA UPDATE TRIGGERED AT ${new Date().toISOString()} ===\n`, 'utf8');
    
    // Spawn detached child process to run update.sh (pipe streams to read in Node)
    const child = spawn('bash', [scriptPath], {
      cwd: path.resolve(__dirname, '..'),
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    const broadcast = req.app.get('wssBroadcast');
    
    child.stdout.on('data', (data) => {
      const text = data.toString();
      fs.appendFileSync(logPath, text);
      
      let percent = null;
      const match = text.match(/\[PROGRESS:\s*(\d+)\]/);
      if (match) {
        percent = parseInt(match[1], 10);
      }
      
      if (broadcast) {
        broadcast({ type: 'UPDATE_PROGRESS', payload: { text, percent } });
      }
    });
    
    child.stderr.on('data', (data) => {
      const text = data.toString();
      fs.appendFileSync(logPath, text);
      if (broadcast) {
        broadcast({ type: 'UPDATE_PROGRESS', payload: { text, isError: true } });
      }
    });
    
    child.unref();
    
    res.json({
      success: true,
      message: 'OTA Update process started. The server will pull changes, compile and restart.'
    });
  } catch (err) {
    console.error('[Resonance Server] Failed to trigger update script:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/system/update/log -> Read update logs for real-time diagnostics
router.get('/log', (req, res) => {
  try {
    const logPath = path.resolve(__dirname, '../ota_update.log');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      res.json({ success: true, log: content });
    } else {
      res.json({ success: true, log: 'No update log found.' });
    }
  } catch (err) {
    console.error('[Resonance Server] Failed to read update log:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/system/update/health -> CPU temp, RAM load, Wi-Fi strength
router.get('/health', async (req, res) => {
  try {
    let cpuTemp = 42.5; // default fallback
    let ramLoad = 34;
    let wifiSignal = -55;

    if (process.platform === 'linux') {
      try {
        if (fs.existsSync('/sys/class/thermal/thermal_zone0/temp')) {
          const rawTemp = fs.readFileSync('/sys/class/thermal/thermal_zone0/temp', 'utf8');
          cpuTemp = parseFloat(rawTemp) / 1000;
        }
      } catch (_) {}

      try {
        const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
        const totalMatch = meminfo.match(/MemTotal:\s+(\d+)/);
        const freeMatch = meminfo.match(/MemAvailable:\s+(\d+)/);
        if (totalMatch && freeMatch) {
          const total = parseInt(totalMatch[1], 10);
          const available = parseInt(freeMatch[1], 10);
          ramLoad = Math.round(((total - available) / total) * 100);
        }
      } catch (_) {}

      try {
        if (fs.existsSync('/proc/net/wireless')) {
          const wireless = fs.readFileSync('/proc/net/wireless', 'utf8');
          const lines = wireless.split('\n');
          if (lines.length > 2) {
            const fields = lines[2].trim().split(/\s+/);
            if (fields.length > 3) {
              const signalQuality = parseFloat(fields[3]);
              if (signalQuality < 0) {
                wifiSignal = signalQuality;
              } else {
                wifiSignal = Math.round(signalQuality - 110);
              }
            }
          }
        }
      } catch (_) {}
    } else {
      cpuTemp = 40 + Math.random() * 5;
      ramLoad = 25 + Math.round(Math.random() * 10);
      wifiSignal = -50 - Math.round(Math.random() * 10);
    }

    res.json({
      success: true,
      cpuTemp: Math.round(cpuTemp * 10) / 10,
      ramLoad,
      wifiSignal
    });
  } catch (err) {
    res.json({ success: true, cpuTemp: 45, ramLoad: 30, wifiSignal: -60 });
  }
});

export default router;
