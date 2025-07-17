import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { vi } from 'vitest';
import BasicLayout from '@/layouts/BasicLayout';

// --- Mocks ---
const mockNavigate = vi.fn();
const mockDispatch = vi.fn();
const mockLogoutUser = vi.fn();

vi.mock('react-router-dom', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ pathname: '/home' })
  };
});

vi.mock('react-redux', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    useDispatch: () => mockDispatch,
    useSelector: vi.fn()
  };
});

vi.mock('@/store/slices/userSlice', () => ({
  logoutUser: () => mockLogoutUser()
}));

// 解决hoist问题，mockMessage定义在globalThis
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal();
  globalThis.__mockMessage = {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  };
  const MockApp = ({ children }) => children;
  MockApp.useApp = () => ({
    message: globalThis.__mockMessage,
    notification: vi.fn(),
    modal: vi.fn(),
  });
  return {
    ...actual,
    App: MockApp,
    message: globalThis.__mockMessage,
  };
});

vi.mock('@ant-design/icons', () => ({
  QuestionCircleOutlined: () => <span>QuestionIcon</span>,
  SettingOutlined: () => <span>SettingIcon</span>,
  UserOutlined: () => <span>UserIcon</span>,
  HomeOutlined: () => <span>HomeIcon</span>,
  PlaySquareOutlined: () => <span>PlayIcon</span>,
  DatabaseOutlined: () => <span>DatabaseIcon</span>,
  LeftOutlined: () => <span>LeftIcon</span>,
  RightOutlined: () => <span>RightIcon</span>,
  TeamOutlined: () => <span>TeamIcon</span>,
  ControlOutlined: () => <span>ControlIcon</span>,
  AppstoreOutlined: () => <span>AppIcon</span>,
  LogoutOutlined: () => <span>LogoutIcon</span>,
  ExperimentOutlined: () => <span>ExperimentIcon</span>,
  RocketOutlined: () => <span>RocketIcon</span>,
  BarChartOutlined: () => <span>ChartIcon</span>,
}));

// Mock window.open
const mockOpen = vi.fn();
Object.defineProperty(window, 'open', {
  value: mockOpen,
  writable: true,
});

// Mock window.innerWidth
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  value: 1200,
});

// Mock window.addEventListener and removeEventListener
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();
Object.defineProperty(window, 'addEventListener', {
  value: mockAddEventListener,
  writable: true,
});
Object.defineProperty(window, 'removeEventListener', {
  value: mockRemoveEventListener,
  writable: true,
});

// --- 测试套件 ---
describe('BasicLayout', () => {
  let user;
  let mockStore;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { useSelector } = await import('react-redux');
    useSelector.mockReturnValue({
      userInfo: {
        username: 'testuser',
        email: 'test@example.com',
        isAdmin: false
      }
    });
    mockStore = configureStore({
      reducer: {
        user: (state = { userInfo: { username: 'testuser' } }, action) => state
      }
    });
    user = userEvent.setup();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      value: 1200,
    });
    // 重置message mock
    globalThis.__mockMessage.success.mockClear();
    globalThis.__mockMessage.error.mockClear();
    globalThis.__mockMessage.warning.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderBasicLayout = () => {
    const antd = require('antd');
    return render(
      <Provider store={mockStore}>
        <BrowserRouter>
          <antd.App>
            <Routes>
              <Route path="/*" element={<BasicLayout />}>
                <Route index element={<div>Home Content</div>} />
                <Route path="home" element={<div>Home Content</div>} />
                <Route path="data-center" element={<div>Data Center Content</div>} />
                <Route path="training" element={<div>Training Content</div>} />
                <Route path="project-center" element={<div>Project Center Content</div>} />
                <Route path="evaluation" element={<div>Evaluation Content</div>} />
                <Route path="profile" element={<div>Profile Content</div>} />
              </Route>
            </Routes>
          </antd.App>
        </BrowserRouter>
      </Provider>
    );
  };

  describe('页面渲染', () => {
    it('应该正确渲染BasicLayout的所有主要元素', async () => {
      renderBasicLayout();
      expect(screen.getByAltText('logo')).toBeInTheDocument();
      expect(screen.getByText('RoboTrain')).toBeInTheDocument();
      expect(screen.getByText('首页')).toBeInTheDocument();
      expect(screen.getByText('数据中心')).toBeInTheDocument();
      expect(screen.getByText('发起训练')).toBeInTheDocument();
      expect(screen.getByText('项目中心')).toBeInTheDocument();
      expect(screen.getByText('模型评估')).toBeInTheDocument();
      expect(screen.getByText('个人资料')).toBeInTheDocument();
      expect(screen.getByText('文档帮助')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /LogoutIcon/ })).toBeInTheDocument();
    });

    it('应该正确渲染内容区域', async () => {
      renderBasicLayout();
      expect(screen.getByText('Home Content')).toBeInTheDocument();
    });
  });

  describe('侧边栏功能', () => {
    it('应该能够展开和收起侧边栏', async () => {
      renderBasicLayout();
      
      // 初始状态应该是展开的
      expect(screen.getByText('收起侧边栏')).toBeInTheDocument();
      
      // 点击收起按钮
      const collapseButton = screen.getByText('收起侧边栏');
      await user.click(collapseButton);
      
      // 检查按钮文本变化
      expect(screen.getByText('RightIcon')).toBeInTheDocument();
    });

    it('应该能够通过点击logo跳转到首页', async () => {
      renderBasicLayout();
      
      const logo = screen.getByAltText('logo');
      await user.click(logo);
      
      expect(mockNavigate).toHaveBeenCalledWith('/home');
    });

    it('应该能够通过菜单项进行导航', async () => {
      renderBasicLayout();
      
      // 点击数据中心菜单项
      await user.click(screen.getByText('数据中心'));
      expect(mockNavigate).toHaveBeenCalledWith('/data-center');
      
      // 点击发起训练菜单项
      await user.click(screen.getByText('发起训练'));
      expect(mockNavigate).toHaveBeenCalledWith('/training');
      
      // 点击项目中心菜单项
      await user.click(screen.getByText('项目中心'));
      expect(mockNavigate).toHaveBeenCalledWith('/project-center');
      
      // 点击模型评估菜单项
      await user.click(screen.getByText('模型评估'));
      expect(mockNavigate).toHaveBeenCalledWith('/evaluation');
      
      // 点击个人资料菜单项
      await user.click(screen.getByText('个人资料'));
      expect(mockNavigate).toHaveBeenCalledWith('/profile');
    });
  });

  describe('头部功能', () => {
    it('应该验证message mock正常工作', () => {
      globalThis.__mockMessage.success('测试消息');
      expect(globalThis.__mockMessage.success).toHaveBeenCalledWith('测试消息');
    });

    it('应该能够点击文档帮助按钮', async () => {
      renderBasicLayout();
      const helpButton = screen.getByText('文档帮助');
      await user.click(helpButton);
      expect(mockOpen).toHaveBeenCalledWith('/help', '_blank');
    });

    it('应该能够点击头像跳转到个人资料', async () => {
      renderBasicLayout();
      // 头像是UserIcon的span，页面有多个UserIcon，取最后一个
      const avatars = screen.getAllByText('UserIcon');
      await user.click(avatars[avatars.length - 1]);
      expect(mockNavigate).toHaveBeenCalledWith('/profile');
    });

    it('应该能够成功登出', async () => {
      // mockDispatch返回带有unwrap方法的Promise对象
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.resolve({ success: true })
      });
      renderBasicLayout();
      const logoutButton = screen.getByRole('button', { name: /LogoutIcon/ });
      await user.click(logoutButton);
      expect(mockDispatch).toHaveBeenCalled();
      await waitFor(() => {
        expect(globalThis.__mockMessage.success).toHaveBeenCalledWith('登出成功！');
      });
      expect(mockNavigate).toHaveBeenCalledWith('/user/login');
    });
    it('应该处理登出失败的情况', async () => {
      const error = '登出处理失败，但已清除本地数据';
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(error)
      });
      renderBasicLayout();
      const logoutButton = screen.getByRole('button', { name: /LogoutIcon/ });
      await user.click(logoutButton);
      await waitFor(() => {
        expect(globalThis.__mockMessage.warning).toHaveBeenCalledWith('登出处理异常，但已清除本地数据');
      });
      expect(mockNavigate).toHaveBeenCalledWith('/user/login');
    });
    it('应该处理其他登出错误', async () => {
      const error = '网络错误';
      mockDispatch.mockReturnValue({
        unwrap: () => Promise.reject(error)
      });
      renderBasicLayout();
      const logoutButton = screen.getByRole('button', { name: /LogoutIcon/ });
      await user.click(logoutButton);
      await waitFor(() => {
        expect(globalThis.__mockMessage.error).toHaveBeenCalledWith('登出失败，请重试');
      });
    });
  });

  describe('响应式功能', () => {
    it('应该在屏幕宽度小于等于992px时自动收起侧边栏', async () => {
      // 模拟小屏幕
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        value: 800,
      });
      
      renderBasicLayout();
      
      // 检查是否监听了resize事件
      expect(mockAddEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('应该在组件卸载时清理事件监听器', async () => {
      const { unmount } = renderBasicLayout();
      
      unmount();
      
      expect(mockRemoveEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    });
  });

  describe('菜单选中状态', () => {
    it('应该根据当前路径正确高亮菜单项', () => {
      // 由于useLocation已经在vi.mock中设置了默认值，这里测试默认的/home路径
      renderBasicLayout();
      
      // 首页菜单项应该被选中
      const homeMenuItem = screen.getByText('首页').closest('li');
      expect(homeMenuItem).toHaveClass('ant-menu-item-selected');
    });
  });

  describe('CSS模块样式', () => {
    it('应该正确应用CSS模块样式', async () => {
      renderBasicLayout();
      
      // 检查主要容器是否应用了样式类（CSS模块会生成动态类名）
      const layout = document.querySelector('[class*="appLayout"]');
      expect(layout).toBeInTheDocument();
      
      const sider = document.querySelector('[class*="sider"]');
      expect(sider).toBeInTheDocument();
      
      const header = document.querySelector('[class*="header"]');
      expect(header).toBeInTheDocument();
    });
  });

  describe('边界情况', () => {
    it('应该在没有用户信息时正常工作', async () => {
      const { useSelector } = await import('react-redux');
      useSelector.mockReturnValue({
        userInfo: null
      });
      
      renderBasicLayout();
      
      // 应该仍然能正常渲染
      expect(screen.getByText('RoboTrain')).toBeInTheDocument();
    });

    it('应该处理异步操作的错误边界', async () => {
      // 设置mockDispatch抛出错误
      mockDispatch.mockRejectedValue(new Error('Network error'));
      renderBasicLayout();
      
      const logoutButton = screen.getByRole('button', { name: /LogoutIcon/ });
      await user.click(logoutButton);
      
      await waitFor(() => {
        expect(globalThis.__mockMessage.error).toHaveBeenCalledWith('登出失败，请重试');
      });
    });
  });
}); 