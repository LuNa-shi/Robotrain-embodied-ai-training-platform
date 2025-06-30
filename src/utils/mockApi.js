// 模拟API服务，用于开发阶段测试
// 在实际项目中，这些API应该由后端提供

// 模拟用户数据
const mockUsers = [
  {
    id: 1,
    username: 'admin',
    password: 'admin',
    role: 'admin',
    isAdmin: true,
    email: 'admin@example.com',
    avatar: '/avatar-admin.png'
  },
  {
    id: 2,
    username: 'user',
    password: 'user',
    role: 'user',
    isAdmin: false,
    email: 'user@example.com',
    avatar: '/avatar-user.png'
  }
];

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
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const user = mockUsers.find(u => u.username === username && u.password === password);
  
  if (!user) {
    throw new Error('用户名或密码错误');
  }
  
  const token = generateMockJWT(user);
  
  // 返回用户信息（不包含密码）
  const { password: _, ...userInfo } = user;
  
  return {
    token,
    user: userInfo,
    message: '登录成功'
  };
};

// 模拟获取当前用户信息API
export const mockGetCurrentUserAPI = async (token) => {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 300));
  
  try {
    const payload = verifyMockJWT(token);
    const user = mockUsers.find(u => u.id === payload.userId);
    
    if (!user) {
      throw new Error('用户不存在');
    }
    
    const { password: _, ...userInfo } = user;
    return userInfo;
  } catch {
    throw new Error('获取用户信息失败');
  }
};

// 模拟登出API
export const mockLogoutAPI = async () => {
  // 模拟网络延迟
  await new Promise(resolve => setTimeout(resolve, 200));
  
  return {
    message: '登出成功'
  };
}; 