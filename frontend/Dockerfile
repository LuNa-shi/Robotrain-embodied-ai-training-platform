FROM node:22-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json (或 yarn.lock)
# 这有助于利用 Docker 的构建缓存。如果依赖没有变化，npm install 步骤会更快。
COPY package*.json ./

# 安装项目依赖
# 对于 Alpine 镜像，如果需要一些原生模块，可能需要安装额外的包
RUN npm install --frozen-lockfile

# 复制所有项目文件到工作目录
COPY . .

RUN rm -rf node_modules/.vite

RUN npm run build

# 构建 Vite 应用
CMD ["npm", "run", "dev"]
