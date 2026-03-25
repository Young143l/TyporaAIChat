# Typora AI Chat 插件

一个轻量级、高兼容性的 Typora AI 聊天插件，提供原生的对话体验。

## 特性

- **原生 UI 设计**：采用 Material Design 风格，完美融入 Typora 界面。
- **流式输出**：支持 AI 回复实时逐字显示。
- **Markdown 解析**：支持代码块、表格、列表等完整格式渲染。
- **推理过程展示**：支持 DeepSeek 等模型的思考过程折叠/展开显示。
- **上下文感知**：选中文本后右键或使用快捷键，自动将选中文本作为上下文发送给 AI。
- **高兼容性**：解决 Electron 环境下的焦点丢失、按键拦截等常见问题。

## 安装步骤

### 1. 复制文件

将整个 `plugin` 文件夹复制到 Typora 的 resources 目录：

```text
C:\Program Files\Typora\resources\plugin\
```

### 2. 修改 window.html

打开 `C:\Program Files\Typora\resources\window.html`，在 `</body>` 标签之前添加：

```html
<script src="./plugin/index.js"></script>
```

### 3. 重启 Typora

完全关闭 Typora 后重新打开即可生效。

## 使用方法

### 快捷键
- `Ctrl+Shift+A`：打开/关闭 AI 对话界面。

### 右键菜单
- 在编辑器中选中文本后右键，选择「发送给 AI 助手」。

### 界面操作
- **拖拽**：按住顶部标题栏可拖动窗口。
- **清空历史**：点击输入框左侧的「清空」按钮可清除当前对话记录。
- **复制内容**：AI 回复下方提供一键复制按钮。

## 配置说明

插件会自动加载 `config.js` 配置文件。如果配置文件不存在，会使用默认配置。

编辑 `config.js` 文件：

```javascript
window.AI_CHAT_CONFIG = {
    // 快捷键
    hotkey: 'ctrl+shift+a',
    
    // API 配置
    api: {
        // API 基础地址（支持 OpenAI 兼容接口）
        base_url: 'https://api.deepseek.com',
        
        // API 密钥（留空则首次使用时会弹窗提示输入）
        api_key: '',
        
        // 模型名称
        model: 'deepseek-reasoner',
        
        // 温度参数
        temperature: 0.7,
        
        // 最大令牌数
        max_tokens: 2000
    }
};
```

修改配置后需要重启 Typora 才能生效。

## 故障排除

### 插件未加载
1. 打开开发者工具（Ctrl+Shift+I）。
2. 查看 Console 是否有 `[AIChat]` 开头的日志。
3. 如果没有，检查 `window.html` 中的引入路径是否正确。

### 快捷键无效
1. 检查是否有其他软件占用了 `Ctrl+Shift+A`。
2. 在控制台输入 `window.aiChatPlugin.toggle()` 测试是否能打开对话框。

### API 调用失败
1. 检查 API 密钥是否正确。
2. 检查网络连接。
3. 确认 API 端点是否支持流式输出（stream: true）。

## 许可证

MIT License