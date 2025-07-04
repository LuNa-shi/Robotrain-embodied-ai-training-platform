import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Button, Avatar, Typography, Menu, Tooltip, message } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '@/store/slices/userSlice';
import {
  QuestionCircleOutlined,
  SettingOutlined,
  UserOutlined,
  HomeOutlined,
  PlaySquareOutlined,
  DatabaseOutlined,
  LeftOutlined, // 引入新图标
  RightOutlined, // 引入新图标
  TeamOutlined, // 管理图标
  ControlOutlined, // 控制/管理图标
  AppstoreOutlined, // 应用管理图标
  LogoutOutlined, // 登出图标
  ExperimentOutlined, // 评估测试图标
  RocketOutlined, // 发起训练图标
  BarChartOutlined, // 图表图标
} from '@ant-design/icons';
import styles from './BasicLayout.module.css';

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const BasicLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const { userInfo } = useSelector((state) => state.user);
  
  // 1. 添加状态来控制侧边栏的收缩
  const [collapsed, setCollapsed] = useState(false);
  
  // 2. 添加响应式逻辑，根据屏幕宽度自动控制侧边栏状态
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 992) {
        setCollapsed(true);
      }
    };
    
    // 初始化时检查屏幕宽度
    handleResize();
    
    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);
    
    // 清理事件监听器
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 根据用户角色动态生成菜单项
  const menuItems = [
    { key: '/home', icon: <HomeOutlined />, label: '首页' },
    { key: '/data-center', icon: <DatabaseOutlined />, label: '数据中心' },
    { key: '/training', icon: <RocketOutlined />, label: '发起训练' },
    { key: '/project-center', icon: <PlaySquareOutlined />, label: '项目中心' },
    { key: '/evaluation', icon: <BarChartOutlined />, label: '模型评估' },
    ...(userInfo?.isAdmin ? [
      { type: 'divider' },
      { key: '/data-management', icon: <ControlOutlined />, label: '数据管理' },
      { key: '/project-management', icon: <AppstoreOutlined />, label: '项目管理' },
    ] : []),
    { type: 'divider' },
    { key: '/profile', icon: <UserOutlined />, label: '个人资料' },
    { key: '/settings', icon: <SettingOutlined />, label: '系统设置' },
  ];

  const handleMenuClick = ({ key }) => navigate(key);

  // 处理帮助文档点击，在新标签页中打开
  const handleHelpClick = () => {
    window.open('/help', '_blank');
  };

  // 添加登出处理函数
  const handleLogout = async () => {
    try {
      const result = await dispatch(logoutUser()).unwrap();
      
      // 显示登出成功消息
      message.success('登出成功！');
      
      navigate('/user/login');
    } catch (error) {
      // 处理登出失败的情况
      if (error === '登出处理失败，但已清除本地数据') {
        message.warning('登出处理异常，但已清除本地数据');
        navigate('/user/login');
      } else {
        message.error('登出失败，请重试');
      }
    }
  };

  return (
    <Layout className={styles.appLayout}>
      {/* 背景图片层 */}
      <div className={styles.mainBg} />
      {/* 侧边栏，固定在页面最左侧，logo区在顶部 */}
      <Sider
        theme="light"
        width={220}
        collapsedWidth={80}
        className={styles.sider}
        collapsible
        collapsed={collapsed}
        trigger={null}
        style={{ position: 'fixed', left: 0, top: 0, height: '100vh', zIndex: 100 }}
      >
        <div className={styles.logoBar}>
          <div
            className={styles.logoClickable}
            onClick={() => navigate('/home')}
            style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
          >
            <img src="/logo.svg" alt="logo" className={styles.logoImage} />
            {!collapsed && (
              <Title level={3} style={{ margin: 0, whiteSpace: 'nowrap', lineHeight: '1', fontFamily: 'Consolas', fontSize: '24px', fontWeight: '600' }}>
                RoboTrain
              </Title>
            )}
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          className={styles.siderMenu}
          inlineCollapsed={collapsed}
        />
        <div className={styles.siderCollapseButton} onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <RightOutlined /> : <LeftOutlined />}
          {!collapsed && window.innerWidth > 992 && <span style={{ marginLeft: '8px' }}>收起侧边栏</span>}
        </div>
      </Sider>
      {/* 右侧主区域，Header固定在页面右上角，Content加padding-top，整体margin-left等于侧边栏宽度 */}
      <Layout style={{ marginLeft: collapsed ? 80 : 220, minHeight: '100vh' }}>
        <Header
          className={styles.header}
          style={{
            position: 'fixed',
            right: 0,
            top: 0,
            zIndex: 10,
            width: `calc(100vw - ${collapsed ? 80 : 220}px)`
          }}
        >
          <div className={styles.headerMenu}>
            <Button type="text" icon={<QuestionCircleOutlined />} onClick={handleHelpClick}>
              文档帮助
            </Button>
            <Tooltip title="设置">
              <Button shape="circle" icon={<SettingOutlined />} onClick={() => navigate('/settings')} />
            </Tooltip>
            <Tooltip title="个人资料">
              <Avatar icon={<UserOutlined />} onClick={() => navigate('/profile')} style={{ cursor: 'pointer' }} />
            </Tooltip>
            <Tooltip title="登出">
              <Button 
                shape="circle" 
                icon={<LogoutOutlined />} 
                onClick={handleLogout}
                style={{ marginLeft: '8px' }}
              />
            </Tooltip>
          </div>
        </Header>
        <Content
          className={styles.pageContent}
          style={{ paddingTop: 64 }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default BasicLayout;