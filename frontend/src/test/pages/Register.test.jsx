import React from 'react';
// 核心修改：从 @testing-library/react 导入 act
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import * as antd from 'antd';
import Register from '@/pages/User/Register';
import { mockSignupResponse, mockAdminSignupResponse } from '../mocks/registerMocks';

// --- Mocks (保持不变) ---
vi.mock('@/utils/auth', () => ({
  signupAPI: vi.fn(),
}));
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('@ant-design/icons', () => ({
  UserOutlined: () => <span>👤</span>,
  LockOutlined: () => <span>🔒</span>,
}));
vi.mock('@/pages/User/Login.module.css', () => ({ default: {} }));
vi.mock('import.meta', () => ({ env: { DEV: true } }));

const mockMessage = {
  success: vi.fn(),
  error: vi.fn(),
};

describe('Register Page', () => {
  let user;
  let mockSignupAPI;

  beforeEach(async () => {
    user = userEvent.setup();
    mockNavigate.mockClear();
    mockMessage.success.mockClear();
    mockMessage.error.mockClear();
    
    const auth = await import('@/utils/auth');
    mockSignupAPI = auth.signupAPI;
    mockSignupAPI.mockClear();

    vi.spyOn(antd.App, 'useApp').mockReturnValue({ message: mockMessage });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderRegister = () => {
    return render(
      <BrowserRouter>
        <antd.App>
          <Register />
        </antd.App>
      </BrowserRouter>
    );
  };

  // ... '页面渲染' 和 '表单验证' 测试块保持不变 ...
  describe('页面渲染', () => { /* ... */ });
  describe('表单验证', () => { /* ... */ });


  describe('注册流程', () => {
    const fillValidForm = async (user, isAdmin = false) => {
        const username = isAdmin ? 'adminuser' : 'testuser';
        const password = isAdmin ? 'admin123' : 'password123';
        
        await user.type(screen.getByPlaceholderText('用户名（不超过50个字符）'), username);
        await user.type(screen.getByPlaceholderText('密码（至少6位）'), password);
        await user.type(screen.getByPlaceholderText('确认密码'), password);
        
        if (isAdmin) {
            await user.click(screen.getByRole('switch', { name: '管理员权限' }));
        }
        
        await user.click(screen.getByRole('checkbox', { name: /我已阅读并同意/ }));
    };

    // --- ↓↓↓ 这里是核心修改区域 ↓↓↓ ---

    it('应该成功注册普通用户并显示成功消息', async () => {
      mockSignupAPI.mockResolvedValue(mockSignupResponse);
      renderRegister();
      await fillValidForm(user, false);

      // 核心修改：将触发异步更新的操作包裹在 act 中
      await act(async () => {
        await user.click(screen.getByRole('button', { name: /注\s*册/ }));
      });
      
      // 现在，断言可以安全地执行，因为 act 保证了所有更新都已完成
      expect(mockMessage.success).toHaveBeenCalledWith(
        '恭喜！用户 "testuser" 注册成功！即将跳转到登录页面...',
        3
      );
    });

    it('应该成功注册管理员用户并显示成功消息', async () => {
        mockSignupAPI.mockResolvedValue(mockAdminSignupResponse);
        renderRegister();
        await fillValidForm(user, true);
        
        await act(async () => {
          await user.click(screen.getByRole('button', { name: /注\s*册/ }));
        });
        
        expect(mockMessage.success).toHaveBeenCalledWith(
            '恭喜！用户 "adminuser"（管理员权限） 注册成功！即将跳转到登录页面...',
            3
        );
    });

    it('应该处理用户名已存在错误', async () => {
        const errorMessage = '用户名已存在，请选择其他用户名';
        mockSignupAPI.mockRejectedValue(new Error(errorMessage));
        renderRegister();
        await fillValidForm(user, false);

        await act(async () => {
          await user.click(screen.getByRole('button', { name: /注\s*册/ }));
        });
        
        expect(mockMessage.error).toHaveBeenCalledWith(errorMessage, 3);
    });

    it('应该在注册成功1秒后跳转到登录页', async () => {
      vi.useFakeTimers();
      mockSignupAPI.mockResolvedValue(mockSignupResponse);
      renderRegister();
      await fillValidForm(user, false);

      await act(async () => {
        await user.click(screen.getByRole('button', { name: /注\s*册/ }));
      });
      
      // 此刻，异步消息已经显示，setTimeout 已经被调用
      expect(mockMessage.success).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();

      // 现在，快进时间来触发 setTimeout
      await act(async () => {
        vi.runAllTimers();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/user/login');
      vi.useRealTimers();
    });
  });
});