import json
import datetime
from src.llm_clients import generate_text
from src.services.summarization import summarize_resource_metrics, format_summary_to_text
from src.db import get_db_connection

def generate_recommendation_for_resource(account_id, resource_id, service_type, region, resource_capacity_type="N/A", lookback_days=30, metadata=None):
    if metadata is None:
        metadata = {}
    """
    Module 10: Feeds statistical summary to the LLM and parses recommendations.
    """
    # 1. Gather stats summary
    summary = summarize_resource_metrics(account_id, resource_id, service_type, region, lookback_days)
    if not summary or not summary.get("metrics"):
        now_str = datetime.datetime.utcnow().isoformat()
        conn = get_db_connection()
        cursor = conn.cursor()
        
        fallback_summary = {
            "metrics": {},
            "current_capacity": resource_capacity_type,
            "metadata": metadata
        }
        
        cursor.execute("""
            INSERT OR REPLACE INTO resource_summaries (
                resource_id, account_id, service_type, region, analysis_date, summary_json, recommendation, explanation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            resource_id, account_id, service_type, region, now_str, 
            json.dumps(fallback_summary), "Unknown", "No metrics available for this resource to analyze."
        ))
        conn.commit()
        conn.close()
        return {
            "resource_id": resource_id,
            "service_type": service_type,
            "region": region,
            "summary": fallback_summary,
            "recommendation": "Unknown",
            "suggested_type": "",
            "explanation": "No metrics available for this resource to analyze."
        }
        
    summary_text = format_summary_to_text(summary)
    
    # Embed current capacity so frontend can display it
    summary["current_capacity"] = resource_capacity_type
    
    # Store metadata in summary
    summary["metadata"] = metadata
    
    # Add current capacity if available
    summary_text += f"\nCurrent Capacity/Instance Type: {resource_capacity_type}"
    
    if metadata:
        summary_text += "\n\nResource Metadata (Consider this context for the recommendation):\n"
        for k, v in metadata.items():
            summary_text += f"- {k}: {v}\n"
    
    # 2. Build prompt
    system_instruction = (
        "You are an expert AWS FinOps Architect. You analyze CloudWatch resource utilization "
        "statistics and current resource size to generate a right-sizing recommendation. "
        "You must respond with a valid JSON object matching the requested schema."
    )
    
    prompt = f"""
Analyze the following AWS resource utilization summary and current size:

{summary_text}

Provide a right-sizing recommendation.
Choose one of these recommendation categories:
- 'Upsize' (if resources are heavily constrained, e.g., CPU regularly > 70% or near 100%)
- 'Downsize' (if resources are heavily underutilized, e.g., CPU average is very low and max is below 40%)
- 'Keep Current' (if utilization is healthy, e.g., CPU average is 20-50% and maxes occasionally)
- 'Recommend Specific Instance' (if a different family or specific instance type would fit the workload profile better, e.g., memory-optimized vs compute-optimized)

Your output must be a single, raw JSON object with the following keys. Do not include markdown code block formatting (like ```json).
{{
  "recommendation": "Upsize" | "Downsize" | "Keep Current" | "Recommend Specific Instance",
  "suggested_type": "string (the name of the suggested instance type or size class, e.g., 't3.medium', or empty if Keep Current)",
  "explanation": "string (a concise explanation of why this recommendation was made, citing CPU/Network/Memory stats from the summary)"
}}
"""
    import time
    import logging
    logger = logging.getLogger("pipeline")
    if not logger.handlers:
        fh = logging.FileHandler('pipeline.log')
        fh.setLevel(logging.DEBUG)
        formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
        fh.setFormatter(formatter)
        logger.addHandler(fh)
    # 3. LLM API call
    t_llm_start = time.time()
    try:
        raw_response = generate_text(prompt, system_instruction)
    except Exception as e:
        logger.error(f"[{region}] LLM API failed for {resource_id}: {e}")
        raw_response = "{}"
    t_llm_end = time.time()
    logger.debug(f"[{region}] LLM generate_text for {resource_id} took {t_llm_end - t_llm_start:.2f}s")
    
    # Clean the response to ensure JSON parsing succeeds
    raw_response = raw_response.strip()
    if raw_response.startswith("```"):
        # Strip markdown format
        match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw_response, re.DOTALL | re.IGNORECASE)
        if match:
            raw_response = match.group(1).strip()
            
    # Remove any stray JSON formatting issues
    if not raw_response.startswith("{") and "{" in raw_response:
        raw_response = raw_response[raw_response.find("{"):]
    if not raw_response.endswith("}") and "}" in raw_response:
        raw_response = raw_response[:raw_response.rfind("}")+1]

    # 4. Parse response
    try:
        rec_data = json.loads(raw_response)
        recommendation = rec_data.get("recommendation", "Keep Current")
        suggested_type = rec_data.get("suggested_type", "")
        explanation = rec_data.get("explanation", "Completed analysis based on statistics.")
    except Exception as e:
        print(f"Error parsing LLM recommendation JSON: {e}. Raw response: {raw_response}")
        # Graceful fallback
        recommendation = "Analysis Failed"
        suggested_type = ""
        explanation = f"LLM API failed or returned malformed JSON. {e}"

    # 5. Save to DB (FR-10.3)
    now_str = datetime.datetime.utcnow().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT OR REPLACE INTO resource_summaries (
            resource_id, account_id, service_type, region, analysis_date, summary_json, recommendation, explanation, raw_llm_response
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        resource_id,
        account_id,
        service_type,
        region,
        now_str,
        json.dumps(summary),
        f"{recommendation} ({suggested_type})" if suggested_type else recommendation,
        explanation,
        raw_response
    ))
    
    conn.commit()
    conn.close()
    
    return {
        "resource_id": resource_id,
        "service_type": service_type,
        "region": region,
        "summary": summary,
        "recommendation": recommendation,
        "suggested_type": suggested_type,
        "explanation": explanation
    }

def generate_recommendations_batch(account_id, resources_batch, service_type, region, lookback_days=30):
    """
    Module 10: Feeds statistical summary for a batch of resources to the LLM and parses recommendations.
    """
    import time
    import logging
    import re
    logger = logging.getLogger("pipeline")
    
    # 1. Gather stats summary for each resource
    summaries = []
    failed_summaries = [] # Resources with no metrics
    
    for res in resources_batch:
        resource_id = res["id"]
        resource_capacity_type = res.get("type", "N/A")
        metadata = res.get("metadata", {})
        
        summary = summarize_resource_metrics(account_id, resource_id, service_type, region, lookback_days)
        if not summary or not summary.get("metrics"):
            fallback_summary = {
                "metrics": {},
                "current_capacity": resource_capacity_type,
                "metadata": metadata
            }
            failed_summaries.append({
                "resource_id": resource_id,
                "summary": fallback_summary,
                "recommendation": "Unknown",
                "suggested_type": "",
                "explanation": "No metrics available for this resource to analyze.",
                "raw_llm_response": ""
            })
            continue
            
        summary_text = format_summary_to_text(summary)
        summary["current_capacity"] = resource_capacity_type
        summary["metadata"] = metadata
        
        summary_text += f"\nResource ID: {resource_id}\nCurrent Capacity/Instance Type: {resource_capacity_type}"
        if metadata:
            summary_text += "\nResource Metadata:\n"
            for k, v in metadata.items():
                summary_text += f"- {k}: {v}\n"
                
        summaries.append({
            "resource_id": resource_id,
            "summary_dict": summary,
            "summary_text": summary_text
        })
        
    if not summaries:
        now_str = datetime.datetime.utcnow().isoformat()
        conn = get_db_connection()
        cursor = conn.cursor()
        for f_res in failed_summaries:
            cursor.execute("""
                INSERT OR REPLACE INTO resource_summaries (
                    resource_id, account_id, service_type, region, analysis_date, summary_json, recommendation, explanation, raw_llm_response
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                f_res["resource_id"], account_id, service_type, region, now_str, 
                json.dumps(f_res["summary"]), f_res["recommendation"], f_res["explanation"], ""
            ))
        conn.commit()
        conn.close()
        return failed_summaries

    # 2. Build bulk prompt
    system_instruction = (
        "You are an expert AWS FinOps Architect. You analyze CloudWatch resource utilization "
        "statistics and current resource sizes for a batch of resources to generate right-sizing recommendations. "
        "You must respond with a JSON array containing one object for each resource."
    )
    
    combined_summary_text = "\n\n---\n\n".join([s["summary_text"] for s in summaries])
    
    prompt = f"""
Analyze the following AWS resource utilization summaries:

{combined_summary_text}

Provide a right-sizing recommendation for EACH resource.
Choose one of these recommendation categories: 'Upsize', 'Downsize', 'Keep Current', 'Recommend Specific Instance'

Your output must be a single raw JSON array containing exactly {len(summaries)} objects. Do not include markdown formatting.
[
  {{
    "resource_id": "string (MUST match the Resource ID provided)",
    "recommendation": "Upsize" | "Downsize" | "Keep Current" | "Recommend Specific Instance",
    "suggested_type": "string (suggested instance type, e.g., 't3.medium', or empty if Keep Current)",
    "explanation": "string (concise explanation citing stats)"
  }}
]
"""

    # 3. LLM API call
    t_llm_start = time.time()
    error_msg = ""
    raw_response = ""
    try:
        raw_response = generate_text(prompt, system_instruction)
        logger.debug(f"[{region}] LLM batch (size {len(summaries)}) took {time.time() - t_llm_start:.2f}s")
    except Exception as e:
        logger.error(f"[{region}] LLM API failed for batch: {e}")
        error_msg = str(e)
        raw_response = error_msg
        
    # Clean response
    if raw_response:
        raw_response = raw_response.strip()
        if raw_response.startswith("```"):
            match = re.match(r"^```(?:json)?\s*(.*?)\s*```$", raw_response, re.DOTALL | re.IGNORECASE)
            if match:
                raw_response = match.group(1).strip()
        if not raw_response.startswith("[") and "[" in raw_response:
            raw_response = raw_response[raw_response.find("["):]
        if not raw_response.endswith("]") and "]" in raw_response:
            raw_response = raw_response[:raw_response.rfind("]")+1]

    # 4. Parse response
    parsed_array = []
    try:
        if not raw_response:
            raise ValueError("Empty LLM response due to API Error.")
        parsed_array = json.loads(raw_response)
        if not isinstance(parsed_array, list):
            raise ValueError("LLM response is not a JSON array.")
    except Exception as e:
        logger.error(f"Error parsing bulk LLM response: {e}. Raw response: {raw_response}")
        parsed_array = []
        
    # Map parsed results back to resources
    parsed_dict = {item.get("resource_id"): item for item in parsed_array if isinstance(item, dict) and "resource_id" in item}
    
    final_results = []
    now_str = datetime.datetime.utcnow().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for s in summaries:
        res_id = s["resource_id"]
        llm_rec = parsed_dict.get(res_id)
        
        if llm_rec:
            recommendation = llm_rec.get("recommendation", "Keep Current")
            suggested_type = llm_rec.get("suggested_type", "")
            explanation = llm_rec.get("explanation", "Completed analysis based on statistics.")
        else:
            # Fallback if LLM failed or missed this resource
            recommendation = "Analysis Failed"
            suggested_type = ""
            explanation = f"LLM API failed or skipped this resource. {error_msg}"
            
        final_recommendation_string = f"{recommendation} ({suggested_type})" if suggested_type else recommendation
        
        cursor.execute("""
            INSERT OR REPLACE INTO resource_summaries (
                resource_id, account_id, service_type, region, analysis_date, summary_json, recommendation, explanation, raw_llm_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            res_id, account_id, service_type, region, now_str,
            json.dumps(s["summary_dict"]), final_recommendation_string, explanation, raw_response
        ))
        
        final_results.append({
            "resource_id": res_id,
            "service_type": service_type,
            "region": region,
            "summary": s["summary_dict"],
            "recommendation": recommendation,
            "suggested_type": suggested_type,
            "explanation": explanation,
            "raw_llm_response": raw_response
        })
        
    # Write any failed_summaries to DB if we had a mixed batch
    for f_res in failed_summaries:
        cursor.execute("""
            INSERT OR REPLACE INTO resource_summaries (
                resource_id, account_id, service_type, region, analysis_date, summary_json, recommendation, explanation, raw_llm_response
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            f_res["resource_id"], account_id, service_type, region, now_str, 
            json.dumps(f_res["summary"]), f_res["recommendation"], f_res["explanation"], ""
        ))
        
    conn.commit()
    conn.close()
    
    # Combine successful and failed metrics resources
    return failed_summaries + final_results

def get_saved_recommendations(account_id=None, service_name=None, region=None):
    """
    FR-10.4: Allow viewing recommendations, optionally grouped/filtered.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    
    query = "SELECT * FROM resource_summaries"
    params = []
    
    filters = []
    if account_id is not None:
        filters.append("account_id = ?")
        params.append(account_id)
    if service_name:
        filters.append("service_type = ?")
        params.append(service_name)
    if region:
        filters.append("region = ?")
        params.append(region)
        
    if filters:
        query += " WHERE " + " AND ".join(filters)
        
    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()
    
    results = []
    for r in rows:
        item = dict(r)
        # Parse nested stats JSON
        item['summary'] = json.loads(item['summary_json'])
        del item['summary_json']
        results.append(item)
    return results
import re # Make sure regex is available for clean
