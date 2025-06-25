import ray
import os
import time

# 1. 定义一个简单的远程函数 (Ray Task)
@ray.remote
def say_hello():
    # 这个函数将在Ray的某个Worker进程中执行
    return f"Hello from Ray! I am running on host: {os.uname().nodename}"

if __name__ == "__main__":
    # 从环境变量中获取Ray集群地址
    ray_address = os.getenv("RAY_ADDRESS", "ray://127.0.0.1:10001")
    
    print(f"Attempting to connect to Ray cluster at {ray_address}...")
    
    # 2. 初始化Ray，连接到由docker-compose启动的Ray集群
    # namespace用于逻辑隔离，是个好习惯
    ray.init(address=ray_address, namespace="wsl_demo")
    
    print("Successfully connected to Ray!")
    
    # 3. 远程调用函数。这是一个异步操作，会立即返回一个“未来对象”
    hello_future = say_hello.remote()
    
    # 4. 使用ray.get()来阻塞并获取实际的计算结果
    result = ray.get(hello_future)
    
    print("\n--- Ray Task Result ---")
    print(result)
    print("-----------------------\n")
    
    print("Demo finished successfully. Shutting down connection.")
    
    # 5. 关闭与Ray集群的连接
    ray.shutdown()