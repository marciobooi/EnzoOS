#!/usr/bin/env python3
"""
Resonance HiFi — remote deploy + smoke-test driver.

This app doesn't run in a local dev container: server/*.js shells out to
`mpc`, `systemctl`, `mpc outputs`, ALSA/PipeWire tooling, and CamillaDSP —
none of which exist here. The only place a real instance runs is the
target Raspberry Pi (or its QEMU stand-in), reached over SSH — the same
workflow documented in this repo's own CLAUDE.md. This script is that
workflow, consolidated: every subcommand below is a paramiko/curl
sequence that was run by hand, repeatedly, over an actual work session
against a live Pi before being written down here.

Usage:
    python .claude/skills/run-resonance/driver.py deploy
    python .claude/skills/run-resonance/driver.py smoke
    python .claude/skills/run-resonance/driver.py logs [--lines 40] [--grep TEXT]
    python .claude/skills/run-resonance/driver.py ssh "<command>"

Reads PI_HOST / PI_USER / PI_PASSWORD from the environment (already
injected by .claude/settings.local.json in this project). No args read
credentials from argv, so they never land in shell history.
"""
import argparse
import io
import json
import os
import sys
import time

import paramiko

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

PROJECT_DIR = "/home/pi/EnzoOS"
SERVICE = "resonance-api"


def _creds():
    host = os.environ.get("PI_HOST")
    user = os.environ.get("PI_USER", "pi")
    password = os.environ.get("PI_PASSWORD")
    if not host or not password:
        sys.exit(
            "PI_HOST / PI_PASSWORD not set. This project keeps them in "
            ".claude/settings.local.json's `env` block, which Claude Code "
            "auto-injects — if you're running this driver outside that "
            "harness, export them yourself first."
        )
    return host, user, password


def _connect():
    host, user, password = _creds()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=10)
    return client


def run(client, cmd, timeout=60):
    """Run one command over SSH, return (exit_status, stdout, stderr)."""
    _, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    status = stdout.channel.recv_exit_status()
    return status, out, err


def cmd_deploy(_args):
    """git pull + npm run build + restart the systemd unit, on the Pi."""
    client = _connect()
    try:
        print("### git pull")
        status, out, err = run(client, f"cd {PROJECT_DIR} && git pull origin main", timeout=60)
        print(out.strip() or "(already up to date)")
        if err.strip():
            print("stderr:", err.strip())
        if status != 0:
            sys.exit(f"git pull failed (exit {status})")

        print("\n### npm run build")
        status, out, err = run(client, f"cd {PROJECT_DIR} && npm run build 2>&1", timeout=180)
        tail = "\n".join(out.strip().splitlines()[-10:])
        print(tail)
        if status != 0 or "error" in out.lower():
            sys.exit(f"build failed (exit {status})")

        print(f"\n### restart {SERVICE}")
        status, _, err = run(client, f"sudo systemctl restart {SERVICE}", timeout=30)
        if status != 0:
            sys.exit(f"restart failed: {err.strip()}")
        time.sleep(3)
        status, out, _ = run(client, f"systemctl is-active {SERVICE}")
        print(out.strip())
        if out.strip() != "active":
            sys.exit(f"{SERVICE} did not come back active")
        print("\nDeployed and active.")
    finally:
        client.close()


def cmd_smoke(_args):
    """
    Curl-based smoke test against the ALREADY-RUNNING instance (run
    `deploy` first if you want to test what's currently on disk). Exercises
    the same request sequence used to verify the QR-pairing fix earlier
    this session: health -> lan-url -> mint a QR token -> redeem it over
    HTTPS-on-IP -> use the bearer -> open an authorized WebSocket. All of
    it against loopback on the Pi except the WS-over-LAN step, which hits
    the box's real LAN IP the way a phone/tablet actually would.
    """
    client = _connect()
    host, _, _ = _creds()
    failures = []

    def check(label, status, out, expect_substr=None, expect_status=0):
        # expect_status=None: don't gate on curl's exit code. Used for the
        # WS-upgrade check below, where success means the connection STAYS
        # open (the server keeps pushing frames) — curl has no clean way to
        # close a WS handshake, so it always exits 28 (timeout) after a
        # correct upgrade. The substring match is the real signal there.
        ok = (expect_status is None or status == expect_status) and (
            expect_substr is None or expect_substr in out
        )
        print(f"{'PASS' if ok else 'FAIL'}  {label}")
        if not ok:
            print(f"      status={status} out={out[:200]!r}")
            failures.append(label)
        return out

    try:
        print(f"Target: {host}\n")

        status, out, _ = run(client, "curl -s -m 8 http://localhost:5000/api/health")
        check("GET /api/health (loopback:5000)", status, out, '"status":"ok"')

        status, out, _ = run(client, "curl -s -m 8 https://localhost:5001/api/health -k")
        check("GET /api/health (loopback:5001 HTTPS)", status, out, '"status":"ok"')

        status, out, _ = run(client, "curl -s -m 8 http://localhost:5000/api/system/lan-url")
        check("GET /api/system/lan-url", status, out, '"url"')
        try:
            lan = json.loads(out)
        except json.JSONDecodeError:
            lan = {}

        status, out, _ = run(client, "curl -s -m 8 http://localhost:5000/api/auth/qr-token")
        check("GET /api/auth/qr-token (loopback-trusted)", status, out, '"token"')
        try:
            qr_token = json.loads(out).get("token")
        except json.JSONDecodeError:
            qr_token = None

        bearer = None
        if qr_token:
            redeem_cmd = (
                f"curl -sk -m 10 -X POST -H 'Content-Type: application/json' "
                f"-d '{{\"token\":\"{qr_token}\"}}' https://{host}:5001/api/auth/qr-redeem"
            )
            status, out, _ = run(client, redeem_cmd)
            check("POST /api/auth/qr-redeem (over LAN IP, HTTPS)", status, out, '"success":true')
            try:
                bearer = json.loads(out).get("token")
            except json.JSONDecodeError:
                pass

            # Re-redeeming the same token must now fail — it's single-use.
            status, out, _ = run(client, redeem_cmd)
            check("Re-redeem same QR token now rejected", status, out, "unauthorized")
        else:
            print("SKIP  qr-redeem checks (no token minted)")
            failures.append("qr-redeem (no token)")

        if bearer:
            status, out, _ = run(
                client,
                f"curl -sk -m 8 -H 'Authorization: Bearer {bearer}' https://{host}:5001/api/auth/check",
            )
            check("GET /api/auth/check with bearer", status, out, '"success":true')

            ws_cmd = (
                f"curl -sk -m 8 -i 'https://{host}:5001/ws?token={bearer}' "
                "-H 'Connection: Upgrade' -H 'Upgrade: websocket' "
                "-H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Version: 13'"
            )
            status, out, _ = run(client, ws_cmd)
            check("WS upgrade over LAN with bearer token", status, out,
                  "101 Switching Protocols", expect_status=None)
        else:
            print("SKIP  auth/check + WS checks (no bearer)")

        status, out, _ = run(client, "curl -s -m 8 http://localhost:5000/api/player/library/albums/all")
        check("GET /api/player/library/albums/all", status, out, '"albums"')

        status, out, _ = run(
            client,
            "curl -s -m 8 -o /dev/null -w '%{http_code} %{content_type}' http://localhost:5000/remote",
        )
        check("GET /remote serves the built SPA shell", status, out, "200 text/html")

        status, out, _ = run(client, f"systemctl is-active {SERVICE}")
        check(f"systemctl is-active {SERVICE}", status, out.strip(), "active")

    finally:
        client.close()

    print(f"\n{len(failures)} failure(s)." if failures else "\nAll checks passed.")
    if failures:
        sys.exit(1)


def cmd_logs(args):
    client = _connect()
    try:
        cmd = f"journalctl -u {SERVICE} -n {args.lines} --no-pager"
        if args.grep:
            cmd += f" | grep -i {json.dumps(args.grep)}"
        _, out, err = run(client, cmd, timeout=20)
        print(out or "(no matching lines)")
        if err.strip():
            print("stderr:", err.strip())
    finally:
        client.close()


def cmd_ssh(args):
    client = _connect()
    try:
        status, out, err = run(client, args.command, timeout=120)
        print(out)
        if err.strip():
            print("stderr:", err.strip())
        sys.exit(status)
    finally:
        client.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="action", required=True)

    sub.add_parser("deploy", help="git pull + npm run build + restart resonance-api on the Pi")
    sub.add_parser("smoke", help="curl-based smoke test against the live instance")

    p_logs = sub.add_parser("logs", help="tail journalctl for resonance-api")
    p_logs.add_argument("--lines", type=int, default=40)
    p_logs.add_argument("--grep", default=None)

    p_ssh = sub.add_parser("ssh", help="run an arbitrary command on the Pi")
    p_ssh.add_argument("command")

    args = parser.parse_args()
    {"deploy": cmd_deploy, "smoke": cmd_smoke, "logs": cmd_logs, "ssh": cmd_ssh}[args.action](args)


if __name__ == "__main__":
    main()
