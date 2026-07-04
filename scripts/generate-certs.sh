#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Resonance HiFi — device-local Certificate Authority + server certificate
# ─────────────────────────────────────────────────────────────────────────────
# A LAN appliance can't get a public (Let's Encrypt) certificate, and a bare
# self-signed cert means scary warnings, no service worker, and a nagging
# "Not Private" screen on iPhone. Instead we create our own tiny CA:
#
#   certs/resonance-ca.crt   ← the user installs+trusts this ONCE per phone
#   certs/cert.pem/key.pem   ← server cert SIGNED by that CA, with SANs for
#                              resonance.local, <hostname>.local, localhost
#                              and every current IPv4 address
#
# After trusting the CA, https://<host>:5001/remote gets a real padlock: the
# mic (voice control) works without warnings, service workers register, and
# the installed PWA behaves like a native app.
#
# Idempotent: keeps an existing CA (so phones stay trusted), but re-issues the
# server cert whenever it is missing, not CA-signed yet, or the machine's
# current IP is not covered by its SANs (e.g. DHCP gave a new address).
# Run any time:  bash scripts/generate-certs.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CERTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/certs"
mkdir -p "$CERTS_DIR"

CA_KEY="$CERTS_DIR/resonance-ca.key"
CA_CRT="$CERTS_DIR/resonance-ca.crt"
SRV_KEY="$CERTS_DIR/key.pem"
SRV_CRT="$CERTS_DIR/cert.pem"

HOSTNAME_SHORT="$(hostname -s 2>/dev/null || hostname)"
# Every IPv4 the box currently has (skip loopback — added explicitly)
IPS="$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.' | grep -v '^127\.' || true)"

# ── 1. CA (kept once created — phones that trusted it stay trusted) ─────────
if [ ! -f "$CA_KEY" ] || [ ! -f "$CA_CRT" ]; then
  echo "Generating Resonance local CA (10 years)…"
  openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
    -keyout "$CA_KEY" -out "$CA_CRT" \
    -subj "/CN=Resonance HiFi Root CA/O=Resonance" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  chmod 600 "$CA_KEY"
fi

# ── 2. Does the existing server cert still fit? ───────────────────────────────
build_san() {
  local san="DNS:resonance.local,DNS:${HOSTNAME_SHORT}.local,DNS:localhost,IP:127.0.0.1"
  for ip in $IPS; do san="$san,IP:$ip"; done
  echo "$san"
}
SAN="$(build_san)"

needs_reissue=0
if [ ! -f "$SRV_CRT" ] || [ ! -f "$SRV_KEY" ]; then
  needs_reissue=1
elif ! openssl verify -CAfile "$CA_CRT" "$SRV_CRT" >/dev/null 2>&1; then
  needs_reissue=1   # legacy bare self-signed cert → replace with CA-signed
else
  for ip in $IPS; do
    if ! openssl x509 -in "$SRV_CRT" -noout -text | grep -q "IP Address:$ip"; then
      needs_reissue=1; break   # DHCP moved us — current IP missing from SANs
    fi
  done
fi

if [ "$needs_reissue" -eq 0 ]; then
  echo "Server certificate is CA-signed and covers all current IPs — nothing to do."
  exit 0
fi

# ── 3. Issue the server certificate (825 days — Apple's max for leaf certs) ──
echo "Issuing server certificate for: $SAN"
TMP_CNF="$(mktemp)"
cat > "$TMP_CNF" <<EOF
[req]
distinguished_name = dn
prompt = no
[dn]
CN = resonance.local
[ext]
subjectAltName = $SAN
basicConstraints = CA:FALSE
keyUsage = digitalSignature,keyEncipherment
extendedKeyUsage = serverAuth
EOF

openssl req -new -newkey rsa:2048 -nodes \
  -keyout "$SRV_KEY" -out "$TMP_CNF.csr" \
  -config "$TMP_CNF" 2>/dev/null
openssl x509 -req -in "$TMP_CNF.csr" -sha256 -days 825 \
  -CA "$CA_CRT" -CAkey "$CA_KEY" -CAcreateserial \
  -extfile "$TMP_CNF" -extensions ext \
  -out "$SRV_CRT" 2>/dev/null
rm -f "$TMP_CNF" "$TMP_CNF.csr"
chmod 600 "$SRV_KEY"

# Keep ownership consistent with the project dir (script may run as root)
PROJECT_OWNER="$(stat -c '%U' "$CERTS_DIR/.." 2>/dev/null || echo "")"
[ -n "$PROJECT_OWNER" ] && chown "$PROJECT_OWNER:$PROJECT_OWNER" "$CA_CRT" "$CA_KEY" "$SRV_CRT" "$SRV_KEY" 2>/dev/null || true

echo "Done. Restart resonance-api to serve the new certificate."
echo "Trust it on your phone: open http://<this-host>:5000/ca.crt"
