import ray
import asyncio
from ray.job_submission import JobSubmissionClient, JobStatus

# 假设DB操作已封装好
from .database import get_next_job_in_queue, update_job_status, update_job_checkpoint

@ray.remote
class RoundRobinScheduler:
    def __init__(self, ray_dashboard_url: str):
        self.client = JobSubmissionClient(ray_dashboard_url)
        self.running_job_id = None
        self.QUANTUM_STEPS = 5000  # 每个任务一次运行的步数

    async def schedule_loop(self):
        while True:
            # 如果当前没有任务在运行，则尝试调度一个新任务
            if self.running_job_id is None:
                job_to_run = get_next_job_in_queue() # 从PostgreSQL获取最久未运行的任务
                if job_to_run:
                    print(f"Scheduler: Starting job {job_to_run.id}")
                    # 提交一个新的Ray Job
                    entrypoint = f"python train.py --config {job_to_run.config_path}"
                    self.running_job_id = self.client.submit_job(
                        entrypoint=entrypoint,
                        job_id=str(job_to_run.id)
                    )
                    update_job_status(job_to_run.id, "running")

            # 如果有任务在运行，则监控它的进度
            else:
                status = self.client.get_job_status(self.running_job_id)

                if status in {JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.STOPPED}:
                    print(f"Scheduler: Job {self.running_job_id} finished with status {status}.")
                    update_job_status(self.running_job_id, status.lower())
                    self.running_job_id = None # 标记为无任务运行
                    continue # 立刻进入下一个调度循环

                # 检查训练步数是否达到时间片
                # (这需要训练脚本通过`train.report`汇报步数，并通过Ray API查询)
                current_steps = self.get_job_progress(self.running_job_id) 
                if current_steps >= self.QUANTUM_STEPS:
                    print(f"Scheduler: Job {self.running_job_id} reached its quantum. Stopping...")
                    self.client.stop_job(self.running_job_id)
                    # 停止后，job的状态会变为STOPPED，下一个循环会处理
            
            await asyncio.sleep(10) # 每10秒检查一次