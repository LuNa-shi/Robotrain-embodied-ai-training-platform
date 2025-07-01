// 模拟API服务，用于开发阶段测试
// 在实际项目中，这些API应该由后端提供

// 模拟用户数据（不存储密码）
const mockUsers = [
  {
    id: 1,
    username: 'admin',
    role: 'admin',
    isAdmin: true,
    email: 'admin@example.com',
    avatar: '/avatar-admin.png'
  },
  {
    id: 2,
    username: 'user',
    role: 'user',
    isAdmin: false,
    email: 'user@example.com',
    avatar: '/avatar-user.png'
  }
];

// 模拟用户密码映射（仅用于开发测试）
const mockPasswords = {
  'admin': 'admin123',
  'user': 'user123'
};

// 模拟JWT生成函数
const generateMockJWT = (user) => {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    isAdmin: user.isAdmin,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24小时过期
  };
  
  // 简单的base64编码（实际项目中应该使用真实的JWT库）
  const encodedHeader = btoa(JSON.stringify(header));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = btoa('mock-signature'); // 模拟签名
  
  return `${encodedHeader}.${encodedPayload}.${signature}`;
};

// 模拟JWT验证函数
const verifyMockJWT = (token) => {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid token format');
    }
    
    const payload = JSON.parse(atob(parts[1]));
    const currentTime = Math.floor(Date.now() / 1000);
    
    if (payload.exp < currentTime) {
      throw new Error('Token expired');
    }
    
    return payload;
  } catch {
    throw new Error('Invalid token');
  }
};

// 模拟登录API
export const mockLoginAPI = async (username, password) => {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // 检查用户名是否存在
  const user = mockUsers.find(u => u.username === username);
  if (!user) {
    throw new Error('用户名或密码错误');
  }
  
  // 检查密码是否正确（仅用于开发测试）
  const expectedPassword = mockPasswords[username];
  if (password !== expectedPassword) {
    throw new Error('用户名或密码错误');
  }
  
  // 生成JWT token
  const token = generateMockJWT(user);
  
  // 返回用户信息和token（不包含密码）
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      isAdmin: user.isAdmin,
      email: user.email,
      avatar: user.avatar
    }
  };
};

// 模拟登出API
export const mockLogoutAPI = async () => {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // 在实际项目中，这里应该调用后端API来使token失效
  return { message: '登出成功' };
};

// 模拟获取当前用户信息API
export const mockGetCurrentUserAPI = async (token) => {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // 验证token
  const payload = verifyMockJWT(token);
  
  // 根据token中的用户ID查找用户
  const user = mockUsers.find(u => u.id === payload.userId);
  if (!user) {
    throw new Error('用户不存在');
  }
  
  // 返回用户信息（不包含密码）
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isAdmin: user.isAdmin,
    email: user.email,
    avatar: user.avatar
  };
};

// 模拟注册API
export const mockSignupAPI = async (username, password, isAdmin = false) => {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 800));
  
  // 验证用户名长度
  if (username.length > 50) {
    throw new Error('用户名不能超过50个字符');
  }
  
  // 验证用户名格式（不能为空或只包含空格）
  if (!username.trim()) {
    throw new Error('用户名不能为空');
  }
  
  // 验证密码长度
  if (password.length < 6) {
    throw new Error('密码长度至少6位');
  }
  
  // 检查用户名是否已存在
  const existingUser = mockUsers.find(u => u.username === username);
  if (existingUser) {
    throw new Error('用户名已存在，请选择其他用户名');
  }
  
  // 创建新用户（不存储密码到用户对象中）
  const newUser = {
    id: mockUsers.length + 1,
    username,
    role: isAdmin ? 'admin' : 'user',
    isAdmin,
    email: `${username}@example.com`,
    avatar: '/avatar-default.png'
  };
  
  // 添加到模拟用户列表
  mockUsers.push(newUser);
  
  // 仅在开发环境中存储密码映射（用于后续登录测试）
  if (process.env.NODE_ENV === 'development') {
    mockPasswords[username] = password;
  }
  
  // 返回用户信息（格式与后端API一致）
  return {
    id: newUser.id,
    username: newUser.username,
    is_admin: newUser.isAdmin,
    created_at: new Date().toISOString(),
    last_login: null
  };
}; 