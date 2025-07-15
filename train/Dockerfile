# 使用 python:3.10-slim-buster 作为基础镜像
FROM python:3.10-slim-buster

# 设置工作目录
WORKDIR /app

# 设置 Python 输出不缓冲，便于实时查看日志
ENV PYTHONUNBUFFERED=1

# 将 DEBIAN_FRONTEND 设置为 noninteractive，避免安装过程中出现交互式提示
ENV DEBIAN_FRONTEND=noninteractive

# --- 关键修复：更新 Debian Buster 的软件源到归档地址 ---
# Debian 10 "Buster" 已停止支持，源已移至 archive
# 我们将 sources.list 直接替换为正确的归档源内容
RUN echo "deb http://archive.debian.org/debian/ buster main" > /etc/apt/sources.list && \
    echo "deb http://archive.debian.org/debian/ buster-updates main" >> /etc/apt/sources.list && \
    echo "deb http://archive.debian.org/debian-security/ buster/updates main" >> /etc/apt/sources.list

# 更新软件源并安装所有必需的系统依赖
RUN apt-get update -o Acquire::Check-Valid-Until=false && \
    apt-get install -y --no-install-recommends \
    # --- 编译工具 ---
    gcc \
    libc-dev \
    make \
    # --- 核心渲染依赖，解决 MuJoCo OpenGL 问题 ---
    xvfb \
    libgl1-mesa-glx \
    libgl1-mesa-dri \
    libglew-dev \
    libegl1-mesa \
    libx11-6 \
    libxinerama1 \
    libxrandr2 \
    libxi6 \
    libxcursor1 \
    libxrender-dev \
    # --- 视频录制依赖 ---
    ffmpeg \
    # --- 清理 apt 缓存，减小镜像体积 ---
    && rm -rf /var/lib/apt/lists/*

# 复制 requirements.txt
COPY requirements.txt .

# 使用国内源安装 Python 依赖（这里可以保留阿里云源，通常不受影响）
RUN pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
RUN pip install \
    --no-cache-dir \
    -r requirements.txt \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com

# 复制项目代码
COPY . .

# 定义启动命令，由 docker-compose.yml 覆盖
CMD ["python", "run_platform.py"]