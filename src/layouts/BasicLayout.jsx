import React, { useState } from 'react'; // 移除 useEffect
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Button, Avatar, Typography, Menu, Tooltip, message } from 'antd';
import { useDispatch, useSelector } from 'react-redux';
import { logoutUser } from '@/store/slices/userSlice';
import {
  QuestionCircleOutlined,
  SettingOutlined,
  UserOutlined,
  UploadOutlined,
  PlaySquareOutlined,
  DatabaseOutlined,
  LeftOutlined, // 引入新图标
  RightOutlined, // 引入新图标
  TeamOutlined, // 管理图标
  ControlOutlined, // 控制/管理图标
  AppstoreOutlined, // 应用管理图标
  LogoutOutlined, // 登出图标
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

  // 根据用户角色动态生成菜单项
  const menuItems = [
    { key: '/home', icon: <UploadOutlined />, label: '上传数据' },
    { key: '/data-records', icon: <DatabaseOutlined />, label: '数据记录' },
    { key: '/training-records', icon: <PlaySquareOutlined />, label: '训练记录' },
    ...(userInfo?.isAdmin ? [
      { type: 'divider' },
      { key: '/data-management', icon: <ControlOutlined />, label: '数据管理' },
      { key: '/training-management', icon: <AppstoreOutlined />, label: '训练管理' },
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
      <Header className={styles.header}>
        <div className={styles.logoBar}>
          <img src="/logo.svg" alt="logo" className={styles.logoImage} />
          <Title level={3} style={{ margin: 0, whiteSpace: 'nowrap', lineHeight: '1', fontFamily: 'Consolas', fontSize: '24px', fontWeight: '600' }}>
            RoboTrain
          </Title>
        </div>
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
      <Layout>
        <Sider 
          theme="light" 
          width={220} 
          className={styles.sider}
          collapsible // 允许收缩
          collapsed={collapsed} // 2. 将Sider的收缩状态与我们的state同步
          trigger={null} // 隐藏Antd自带的trigger，因为我们要自定义
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={handleMenuClick}
            className={styles.siderMenu}
            inlineCollapsed={collapsed} // 3. 将Menu的收缩状态与我们的state同步
          />
          {/* 4. 添加自定义的收缩/展开按钮 */}
          <div className={styles.siderCollapseButton} onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <RightOutlined /> : <LeftOutlined />}
            {!collapsed && <span style={{ marginLeft: '8px' }}>收起侧边栏</span>}
          </div>
        </Sider>
        <Content className={styles.pageContent}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default BasicLayout;