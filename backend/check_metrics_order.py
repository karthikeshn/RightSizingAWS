import sqlite3
import json

conn = sqlite3.connect('e:/RightSizingAWS/backend/db.sqlite')
cursor = conn.cursor()

cursor.execute("SELECT DISTINCT metric_name FROM metric_store WHERE resource_id='AUTO-EC2-START' or resource_id='EC2-AUTO-START'")
metrics = [r[0] for r in cursor.fetchall()]
print(f"Metrics in DB for AUTO-EC2-START: {metrics}")

cursor.execute("SELECT summary_json FROM resource_summaries WHERE resource_id='AUTO-EC2-START' or resource_id='EC2-AUTO-START'")
summary = cursor.fetchone()
if summary:
    data = json.loads(summary[0])
    print("\nMetrics in Summary JSON:")
    for k, v in data.get('metrics', {}).items():
        print(f" - {k}")

