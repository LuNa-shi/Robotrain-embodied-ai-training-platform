// Mock JWT token - 使用未来的过期时间
export const mockValidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwicm9sZSI6InVzZXIiLCJpc19hZG1pbiI6ZmFsc2UsImV4cCI6MTc1MjQ4MDAwMCwiaWF0IjoxNzUyNDgwMDAwfQ.mock_signature';

export const mockExpiredToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwicm9sZSI6InVzZXIiLCJpc19hZG1pbiI6ZmFsc2UsImV4cCI6MTYzNTY4MDAwMCwiaWF0IjoxNjM1NjgwMDAwfQ.expired_signature';

export const mockInvalidToken = 'invalid.token.format';

// Mock user info
export const mockUserInfo = {
  id: 1,
  username: 'testuser',
  role: 'user',
  isAdmin: false,
  exp: 1735680000,
  iat: 1735680000
};

export const mockAdminUserInfo = {
  id: 2,
  username: 'admin',
  role: 'admin',
  isAdmin: true,
  exp: 1735680000,
  iat: 1735680000
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