const { exec } = require('child_process');

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.warn(`Command error (${command}):`, stderr);
        return reject(error);
      }
      resolve(stdout.trim());
    });
  });
}

async function getNetworkStatus(req, res) {
  try {
    // nmcli -t -f TYPE,STATE dev
    const statusOutput = await executeCommand('nmcli -t -f TYPE,STATE dev');

    // Parse output: ethernet:connected \n wifi:disconnected
    let isWifiConnected = false;
    let isEthernetConnected = false;

    statusOutput.split('\n').forEach(line => {
      const [type, state] = line.split(':');
      if (type === 'ethernet' && state === 'connected') isEthernetConnected = true;
      if (type === 'wifi' && state === 'connected') isWifiConnected = true;
    });

    let currentSSID = null;
    if (isWifiConnected) {
      try {
        currentSSID = await executeCommand('nmcli -t -f active,ssid dev wifi | grep "^sim:" | cut -d: -f2');
      } catch (e) {
        // Ignore error if grep fails to find active network
      }
    }

    res.json({
      success: true,
      status: {
        ethernet: isEthernetConnected,
        wifi: isWifiConnected,
        activeSSID: currentSSID
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to fetch network status' });
  }
}

async function scanWifi(req, res) {
  try {
    // nmcli -t -f ssid,signal dev wifi
    const scanOutput = await executeCommand('nmcli -t -f ssid,signal dev wifi');
    const networks = [];
    const seen = new Set();

    scanOutput.split('\n').forEach(line => {
      const parts = line.split(':');
      // A line might have colons inside the SSID, so signal is the last element
      const signal = parseInt(parts.pop(), 10);
      const ssid = parts.join(':');

      if (ssid && ssid !== '--' && !seen.has(ssid)) {
        seen.add(ssid);
        networks.push({ ssid, signal });
      }
    });

    // Sort by signal strength descending
    networks.sort((a, b) => b.signal - a.signal);

    res.json({ success: true, networks });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to scan Wi-Fi networks' });
  }
}

async function connectWifi(req, res) {
  const { ssid, password } = req.body;
  if (!ssid) return res.status(400).json({ success: false, error: 'SSID is required' });

  try {
    const safeSsid = ssid.replace(/'/g, "'\\''");
    let command = `sudo nmcli dev wifi connect '${safeSsid}'`;

    if (password) {
      const safePassword = password.replace(/'/g, "'\\''");
      command += ` password '${safePassword}'`;
    }

    await executeCommand(command);
    res.json({ success: true, message: `Successfully connected to ${ssid}` });
  } catch (error) {
    console.error('Wi-Fi connection failed:', error);
    res.status(500).json({ success: false, error: `Failed to connect to ${ssid}. Check password.` });
  }
}

module.exports = {
  getNetworkStatus,
  scanWifi,
  connectWifi
};
