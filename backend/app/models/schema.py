from app.core.database import get_db_connection

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Migration to add status and last_verified_at to cloud_configs
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='cloud_configs'")
    if cursor.fetchone():
        cursor.execute("PRAGMA table_info(cloud_configs)")
        columns = [row['name'] for row in cursor.fetchall()]
        if 'status' not in columns:
            cursor.execute("ALTER TABLE cloud_configs ADD COLUMN status TEXT DEFAULT 'Connected'")
        if 'last_verified_at' not in columns:
            cursor.execute("ALTER TABLE cloud_configs ADD COLUMN last_verified_at TEXT")
        conn.commit()
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cloud_configs (
            account_id TEXT PRIMARY KEY,
            account_name TEXT NOT NULL,
            provider TEXT NOT NULL,
            region TEXT NOT NULL,
            use_iam_role BOOLEAN NOT NULL,
            access_key TEXT,
            secret_key TEXT,
            session_token TEXT,
            assume_role_arn TEXT,
            external_id TEXT,
            status TEXT DEFAULT 'Connected',
            last_verified_at TEXT
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS services_registry (
            service_name TEXT PRIMARY KEY,
            supports_right_sizing BOOLEAN NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS code_repository (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT,
            service_name TEXT NOT NULL,
            component_type TEXT NOT NULL,
            version INTEGER NOT NULL,
            code_content TEXT NOT NULL,
            status TEXT NOT NULL,
            generated_by TEXT NOT NULL,
            reviewed_by TEXT,
            reviewed_at TEXT,
            created_at TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS metric_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT,
            resource_id TEXT NOT NULL,
            service_type TEXT NOT NULL,
            region TEXT NOT NULL,
            metric_name TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            value REAL NOT NULL,
            unit TEXT NOT NULL
        )
    """)
    
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='resource_summaries'")
    if cursor.fetchone():
        cursor.execute("PRAGMA table_info(resource_summaries)")
        columns = [row['name'] for row in cursor.fetchall()]
        if 'raw_llm_response' not in columns:
            cursor.execute("ALTER TABLE resource_summaries ADD COLUMN raw_llm_response TEXT DEFAULT ''")
        conn.commit()

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resource_summaries (
            resource_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            service_type TEXT NOT NULL,
            region TEXT NOT NULL,
            analysis_date TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            recommendation TEXT NOT NULL,
            explanation TEXT NOT NULL,
            raw_llm_response TEXT DEFAULT '',
            PRIMARY KEY (resource_id, account_id)
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS discovered_resources (
            resource_id TEXT NOT NULL,
            account_id TEXT NOT NULL,
            service_type TEXT NOT NULL,
            region TEXT NOT NULL,
            resource_type TEXT NOT NULL,
            metadata_json TEXT NOT NULL,
            discovery_date TEXT NOT NULL,
            PRIMARY KEY (resource_id, account_id)
        )
    """)
    
    cursor.execute("SELECT COUNT(*) FROM services_registry")
    if cursor.fetchone()[0] == 0:
        defaults = [
            ("EC2", 1),
            ("RDS", 1),
            ("EBS", 1),
            ("Lambda", 1),
            ("ElastiCache", 1),
            ("S3", 0)
        ]
        cursor.executemany("INSERT INTO services_registry (service_name, supports_right_sizing) VALUES (?, ?)", defaults)
        
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS billing_service_cache (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            service_name TEXT NOT NULL,
            original_name TEXT NOT NULL,
            region TEXT NOT NULL,
            status TEXT NOT NULL,
            last_scanned TEXT NOT NULL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS pipeline_executions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            service_name TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            duration_seconds REAL,
            status TEXT NOT NULL,
            total_regions INTEGER,
            successful_regions INTEGER,
            failed_regions INTEGER,
            discovery_time_sec REAL,
            metrics_time_sec REAL,
            llm_time_sec REAL
        )
    """)
    
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS activity_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id TEXT NOT NULL,
            activity_type TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    """)
    
    conn.commit()
    conn.close()
