import React, { useState } from 'react';
import { 
  Card, 
  Typography, 
  Form, 
  Switch, 
  Select, 
  InputNumber, 
  Button, 
  Divider, 
  Row, 
  Col, 
  Tabs,
  Radio,
  Slider,
  message,
  Alert
} from 'antd';
import { 
  SettingOutlined, 
  BellOutlined, 
  SecurityScanOutlined, 
  GlobalOutlined,
  SaveOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import styles from './Settings.module.css';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const Settings = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // 模拟设置数据
  const [settings, setSettings] = useState({
    // 通用设置
    language: 'zh-CN',
    theme: 'light',
    autoSave: true,
    autoSaveInterval: 5,
    
    // 通知设置
    emailNotifications: true,
    pushNotifications: false,
    trainingComplete: true,
    systemUpdates: false,
    errorAlerts: true,
    
    // 安全设置
    twoFactorAuth: false,
    sessionTimeout: 30,
    passwordExpiry: 90,
    loginAttempts: 5,
    
    // 性能设置
    maxConcurrentTasks: 3,
    memoryLimit: 8,
    gpuAcceleration: true,
    cacheEnabled: true,
    cacheSize: 512
  });

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      
      // 模拟设置保存（实际项目中应调用后端API）
      setTimeout(() => {
        setSettings({ ...settings, ...values });
        setLoading(false);
        message.success('设置保存成功！');
      }, 1000);
    } catch (error) {
      console.log('验证失败:', error);
    }
  };

  const handleReset = () => {
    form.setFieldsValue(settings);
    message.info('设置已重置为默认值');
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
  };

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.settingsHeader}>
        <Title level={1}>系统设置</Title>
        <Text type="secondary">自定义您的平台使用体验</Text>
      </div>

      <Card className={styles.settingsCard}>
        <Form
          form={form}
          layout="vertical"
          initialValues={settings}
          className={styles.settingsForm}
        >
          <Row gutter={[24, 16]}>
            <Col xs={24} md={12}>
              <div className={styles.settingItem}>
                <Form.Item name="language" label="界面语言">
                  <Select placeholder="选择语言">
                    <Option value="zh-CN">简体中文</Option>
                    <Option value="en-US">English</Option>
                    <Option value="ja-JP">日本語</Option>
                  </Select>
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className={styles.settingItem}>
                <Form.Item name="theme" label="主题模式">
                  <Select placeholder="选择主题">
                    <Option value="light">浅色主题</Option>
                    <Option value="dark">深色主题</Option>
                    <Option value="auto">跟随系统</Option>
                  </Select>
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className={styles.settingItem}>
                <Form.Item name="autoSave" label="自动保存">
                  <Select placeholder="选择是否启用">
                    <Option value={true}>是</Option>
                    <Option value={false}>否</Option>
                  </Select>
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className={styles.settingItem}>
                <Form.Item name="autoSaveInterval" label="自动保存间隔（分钟）">
                  <Select placeholder="选择间隔时间">
                    <Option value={1}>1分钟</Option>
                    <Option value={5}>5分钟</Option>
                    <Option value={10}>10分钟</Option>
                    <Option value={15}>15分钟</Option>
                    <Option value={30}>30分钟</Option>
                    <Option value={60}>60分钟</Option>
                  </Select>
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className={styles.settingItem}>
                <Form.Item name="emailNotifications" label="邮件通知">
                  <Select placeholder="选择是否启用">
                    <Option value={true}>是</Option>
                    <Option value={false}>否</Option>
                  </Select>
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className={styles.settingItem}>
                <Form.Item name="pushNotifications" label="推送通知">
                  <Select placeholder="选择是否启用">
                    <Option value={true}>是</Option>
                    <Option value={false}>否</Option>
                  </Select>
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className={styles.settingItem}>
                <Form.Item name="trainingComplete" label="训练完成通知">
                  <Select placeholder="选择是否启用">
                    <Option value={true}>是</Option>
                    <Option value={false}>否</Option>
                  </Select>
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className={styles.settingItem}>
                <Form.Item name="systemUpdates" label="系统更新通知">
                  <Select placeholder="选择是否启用">
                    <Option value={true}>是</Option>
                    <Option value={false}>否</Option>
                  </Select>
                </Form.Item>
              </div>
            </Col>
            <Col xs={24} md={12}>
              <div className={styles.settingItem}>
                <Form.Item name="errorAlerts" label="错误警报">
                  <Select placeholder="选择是否启用">
                    <Option value={true}>是</Option>
                    <Option value={false}>否</Option>
                  </Select>
                </Form.Item>
              </div>
            </Col>
          </Row>
          <div className={styles.settingsActions}>
            <Button icon={<ReloadOutlined />} onClick={handleReset}>重置设置</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={loading} onClick={handleSave}>保存设置</Button>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default Settings;
