import os
import time
from dotenv import load_dotenv
import boto3
import threading

load_dotenv()

class RateLimiter:
    def __init__(self, max_calls, period):
        self.max_calls = max_calls
        self.period = period
        self.calls = []
        self.lock = threading.Lock()

    def wait(self):
        sleep_time = 0
        with self.lock:
            now = time.time()
            # Remove calls older than the period
            self.calls = [t for t in self.calls if now - t < self.period]
            
            if len(self.calls) >= self.max_calls:
                # Calculate how long this thread needs to sleep
                sleep_time = self.period - (now - self.calls[0])
                if sleep_time > 0:
                    self.calls.append(now + sleep_time)
                else:
                    self.calls.append(now)
            else:
                self.calls.append(now)
                
        # Sleep outside the lock so other threads can calculate their sleep times concurrently!
        if sleep_time > 0:
            time.sleep(sleep_time)

# Bedrock rate limiter (adjustable based on your account limits)
bedrock_rate_limiter = RateLimiter(max_calls=15, period=60)


def generate_text(prompt, system_instruction="", provider=None):
    """
    Generate text using Amazon Bedrock.
    Raises RuntimeError if AWS credentials for Bedrock are not configured.
    """
    bedrock_access_key = os.getenv("BEDROCK_AWS_ACCESS_KEY_ID")
    bedrock_secret_key = os.getenv("BEDROCK_AWS_SECRET_ACCESS_KEY")
    bedrock_region = os.getenv("BEDROCK_REGION", "us-east-1")
    # Defaulting to Claude 3.5 Sonnet as recommended
    model_id = os.getenv("BEDROCK_MODEL_ID", "anthropic.claude-3-5-sonnet-20240620-v1:0")

    if not bedrock_access_key or not bedrock_secret_key:
        raise RuntimeError(
            "No Bedrock credentials configured. "
            "Set BEDROCK_AWS_ACCESS_KEY_ID and BEDROCK_AWS_SECRET_ACCESS_KEY in backend/.env"
        )

    bedrock_session_token = os.getenv("BEDROCK_AWS_SESSION_TOKEN")

    # Initialize the Bedrock client using the dedicated account credentials
    client_kwargs = {
        'service_name': 'bedrock-runtime',
        'region_name': bedrock_region,
        'aws_access_key_id': bedrock_access_key,
        'aws_secret_access_key': bedrock_secret_key
    }
    
    # If a bedrock-specific session token is provided, use it.
    # Otherwise, explicitly set it to None to prevent boto3 from accidentally 
    # inheriting a temporary AWS_SESSION_TOKEN from the OS environment, which 
    # would cause an UnrecognizedClientException when paired with the bedrock access key.
    if bedrock_session_token:
        client_kwargs['aws_session_token'] = bedrock_session_token
    elif 'AWS_SESSION_TOKEN' in os.environ:
        client_kwargs['aws_session_token'] = None

    client = boto3.client(**client_kwargs)

    # Format the request using the modern Bedrock Converse API
    messages = [{"role": "user", "content": [{"text": prompt}]}]
    
    kwargs = {
        "modelId": model_id,
        "messages": messages,
        "inferenceConfig": {"temperature": 0.2}
    }
    
    # Add system instruction if provided
    if system_instruction:
        kwargs["system"] = [{"text": system_instruction}]

    last_exception = None
    
    # Retry logic (up to 3 attempts with exponential backoff)
    for attempt in range(3):
        try:
            # Enforce rate limits
            bedrock_rate_limiter.wait()
            
            # Call the model
            response = client.converse(**kwargs)
            return response['output']['message']['content'][0]['text']
            
        except Exception as e:
            last_exception = e
            err_msg = str(e)
            
            # If it's a fatal error (like AccessDenied or InvalidModel), don't retry
            if "AccessDeniedException" in err_msg or "ValidationException" in err_msg:
                break
                
            # For transient failures (503/429), back off and retry
            time.sleep(2 ** attempt)

    raise RuntimeError(f"Bedrock API call failed. Last error: {last_exception}")
