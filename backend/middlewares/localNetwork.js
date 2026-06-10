const ip = require('ipaddr.js');

function isPrivateIP(ipAddress) {
  try {
    // Check if the IP is standard localhost (IPv4/IPv6) or inside a private subnet (192.168.x.x, 10.x.x.x, etc)
    if (ipAddress === '::1' || ipAddress === '127.0.0.1') return true;

    // Normalize mapped IPv4 addresses (::ffff:192.168.x.x)
    let normalized = ipAddress;
    if (ipAddress.includes('::ffff:')) {
      normalized = ipAddress.split('::ffff:')[1];
    }

    const parsedIp = ip.parse(normalized);
    return parsedIp.range() === 'private' || parsedIp.range() === 'loopback' || parsedIp.range() === 'uniqueLocal';
  } catch (err) {
    console.error('Invalid IP Address parsed in localNetwork middleware:', ipAddress);
    return false;
  }
}

function enforceLocalNetwork(req, res, next) {
  // If the server is exposed to the public internet, block non-local IP addresses from executing commands
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;

  // If multiple IPs are forwarded, get the first one (the actual client)
  const actualIp = clientIp.split(',')[0].trim();

  if (!isPrivateIP(actualIp)) {
    console.warn(`[SECURITY] Blocked request from external IP: ${actualIp} to ${req.originalUrl}`);
    return res.status(403).json({ success: false, error: 'Access Denied. Streamer API is restricted to the local network.' });
  }

  next();
}

module.exports = enforceLocalNetwork;
