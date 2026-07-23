import boto3
from datetime import datetime, timedelta, timezone

def fetch_metrics(session, region, resource_id, metrics, start_time, end_time):
    cloudwatch = session.client("cloudwatch", region_name=region)
    metric_data_queries = []
    for i, metric in enumerate(metrics):
        metric_data_queries.append({
            "Id": f"m{i}",
            "MetricStat": {
                "Metric": {
                    "Namespace": "AWS/Lambda",
                    "MetricName": metric,
                    "Dimensions": [{"Name": "FunctionName", "Value": resource_id}]
                },
                "Period": 3600,
                "Stat": "Average" if metric != "Invocations" else "Sum"
            },
            "ReturnData": True
        })
    response = cloudwatch.get_metric_data(
        MetricDataQueries=metric_data_queries,
        StartTime=start_time,
        EndTime=end_time,
        ScanBy="TimestampAscending"
    )
    results = []
    for i, metric in enumerate(metrics):
        metric_result = response["MetricDataResults"][i]
        for ts, value in zip(metric_result["Timestamps"], metric_result["Values"]):
            results.append({
                "metric_name": metric,
                "timestamp": ts.isoformat(),
                "value": value
            })
    return results

if __name__ == "__main__":
    session = boto3.Session(profile_name="default")
    metrics_list = ["Invocations", "Duration", "Errors", "Throttles", "ConcurrentExecutions"]
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(days=30)
    
    test_functions = [
        "cwsyn-qa-statuspage-7e44027a-84ab-4f7c-9ec2-e153da1d5d14",
        "SRE_CloudTrialEventCreate_Notifier",
        "delete-name-tags-us-east-2-8941-818am"
    ]
    
    print("Testing metrics for 'Unknown' resources...")
    for fn in test_functions:
        try:
            metrics = fetch_metrics(session, "us-east-2", fn, metrics_list, start_time, end_time)
            print(f"Function: {fn}")
            print(f"  Total Data Points: {len(metrics)}")
            if metrics:
                # aggregate locally
                invocations = sum(m['value'] for m in metrics if m['metric_name'] == 'Invocations')
                print(f"  Total Invocations: {invocations}")
        except Exception as e:
            print(f"Error fetching for {fn}: {e}")
