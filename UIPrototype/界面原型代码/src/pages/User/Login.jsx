import React, { useState } from 'react';
import { Form, Input, Button, Checkbox, Typography, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import styles from './Login.module.css';

const { Title, Text } = Typography;

const Login = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  // 获取表单实例，用于手动控制
  const [form] = Form.useForm();

  // 手动处理登录和验证逻辑
  const handleLogin = () => {
    // 先清空之前可能存在的错误提示
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
    ]);

    // 获取当前输入框的值
    const values = form.getFieldsValue();
    
    // 手动进行验证
    if (!values.username || !values.password) {
      // 如果有空值，手动设置错误信息
      if (!values.username) {
        form.setFields([{ name: 'username', errors: ['请输入您的用户名!'] }]);
      }
      if (!values.password) {
        form.setFields([{ name: 'password', errors: ['请输入您的密码!'] }]);
      }
      return; // 阻止后续操作
    }

    // --- 所有验证都通过后，才执行以下登录逻辑 ---
    setLoading(true);
    console.log('Received values of form: ', values);
    
    // 模拟API调用
    setTimeout(() => {
      if (values.username === 'admin' && values.password === 'admin') {
        // 管理员登录
        const userInfo = {
          username: values.username,
          role: 'admin',
          isAdmin: true
        };
        localStorage.setItem('userInfo', JSON.stringify(userInfo));
        message.success('管理员登录成功！即将跳转到主页...');
        navigate('/home');
      } else if (values.username === 'user' && values.password === 'user') {
        // 普通用户登录
        const userInfo = {
          username: values.username,
          role: 'user',
          isAdmin: false
        };
        localStorage.setItem('userInfo', JSON.stringify(userInfo));
        message.success('用户登录成功！即将跳转到主页...');
        navigate('/home');
      } else {
        message.error('用户名或密码错误！');
      }
      setLoading(false);
    }, 500);
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
              />
            </Form.Item>
            <Form.Item>
              <div className={styles.formExtras}>
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox>记住我</Checkbox>
                </Form.Item>
                <a className={styles.loginFormForgot} href="">
                  忘记密码
                </a>
              </div>
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                // 移除了 htmlType="submit"，改为普通按钮
                className={styles.loginFormButton}
                loading={loading}
                // 点击按钮时，调用我们自己的验证函数
                onClick={handleLogin}
              >
                登录
              </Button>
            </Form.Item>
            <div className={styles.formFooter}>
              还没有账户? <Link to="/user/register">立即注册!</Link>
            </div>
            <div className={styles.loginTips}>
              <Text type="secondary" style={{ fontSize: '12px' }}>
                测试账号：<br/>
                管理员 - 用户名：admin，密码：admin<br/>
                普通用户 - 用户名：user，密码：user
              </Text>
            </div>
          </Form>
        </div>
      </div>
    </div>
  );
};

export default Login;
