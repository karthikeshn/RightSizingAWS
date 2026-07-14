import re
import json
from src.llm_clients import generate_text

# Blocklist of mutating AWS API verbs (NFR-1 / FR-4.5)
MUTATING_BLOCKLIST = [
    "create_", "delete_", "terminate_", "modify_", "update_", 
    "put_", "run_", "start_", "stop_", "tag_", "untag_", 
    "reboot_", "authorize_", "revoke_", "associate_", 
    "disassociate_", "attach_", "detach_", "copy_", "purchase_"
]

def clean_llm_code(text):
    """
    Remove markdown code block wraps like ```python and ``` from the output.
    """
    match = re.search(r"```(?:python|json)?\s*(.*?)\s*```", text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()
    
    clean_lines = []
    for line in text.split("\n"):
        if line.strip() in ["```", "```python", "```json"]:
            continue
        clean_lines.append(line)
    return "\n".join(clean_lines).strip()

def validate_code_safety(code):
    """
    Enforce read-only constraint statically (FR-4.5).
    Raises ValueError if a blocked mutating AWS API call is detected.

    Uses AST parsing to traverse function and method calls. Falls back to a 
    method-call pattern `.<verb>word(` regex if AST parsing fails.
    """
    import ast
    try:
        tree = ast.parse(code)
        
        class SafetyVisitor(ast.NodeVisitor):
            def visit_Call(self, node):
                func = node.func
                func_name = None
                if isinstance(func, ast.Attribute):
                    func_name = func.attr
                elif isinstance(func, ast.Name):
                    func_name = func.id
                    
                if func_name:
                    func_name_lower = func_name.lower()
                    for verb in MUTATING_BLOCKLIST:
                        if func_name_lower.startswith(verb):
                            raise ValueError(
                                f"Static Analysis Warning: Potential mutation function '{verb}' detected. "
                                "Only read-only AWS operations are permitted."
                            )
                self.generic_visit(node)

        visitor = SafetyVisitor()
        visitor.visit(tree)
        return True
    except (SyntaxError, ValueError) as e:
        if isinstance(e, ValueError):
            raise e
        # Fallback to regex if parsing fails (e.g. invalid python syntax template)
        clean_lines = []
        for line in code.split("\n"):
            if line.strip().startswith("#"):
                continue
            clean_lines.append(line)

        scrubbed_code = "\n".join(clean_lines).lower()

        for verb in MUTATING_BLOCKLIST:
            pattern = r"\.\s*" + re.escape(verb) + r"\w*\s*\("
            if re.search(pattern, scrubbed_code):
                raise ValueError(
                    f"Static Analysis Warning: Potential mutation function '{verb}' detected. "
                    "Only read-only AWS operations are permitted."
                )
        return True

def generate_component_a(service_name):
    """
    FR-4.1: Component A - Resource Discovery Code
    """
    system_instruction = (
        "You are an AI coding assistant. You only output valid, clean Python code. "
        "Do not include any narrative explanations or markdown blocks in your response. "
        "The code must use only read-only AWS API actions. Any call to mutating, creating, "
        "updating, or deleting AWS resources is strictly forbidden."
    )
    
    prompt = f"""
Write a Python function called `discover_resources(session, region)` that discovers and lists all active resources for the AWS service '{service_name}' in the given region.
The function must accept:
- `session`: a boto3.Session object
- `region`: string representing the region (e.g. 'us-east-1')

The function must return a list of dictionaries, where each dictionary represents a resource and contains EXACTLY:
- `id`: The unique identifier for the resource (e.g. instance ID, DB identifier).
- `type`: The current capacity type of the resource (e.g. 't3.micro', 'db.r5.large').
- `metadata`: A dictionary containing ONLY the following properties: 'Name', 'Availability Zone', and 'Region'. Do not include any other extensive metadata.

CRITICAL INSTRUCTION 1: You must ONLY discover and return the PRIMARY resources for the selected service. For example, if the service is EC2, you must only return EC2 Instances. You MUST completely ignore and exclude dependent or related resources such as Security Groups, EBS Volumes, Network Interfaces, Elastic IPs, Key Pairs, Subnets, etc.

CRITICAL INSTRUCTION 2: You MUST use boto3 paginators (e.g. `get_paginator`) for all list and describe operations to ensure that ALL resources are fetched across all pages. Failure to use paginators will result in missing resources.

Ensure you only perform read-only actions (like describe_* or list_*). Do not use create, delete, update, put, or start/stop.
Return ONLY the python code.
"""
    raw_code = generate_text(prompt, system_instruction)
    cleaned_code = clean_llm_code(raw_code)
    
    # Run static validation
    validate_code_safety(cleaned_code)
    return cleaned_code

def generate_component_b(service_name):
    """
    FR-4.2: Component B - Metric Identification
    Returns a JSON string of relevant metrics
    """
    system_instruction = (
        "You are a Cloud Architect assistant. You output raw JSON lists containing strings only. "
        "Do not include any explanation or markdown formatting."
    )
    
    prompt = f"""
Identify the 3 to 5 most critical CloudWatch metric names that are essential for analyzing and right-sizing the AWS service: '{service_name}'.
For example, for EC2: ["CPUUtilization", "NetworkIn", "NetworkOut", "DiskReadBytes", "DiskWriteBytes"].
For RDS: ["CPUUtilization", "DatabaseConnections", "ReadIOPS", "WriteIOPS", "FreeStorageSpace"].

Respond with ONLY a raw JSON array of strings containing these exact metric names. Do not put markdown wrappers.
"""
    raw_json = generate_text(prompt, system_instruction)
    cleaned_json = clean_llm_code(raw_json)
    
    # Validate it's a list
    try:
        metrics = json.loads(cleaned_json)
        if not isinstance(metrics, list):
            raise ValueError()
        # Format back nicely
        return json.dumps(metrics)
    except Exception:
        # Fallback to defaults
        if service_name.upper() == "EC2":
            return '["CPUUtilization", "NetworkIn", "NetworkOut"]'
        elif service_name.upper() == "RDS":
            return '["CPUUtilization", "DatabaseConnections"]'
        return '["CPUUtilization"]'

def generate_component_c(service_name):
    """
    FR-4.3: Component C - Metric Fetching Code
    """
    system_instruction = (
        "You are an AI coding assistant. You only output valid, clean Python code. "
        "Do not include any narrative explanations or markdown blocks in your response. "
        "The code must use only read-only AWS API actions. Any call to mutating, creating, "
        "updating, or deleting AWS resources is strictly forbidden."
    )
    
    prompt = f"""
Write a Python function called `fetch_metrics(session, region, resource_id, metrics, start_time, end_time)` that fetches CloudWatch metric values for a specific resource of the AWS service '{service_name}'.
The function must accept:
- `session`: a boto3.Session object
- `region`: string (e.g. 'us-east-1')
- `resource_id`: string representing the AWS resource ID
- `metrics`: list of metric name strings (e.g. ['CPUUtilization'])
- `start_time`: datetime object (start of lookback window)
- `end_time`: datetime object (end of lookback window)

The function must call CloudWatch `get_metric_data` to fetch historical datapoints at a daily granularity (Period=86400).
It must parse the response and return a list of dictionaries with this exact schema:
[
  {{
    "timestamp": "2026-07-08T00:00:00Z", # ISO string format
    "value": 15.4, # float value
    "metric_name": "CPUUtilization",
    "unit": "Percent" # or relevant unit like Bytes, Count, etc. Fallback to 'None' if missing.
  }}
]

CRITICAL INSTRUCTIONS:
1. ALWAYS use the `get_paginator("get_metric_data")` paginator to fetch data. Never rely on a single response as it might be truncated.
2. For CloudWatch metric IDs in the queries, use a safe ID format (e.g., `f"m{{i}}"`) and maintain a mapping back to the metric name. Do not use the metric name directly as the ID, as CloudWatch imposes strict lowercase and character constraints.
3. Choose the most appropriate 'Stat' for the metric (e.g., 'Sum' for Invocations/Errors/Throttles, 'Average' for CPUUtilization/Duration, 'Maximum' for ConcurrentExecutions). Do not blindly use 'Average' or 'Sum' for everything.
4. Ensure all necessary modules (e.g., `from datetime import timedelta, timezone`) are imported if you perform date manipulations, but note that `start_time` and `end_time` are already provided as arguments. Do not use deprecated `datetime.utcnow()`.
5. The `Unit` field in CloudWatch results may be None. You must handle `None` values safely.

Ensure you only perform read-only actions (specifically get_metric_data). Ensure you handle potential empty results.
Return ONLY the python code.
"""
    raw_code = generate_text(prompt, system_instruction)
    cleaned_code = clean_llm_code(raw_code)
    
    # Run static validation
    validate_code_safety(cleaned_code)
    return cleaned_code
