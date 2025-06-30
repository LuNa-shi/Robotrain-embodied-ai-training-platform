# API配置说明

## 概述

本项目已配置好与后端API的通信，支持前后端跨域运行，支持开发环境和生产环境的不同配置。

## 当前配置的API接口

### 1. 登录接口
- **路径**: `POST /api/auth/login`
- **功能**: 用户登录，获取JWT token
- **请求体**:
  ```json
  {
    "username": "admin",
    "password": "admin"
  }
  ```
- **响应**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "isAdmin": true
    }
  }
  ```

### 2. 获取用户信息接口
- **路径**: `GET /user/{id}`
- **功能**: 根据用户ID获取用户详细信息
- **请求头**: `Authorization: Bearer <token>`
- **响应**:
  ```json
  {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "isAdmin": true,
    "email": "admin@example.com"
  }
  ```

### 3. 登出接口
- **路径**: `POST /api/auth/logout`
- **功能**: 用户登出
- **请求头**: `Authorization: Bearer <token>`
- **响应**:
  ```json
  {
    "message": "登出成功"
  }
  ```

## 环境配置

### 1. 环境变量配置

复制 `env.example` 文件为 `.env.local`，并根据实际情况修改：

```bash
# 后端API基础地址
VITE_API_BASE_URL=http://localhost:8080

# API请求超时时间（毫秒）
VITE_API_TIMEOUT=15000

# 是否启用跨域认证（true/false）
VITE_API_WITH_CREDENTIALS=false

# 开发环境是否使用模拟API（true/false）
VITE_USE_MOCK_API=true
```

### 2. 不同环境的配置示例

#### 开发环境（本地）
```bash
VITE_API_BASE_URL=http://localhost:8080
VITE_USE_MOCK_API=true
```

#### 开发环境（前后端分离）
```bash
VITE_API_BASE_URL=http://192.168.1.100:8080
VITE_USE_MOCK_API=false
```

#### 生产环境
```bash
VITE_API_BASE_URL=https://your-backend-domain.com
VITE_USE_MOCK_API=false
VITE_API_WITH_CREDENTIALS=true
```

### 3. 修改API地址

编辑 `src/config/api.js` 文件：

```javascript
const API_CONFIG = {
  // 开发环境API地址
  development: {
    baseURL: 'http://localhost:8080', // 修改为你的后端开发环境地址
    timeout: 15000,
    withCredentials: false,
  },
  
  // 生产环境API地址
  production: {
    baseURL: 'https://your-backend-domain.com', // 修改为你的生产环境API地址
    timeout: 15000,
    withCredentials: true,
  },
};
```

### 4. 修改API端点

如果需要修改API路径，编辑 `src/config/api.js` 文件中的 `API_ENDPOINTS`：

```javascript
export const API_ENDPOINTS = {
  auth: {
    login: '/api/auth/login',     // 修改登录接口路径
    logout: '/api/auth/logout',   // 修改登出接口路径
  },
  
  user: {
    getById: (id) => `/user/${id}`, // 修改获取用户信息接口路径
  },
};
```

## 跨域配置

### 1. 前端跨域配置

项目已自动配置跨域请求头：

```javascript
// 自动添加跨域请求头
config.headers['Access-Control-Allow-Origin'] = '*';
config.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
config.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
```

### 2. 后端CORS配置要求

后端需要配置CORS，允许前端域名访问：

```javascript
// Node.js Express 示例
const cors = require('cors');

app.use(cors({
  origin: [
    'http://localhost:5173',           // 前端开发环境
    'http://192.168.1.100:5173',      // 前端跨域开发环境
    'https://your-frontend-domain.com' // 前端生产环境
  ],
  credentials: true,                   // 允许跨域携带认证信息
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

```java
// Spring Boot 示例
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
                .allowedOrigins(
                    "http://localhost:5173",
                    "http://192.168.1.100:5173",
                    "https://your-frontend-domain.com"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }
}
```

## 环境切换

### 开发环境
- 默认使用模拟API进行测试
- 可通过环境变量 `VITE_USE_MOCK_API=false` 切换到真实API
- 无需启动后端服务（使用模拟API时）

### 生产环境
- 连接真实后端API
- 需要启动后端服务
- 确保API地址配置正确
- 需要HTTPS支持

## 网络错误处理

项目已配置完善的错误处理机制：

### 1. 网络连接错误
- 自动检测网络连接状态
- 显示友好的错误提示
- 支持重试机制

### 2. CORS错误
- 检测跨域请求失败
- 提示检查后端CORS配置
- 详细的错误日志

### 3. 认证错误
- 自动处理token过期
- 清除本地存储
- 跳转到登录页

### 4. 服务器错误
- 区分不同类型的服务器错误
- 友好的错误提示
- 支持错误重试

## 测试步骤

### 1. 开发环境测试
```bash
# 使用模拟API
npm run dev

# 使用真实API（需要启动后端）
VITE_USE_MOCK_API=false npm run dev
```

### 2. 跨域环境测试
```bash
# 设置后端地址
VITE_API_BASE_URL=http://192.168.1.100:8080
VITE_USE_MOCK_API=false
npm run dev
```

### 3. 生产环境测试
```bash
# 构建生产版本
npm run build

# 部署到服务器
# 确保后端API地址配置正确
```

## 故障排除

### 常见问题

1. **API连接失败**
   - 检查后端服务是否启动
   - 确认API地址和端口配置正确
   - 检查网络连接
   - 确认防火墙设置

2. **CORS错误**
   - 确认后端已配置CORS
   - 检查前端域名是否在后端CORS白名单中
   - 确认CORS配置包含正确的请求方法

3. **跨域认证失败**
   - 检查 `withCredentials` 配置
   - 确认后端CORS配置包含 `credentials: true`
   - 检查JWT token是否正确传递

4. **网络超时**
   - 增加 `VITE_API_TIMEOUT` 值
   - 检查网络延迟
   - 确认后端响应时间

### 调试方法

1. 打开浏览器开发者工具
2. 查看Network标签页的API请求
3. 检查请求和响应内容
4. 查看Console标签页的错误信息
5. 检查后端日志

## 注意事项

1. 确保后端API返回的用户信息包含 `isAdmin` 字段，用于权限控制
2. 生产环境必须使用HTTPS
3. JWT token应该设置合理的过期时间
4. 定期检查API接口的可用性
5. 跨域环境下需要特别注意CORS配置
6. 网络延迟较高时，考虑增加超时时间 