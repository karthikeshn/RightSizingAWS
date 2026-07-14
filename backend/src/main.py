import os
import sys
import datetime
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, HTTPException, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
import json
from pydantic import BaseModel
from typing import List, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
# Add the parent folder to path to resolve src imports properly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.db import init_db
from src.aws_clients import query_cost_explorer_services, get_boto3_session
from src.services.filtration import process_active_services, get_registry, update_registry_service
from src.services.known_check import determine_service_status
from src.services.repository import (
    get_all_services_code_status, save_code_version, 
    get_latest_component_version, update_review_status, get_component_history
)
from src.services.code_gen import generate_component_a, generate_component_b, generate_component_c
from src.services.execution import run_pipeline_for_service
from src.services.recommendation import get_saved_recommendations, generate_recommendation_for_resource

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

# API Schemas
class CloudConfigCreateSchema(BaseModel):
    provider: str
    account_name: str
    region: str
    use_iam_role: bool
    access_key: Optional[str] = None
    secret_key: Optional[str] = None
    session_token: Optional[str] = None
    assume_role_arn: Optional[str] = None
    external_id: Optional[str] = None

class RegistryUpdateSchema(BaseModel):
    service_name: str
    supports_right_sizing: bool

class CodeGenRequestSchema(BaseModel):
    account_id: str
    service_name: str

class CodeReviewRequestSchema(BaseModel):
    code_id: int
    status: str # 'approved', 'rejected'
    reviewer_id: str
    override_code: Optional[str] = None

class RunPipelineRequestSchema(BaseModel):
    account_id: str
    service_name: str
    regions: List[str]
    lookback_days: Optional[int] = 30


# --- API Routes ---

def validate_aws_credentials(account_id: str) -> dict:
    from src.db import get_db_connection
    import botocore
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT access_key, secret_key FROM cloud_configs WHERE account_id = ?", (account_id,))
    row = cursor.fetchone()
    
    if not row:
        conn.close()
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
                status = "Credentials Expired"
            elif error_code in ['AuthFailure', 'InvalidClientTokenId', 'AccessDenied']:
                status = "Invalid Credentials"
            else:
                status = "Connection Failed"
        except Exception as e:
            status = "Connection Failed"
            
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    cursor.execute("UPDATE cloud_configs SET status = ?, last_verified_at = ? WHERE account_id = ?", (status, now, account_id))
    conn.commit()
    conn.close()
    
    return {"status": status, "last_verified_at": now}

@app.get("/api/discovery/active-services")
def get_active_services(account_id: Optional[str] = Query(None), lookback_days: int = 30):
    """
    Module 1 & 2: Cost Explorer discovery filtered against the registry.
    """
    if account_id:
        val_result = validate_aws_credentials(account_id)
        if val_result["status"] != "Connected":
            raise HTTPException(status_code=403, detail=f"Credential validation failed: {val_result['status']}")

    raw_ce_results = query_cost_explorer_services(lookback_days, account_id)
    all_services = process_active_services(raw_ce_results)
    
    # Enrich with Known/New status based on mapping
    for item in all_services:
        item['status'] = "Known Service" if item['is_known'] else "New Service"
        
    return {
        "active_services": all_services,
        "unclassified_services": []
    }

@app.get("/api/services/summary")
def get_services_summary(account_id: Optional[str] = Query(None), lookback_days: int = 30):
    """
    Returns an aggregated summary of active, supported services from Cost Explorer
    merged with DB statistics (resources count, candidates count, region breakdown).
    """
    raw_ce_results = query_cost_explorer_services(lookback_days, account_id)
    all_services = process_active_services(raw_ce_results)
    filtered = [s for s in all_services if s['is_known']]
    
    from src.db import get_db_connection
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
    from src.db import get_db_connection
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
        
    from src.db import get_db_connection
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
    from src.db import get_db_connection
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM cloud_configs WHERE account_id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"message": f"Cloud config {account_id} deleted."}




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

    def process_region(region):
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
        
        # Run recommendations for each successfully processed resource
        for res in result["resources"]:
            # Generate recommendations
            rec_result = generate_recommendation_for_resource(
                account_id=data.account_id,
                resource_id=res["id"],
                service_type=data.service_name,
                region=region,
                resource_capacity_type=res["type"],
                lookback_days=data.lookback_days,
                metadata=res.get("metadata", {})
            )
            region_recommendations.append(rec_result)
            
        return region, resources_analyzed, region_recommendations

    def execution_generator():
        yield json.dumps({"type": "start", "regions": data.regions}) + "\n"
        
        total_resources_analyzed = 0
        max_workers = int(os.environ.get("MAX_WORKERS", 5))
        
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            future_to_region = {executor.submit(process_region, region): region for region in data.regions}
            
            for future in as_completed(future_to_region):
                region = future_to_region[future]
                try:
                    _, resources_analyzed, _ = future.result()
                    total_resources_analyzed += resources_analyzed
                    yield json.dumps({
                        "type": "region_success", 
                        "region": region, 
                        "resources_analyzed": resources_analyzed
                    }) + "\n"
                except Exception as exc:
                    print(f"Region {region} generated an exception: {exc}")
                    yield json.dumps({
                        "type": "region_error", 
                        "region": region, 
                        "error": str(exc)
                    }) + "\n"

        yield json.dumps({"type": "complete", "total_resources": total_resources_analyzed}) + "\n"

    return StreamingResponse(execution_generator(), media_type="application/x-ndjson")

@app.get("/api/recommendations")
def get_recommendations(account_id: Optional[str] = Query(None), service_name: Optional[str] = None, region: Optional[str] = None):
    """
    Module 10: Fetch list of recommendations, optionally filtered.
    """
    return get_saved_recommendations(account_id, service_name, region)

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
