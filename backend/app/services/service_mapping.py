"""
Dictionary mapping common substrings or variations of AWS Cost Explorer service names
to our internal Right-Sizing system service names (e.g., EC2, RDS).
All keys should be lowercase for case-insensitive matching.
"""

SERVICE_MAPPING = {
    # EC2
    "elastic compute cloud": "EC2",
    "ec2": "EC2",
    
    # RDS
    "relational database": "RDS",
    "rds": "RDS",
    
    # ElastiCache
    "elasticache": "ElastiCache",
    
    # Lambda
    "lambda": "Lambda",
    
    # EBS
    "elastic block store": "EBS",
    "ebs": "EBS",
    
    # S3
    "simple storage service": "S3",
    "s3": "S3",
    
    # DynamoDB
    "dynamodb": "DynamoDB",
    
    # Redshift
    "redshift": "Redshift",
    
    # EKS
    "elastic kubernetes service": "EKS",
    "eks": "EKS",
    
    # ECS
    "elastic container service": "ECS",
    "ecs": "ECS",
    
    # OpenSearch / Elasticsearch
    "opensearch": "OpenSearch",
    "elasticsearch": "OpenSearch",
    
    # SageMaker
    "sagemaker": "SageMaker",

    # DocumentDB
    "documentdb": "DocumentDB",

    # EFS
    "elastic file system": "EFS",
    "efs": "EFS",
    
    # CloudFront
    "cloudfront": "CloudFront",

    # AWS Backup
    "aws backup": "Backup",
    "backup": "Backup",

    # AWS CloudShell
    "aws cloudshell": "CloudShell",
    "cloudshell": "CloudShell",

    # AWS CloudTrail
    "aws cloudtrail": "CloudTrail",
    "cloudtrail": "CloudTrail",

    # AWS Config
    "aws config": "Config",
    "config": "Config",

    # AWS Cost Explorer
    "aws cost explorer": "CostExplorer",
    "cost explorer": "CostExplorer",

    # AWS KMS
    "aws key management service": "KMS",
    "key management service": "KMS",
    "kms": "KMS",

    # AWS Secrets Manager
    "aws secrets manager": "SecretsManager",
    "secrets manager": "SecretsManager",

    # AWS Security Hub
    "aws security hub": "SecurityHub",
    "security hub": "SecurityHub",

    # AWS Step Functions
    "aws step functions": "StepFunctions",
    "step functions": "StepFunctions",

    # AWS Systems Manager
    "aws systems manager": "SSM",
    "systems manager": "SSM",
    "ssm": "SSM",

    # AWS WAF
    "aws waf": "WAF",
    "waf": "WAF",

    # AWS X-Ray
    "aws x-ray": "XRay",
    "x-ray": "XRay",

    # API Gateway
    "amazon api gateway": "APIGateway",
    "api gateway": "APIGateway",

    # Bedrock
    "amazon bedrock": "Bedrock",
    "bedrock": "Bedrock",

    # Amazon Connect
    "amazon connect": "Connect",
    "connect": "Connect",

    # Amazon Detective
    "amazon detective": "Detective",
    "detective": "Detective",

    # Elastic Load Balancing
    "amazon elastic load balancing": "ELB",
    "elastic load balancing": "ELB",
    "elastic load balancer": "ELB",

    # Amazon GuardDuty
    "amazon guardduty": "GuardDuty",
    "guardduty": "GuardDuty",

    # Amazon Q
    "amazon q": "AmazonQ",

    # Amazon Rekognition
    "amazon rekognition": "Rekognition",
    "rekognition": "Rekognition",

    # Route 53
    "amazon route 53": "Route53",
    "route 53": "Route53",

    # Simple Email Service
    "amazon simple email service": "SES",
    "simple email service": "SES",
    "ses": "SES",

    # Simple Notification Service
    "amazon simple notification service": "SNS",
    "simple notification service": "SNS",
    "sns": "SNS",

    # Simple Queue Service
    "amazon simple queue service": "SQS",
    "simple queue service": "SQS",
    "sqs": "SQS",

    # Virtual Private Cloud
    "amazon virtual private cloud": "VPC",
    "virtual private cloud": "VPC",
    "vpc": "VPC",

    # CloudWatch
    "amazoncloudwatch": "CloudWatch",
    "amazon cloudwatch": "CloudWatch",
    "cloudwatch": "CloudWatch",

    # CloudWatch Events
    "cloudwatch events": "EventBridge",
    "amazon eventbridge": "EventBridge",
    "eventbridge": "EventBridge",

    # Lightsail
    "amazon lightsail": "Lightsail",
    "lightsail": "Lightsail",
    }
