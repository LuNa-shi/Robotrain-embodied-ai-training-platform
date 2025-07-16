import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { 
  Card, 
  Avatar, 
  Typography, 
  Button, 
  Form, 
  Input, 
  Upload, 
  Row, 
  Col, 
  Tag,
  App,
  Space
} from 'antd';
import { 
  UserOutlined, 
  MailOutlined, 
  PhoneOutlined, 
  EditOutlined, 
  SaveOutlined, 
  CameraOutlined,
  CalendarOutlined,
  EnvironmentOutlined,
  CrownOutlined
} from '@ant-design/icons';
import styles from './Profile.module.css';

const { Title, Text } = Typography;
const { TextArea } = Input;

const Profile = () => {
  const { message: contextMessage } = App.useApp();
  const message = contextMessage || require('antd').message;
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  // 从Redux store获取用户信息
  const { userInfo } = useSelector(state => state.user);

  const [userData, setUserData] = useState({
    username: 'admin',
    email: 'admin@robotrain.com',
    phone: '13800138000',
    avatar: null,
    bio: '机器人训练平台管理员，专注于AI和机器学习技术。',
    location: '北京',
    joinDate: '2024-01-15',
    role: '管理员',
  });

  // 当用户信息更新时，同步更新本地状态
  useEffect(() => {
    if (userInfo) {
      setUserData(prev => ({
        ...prev,
        username: userInfo.username || prev.username,
        role: userInfo.isAdmin ? '管理员' : '普通用户',
        joinDate: userInfo.created_at ? new Date(userInfo.created_at).toLocaleDateString('zh-CN') : prev.joinDate,
      }));
    }
  }, [userInfo]);



  const handleEdit = () => {
    form.setFieldsValue(userData);
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      // 直接同步保存
      setUserData({ ...userData, ...values });
      setEditing(false);
      setLoading(false);
      message.success('个人资料更新成功！');
    } catch (error) {
      console.log('验证失败:', error);
    }
  };

  const handleCancel = () => {
    setEditing(false);
  };

  const uploadProps = {
    name: 'avatar',
    showUploadList: false,
    beforeUpload: (file) => {
      // ... (upload logic remains the same)
      return false;
    },
  };

  return (
    <div className={styles.profileContainer}>
      <div className={styles.profileHeader}>
        <Title level={1}>个人资料</Title>
        <Text type="secondary">管理您的个人信息和账户设置</Text>
      </div>

      <div className={styles.contentWrapper}>
        {/* 主要信息卡片 */}
        <Card className={styles.profileCard}>
          <Form
            form={form}
            layout="vertical"
            initialValues={userData}
            className={styles.profileForm}
          >
            <Row gutter={24}>
              <Col span={24} style={{ textAlign: 'center', marginBottom: '24px' }}>
                <Upload {...uploadProps} disabled={!editing}>
                  <div className={styles.avatarWrapper}>
                    <Avatar size={100} src={userData.avatar} icon={<UserOutlined />} />
                    {editing && <div className={styles.avatarOverlay}><CameraOutlined /></div>}
                  </div>
                </Upload>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="username" label="用户名" rules={[{ required: true }]}> 
                  <Input prefix={<UserOutlined />} readOnly={!editing} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="email" label="邮箱地址" rules={[{ type: 'email' }]}> 
                  <Input prefix={<MailOutlined />} readOnly={!editing} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="phone" label="手机号"> 
                  <Input prefix={<PhoneOutlined />} readOnly={!editing} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item name="location" label="地区"> 
                  <Input prefix={<EnvironmentOutlined />} readOnly={!editing} />
                </Form.Item>
              </Col>
              <Col xs={24}>
                <Form.Item name="bio" label="个人简介"> 
                  <TextArea rows={4} maxLength={200} showCount readOnly={!editing} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="角色">
                  <Tag color={userData.role === '管理员' ? 'red' : 'blue'}>
                    {userData.role === '管理员' && <CrownOutlined style={{ marginRight: 4 }} />}
                    {userData.role}
                  </Tag>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <Form.Item label="加入时间">
                  <span><CalendarOutlined style={{ marginRight: 6 }} />{userData.joinDate}</span>
                </Form.Item>
              </Col>
            </Row>
            <div style={{ textAlign: 'right', marginTop: 16 }}>
              {!editing && (
                <Button type="primary" onClick={() => { form.setFieldsValue(userData); setEditing(true); }}>编辑资料</Button>
              )}
              {editing && (
                <Space>
                  <Button onClick={handleCancel}>取消</Button>
                  <Button type="primary" loading={loading} onClick={handleSave}>保存</Button>
                </Space>
              )}
            </div>
          </Form>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
