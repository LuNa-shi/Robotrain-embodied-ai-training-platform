// Mock JWT token - 使用更远的未来过期时间
// 修复JWT格式，使其与后端实际生成的格式匹配
// 后端只使用 'sub' 字段存储用户名，并添加 'exp' 和 'iat' 字段
// 使用一个非常远的未来时间，确保测试时不会过期
export const mockValidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsImV4cCI6MjUyNDYwODAwMCwiaWF0IjoxNzUyNTAwMDAwfQ.mock_signature';

export const mockExpiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0dXNlciIsImV4cCI6MTYzNTY4MDAwMCwiaWF0IjoxNjM1NjgwMDAwfQ.expired_signature';

export const mockInvalidToken = 'invalid.token.format';

// Mock user info - 更新字段名以匹配JWT标准
export const mockUserInfo = {
  id: 1,
  username: 'testuser',
  role: 'user',
  isAdmin: false,
  exp: 2524608000, // 2050年的某个时间
  iat: 1752500000
};

export const mockAdminUserInfo = {
  id: 2,
  username: 'admin',
  role: 'admin',
  isAdmin: true,
  exp: 2524608000, // 2050年的某个时间
  iat: 1752500000
};

// Mock API responses
export const mockLoginResponse = {
  access_token: mockValidToken,
  token_type: 'bearer'
};

export const mockUserResponse = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  role: 'user',
  is_admin: false
};

// Mock localStorage data
export const mockStoredToken = mockValidToken;
export const mockStoredUserInfo = JSON.stringify(mockUserInfo);

// Mock API errors
export const mockApiErrors = {
  invalidCredentials: {
    status: 401,
    data: { detail: 'Incorrect username or password' }
  },
  validationError: {
    status: 422,
    data: { 
      detail: [
        { msg: 'field required', loc: ['body', 'username'] }
      ]
    }
  },
  networkError: {
    message: 'Network Error'
  },
  timeoutError: {
    message: 'timeout of 5000ms exceeded'
  }
}; 