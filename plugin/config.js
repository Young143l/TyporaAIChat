// Typora AI Chat 插件配置文件
// 修改此文件后需要重启 Typora 才能生效

window.AI_CHAT_CONFIG = {
    // API 配置
    api: {
        // API 基础地址（支持 OpenAI 兼容接口）
        base_url: 'https://api.deepseek.com',
        
        // API 密钥
        api_key: '',
        
        // 模型名称
        model: 'deepseek-reasoner',
        
        // 温度参数 (0-2)
        temperature: 1.5,
        
        // 最大令牌数
        max_tokens: 16000
    },
    
    // 快捷键配置
    hotkey: 'ctrl+shift+a'
};
