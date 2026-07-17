import sqlite3
import json
import uuid
import datetime

conn = sqlite3.connect('e:/RightSizingAWS/backend/db.sqlite')
cursor = conn.cursor()

account_id = "mock_account_123"
now_str = datetime.datetime.utcnow().isoformat()

# Clear existing if any
cursor.execute("DELETE FROM cloud_configs WHERE account_id = ?", (account_id,))
cursor.execute("DELETE FROM code_repository WHERE account_id = ?", (account_id,))
cursor.execute("DELETE FROM discovered_resources WHERE account_id = ?", (account_id,))

cursor.execute("INSERT INTO cloud_configs (account_id, account_name, provider, region, use_iam_role, access_key, secret_key, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", 
               (account_id, "Mock Account", "aws", "us-east-1", False, "mock", "mock", "Connected"))

# Add mock discovery code
discovery_code = """
def discover_resources(session, region):
    resources = []
    for i in range(2):
        resources.append({"id": f"i-mock{i}", "type": "t3.medium", "metadata": {"Name": f"Mock{i}"}})
    return resources
"""
cursor.execute("INSERT INTO code_repository (account_id, service_name, component_type, version, code_content, status, generated_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
               (account_id, "EC2", "discovery", 1, discovery_code, "approved", "openai", now_str))

# Add mock metric code
metrics_code = json.dumps(["CPUUtilization"])
cursor.execute("INSERT INTO code_repository (account_id, service_name, component_type, version, code_content, status, generated_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
               (account_id, "EC2", "metric_identification", 1, metrics_code, "approved", "openai", now_str))

# Add metric fetching code
fetch_code = """
def fetch_metrics(session, region, resource_id, metrics, start_time, end_time):
    import random
    import time
    # Simulate network delay for fetching metrics
    time.sleep(0.5)
    return [{"timestamp": "2026-07-15T00:00:00Z", "metric": "CPUUtilization", "value": random.randint(10, 90)} for _ in range(5)]
"""
cursor.execute("INSERT INTO code_repository (account_id, service_name, component_type, version, code_content, status, generated_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
               (account_id, "EC2", "metric_fetching", 1, fetch_code, "approved", "openai", now_str))

conn.commit()
conn.close()
print("Mock account and code added!")
