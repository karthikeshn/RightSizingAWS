import datetime
from app.core.database import get_db_connection

def init_metric_store_indices():
    """
    FR-8.2: Create indexes to optimize time-series queries.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE INDEX IF NOT EXISTS idx_metric_lookup 
        ON metric_store (resource_id, metric_name, timestamp)
    """)
    conn.commit()
    conn.close()

# Initialize index right away
init_metric_store_indices()

def save_metric_points(account_id, resource_id, service_type, region, datapoints):
    """
    FR-8.1: Save time-series points.
    datapoints is a list of dicts: [{"timestamp": "...", "value": 1.2, "metric_name": "...", "unit": "..."}]
    """
    if not datapoints:
        return
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Batch insert for efficiency
    insert_data = []
    for dp in datapoints:
        insert_data.append((
            account_id,
            resource_id,
            service_type,
            region,
            dp['metric_name'],
            dp['timestamp'],
            dp['value'],
            dp['unit']
        ))
        
    cursor.executemany("""
        INSERT INTO metric_store (account_id, resource_id, service_type, region, metric_name, timestamp, value, unit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, insert_data)
    
    conn.commit()
    conn.close()

def get_metric_points(account_id, resource_id, metric_name, start_time_str, end_time_str):
    """
    FR-8.3: Retrieve all metric points for resource X, metric Y, over date range Z.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        SELECT timestamp, value, unit FROM metric_store
        WHERE account_id = ? AND resource_id = ? AND metric_name = ? AND timestamp BETWEEN ? AND ?
        ORDER BY timestamp ASC
    """, (account_id, resource_id, metric_name, start_time_str, end_time_str))
    
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

def get_metrics_for_resource(account_id, resource_id):
    """
    Helper to list all distinct metric names stored for a resource.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT metric_name FROM metric_store
        WHERE account_id = ? AND resource_id = ?
    """, (account_id, resource_id))
    rows = cursor.fetchall()
    conn.close()
    return [r['metric_name'] for r in rows]

def purge_old_metrics(retention_days=90):
    """
    FR-8.4: Raw metric data retention cleanup.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=retention_days)
    cutoff_str = cutoff.isoformat()
    
    cursor.execute("""
        DELETE FROM metric_store
        WHERE timestamp < ?
    """, (cutoff_str,))
    
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return deleted
