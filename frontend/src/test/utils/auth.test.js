import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loginAPI,
  logoutAPI,
  getCurrentUserAPI,
  storeUserInfo,
  clearUserInfo,
  getStoredToken,
  getStoredUserInfo,
  validateToken,
  isAuthenticated,
  isTokenExpired
} from '@/utils/auth';
import {
  mockValidToken,
  mockExpiredToken,
  mockInvalidToken,
  mockUserInfo,
  mockLoginResponse,
  mockUserResponse,
  mockApiErrors
} from '../mocks/authMocks';
import { setupLocalStorageMock, clearAllMocks, createMockApiResponse, createMockApiError } from './testUtils';

// Mock API module
vi.mock('@/utils/api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn()
  }
}));

// Mock config module
vi.mock('@/config/api', () => ({
  API_ENDPOINTS: {
    auth: {
      login: '/api/auth/login'
    },
    user: {
      getCurrent: '/api/users/me'
    }
  },
  checkNetworkStatus: vi.fn().mockResolvedValue(true)
}));

describe('Auth Utils', () => {
  let mockApi;
  let mockCheckNetworkStatus;

  beforeEach(async () => {
    setupLocalStorageMock();
    clearAllMocks();
    
    // Get mocked modules
    mockApi = (await import('@/utils/api')).default;
    const configModule = await import('@/config/api');
    mockCheckNetworkStatus = configModule.checkNetworkStatus;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loginAPI', () => {
    it('应该成功登录并返回token', async () => {
      mockApi.post.mockResolvedValue(createMockApiResponse(mockLoginResponse));
      mockCheckNetworkStatus.mockResolvedValue(true);

      const result = await loginAPI('testuser', 'password123');

      expect(result).toEqual(mockLoginResponse);
      expect(mockApi.post).toHaveBeenCalledWith(
        '/api/auth/login',
        expect.any(FormData),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          }
        })
      );
    });

    it('应该处理401错误', async () => {
      mockApi.post.mockRejectedValue(createMockApiError('Unauthorized', 401));
      mockCheckNetworkStatus.mockResolvedValue(true);

      await expect(loginAPI('wronguser', 'wrongpass')).rejects.toThrow('用户名或密码错误');
    });

    it('应该处理422验证错误', async () => {
      const validationError = createMockApiError('Validation Error', 422, {
        detail: [{ msg: 'field required', loc: ['body', 'username'] }]
      });
      mockApi.post.mockRejectedValue(validationError);
      mockCheckNetworkStatus.mockResolvedValue(true);

      await expect(loginAPI('', '')).rejects.toThrow('请填写所有必填字段');
    });

    it('应该处理网络错误', async () => {
      mockApi.post.mockRejectedValue(createMockApiError('Network Error'));
      mockCheckNetworkStatus.mockResolvedValue(true);

      await expect(loginAPI('user', 'pass')).rejects.toThrow('网络连接失败，请检查网络设置');
    });

    it('应该处理超时错误', async () => {
      mockApi.post.mockRejectedValue(createMockApiError('timeout of 5000ms exceeded'));
      mockCheckNetworkStatus.mockResolvedValue(true);

      await expect(loginAPI('user', 'pass')).rejects.toThrow('请求超时，请稍后重试');
    });

    it('应该处理网络检查失败', async () => {
      mockApi.post.mockResolvedValue(createMockApiResponse(mockLoginResponse));
      mockCheckNetworkStatus.mockResolvedValue(false);

      const result = await loginAPI('testuser', 'password123');

      expect(result).toEqual(mockLoginResponse);
    });
  });

  describe('logoutAPI', () => {
    it('应该成功执行前端登出', async () => {
      const result = await logoutAPI();

      expect(result).toEqual({ message: '登出成功' });
    });
  });

  describe('getCurrentUserAPI', () => {
    it('应该成功获取用户信息', async () => {
      mockApi.get.mockResolvedValue(createMockApiResponse(mockUserResponse));
      mockCheckNetworkStatus.mockResolvedValue(true);
      
      // Mock localStorage to return a token
      vi.mocked(localStorage.getItem).mockReturnValue(mockValidToken);

      const result = await getCurrentUserAPI();

      expect(result).toEqual(mockUserResponse);
      expect(mockApi.get).toHaveBeenCalledWith('/api/users/me');
    });

    it('应该在没有token时抛出错误', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);

      await expect(getCurrentUserAPI()).rejects.toThrow('未找到token');
    });

    it('应该处理API错误', async () => {
      mockApi.get.mockRejectedValue(createMockApiError('API Error', 500));
      vi.mocked(localStorage.getItem).mockReturnValue(mockValidToken);

      await expect(getCurrentUserAPI()).rejects.toThrow('API Error');
    });
  });

  describe('storeUserInfo', () => {
    it('应该成功存储用户信息', () => {
      storeUserInfo(mockValidToken, 'bearer', mockUserInfo);

      expect(localStorage.setItem).toHaveBeenCalledWith('token', mockValidToken);
      expect(localStorage.setItem).toHaveBeenCalledWith('userInfo', JSON.stringify(mockUserInfo));
    });

    it('应该从JWT token解析用户信息', () => {
      storeUserInfo(mockValidToken);

      expect(localStorage.setItem).toHaveBeenCalledWith('token', mockValidToken);
      expect(localStorage.setItem).toHaveBeenCalledWith('userInfo', expect.any(String));
    });

    it('应该处理存储错误', () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('Storage error');
      });

      expect(() => storeUserInfo(mockValidToken)).toThrow('无法保存登录信息，请检查浏览器设置');
    });
  });

  describe('clearUserInfo', () => {
    it('应该清除所有用户信息', () => {
      clearUserInfo();

      expect(localStorage.removeItem).toHaveBeenCalledWith('token');
      expect(localStorage.removeItem).toHaveBeenCalledWith('userInfo');
      expect(localStorage.removeItem).toHaveBeenCalledWith('tokenInfo');
      expect(localStorage.removeItem).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('getStoredToken', () => {
    it('应该返回存储的token', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(mockValidToken);

      const result = getStoredToken();

      expect(result).toBe(mockValidToken);
      expect(localStorage.getItem).toHaveBeenCalledWith('token');
    });

    it('应该返回null当没有token时', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);

      const result = getStoredToken();

      expect(result).toBeNull();
    });
  });

  describe('getStoredUserInfo', () => {
    it('应该返回解析的用户信息', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(mockUserInfo));

      const result = getStoredUserInfo();

      expect(result).toEqual(mockUserInfo);
      expect(localStorage.getItem).toHaveBeenCalledWith('userInfo');
    });

    it('应该返回null当没有用户信息时', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);

      const result = getStoredUserInfo();

      expect(result).toBeNull();
    });

    it('应该处理无效的JSON', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('invalid json');

      const result = getStoredUserInfo();

      expect(result).toBeNull();
    });
  });

  describe('validateToken', () => {
    it('应该验证有效的token', () => {
      const result = validateToken(mockValidToken);
      expect(result.isValid).toBe(true);
    });

    it('应该拒绝无效的token格式', () => {
      const result = validateToken(mockInvalidToken);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('token_invalid');
    });

    it('应该拒绝过期的token', () => {
      const result = validateToken(mockExpiredToken);
      expect(result.isValid).toBe(false);
      expect(result.reason).toBe('token_expired');
    });
  });

  describe('isAuthenticated', () => {
    it('应该返回true当有有效token和用户信息时', () => {
      vi.mocked(localStorage.getItem)
        .mockReturnValueOnce(mockValidToken) // getStoredToken
        .mockReturnValueOnce(JSON.stringify(mockUserInfo)); // getStoredUserInfo

      const result = isAuthenticated();
      expect(result).toBe(true);
    });

    it('应该返回false当没有token时', () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null);

      const result = isAuthenticated();
      expect(result).toBe(false);
    });

    it('应该返回false当token无效时', () => {
      vi.mocked(localStorage.getItem)
        .mockReturnValueOnce(mockInvalidToken) // getStoredToken
        .mockReturnValueOnce(JSON.stringify(mockUserInfo)); // getStoredUserInfo

      const result = isAuthenticated();
      expect(result).toBe(false);
    });
  });

  describe('isTokenExpired', () => {
    it('应该检测过期的token', () => {
      const result = isTokenExpired(mockExpiredToken);
      expect(result).toBe(true);
    });

    it('应该检测有效的token', () => {
      const result = isTokenExpired(mockValidToken);
      expect(result).toBe(false);
    });

    it('应该处理无效的token格式', () => {
      const result = isTokenExpired(mockInvalidToken);
      expect(result).toBe(true); // 无效token被视为过期
    });
  });
}); 