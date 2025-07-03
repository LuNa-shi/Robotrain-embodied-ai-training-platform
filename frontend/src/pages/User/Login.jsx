import React, { useState } from 'react';
import { Form, Input, Button, Checkbox, Typography, Switch, App } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { loginUser } from '@/store/slices/userSlice';
import { debugUserInfo } from '@/utils/debug';
import styles from './Login.module.css';

const { Title, Text } = Typography;

const Login = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const { message } = App.useApp();

  // 手动处理登录和验证逻辑
  const handleLogin = async () => {
    // 获取当前输入框的值
    const values = form.getFieldsValue();
    
    // 手动进行验证
    if (!values.username || !values.password) {
      // 如果有空值，显示错误消息
      if (!values.username) {
        message.error('请输入您的用户名!', 3);
      }
      if (!values.password) {
        message.error('请输入您的密码!', 3);
      }
      return; // 阻止后续操作
    }

    // --- 所有验证都通过后，才执行以下登录逻辑 ---
    setLoading(true);
    
    try {
      console.log('登录信息:', {
        username: values.username,
        password: values.password
      });
      
      // 使用Redux action进行登录
      const result = await dispatch(loginUser({ username: values.username, password: values.password }));
      
      if (loginUser.fulfilled.match(result)) {
        // 登录成功
        message.success('登录成功！正在跳转...', 2);
        
        // 在开发环境下运行调试
        if (import.meta.env.DEV) {
          console.log('登录成功，运行调试信息...');
          debugUserInfo();
        }
        
        // 延迟跳转，让用户看到成功消息
        setTimeout(() => {
          console.log('准备跳转到主页');
          navigate('/home');
        }, 1000);
      } else {
        // 登录失败，错误信息已经在Redux中处理
        message.error(result.payload || '登录失败，请稍后重试', 3);
      }
      
    } catch (error) {
      console.error('登录失败:', error);
      message.error(error.message || '登录失败，请稍后重试', 3);
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

      {/* 右侧的登录表单区域 */}
      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>
          <div className={styles.formHeader}>
            <Title level={3}>欢迎回来</Title>
            <Text type="secondary">请使用您的凭证登录平台</Text>
          </div>
          
          <Form
            form={form} // 关联表单实例
            name="normal_login"
            className={styles.loginForm}
            initialValues={{
              remember: true,
            }}
            size="large"
          >
            <Form.Item
              name="username"
            >
              <Input
                prefix={<UserOutlined className="site-form-item-icon" />}
                placeholder="用户名"
                disabled={loading}
              />
            </Form.Item>
            <Form.Item
              name="password"
            >
              <Input.Password
                prefix={<LockOutlined className="site-form-item-icon" />}
                type="password"
                placeholder="密码"
                onPressEnter={handleLogin} // 按回车键时触发登录
                disabled={loading}
              />
            </Form.Item>
            <Form.Item>
              <div className={styles.formExtras}>
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox disabled={loading}>记住我</Checkbox>
                </Form.Item>
                <a className={styles.loginFormForgot} href="">
                  忘记密码
                </a>
              </div>
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                className={styles.loginFormButton}
                loading={loading}
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? '登录中...' : '登录'}
              </Button>
            </Form.Item>
            <div className={styles.formFooter}>
              还没有账户? <Link to="/user/register">立即注册!</Link>
            </div>
            <div className={styles.loginTips}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                请使用您的真实账号登录系统<br/>
                如果您还没有账号，请先注册
              </Text>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Login;
