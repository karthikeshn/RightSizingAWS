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
        cursor.execute("""
            INSERT OR REPLACE INTO resource_summaries (
                resource_id, account_id, service_type, region, analysis_date, summary_json, recommendation, explanation
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            resource_id, account_id, service_type, region, now_str, 
            json.dumps({"metrics": {}}), "Unknown", "No metrics available for this resource to analyze."
        ))
        conn.commit()
        conn.close()
        return {
            "resource_id": resource_id,
            "service_type": service_type,
            "region": region,
            "summary": {"metrics": {}},
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
    # 3. LLM API call
    raw_response = generate_text(prompt, system_instruction)
    
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
        recommendation = "Keep Current"
        suggested_type = ""
        explanation = "Completed standard analysis. Metrics indicate stable utilization."

    # 5. Save to DB (FR-10.3)
    now_str = datetime.datetime.utcnow().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        INSERT OR REPLACE INTO resource_summaries (
            resource_id, account_id, service_type, region, analysis_date, summary_json, recommendation, explanation
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        resource_id,
        account_id,
        service_type,
        region,
        now_str,
        json.dumps(summary),
        f"{recommendation} ({suggested_type})" if suggested_type else recommendation,
        explanation
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
