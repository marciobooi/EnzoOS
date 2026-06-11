# Deploying Resonance to Ubuntu Server / VM / Raspberry Pi

This guide details how to install, build, and run the Resonance full-stack application in a production environment on an Ubuntu server, a virtual machine, or a Raspberry Pi.

---

## 1. Prerequisites

Ensure your Ubuntu system is up-to-date and has Node.js (v18+) and npm installed:

```bash
# Update package lists
sudo apt update && sudo apt upgrade -y

# Install Node.js (via NodeSource for v18/v20)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
node -v
npm -v
```

---

## 2. Clone and Install Dependencies

On your server, clone the repository and install all npm packages:

```bash
# Clone the project (replace with your repository url)
git clone <your-repo-url> resonance
cd resonance

# Install node dependencies
npm install
```

---

## 3. Configuration (.env)

Create a production `.env` file in the root of the project directory.

> [!IMPORTANT]
> Change the Redirect URI to match your Ubuntu Server's IP address or domain name on port `5000`.

```bash
nano .env
```

Add your Spotify credentials:
```env
# Spotify App Credentials
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

# Replace <server-ip> with your Raspberry Pi or VM's IP address (e.g., 192.168.1.150)
SPOTIFY_REDIRECT_URI=http://<server-ip>:5000/api/callback
PORT=5000
```

> [!WARNING]
> Don't forget to add `http://<server-ip>:5000/api/callback` to the **Redirect URIs** list in your Spotify Developer Application dashboard!

---

## 4. Build Static Frontend Assets

Compile your React Vite code into a static optimized production build:

```bash
npm run build
```

This compiles your frontend application into the `dist/` directory.

---

## 5. Daemonize the App with PM2

To run the backend server continuously in the background, restart it if it crashes, and load it automatically on system reboot, use **PM2** (Process Manager 2):

```bash
# Install PM2 globally
sudo npm install -y pm2 -g

# Start the server using PM2
pm2 start server/index.js --name "resonance-player"

# View running status
pm2 list

# Monitor logs in real time
pm2 logs resonance-player

# Configure PM2 to start on system boot
pm2 startup
# (Run the command outputted by pm2 startup to configure systemd)

# Save the current list of running processes to load on startup
pm2 save
```

---

## 6. Accessing the Application

Since the Express backend is configured to serve the static built React bundle, everything runs on port **5000**:

- Open your browser and navigate to: **`http://<server-ip>:5000/`**
- Both the Web API endpoints, OAuth redirects, and the user interface will work seamlessly over your local network!
