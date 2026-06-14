import paramiko
import sys

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("192.168.178.199", username="pi", password="1234", timeout=10)

stdin, stdout, stderr = client.exec_command("echo '=== favorite_radios ==='; sqlite3 /home/pi/EnzoOS/resonance.db 'SELECT * FROM favorite_radios;'; echo '=== settings ==='; sqlite3 /home/pi/EnzoOS/resonance.db 'SELECT * FROM settings;'")
print("=== SQLite Data ===")
sys.stdout.buffer.write(stdout.read())
sys.stderr.buffer.write(stderr.read())

client.close()
