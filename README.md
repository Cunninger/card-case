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

Release APK 必须使用专用签名密钥。首次在 Windows PowerShell 中创建密钥并设置仅当前终端有效的环境变量：

```powershell
keytool -genkeypair -v -keystore .\card-case-release.keystore -alias card-case -keyalg RSA -keysize 4096 -validity 10000
$env:CARD_CASE_RELEASE_STORE_FILE = (Resolve-Path .\card-case-release.keystore).Path
$env:CARD_CASE_RELEASE_STORE_PASSWORD = '你的密钥库密码'
$env:CARD_CASE_RELEASE_KEY_ALIAS = 'card-case'
$env:CARD_CASE_RELEASE_KEY_PASSWORD = '你的密钥密码'
npm run apk
```

构建成功后，将 `android\app\build\outputs\apk\release\app-release.apk` 传到手机安装。若只用于调试，可运行 `powershell -ExecutionPolicy Bypass -File .\scripts\build-android.ps1 -Variant debug`。密钥文件和密码不得提交到 Git；请离线备份密钥，否则今后无法为同一应用包名发布更新。

Release APK 默认启用 R8 压缩并拒绝调试签名。如需上架 Google Play，请使用同一套受保护的发布密钥执行 `bundleRelease` 生成 AAB。

### 从旧调试签名迁移

旧版调试签名 APK 无法直接覆盖为正式签名 APK。迁移版会在“设置 → 加密迁移”中提供备份工具：创建一个 `.cardcase` 加密备份（包含卡片资料与正反面照片），记住你设置的密码；再卸载旧版、安装正式签名版，并在同一入口导入该文件。备份密码不会存储在设备或文件中，遗失后无法恢复。

仅为这一次兼容旧版的迁移 Release，可以显式设置下列环境变量，以历史调试签名构建；此方式绝不可用于迁移完成后的新版本：

```powershell
$env:CARD_CASE_USE_LEGACY_DEBUG_SIGNING = 'true'
npm run apk
Remove-Item Env:CARD_CASE_USE_LEGACY_DEBUG_SIGNING
```

## GitHub 检查更新

应用会检查仓库 `Cunninger/card-case` 的最新 GitHub Release。发布新版本时：

1. 修改 `app.json` 与 `App.js` 中的版本号；
2. 运行 `npm run apk`；
3. 在 GitHub 创建形如 `v1.0.1` 的 Release，并将生成的 `app-release.apk` 作为附件上传。

用户在应用的“设置 → 检查更新”中即可跳转下载最新版 APK。版本信息直接读取 GitHub，APK 下载链接会通过 `gh-proxy.com` 镜像加速；若 Release 没有 APK 附件，则打开 GitHub 的 Release 页面。

## 隐私说明

卡片文本和照片 URI 仅保存在设备本地；应用不连接任何服务器。Android 正式包会使用系统 Android KeyStore 加密卡片文本、卡号、备注和隐私偏好，并在首次启动时迁移旧版明文资料。照片文件仍保存在应用私有沙盒中；详情页和照片预览可隐藏卡号中段，取消编辑、删除、替换照片或恢复示例数据时会清理不再关联的照片。卡片内容会在写入本机存储成功后才更新界面。Android 版本还会禁止系统备份、截图及任务切换预览，以减少实体卡照片外泄风险。请勿在“备注”中保存完整密码、CVV 或其他高敏感认证信息。

导出的 `.cardcase` 文件会以用户设置的密码通过 PBKDF2-HMAC-SHA256 派生密钥，再使用 AES-256-CBC 加密，并附带 HMAC-SHA256 完整性校验；它包含卡片文本及已保存的正反面照片。备份密码不会保存或上传，务必单独保管。

设置页会显示备份是否仍覆盖当前资料、最近一次备份时间；新增、编辑、删除或导入卡片后会自动提示重新创建备份。生产界面不再提供会覆盖资料的示例数据重置入口。
