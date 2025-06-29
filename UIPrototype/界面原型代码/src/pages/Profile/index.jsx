import React, { useState } from 'react';
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
  Statistic,
  Tag,
  message,
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
  EnvironmentOutlined
} from '@ant-design/icons';
import styles from './Profile.module.css';

const { Title, Text } = Typography;
const { TextArea } = Input;

const Profile = () => {
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

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

  const stats = [
    { title: '上传数据集', value: 25, suffix: '个' },
    { title: '训练模型', value: 12, suffix: '个' },
    { title: '运行时长', value: 168, suffix: '小时' },
    { title: '成功率', value: 95.8, suffix: '%' }
  ];

  const handleEdit = () => {
    form.setFieldsValue(userData);
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      setTimeout(() => {
        setUserData({ ...userData, ...values });
        setEditing(false);
        setLoading(false);
        message.success('个人资料更新成功！');
      }, 1000);
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
                  <Tag color="blue">{userData.role}</Tag>
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

        {/* 使用统计卡片 */}
        <Card
          className={styles.statsCard}
          title={<div className={styles.statsTitle}>使用统计</div>}
        >
          <Row gutter={[16, 16]}>
            {stats.map((stat, index) => (
              <Col xs={12} key={index}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>{stat.title}：</span>
                  <span className={styles.statValue}>{stat.value}{stat.suffix}</span>
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      </div>
    </div>
  );
};

export default Profile;
