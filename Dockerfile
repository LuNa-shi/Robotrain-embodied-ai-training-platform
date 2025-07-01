FROM python:3.10-slim-buster

WORKDIR /app

COPY requirements.txt .
ENV PYTHONUNBUFFERED=1 

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list && \
    sed -i 's|security.debian.org|mirrors.aliyun.com/debian-security|g' /etc/apt/sources.list
# 安装系统依赖和编译工具
RUN apt-get update
RUN apt-get install -y gcc libc-dev make 
# RUN apt-get install iputils-ping netcat curl
RUN rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com
RUN pip install \
    --default-timeout=100 \
    --resume-retries=5\
    --no-cache-dir \
    -r requirements.txt \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com

COPY . .

CMD ["python", "run_platform.py"]
