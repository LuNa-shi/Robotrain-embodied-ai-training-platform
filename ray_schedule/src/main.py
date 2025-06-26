import ray
import time
import threading
from collections import deque

# 使用Ray共享对象来存储队列
@ray.remote
class SharedQueue:
    def __init__(self):
        self.queue = deque()
        self.counter = 1
    
    def submit_task(self, user):
        task = {
            'id': self.counter,
            'user': user,
            'status': 'queued',
            'last_run': 0
        }
        self.queue.append(task)
        self.counter += 1
        print(f"[提交] 用户{user} -> 任务{task['id']}")
        return task['id']
    
    def get_queue(self):
        return list(self.queue)
    
    def popleft(self):
        if self.queue:
            return self.queue.popleft()
        return None
    
    def append(self, task):
        self.queue.append(task)
    
    def clear(self):
        self.queue.clear()

@ray.remote
class TrainActor:
    def run(self, task):
        print(f"[训练] 任务{task['id']} 用户{task['user']} 开始训练...")
        time.sleep(2)  # 模拟训练
        print(f"[训练] 任务{task['id']} 用户{task['user']} 训练完成")
        return True

@ray.remote
class SchedulerActor:
    def __init__(self, shared_queue):
        self.running = True
        self.train_actor = TrainActor.remote()
        self.shared_queue = shared_queue

    def stop(self):
        self.running = False

    def schedule_loop(self):
        print("[调度器] 启动轮转调度...")
        while self.running:
            # 从共享队列获取任务
            task = ray.get(self.shared_queue.popleft.remote())
            if task is None:
                time.sleep(1)
                continue
            
            if task['status'] == 'queued':
                # 标记为运行中
                task['status'] = 'running'
                task['last_run'] = time.time()
                print(f"[调度] 分配任务{task['id']} 给训练Actor")
                
                # 训练
                ray.get(self.train_actor.run.remote(task))
                
                # 训练完后重新排队
                task['status'] = 'queued'
                ray.get(self.shared_queue.append.remote(task))
            else:
                # 理论上不会到这里
                ray.get(self.shared_queue.append.remote(task))
            time.sleep(0.5)

def get_queue_status(shared_queue):
    """获取队列状态"""
    queue = ray.get(shared_queue.get_queue.remote())
    status = []
    for task in queue:
        status.append(f"任务{task['id']}({task['status']})")
    return status

# 启动Ray
if __name__ == "__main__":
    ray.init(ignore_reinit_error=True)
    
    # 创建共享队列
    shared_queue = SharedQueue.remote()
    
    # 提交任务
    for u in range(1, 4):
        ray.get(shared_queue.submit_task.remote(u))
    
    # 启动调度器
    scheduler = SchedulerActor.remote(shared_queue)
    t = threading.Thread(target=lambda: ray.get(scheduler.schedule_loop.remote()))
    t.start()
    
    # 主线程监控队列
    try:
        for i in range(15):
            queue_status = get_queue_status(shared_queue)
            print(f"[主线程] 第{i+1}秒: 队列{queue_status}")
            time.sleep(0.5)
    finally:
        ray.get(scheduler.stop.remote())
        t.join()
        print("[主线程] 调度器已停止")
