import math
import datetime
from src.services.metric_store import get_metric_points, get_metrics_for_resource

def calculate_slope(values):
    """
    Computes the linear regression slope for a list of numerical values.
    Returns: float (slope)
    
    Formula:
      m = (N * sum(xy) - sum(x)*sum(y)) / (N * sum(x^2) - sum(x)^2)
      where x is the index [0...N-1] and y is the metric value.
    """
    N = len(values)
    if N < 2:
        return 0.0
        
    sum_x = sum(range(N))
    sum_y = sum(values)
    sum_xx = sum(i * i for i in range(N))
    sum_xy = sum(i * val for i, val in enumerate(values))
    
    denominator = (N * sum_xx) - (sum_x * sum_x)
    if denominator == 0:
        return 0.0
        
    slope = (N * sum_xy - sum_x * sum_y) / denominator
    return slope

def calculate_std_dev(values, mean):
    """
    Computes standard deviation.
    """
    N = len(values)
    if N < 2:
        return 0.0
    variance = sum((x - mean) ** 2 for x in values) / (N - 1)
    return math.sqrt(variance)

def summarize_resource_metrics(account_id, resource_id, service_type, region, lookback_days=30):
    """
    FR-9.1, FR-9.2: Computes statistics for a resource over the lookback window.
    """
    end_time = datetime.datetime.utcnow()
    start_time = end_time - datetime.timedelta(days=lookback_days)
    
    start_str = start_time.isoformat()
    end_str = end_time.isoformat()
    
    metrics = get_metrics_for_resource(account_id, resource_id)
    
    summary = {
        "resource_id": resource_id,
        "service_type": service_type,
        "region": region,
        "lookback_days": lookback_days,
        "metrics": {}
    }
    
    for metric_name in metrics:
        points = get_metric_points(account_id, resource_id, metric_name, start_str, end_str)
        if not points:
            continue
            
        values = [p['value'] for p in points]
        unit = points[0]['unit']
        
        N = len(values)
        avg_val = sum(values) / N
        max_val = max(values)
        min_val = min(values)
        std_dev = calculate_std_dev(values, avg_val)
        
        # Trend calculation based on slope threshold
        slope = calculate_slope(values)
        # We classify trend as:
        # - 'Increasing' if slope is positive and relative change is meaningful (> 1% of average per day)
        # - 'Decreasing' if slope is negative and relative change is meaningful (< -1% of average per day)
        # - 'Stable' otherwise
        slope_threshold = 0.01 * (avg_val if avg_val > 0 else 1.0)
        if slope > slope_threshold:
            trend = "Increasing"
        elif slope < -slope_threshold:
            trend = "Decreasing"
        else:
            trend = "Stable"
            
        # Threshold checks (FR-9.1)
        # e.g., CPU Above 70%, CPU Below 20%
        days_above = 0
        days_below = 0
        
        if "cpu" in metric_name.lower():
            days_above = sum(1 for v in values if v > 70.0)
            days_below = sum(1 for v in values if v < 20.0)
        elif "connection" in metric_name.lower():
            days_above = sum(1 for v in values if v > 100.0)
            days_below = sum(1 for v in values if v < 5.0)
            
        summary["metrics"][metric_name] = {
            "average": round(avg_val, 2),
            "maximum": round(max_val, 2),
            "minimum": round(min_val, 2),
            "std_dev": round(std_dev, 2),
            "trend": trend,
            "days_above_threshold": days_above,
            "days_below_threshold": days_below,
            "unit": unit,
            "data_points_count": N
        }
        
    return summary

def format_summary_to_text(summary):
    """
    FR-9.2: Formats the summary into the requested structured text format.
    """
    lines = []
    lines.append(f"Resource: {summary['service_type']}")
    lines.append(f"Resource ID: {summary['resource_id']}")
    lines.append(f"Region: {summary['region']}")
    
    metrics = summary["metrics"]
    for mname, stats in metrics.items():
        unit_lbl = stats['unit']
        
        # Format metric text lines
        if "cpu" in mname.lower():
            lines.append(
                f"CPU: Average {stats['average']}{unit_lbl}, Maximum {stats['maximum']}{unit_lbl}, "
                f"Days below 20%: {stats['days_below_threshold']}, Days above 70%: {stats['days_above_threshold']}, "
                f"Trend: {stats['trend']}"
            )
        elif "network" in mname.lower():
            lines.append(
                f"Network {mname.replace('Network', '')}: Average {stats['average']} {unit_lbl}/day, "
                f"Maximum {stats['maximum']} {unit_lbl}/day, Trend: {stats['trend']}"
            )
        else:
            lines.append(
                f"{mname}: Average {stats['average']} {unit_lbl}, Maximum {stats['maximum']} {unit_lbl}, "
                f"Trend: {stats['trend']}"
            )
            
    return "\n".join(lines)
