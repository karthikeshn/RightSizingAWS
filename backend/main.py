import os
import sys
import datetime
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import json
from app.schemas.schema import (
    CloudConfigCreateSchema, RegistryUpdateSchema, CodeGenRequestSchema,
    CodeReviewRequestSchema, RunPipelineRequestSchema, ScanRequest
)
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
# Add the parent folder to path to resolve src imports properly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import get_db_connection
from app.models.schema import init_db
from app.services.aws_clients import query_cost_explorer_services, get_boto3_session
from app.services.filtration import process_active_services, get_registry, update_registry_service
from app.services.known_check import determine_service_status
from app.services.repository import (
    get_all_services_code_status, save_code_version, 
    get_latest_component_version, update_review_status, get_component_history,
    get_latest_code_for_service
)
from app.services.code_gen import generate_component_a, generate_component_b, generate_component_c
from app.services.execution import run_pipeline_for_service
from app.services.recommendation import get_saved_recommendations, generate_recommendation_for_resource, generate_recommendations_batch

# Initialize database
init_db()

app = FastAPI(title="AWS Right-Sizing Engine API")

# Configure CORS so developers can run frontend and backend separately if desired
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API Routes ---


# --- API Routes ---

def validate_aws_credentials(account_id: str) -> dict:
    from app.core.database import get_db_connection
    import botocore.exceptions
    
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT access_key, secret_key FROM cloud_configs WHERE account_id = ?", (account_id,))
        row = cursor.fetchone()
        
        if not row:
            raise HTTPException(status_code=404, detail="Cloud config not found")
            
        if row['access_key'] == 'mock' or row['secret_key'] == 'mock':
            status = "Connected"
        else:
            try:
                session = get_boto3_session(account_id)
                sts = session.client('sts')
                sts.get_caller_identity()
                status = "Connected"
            except botocore.exceptions.ClientError as e:
                error_code = e.response.get('Error', {}).get('Code', 'Unknown')
                if error_code in ['ExpiredToken', 'ExpiredTokenException']:
                    status = "Token Expired"
                elif error_code in ['AuthFailure', 'InvalidClientTokenId', 'AccessDenied', 'UnrecognizedClientException']:
                    status = "Incorrect Credentials"
                else:
                    status = f"Connection Failed: {error_code}"
            except Exception as e:
                status = f"Connection Failed: {str(e)}"
                
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        cursor.execute("UPDATE cloud_configs SET status = ?, last_verified_at = ? WHERE account_id = ?", (status, now, account_id))
        conn.commit()
    finally:
        conn.close()
    
    return {"status": status, "last_verified_at": now}

@app.get("/api/discovery/active-services")
def get_active_services(account_id: Optional[str] = Query(None), lookback_days: int = 30):
    """
    Module 1 & 2: Cost Explorer discovery - Fetched from cache.
    """
    if not account_id:
        return {"active_services": [], "unclassified_services": [], "last_scanned": None}

    from app.core.database import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM billing_service_cache WHERE account_id = ?", (account_id,))
    rows = cursor.fetchall()
    conn.close()

    all_services = []
    last_scanned = None
    for row in rows:
        all_services.append({
            "service_name": row["service_name"],
            "original_name": row["original_name"],
            "region": row["region"],
            "status": row["status"]
        })
        if not last_scanned:
            last_scanned = row["last_scanned"]
            
    return {
        "active_services": all_services,
        "unclassified_services": [],
        "last_scanned": last_scanned
    }

@app.post("/api/discovery/scan")
def scan_active_services(data: ScanRequest):
    """
    Perform a live Cost Explorer query and update the cache.
    """
    val_result = validate_aws_credentials(data.account_id)
    if val_result["status"] != "Connected":
        raise HTTPException(status_code=403, detail=f"Credential validation failed: {val_result['status']}")

    raw_ce_results = query_cost_explorer_services(data.lookback_days, data.account_id)
    all_services = process_active_services(raw_ce_results)
    
    # Enrich with Known/New status based on mapping
    for item in all_services:
        item['status'] = "Known Service" if item['is_known'] else "New Service"
        
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    from app.core.database import get_db_connection
    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Clear old cache
        cursor.execute("DELETE FROM billing_service_cache WHERE account_id = ?", (data.account_id,))
        
        # Insert new cache
        for item in all_services:
            cursor.execute("""
                INSERT INTO billing_service_cache (account_id, service_name, original_name, region, status, last_scanned)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                data.account_id,
                item["service_name"],
                item.get("original_name", item["service_name"]),
                item["region"],
                item["status"],
                now
            ))
            
            # Auto-populate registry with default supports_right_sizing = 0
            cursor.execute("""
                INSERT OR IGNORE INTO services_registry (service_name, supports_right_sizing)
                VALUES (?, 0)
            """, (item["service_name"],))
            
        conn.commit()
    finally:
        conn.close()

    return {"message": "Scan completed successfully", "services_count": len(all_services), "last_scanned": now}

@app.get("/api/services/summary")
def get_services_summary(account_id: Optional[str] = Query(None), lookback_days: int = 30):
    """
    Returns an aggregated summary of active, supported services from Cost Explorer
    merged with DB statistics (resources count, candidates count, region breakdown).
    """
    raw_ce_results = query_cost_explorer_services(lookback_days, account_id)
    all_services = process_active_services(raw_ce_results)
    filtered = [s for s in all_services if s['is_known']]
    
    from app.core.database import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch global resource counts and candidate counts scoped by account_id
    if account_id is not None:
        cursor.execute("""
            SELECT service_type, 
                   COUNT(*) as total_resources,
                   SUM(CASE WHEN recommendation NOT LIKE 'Keep Current%' THEN 1 ELSE 0 END) as total_candidates
            FROM resource_summaries
            WHERE account_id = ?
            GROUP BY service_type
        """, (account_id,))
    else:
        cursor.execute("""
            SELECT service_type, 
                   COUNT(*) as total_resources,
                   SUM(CASE WHEN recommendation NOT LIKE 'Keep Current%' THEN 1 ELSE 0 END) as total_candidates
            FROM resource_summaries
            GROUP BY service_type
        """)
    db_totals = {row['service_type']: (row['total_resources'], row['total_candidates']) for row in cursor.fetchall()}
    
    # Fetch region-specific counts scoped by account_id
    if account_id is not None:
        cursor.execute("""
            SELECT service_type, region,
                   COUNT(*) as res_count,
                   SUM(CASE WHEN recommendation NOT LIKE 'Keep Current%' THEN 1 ELSE 0 END) as cand_count
            FROM resource_summaries
            WHERE account_id = ?
            GROUP BY service_type, region
        """, (account_id,))
    else:
        cursor.execute("""
            SELECT service_type, region,
                   COUNT(*) as res_count,
                   SUM(CASE WHEN recommendation NOT LIKE 'Keep Current%' THEN 1 ELSE 0 END) as cand_count
            FROM resource_summaries
            GROUP BY service_type, region
        """)
    db_regions = {}
    for row in cursor.fetchall():
        s_type = row['service_type']
        if s_type not in db_regions:
            db_regions[s_type] = {}
        db_regions[s_type][row['region']] = {
            "resources": row['res_count'],
            "candidates": row['cand_count']
        }
    
    conn.close()
    
    # Group filtered Cost Explorer services by unique service_name
    services_map = {}
    for item in filtered:
        sname = item['service_name']
        region = item['region']
        cost = item['cost']
        
        if sname not in services_map:
            services_map[sname] = {
                "service_name": sname,
                "status": determine_service_status(account_id, sname),
                "total_cost": 0.0,
                "regions_data": {} # region -> cost
              }
        services_map[sname]["total_cost"] += cost
        services_map[sname]["regions_data"][region] = services_map[sname]["regions_data"].get(region, 0.0) + cost
        
    # Also ensure any service in db_totals (e.g. EC2, RDS) is present in services_map
    for sname in db_totals:
        if sname not in services_map:
            services_map[sname] = {
                "service_name": sname,
                "status": determine_service_status(account_id, sname),
                "total_cost": 0.0,
                "regions_data": {}
            }
            
    # Assemble the final list
    summary_list = []
    for sname, info in services_map.items():
        res_total, cand_total = db_totals.get(sname, (0, 0))
        
        # Merge regions from Cost Explorer billing and database summaries
        all_regions = set(info["regions_data"].keys())
        if sname in db_regions:
            all_regions.update(db_regions[sname].keys())
            
        regions_list = []
        for reg in all_regions:
            db_reg_info = db_regions.get(sname, {}).get(reg, {"resources": 0, "candidates": 0})
            reg_cost = info["regions_data"].get(reg, 0.0)
            regions_list.append({
                "region": reg,
                "resources": db_reg_info["resources"],
                "candidates": db_reg_info["candidates"],
                "cost": reg_cost
            })
            
        summary_list.append({
            "service_name": sname,
            "status": info["status"],
            "total_cost": info["total_cost"],
            "regions_count": len(all_regions),
            "resources_count": res_total,
            "candidates_count": cand_total,
            "regions": regions_list
        })
        
    return summary_list

@app.get("/api/registry")
def get_services_registry():
    """
    Module 2: Return current registry configuration.
    """
    return get_registry()

@app.post("/api/registry")
def update_registry(data: RegistryUpdateSchema):
    """
    Module 2: Update supports_right_sizing flag for a service.
    """
    update_registry_service(data.service_name, data.supports_right_sizing)
    return {"message": f"Registry updated for {data.service_name}"}

# --- Cloud Config endpoints (Module 0) ---

@app.get("/api/config")
def get_configs():
    """
    Retrieve all registered cloud configurations.
    """
    from app.core.database import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT account_id as id, provider, account_name, region, use_iam_role, 
               access_key, session_token, assume_role_arn, external_id, status, last_verified_at 
        FROM cloud_configs
    """)
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/config")
def create_config(data: CloudConfigCreateSchema):
    """
    Register a new cloud configuration.
    """
    # Fetch AWS Account ID immediately
    import boto3
    try:
        if data.access_key == 'mock' or data.secret_key == 'mock':
            account_id = "mock-account"
        else:
            if data.use_iam_role:
                session = boto3.Session(region_name=data.region)
            else:
                session = boto3.Session(
                    aws_access_key_id=data.access_key,
                    aws_secret_access_key=data.secret_key,
                    aws_session_token=data.session_token,
                    region_name=data.region
                )
            if data.assume_role_arn:
                sts = session.client('sts')
                assume_kwargs = {
                    'RoleArn': data.assume_role_arn,
                    'RoleSessionName': 'VerificationSession'
                }
                if data.external_id:
                    assume_kwargs['ExternalId'] = data.external_id
                assumed = sts.assume_role(**assume_kwargs)
                credentials = assumed['Credentials']
                session = boto3.Session(
                    aws_access_key_id=credentials['AccessKeyId'],
                    aws_secret_access_key=credentials['SecretAccessKey'],
                    aws_session_token=credentials['SessionToken'],
                    region_name=data.region
                )
            sts = session.client('sts')
            identity = sts.get_caller_identity()
            account_id = identity.get('Account')
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to verify credentials with STS: {e}")
        
    from app.core.database import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if account_id already exists
    cursor.execute("SELECT account_id FROM cloud_configs WHERE account_id = ?", (account_id,))
    if cursor.fetchone():
        cursor.execute("""
            UPDATE cloud_configs SET
                provider = ?, account_name = ?, region = ?, use_iam_role = ?,
                access_key = ?, secret_key = ?, session_token = ?, assume_role_arn = ?, external_id = ?, status = 'Connected', last_verified_at = ?
            WHERE account_id = ?
        """, (
            data.provider, data.account_name, data.region, data.use_iam_role,
            data.access_key, data.secret_key, data.session_token, data.assume_role_arn, data.external_id, datetime.datetime.now(datetime.timezone.utc).isoformat(),
            account_id
        ))
        msg = "Cloud config updated for account."
    else:
        cursor.execute("""
            INSERT INTO cloud_configs (
                account_id, provider, account_name, region, use_iam_role, access_key, secret_key, session_token, assume_role_arn, external_id, status, last_verified_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Connected', ?)
        """, (
            account_id, data.provider, data.account_name, data.region, data.use_iam_role,
            data.access_key, data.secret_key, data.session_token, data.assume_role_arn, data.external_id, datetime.datetime.now(datetime.timezone.utc).isoformat()
        ))
        msg = "Cloud config created."
        
    conn.commit()
    conn.close()
    return {"message": msg, "id": account_id}

@app.post("/api/config/{account_id}/validate")
def validate_config(account_id: str):
    """
    Manually validate AWS credentials.
    """
    return validate_aws_credentials(account_id)

@app.delete("/api/config/{account_id}")
def delete_config(account_id: str):
    """
    Delete a cloud configuration.
    """
    from app.core.database import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cloud_configs WHERE account_id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"message": f"Cloud config {account_id} deleted."}



@app.get("/api/code/latest/{service_name}")
def get_latest_service_code(service_name: str, account_id: str = Query(...)):
    """
    Returns the latest code for all components of a service.
    """
    res = get_latest_code_for_service(account_id, service_name)
    return {"components": res}

@app.get("/api/code/status")
def get_code_status_summary(account_id: Optional[str] = Query(None)):
    """
    Returns the code version and review status for each service.
    """
    return get_all_services_code_status(account_id)

@app.post("/api/code/generate")
def generate_service_code(data: CodeGenRequestSchema):
    """
    Module 4: Generates discovery, metric ID list, and metric fetching code templates.
    Saves them as pending_review version 1.
    """
    service = data.service_name
    account_id = data.account_id
    
    try:
        # Generate discovery
        code_a = generate_component_a(service)
        # Generate metrics JSON config
        code_b = generate_component_b(service)
        # Generate fetching code
        code_c = generate_component_c(service)
        
        # Save to DB as pending_review
        _, id_a = save_code_version(account_id, service, "discovery", code_a, "pending_review", "AI-Generator")
        _, id_b = save_code_version(account_id, service, "metric_identification", code_b, "pending_review", "AI-Generator")
        _, id_c = save_code_version(account_id, service, "metric_fetching", code_c, "pending_review", "AI-Generator")
        
        return {
            "service_name": service,
            "components": {
                "discovery": {"id": id_a, "code": code_a, "status": "pending_review"},
                "metric_identification": {"id": id_b, "code": code_b, "status": "pending_review"},
                "metric_fetching": {"id": id_c, "code": code_c, "status": "pending_review"}
            }
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Code generation failed: {e}")

@app.get("/api/code/history/{service_name}/{component_type}")
def get_code_history(service_name: str, component_type: str, account_id: Optional[str] = Query(None)):
    """
    Module 5: Returns the complete audit version history for a service component.
    """
    if component_type not in ["discovery", "metric_identification", "metric_fetching"]:
        raise HTTPException(status_code=400, detail="Invalid component type.")
    return get_component_history(account_id, service_name, component_type)

@app.post("/api/code/review")
def review_service_code(data: CodeReviewRequestSchema):
    """
    Module 6: Approve, reject, or edit-then-approve a code component.
    """
    try:
        new_id, version = update_review_status(
            code_id=data.code_id,
            status=data.status,
            reviewer_id=data.reviewer_id,
            override_code=data.override_code
        )
        return {
            "message": "Review submitted successfully.",
            "code_id": new_id,
            "version": version,
            "status": data.status
        }
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Review update failed: {e}")

@app.post("/api/execution/run")
def run_service_execution(data: RunPipelineRequestSchema):
    """
    Module 7, 8, 9, 10: Run the right-sizing pipeline for a service and region.
    """
    # Verify credentials first
    val_result = validate_aws_credentials(data.account_id)
    if val_result["status"] != "Connected":
        raise HTTPException(
            status_code=403, 
            detail=f"Credential validation failed: {val_result['status']}. Please update your credentials."
        )

    # Verify the code is approved first
    status = determine_service_status(data.account_id, data.service_name)
    if status != "Known":
        raise HTTPException(
            status_code=400, 
            detail=f"Service {data.service_name} has unapproved components. Approve code before running execution."
        )

    import time
    import logging
    logger = logging.getLogger("pipeline")
    logger.setLevel(logging.DEBUG)
    # Add file handler to capture logs
    if not logger.handlers:
        fh = logging.FileHandler('pipeline.log')
        fh.setLevel(logging.DEBUG)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        fh.setFormatter(formatter)
        logger.addHandler(fh)

    def process_region(region):
        start_time = time.time()
        run_start_date_str = datetime.datetime.utcnow().isoformat()
        logger.info(f"[{region}] Started process_region")
        region_recommendations = []
        # Run execution pipeline (discovers resources, fetches metrics, saves to store)
        result = run_pipeline_for_service(
            account_id=data.account_id,
            service_name=data.service_name,
            region=region,
            lookback_days=data.lookback_days
        )
        
        if result["status"] == "failed":
            raise Exception(result.get('error', 'Unknown error'))
            
        resources_analyzed = len(result["resources"])
        logger.info(f"[{region}] Discovered {resources_analyzed} resources. Starting LLM generation...")
        
        def process_batch(batch):
            batch_start = time.time()
            try:
                results = generate_recommendations_batch(
                    account_id=data.account_id,
                    resources_batch=batch,
                    service_type=data.service_name,
                    region=region,
                    lookback_days=data.lookback_days
                )
                logger.info(f"[{region}] Batch of {len(batch)} finished in {time.time() - batch_start:.2f}s")
                return results
            except Exception as e:
                logger.error(f"[{region}] Error processing batch: {e}")
                return []

        # Chunk into batches of 5
        batch_size = 5
        resource_batches = [result["resources"][i:i + batch_size] for i in range(0, len(result["resources"]), batch_size)]
        
        t_llm_start = time.time()
        with ThreadPoolExecutor(max_workers=min(10, max(1, len(resource_batches)))) as executor:
            future_to_batch = {executor.submit(process_batch, batch): batch for batch in resource_batches}
            for future in as_completed(future_to_batch):
                recs = future.result()
                if recs:
                    region_recommendations.extend(recs)
        llm_duration = time.time() - t_llm_start
            
        # Garbage Collection: Delete ghost records not updated during this run
        from app.core.database import get_db_connection
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                DELETE FROM resource_summaries 
                WHERE account_id = ? AND service_type = ? AND region = ? AND analysis_date < ?
            ''', (data.account_id, data.service_name, region, run_start_date_str))
            deleted_count = cursor.rowcount
            conn.commit()
            conn.close()
            logger.info(f"[{region}] Garbage collection removed {deleted_count} stale/ghost records.")
        except Exception as e:
            logger.error(f"[{region}] Error during garbage collection: {e}")
            
        logger.info(f"[{region}] Finished process_region in {time.time() - start_time:.2f}s")
        return region, resources_analyzed, region_recommendations, result.get("discovery_duration", 0), result.get("metrics_duration", 0), llm_duration

    import asyncio
    async def execution_generator():
        gen_start = time.time()
        start_time_iso = datetime.datetime.utcnow().isoformat() + "Z"
        
        # Initialize execution in DB
        from app.core.database import get_db_connection
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO pipeline_executions (account_id, service_name, start_time, status, total_regions, successful_regions, failed_regions, discovery_time_sec, metrics_time_sec, llm_time_sec)
            VALUES (?, ?, ?, 'Running', ?, 0, 0, 0.0, 0.0, 0.0)
        ''', (data.account_id, data.service_name, start_time_iso, len(data.regions)))
        execution_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        logger.info(f"Started execution_generator (execution_id={execution_id})")
        yield json.dumps({"type": "start", "regions": data.regions, "execution_id": execution_id}) + "\n"
        
        total_resources_analyzed = 0
        successful_regions = 0
        failed_regions = 0
        max_discovery = 0.0
        max_metrics = 0.0
        max_llm = 0.0
        
        max_workers = int(os.environ.get("MAX_WORKERS", 5))
        
        # We use asyncio.gather to run all regions concurrently without blocking the async generator loop
        submit_times = {}
        for region in data.regions:
            submit_times[region] = time.time()
            
        async def run_region_async(region):
            loop = asyncio.get_running_loop()
            return await loop.run_in_executor(None, process_region, region)

        tasks = [asyncio.create_task(run_region_async(region)) for region in data.regions]
        
        for task in asyncio.as_completed(tasks):
            try:
                region, resources_analyzed, _, d_dur, m_dur, l_dur = await task
                wait_time = time.time() - submit_times[region]
                logger.info(f"[{region}] Thread finished. Total time since submit: {wait_time:.2f}s")
                total_resources_analyzed += resources_analyzed
                successful_regions += 1
                max_discovery = max(max_discovery, d_dur)
                max_metrics = max(max_metrics, m_dur)
                max_llm = max(max_llm, l_dur)
                
                # We use the max duration across all concurrent regions to represent 
                # the wall-clock bottleneck for each pipeline phase.
                
                yield json.dumps({
                    "type": "region_complete", 
                    "region": region,
                    "status": "success",
                    "resources_analyzed": resources_analyzed
                }) + "\n"
            except Exception as exc:
                failed_regions += 1
                # Find which region failed if possible, but tasks lose context, so we might need a wrapper
                logger.error(f"Region generated an exception: {exc}")
                yield json.dumps({
                    "type": "region_complete",
                    "region": "unknown", # Hard to map without wrapper
                    "status": "error",
                    "error": str(exc)
                }) + "\n"
                
        duration_seconds = time.time() - gen_start
        status = "Completed" if failed_regions == 0 else ("Failed" if successful_regions == 0 else "Partial Success")
        end_time_iso = datetime.datetime.utcnow().isoformat() + "Z"
        
        # Update DB record with completion data
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE pipeline_executions
            SET end_time = ?, duration_seconds = ?, status = ?, successful_regions = ?, failed_regions = ?, discovery_time_sec = ?, metrics_time_sec = ?, llm_time_sec = ?
            WHERE id = ?
        ''', (end_time_iso, duration_seconds, status, successful_regions, failed_regions, max_discovery, max_metrics, max_llm, execution_id))
        conn.commit()
        conn.close()
        
        logger.info(f"Finished execution_generator in {duration_seconds:.2f}s")
        yield json.dumps({"type": "finish", "total_resources": total_resources_analyzed, "execution_id": execution_id}) + "\n"

    return StreamingResponse(execution_generator(), media_type="application/x-ndjson")

@app.get("/api/executions/{account_id}/{service_name}")
def get_execution_history(account_id: str, service_name: str):
    """
    Fetch pipeline execution history for a service.
    """
    from app.core.database import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
        SELECT id, start_time, end_time, duration_seconds, status, total_regions, successful_regions, failed_regions, discovery_time_sec, metrics_time_sec, llm_time_sec
        FROM pipeline_executions
        WHERE account_id = ? AND service_name = ?
        ORDER BY start_time DESC
    ''', (account_id, service_name))
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.get("/api/recommendations")
def get_recommendations(account_id: Optional[str] = Query(None), service_name: Optional[str] = None, region: Optional[str] = None):
    """
    Module 10: Fetch list of recommendations, optionally filtered.
    """
    return get_saved_recommendations(account_id, service_name, region)

@app.get("/api/export/report")
def export_report(account_id: str, service_name: str, region: Optional[str] = None, rec_filter: Optional[str] = None):
    """
    Export Analysis Report as an Excel file.
    """
    from app.services.export_service import generate_export_workbook
    from fastapi.responses import StreamingResponse
    import datetime
    
    stream = generate_export_workbook(account_id, service_name, region, rec_filter)
    
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"RightSizing_Report_{service_name}_{account_id}_{timestamp}.xlsx"
    
    return StreamingResponse(
        iter([stream.getvalue()]), 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/metrics/{account_id}/{resource_id}")
def get_resource_metrics(account_id: str, resource_id: str, start_time: Optional[str] = None, end_time: Optional[str] = None):
    """
    Fetch raw metrics points for a resource.
    """
    from app.core.database import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT metric_name, timestamp, value, unit FROM metric_store WHERE account_id = ? AND resource_id = ?"
    params = [account_id, resource_id]
    
    if start_time:
        query += " AND timestamp >= ?"
        params.append(start_time)
    if end_time:
        query += " AND timestamp <= ?"
        params.append(end_time)
        
    query += " ORDER BY timestamp ASC"
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    return [dict(row) for row in rows]

@app.get("/api/analyzed-services")
def get_analyzed_services(account_id: str):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT DISTINCT service_name FROM pipeline_executions WHERE account_id = ?
        UNION
        SELECT DISTINCT service_type as service_name FROM resource_summaries WHERE account_id = ?
    """, (account_id, account_id))
    rows = cursor.fetchall()
    conn.close()
    return [row['service_name'] for row in rows]

# --- Static Front-End Server ---

# Find the frontend directory relative to this file
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend")

# Serve index.html explicitly on the root URL
@app.get("/")
def get_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "API is running. Frontend build is empty or not yet generated."}

# Mount static files at / so they can be accessed directly (e.g. /css/styles.css)
# Register this at the end so it doesn't hijack /api/* routes
if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")
else:
    print(f"Warning: Frontend directory '{FRONTEND_DIR}' does not exist yet. Please create it.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
