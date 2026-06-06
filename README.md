# 宝宝管家 (BabySitter)

一款为新手父母打造的宝宝日常管理 App，集成 BabyBuddy 后端和飞牛 NAS (fnOS) 相册功能。

> 本项目使用 **Vibe Coding** 方式开发 —— 代码由 AI 辅助生成，人类负责需求定义和验收。

## 功能特性

- 🍼 **喂奶记录** — 记录喂奶时间、时长/用量，查看上次喂奶时间
- 🧷 **换尿布记录** — 记录换尿布时间和类型（湿/干/混合）
- 😴 **睡眠追踪** — 实时睡眠计时，支持跨天统计
- 📏 **生长测量** — 体重/身高/头围记录与趋势
- 📸 **相册浏览** — 直连飞牛 NAS fnOS 相册，浏览宝宝照片和视频
- 📊 **仪表盘** — 今日摘要、最近活动一览
- 🔒 **管理锁** — 保护设置不被误改

## 技术栈

- **前端**: Vue 3 + Pinia + Tailwind CSS + Vite
- **移动端**: Capacitor 8 (Android)
- **后端 API**: [BabyBuddy](https://github.com/babybuddy/babybuddy) (Django REST Framework)
- **相册 API**: 飞牛 NAS fnOS (WebSocket + HTTP REST)

## 截图

| 仪表盘 | 相册 | 设置 |
|--------|------|------|
| Dashboard | Photos | Settings |

## 安装

### 下载 APK

从 [GitHub Releases](https://github.com/DragonEasy/babysitter/releases) 下载最新 APK。

### 自行构建

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建 Web 资源
npm run build

# 同步到 Android
npx cap sync android

# 构建 APK
cd android && ./gradlew assembleDebug
```

### 前置要求

- Node.js 22+
- JDK 21
- Android SDK (compileSdk 36)
- BabyBuddy 服务端实例
- (可选) 飞牛 NAS fnOS 实例

## 配置

首次打开 App 需要在设置页面配置：

1. **BabyBuddy 服务器地址** — 如 `http://192.168.1.100:8900`
2. **BabyBuddy API Token** — 从 BabyBuddy 设置页面获取
3. **fnOS 相册** (可选) — 飞牛 NAS 地址、用户名、密码、相册链接

## 开发

### 项目结构

```
src/
├── api/           # API 客户端 (BabyBuddy, fnOS, 原生HTTP)
├── components/    # Vue 组件 (模态框等)
├── stores/        # Pinia 状态管理
├── views/         # 页面视图
├── router/        # Vue Router 配置
└── assets/        # 静态资源

android/
├── app/src/main/java/com/babybuddy/app/
│   ├── LocalMediaProxy.java        # 本地代理 (解决 WebView CORS/Cookie)
│   ├── LocalMediaProxyPlugin.java  # Capacitor 插件
│   └── MainActivity.java
```

### 关键技术方案

- **CORS 绕过**: Android WebView 中使用 CapacitorHttp + 本地 NanoHTTPD 代理
- **IPv6 支持**: DNS-over-HTTPS 解析 IPv6-only 域名，代理 Host header 透传
- **fnOS 认证**: WebSocket RSA 加密登录 + HTTP authx HMAC-SHA256 签名
- **鸿蒙兼容**: 检测 CapacitorHttp 可用性，多层 fallback 策略

## License

MIT
