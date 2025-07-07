# Pydantic models for task definitions # common/task_models.py
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional

class TrainingTask(BaseModel):
    task_id: int
    user_id: int
    dataset_uuid: str
    model_type: str
    config: Dict[str, Any]  # 对应 lerobot 的 TrainPipelineConfig 内容
    
    # 由 Scheduler 维护的状态
    current_step: int = 0
    status: str = "pending" # pending, running, paused, completed, failed