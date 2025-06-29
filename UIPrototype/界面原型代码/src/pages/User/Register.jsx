import React, { useState } from 'react';
import { Form, Input, Button, Checkbox, Typography, message } from 'antd';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import styles from './Login.module.css';

const { Title, Text } = Typography;

const Register = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  // 处理注册逻辑
  const handleRegister = () => {
    // 先清空之前可能存在的错误提示
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'email', errors: [] },
      { name: 'phone', errors: [] },
      { name: 'password', errors: [] },
      { name: 'confirmPassword', errors: [] },
    ]);

    // 获取当前输入框的值
    const values = form.getFieldsValue();
    
    // 手动进行验证
    if (!values.username || !values.email || !values.phone || !values.password || !values.confirmPassword) {
      // 如果有空值，手动设置错误信息
      if (!values.username) {
        form.setFields([{ name: 'username', errors: ['请输入您的用户名!'] }]);
      }
      if (!values.email) {
        form.setFields([{ name: 'email', errors: ['请输入您的邮箱!'] }]);
      }
      if (!values.phone) {
        form.setFields([{ name: 'phone', errors: ['请输入您的手机号!'] }]);
      }
      if (!values.password) {
        form.setFields([{ name: 'password', errors: ['请输入您的密码!'] }]);
      }
      if (!values.confirmPassword) {
        form.setFields([{ name: 'confirmPassword', errors: ['请确认您的密码!'] }]);
      }
      return;
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(values.email)) {
      form.setFields([{ name: 'email', errors: ['请输入有效的邮箱地址!'] }]);
      return;
    }

    // 验证手机号格式
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(values.phone)) {
      form.setFields([{ name: 'phone', errors: ['请输入有效的手机号!'] }]);
      return;
    }

    // 验证密码长度
    if (values.password.length < 6) {
      form.setFields([{ name: 'password', errors: ['密码长度至少6位!'] }]);
      return;
    }

    // 验证确认密码
    if (values.password !== values.confirmPassword) {
      form.setFields([{ name: 'confirmPassword', errors: ['两次输入的密码不一致!'] }]);
      return;
    }

    // --- 所有验证都通过后，才执行以下注册逻辑 ---
    setLoading(true);
    console.log('Received values of form: ', values);
    
    // 模拟API调用
    setTimeout(() => {
      message.success('注册成功！即将跳转到登录页面...');
      setLoading(false);
      navigate('/user/login');
    }, 1000);
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
            }}
            size="large"
          >
            <Form.Item
              name="username"
            >
              <Input
                prefix={<UserOutlined className="site-form-item-icon" />}
                placeholder="用户名"
              />
            </Form.Item>
            
            <Form.Item
              name="email"
            >
              <Input
                prefix={<MailOutlined className="site-form-item-icon" />}
                placeholder="邮箱地址"
              />
            </Form.Item>
            
            <Form.Item
              name="phone"
            >
              <Input
                prefix={<PhoneOutlined className="site-form-item-icon" />}
                placeholder="手机号码"
              />
            </Form.Item>
            
            <Form.Item
              name="password"
            >
              <Input.Password
                prefix={<LockOutlined className="site-form-item-icon" />}
                type="password"
                placeholder="密码"
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
              />
            </Form.Item>
            
            <Form.Item>
              <div className={styles.formExtras}>
                <Form.Item name="agree" valuePropName="checked" noStyle>
                  <Checkbox>我已阅读并同意 <a href="#">服务条款</a> 和 <a href="#">隐私政策</a></Checkbox>
                </Form.Item>
              </div>
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                className={styles.loginFormButton}
                loading={loading}
                onClick={handleRegister}
              >
                注册
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
