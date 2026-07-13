import sqlite3
import os
import json

DB_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "db.sqlite")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if we need to migrate (if cloud_configs table doesn't exist but other tables do)
    cursor.execute("  SELECT name FROM sqlite_master WHERE type='table' AND name='cloud_configs'")
    if not cursor.fetchone():
        # Drop old tables to force recreation with new schemas
        cursor.execute("DROP TABLE IF EXISTS services_registry")
        cursor.execute("DROP TABLE IF EXISTS code_repository")
        cursor.execute("DROP TABLE IF EXISTS metric_store")
        cursor.execute("DROP TABLE IF EXISTS resource_summaries")
        conn.commit()
    
    # 1. Cloud Configurations (Module 0)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cloud_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            account_name TEXT NOT NULL,
            region TEXT NOT NULL,
            use_iam_role BOOLEAN NOT NULL,
            access_key TEXT,
            secret_key TEXT,
            session_token TEXT,
            assume_role_arn TEXT,
            external_id TEXT,
            verified BOOLEAN NOT NULL DEFAULT 0
        )
    """)
    
    # 2. Right-Sizing Supported Services Registry (Module 2)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS services_registry (
            service_name TEXT PRIMARY KEY,
            supports_right_sizing BOOLEAN NOT NULL
        )
    """)
    
    # 3. Code Repository (Module 5)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS code_repository (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            config_id INTEGER,
            service_name TEXT NOT NULL,
            component_type TEXT NOT NULL, -- 'discovery', 'metric_identification', 'metric_fetching'
            version INTEGER NOT NULL,
            code_content TEXT NOT NULL,
            status TEXT NOT NULL, -- 'pending_review', 'approved', 'rejected', 'edited'
            generated_by TEXT NOT NULL, -- 'openai', 'gemini', 'manual_edit'
            reviewed_by TEXT,
            reviewed_at TEXT,
            created_at TEXT NOT NULL
        )
    """)
    
    # 4. Metric Store (Module 8)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS metric_store (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            config_id INTEGER,
            resource_id TEXT NOT NULL,
            service_type TEXT NOT NULL,
            region TEXT NOT NULL,
            metric_name TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            value REAL NOT NULL,
            unit TEXT NOT NULL
        )
    """)
    
    # 5. Resource Summaries & Recommendations (Module 9 / 10)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS resource_summaries (
            resource_id TEXT NOT NULL,
            config_id INTEGER NOT NULL,
            service_type TEXT NOT NULL,
            region TEXT NOT NULL,
            analysis_date TEXT NOT NULL,
            summary_json TEXT NOT NULL,
            recommendation TEXT NOT NULL, -- 'Upsize', 'Downsize', 'Keep Current', 'Specific Instance'
            explanation TEXT NOT NULL,
            PRIMARY KEY (resource_id, config_id)
        )
    """)
    
    # Seed default values for registry
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
        
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_FILE)

