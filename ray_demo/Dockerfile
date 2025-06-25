# 使用一个轻量的官方Python 3.9镜像作为基础
FROM python:3.9-slim

# 设置工作目录，后续命令都在这个目录下执行
WORKDIR /app

# 安装Ray的核心库。"[default]"包含了推荐的依赖。
RUN pip install "ray[default]"

# 将我们的Python脚本复制到镜像中
COPY main.py .

# 设置容器启动时默认执行的命令
# 我们把它留空，因为docker-compose会覆盖这个命令
CMD ["echo", "Ray image ready."]