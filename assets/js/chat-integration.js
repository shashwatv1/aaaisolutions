/**
 * High-Performance Chat Integration Service for AAAI Solutions
 * FIXED: Enhanced message handling and UI integration
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
    
    // Message management
    messages: [],
    currentMessageId: null,
    
    // FIXED: Event listener management
    chatServiceListeners: {
        message: null,
        status: null,
        error: null
    },
    
    // Configuration
    options: {
        maxMessages: 100,
        autoScroll: true,
        showTimestamps: true,
        enableTypingIndicator: true,
        debug: false
    },
    
    /**
     * FIXED: Enhanced initialization with robust error handling and validation
     */
    init(containerId, options = {}) {
        if (this.isInitialized) {
            this._log('FIXED: ChatIntegration already initialized');
            return this;
        }
        
        try {
            this._log('FIXED: Starting ChatIntegration initialization...');
            
            this.containerId = containerId;
            this.container = document.getElementById(containerId);
            this.options = { ...this.options, ...options };
            
            if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
                this.options.debug = true;
            }
            
            // FIXED: Validate container exists
            if (!this.container) {
                throw new Error(`FIXED: Container element '${containerId}' not found`);
            }
            
            this._log('FIXED: Container found:', this.container);
            
            // FIXED: Find and validate UI elements
            this._findUIElementsFixed();
            
            // FIXED: Initialize ChatService if needed
            if (window.ChatService && !window.ChatService.isInitialized) {
                this._log('FIXED: Initializing ChatService...');
                window.ChatService.init(window.AuthService, {
                    debug: this.options.debug
                });
            }
            
            // FIXED: Setup ChatService integration with validation
            if (window.ChatService?.isInitialized) {
                this._log('FIXED: Setting up ChatService integration...');
                this._setupChatServiceIntegrationFixed();
                
                // Connect immediately if requested
                if (this.options.connectImmediately && window.AuthService?.isAuthenticated()) {
                    this._log('FIXED: Starting immediate connection...');
                    this._connectImmediately();
                }
            } else {
                this._error('FIXED: ChatService not available or not initialized');
                throw new Error('ChatService not available');
            }
            
            this.isInitialized = true;
            this._log('FIXED: ChatIntegration initialized successfully');
            
            return this;
            
        } catch (error) {
            this._error('FIXED: Failed to initialize ChatIntegration:', error);
            throw error;
        }
    },

    /**
     * Connect immediately without waiting for project context
     */
    async _connectImmediately() {
        try {
            this._log('FIXED: Connecting immediately...');
            
            // Start connection immediately
            const connectionPromise = window.ChatService.connect();
            
            // Load chat history in parallel (don't wait)
            this._loadChatHistory().catch(error => {
                this._log('FIXED: Chat history load failed (non-critical):', error);
            });
            
            // Wait for connection
            await connectionPromise;
            this._log('FIXED: Immediate connection established');
            
        } catch (error) {
            this._error('FIXED: Immediate connection failed:', error);
            // Don't throw - let the app continue
        }
    },

    /**
     * Set project context after initialization
     */
    setProjectContext(projectId, projectName) {
        try {
            this._log('FIXED: Setting project context:', { projectId, projectName });
            
            this.currentProjectId = projectId;
            this.currentProjectName = projectName;
            this.hasProject = true;
            
            // Update ChatService context if connected
            if (window.ChatService?.isConnected) {
                window.ChatService.setProjectContext(projectId, projectName);
            }
            
            // Reload chat history for this project
            this._loadChatHistory().catch(error => {
                this._log('FIXED: Failed to load project chat history:', error);
            });
            
        } catch (error) {
            this._error('FIXED: Failed to set project context:', error);
        }
    },

    /**
     * Initialize with project context (kept for compatibility but simplified)
     */
    async initializeWithProject(projectId, projectName) {
        try {
            this._log('FIXED: Setting project context:', { projectId, projectName });
            
            if (!this.isInitialized) {
                throw new Error('FIXED: ChatIntegration not initialized');
            }
            
            // Just set the project context
            this.setProjectContext(projectId, projectName);
            
            return true;
            
        } catch (error) {
            this._error('FIXED: Failed to initialize with project:', error);
            return false;
        }
    },
    
    /**
     * Send message through ChatService
     */
    async sendMessage() {
        try {
            if (!this.elements.messageInput) {
                throw new Error('FIXED: Message input not found');
            }
            
            const text = this.elements.messageInput.value.trim();
            if (!text) {
                throw new Error('FIXED: Message cannot be empty');
            }
            
            this._log('FIXED: Sending message:', text.substring(0, 30) + '...');
            
            // Add user message to UI immediately
            this._addMessageToUIFixed({
                type: 'user',
                text: text,
                timestamp: Date.now()
            });
            
            // Clear input
            this.elements.messageInput.value = '';
            this._resizeInput();
            
            // Show typing indicator
            this._showTypingIndicator();
            
            // Send through ChatService
            if (window.ChatService) {
                const messageId = await window.ChatService.sendMessage(text);
                this.currentMessageId = messageId;
                this._log('FIXED: Message sent with ID:', messageId);
            } else {
                throw new Error('FIXED: ChatService not available');
            }
            
        } catch (error) {
            this._error('FIXED: Failed to send message:', error);
            this._hideTypingIndicator();
            throw error;
        }
    },
    
    /**
     * FIXED: Enhanced message addition to UI with comprehensive validation and error handling
     */
    _addMessageToUIFixed(message) {
        this._log('FIXED: Adding message to UI:', {
            type: message.type,
            textLength: message.text ? message.text.length : 0,
            hasText: !!message.text,
            hasTimestamp: !!message.timestamp
        });
        
        // FIXED: Validate inputs
        if (!message) {
            this._error('FIXED: Cannot add null/undefined message to UI');
            return;
        }
        
        if (!message.type) {
            this._error('FIXED: Message missing type field:', message);
            return;
        }
        
        if (!this.elements.chatBody) {
            this._error('FIXED: Chat body element not found - cannot add message');
            // Try to find it again
            this._findUIElementsFixed();
            if (!this.elements.chatBody) {
                this._error('FIXED: Chat body still not found after retry');
                return;
            }
        }
        
        try {
            // FIXED: Create message element with enhanced error handling
            const messageElement = this._createMessageElementFixed(message);
            if (!messageElement) {
                this._error('FIXED: Failed to create message element');
                return;
            }
            
            // FIXED: Add to chat body with validation
            this.elements.chatBody.appendChild(messageElement);
            this._log('FIXED: Message element added to DOM');
            
            // Hide welcome message if visible
            const welcomeMessage = this.elements.chatBody.querySelector('.welcome-message');
            if (welcomeMessage) {
                welcomeMessage.style.display = 'none';
                this._log('FIXED: Welcome message hidden');
            }
            
            // Manage message limit
            this._enforceMessageLimit();
            
            // Auto scroll
            if (this.options.autoScroll) {
                this._scrollToBottom();
            }
            
            // Store message
            this.messages.push(message);
            
            this._log('FIXED: Message successfully added to UI, total messages:', this.messages.length);
            
        } catch (error) {
            this._error('FIXED: Failed to add message to UI:', error);
        }
    },
    
    /**
     * FIXED: Enhanced message element creation with validation
     */
    _createMessageElementFixed(message) {
        try {
            const messageEl = document.createElement('div');
            messageEl.className = `message message-${message.type}`;
            
            if (message.temporary) {
                messageEl.classList.add('temporary-message');
            }
            
            // FIXED: Validate message text
            let messageText = message.text || '';
            if (typeof messageText !== 'string') {
                this._log('FIXED: Converting non-string message text:', typeof messageText);
                messageText = String(messageText);
            }
            
            if (!messageText.trim()) {
                messageText = '[Empty message]';
                this._log('FIXED: Empty message text, using fallback');
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
            
            // Message ID for tracking
            if (message.id) {
                messageEl.setAttribute('data-message-id', message.id);
            }
            
            this._log('FIXED: Message element created successfully');
            return messageEl;
            
        } catch (error) {
            this._error('FIXED: Error creating message element:', error);
            return null;
        }
    },
    
    /**
     * Format message content (basic implementation)
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
            if (!window.ChatService) return;
            
            const history = await window.ChatService.loadChatHistory();
            
            if (history && history.length > 0) {
                // Clear existing messages
                this.messages = [];
                if (this.elements.chatBody) {
                    const messages = this.elements.chatBody.querySelectorAll('.message');
                    messages.forEach(msg => msg.remove());
                }
                
                // Add history messages
                history.forEach(msg => {
                    const messageData = {
                        type: msg.role === 'user' ? 'user' : 'bot',
                        text: msg.content,
                        timestamp: new Date(msg.timestamp).getTime(),
                        id: msg.id
                    };
                    
                    this._addMessageToUIFixed(messageData);
                });
                
                this._log(`FIXED: Loaded ${history.length} messages from history`);
            }
            
        } catch (error) {
            this._error('FIXED: Failed to load chat history:', error);
        }
    },
    
    /**
     * FIXED: Enhanced ChatService integration with comprehensive error handling and listener management
     */
    _setupChatServiceIntegrationFixed() {
        if (!window.ChatService) {
            this._error('FIXED: ChatService not available for integration');
            return;
        }
        
        this._log('FIXED: Setting up ChatService integration...');
        
        // FIXED: Clean up existing listeners first
        this._cleanupChatServiceListeners();
        
        // FIXED: Create and store listener functions
        this.chatServiceListeners.message = (data) => {
            this._log('FIXED: ChatService message received:', {
                type: data.type,
                messageId: data.messageId,
                hasText: !!data.text,
                textLength: data.text ? data.text.length : 0
            });
            this._handleChatServiceMessageFixed(data);
        };
        
        this.chatServiceListeners.status = (status) => {
            this._log('FIXED: ChatService status changed:', status);
            this._handleStatusChange(status);
        };
        
        this.chatServiceListeners.error = (error) => {
            this._error('FIXED: ChatService error:', error);
            this._handleChatServiceError(error);
        };
        
        // FIXED: Add listeners to ChatService
        try {
            window.ChatService.onMessage(this.chatServiceListeners.message);
            window.ChatService.onStatusChange(this.chatServiceListeners.status);
            window.ChatService.onError(this.chatServiceListeners.error);
            
            this._log('FIXED: ChatService integration setup complete, listeners added');
            
            // FIXED: Validate listener registration
            const status = window.ChatService.getStatus();
            this._log('FIXED: ChatService status after integration:', status);
            
        } catch (error) {
            this._error('FIXED: Error adding ChatService listeners:', error);
            throw error;
        }
    },
    
    /**
     * FIXED: Clean up ChatService listeners
     */
    _cleanupChatServiceListeners() {
        if (window.ChatService) {
            try {
                if (this.chatServiceListeners.message) {
                    window.ChatService.removeMessageListener(this.chatServiceListeners.message);
                }
                if (this.chatServiceListeners.status) {
                    window.ChatService.removeStatusListener(this.chatServiceListeners.status);
                }
                if (this.chatServiceListeners.error) {
                    window.ChatService.removeErrorListener(this.chatServiceListeners.error);
                }
                
                this._log('FIXED: ChatService listeners cleaned up');
            } catch (error) {
                this._log('FIXED: Error cleaning up listeners (might not exist):', error);
            }
        }
        
        this.chatServiceListeners = {
            message: null,
            status: null,
            error: null
        };
    },
    
    /**
     * FIXED: Enhanced ChatService message handling with comprehensive validation
     */
    _handleChatServiceMessageFixed(data) {
        this._log('FIXED: Processing ChatService message:', {
            type: data.type,
            messageId: data.messageId,
            timestamp: data.timestamp,
            hasText: !!data.text,
            hasResponse: !!data.response,
            hasComponents: !!(data.components && data.components.length > 0)
        });
        
        try {
            // FIXED: Validate message data
            if (!data || typeof data !== 'object') {
                this._error('FIXED: Invalid message data received:', data);
                return;
            }
            
            switch (data.type) {
                case 'message_queued':
                    this._handleMessageQueued(data);
                    break;
                    
                case 'chat_response':
                    this._handleChatResponseFixed(data);
                    break;
                    
                case 'chat_error':
                    this._handleChatErrorFixed(data);
                    break;
                    
                default:
                    this._log('FIXED: Unhandled message type:', data.type, data);
                    break;
            }
        } catch (error) {
            this._error('FIXED: Error handling ChatService message:', error, data);
        }
    },
    
    /**
     * Handle message queued
     */
    _handleMessageQueued(data) {
        // Update UI to show message is being processed
        this._log('FIXED: Message queued:', data.messageId);
    },
    
    /**
     * FIXED: Enhanced chat response handling with comprehensive text extraction and error handling
     */
    _handleChatResponseFixed(data) {
        this._log('FIXED: Processing chat response:', {
            messageId: data.messageId,
            hasText: !!data.text,
            hasResponse: !!data.response,
            hasComponents: !!(data.components && data.components.length > 0),
            timestamp: data.timestamp
        });
        
        this._hideTypingIndicator();
        
        try {
            let messageText = '';
            
            // FIXED: Comprehensive text extraction with multiple fallback methods
            if (data.text && typeof data.text === 'string' && data.text.trim()) {
                messageText = data.text;
                this._log('FIXED: Using data.text field');
            } else if (data.response) {
                if (typeof data.response === 'string' && data.response.trim()) {
                    messageText = data.response;
                    this._log('FIXED: Using data.response as string');
                } else if (data.response && typeof data.response === 'object') {
                    if (data.response.text && typeof data.response.text === 'string' && data.response.text.trim()) {
                        messageText = data.response.text;
                        this._log('FIXED: Using data.response.text');
                    } else if (data.response.message && typeof data.response.message === 'string' && data.response.message.trim()) {
                        messageText = data.response.message;
                        this._log('FIXED: Using data.response.message');
                    } else if (data.response.content && typeof data.response.content === 'string' && data.response.content.trim()) {
                        messageText = data.response.content;
                        this._log('FIXED: Using data.response.content');
                    } else {
                        // Try to extract any meaningful content
                        const responseStr = JSON.stringify(data.response);
                        if (responseStr && responseStr.length > 2) { // More than just "{}"
                            messageText = responseStr;
                            this._log('FIXED: Using JSON.stringify(data.response)');
                        }
                    }
                }
            }
            
            // FIXED: Final validation and fallback
            if (!messageText || messageText.trim() === '' || messageText === '{}' || messageText === 'null') {
                messageText = 'Response received but content could not be extracted';
                this._error('FIXED: Could not extract meaningful text from response:', data);
            }
            
            this._log('FIXED: Final message text:', {
                length: messageText.length,
                preview: messageText.substring(0, 50) + (messageText.length > 50 ? '...' : ''),
                isEmpty: !messageText.trim()
            });
            
            // FIXED: Add bot message to UI with validation
            const messageData = {
                type: 'bot',
                text: messageText,
                timestamp: data.timestamp || Date.now(),
                id: data.messageId
            };
            
            this._addMessageToUIFixed(messageData);
            
            this._log('FIXED: Bot message added to UI successfully');
            
            // FIXED: Handle components if present
            if (data.components && Array.isArray(data.components) && data.components.length > 0) {
                this._log('FIXED: Processing components:', data.components.length);
                data.components.forEach((component, index) => {
                    try {
                        this._addComponentToUI(component);
                        this._log('FIXED: Component added:', index, component.type);
                    } catch (error) {
                        this._error('FIXED: Failed to add component:', error, component);
                    }
                });
            }
            
            // FIXED: Trigger a custom event for external integration
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('chatResponse', {
                    detail: {
                        messageId: data.messageId,
                        text: messageText,
                        timestamp: data.timestamp || Date.now(),
                        type: 'bot'
                    }
                }));
            }
            
        } catch (error) {
            this._error('FIXED: Error handling chat response:', error, data);
            
            // FIXED: Add error message to UI as fallback
            this._addMessageToUIFixed({
                type: 'error',
                text: 'Error displaying response: ' + error.message,
                timestamp: Date.now()
            });
        }
    },
    
    /**
     * FIXED: Enhanced chat error handling
     */
    _handleChatErrorFixed(data) {
        this._log('FIXED: Handling chat error:', data);
        this._hideTypingIndicator();
        
        const errorText = data.error || 'Unknown error occurred';
        
        this._addMessageToUIFixed({
            type: 'error',
            text: `Error: ${errorText}`,
            timestamp: data.timestamp || Date.now(),
            id: data.messageId
        });
    },
    
    /**
     * Handle status changes
     */
    _handleStatusChange(status) {
        this._log('FIXED: Chat status changed:', status);
        // Status changes are handled by the main chat application
    },
    
    /**
     * Handle ChatService errors
     */
    _handleChatServiceError(error) {
        this._error('FIXED: ChatService error:', error);
        this._hideTypingIndicator();
    },
    
    /**
     * Add component to UI (placeholder for future component support)
     */
    _addComponentToUI(component) {
        this._log('FIXED: Component received:', component);
        // Future implementation for rich components
    },
    
    /**
     * FIXED: Enhanced UI element finding with validation and error handling
     */
    _findUIElementsFixed() {
        if (!this.container) {
            this._error('FIXED: Container not available for UI element search');
            return;
        }
        
        this._log('FIXED: Finding UI elements in container...');
        
        // FIXED: Try multiple selectors for each element
        const selectors = {
            chatBody: ['.chat-body', '#chatBody', '.messages', '.chat-messages', '.conversation'],
            messageInput: ['.chat-input', '#messageInput', '.message-input', 'textarea', 'input[type="text"]'],
            sendButton: ['.chat-send-btn', '#sendMessageBtn', '.send-button', '.send-btn', 'button[type="submit"]']
        };
        
        // Find chat body
        for (const selector of selectors.chatBody) {
            this.elements.chatBody = this.container.querySelector(selector);
            if (this.elements.chatBody) {
                this._log('FIXED: Chat body found with selector:', selector);
                break;
            }
        }
        
        // Find message input
        for (const selector of selectors.messageInput) {
            this.elements.messageInput = this.container.querySelector(selector);
            if (this.elements.messageInput) {
                this._log('FIXED: Message input found with selector:', selector);
                break;
            }
        }
        
        // Find send button
        for (const selector of selectors.sendButton) {
            this.elements.sendButton = this.container.querySelector(selector);
            if (this.elements.sendButton) {
                this._log('FIXED: Send button found with selector:', selector);
                break;
            }
        }
        
        // FIXED: Log results and validate critical elements
        const results = {
            chatBody: !!this.elements.chatBody,
            messageInput: !!this.elements.messageInput,
            sendButton: !!this.elements.sendButton
        };
        
        this._log('FIXED: UI elements search results:', results);
        
        // FIXED: Validate critical elements
        if (!this.elements.chatBody) {
            this._error('FIXED: CRITICAL - Chat body element not found! Available elements:', 
                Array.from(this.container.querySelectorAll('*')).map(el => el.className || el.tagName).slice(0, 10));
        }
        
        if (!this.elements.messageInput) {
            this._error('FIXED: WARNING - Message input element not found!');
        }
        
        if (!this.elements.sendButton) {
            this._error('FIXED: WARNING - Send button element not found!');
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
     * FIXED: Enhanced disconnect and cleanup
     */
    disconnect() {
        this._log('FIXED: Disconnecting ChatIntegration...');
        
        // FIXED: Clean up ChatService listeners
        this._cleanupChatServiceListeners();
        
        if (window.ChatService) {
            window.ChatService.disconnect();
        }
        
        this.isInitialized = false;
        this.container = null;
        this.elements = {};
        this.messages = [];
        
        this._log('FIXED: ChatIntegration disconnected');
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