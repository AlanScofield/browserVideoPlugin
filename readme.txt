浏览器课程播放辅助插件开发文档
一、项目概述
1.1 项目名称
课程播放辅助插件（Course Playback Helper）

1.2 目标浏览器
Google Chrome，建议 109+

Microsoft Edge，建议 109+

两者均基于 Chromium，使用 Manifest V3 即可通用

1.3 核心功能
视频播放过程中出现确认提示框时，自动识别并点击“确认/继续/我知道了”等按钮。

当前视频播放结束后，若平台没有自动播放下一集，则自动查找并点击“下一集/下一节/下一课”等按钮。

支持开关控制。

支持动态 DOM、SPA 页面切换、iframe 内视频页面。

具备防重复点击、冷却时间、日志调试能力。

二、功能需求
2.1 弹窗自动确认
监听页面 DOM 变化。

识别可见弹窗容器，例如：

.el-message-box

.ant-modal

.layui-layer

[role="dialog"]

.modal

.dialog

在弹窗内查找按钮文本：

确认

确定

继续

继续播放

我知道了

知道了

找到后自动点击。

同一按钮短时间内不重复点击。

2.2 视频结束自动下一集
监听页面中的 video 元素。

监听 ended 事件。

同时使用 timeupdate 检测接近结尾，作为兜底：

currentTime >= duration - 1.5

查找并点击下一集按钮，文本包括：

下一集

下一节

下一课

下一章

继续学习

下一个

如果平台已经自动跳转，则不重复点击。

点击冷却时间默认 5 秒，避免连点。

2.3 开关控制
插件 popup 提供启用/禁用开关。

状态保存到 chrome.storage.sync。

2.4 兼容性
支持普通页面。

支持 iframe 内页面，需要在 manifest.json 中配置 all_frames: true。

支持 SPA 路由变化，如 history.pushState、replaceState 后重新扫描。

三、技术方案
3.1 技术栈
Manifest V3

Content Script

Chrome Storage API

MutationObserver

DOM 事件监听

Popup 页面

3.2 核心流程
页面加载后注入 content.js。

读取配置。

启动 MutationObserver 监听 DOM 变化。

定时扫描弹窗和视频元素。

发现确认弹窗时，查找确认按钮并点击。

发现视频元素时，绑定 ended 和 timeupdate。

视频结束后，查找下一集按钮并点击。

SPA 路由变化后重新扫描。