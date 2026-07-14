import datetime
from src.db import get_db_connection

def save_code_version(account_id, service_name, component_type, code_content, status, generated_by, reviewed_by=None, reviewed_at=None):
    """
    Saves a new code version. Auto-increments the version number for that component.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get current max version
    cursor.execute("""
        SELECT MAX(version) FROM code_repository 
        WHERE service_name = ? AND component_type = ?
    """, (service_name, component_type))
    max_ver = cursor.fetchone()[0]
    next_ver = 1 if max_ver is None else max_ver + 1
    
    now_str = datetime.datetime.utcnow().isoformat()
    
    cursor.execute("""
        INSERT INTO code_repository (
            account_id, service_name, component_type, version, code_content, 
            status, generated_by, reviewed_by, reviewed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        account_id, service_name, component_type, next_ver, code_content, 
        status, generated_by, reviewed_by, reviewed_at, now_str
    ))
    
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return next_ver, new_id

def get_latest_component_version(account_id, service_name, component_type):
    """
    Returns the latest version entry (regardless of approval status).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM code_repository
        WHERE service_name = ? AND component_type = ?
        ORDER BY version DESC LIMIT 1
    """, (service_name, component_type))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def get_latest_approved_component(account_id, service_name, component_type):
    """
    Returns the latest approved version of a component.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM code_repository
        WHERE service_name = ? AND component_type = ? AND status = 'approved'
        ORDER BY version DESC LIMIT 1
    """, (service_name, component_type))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None

def update_review_status(code_id, status, reviewer_id=None, override_code=None):
    """
    Updates the review status of a specific code record.
    If override_code is provided (e.g. manual edit during review), 
    we create a NEW version of that component and save it as pending_review or approved (FR-6.4).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM code_repository WHERE id = ?", (code_id,))
    row = cursor.fetchone()
    if not row:
        conn.close()
        raise ValueError(f"Code entry with ID {code_id} not found.")
    
    entry = dict(row)
    now_str = datetime.datetime.utcnow().isoformat()
    
    if override_code is not None and override_code != entry['code_content']:
        # Manual edit during review: creates a new version with status reset (FR-6.4)
        conn.close()
        # Create a new version as approved directly (if user is approving the edited version)
        # or pending_review depending on the flow. In FR-6.2: "Approve as-is, Edit then approve".
        # If "Edit then approve", status is 'approved', but it creates a new version.
        new_ver, new_id = save_code_version(
            account_id=entry['account_id'],
            service_name=entry['service_name'],
            component_type=entry['component_type'],
            code_content=override_code,
            status=status, # usually 'approved'
            generated_by='manual_edit',
            reviewed_by=reviewer_id,
            reviewed_at=now_str
        )
        return new_id, new_ver
    else:
        # Straight status update (Approve or Reject as-is)
        cursor.execute("""
            UPDATE code_repository
            SET status = ?, reviewed_by = ?, reviewed_at = ?
            WHERE id = ?
        """, (status, reviewer_id, now_str, code_id))
        conn.commit()
        conn.close()
        return code_id, entry['version']

def get_component_history(account_id, service_name, component_type):
    """
    Get full history of a service component (FR-5.4).
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT * FROM code_repository
        WHERE service_name = ? AND component_type = ?
        ORDER BY version DESC
    """, (service_name, component_type))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_all_services_code_status(account_id):
    """
    Returns an overview of the code generation and review status for each service.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Query distinct services in registry
    cursor.execute("SELECT service_name, supports_right_sizing FROM services_registry")
    services = cursor.fetchall()
    
    res = {}
    for s in services:
        name = s['service_name']
        supports = s['supports_right_sizing']
        
        # Get status of discovery, metric_identification, and metric_fetching
        statuses = {}
        for ctype in ['discovery', 'metric_identification', 'metric_fetching']:
            latest = get_latest_component_version(account_id, name, ctype)
            statuses[ctype] = {
                "version": latest['version'] if latest else None,
                "status": latest['status'] if latest else 'missing',
                "id": latest['id'] if latest else None
            }
            
        res[name] = {
            "supports_right_sizing": bool(supports),
            "components": statuses
        }
    conn.close()
    return res
