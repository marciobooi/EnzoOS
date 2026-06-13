import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect("192.168.178.199", username="pi", password="1234", timeout=10)

stdin, stdout, stderr = client.exec_command("cat /etc/asound.conf")
print("=== /etc/asound.conf content ===")
print(stdout.read().decode())
print(stderr.read().decode())

client.close()
