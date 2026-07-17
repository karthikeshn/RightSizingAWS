import json
import sqlite3
import time
import urllib.request

account_id = "mock_account_123"
print(f"Using account {account_id}")

url = "http://localhost:8000/api/execution/run"
data = {
    "account_id": account_id,
    "service_name": "EC2",
    "regions": ["us-east-1"],
    "lookback_days": 30
}
req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={"Content-Type": "application/json"}, method="POST")

try:
    with urllib.request.urlopen(req) as response:
        while True:
            line = response.readline()
            if not line:
                break
            print(json.loads(line.decode('utf-8')))
except Exception as e:
    print(f"Error: {e}")
