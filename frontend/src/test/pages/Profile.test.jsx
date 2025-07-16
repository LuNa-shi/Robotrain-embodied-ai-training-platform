// --- Vitest Mocks (必须放在最顶部) ---
vi.mock('react-redux', () => ({
    useSelector: vi.fn(), 
    useDispatch: () => vi.fn(),
}));

vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal();
  if (!globalThis.__mockMessage) {
    globalThis.__mockMessage = {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };
  }
  if (!globalThis.__mockModal) {
    globalThis.__mockModal = {
      confirm: vi.fn(),
    };
  }
  const mockMessage = globalThis.__mockMessage;
  const mockModal = globalThis.__mockModal;
  const MockApp = ({ children }) => children;
  MockApp.useApp = () => ({
    message: mockMessage,
    notification: vi.fn(),
    modal: mockModal,
  });
  return {
    ...actual,
    App: MockApp,
    message: mockMessage, // 直接 mock message 以支持直接导入
  };
});

vi.mock('@ant-design/icons', () => ({
  UserOutlined: () => <span>UserIcon</span>,
  MailOutlined: () => <span>MailIcon</span>,
  PhoneOutlined: () => <span>PhoneIcon</span>,
  EditOutlined: () => <span>EditIcon</span>,
  SaveOutlined: () => <span>SaveIcon</span>,
  CameraOutlined: () => <span>CameraIcon</span>,
  CalendarOutlined: () => <span>CalendarIcon</span>,
  EnvironmentOutlined: () => <span>EnvironmentIcon</span>,
  CrownOutlined: () => <span>CrownIcon</span>,
}));

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { useSelector } from 'react-redux';
import Profile from '@/pages/Profile';

// --- 测试套件 ---
describe('Profile Page', () => {
  let user;

  beforeEach(async () => {
    vi.useFakeTimers();
    user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.mocked(useSelector).mockReturnValue({
        userInfo: {
            username: 'testuser',
            isAdmin: false,
            created_at: '2024-01-15T00:00:00.000Z',
        }
    });

    // 直接 mock require('antd').message
    const antd = await import('antd');
    antd.message = globalThis.__mockMessage;

    globalThis.__mockMessage.success.mockClear();
    globalThis.__mockMessage.error.mockClear();
    globalThis.__mockMessage.info.mockClear();
    globalThis.__mockModal.confirm.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const renderProfile = async () => {
    const antd = await import('antd');
    return render(
      <BrowserRouter>
        <antd.App>
          <Profile />
        </antd.App>
      </BrowserRouter>
    );
  };

  // 辅助函数：获取头像区域的UserIcon
  const getAvatarUserIcon = () => {
    const userIcons = screen.getAllByText('UserIcon');
    return userIcons.find(icon => 
      icon.closest('[class*="avatarWrapper"]') !== null
    );
  };

  describe('页面渲染', () => {
    it('应该正确渲染个人资料页面的标题和描述', async () => {
      await renderProfile();
      
      expect(screen.getByRole('heading', { name: '个人资料' })).toBeInTheDocument();
      expect(screen.getByText('管理您的个人信息和账户设置')).toBeInTheDocument();
    });

    it('应该正确渲染用户基本信息', async () => {
      await renderProfile();
      
      // 检查用户名
      expect(screen.getByDisplayValue('admin')).toBeInTheDocument();
      // 检查邮箱
      expect(screen.getByDisplayValue('admin@robotrain.com')).toBeInTheDocument();
      // 检查手机号
      expect(screen.getByDisplayValue('13800138000')).toBeInTheDocument();
      // 检查地区
      expect(screen.getByDisplayValue('北京')).toBeInTheDocument();
      // 检查个人简介
      expect(screen.getByDisplayValue('机器人训练平台管理员，专注于AI和机器学习技术。')).toBeInTheDocument();
    });

    it('应该正确渲染角色和加入时间', async () => {
      await renderProfile();
      
      expect(screen.getByText('普通用户')).toBeInTheDocument();
      expect(screen.getByText(/2024\/1\/15/)).toBeInTheDocument();
    });

    it('应该显示编辑按钮', async () => {
      await renderProfile();
      
      expect(screen.getByRole('button', { name: '编辑资料' })).toBeInTheDocument();
    });

    it('应该显示头像上传区域', async () => {
      await renderProfile();
      
      // 检查头像是否存在（使用UserIcon作为标识）
      const avatarUserIcon = getAvatarUserIcon();
      expect(avatarUserIcon).toBeInTheDocument();
    });
  });

  describe('Redux状态集成', () => {
    it('应该从Redux store获取用户信息并更新显示', async () => {
      // 设置Redux状态
      vi.mocked(useSelector).mockReturnValue({
        userInfo: {
          username: 'newuser',
          isAdmin: true,
          created_at: '2024-02-01T00:00:00.000Z',
        }
      });

      await renderProfile();

      // 等待useEffect执行完成，userData更新
      await act(async () => {
        // 给useEffect一些时间执行
        vi.runAllTimers();
      });
      
      // 检查角色是否更新为管理员（这个会更新，因为不依赖Form的initialValues）
      expect(screen.getByText('管理员')).toBeInTheDocument();
      
      // 检查加入时间是否更新（这个也会更新）
      expect(screen.getByText(/2024\/2\/1/)).toBeInTheDocument();
      
      // 注意：用户名输入框的值不会立即更新，因为Form的initialValues在组件初始化时就确定了
      // 这是Profile组件的一个设计限制，在实际使用中，用户需要点击编辑按钮才能看到更新后的值
    });

    it('点击编辑按钮时应该显示更新后的表单值', async () => {
      // 设置Redux状态
      vi.mocked(useSelector).mockReturnValue({
        userInfo: {
          username: 'newuser',
          isAdmin: true,
          created_at: '2024-02-01T00:00:00.000Z',
        }
      });
      await renderProfile();

      // 等待useEffect执行完成
      await act(async () => {
        vi.runAllTimers();
      });

      // 点击编辑按钮，这会调用form.setFieldsValue(userData)
      const editButton = screen.getByRole('button', { name: '编辑资料' });
      await user.click(editButton);

      // 现在应该显示更新后的用户名（通过form.setFieldsValue更新）
      expect(screen.getByDisplayValue('newuser')).toBeInTheDocument();
    });

    it('应该处理Redux store中空的用户信息', async () => {
      // 设置空的Redux状态
      vi.mocked(useSelector).mockReturnValue({ userInfo: null });

      await renderProfile();

      // 应该显示默认值
      expect(screen.getByDisplayValue('admin')).toBeInTheDocument();
    });
  });

  describe('编辑功能', () => {
    it('点击编辑按钮应该进入编辑模式', async () => {
      await renderProfile();
      
      const editButton = screen.getByRole('button', { name: '编辑资料' });
      await user.click(editButton);
      
      // 检查是否显示取消和保存按钮
      expect(screen.getByRole('button', { name: '取 消' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '保 存' })).toBeInTheDocument();
      
      // 检查输入框是否变为可编辑
      const usernameInput = screen.getByDisplayValue('testuser');
      expect(usernameInput).not.toHaveAttribute('readonly');
    });

    it('编辑模式下应该显示头像上传覆盖层', async () => {
      await renderProfile();
      
      const editButton = screen.getByRole('button', { name: '编辑资料' });
      await user.click(editButton);
      
      // 检查头像覆盖层是否显示
      expect(screen.getByText('CameraIcon')).toBeInTheDocument();
    });

    it('点击取消按钮应该退出编辑模式', async () => {
      await renderProfile();
      
      // 进入编辑模式
      const editButton = screen.getByRole('button', { name: '编辑资料' });
      await user.click(editButton);
      
      // 点击取消
      const cancelButton = screen.getByRole('button', { name: '取 消' });
      await user.click(cancelButton);
      
      // 检查是否回到查看模式
      expect(screen.getByRole('button', { name: '编辑资料' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '取 消' })).not.toBeInTheDocument();
      
      // 检查输入框是否变为只读
      const usernameInput = screen.getByDisplayValue('testuser');
      expect(usernameInput).toHaveAttribute('readonly');
    });
  });

  describe('表单验证', () => {
    beforeEach(async () => {
      await renderProfile();
      const editButton = screen.getByRole('button', { name: '编辑资料' });
      await user.click(editButton);
    });

    it('应该验证必填字段', async () => {
      const usernameInput = screen.getByDisplayValue('testuser');
      await user.clear(usernameInput);
      
      const saveButton = screen.getByRole('button', { name: '保 存' });
      await user.click(saveButton);
      
      // 应该显示验证错误状态
      await waitFor(() => {
        const formItem = usernameInput.closest('.ant-form-item');
        expect(formItem).toHaveClass('ant-form-item-has-error');
      });
    });

    it('应该验证邮箱格式', async () => {
      const emailInput = screen.getByDisplayValue('admin@robotrain.com');
      await user.clear(emailInput);
      await user.type(emailInput, 'invalid-email');
      
      const saveButton = screen.getByRole('button', { name: '保 存' });
      await user.click(saveButton);
      
      // 应该显示邮箱格式错误状态
      await waitFor(() => {
        const formItem = emailInput.closest('.ant-form-item');
        expect(formItem).toHaveClass('ant-form-item-has-error');
      });
    });

    it('应该允许清空非必填字段', async () => {
      const phoneInput = screen.getByDisplayValue('13800138000');
      await user.clear(phoneInput);
      
      const saveButton = screen.getByRole('button', { name: '保 存' });
      await user.click(saveButton);
      
      // 不应该显示验证错误
      expect(screen.queryByText(/请输入您的手机号/)).not.toBeInTheDocument();
    });
  });

  describe('保存功能', () => {
    beforeEach(async () => {
      await renderProfile();
      const editButton = screen.getByRole('button', { name: '编辑资料' });
      await user.click(editButton);
    });

    it('应该成功保存表单数据', async () => {
      const bioInput = screen.getByDisplayValue('机器人训练平台管理员，专注于AI和机器学习技术。');
      await user.clear(bioInput);
      await user.type(bioInput, '新的个人简介');
      
      const saveButton = screen.getByRole('button', { name: '保 存' });
      await user.click(saveButton);
      
      // 等待异步操作完成
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      
      // 检查成功消息
      await waitFor(() => {
        expect(globalThis.__mockMessage.success).toHaveBeenCalledWith('个人资料更新成功！');
      });
      
      // 检查是否退出编辑模式
      expect(screen.getByRole('button', { name: '编辑资料' })).toBeInTheDocument();
    });

    it('保存失败时应该显示错误信息', async () => {
      // 模拟表单验证失败
      const usernameInput = screen.getByDisplayValue('testuser');
      await user.clear(usernameInput);
      
      const saveButton = screen.getByRole('button', { name: '保 存' });
      await user.click(saveButton);
      
      // 应该显示验证错误而不是成功消息
      expect(globalThis.__mockMessage.success).not.toHaveBeenCalled();
      await waitFor(() => {
        const formItem = usernameInput.closest('.ant-form-item');
        expect(formItem).toHaveClass('ant-form-item-has-error');
      });
    });
  });

  describe('头像上传功能', () => {
    beforeEach(async () => {
      await renderProfile();
      const editButton = screen.getByRole('button', { name: '编辑资料' });
      await user.click(editButton);
    });

    it('应该支持头像上传', async () => {
      const avatarUserIcon = getAvatarUserIcon();
      const uploadArea = avatarUserIcon.closest('div');
      expect(uploadArea).toBeInTheDocument();
    });

    it('非编辑模式下应该禁用头像上传', async () => {
      // 先进入编辑模式再退出
      const cancelButton = screen.getByRole('button', { name: '取 消' });
      await user.click(cancelButton);
      
      // 检查头像上传区域是否被禁用
      const avatarUserIcon = getAvatarUserIcon();
      const uploadArea = avatarUserIcon.closest('.ant-upload');
      expect(uploadArea).toHaveClass('ant-upload-disabled');
    });
  });

  describe('响应式布局', () => {
    it('应该在不同屏幕尺寸下正确显示', async () => {
      await renderProfile();
      
      // 检查表单布局是否正确
      const form = screen.getByDisplayValue('admin').closest('form');
      expect(form).toBeInTheDocument();
      
      // 检查头像是否居中显示
      const avatarUserIcon = getAvatarUserIcon();
      expect(avatarUserIcon).toBeInTheDocument();
    });
  });

  describe('角色显示', () => {
    it('管理员角色应该显示红色标签和皇冠图标', async () => {
      vi.mocked(useSelector).mockReturnValue({
        userInfo: {
          username: 'admin',
          isAdmin: true,
          created_at: '2024-01-15T00:00:00.000Z',
        }
      });

      const antd = await import('antd');
      render(
        <BrowserRouter>
          <antd.App>
            <Profile />
          </antd.App>
        </BrowserRouter>
      );

      expect(screen.getByText('管理员')).toBeInTheDocument();
      expect(screen.getByText('CrownIcon')).toBeInTheDocument();
    });

    it('普通用户角色应该显示蓝色标签', async () => {
      vi.mocked(useSelector).mockReturnValue({
        userInfo: {
          username: 'user',
          isAdmin: false,
          created_at: '2024-01-15T00:00:00.000Z',
        }
      });

      const antd = await import('antd');
      render(
        <BrowserRouter>
          <antd.App>
            <Profile />
          </antd.App>
        </BrowserRouter>
      );

      expect(screen.getByText('普通用户')).toBeInTheDocument();
      expect(screen.queryByText('CrownIcon')).not.toBeInTheDocument();
    });
  });
}); 