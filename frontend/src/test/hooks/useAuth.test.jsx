import React from 'react';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAuth } from '@/hooks/useAuth';
import * as authUtils from '@/utils/auth';

// Mock auth utils
vi.mock('@/utils/auth', () => ({
  getStoredToken: vi.fn(),
  getStoredUserInfo: vi.fn(),
  validateToken: vi.fn(),
}));

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

describe('useAuth', () => {
  let mockStore;
  let mockGetStoredToken;
  let mockGetStoredUserInfo;
  let mockValidateToken;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // 获取mock函数
    mockGetStoredToken = authUtils.getStoredToken;
    mockGetStoredUserInfo = authUtils.getStoredUserInfo;
    mockValidateToken = authUtils.validateToken;
    
    // 创建mock store
    mockStore = configureStore({
      reducer: {
        user: (state = { token: null, userInfo: null }, action) => state
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderUseAuth = (initialState = { token: null, userInfo: null }) => {
    // 更新store的初始状态
    mockStore = configureStore({
      reducer: {
        user: (state = initialState, action) => state
      }
    });

    return renderHook(() => useAuth(), {
      wrapper: ({ children }) => (
        <Provider store={mockStore}>
          {children}
        </Provider>
      ),
    });
  };

  describe('Redux store中有认证信息', () => {
    it('当Redux store中有token和userInfo时，应该返回true', () => {
      const initialState = {
        token: 'valid-token',
        userInfo: { id: 1, username: 'testuser' }
      };
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(true);
      // 不应该调用localStorage相关函数
      expect(mockGetStoredToken).not.toHaveBeenCalled();
      expect(mockGetStoredUserInfo).not.toHaveBeenCalled();
      expect(mockValidateToken).not.toHaveBeenCalled();
    });

    it('当Redux store中只有token没有userInfo时，应该检查localStorage', () => {
      const initialState = {
        token: 'valid-token',
        userInfo: null
      };
      
      // Mock localStorage返回有效信息
      mockGetStoredToken.mockReturnValue('stored-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: true });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(true);
      expect(mockGetStoredToken).toHaveBeenCalled();
      expect(mockGetStoredUserInfo).toHaveBeenCalled();
      expect(mockValidateToken).toHaveBeenCalledWith('stored-token');
    });

    it('当Redux store中只有userInfo没有token时，应该检查localStorage', () => {
      const initialState = {
        token: null,
        userInfo: { id: 1, username: 'testuser' }
      };
      
      // Mock localStorage返回有效信息
      mockGetStoredToken.mockReturnValue('stored-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: true });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(true);
      expect(mockGetStoredToken).toHaveBeenCalled();
      expect(mockGetStoredUserInfo).toHaveBeenCalled();
      expect(mockValidateToken).toHaveBeenCalledWith('stored-token');
    });
  });

  describe('Redux store中没有认证信息，依赖localStorage', () => {
    it('当localStorage中有有效的token和userInfo时，应该返回true', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('valid-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: true });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(true);
      expect(mockGetStoredToken).toHaveBeenCalled();
      expect(mockGetStoredUserInfo).toHaveBeenCalled();
      expect(mockValidateToken).toHaveBeenCalledWith('valid-token');
    });

    it('当localStorage中没有token时，应该返回false', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue(null);
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockGetStoredToken).toHaveBeenCalled();
      expect(mockGetStoredUserInfo).toHaveBeenCalled();
      expect(mockValidateToken).not.toHaveBeenCalled();
    });

    it('当localStorage中没有userInfo时，应该返回false', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('valid-token');
      mockGetStoredUserInfo.mockReturnValue(null);
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockGetStoredToken).toHaveBeenCalled();
      expect(mockGetStoredUserInfo).toHaveBeenCalled();
      expect(mockValidateToken).not.toHaveBeenCalled();
    });

    it('当token验证失败时，应该清除localStorage并返回false', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('invalid-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: false, reason: 'token_expired' });
      
      // Mock localStorage.removeItem
      const mockRemoveItem = vi.fn();
      Object.defineProperty(window, 'localStorage', {
        value: {
          ...mockLocalStorage,
          removeItem: mockRemoveItem,
        },
        writable: true,
      });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockGetStoredToken).toHaveBeenCalled();
      expect(mockGetStoredUserInfo).toHaveBeenCalled();
      expect(mockValidateToken).toHaveBeenCalledWith('invalid-token');
      expect(mockRemoveItem).toHaveBeenCalledWith('token');
      expect(mockRemoveItem).toHaveBeenCalledWith('userInfo');
      expect(mockRemoveItem).toHaveBeenCalledWith('tokenInfo');
    });

    it('当token验证失败时，应该清除所有相关的localStorage项', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('invalid-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: false, reason: 'token_invalid' });
      
      // Mock localStorage.removeItem
      const mockRemoveItem = vi.fn();
      Object.defineProperty(window, 'localStorage', {
        value: {
          ...mockLocalStorage,
          removeItem: mockRemoveItem,
        },
        writable: true,
      });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockRemoveItem).toHaveBeenCalledWith('token');
      expect(mockRemoveItem).toHaveBeenCalledWith('userInfo');
      expect(mockRemoveItem).toHaveBeenCalledWith('tokenInfo');
    });
  });

  describe('边界情况和错误处理', () => {
    it('当getStoredToken返回null时，应该返回false', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue(null);
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockGetStoredToken).toHaveBeenCalled();
      expect(mockGetStoredUserInfo).toHaveBeenCalled();
      expect(mockValidateToken).not.toHaveBeenCalled();
    });

    it('当getStoredUserInfo返回null时，应该返回false', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('valid-token');
      mockGetStoredUserInfo.mockReturnValue(null);
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockGetStoredToken).toHaveBeenCalled();
      expect(mockValidateToken).not.toHaveBeenCalled();
    });

    it('当validateToken返回无效结果时，应该清除localStorage并返回false', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('valid-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: false, reason: 'token_invalid' });
      
      const mockRemoveItem = vi.fn();
      Object.defineProperty(window, 'localStorage', {
        value: {
          ...mockLocalStorage,
          removeItem: mockRemoveItem,
        },
        writable: true,
      });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockGetStoredToken).toHaveBeenCalled();
      expect(mockGetStoredUserInfo).toHaveBeenCalled();
      expect(mockValidateToken).toHaveBeenCalledWith('valid-token');
      expect(mockRemoveItem).toHaveBeenCalledWith('token');
      expect(mockRemoveItem).toHaveBeenCalledWith('userInfo');
      expect(mockRemoveItem).toHaveBeenCalledWith('tokenInfo');
    });
  });

  describe('不同token验证结果', () => {
    it('当token过期时，应该清除localStorage并返回false', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('expired-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: false, reason: 'token_expired' });
      
      const mockRemoveItem = vi.fn();
      Object.defineProperty(window, 'localStorage', {
        value: {
          ...mockLocalStorage,
          removeItem: mockRemoveItem,
        },
        writable: true,
      });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockValidateToken).toHaveBeenCalledWith('expired-token');
      expect(mockRemoveItem).toHaveBeenCalledWith('token');
      expect(mockRemoveItem).toHaveBeenCalledWith('userInfo');
      expect(mockRemoveItem).toHaveBeenCalledWith('tokenInfo');
    });

    it('当token无效时，应该清除localStorage并返回false', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('invalid-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: false, reason: 'token_invalid' });
      
      const mockRemoveItem = vi.fn();
      Object.defineProperty(window, 'localStorage', {
        value: {
          ...mockLocalStorage,
          removeItem: mockRemoveItem,
        },
        writable: true,
      });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockValidateToken).toHaveBeenCalledWith('invalid-token');
      expect(mockRemoveItem).toHaveBeenCalledWith('token');
      expect(mockRemoveItem).toHaveBeenCalledWith('userInfo');
      expect(mockRemoveItem).toHaveBeenCalledWith('tokenInfo');
    });

    it('当token缺失时，应该清除localStorage并返回false', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('missing-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: false, reason: 'token_missing' });
      
      const mockRemoveItem = vi.fn();
      Object.defineProperty(window, 'localStorage', {
        value: {
          ...mockLocalStorage,
          removeItem: mockRemoveItem,
        },
        writable: true,
      });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(false);
      expect(mockValidateToken).toHaveBeenCalledWith('missing-token');
      expect(mockRemoveItem).toHaveBeenCalledWith('token');
      expect(mockRemoveItem).toHaveBeenCalledWith('userInfo');
      expect(mockRemoveItem).toHaveBeenCalledWith('tokenInfo');
    });
  });

  describe('性能优化测试', () => {
    it('当Redux store中有完整认证信息时，不应该重复调用localStorage函数', () => {
      const initialState = {
        token: 'valid-token',
        userInfo: { id: 1, username: 'testuser' }
      };
      
      const { result, rerender } = renderUseAuth(initialState);
      
      expect(result.current).toBe(true);
      expect(mockGetStoredToken).not.toHaveBeenCalled();
      expect(mockGetStoredUserInfo).not.toHaveBeenCalled();
      expect(mockValidateToken).not.toHaveBeenCalled();
      
      // 重新渲染，确保不会重复调用
      rerender();
      
      expect(mockGetStoredToken).not.toHaveBeenCalled();
      expect(mockGetStoredUserInfo).not.toHaveBeenCalled();
      expect(mockValidateToken).not.toHaveBeenCalled();
    });

    it('当需要检查localStorage时，应该只调用一次相关函数', () => {
      const initialState = {
        token: null,
        userInfo: null
      };
      
      mockGetStoredToken.mockReturnValue('valid-token');
      mockGetStoredUserInfo.mockReturnValue({ id: 1, username: 'testuser' });
      mockValidateToken.mockReturnValue({ isValid: true });
      
      const { result } = renderUseAuth(initialState);
      
      expect(result.current).toBe(true);
      expect(mockGetStoredToken).toHaveBeenCalledTimes(1);
      expect(mockGetStoredUserInfo).toHaveBeenCalledTimes(1);
      expect(mockValidateToken).toHaveBeenCalledTimes(1);
    });
  });
}); 