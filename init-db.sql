CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,              -- 用户ID，自增主键
    username VARCHAR(50) UNIQUE NOT NULL, -- 用户名，唯一且不能为空
    email VARCHAR(100) UNIQUE NOT NULL,   -- 邮箱，唯一且不能为空
    password_hash VARCHAR(255) NOT NULL,  -- 密码哈希值，存储加密后的密码
    full_name VARCHAR(100),             -- 用户全名，可选
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP, -- 注册时间，默认为当前时间
    last_login TIMESTAMP WITH TIME ZONE   -- 最后登录时间，可为空
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);