import time
from locust import HttpUser, task, between, events
import random
import gevent # 导入 gevent 用于锁

# 用于生成唯一用户名，确保并发注册时用户名不重复
user_counter = 0
user_counter_lock = gevent.lock.Semaphore() # 使用gevent锁确保计数器线程安全

class RegisterUserOnly(HttpUser):
    # 待测试后端服务器的基准URL
    host = "http://localhost:8000"
    
    # 用户在执行其任务之间等待的时间。这里主要是为了避免 Locust 报错，
    # 因为注册只在 on_start 发生一次。
    wait_time = between(1, 2) 

    def on_start(self):
        """
        每个虚拟用户启动时执行一次。
        在这里，用户将尝试注册一个新的、唯一的用户名。
        """
        global user_counter
        with user_counter_lock:
            user_counter += 1
            # 使用时间戳、递增计数器和随机数组合，确保用户名尽可能唯一
            self.username = f"user_{int(time.time())}_{user_counter}_{random.randint(0, 99999)}"
        self.password = "password123"

        print(f"用户 {self.username} 启动，准备注册。")
        
        # 执行注册操作
        self.register_user()

    def register_user(self):
        """
        注册新用户。如果用户已存在 (400 Bad Request)，Locust 不会将其计为失败。
        """
        signup_payload = {
            "username": self.username,
            "password": self.password,
            "is_admin": False
        }
        try:
            # 使用 catch_response=True 来手动处理响应的成功/失败
            with self.client.post(
                "/api/auth/signup",
                json=signup_payload,
                name="/api/auth/signup [注册]", # 为方便统计，给请求命名
                catch_response=True # 捕获响应，手动判断是否成功
            ) as response:
                if response.status_code == 201:
                    response.success() # 明确标记为成功
                    print(f"用户 {self.username} 注册成功。")
                elif response.status_code == 400 and "用户名已存在" in response.text:
                    response.success() # 如果是用户已存在，也标记为成功，不计入失败
                    print(f"用户 {self.username} 注册尝试：用户名已存在，视为可接受。")
                else:
                    response.failure(f"注册失败：{response.status_code} - {response.text}") # 标记为失败
                    print(f"用户 {self.username} 注册失败：{response.status_code} - {response.text}")
        except Exception as e:
            # 捕获网络错误等，Locust 会自动将异常标记为失败
            print(f"注册用户 {self.username} 时发生网络错误或异常: {e}")

    @task(1) 
    def do_nothing_after_registration(self):
        """
        这是一个占位符任务。
        Locust 要求 HttpUser 至少有一个 @task 装饰的方法才能运行。
        注册操作在 on_start 中完成，这个任务只是让用户实例保持活跃，避免 Locust 报错。
        它不会影响注册的统计数据。
        """
        time.sleep(0.1) # 简单等待 0.1 秒，不消耗太多资源