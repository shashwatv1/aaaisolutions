/**
 * Enhanced Chat Integration Service for AAAI Solutions
 * FIXED: Integrated with WebSocket for real-time responses
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
    pendingMessages: new Set(),
    
    // WebSocket integration
    webSocketConnected: false,
    chatService: null,
    messageListenerBound: false,
    
    // Configuration
    options: {
        maxMessages: 100,
        autoScroll: true,
        showTimestamps: true,
        enableTypingIndicator: true,
        connectWebSocket: true,
        debug: false
    },
    
    /**
     * FIXED: Initialize ChatIntegration with WebSocket connection
     */
    init(containerId, options = {}) {
        if (this.isInitialized) {
            this._log('ChatIntegration already initialized');
            return this;
        }
        
        try {
            this._log('Starting ChatIntegration initialization with WebSocket...');
            
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
            
            // FIXED: Initialize WebSocket connection
            if (this.options.connectWebSocket) {
                this._initializeWebSocket();
            }
            
            this.isInitialized = true;
            this._log('ChatIntegration initialized successfully with WebSocket');
            
            return this;
            
        } catch (error) {
            this._error('Failed to initialize ChatIntegration:', error);
            throw error;
        }
    },
    
    /**
     * FIXED: Initialize WebSocket connection and message listeners
     */
    _initializeWebSocket() {
        try {
            this._log('Initializing WebSocket connection...');
            
            // Get or initialize ChatService
            if (window.ChatService) {
                this.chatService = window.ChatService;
                
                // Initialize ChatService if not already done
                if (!this.chatService.isInitialized) {
                    this.chatService.init(window.AuthService, {
                        debug: this.options.debug,
                        fastMode: true
                    });
                }
                
                // Connect WebSocket
                this._connectWebSocket();
                
                this._log('WebSocket integration initialized');
            } else {
                this._error('ChatService not available - WebSocket integration disabled');
            }
            
        } catch (error) {
            this._error('Failed to initialize WebSocket:', error);
        }
    },
    
    /**
     * FIXED: Connect to WebSocket and setup message listeners
     */
    async _connectWebSocket() {
        try {
            if (!this.chatService) return;
            
            this._log('Connecting to WebSocket...');
            
            // Setup message listener BEFORE connecting
            if (!this.messageListenerBound) {
                this.chatService.onMessage(this._handleWebSocketMessage.bind(this));
                this.chatService.onStatusChange(this._handleWebSocketStatus.bind(this));
                this.chatService.onError(this._handleWebSocketError.bind(this));
                this.messageListenerBound = true;
                this._log('WebSocket listeners registered');
            }
            
            // Connect to WebSocket
            const connected = await this.chatService.connect();
            if (connected) {
                this.webSocketConnected = true;
                this._log('WebSocket connected successfully');
                this._updateConnectionStatus('connected');
            } else {
                this._log('WebSocket connection failed');
                this._updateConnectionStatus('disconnected');
            }
            
        } catch (error) {
            this._error('WebSocket connection error:', error);
            this._updateConnectionStatus('disconnected');
        }
    },
    
    /**
     * FIXED: Handle incoming WebSocket messages
     */
    _handleWebSocketMessage(message) {
        try {
            this._log('FIXED: ChatIntegration received WebSocket message:', {
                type: message.type,
                messageId: message.messageId,
                hasText: !!message.text,
                textLength: message.text ? message.text.length : 0,
                timestamp: message.timestamp,
                fullMessage: message
            });
            
            // Force enable debug for this issue
            const originalDebug = this.options.debug;
            this.options.debug = true;
            
            switch (message.type) {
                case 'chat_response':
                    this._log('FIXED: Processing chat_response...');
                    this._handleChatResponse(message);
                    break;
                    
                case 'message_queued':
                    this._log('FIXED: Processing message_queued...');
                    this._handleMessageQueued(message);
                    break;
                    
                case 'chat_error':
                    this._log('FIXED: Processing chat_error...');
                    this._handleChatError(message);
                    break;
                    
                default:
                    this._log('FIXED: Unhandled WebSocket message type in ChatIntegration:', message.type);
                    
                    // Try to handle as chat response if it has text
                    if (message.text) {
                        this._log('FIXED: Treating unknown message type as chat response');
                        this._handleChatResponse(message);
                    }
                    break;
            }
            
            // Restore original debug setting
            this.options.debug = originalDebug;
            
        } catch (error) {
            this._error('FIXED: Error handling WebSocket message in ChatIntegration:', error);
            this._hideTypingIndicator(); // Always hide typing indicator on error
        }
    },
    
    /**
     * FIXED: Handle chat response from WebSocket
     */
    _handleChatResponse(message) {
        try {
            this._log('FIXED: ChatIntegration processing chat response:', {
                messageId: message.messageId,
                textLength: message.text ? message.text.length : 0,
                text: message.text ? message.text.substring(0, 100) + '...' : 'NO TEXT',
                pendingCount: this.pendingMessages.size
            });
            
            // Remove from pending
            if (message.messageId) {
                this.pendingMessages.delete(message.messageId);
                this._log('FIXED: Removed message from pending:', message.messageId);
            }
            
            // Hide typing indicator FIRST
            this._log('FIXED: Hiding typing indicator...');
            this._hideTypingIndicator();
            
            // Validate response text
            let responseText = message.text;
            if (!responseText || typeof responseText !== 'string') {
                responseText = 'Response received but no text content';
                this._log('FIXED: No valid response text, using fallback');
            }
            
            // Add bot response to UI
            this._log('FIXED: Adding bot message to UI...');
            const botMessage = {
                type: 'bot',
                text: responseText,
                timestamp: message.timestamp || Date.now(),
                id: message.messageId,
                components: message.components || []
            };
            
            this._addMessageToUI(botMessage);
            
            this._log('FIXED: Chat response processed successfully, text length:', responseText.length);
            
            // Double-check typing indicator is hidden
            setTimeout(() => {
                this._hideTypingIndicator();
                this._log('FIXED: Double-checked typing indicator hidden');
            }, 100);
            
        } catch (error) {
            this._error('FIXED: Error handling chat response:', error);
            this._hideTypingIndicator();
            
            // Show error message to user
            this._addMessageToUI({
                type: 'error',
                text: 'Error displaying response: ' + error.message,
                timestamp: Date.now()
            });
        }
    },
    
    
    /**
     * FIXED: Handle message queued notification
     */
    _handleMessageQueued(message) {
        try {
            this._log('FIXED: Message queued:', message.messageId);
            this.pendingMessages.add(message.messageId);
            // Keep typing indicator showing
        } catch (error) {
            this._error('Error handling message queued:', error);
        }
    },
    
    /**
     * FIXED: Handle chat error from WebSocket
     */
    _handleChatError(message) {
        try {
            this._log('FIXED: Chat error received:', message.error);
            
            // Remove from pending
            this.pendingMessages.delete(message.messageId);
            
            // Hide typing indicator
            this._hideTypingIndicator();
            
            // Show error message
            this._addMessageToUI({
                type: 'error',
                text: message.error || 'An error occurred processing your message',
                timestamp: message.timestamp || Date.now(),
                id: message.messageId
            });
            
        } catch (error) {
            this._error('Error handling chat error:', error);
        }
    },
    
    /**
     * FIXED: Handle WebSocket status changes
     */
    _handleWebSocketStatus(status) {
        try {
            this._log('FIXED: WebSocket status changed:', status);
            
            this.webSocketConnected = (status === 'connected');
            this._updateConnectionStatus(status);
            
            if (status === 'connected') {
                // Set project context on reconnection
                if (this.currentProjectId && this.currentProjectName) {
                    this.chatService.setProjectContext(this.currentProjectId, this.currentProjectName);
                }
            }
            
        } catch (error) {
            this._error('Error handling WebSocket status:', error);
        }
    },
    
    /**
     * FIXED: Handle WebSocket errors
     */
    _handleWebSocketError(error) {
        try {
            this._error('WebSocket error:', error);
            this._updateConnectionStatus('error');
        } catch (e) {
            this._error('Error handling WebSocket error:', e);
        }
    },
    
    /**
     * FIXED: Update connection status in UI
     */
    _updateConnectionStatus(status) {
        try {
            // Update connection indicators if they exist
            const connectionDot = document.getElementById('connectionDot');
            const connectionText = document.getElementById('connectionText');
            
            if (connectionDot) {
                connectionDot.className = 'connection-dot';
                if (status === 'connected') {
                    connectionDot.classList.add('connected');
                } else if (status === 'connecting' || status === 'reconnecting') {
                    connectionDot.classList.add('connecting');
                }
            }
            
            if (connectionText) {
                switch (status) {
                    case 'connected':
                        connectionText.textContent = 'Connected';
                        break;
                    case 'connecting':
                        connectionText.textContent = 'Connecting...';
                        break;
                    case 'reconnecting':
                        connectionText.textContent = 'Reconnecting...';
                        break;
                    default:
                        connectionText.textContent = 'Disconnected';
                        break;
                }
            }
            
        } catch (error) {
            this._error('Error updating connection status:', error);
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
            
            // Update WebSocket context if connected
            if (this.webSocketConnected && this.chatService) {
                this.chatService.setProjectContext(projectId, projectName);
                this._log('WebSocket project context updated');
            }
            
            // Load chat history for this project
            this._loadChatHistory().catch(error => {
                this._log('Failed to load project chat history:', error);
            });
            
        } catch (error) {
            this._error('Failed to set project context:', error);
        }
    },
    
    /**
     * FIXED: Send message via WebSocket if connected, fallback to API
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
            
            // Generate message ID for tracking
            const userMessageId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
            
            // Add user message to UI immediately
            this._addMessageToUI({
                type: 'user',
                text: text,
                timestamp: Date.now(),
                id: userMessageId
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
                    await this._handleAPIResponse(result.data.response, userMessageId);
                } else if (result.data.bot_message) {
                    await this._handleAPIResponse({
                        text: result.data.bot_message.content,
                        message_id: result.data.bot_message.id,
                        timestamp: result.data.bot_message.timestamp
                    }, userMessageId);
                } else {
                    // Poll for response if no immediate response
                    this._pollForResponse(result.data.message_id, userMessageId);
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
     * Handle API response (fallback method)
     */
    async _handleAPIResponse(response, originalMessageId = null) {
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
        
        // Save bot response to database
        try {
            const authService = window.AuthService;
            if (authService && this.currentProjectId) {
                await authService.executeFunction('save_bot_response', {
                    chat_id: this.currentProjectId,
                    content: responseText,
                    parent_message_id: originalMessageId,
                    context_data: {
                        components: response.components || [],
                        response_metadata: response.metadata || {},
                        api_response: true
                    },
                    metadata: {
                        source: 'chat_integration_api',
                        original_response: response,
                        saved_at: new Date().toISOString()
                    }
                });
                this._log('Bot response saved to database');
            }
        } catch (dbError) {
            this._error('Failed to save bot response to database:', dbError);
            // Continue with UI display even if database save fails
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
     * Poll for response from API (fallback method)
     */
    async _pollForResponse(messageId, originalUserMessageId) {
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
                            
                            // Message is already saved in database, just display it
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
        try {
            if (this.elements.typingIndicator) {
                this._log('FIXED: Removing typing indicator element');
                this.elements.typingIndicator.remove();
                this.elements.typingIndicator = null;
            } else {
                this._log('FIXED: No typing indicator to remove');
            }
            
            // Also remove any stray typing indicators
            if (this.elements.chatBody) {
                const strayIndicators = this.elements.chatBody.querySelectorAll('.typing-indicator');
                strayIndicators.forEach(indicator => {
                    indicator.remove();
                    this._log('FIXED: Removed stray typing indicator');
                });
            }
        } catch (error) {
            this._error('FIXED: Error hiding typing indicator:', error);
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
        this.pendingMessages.clear();
        if (this.elements.chatBody) {
            const messages = this.elements.chatBody.querySelectorAll('.message');
            messages.forEach(msg => msg.remove());
        }
    },
    
    /**
     * FIXED: Disconnect and cleanup with WebSocket cleanup
     */
    disconnect() {
        this._log('Disconnecting ChatIntegration...');
        
        // Disconnect WebSocket
        if (this.chatService && this.webSocketConnected) {
            this.chatService.disconnect();
            this.webSocketConnected = false;
        }
        
        // Remove listeners
        if (this.messageListenerBound && this.chatService) {
            // Note: WebSocket service should provide remove listener methods
            this.messageListenerBound = false;
        }
        
        this.isInitialized = false;
        this.container = null;
        this.elements = {};
        this.messages = [];
        this.pendingMessages.clear();
        this.currentProjectId = null;
        this.currentProjectName = null;
        this.chatService = null;
        
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