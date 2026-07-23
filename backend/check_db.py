import sqlite3
import json

conn = sqlite3.connect('e:/RightSizingAWS/backend/db.sqlite')
cursor = conn.cursor()

# Get all lambda functions and their recommendations
cursor.execute("SELECT resource_id, recommendation FROM resource_summaries WHERE service_type='Lambda'")
results = cursor.fetchall()

unknowns = [r[0] for r in results if r[1] == 'Unknown']
print(f"Total Lambda resources: {len(results)}")
print(f"Total with 'Unknown': {len(unknowns)}")
print("First 10 unknown resources:")
for u in unknowns[:10]:
    print(f"- {u}")

# Let's also check if they have metrics in metric_store
if unknowns:
    first_unknown = unknowns[0]
    cursor.execute("SELECT COUNT(*) FROM metric_store WHERE resource_id=?", (first_unknown,))
    count = cursor.fetchone()[0]
    print(f"Metric count for {first_unknown} in DB: {count}")
    
