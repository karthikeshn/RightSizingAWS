import datetime
import json
import traceback
from src.aws_clients import get_sandboxed_session, MutationAttemptException
from src.services.repository import get_latest_approved_component
from src.services.metric_store import save_metric_points

def filter_primary_resources(service_name, resources):
    """
    Filters the discovery results to return only primary resources for the selected service.
    Excludes dependent resources like Security Groups, EBS Volumes (unless service is EBS), 
    Elastic IPs, Network Interfaces, Key Pairs, etc.
    """
    filtered = []
    
    dependent_prefixes = (
        "sg-", "eni-", "eipalloc-", "eip-", "snap-", "ami-", 
        "rtb-", "vpc-", "subnet-", "igw-", "nat-", "acl-", "dopt-",
        "key-"
    )
    
    for res in resources:
        res_id = str(res.get('id', ''))
        res_id_lower = res_id.lower()
        
        if service_name == "EC2":
            if res_id_lower.startswith("i-"):
                filtered.append(res)
        elif service_name == "EBS":
            if res_id_lower.startswith("vol-"):
                filtered.append(res)
        else:
            if not res_id_lower.startswith(dependent_prefixes) and not res_id_lower.startswith("vol-"):
                filtered.append(res)
                
    return filtered

def execute_discovery(account_id, service_name, region):
    """
    FR-7.1: Executes approved Component A for the service/region.
    """
    comp_a = get_latest_approved_component(account_id, service_name, "discovery")
    if not comp_a:
        raise ValueError(f"No approved discovery code (Component A) found for service {service_name}")
    
    code = comp_a['code_content']
    
    # Executing within restricted sandbox
    local_env = {}
    try:
        # Compile and execute the function definition
        exec(code, {}, local_env)
        discover_fn = local_env.get("discover_resources")
        if not discover_fn:
            raise ValueError("Function 'discover_resources' was not defined in the code.")
        
        # Instantiate our sandboxed read-only session
        session = get_sandboxed_session(account_id)
        
        # Execute discovery
        resources = discover_fn(session, region)
        return resources
    except MutationAttemptException as me:
        print(f"MUTATION ALERT: {me}")
        raise
    except Exception as e:
        print(f"Error executing discovery code: {e}")
        traceback.print_exc()
        raise RuntimeError(f"Execution Error: {e}")

def execute_metric_fetching(account_id, service_name, region, resource_id, metrics, lookback_days=30):
    """
    FR-7.2: Executes approved Component C to fetch metrics.
    """
    comp_c = get_latest_approved_component(account_id, service_name, "metric_fetching")
    if not comp_c:
        raise ValueError(f"No approved metric fetching code (Component C) found for service {service_name}")
        
    code = comp_c['code_content']
    
    local_env = {}
    try:
        # Compile and execute
        exec(code, {}, local_env)
        fetch_fn = local_env.get("fetch_metrics")
        if not fetch_fn:
            raise ValueError("Function 'fetch_metrics' was not defined in the code.")
            
        session = get_sandboxed_session(account_id)
        
        # Compute start and end times
        end_time = datetime.datetime.utcnow()
        start_time = end_time - datetime.timedelta(days=lookback_days)
        
        # Execute metric fetch
        datapoints = fetch_fn(session, region, resource_id, metrics, start_time, end_time)
        return datapoints
    except MutationAttemptException as me:
        print(f"MUTATION ALERT during metric fetch: {me}")
        raise
    except Exception as e:
        print(f"Error fetching metrics for resource {resource_id}: {e}")
        traceback.print_exc()
        # FR-7.4: Log & return empty list so other resources/services continue
        return []

def run_pipeline_for_service(account_id, service_name, region, lookback_days=30):
    """
    Orchestrate Module 7: Run resource discovery, then metric fetching for discovered resources,
    and persist results.
    """
    import time
    import logging
    
    discovery_duration = 0.0
    metrics_duration = 0.0
    
    logger = logging.getLogger("pipeline")
    if not logger.handlers:
        fh = logging.FileHandler('pipeline.log')
        fh.setLevel(logging.DEBUG)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        fh.setFormatter(formatter)
        logger.addHandler(fh)

    # 1. Discover resources
    try:
        t0 = time.time()
        raw_resources = execute_discovery(account_id, service_name, region)
        t1 = time.time()
        discovery_duration = t1 - t0
        logger.debug(f"[{region}] execute_discovery took {discovery_duration:.2f}s")
        
        resources = filter_primary_resources(service_name, raw_resources)
        
        # Persist discovered resources
        t2 = time.time()
        now_str = datetime.datetime.utcnow().isoformat()
        from src.db import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        for r in resources:
            cursor.execute("""
                INSERT OR REPLACE INTO discovered_resources (
                    resource_id, account_id, service_type, region, resource_type, metadata_json, discovery_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                r.get('id', ''),
                account_id,
                service_name,
                region,
                r.get('type', ''),
                json.dumps(r.get('metadata', {})),
                now_str
            ))
        conn.commit()
        conn.close()
        t3 = time.time()
        logger.debug(f"[{region}] DB insert discovered resources took {t3 - t2:.2f}s")

    except Exception as e:
        # If discovery fails completely for a service, log it but let others run (FR-7.4)
        return {"status": "failed", "error": f"Discovery failed: {e}", "resources": []}
    
    # 2. Get the metrics list (Component B)
    comp_b = get_latest_approved_component(account_id, service_name, "metric_identification")
    if not comp_b:
        return {"status": "failed", "error": "No approved metric identification config (Component B) found.", "resources": []}
    
    try:
        metrics = json.loads(comp_b['code_content'])
    except Exception as e:
        return {"status": "failed", "error": f"Failed to parse metrics list: {e}", "resources": []}
        
    processed_resources = []
    
    # 3. For each resource, fetch metrics
    logger.info(f"[{region}] Starting metric fetching for {len(resources)} resources...")
    t_metrics_start = time.time()
    for res in resources:
        res_id = res['id']
        res_type = res['type']
        metadata = res.get('metadata', {})
        
        if not res_id:
            continue
            
        try:
            # Execute metric fetch (gracefully handles errors inside)
            t_fetch_start = time.time()
            datapoints = execute_metric_fetching(
                account_id=account_id,
                service_name=service_name,
                region=region,
                resource_id=res_id,
                metrics=metrics,
                lookback_days=lookback_days
            )
            t_fetch_end = time.time()
            logger.debug(f"[{region}] execute_metric_fetching for {res_id} took {t_fetch_end - t_fetch_start:.2f}s")
            
            # Save metrics to store (Module 8)
            if datapoints:
                t_save_start = time.time()
                save_metric_points(account_id, res_id, service_name, region, datapoints)
                t_save_end = time.time()
                logger.debug(f"[{region}] save_metric_points for {res_id} took {t_save_end - t_save_start:.2f}s")
                
            processed_resources.append({
                "id": res_id,
                "type": res_type,
                "metadata": metadata,
                "metrics_fetched": len(datapoints)
            })
            
        except Exception as e:
            # Catch-all to make sure next resource is processed
            print(f"Error in pipeline execution for resource {res_id}: {e}")
            
    t_metrics_end = time.time()
    metrics_duration = t_metrics_end - t_metrics_start
            
    return {
        "status": "success",
        "resources": processed_resources,
        "discovery_duration": discovery_duration,
        "metrics_duration": metrics_duration
    }

