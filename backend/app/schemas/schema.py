from pydantic import BaseModel
from typing import List, Optional

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

class ScanRequest(BaseModel):
    account_id: str
    lookback_days: Optional[int] = 30

