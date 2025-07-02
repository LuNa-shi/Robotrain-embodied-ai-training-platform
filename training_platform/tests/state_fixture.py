# tests/state_fixture.py
import asyncio

class MultiTaskState:
    def __init__(self, task_ids: list[str]):
        self.task_ids = task_ids
        # 使用字典来分别存储每个任务的最新状态
        self.task_statuses = {task_id: "" for task_id in task_ids}
        # 使用字典来存储每个任务的状态变化历史
        self.status_history = {task_id: [] for task_id in task_ids}
        self.all_tasks_completed = asyncio.Event()

    def update_status(self, task_id: str, status: str):
        if task_id in self.task_statuses:
            # 只有在状态发生变化时才记录
            if self.task_statuses[task_id] != status:
                self.task_statuses[task_id] = status
                self.status_history[task_id].append(status)
                print(f"[STATE FIXTURE] Task {task_id} new status: {status}. History: {self.status_history[task_id]}")
        
        # 检查是否所有任务都已完成
        if all(s == "completed" for s in self.task_statuses.values()):
            if not self.all_tasks_completed.is_set():
                print("[STATE FIXTURE] All tasks have been completed!")
                self.all_tasks_completed.set()