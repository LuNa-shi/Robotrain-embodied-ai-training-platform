FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /app

COPY requirements.txt .

ENV PYTHONUNBUFFERED=1 


# 替换为中科大 APT 源
# 注意：24.04 的代号是 noble
RUN sed -i 's|archive.ubuntu.com|mirrors.ustc.edu.cn|g' /etc/apt/sources.list && \
    sed -i 's|security.ubuntu.com|mirrors.ustc.edu.cn|g' /etc/apt/sources.list


# 安装系统依赖和编译工具
RUN apt-get update
RUN apt-get install -y gcc libc-dev make 
RUN apt-get install -y libosmesa6-dev

RUN apt update && \
    apt install -y software-properties-common && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt update && \
    apt install -y python3.10 python3.10-venv python3.10-dev build-essential curl

# 创建并激活一个Python 3.10的虚拟环境
ENV VIRTUAL_ENV=/opt/venv
RUN python3.10 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# 设置pip使用中科大源
RUN pip config set global.index-url https://pypi.mirrors.ustc.edu.cn/simple

RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

RUN apt install -y mesa-common-dev \
    libosmesa6-dev \
    freeglut3-dev \
    libglvnd-dev \
    libgl1 \ 
    libglx-mesa0 libegl1 libx11-6 libxinerama1 libxrandr2 libxi6 libxcursor1


COPY . .

ENV PYTHONPATH=/app

CMD ["python", "run_platform.py"]