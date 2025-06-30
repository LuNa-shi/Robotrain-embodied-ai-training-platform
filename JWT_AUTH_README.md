# JWT认证系统说明

## 概述

本项目已集成JWT（JSON Web Token）认证系统，使用localStorage存储token，实现前后端分离的身份验证。

## 功能特性

- ✅ JWT token生成和验证
- ✅ localStorage持久化存储
- ✅ 自动token过期处理
- ✅ 路由保护
- ✅ 角色权限控制
- ✅ 开发环境模拟API
- ✅ Redux状态管理集成

## 文件结构

```
src/
├── utils/
│   ├── api.js          # axios配置和拦截器
│   ├── auth.js         # 认证相关工具函数
│   └── mockApi.js      # 开发环境模拟API
├── store/
│   └── slices/
│       └── userSlice.js # 用户状态管理
├── pages/
│   └── User/
│       └── Login.jsx   # 登录组件
└── config/
    └── routes.jsx      # 路由配置（含认证保护）
```

## 使用方法

### 1. 登录

```javascript
// 在登录组件中
import { useDispatch } from 'react-redux';
import { loginUser } from '@/store/slices/userSlice';

const dispatch = useDispatch();

const handleLogin = () => {
  dispatch(loginUser({
    username: 'admin',
    password: 'admin'
  }));
};
```

### 2. 登出

```javascript
// 在组件中
import { useDispatch } from 'react-redux';
import { logoutUser } from '@/store/slices/userSlice';

const dispatch = useDispatch();

const handleLogout = async () => {
  await dispatch(logoutUser()).unwrap();
  // 自动跳转到登录页
};
```

### 3. 检查认证状态

```javascript
import { useSelector } from 'react-redux';

const { userInfo, token } = useSelector((state) => state.user);
```

### 4. 路由保护

路由已自动配置认证保护，未登录用户会被重定向到登录页。

## 测试账号

### 开发环境
- **管理员**: 用户名 `admin`，密码 `admin`
- **普通用户**: 用户名 `user`，密码 `user`

### 生产环境
需要连接真实的后端API，测试账号由后端提供。

## API接口

### 登录接口
```
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin"
}

Response:
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

### 获取用户信息
```
GET /user/{id}
Authorization: Bearer <token>

Response:
{
  "id": 1,
  "username": "admin",
  "role": "admin",
  "isAdmin": true
}
```

### 登出接口
```
POST /api/auth/logout
Authorization: Bearer <token>

Response:
{
  "message": "登出成功"
}
```

## 环境配置

### 开发环境
- 使用模拟API进行测试
- 自动生成JWT token
- 无需后端服务
- API地址：`http://localhost:8080`

### 生产环境
- 连接真实后端API
- 需要配置正确的API地址
- 需要HTTPS支持
- API地址：`https://your-api-domain.com`

## 安全考虑

1. **HTTPS**: 生产环境必须使用HTTPS
2. **Token过期**: 设置合理的token过期时间
3. **XSS防护**: 注意localStorage的XSS风险
4. **CSRF防护**: 考虑添加CSRF token

## 扩展功能

### Token自动刷新
可以添加refresh token机制，在access token过期时自动刷新。

### 记住登录状态
可以添加"记住我"功能，延长token有效期。

### 多设备登录
可以实现多设备登录管理功能。

## 故障排除

### 常见问题

1. **登录失败**
   - 检查用户名密码是否正确
   - 检查网络连接
   - 查看浏览器控制台错误信息
   - 确认后端API地址配置正确

2. **Token过期**
   - 自动跳转到登录页
   - 清除localStorage中的token

3. **权限不足**
   - 检查用户角色
   - 确认是否有管理员权限

4. **API连接失败**
   - 检查后端服务是否启动
   - 确认API地址和端口配置
   - 检查CORS配置

### 调试技巧

1. 查看localStorage中的token和用户信息
2. 检查Redux状态
3. 查看网络请求和响应
4. 使用浏览器开发者工具
5. 检查后端日志

## 注意事项

1. 当前为开发环境，使用模拟API
2. 生产环境需要连接真实后端
3. JWT token包含敏感信息，注意安全
4. 定期更新依赖包以修复安全漏洞
5. 确保后端API返回的用户信息包含必要的字段（id, username, role, isAdmin） 