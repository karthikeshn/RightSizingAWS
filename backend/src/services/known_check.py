from src.services.repository import get_latest_approved_component

def determine_service_status(account_id, service_name):
    """
    FR-3.1, FR-3.2, FR-3.3:
    Checks if a service is Known (has all 3 approved components) or New.
    """
    comp_a = get_latest_approved_component(account_id, service_name, "discovery")
    comp_b = get_latest_approved_component(account_id, service_name, "metric_identification")
    comp_c = get_latest_approved_component(account_id, service_name, "metric_fetching")
    
    # If any component is missing or not approved, we classify it as New (requires code generation/review)
    if comp_a and comp_b and comp_c:
        return "Known"
    return "New"
