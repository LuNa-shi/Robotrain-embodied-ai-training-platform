#!/usr/bin/env python3
"""
测试Ray调度器核心功能
"""

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'src'))

import ray
import time
from main import submit_task, task_queue, SchedulerActor, TrainActor

def test_basic_scheduling():
    """测试基本调度功能"""
    print("🧪 测试Ray调度器核心功能")
    print("=" * 50)
    
    # 初始化Ray
    ray.init(ignore_reinit_error=True)
    
    # 清空队列
    task_queue.clear()
    
    # 提交测试任务
    print("📝 提交测试任务...")
    for user in [1, 2, 3]:
        submit_task(user)
    
    print(f"✅ 已提交 {len(task_queue)} 个任务")
    print("初始队列:", [f"任务{t['id']}(用户{t['user']})" for t in list(task_queue)])
    
    # 创建调度器
    scheduler = SchedulerActor.remote()
    
    # 启动调度器（在后台线程）
    import threading
    def run_scheduler():
        ray.get(scheduler.schedule_loop.remote())
    
    scheduler_thread = threading.Thread(target=run_scheduler)
    scheduler_thread.daemon = True
    scheduler_thread.start()
    
    # 监控调度过程
    print("\n🔄 监控调度过程...")
    for i in range(15):
        current_tasks = list(task_queue)
        status_str = [f"任务{t['id']}({t['status']})" for t in current_tasks]
        print(f"第{i+1}秒: {status_str}")
        time.sleep(1)
    
    # 停止调度器
    ray.get(scheduler.stop.remote())
    print("\n✅ 测试完成")

def test_task_rotation():
    """测试任务轮转"""
    print("\n🔄 测试任务轮转机制")
    print("=" * 30)
    
    # 清空队列
    task_queue.clear()
    
    # 提交任务
    for user in [1, 2, 3]:
        submit_task(user)
    
    # 创建调度器
    scheduler = SchedulerActor.remote()
    
    # 启动调度器
    import threading
    def run_scheduler():
        ray.get(scheduler.schedule_loop.remote())
    
    scheduler_thread = threading.Thread(target=run_scheduler)
    scheduler_thread.daemon = True
    scheduler_thread.start()
    
    # 观察轮转
    print("观察任务轮转顺序...")
    for i in range(20):
        if task_queue:
            current_tasks = list(task_queue)
            task_ids = [t['id'] for t in current_tasks]
            print(f"第{i+1}秒: 队列中的任务ID: {task_ids}")
        time.sleep(1)
    
    # 停止调度器
    ray.get(scheduler.stop.remote())
    print("✅ 轮转测试完成")

if __name__ == "__main__":
    try:
        test_basic_scheduling()
        test_task_rotation()
    except KeyboardInterrupt:
        print("\n⏹️ 测试被用户中断")
    except Exception as e:
        print(f"\n❌ 测试出错: {e}")
    finally:
        if ray.is_initialized():
            ray.shutdown()
        print("🎯 测试结束")
