import { vi } from 'vitest';

// Mock 注册表单数据
export const mockRegisterFormData = {
  validUser: {
    username: 'testuser',
    password: 'password123',
    confirmPassword: 'password123',
    isAdmin: false,
    agree: true
  },
  adminUser: {
    username: 'adminuser',
    password: 'admin123',
    confirmPassword: 'admin123',
    isAdmin: true,
    agree: true
  },
  invalidUser: {
    username: '',
    password: '123',
    confirmPassword: '456',
    isAdmin: false,
    agree: false
  },
  longUsername: {
    username: 'a'.repeat(51), // 超过50个字符
    password: 'password123',
    confirmPassword: 'password123',
    isAdmin: false,
    agree: true
  },
  shortPassword: {
    username: 'testuser',
    password: '123', // 少于6位
    confirmPassword: '123',
    isAdmin: false,
    agree: true
  },
  mismatchedPassword: {
    username: 'testuser',
    password: 'password123',
    confirmPassword: 'different123',
    isAdmin: false,
    agree: true
  }
};

// Mock API 响应
export const mockSignupResponse = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com',
  role: 'user',
  is_admin: false
};

export const mockAdminSignupResponse = {
  id: 2,
  username: 'adminuser',
  email: 'admin@example.com',
  role: 'admin',
  is_admin: true
};

// Mock API 错误
export const mockSignupErrors = {
  usernameExists: {
    status: 400,
    data: { detail: '用户名已存在，请选择其他用户名' }
  },
  validationError: {
    status: 422,
    data: { detail: '输入数据格式不正确，请检查用户名和密码' }
  },
  networkError: {
    message: 'Network Error'
  }
};

// Mock 导航函数
export const mockNavigate = vi.fn();

// Mock 消息提示函数
export const mockMessage = {
  success: vi.fn(),
  error: vi.fn()
};

// Mock 表单实例
export const mockForm = {
  getFieldsValue: vi.fn(),
  setFieldValue: vi.fn(),
  getFieldValue: vi.fn(),
  useForm: vi.fn(() => [mockForm])
};

// Mock 定时器
export const mockSetTimeout = vi.fn((callback, delay) => {
  setTimeout(callback, delay);
});

// Mock 环境变量
export const mockEnv = {
  DEV: true
}; 