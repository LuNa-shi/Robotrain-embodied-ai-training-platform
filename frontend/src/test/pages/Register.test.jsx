import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import * as antd from 'antd';
import Register from '@/pages/User/Register';
import { mockSignupResponse, mockAdminSignupResponse } from '../mocks/registerMocks';

// --- Mocks ---
vi.mock('@/utils/auth', () => ({
  signupAPI: vi.fn(),
}));

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

// --- 测试套件 ---
describe('Register Page', () => {
  let user;
  let mockSignupAPI;

  beforeEach(async () => {
    vi.useFakeTimers();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    mockNavigate.mockClear();
    mockMessage.success.mockClear();
    mockMessage.error.mockClear();

    const auth = await import('@/utils/auth');
    mockSignupAPI = auth.signupAPI;
    mockSignupAPI.mockClear();

    vi.spyOn(antd.App, 'useApp').mockReturnValue({ message: mockMessage });
  });

  afterEach(() => {
    vi.useRealTimers();
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
  
  // 辅助函数，用于填充一个有效的表单
  const fillValidForm = async (isAdmin = false) => {
    const username = isAdmin ? 'admin' : 'test';
    await user.type(screen.getByPlaceholderText(/用户名/), username);
    await user.type(screen.getByPlaceholderText(/密码（至少6位）/), 'password123');
    await user.type(screen.getByPlaceholderText(/确认密码/), 'password123');
    if (isAdmin) {
      await user.click(screen.getByRole('switch'));
    }
    await user.click(screen.getByRole('checkbox'));
  };

  // --- 测试用例 ---

  describe('页面渲染', () => {
    it('应该正确渲染注册页面的所有静态元素', () => {
      renderRegister();
      expect(screen.getByText('创建账户')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /注\s*册/ })).toBeInTheDocument();
      expect(screen.getByText('机器人云端平台')).toBeInTheDocument();
    });
  });

  describe('表单验证', () => {
    it('应该在未填写任何必填字段时显示错误', async () => {
      renderRegister();
      await user.click(screen.getByRole('button', { name: /注\s*册/ }));
      // 这个测试的目的是检查所有字段为空，所以它的写法是正确的
      expect(mockMessage.error).toHaveBeenCalledWith('请输入您的用户名!', 3);
      expect(mockMessage.error).toHaveBeenCalledWith('请输入您的密码!', 3);
      expect(mockMessage.error).toHaveBeenCalledWith('请确认您的密码!', 3);
    });

    it('应该在密码过短时显示错误', async () => {
      renderRegister();
      // 满足其他所有前置条件，以隔离测试目标
      await user.type(screen.getByPlaceholderText(/用户名/), 'testuser');
      await user.type(screen.getByPlaceholderText(/确认密码/), '123'); // **核心修改：为确认密码框提供值**
      await user.click(screen.getByRole('checkbox'));

      // 输入我们想要测试的无效数据
      await user.type(screen.getByPlaceholderText(/密码（至少6位）/), '123');
      
      // 触发验证
      await user.click(screen.getByRole('button', { name: /注\s*册/ }));
      
      // 断言
      expect(mockMessage.error).toHaveBeenCalledWith('密码长度至少6位!', 3);
      expect(mockMessage.error).toHaveBeenCalledTimes(1); // 确保只报了这一个我们关心的错
    });

    // 为保持健壮性，同时修正“密码不一致”和“未同意条款”的测试用例
    it('应该在两次密码不一致时显示错误', async () => {
      renderRegister();
      // 满足其他所有前置条件
      await user.type(screen.getByPlaceholderText(/用户名/), 'testuser');
      await user.click(screen.getByRole('checkbox'));

      // 输入我们想要测试的无效数据
      await user.type(screen.getByPlaceholderText(/密码（至少6位）/), 'password123');
      await user.type(screen.getByPlaceholderText(/确认密码/), 'password456');

      // 触发验证
      await user.click(screen.getByRole('button', { name: /注\s*册/ }));

      // 断言
      expect(mockMessage.error).toHaveBeenCalledWith('两次输入的密码不一致!', 3);
      expect(mockMessage.error).toHaveBeenCalledTimes(1);
    });

    it('应该在未同意服务条款时显示错误', async () => {
      renderRegister();
      // 满足其他所有前置条件
      await user.type(screen.getByPlaceholderText(/用户名/), 'testuser');
      await user.type(screen.getByPlaceholderText(/密码（至少6位）/), 'password123');
      await user.type(screen.getByPlaceholderText(/确认密码/), 'password123');
      
      // 注意：此处不点击 checkbox，这是我们想测试的场景

      // 触发验证
      await user.click(screen.getByRole('button', { name: /注\s*册/ }));

      // 断言
      expect(mockMessage.error).toHaveBeenCalledWith('请阅读并同意服务条款和隐私政策后才能注册', 3);
      expect(mockMessage.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('注册流程与副作用', () => {
    it('应该在提交有效表单后调用API，显示成功消息并跳转', async () => {
      // 准备：模拟API会延迟100毫秒后成功返回
      mockSignupAPI.mockImplementation(() => new Promise(resolve => setTimeout(() => resolve(mockSignupResponse), 100)));
      renderRegister();
      
      // 行为：填充有效表单
      await fillValidForm(false);
      
      // 行为：点击注册按钮
      await user.click(screen.getByRole('button', { name: /注\s*册/ }));

      // 断言1：立即检查副作用
      expect(mockSignupAPI).toHaveBeenCalledWith('test', 'password123', false);
      expect(mockSignupAPI).toHaveBeenCalledTimes(1);

      // 行为：快进所有定时器，让API的Promise完成
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      
      // 断言2：检查API成功后的副作用
      await waitFor(() => {
        expect(mockMessage.success).toHaveBeenCalledWith(
          `恭喜！用户 "testuser" 注册成功！即将跳转到登录页面...`,
          3
        );
      });

      // 行为：快进用于跳转的1秒定时器
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      
      // 断言3：检查最终的跳转副作用
      expect(mockNavigate).toHaveBeenCalledWith('/user/login');
    });

    it('应该在API返回错误时显示错误消息', async () => {
      const errorMessage = '用户名已被占用';
      mockSignupAPI.mockRejectedValue(new Error(errorMessage));
      renderRegister();
      await fillValidForm();
      
      await user.click(screen.getByRole('button', { name: /注\s*册/ }));
      
      await waitFor(() => {
        expect(mockMessage.error).toHaveBeenCalledWith(errorMessage, 3);
      });
    });

    // --- 这里是核心修改 ---
    it('应该支持在最后一个输入框按回车键提交', async () => {
      mockSignupAPI.mockResolvedValue(mockSignupResponse);
      renderRegister();

      // 为了精确控制最后一步，我们在这里重新执行填充步骤
      await user.type(screen.getByPlaceholderText(/用户名/), 'test');
      await user.type(screen.getByPlaceholderText(/密码（至少6位）/), 'password123');
      await user.click(screen.getByRole('checkbox'));

      // 关键：在输入确认密码后，直接附加 {enter} 来模拟回车
      await user.type(screen.getByPlaceholderText(/确认密码/), 'password123{enter}');

      // 断言 API 被正确调用
      await waitFor(() => {
        expect(mockSignupAPI).toHaveBeenCalledWith('test', 'password123', false);
      });
    });
  });
});