FROM python:3.10-slim-buster

# 设置工作目录
WORKDIR /app

# 复制 requirements.txt 文件到工作目录
# 这一步是为了利用 Docker 缓存，如果 requirements.txt 没有变化，则不会重新安装依赖
COPY requirements.txt .
ENV PYTHONUNBUFFERED=1 

# 替换为阿里云 APT 镜像源
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list && \
    sed -i 's|security.debian.org|mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list

# 安装系统依赖和编译工具
RUN apt-get update
RUN apt-get install -y gcc libc-dev make 
# RUN apt-get install iputils-ping netcat curl
RUN rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
# 使用 --no-cache-dir 选项可以避免在镜像中保留 pip 缓存，进一步减小镜像大小
# 注意：这里我们假设 requirements.txt 中包含了 fastapi[standard]
RUN pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
RUN pip install --no-cache-dir -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com

# 复制整个应用程序代码到工作目录
# .dockerignore 文件可以帮助排除不必要的文件（如 .git, __pycache__）
COPY . .

# 暴露 FastAPI 应用程序将运行的端口
# FastAPI 默认运行在 8000 端口
EXPOSE 8000

# 定义容器启动时执行的命令
# fastapi dev main.py 会启动 FastAPI 应用并启用热重载
# 注意：在生产环境中，通常会使用 uvicorn main:app --host 0.0.0.0 --port 8000
# 因为 fastapi dev 主要是为开发便利性设计的
CMD ["fastapi", "dev", "app/main.py", "--host", "0.0.0.0"]