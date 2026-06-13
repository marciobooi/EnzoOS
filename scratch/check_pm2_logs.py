import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("192.168.178.199", username="pi", password="1234", timeout=10)

stdin, stdout, stderr = client.exec_command("pm2 flush && sleep 1")
stdin, stdout, stderr = client.exec_command("tail -n 100 /home/pi/.pm2/logs/resonance-api-out.log /home/pi/.pm2/logs/resonance-api-error.log")
print("=== PM2 Logs after flush ===")
print(stdout.read().decode())
print(stderr.read().decode())

client.close()
