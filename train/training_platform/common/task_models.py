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

    # set save_freq manually
    def __init__(self, **data):
        super().__init__(**data)
        self.config["save_freq"] = int(self.config["steps"] / 4)

class EvaluationTask(BaseModel):
    task_id: int
    user_id: int
    model_uuid: str
    model_type: str
    env_config: Dict[str, Any]  # 环境配置
    eval_config: Dict[str, Any]  # 评估配置
    
    # 评估特定的配置
    seed: int = 1000
    max_episodes_rendered: int = 10
    return_episode_data: bool = False
    
    # 由 Scheduler 维护的状态
    status: str = "pending"  # pending, running, completed, failed
    eval_results: Optional[Dict[str, Any]] = None