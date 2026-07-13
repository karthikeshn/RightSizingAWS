from src.db import get_db_connection
from src.services.service_mapping import SERVICE_MAPPING

def get_registry():
    """
    FR-2.1: Get the current service right-sizing registry.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM services_registry")
    rows = cursor.fetchall()
    conn.close()
    return {r['service_name']: bool(r['supports_right_sizing']) for r in rows}

def update_registry_service(service_name, supports):
    """
    FR-2.3: Edit registry service status.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO services_registry (service_name, supports_right_sizing)
        VALUES (?, ?)
    """, (service_name, int(supports)))
    conn.commit()
    conn.close()

def map_ce_service_to_registry(ce_service_name):
    """
    Fuzzy maps Cost Explorer service strings to registry keys using a dictionary.
    """
    name = ce_service_name.lower()
    for key, mapped_name in SERVICE_MAPPING.items():
        if key in name:
            return mapped_name
    return None

def process_active_services(ce_results):
    """
    Process cost explorer results without filtering.
    Attaches an is_known flag and standardized name.
    """
    all_services = []
    
    for item in ce_results:
        ce_name = item['service']
        reg_key = map_ce_service_to_registry(ce_name)
        
        is_known = reg_key is not None
        service_name_to_use = reg_key if is_known else ce_name
        
        all_services.append({
            "service_name": service_name_to_use,
            "original_name": ce_name,
            "region": item['region'],
            "is_known": is_known
        })
            
    return all_services