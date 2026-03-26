/**
 * Typora AI Chat Plugin
 * A minimal, highly compatible AI chat plugin for Typora.
 */

(function() {
    'use strict';

    const currentScriptSrc = document.currentScript ? document.currentScript.src : '';

    class AIChatPlugin {
        constructor() {
            // Default configuration
            this.config = {
                api: {
                    base_url: 'https://api.deepseek.com',
                    api_key: '',
                    model: 'deepseek-reasoner',
                    temperature: 0.7,
                    max_tokens: 2000
                },
                hotkey: 'ctrl+shift+a'
            };
            
            // State management
            this.state = {
                messages: [],
                isLoading: false,
                abortController: null
            };
            
            // Constants
            this.CONSTANTS = {
                STORAGE_KEY: 'ai_chat_messages_v2',
                MAX_TYPORA_WAIT_ATTEMPTS: 50,
                TYPORA_WAIT_INTERVAL: 100
            };
            
            // DOM references
            this.dom = {};
            
            this.init();
        }

        /**
         * Initialize the plugin
         */
        async init() {
            try {
                console.log('[AIChat] 开始初始化...');
                await this.waitForTypora();
                await this.loadDependencies();
                await this.loadConfig();
                this.loadHistory();
                this.createUI();
                this.renderMessages();
                this.bindEvents();
                
                // Expose to window for debugging
                window.aiChatPlugin = this;
                console.log('[AIChat] 初始化完成');
            } catch (e) {
                console.error('[AIChat] 初始化失败:', e);
            }
        }

        /**
         * Wait for Typora's core objects to be available
         */
        waitForTypora() {
            return new Promise(resolve => {
                let attempts = 0;
                const check = () => {
                    if (window.File && window.File.editor) {
                        resolve();
                    } else if (attempts > this.CONSTANTS.MAX_TYPORA_WAIT_ATTEMPTS) {
                        console.warn('[AIChat] 等待 Typora 超时，继续初始化');
                        resolve();
                    } else {
                        attempts++;
                        setTimeout(check, this.CONSTANTS.TYPORA_WAIT_INTERVAL);
                    }
                };
                check();
            });
        }

        /**
         * Load third-party dependencies
         */
        loadDependencies() {
            return new Promise(resolve => {
                if (window.marked) {
                    return resolve();
                }
                
                let markedUrl = './plugin/marked.min.js';
                if (currentScriptSrc) {
                    markedUrl = currentScriptSrc.replace('index.js', 'marked.min.js');
                }
                
                if (window.require) {
                    try {
                        const fs = window.require('fs');
                        const path = window.require('path');
                        let markedPath = '';
                        
                        if (currentScriptSrc && currentScriptSrc.startsWith('file://')) {
                            markedPath = decodeURI(currentScriptSrc.replace('file:///', '').replace('file://', '').replace('index.js', 'marked.min.js'));
                            if (markedPath.includes(':') && markedPath.startsWith('/')) {
                                markedPath = markedPath.substring(1);
                            }
                        } else {
                            const resourcesPath = path.dirname(window.process.mainModule.filename);
                            markedPath = path.join(resourcesPath, 'plugin', 'marked.min.js');
                        }
                        
                        if (fs.existsSync(markedPath)) {
                            const markedContent = fs.readFileSync(markedPath, 'utf-8');
                            const scriptEl = document.createElement('script');
                            scriptEl.textContent = markedContent;
                            document.head.appendChild(scriptEl);
                            console.log('[AIChat] 通过 fs 成功读取 marked.js');
                            return resolve();
                        }
                    } catch (e) {
                        console.warn('[AIChat] fs 读取 marked.js 失败，尝试 script 标签加载:', e);
                    }
                }

                const script = document.createElement('script');
                script.src = markedUrl;
                script.onload = () => {
                    console.log('[AIChat] 通过 script 标签成功读取 marked.js');
                    resolve();
                };
                script.onerror = () => {
                    console.warn('[AIChat] 无法加载 marked.js:', markedUrl);
                    resolve();
                };
                document.head.appendChild(script);
            });
        }

        /**
         * Load configuration from config.js
         */
        loadConfig() {
            return new Promise(resolve => {
                let configUrl = './plugin/config.js';
                if (currentScriptSrc) {
                    configUrl = currentScriptSrc.replace('index.js', 'config.js');
                }
                
                // 尝试使用 Node.js fs 模块读取 (Typora 环境通常支持)
                if (window.require) {
                    try {
                        const fs = window.require('fs');
                        const path = window.require('path');
                        let configPath = '';
                        
                        if (currentScriptSrc && currentScriptSrc.startsWith('file://')) {
                            configPath = decodeURI(currentScriptSrc.replace('file:///', '').replace('file://', '').replace('index.js', 'config.js'));
                            // 处理 Windows 路径 (例如 /C:/Program Files/...)
                            if (configPath.includes(':') && configPath.startsWith('/')) {
                                configPath = configPath.substring(1);
                            }
                        } else {
                            // 备用路径
                            const resourcesPath = path.dirname(window.process.mainModule.filename);
                            configPath = path.join(resourcesPath, 'plugin', 'config.js');
                        }
                        
                        if (fs.existsSync(configPath)) {
                            const configContent = fs.readFileSync(configPath, 'utf-8');
                            const scriptEl = document.createElement('script');
                            scriptEl.textContent = configContent;
                            document.head.appendChild(scriptEl);
                            
                            if (window.AI_CHAT_CONFIG) {
                                this.config = this.mergeConfig(this.config, window.AI_CHAT_CONFIG);
                                console.log('[AIChat] 通过 fs 成功读取配置文件');
                                return resolve();
                            }
                        }
                    } catch (e) {
                        console.warn('[AIChat] fs 读取配置失败，尝试 script 标签加载:', e);
                    }
                }

                // 降级方案：使用 script 标签加载
                const script = document.createElement('script');
                script.src = configUrl;
                script.onload = () => {
                    if (window.AI_CHAT_CONFIG) {
                        this.config = this.mergeConfig(this.config, window.AI_CHAT_CONFIG);
                        console.log('[AIChat] 通过 script 标签成功读取配置文件');
                    }
                    resolve();
                };
                script.onerror = () => {
                    console.warn('[AIChat] 无法加载配置文件:', configUrl);
                    resolve();
                };
                document.head.appendChild(script);
            });
        }

        mergeConfig(target, source) {
            if (!source) return target;
            const result = Object.assign({}, target);
            for (const key in source) {
                if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                    result[key] = this.mergeConfig(result[key] || {}, source[key]);
                } else {
                    result[key] = source[key];
                }
            }
            return result;
        }

        /**
         * Load chat history from local storage
         */
        loadHistory() {
            try {
                const saved = localStorage.getItem(this.CONSTANTS.STORAGE_KEY);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (Array.isArray(parsed)) {
                        this.state.messages = parsed;
                    }
                }
            } catch (e) {
                console.warn('[AIChat] 加载历史记录失败', e);
            }
        }

        /**
         * Save chat history to local storage
         */
        saveHistory() {
            try {
                localStorage.setItem(this.CONSTANTS.STORAGE_KEY, JSON.stringify(this.state.messages));
            } catch (e) {
                console.warn('[AIChat] 保存历史记录失败', e);
            }
        }

        /**
         * Create and inject the UI components
         */
        createUI() {
            const style = document.createElement('style');
            style.textContent = this.getCss();
            document.head.appendChild(style);

            const container = document.createElement('div');
            container.innerHTML = this.getHtml();
            document.body.appendChild(container);

            this.dom = {
                modal: container.querySelector('#ai-chat-modal'),
                header: container.querySelector('#ai-chat-header'),
                messages: container.querySelector('#ai-chat-messages'),
                input: container.querySelector('#ai-chat-input'),
                sendBtn: container.querySelector('#ai-chat-send'),
                closeBtn: container.querySelector('#ai-chat-close'),
                clearBtn: container.querySelector('#ai-chat-clear'),
                selectionTag: container.querySelector('#ai-chat-selection-tag'),
                tagText: container.querySelector('.tag-text'),
                tagRemove: container.querySelector('.tag-remove')
            };
        }

        /**
         * Get the CSS styles for the plugin
         */
        getCss() {
            return `
                :root {
                    --ac-bg: #ffffff;
                    --ac-surface: #f8f9fa;
                    --ac-border: #dadce0;
                    --ac-text: #202124;
                    --ac-text-muted: #5f6368;
                    --ac-primary: #f1f3f4;
                    --ac-primary-hover: #e8eaed;
                    --ac-user-bg: #f1f3f4;
                    --ac-assistant-bg: #ffffff;
                    --ac-reasoning-bg: #f8f9fa;
                    --ac-reasoning-border: #dadce0;
                    --ac-shadow-modal: 0 8px 24px rgba(0,0,0,0.15);
                    --ac-radius-modal: 12px;
                    --ac-radius-bubble: 12px;
                }

                #ai-chat-modal {
                    display: none;
                    position: fixed;
                    width: clamp(350px, 35vw, 500px);
                    height: clamp(400px, 80vh, 800px);
                    right: 30px;
                    bottom: 30px;
                    background: var(--ac-bg);
                    border: 1px solid var(--ac-border);
                    border-radius: var(--ac-radius-modal);
                    box-shadow: var(--ac-shadow-modal);
                    z-index: 99999;
                    flex-direction: column;
                    font-family: "Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    color: var(--ac-text);
                    overflow: hidden;
                    transition: box-shadow 0.3s ease;
                }

                #ai-chat-modal.active {
                    display: flex;
                }

                #ai-chat-header {
                    padding: 12px 16px;
                    border-bottom: 1px solid var(--ac-border);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: var(--ac-bg);
                    cursor: move;
                    user-select: none;
                    -webkit-user-select: none;
                }

                #ai-chat-header .title {
                    font-weight: 500;
                    font-size: 15px;
                    color: var(--ac-text);
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    letter-spacing: 0.1px;
                }

                #ai-chat-header .actions {
                    display: flex;
                    gap: 8px;
                }

                #ai-chat-header .actions span {
                    cursor: pointer;
                    color: var(--ac-text-muted);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    transition: background-color 0.2s, color 0.2s;
                }

                #ai-chat-header .actions span:hover {
                    color: var(--ac-text);
                    background: var(--ac-primary);
                }

                #ai-chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                    background: var(--ac-surface);
                }

                .message {
                    max-width: 85%;
                    font-size: 14px;
                    line-height: 1.6;
                    letter-spacing: 0.2px;
                }

                .message.user {
                    align-self: flex-end;
                    background: var(--ac-user-bg);
                    padding: 12px 16px;
                    border-radius: var(--ac-radius-bubble) var(--ac-radius-bubble) 2px var(--ac-radius-bubble);
                    color: var(--ac-text);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                }

                .message.assistant {
                    align-self: flex-start;
                    background: var(--ac-assistant-bg);
                    padding: 12px 16px;
                    border-radius: var(--ac-radius-bubble) var(--ac-radius-bubble) var(--ac-radius-bubble) 2px;
                    border: 1px solid var(--ac-border);
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    width: 100%;
                    box-sizing: border-box;
                }

                .reasoning {
                    font-size: 13px;
                    background: var(--ac-reasoning-bg);
                    border: 1px solid var(--ac-reasoning-border);
                    border-radius: 8px;
                    margin-bottom: 12px;
                    overflow: hidden;
                }

                .reasoning-header {
                    padding: 8px 12px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    color: var(--ac-text-muted);
                    background: rgba(0,0,0,0.02);
                    font-weight: 500;
                    transition: background-color 0.2s;
                }

                .reasoning-header:hover {
                    background: rgba(0,0,0,0.05);
                }

                .reasoning-content {
                    padding: 10px 12px;
                    color: var(--ac-text-muted);
                    border-top: 1px solid var(--ac-reasoning-border);
                    white-space: pre-wrap;
                }

                .message .content {
                    white-space: pre-wrap;
                    word-break: break-word;
                }

                .message .content pre {
                    background: var(--ac-surface);
                    padding: 12px;
                    border-radius: 8px;
                    overflow-x: auto;
                    margin: 10px 0;
                    border: 1px solid var(--ac-border);
                }

                .message .content code {
                    font-family: "Roboto Mono", Consolas, Monaco, monospace;
                    background: var(--ac-surface);
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 0.9em;
                    border: 1px solid var(--ac-border);
                }

                .message .content pre code {
                    background: transparent;
                    padding: 0;
                    border: none;
                }

                .message .actions {
                    margin-top: 10px;
                    display: flex;
                    justify-content: flex-end;
                }

                .message .actions button {
                    background: transparent;
                    border: 1px solid var(--ac-border);
                    color: var(--ac-text-muted);
                    padding: 4px 12px;
                    border-radius: 16px;
                    font-size: 12px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .message .actions button:hover {
                    background: var(--ac-primary);
                    color: var(--ac-text);
                    border-color: transparent;
                }

                #ai-chat-input-area {
                    padding: 12px 16px;
                    border-top: 1px solid var(--ac-border);
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    background: var(--ac-bg);
                }

                #ai-chat-input {
                    width: 100%;
                    min-height: 60px;
                    max-height: 150px;
                    padding: 12px;
                    border: 1px solid var(--ac-border);
                    border-radius: 8px;
                    background: var(--ac-surface);
                    color: var(--ac-text);
                    font-family: inherit;
                    font-size: 14px;
                    resize: none;
                    outline: none;
                    transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
                    box-sizing: border-box;
                }

                #ai-chat-input:focus {
                    border-color: #9aa0a6;
                    background: var(--ac-bg);
                    box-shadow: inset 0 0 0 1px #9aa0a6;
                }

                #ai-chat-input-toolbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    min-height: 36px;
                    gap: 10px;
                }
                
                .toolbar-left {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex: 1;
                    overflow: hidden;
                }

                #ai-chat-clear {
                    cursor: pointer;
                    color: var(--ac-text-muted);
                    font-size: 13px;
                    font-weight: 500;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    border-radius: 16px;
                    background: transparent;
                    border: 1px solid transparent;
                }

                #ai-chat-clear:hover {
                    color: var(--ac-text);
                    background: var(--ac-primary);
                }

                #ai-chat-selection-tag {
                    padding: 4px 10px;
                    background: var(--ac-primary);
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 12px;
                    color: var(--ac-text);
                    max-width: calc(100% - 90px);
                    border: 1px solid var(--ac-border);
                }

                .tag-text {
                    flex: 1;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .tag-remove {
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: rgba(0,0,0,0.1);
                    color: var(--ac-text);
                    transition: background 0.2s;
                }
                
                .tag-remove:hover {
                    background: rgba(0,0,0,0.2);
                }

                #ai-chat-send {
                    height: 36px;
                    padding: 0 20px;
                    background: var(--ac-primary);
                    color: var(--ac-text);
                    border: none;
                    border-radius: 18px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                    margin-left: auto;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                #ai-chat-send:hover {
                    background: var(--ac-primary-hover);
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }

                #ai-chat-send:active {
                    background: #e0e0e0;
                }

                #ai-chat-send:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                    box-shadow: none;
                }
            `;
        }

        /**
         * Get the HTML structure for the plugin
         */
        getHtml() {
            return `
                <div id="ai-chat-modal">
                    <div id="ai-chat-header">
                        <span class="title">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                            AI 助手
                        </span>
                        <div class="actions">
                            <span id="ai-chat-close" title="关闭">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </span>
                        </div>
                    </div>
                    <div id="ai-chat-messages"></div>
                    <div id="ai-chat-input-area">
                        <textarea id="ai-chat-input" placeholder="输入消息，Enter 发送，Shift+Enter 换行..."></textarea>
                        <div id="ai-chat-input-toolbar">
                            <div class="toolbar-left">
                                <span id="ai-chat-clear" title="清空历史">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                    清空
                                </span>
                                <div id="ai-chat-selection-tag" style="display: none;">
                                    <span class="tag-icon">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                    </span>
                                    <span class="tag-text"></span>
                                    <span class="tag-remove">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                    </span>
                                </div>
                            </div>
                            <button id="ai-chat-send">发送</button>
                        </div>
                    </div>
                </div>
            `;
        }

        /**
         * Bind all event listeners
         */
        bindEvents() {
            this.bindFocusEvents();
            this.bindDragEvents();
            this.bindWindowEvents();
            this.bindKeyboardEvents();
            this.bindUIEvents();
            this.bindContextMenu();
        }

        /**
         * Handle focus management to prevent Typora from stealing focus
         */
        bindFocusEvents() {
            const preventFocusLoss = e => e.stopPropagation();
            
            ['mousedown', 'mouseup', 'click'].forEach(eventType => {
                this.dom.modal.addEventListener(eventType, preventFocusLoss);
            });
            
            this.dom.modal.addEventListener('click', e => {
                if (e.target === this.dom.modal || e.target === this.dom.messages || e.target.id === 'ai-chat-input-area') {
                    this.dom.input.focus();
                }
            });
        }

        /**
         * Handle modal dragging
         */
        bindDragEvents() {
            let isDragging = false, startX, startY, initialLeft, initialTop;
            
            this.dom.header.addEventListener('mousedown', e => {
                if (e.target.closest('.actions')) return;
                isDragging = true;
                startX = e.clientX;
                startY = e.clientY;
                const rect = this.dom.modal.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
            });
            
            document.addEventListener('mousemove', e => {
                if (!isDragging) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                let newLeft = initialLeft + dx;
                let newTop = initialTop + dy;
                
                const rect = this.dom.modal.getBoundingClientRect();
                const maxX = window.innerWidth - rect.width;
                const maxY = window.innerHeight - rect.height;
                
                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));
                
                Object.assign(this.dom.modal.style, {
                    left: `${newLeft}px`,
                    top: `${newTop}px`,
                    right: 'auto',
                    bottom: 'auto'
                });
            });
            
            window.addEventListener('mouseup', () => isDragging = false, true);
            window.addEventListener('blur', () => isDragging = false);
        }

        /**
         * Handle window resize events
         */
        bindWindowEvents() {
            window.addEventListener('resize', () => {
                if (this.dom.modal.classList.contains('active')) {
                    const rect = this.dom.modal.getBoundingClientRect();
                    if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
                        Object.assign(this.dom.modal.style, {
                            left: 'auto',
                            top: 'auto',
                            right: '30px',
                            bottom: '30px'
                        });
                    }
                }
            });
        }

        /**
         * Handle global and local keyboard shortcuts
         */
        bindKeyboardEvents() {
            // Global hotkey to toggle modal
            document.addEventListener('keydown', e => {
                const hotkey = this.config.hotkey.toLowerCase();
                const keys = hotkey.split('+');
                const needsCtrl = keys.includes('ctrl');
                const needsShift = keys.includes('shift');
                const needsAlt = keys.includes('alt');
                const key = keys[keys.length - 1];

                if (e.key.toLowerCase() === key &&
                    e.ctrlKey === needsCtrl &&
                    e.shiftKey === needsShift &&
                    e.altKey === needsAlt) {
                    e.preventDefault();
                    this.toggle();
                }
            });

            // Prevent Typora from intercepting typing inside modal
            this.dom.modal.addEventListener('keydown', e => e.stopPropagation());

            // Send message on Enter
            this.dom.input.addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }

        /**
         * Handle UI interactions (buttons, inputs)
         */
        bindUIEvents() {
            this.dom.closeBtn.addEventListener('click', () => this.close());
            this.dom.clearBtn.addEventListener('click', () => this.clearHistory());
            this.dom.sendBtn.addEventListener('click', () => this.sendMessage());
            
            // Auto-resize input
            this.dom.input.addEventListener('input', () => {
                this.dom.input.style.height = 'auto';
                this.dom.input.style.height = Math.min(this.dom.input.scrollHeight, 120) + 'px';
            });

            // Remove selection tag
            this.dom.tagRemove.addEventListener('click', () => {
                this.dom.selectionTag.style.display = 'none';
                delete this.dom.selectionTag.dataset.text;
            });
        }

        /**
         * Toggle modal visibility
         */
        /**
         * Bind context menu event to Typora's editor
         */
        bindContextMenu() {
            document.addEventListener('contextmenu', () => {
                const selection = window.getSelection().toString().trim();
                if (!selection) return;

                setTimeout(() => {
                    const contextMenu = document.getElementById('context-menu');
                    if (!contextMenu) return;

                    if (contextMenu.querySelector('.ai-chat-menu-item')) {
                        contextMenu.querySelectorAll('.ai-chat-menu-item').forEach(item => item.style.display = '');
                        return;
                    }

                    this.injectContextMenuItem(contextMenu);
                }, 10);
            });

            document.addEventListener('mousedown', (e) => {
                if (e.button === 2) {
                    const selection = window.getSelection().toString().trim();
                    if (!selection) {
                        setTimeout(() => {
                            const contextMenu = document.getElementById('context-menu');
                            if (contextMenu) {
                                contextMenu.querySelectorAll('.ai-chat-menu-item').forEach(item => item.style.display = 'none');
                            }
                        }, 10);
                    }
                }
            });
        }

        /**
         * Inject custom item into Typora's context menu
         */
        injectContextMenuItem(contextMenu) {
            const divider = document.createElement('li');
            divider.className = 'divider ai-chat-menu-item';
            
            const menuItem = document.createElement('li');
            menuItem.className = 'ai-chat-menu-item';
            menuItem.setAttribute('data-key', 'ai-chat');
            
            const link = document.createElement('a');
            link.href = '#';
            link.innerHTML = `
                <span style="display: flex; align-items: center; gap: 8px;">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    发送给 AI 助手
                </span>
            `;
            
            menuItem.addEventListener('mouseenter', () => menuItem.classList.add('active'));
            menuItem.addEventListener('mouseleave', () => menuItem.classList.remove('active'));

            link.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                contextMenu.classList.remove('show');
                contextMenu.style.display = 'none';
                this.open();
            });

            menuItem.appendChild(link);
            contextMenu.appendChild(divider);
            contextMenu.appendChild(menuItem);
        }

        /**
         * Toggle modal visibility
         */
        toggle() {
            if (this.dom.modal.classList.contains('active')) {
                this.close();
            } else {
                this.open();
            }
        }

        /**
         * Open the chat modal
         */
        open() {
            this.dom.modal.classList.add('active');
            this.checkSelection();
            this.scrollToBottom();
            this.forceFocusInput();
        }

        /**
         * Close the chat modal
         */
        close() {
            this.dom.modal.classList.remove('active');
        }

        /**
         * Force focus on the input field, overcoming Typora's focus stealing
         */
        forceFocusInput() {
            const focus = () => {
                if (this.dom.modal.classList.contains('active')) {
                    this.dom.input.focus();
                }
            };
            
            focus();
            [50, 150, 300].forEach(delay => setTimeout(focus, delay));
        }

        /**
         * Clear chat history
         */
        async clearHistory() {
            const confirmed = await this.customConfirm('确定要清空所有对话历史吗？');
            if (confirmed) {
                this.abortCurrentRequest();
                this.resetInputState();
                
                this.state.messages = [];
                this.saveHistory();
                this.renderMessages();
                
                this.forceFocusInput();
            } else {
                this.dom.input.focus();
            }
        }

        /**
         * Abort any ongoing API request
         */
        abortCurrentRequest() {
            if (this.state.abortController) {
                this.state.abortController.abort();
                this.state.abortController = null;
            }
        }

        /**
         * Reset the input area to its default state
         */
        resetInputState() {
            this.state.isLoading = false;
            this.dom.sendBtn.disabled = false;
            this.dom.sendBtn.textContent = '发送';
            this.dom.input.value = '';
            this.dom.input.style.height = 'auto';
            this.dom.selectionTag.style.display = 'none';
            delete this.dom.selectionTag.dataset.text;
        }

        /**
         * Base dialog creator to reduce UI boilerplate
         */
        createDialog(options) {
            return new Promise(resolve => {
                const overlay = document.createElement('div');
                
                // 如果指定了 parent，则在 parent 内部绝对定位；否则在全屏固定定位
                if (options.parent) {
                    overlay.style.cssText = `
                        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(255,255,255,0.8); z-index: 1000;
                        display: flex; align-items: center; justify-content: center;
                        backdrop-filter: blur(2px);
                        border-radius: var(--ac-radius-modal);
                    `;
                } else {
                    overlay.style.cssText = `
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.5); z-index: 100000;
                        display: flex; align-items: center; justify-content: center;
                    `;
                }
                
                const box = document.createElement('div');
                box.style.cssText = `
                    background: #ffffff; padding: 20px; border-radius: 12px;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.15); border: 1px solid #dadce0;
                    width: ${options.width || '260px'}; display: flex; flex-direction: column; gap: 16px;
                    color: #202124; font-family: "Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                `;
                
                const label = document.createElement('div');
                label.textContent = options.message;
                label.style.fontSize = '16px';
                label.style.fontWeight = '500';
                box.appendChild(label);

                let input = null;
                if (options.type === 'prompt') {
                    input = document.createElement('input');
                    input.type = 'text';
                    input.style.cssText = `
                        padding: 10px 12px; border: 1px solid #dadce0; border-radius: 4px;
                        outline: none; background: #f8f9fa; color: #202124; width: 100%;
                        box-sizing: border-box; font-size: 14px; transition: border-color 0.2s, box-shadow 0.2s;
                    `;
                    input.onfocus = () => {
                        input.style.borderColor = '#9aa0a6';
                        input.style.boxShadow = 'inset 0 0 0 1px #9aa0a6';
                        input.style.background = '#ffffff';
                    };
                    input.onblur = () => {
                        input.style.borderColor = '#dadce0';
                        input.style.boxShadow = 'none';
                        input.style.background = '#f8f9fa';
                    };
                    box.appendChild(input);
                }
                
                const btnContainer = document.createElement('div');
                btnContainer.style.cssText = `display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;`;
                
                const cancelBtn = document.createElement('button');
                cancelBtn.textContent = '取消';
                cancelBtn.style.cssText = `
                    padding: 8px 16px; border: none; border-radius: 4px;
                    background: transparent; color: #5f6368; cursor: pointer;
                    font-size: 14px; font-weight: 500; transition: background 0.2s;
                `;
                cancelBtn.onmouseover = () => cancelBtn.style.background = '#f1f3f4';
                cancelBtn.onmouseout = () => cancelBtn.style.background = 'transparent';
                
                const okBtn = document.createElement('button');
                okBtn.textContent = '确定';
                okBtn.style.cssText = `
                    padding: 8px 16px; border: none; border-radius: 4px;
                    background: #f1f3f4; color: ${options.okColor || '#202124'}; cursor: pointer;
                    font-size: 14px; font-weight: 500; transition: background 0.2s;
                `;
                okBtn.onmouseover = () => okBtn.style.background = options.okHoverBg || '#e8eaed';
                okBtn.onmouseout = () => okBtn.style.background = '#f1f3f4';
                
                btnContainer.appendChild(cancelBtn);
                btnContainer.appendChild(okBtn);
                box.appendChild(btnContainer);
                
                overlay.appendChild(box);
                
                const container = options.parent || document.body;
                container.appendChild(overlay);
                
                if (input) input.focus();
                
                const close = (val) => {
                    container.removeChild(overlay);
                    resolve(val);
                };
                
                cancelBtn.onclick = () => close(options.type === 'prompt' ? null : false);
                okBtn.onclick = () => close(options.type === 'prompt' ? input.value.trim() : true);
                
                if (input) {
                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') close(input.value.trim());
                        if (e.key === 'Escape') close(null);
                    };
                }
            });
        }

        /**
         * Custom confirmation dialog to prevent Electron focus loss
         */
        async customConfirm(message) {
            return this.createDialog({
                type: 'confirm',
                message: message,
                width: '260px',
                okColor: '#d93025',
                okHoverBg: '#fce8e6',
                parent: this.dom.modal // 将弹窗限制在 AI 助手小窗内
            });
        }

        /**
         * Check for selected text in Typora and update UI
         */
        checkSelection() {
            const text = window.getSelection().toString().trim();
            
            if (text) {
                this.dom.selectionTag.dataset.text = text;
                this.dom.tagText.textContent = text.length > 30 ? text.substring(0, 30) + '...' : text;
                this.dom.selectionTag.style.display = 'flex';
            } else {
                this.dom.selectionTag.style.display = 'none';
                delete this.dom.selectionTag.dataset.text;
            }
        }

        /**
         * Render all messages in the history
         */
        renderMessages() {
            this.dom.messages.innerHTML = '';
            this.state.messages.forEach(msg => this.appendMessageUI(msg));
            this.scrollToBottom();
        }

        /**
         * Append a single message to the UI
         */
        appendMessageUI(msg) {
            const div = document.createElement('div');
            div.className = `message ${msg.role}`;
            
            let html = '';
            if (msg.role === 'assistant' && msg.reasoning_content) {
                html += `
                    <div class="reasoning">
                        <div class="reasoning-header">
                            <span>思考过程</span>
                            <span class="toggle">▼</span>
                        </div>
                        <div class="reasoning-content" style="display: none;">${this.escapeHtml(msg.reasoning_content)}</div>
                    </div>
                `;
            }
            
            html += `<div class="content">${this.parseMarkdown(msg.content)}</div>`;
            
            if (msg.role === 'assistant') {
                html += `
                    <div class="actions">
                        <button class="copy-btn">复制</button>
                    </div>
                `;
            }
            
            div.innerHTML = html;
            
            const reasoningHeader = div.querySelector('.reasoning-header');
            if (reasoningHeader) {
                reasoningHeader.addEventListener('click', () => {
                    const content = div.querySelector('.reasoning-content');
                    const toggle = div.querySelector('.toggle');
                    if (content.style.display === 'none') {
                        content.style.display = 'block';
                        toggle.style.transform = 'rotate(0deg)';
                    } else {
                        content.style.display = 'none';
                        toggle.style.transform = 'rotate(-90deg)';
                    }
                });
            }

            const copyBtn = div.querySelector('.copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', () => {
                    navigator.clipboard.writeText(msg.content);
                    copyBtn.textContent = '已复制';
                    setTimeout(() => copyBtn.textContent = '复制', 2000);
                });
            }

            this.dom.messages.appendChild(div);
            return div;
        }

        /**
         * Scroll the message container to the bottom
         */
        scrollToBottom() {
            this.dom.messages.scrollTop = this.dom.messages.scrollHeight;
        }

        /**
         * Custom prompt dialog to prevent Electron focus loss
         */
        async customPrompt(message) {
            return this.createDialog({
                type: 'prompt',
                message: message,
                width: '320px'
            });
        }

        /**
         * Handle sending a message to the API
         */
        async sendMessage() {
            if (this.state.isLoading) return;

            const text = this.dom.input.value.trim();
            const selectedText = this.dom.selectionTag.dataset.text;
            
            if (!text && !selectedText) return;

            const content = selectedText ? `\`\`\`markdown\n${selectedText}\n\`\`\`\n${text}` : text;

            let apiKey = this.config.api.api_key;
            if (!apiKey) {
                apiKey = await this.customPrompt('请输入 API Key:');
                if (!apiKey) return;
                this.config.api.api_key = apiKey;
            }

            // Add user message
            const userMsg = { role: 'user', content };
            this.state.messages.push(userMsg);
            this.appendMessageUI(userMsg);
            this.saveHistory();

            this.resetInputState();
            this.scrollToBottom();

            // Prepare for API request
            this.state.isLoading = true;
            this.dom.sendBtn.disabled = true;
            this.dom.sendBtn.textContent = '...';
            this.state.abortController = new AbortController();

            try {
                const response = await this.fetchChatCompletion(apiKey);

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`HTTP Error ${response.status}: ${errText}`);
                }

                const assistantMsg = { role: 'assistant', content: '', reasoning_content: '' };
                const msgDiv = this.appendMessageUI(assistantMsg);
                const contentDiv = msgDiv.querySelector('.content');

                await this.handleStreamResponse(response, assistantMsg, msgDiv, contentDiv);

                this.state.messages.push(assistantMsg);
                this.saveHistory();

                // Re-render final message to ensure proper markdown parsing
                msgDiv.outerHTML = '';
                this.appendMessageUI(assistantMsg);
                this.scrollToBottom();

            } catch (error) {
                this.handleApiError(error);
            } finally {
                this.state.isLoading = false;
                this.dom.sendBtn.disabled = false;
                this.dom.sendBtn.textContent = '发送';
                this.state.abortController = null;
                
                if (this.dom.modal.classList.contains('active')) {
                    this.dom.input.focus();
                }
            }
        }

        /**
         * Handle the streaming response from the API
         */
        async handleStreamResponse(response, assistantMsg, msgDiv, contentDiv) {
            let reasoningDiv = null;
            let reasoningContentDiv = null;

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.trim() || !line.startsWith('data: ')) continue;
                    const data = line.slice(6).trim();
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        const delta = parsed?.choices?.[0]?.delta;
                        if (!delta) continue;

                        if (delta.reasoning_content) {
                            assistantMsg.reasoning_content += delta.reasoning_content;
                            
                            if (!reasoningDiv) {
                                reasoningDiv = document.createElement('div');
                                reasoningDiv.className = 'reasoning';
                                reasoningDiv.innerHTML = `
                                    <div class="reasoning-header">
                                        <span>思考过程</span>
                                        <span class="toggle">▼</span>
                                    </div>
                                    <div class="reasoning-content"></div>
                                `;
                                msgDiv.insertBefore(reasoningDiv, contentDiv);
                                reasoningContentDiv = reasoningDiv.querySelector('.reasoning-content');
                                
                                reasoningDiv.querySelector('.reasoning-header').addEventListener('click', () => {
                                    const isHidden = reasoningContentDiv.style.display === 'none';
                                    reasoningContentDiv.style.display = isHidden ? 'block' : 'none';
                                    reasoningDiv.querySelector('.toggle').style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
                                });
                            }
                            reasoningContentDiv.textContent = assistantMsg.reasoning_content;
                            this.scrollToBottom();
                        }

                        if (delta.content) {
                            assistantMsg.content += delta.content;
                            contentDiv.innerHTML = this.parseMarkdown(assistantMsg.content);
                            this.scrollToBottom();
                        }
                    } catch (e) {
                        // Ignore parse errors for incomplete chunks
                    }
                }
            }
        }

        /**
         * Execute the fetch request to the API
         */
        async fetchChatCompletion(apiKey) {
            const response = await fetch(`${this.config.api.base_url}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                signal: this.state.abortController.signal,
                body: JSON.stringify({
                    model: this.config.api.model,
                    messages: this.state.messages.map(m => ({ role: m.role, content: m.content })),
                    temperature: this.config.api.temperature,
                    max_tokens: this.config.api.max_tokens,
                    stream: true
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`HTTP Error ${response.status}: ${errText}`);
            }

            return response;
        }

        /**
         * Handle API errors
         */
        handleApiError(error) {
            if (error.name === 'AbortError') {
                console.log('[AIChat] 请求被取消');
                return;
            }
            console.error('[AIChat] API Error:', error);
            this.appendMessageUI({ role: 'assistant', content: `**错误:** ${error.message}` });
        }

        /**
         * Escape HTML special characters
         */
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        /**
         * Parse markdown to HTML, using Typora's built-in parser if available
         */
        parseMarkdown(text) {
            if (!text) return '';
            
            // 优先尝试使用 Typora 内置的 Markdown 解析器
            if (window.File && window.File.editor && window.File.editor.markdownToHTML) {
                try {
                    // Typora 的 markdownToHTML 可能会返回包含额外包装的 HTML
                    const html = window.File.editor.markdownToHTML(text);
                    if (html) return html;
                } catch (e) {
                    console.warn('[AIChat] Typora markdown parser failed, falling back to custom parser', e);
                }
            }

            // 尝试使用 marked.js
            if (window.marked) {
                try {
                    if (typeof window.marked.parse === 'function') {
                        return window.marked.parse(text);
                    } else if (typeof window.marked === 'function') {
                        return window.marked(text);
                    }
                } catch (e) {
                    console.warn('[AIChat] marked.js parser failed, falling back to custom parser', e);
                }
            }

            // 降级方案：自定义的简单 Markdown 解析器
            let html = text
                .replace(/&/g, '&')
                .replace(/</g, '<')
                .replace(/>/g, '>');
            
            // 处理代码块 (支持多行和语言高亮)
            html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
                return `<pre style="background: var(--ac-surface); padding: 12px; border-radius: 8px; overflow-x: auto; border: 1px solid var(--ac-border); margin: 10px 0;"><code class="language-${lang}" style="font-family: 'Roboto Mono', Consolas, monospace; font-size: 0.9em; border: none; padding: 0; background: transparent;">${code}</code></pre>`;
            });
            
            // 处理行内代码
            html = html.replace(/`([^`]+)`/g, '<code style="background: var(--ac-surface); padding: 2px 6px; border-radius: 4px; font-family: \'Roboto Mono\', Consolas, monospace; font-size: 0.9em; border: 1px solid var(--ac-border);">$1</code>');
            
            // 处理粗体和斜体
            html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
            
            // 处理标题
            html = html.replace(/^### (.*$)/gim, '<h3 style="margin-top: 16px; margin-bottom: 8px; font-size: 1.1em;">$1</h3>');
            html = html.replace(/^## (.*$)/gim, '<h2 style="margin-top: 20px; margin-bottom: 10px; font-size: 1.3em; border-bottom: 1px solid var(--ac-border); padding-bottom: 4px;">$1</h2>');
            html = html.replace(/^# (.*$)/gim, '<h1 style="margin-top: 24px; margin-bottom: 12px; font-size: 1.5em; border-bottom: 1px solid var(--ac-border); padding-bottom: 6px;">$1</h1>');
            
            // 处理无序列表
            html = html.replace(/^\s*[-*+] (.*$)/gim, '<li style="margin-left: 20px; list-style-type: disc;">$1</li>');
            // 将连续的 <li> 包装在 <ul> 中
            html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, '<ul style="margin: 8px 0; padding-left: 20px;">$&</ul>');
            
            // 处理有序列表
            html = html.replace(/^\s*\d+\. (.*$)/gim, '<li style="margin-left: 20px; list-style-type: decimal;">$1</li>');
            // 将连续的 <li> 包装在 <ol> 中 (注意这里可能会和无序列表冲突，简单处理)
            html = html.replace(/(<li[^>]*list-style-type: decimal[^>]*>.*<\/li>\n?)+/g, '<ol style="margin: 8px 0; padding-left: 20px;">$&</ol>');

            // 处理引用块
            html = html.replace(/^> (.*$)/gim, '<blockquote style="border-left: 4px solid var(--ac-border); padding-left: 12px; margin: 10px 0; color: var(--ac-text-muted); background: rgba(0,0,0,0.02); padding-top: 4px; padding-bottom: 4px;">$1</blockquote>');
            
            // 处理段落换行 (将连续的换行替换为 <br>)
            // 注意：不要在 pre/code/ul/ol/li/h1/h2/h3/blockquote 内部替换换行
            const blocks = html.split(/(<pre[\s\S]*?<\/pre>|<ul[\s\S]*?<\/ul>|<ol[\s\S]*?<\/ol>|<blockquote[\s\S]*?<\/blockquote>|<h[1-3][\s\S]*?<\/h[1-3]>)/i);
            for (let i = 0; i < blocks.length; i++) {
                if (i % 2 === 0) { // 文本部分
                    blocks[i] = blocks[i].replace(/\n/g, '<br>');
                }
            }
            html = blocks.join('');

            return html;
        }
    }

    new AIChatPlugin();
})();
