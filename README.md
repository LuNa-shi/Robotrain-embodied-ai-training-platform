# RoboTrain - 机器人云端训练平台前端

## 📖 项目简介

RoboTrain 是一个基于 React + Vite 构建的现代化机器人云端训练平台前端应用。该平台提供了完整的机器人训练数据管理、训练过程监控、结果分析等功能，支持多用户协作和权限管理。

## ✨ 功能特性

### 🔐 用户认证与权限管理
- **JWT 认证系统**：基于 localStorage 的持久化登录状态
- **角色权限控制**：支持管理员和普通用户两种角色
- **路由保护**：自动重定向未认证用户到登录页
- **安全登出**：支持安全退出和会话清理

### 📊 数据管理
- **数据上传**：支持机器人训练数据的上传和管理
- **数据记录**：查看和管理历史数据记录
- **数据管理**：管理员专用的数据管理功能

### 🤖 训练管理
- **训练记录**：查看所有训练任务的历史记录
- **训练详情**：详细的训练过程监控和结果分析
- **训练管理**：管理员专用的训练任务管理功能

### 🎨 用户界面
- **响应式设计**：适配不同屏幕尺寸的设备
- **现代化 UI**：基于 Ant Design 5.x 的优雅界面
- **中文本地化**：完整的中文界面支持
- **侧边栏导航**：可收缩的侧边栏导航菜单

### 📈 数据可视化
- **图表展示**：基于 ECharts 的数据可视化
- **实时监控**：训练过程的实时数据展示
- **结果分析**：训练结果的详细分析报告

## 🛠️ 技术栈

### 核心框架
- **React 19.1.0** - 现代化的 React 框架
- **Vite 6.3.5** - 快速的构建工具
- **React Router DOM 7.6.2** - 客户端路由管理

### 状态管理
- **Redux Toolkit 2.8.2** - 现代化的 Redux 状态管理
- **React Redux 9.2.0** - React 与 Redux 的集成

### UI 组件库
- **Ant Design 5.26.1** - 企业级 UI 设计语言
- **Ant Design Icons 6.0.0** - 丰富的图标库

### 工具库
- **Axios 1.10.0** - HTTP 客户端
- **Day.js 1.11.13** - 轻量级日期处理库
- **ECharts 5.6.0** - 数据可视化图表库
- **ECharts for React 3.0.2** - React 版本的 ECharts

### 开发工具
- **ESLint 9.25.0** - 代码质量检查
- **Less 4.3.0** - CSS 预处理器

## 🚀 快速开始

### 环境要求
- Node.js >= 18.0.0
- npm >= 8.0.0 或 yarn >= 1.22.0

### 安装依赖
```bash
# 克隆项目
git clone <repository-url>
cd robotrain

# 安装依赖
npm install
# 或使用 yarn
yarn install
```

### 环境配置
```bash
# 复制环境配置文件
cp env.example .env.local

# 编辑环境配置
vim .env.local
```

### 开发环境运行
```bash
# 启动开发服务器
npm run dev
# 或使用 yarn
yarn dev
```

开发服务器将在 `http://localhost:5173` 启动，支持热重载。

### 生产环境构建
```bash
# 构建生产版本
npm run build
# 或使用 yarn
yarn build

# 预览生产版本
npm run preview
# 或使用 yarn
yarn preview
```

### 代码检查
```bash
# 运行 ESLint 检查
npm run lint
# 或使用 yarn
yarn lint
```

## 📁 项目结构

```
robotrain/
├── public/                 # 静态资源
│   └── logo.svg           # 项目 Logo
├── src/                   # 源代码目录
│   ├── assets/            # 静态资源
│   │   └── styles/        # 全局样式
│   ├── components/        # 公共组件
│   ├── config/            # 配置文件
│   │   └── routes.jsx     # 路由配置
│   ├── hooks/             # 自定义 Hooks
│   │   └── useAuth.js     # 认证 Hook
│   ├── layouts/           # 布局组件
│   │   ├── BasicLayout.jsx    # 主布局
│   │   └── BlankLayout.jsx    # 空白布局
│   ├── pages/             # 页面组件
│   │   ├── Home/          # 首页（数据上传）
│   │   ├── User/          # 用户相关页面
│   │   ├── Profile/       # 个人资料
│   │   ├── Settings/      # 系统设置
│   │   ├── DataManagement/    # 数据管理
│   │   ├── DataRecords/       # 数据记录
│   │   ├── TrainingManagement/    # 训练管理
│   │   ├── TrainingRecords/       # 训练记录
│   │   ├── TrainingDetail/        # 训练详情
│   │   ├── Help/          # 帮助文档
│   │   └── NotFound/      # 404 页面
│   ├── store/             # Redux 状态管理
│   │   └── slices/        # Redux 切片
│   ├── utils/             # 工具函数
│   │   ├── api.js         # API 配置
│   │   ├── auth.js        # 认证工具
│   │   └── mockApi.js     # 模拟 API
│   ├── App.jsx            # 根组件
│   └── main.jsx           # 应用入口
├── .env.example           # 环境配置示例
├── .gitignore             # Git 忽略文件
├── eslint.config.js       # ESLint 配置
├── index.html             # HTML 模板
├── jsconfig.json          # JavaScript 配置
├── package.json           # 项目依赖
├── vite.config.js         # Vite 配置
└── README.md              # 项目说明
```

## 🔧 配置说明

### 环境变量配置

复制 `env.example` 文件为 `.env.local`，并根据实际情况修改：

```bash
# 后端API基础地址
VITE_API_BASE_URL=http://localhost:8080

# API请求超时时间（毫秒）
VITE_API_TIMEOUT=15000

# 是否启用跨域认证
VITE_API_WITH_CREDENTIALS=false

# 开发环境是否使用模拟API
VITE_USE_MOCK_API=true
```

### API 配置

项目支持多种环境配置：

- **开发环境（本地）**：`http://localhost:8080`
- **开发环境（跨域）**：`http://192.168.1.100:8080`
- **生产环境**：`https://your-backend-domain.com`

### 路由配置

项目使用 React Router 进行路由管理，主要路由包括：

- `/user/login` - 用户登录
- `/user/register` - 用户注册
- `/home` - 首页（数据上传）
- `/data-records` - 数据记录
- `/training-records` - 训练记录
- `/training-records/:id` - 训练详情
- `/data-management` - 数据管理（管理员）
- `/training-management` - 训练管理（管理员）
- `/profile` - 个人资料
- `/settings` - 系统设置
- `/help` - 帮助文档

## 🔐 认证系统

### 测试账号

**开发环境**：
- 管理员：用户名 `admin`，密码 `admin`
- 普通用户：用户名 `user`，密码 `user`

**生产环境**：需要连接真实的后端 API，测试账号由后端提供。

### 权限控制

- **普通用户**：可以访问数据上传、数据记录、训练记录、个人资料、系统设置
- **管理员**：除普通用户权限外，还可以访问数据管理、训练管理功能

## 📚 相关文档

- [API 配置说明](./API_CONFIG_README.md) - 详细的 API 配置和使用说明
- [JWT 认证系统说明](./JWT_AUTH_README.md) - JWT 认证系统的详细说明

## 🐛 故障排除

### 常见问题

1. **登录失败**
   - 检查用户名密码是否正确
   - 检查网络连接
   - 查看浏览器控制台错误信息
   - 确认后端 API 地址配置正确

2. **API 连接失败**
   - 检查后端服务是否启动
   - 确认 API 地址和端口配置
   - 检查 CORS 配置

3. **权限不足**
   - 检查用户角色
   - 确认是否有管理员权限

### 调试技巧

1. 查看 localStorage 中的 token 和用户信息
2. 检查 Redux 状态
3. 查看网络请求和响应
4. 使用浏览器开发者工具
5. 检查后端日志

## 🤝 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 项目 Issues：[GitHub Issues](https://github.com/your-repo/robotrain/issues)
- 邮箱：your-email@example.com

---

**RoboTrain** - 让机器人训练更简单、更高效！ 🤖✨
