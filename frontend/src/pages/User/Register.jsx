import React, { useState } from 'react';
import { Form, Input, Button, Checkbox, Typography, Switch, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { signupAPI } from '@/utils/auth';
import styles from './Login.module.css';

const { Title, Text } = Typography;

const Register = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  // 处理注册逻辑
  const handleRegister = async () => {
    // 获取当前输入框的值
    const values = form.getFieldsValue();
    
    // 手动进行验证
    if (!values.username || !values.password || !values.confirmPassword) {
      // 如果有空值，显示错误消息
      if (!values.username) {
        message.error('请输入您的用户名!', 3);
      }
      if (!values.password) {
        message.error('请输入您的密码!', 3);
      }
      if (!values.confirmPassword) {
        message.error('请确认您的密码!', 3);
      }
      return;
    }
    
    // 验证密码长度
    if (values.password.length < 6) {
      message.error('密码长度至少6位!', 3);
      return;
    }

    // 验证确认密码
    if (values.password !== values.confirmPassword) {
      message.error('两次输入的密码不一致!', 3);
      return;
    }

    // 验证是否同意服务条款和隐私政策
    if (!values.agree) {
      message.error('请阅读并同意服务条款和隐私政策后才能注册', 3);
      return;
    }

    // --- 所有验证都通过后，才执行以下注册逻辑 ---
    setLoading(true);
    
    try {
      console.log('注册页面 - 表单值:', values);
      console.log('注册页面 - isAdmin值:', values.isAdmin);
      console.log('注册页面 - isAdmin类型:', typeof values.isAdmin);
      
      console.log('注册信息:', {
        username: values.username,
        password: values.password,
        isAdmin: values.isAdmin
      });
      
      // 调用注册API
      const userData = await signupAPI(values.username, values.password, values.isAdmin);
      
      // 显示成功消息
      const adminText = values.isAdmin ? '（管理员权限）' : '';
      const successMsg = `恭喜！用户 "${userData.username}"${adminText} 注册成功！即将跳转到登录页面...`;
      console.log('显示成功消息:', successMsg);
      message.success(successMsg, 3);
      
      // 延迟跳转，让用户看到成功消息
      setTimeout(() => {
        console.log('准备跳转到登录页面');
        navigate('/user/login');
      }, 1000);
      
    } catch (error) {
      console.error('注册失败:', error);
      
      // 直接使用 signupAPI 抛出的错误信息
      message.error(error.message || '注册失败，请稍后重试', 3);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.loginPage}>
      {/* 左侧的视觉展示区域 */}
      <div className={styles.leftPanel}>
        <div className={styles.logoContainer}>
          <img src="/logo.svg" alt="Platform Logo" className={styles.logo} />
          <Title level={2} style={{ color: 'white', marginTop: '20px' }}>
            机器人云端平台
          </Title>
          <Text style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
            一个强大、智能、可扩展的机器人训练与推理解决方案
          </Text>
        </div>
        <div className={styles.dots}>
          {[...Array(10)].map((_, i) => <div key={i} className={styles.dot}></div>)}
        </div>
      </div>

      {/* 右侧的注册表单区域 */}
      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>
          <div className={styles.formHeader}>
            <Title level={3}>创建账户</Title>
            <Text type="secondary">请填写以下信息完成注册</Text>
          </div>
          
          <Form
            form={form}
            name="normal_register"
            className={styles.loginForm}
            initialValues={{
              agree: false,
              isAdmin: false,
            }}
            size="large"
          >
            <Form.Item
              name="username"
            >
              <Input
                prefix={<UserOutlined className="site-form-item-icon" />}
                placeholder="用户名（不超过50个字符）"
                maxLength={50}
                disabled={loading}
              />
            </Form.Item>
            
            <Form.Item
              name="password"
            >
              <Input.Password
                prefix={<LockOutlined className="site-form-item-icon" />}
                type="password"
                placeholder="密码（至少6位）"
                disabled={loading}
              />
            </Form.Item>
            
            <Form.Item
              name="confirmPassword"
            >
              <Input.Password
                prefix={<LockOutlined className="site-form-item-icon" />}
                type="password"
                placeholder="确认密码"
                onPressEnter={handleRegister}
                disabled={loading}
              />
            </Form.Item>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <Text>管理员权限</Text>
            <Form.Item
              name="isAdmin"
              valuePropName="checked"
                noStyle
              >
                <Switch 
                  disabled={loading}
                />
              </Form.Item>
              </div>
            
            <Form.Item
              name="agree"
              valuePropName="checked"
            >
              <div className={styles.formExtras}>
                <Checkbox disabled={loading}>
                  我已阅读并同意 <a href="#" target="_blank" rel="noopener noreferrer">服务条款</a> 和 <a href="#" target="_blank" rel="noopener noreferrer">隐私政策</a>
                </Checkbox>
              </div>
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                className={styles.loginFormButton}
                loading={loading}
                onClick={handleRegister}
                disabled={loading}
              >
                {loading ? '注册中...' : '注册'}
              </Button>
            </Form.Item>
            
            <div className={styles.formFooter}>
              已有账户? <Link to="/user/login">立即登录!</Link>
            </div>
            
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Register;
