# 使用一个包含基础构建工具的 Python 镜像
FROM python:3.10-slim-buster

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PIP_USE_PEP517=1

# 更新 apt 源并安装基础依赖 (如编译工具、ffmpeg等)
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list && \
    sed -i 's|security.debian.org|mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# 更新 pip
RUN pip install --no-cache-dir --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/

# --- 核心步骤：安装 lerobot 和 training_platform ---

# 1. 先只复制定义依赖的文件，以便利用 Docker 缓存
COPY ./pyproject.toml ./pyproject.toml
COPY training_platform/requirements.txt ./training_platform/requirements.txt

# 2. 安装 lerobot 及其所有核心和测试依赖
#    pip 会读取 lerobot/pyproject.toml 文件
#    我们安装 lerobot 项目本身，并指定需要 'test' 组的可选依赖
#    这会自动安装 pytest, pyserial 等
RUN pip install --no-cache-dir "." \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --default-timeout=100 --retries 5

# 3. 安装 training_platform 的依赖
RUN pip install --no-cache-dir -r ./training_platform/requirements.txt \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --default-timeout=100 --retries 5

# 4. 复制所有项目代码
COPY . .

# 5. 设置 PYTHONPATH (虽然 pip install -e 的方式更好，但这个方式也兼容)
#    让 Python 能找到 lerobot 和 training_platform 这两个包
#    pip install ./lerobot 已经把 lerobot 装到 site-packages 了，
#    所以我们只需要确保 training_platform 能被找到。
ENV PYTHONPATH="/app:${PYTHONPATH}"

# 定义容器启动时执行的命令
CMD ["python3", "run_platform.py"]