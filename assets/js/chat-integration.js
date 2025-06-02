/**
 * Chat Integration Service for AAAI Solutions
 * Handles direct API communication for chat functionality
 */
const ChatIntegration = {
    // Core state
    isInitialized: false,
    containerId: null,
    container: null,
    
    // UI elements
    elements: {
        chatBody: null,
        messageInput: null,
        sendButton: null,
        typingIndicator: null
    },
    
    // Project context
    currentProjectId: null,
    currentProjectName: null,
    
    // Message management
    messages: [],
    
    // Configuration
    options: {
        maxMessages: 100,
        autoScroll: true,
        showTimestamps: true,
        enableTypingIndicator: true,
        debug: false
    },
    
    /**
     * Initialize ChatIntegration
     */
    init(containerId, options = {}) {
        if (this.isInitialized) {
            this._log('ChatIntegration already initialized');
            return this;
        }
        
        try {
            this._log('Starting ChatIntegration initialization...');
            
            this.containerId = containerId;
            this.container = document.getElementById(containerId);
            this.options = { ...this.options, ...options };
            
            if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
                this.options.debug = true;
            }
            
            if (!this.container) {
                throw new Error(`Container element '${containerId}' not found`);
            }
            
            this._log('Container found:', this.container);
            
            // Find and validate UI elements
            this._findUIElements();
            
            this.isInitialized = true;
            this._log('ChatIntegration initialized successfully');
            
            return this;
            
        } catch (error) {
            this._error('Failed to initialize ChatIntegration:', error);
            throw error;
        }
    },
    
    /**
     * Set project context
     */
    setProjectContext(projectId, projectName) {
        try {
            this._log('Setting project context:', { projectId, projectName });
            
            this.currentProjectId = projectId;
            this.currentProjectName = projectName;
            
            // Load chat history for this project
            this._loadChatHistory().catch(error => {
                this._log('Failed to load project chat history:', error);
            });
            
        } catch (error) {
            this._error('Failed to set project context:', error);
        }
    },
    
    /**
     * Send message via direct API call
     */
    async sendMessage() {
        try {
            if (!this.elements.messageInput) {
                throw new Error('Message input not found');
            }
            
            const text = this.elements.messageInput.value.trim();
            if (!text) {
                throw new Error('Message cannot be empty');
            }
            
            this._log('Sending message:', text.substring(0, 30) + '...');
            
            // Add user message to UI immediately
            this._addMessageToUI({
                type: 'user',
                text: text,
                timestamp: Date.now()
            });
            
            // Clear input
            this.elements.messageInput.value = '';
            this._resizeInput();
            
            // Show typing indicator
            this._showTypingIndicator();
            
            // Send via API
            const authService = window.AuthService;
            if (!authService) {
                throw new Error('AuthService not available');
            }
            
            const result = await authService.executeFunction('send_chat_message', {
                content: text,
                chat_id: this.currentProjectId,
                context_data: {
                    source: 'chat_integration',
                    timestamp: new Date().toISOString()
                }
            });
            
            this._log('API response received:', result);
            
            // Hide typing indicator
            this._hideTypingIndicator();
            
            if (result?.status === 'success' && result?.data?.success) {
                // Handle immediate response
                if (result.data.response) {
                    this._handleAPIResponse(result.data.response);
                } else if (result.data.bot_message) {
                    this._addMessageToUI({
                        type: 'bot',
                        text: result.data.bot_message.content,
                        timestamp: new Date(result.data.bot_message.timestamp).getTime(),
                        id: result.data.bot_message.id
                    });
                } else {
                    // Poll for response if no immediate response
                    this._pollForResponse(result.data.message_id);
                }
            } else {
                this._addMessageToUI({
                    type: 'error',
                    text: 'Failed to send message: ' + (result?.data?.error || 'Unknown error'),
                    timestamp: Date.now()
                });
            }
            
        } catch (error) {
            this._error('Failed to send message:', error);
            this._hideTypingIndicator();
            throw error;
        }
    },
    
    /**
     * Handle API response
     */
    _handleAPIResponse(response) {
        this._log('Handling API response:', response);
        
        let responseText = '';
        
        // Extract text from response
        if (response.text && typeof response.text === 'string') {
            responseText = response.text;
        } else if (response.message && typeof response.message === 'string') {
            responseText = response.message;
        } else if (response.content && typeof response.content === 'string') {
            responseText = response.content;
        } else if (typeof response === 'string') {
            responseText = response;
        } else {
            responseText = 'Response received but could not parse content';
            this._error('Could not parse response:', response);
        }
        
        // Add bot message to UI
        this._addMessageToUI({
            type: 'bot',
            text: responseText,
            timestamp: Date.now(),
            id: response.message_id
        });
        
        // Handle components if present
        if (response.components && Array.isArray(response.components)) {
            response.components.forEach(component => {
                this._addComponentToUI(component);
            });
        }
    },
    
    /**
     * Poll for response from API
     */
    async _pollForResponse(messageId) {
        this._log('Polling for response to message:', messageId);
        
        const maxAttempts = 30;
        let attempts = 0;
        
        const poll = async () => {
            try {
                const authService = window.AuthService;
                const result = await authService.executeFunction('get_chat_messages', {
                    chat_id: this.currentProjectId,
                    limit: 5,
                    offset: 0
                });
                
                if (result?.status === 'success' && result?.data?.messages?.length > 0) {
                    const messages = result.data.messages;
                    
                    for (const msg of messages) {
                        if (msg.sender === 'bot' && 
                            !document.querySelector(`[data-message-id="${msg.id}"]`)) {
                            
                            this._log('Found response:', msg.id);
                            this._hideTypingIndicator();
                            
                            this._addMessageToUI({
                                type: 'bot',
                                text: msg.content,
                                timestamp: new Date(msg.timestamp).getTime(),
                                id: msg.id
                            });
                            
                            return;
                        }
                    }
                }
                
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 2000);
                } else {
                    this._hideTypingIndicator();
                    this._addMessageToUI({
                        type: 'error',
                        text: 'Response timeout - please try again',
                        timestamp: Date.now()
                    });
                }
                
            } catch (error) {
                this._error('Poll error:', error);
                attempts++;
                if (attempts < maxAttempts) {
                    setTimeout(poll, 3000);
                } else {
                    this._hideTypingIndicator();
                }
            }
        };
        
        poll();
    },
    
    /**
     * Add message to UI
     */
    _addMessageToUI(message) {
        this._log('Adding message to UI:', {
            type: message.type,
            textLength: message.text ? message.text.length : 0
        });
        
        if (!message || !message.type) {
            this._error('Invalid message data:', message);
            return;
        }
        
        if (!this.elements.chatBody) {
            this._error('Chat body element not found');
            return;
        }
        
        try {
            const messageElement = this._createMessageElement(message);
            if (!messageElement) {
                this._error('Failed to create message element');
                return;
            }
            
            this.elements.chatBody.appendChild(messageElement);
            
            // Hide welcome message if visible
            const welcomeMessage = this.elements.chatBody.querySelector('.welcome-message');
            if (welcomeMessage) {
                welcomeMessage.style.display = 'none';
            }
            
            // Manage message limit
            this._enforceMessageLimit();
            
            // Auto scroll
            if (this.options.autoScroll) {
                this._scrollToBottom();
            }
            
            // Store message
            this.messages.push(message);
            
            this._log('Message successfully added to UI');
            
        } catch (error) {
            this._error('Failed to add message to UI:', error);
        }
    },
    
    /**
     * Create message element
     */
    _createMessageElement(message) {
        try {
            const messageEl = document.createElement('div');
            messageEl.className = `message message-${message.type}`;
            
            if (message.id) {
                messageEl.setAttribute('data-message-id', message.id);
            }
            
            let messageText = message.text || '';
            if (typeof messageText !== 'string') {
                messageText = String(messageText);
            }
            
            if (!messageText.trim()) {
                messageText = '[Empty message]';
            }
            
            // Message content
            const contentEl = document.createElement('div');
            contentEl.className = 'message-content';
            contentEl.innerHTML = this._formatMessageContent(messageText);
            messageEl.appendChild(contentEl);
            
            // Timestamp
            if (this.options.showTimestamps && message.timestamp) {
                const timestampEl = document.createElement('div');
                timestampEl.className = 'message-timestamp';
                timestampEl.textContent = this._formatTimestamp(message.timestamp);
                messageEl.appendChild(timestampEl);
            }
            
            return messageEl;
            
        } catch (error) {
            this._error('Error creating message element:', error);
            return null;
        }
    },
    
    /**
     * Format message content
     */
    _formatMessageContent(text) {
        if (!text) return '';
        
        // Basic HTML escaping
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    /**
     * Format timestamp
     */
    _formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    },
    
    /**
     * Show typing indicator
     */
    _showTypingIndicator() {
        if (!this.options.enableTypingIndicator || !this.elements.chatBody) return;
        
        // Remove existing typing indicator
        this._hideTypingIndicator();
        
        const typingEl = document.createElement('div');
        typingEl.className = 'typing-indicator';
        typingEl.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        
        this.elements.chatBody.appendChild(typingEl);
        this.elements.typingIndicator = typingEl;
        
        if (this.options.autoScroll) {
            this._scrollToBottom();
        }
    },
    
    /**
     * Hide typing indicator
     */
    _hideTypingIndicator() {
        if (this.elements.typingIndicator) {
            this.elements.typingIndicator.remove();
            this.elements.typingIndicator = null;
        }
    },
    
    /**
     * Load chat history
     */
    async _loadChatHistory() {
        try {
            if (!this.currentProjectId) return;
            
            const authService = window.AuthService;
            if (!authService) return;
            
            const result = await authService.executeFunction('get_chat_messages', {
                chat_id: this.currentProjectId,
                limit: 30,
                offset: 0
            });
            
            if (result?.status === 'success' && result?.data?.messages?.length > 0) {
                // Clear existing messages
                this.messages = [];
                if (this.elements.chatBody) {
                    const messages = this.elements.chatBody.querySelectorAll('.message');
                    messages.forEach(msg => msg.remove());
                }
                
                // Add history messages
                result.data.messages.reverse().forEach(msg => {
                    const messageData = {
                        type: msg.sender === 'user' ? 'user' : 'bot',
                        text: msg.content,
                        timestamp: new Date(msg.timestamp).getTime(),
                        id: msg.id
                    };
                    
                    this._addMessageToUI(messageData);
                });
                
                this._log(`Loaded ${result.data.messages.length} messages from history`);
            }
            
        } catch (error) {
            this._error('Failed to load chat history:', error);
        }
    },
    
    /**
     * Add component to UI (placeholder for future use)
     */
    _addComponentToUI(component) {
        this._log('Component received:', component);
        // Future implementation for rich components
    },
    
    /**
     * Find UI elements
     */
    _findUIElements() {
        if (!this.container) {
            this._error('Container not available for UI element search');
            return;
        }
        
        this._log('Finding UI elements in container...');
        
        // Find elements with multiple selector attempts
        const selectors = {
            chatBody: ['.chat-body', '#chatBody', '.messages', '.chat-messages'],
            messageInput: ['.chat-input', '#messageInput', '.message-input', 'textarea'],
            sendButton: ['.chat-send-btn', '#sendMessageBtn', '.send-button', '.send-btn']
        };
        
        // Find chat body
        for (const selector of selectors.chatBody) {
            this.elements.chatBody = this.container.querySelector(selector);
            if (this.elements.chatBody) {
                this._log('Chat body found with selector:', selector);
                break;
            }
        }
        
        // Find message input
        for (const selector of selectors.messageInput) {
            this.elements.messageInput = this.container.querySelector(selector);
            if (this.elements.messageInput) {
                this._log('Message input found with selector:', selector);
                break;
            }
        }
        
        // Find send button
        for (const selector of selectors.sendButton) {
            this.elements.sendButton = this.container.querySelector(selector);
            if (this.elements.sendButton) {
                this._log('Send button found with selector:', selector);
                break;
            }
        }
        
        // Validate critical elements
        if (!this.elements.chatBody) {
            this._error('CRITICAL - Chat body element not found!');
        }
        
        if (!this.elements.messageInput) {
            this._error('WARNING - Message input element not found!');
        }
        
        if (!this.elements.sendButton) {
            this._error('WARNING - Send button element not found!');
        }
    },
    
    /**
     * Resize input automatically
     */
    _resizeInput() {
        if (this.elements.messageInput && this.elements.messageInput.tagName === 'TEXTAREA') {
            this.elements.messageInput.style.height = 'auto';
            this.elements.messageInput.style.height = Math.min(this.elements.messageInput.scrollHeight, 120) + 'px';
        }
    },
    
    /**
     * Scroll to bottom
     */
    _scrollToBottom() {
        if (this.elements.chatBody) {
            setTimeout(() => {
                this.elements.chatBody.scrollTop = this.elements.chatBody.scrollHeight;
            }, 0);
        }
    },
    
    /**
     * Enforce message limit
     */
    _enforceMessageLimit() {
        if (!this.elements.chatBody || this.messages.length <= this.options.maxMessages) return;
        
        const messagesToRemove = this.messages.length - this.options.maxMessages;
        
        // Remove old messages from UI
        const messageElements = this.elements.chatBody.querySelectorAll('.message');
        for (let i = 0; i < messagesToRemove && i < messageElements.length; i++) {
            messageElements[i].remove();
        }
        
        // Remove from array
        this.messages.splice(0, messagesToRemove);
    },
    
    /**
     * Get current messages
     */
    getMessages() {
        return [...this.messages];
    },
    
    /**
     * Clear all messages
     */
    clearMessages() {
        this.messages = [];
        if (this.elements.chatBody) {
            const messages = this.elements.chatBody.querySelectorAll('.message');
            messages.forEach(msg => msg.remove());
        }
    },
    
    /**
     * Disconnect and cleanup
     */
    disconnect() {
        this._log('Disconnecting ChatIntegration...');
        
        this.isInitialized = false;
        this.container = null;
        this.elements = {};
        this.messages = [];
        this.currentProjectId = null;
        this.currentProjectName = null;
        
        this._log('ChatIntegration disconnected');
    },
    
    // Utility methods
    
    _log(...args) {
        if (this.options.debug) {
            console.log('[ChatIntegration]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[ChatIntegration]', ...args);
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.ChatIntegration = ChatIntegration;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatIntegration;
}