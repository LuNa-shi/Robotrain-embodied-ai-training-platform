import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import * as antd from 'antd';
import Login from '@/pages/User/Login';
import { mockLoginResponse } from '../mocks/authMocks';

// --- Mocks ---
vi.mock('@/store/slices/userSlice', () => {
  const loginUser = Object.assign(
    () => ({}),
    {
      fulfilled: { match: (result) => result && result.type === 'user/loginUser/fulfilled' },
      rejected: { match: (result) => result && result.type === 'user/loginUser/rejected' }
    }
  );
  return { loginUser };
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@ant-design/icons', () => ({
  UserOutlined: () => <span>UserIcon</span>,
  LockOutlined: () => <span>LockIcon</span>,
}));

const mockMessage = {
  success: vi.fn(),
  error: vi.fn(),
};

const mockDispatch = vi.fn();

vi.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
}));

// --- 测试套件 ---
describe('Login Page', () => {
  let user;

  beforeEach(async () => {
    vi.useFakeTimers();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockNavigate.mockClear();
    mockMessage.success.mockClear();
    mockMessage.error.mockClear();
    mockDispatch.mockClear();

    vi.spyOn(antd.App, 'useApp').mockReturnValue({ message: mockMessage });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderLogin = () => {
    return render(
      <BrowserRouter>
        <antd.App>
          <Login />
        </antd.App>
      </BrowserRouter>
    );
  };

  // 辅助函数，用于填充一个有效的登录表单
  const fillValidForm = async () => {
    await user.type(screen.getByPlaceholderText('用户名'), 'testuser');
    await user.type(screen.getByPlaceholderText('密码'), 'password123');
  };

  describe('页面渲染', () => {
    it('应该正确渲染登录页面的标题和表单', () => {
      renderLogin();
      
      expect(screen.getByRole('heading', { name: /欢迎回来/ })).toBeInTheDocument();
      expect(screen.getByPlaceholderText('用户名')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('密码')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /登\s*录/ })).toBeInTheDocument();
    });

    it('应该显示注册链接', () => {
      renderLogin();
      
      expect(screen.getByText(/还没有账户/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /立即注册/ })).toBeInTheDocument();
    });
  });

  describe('表单验证', () => {
          it('应该在未填写用户名时显示错误', async () => {
        renderLogin();
        
        const passwordInput = screen.getByPlaceholderText('密码');
        await user.type(passwordInput, 'password123');
        
        const loginButton = screen.getByRole('button', { name: /登\s*录/ });
        await user.click(loginButton);
        
        expect(mockMessage.error).toHaveBeenCalledWith('请输入您的用户名!', 3);
      });

      it('应该在未填写密码时显示错误', async () => {
        renderLogin();
        
        const usernameInput = screen.getByPlaceholderText('用户名');
        await user.type(usernameInput, 'testuser');
        
        const loginButton = screen.getByRole('button', { name: /登\s*录/ });
        await user.click(loginButton);
        
        expect(mockMessage.error).toHaveBeenCalledWith('请输入您的密码!', 3);
      });
  });

  describe('登录功能', () => {
    it('应该能够填写登录表单', async () => {
      renderLogin();
      
      const usernameInput = screen.getByPlaceholderText('用户名');
      const passwordInput = screen.getByPlaceholderText('密码');
      
      await user.type(usernameInput, 'testuser');
      await user.type(passwordInput, 'password123');
      
      expect(usernameInput.value).toBe('testuser');
      expect(passwordInput.value).toBe('password123');
    });

    it('登录成功应该调用Redux action并跳转', async () => {
      // 模拟Redux action返回成功结果
      const mockResult = { type: 'user/loginUser/fulfilled', payload: mockLoginResponse };
      mockDispatch.mockResolvedValue(mockResult);
      
      renderLogin();
      await fillValidForm();
      
      const loginButton = screen.getByRole('button', { name: /登\s*录/ });
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalled();
      });
      
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      
      expect(mockMessage.success).toHaveBeenCalledWith('登录成功！正在跳转...', 2);
      expect(mockNavigate).toHaveBeenCalledWith('/home');
    });

    it('登录失败应该显示错误信息', async () => {
      // 模拟Redux action返回失败结果
      const mockResult = { type: 'user/loginUser/rejected', payload: '用户名或密码错误' };
      mockDispatch.mockResolvedValue(mockResult);
      
      renderLogin();
      await fillValidForm();
      
      const loginButton = screen.getByRole('button', { name: /登\s*录/ });
      await user.click(loginButton);
      
      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalled();
      });
      
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith('用户名或密码错误', 3);
      });
    });

    it('应该支持在密码输入框按回车键提交', async () => {
      // 模拟Redux action返回成功结果
      const mockResult = { type: 'user/loginUser/fulfilled', payload: mockLoginResponse };
      mockDispatch.mockResolvedValue(mockResult);
      
      renderLogin();
      await fillValidForm();
      
      const passwordInput = screen.getByPlaceholderText('密码');
      await user.type(passwordInput, '{enter}');
      
      await waitFor(() => {
        expect(mockDispatch).toHaveBeenCalled();
      });
    });
  });

  describe('导航功能', () => {
    it('应该显示注册链接', () => {
      renderLogin();
      
      const registerLink = screen.getByRole('link', { name: /立即注册/ });
      expect(registerLink).toBeInTheDocument();
      expect(registerLink).toHaveAttribute('href', '/user/register');
    });
  });
}); 