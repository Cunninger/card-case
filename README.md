# 卡匣 Card Cabinet

一款离线优先的实体卡管理 Android 应用。可记录银行卡、会员卡、证件、交通卡和收藏卡，支持照片、分类、搜索、收藏与到期提醒。

## 本地运行

```powershell
npm install
npx expo start
```

在安卓手机安装 **Expo Go** 后扫描终端中的二维码；或运行 `npm run android` 启动模拟器。

## 本地生成 APK（Windows，无需云端）

本项目已包含 `android/` 原生工程和一键构建脚本。需要本机安装 Android Studio（Android SDK、Platform-Tools、Build-Tools）及 JDK 17 或更高版本。

```powershell
npm install
npm run apk
```

构建成功后，直接把 `android\app\build\outputs\apk\release\app-release.apk` 传到手机安装即可。若只用于调试，可运行 `powershell -ExecutionPolicy Bypass -File .\scripts\build-android.ps1 -Variant debug`。

该 release APK 使用开发签名，适合个人安装和测试；如需上架 Google Play，请另行创建上传密钥并使用 `bundleRelease` 生成 AAB。

## GitHub 检查更新

应用会检查仓库 `Cunninger/card-case` 的最新 GitHub Release。发布新版本时：

1. 修改 `app.json` 与 `App.js` 中的版本号；
2. 运行 `npm run apk`；
3. 在 GitHub 创建形如 `v1.0.1` 的 Release，并将生成的 `app-release.apk` 作为附件上传。

用户在应用的“设置 → 检查更新”中即可跳转下载最新版 APK。

## 隐私说明

卡片文本和照片 URI 仅保存在设备本地；应用不连接任何服务器。请勿在“备注”中保存完整密码、CVV 或其他高敏感认证信息。
