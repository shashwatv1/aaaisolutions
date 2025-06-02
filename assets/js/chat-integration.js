/**
 * High-Performance Chat Integration Service for AAAI Solutions
 * Bridges ChatService with UI components for seamless chat experience
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
    
    // Configuration
    options: {
        maxMessages: 100,
        autoScroll: true,
        showTimestamps: true,
        enableTypingIndicator: true,
        debug: false
    },
    
    /**
     * Initialize chat integration with immediate connection option
     */
    init(containerId, options = {}) {
        if (this.isInitialized) {
            return this;
        }
        
        try {
            this.containerId = containerId;
            this.container = document.getElementById(containerId);
            this.options = { ...this.options, ...options };
            
            if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
                this.options.debug = true;
            }
            
            if (!this.container) {
                throw new Error(`Container element '${containerId}' not found`);
            }
            
            // Find UI elements
            this._findUIElements();
            
            // Initialize ChatService if not done already
            if (window.ChatService && !window.ChatService.isInitialized) {
                window.ChatService.init(window.AuthService, {
                    debug: this.options.debug
                });
            }
            
            // Setup ChatService integration
            if (window.ChatService?.isInitialized) {
                this._setupChatServiceIntegration();
                
                // Connect immediately if requested
                if (this.options.connectImmediately && window.AuthService?.isAuthenticated()) {
                    this._connectImmediately();
                }
            }
            
            this.isInitialized = true;
            this._log('ChatIntegration initialized successfully');
            
            return this;
            
        } catch (error) {
            this._error('Failed to initialize ChatIntegration:', error);
            throw error;
        }
    },

    /**
     * Connect immediately without waiting for project context
     */
    async _connectImmediately() {
        try {
            this._log('Connecting immediately...');
            
            // Start connection immediately
            const connectionPromise = window.ChatService.connect();
            
            // Load chat history in parallel (don't wait)
            this._loadChatHistory().catch(error => {
                this._log('Chat history load failed (non-critical):', error);
            });
            
            // Wait for connection
            await connectionPromise;
            this._log('Immediate connection established');
            
        } catch (error) {
            this._error('Immediate connection failed:', error);
            // Don't throw - let the app continue
        }
    },

    /**
     * Set project context after initialization
     */
    setProjectContext(projectId, projectName) {
        try {
            this._log('Setting project context:', { projectId, projectName });
            
            this.currentProjectId = projectId;
            this.currentProjectName = projectName;
            this.hasProject = true;
            
            // Update ChatService context if connected
            if (window.ChatService?.isConnected) {
                window.ChatService.setProjectContext(projectId, projectName);
            }
            
            // Reload chat history for this project
            this._loadChatHistory().catch(error => {
                this._log('Failed to load project chat history:', error);
            });
            
        } catch (error) {
            this._error('Failed to set project context:', error);
        }
    },

    /**
     * Initialize with project context (kept for compatibility but simplified)
     */
    async initializeWithProject(projectId, projectName) {
        try {
            this._log('Setting project context:', { projectId, projectName });
            
            if (!this.isInitialized) {
                throw new Error('ChatIntegration not initialized');
            }
            
            // Just set the project context
            this.setProjectContext(projectId, projectName);
            
            return true;
            
        } catch (error) {
            this._error('Failed to initialize with project:', error);
            return false;
        }
    },
    
    /**
     * Send message through ChatService
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
            
            // Send through ChatService
            if (window.ChatService) {
                const messageId = await window.ChatService.sendMessage(text);
                this.currentMessageId = messageId;
                this._log('Message sent with ID:', messageId);
            } else {
                throw new Error('ChatService not available');
            }
            
        } catch (error) {
            this._error('Failed to send message:', error);
            this._hideTypingIndicator();
            throw error;
        }
    },
    
    /**
     * Add message to UI with enhanced debugging
     */
    _addMessageToUI(message) {
        this._log('Adding message to UI:', message.type, message.text ? message.text.substring(0, 30) + '...' : 'no text');
        
        if (!this.elements.chatBody) {
            this._error('Chat body element not found, cannot add message');
            return;
        }
        
        try {
            const messageElement = this._createMessageElement(message);
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
            
            this._log('Message successfully added to UI, total messages:', this.messages.length);
            
        } catch (error) {
            this._error('Failed to add message to UI:', error);
        }
    },
    
    /**
     * Create message element
     */
    _createMessageElement(message) {
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${message.type}`;
        
        if (message.temporary) {
            messageEl.classList.add('temporary-message');
        }
        
        // Message content
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.innerHTML = this._formatMessageContent(message.text);
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
        
        return messageEl;
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
                    
                    this._addMessageToUI(messageData);
                });
                
                this._log(`Loaded ${history.length} messages from history`);
            }
            
        } catch (error) {
            this._error('Failed to load chat history:', error);
        }
    },
    
    /**
     * Setup ChatService integration with enhanced debugging
     */
    _setupChatServiceIntegration() {
        if (!window.ChatService) {
            this._error('ChatService not available for integration');
            return;
        }
        
        this._log('Setting up ChatService integration...');
        
        // Listen for messages
        window.ChatService.onMessage((data) => {
            this._log('ChatService message received:', data.type);
            this._handleChatServiceMessage(data);
        });
        
        // Listen for status changes
        window.ChatService.onStatusChange((status) => {
            this._log('ChatService status changed:', status);
            this._handleStatusChange(status);
        });
        
        // Listen for errors
        window.ChatService.onError((error) => {
            this._error('ChatService error:', error);
            this._handleChatServiceError(error);
        });
        
        this._log('ChatService integration setup complete');
    },
    
    /**
     * Handle ChatService messages
     */
    _handleChatServiceMessage(data) {
        this._log('Received ChatService message:', data);
        
        switch (data.type) {
            case 'message_queued':
                this._handleMessageQueued(data);
                break;
                
            case 'chat_response':
                this._handleChatResponse(data);
                break;
                
            case 'chat_error':
                this._handleChatError(data);
                break;
                
            default:
                this._log('Unhandled message type:', data.type);
                break;
        }
    },
    
    /**
     * Handle message queued
     */
    _handleMessageQueued(data) {
        // Update UI to show message is being processed
        this._log('Message queued:', data.messageId);
    },
    
    /**
     * Handle chat response with enhanced logging and error handling
     */
    _handleChatResponse(data) {
        this._log('Processing chat response:', data);
        this._hideTypingIndicator();
        
        try {
            let messageText = 'No response received';
            
            // Extract text from various possible response formats
            if (data.text) {
                messageText = data.text;
            } else if (data.response) {
                if (typeof data.response === 'string') {
                    messageText = data.response;
                } else if (data.response.text) {
                    messageText = data.response.text;
                } else {
                    messageText = JSON.stringify(data.response);
                }
            }
            
            // Add bot message to UI
            this._addMessageToUI({
                type: 'bot',
                text: messageText,
                timestamp: data.timestamp || Date.now(),
                id: data.messageId
            });
            
            this._log('Bot message added to UI:', messageText.substring(0, 50) + '...');
            
            // Handle components if present
            if (data.components && Array.isArray(data.components) && data.components.length > 0) {
                this._log('Processing components:', data.components.length);
                data.components.forEach((component, index) => {
                    try {
                        this._addComponentToUI(component);
                        this._log('Component added:', index, component.type);
                    } catch (error) {
                        this._error('Failed to add component:', error, component);
                    }
                });
            }
            
        } catch (error) {
            this._error('Error handling chat response:', error, data);
            
            // Add error message to UI
            this._addMessageToUI({
                type: 'error',
                text: 'Error displaying response: ' + error.message,
                timestamp: Date.now()
            });
        }
    },
    
    /**
     * Handle chat error
     */
    _handleChatError(data) {
        this._hideTypingIndicator();
        
        this._addMessageToUI({
            type: 'error',
            text: `Error: ${data.error || 'Unknown error occurred'}`,
            timestamp: data.timestamp || Date.now(),
            id: data.messageId
        });
    },
    
    /**
     * Handle status changes
     */
    _handleStatusChange(status) {
        this._log('Chat status changed:', status);
        // Status changes are handled by the main chat application
    },
    
    /**
     * Handle ChatService errors
     */
    _handleChatServiceError(error) {
        this._error('ChatService error:', error);
        this._hideTypingIndicator();
    },
    
    /**
     * Add component to UI (placeholder for future component support)
     */
    _addComponentToUI(component) {
        this._log('Component received:', component);
        // Future implementation for rich components
    },
    
    /**
     * Find UI elements in container
     */
    _findUIElements() {
        if (!this.container) return;
        
        this.elements.chatBody = this.container.querySelector('.chat-body') || 
                                 this.container.querySelector('#chatBody');
        
        this.elements.messageInput = this.container.querySelector('.chat-input') || 
                                    this.container.querySelector('#messageInput');
        
        this.elements.sendButton = this.container.querySelector('.chat-send-btn') || 
                                  this.container.querySelector('#sendMessageBtn');
        
        this._log('UI elements found:', {
            chatBody: !!this.elements.chatBody,
            messageInput: !!this.elements.messageInput,
            sendButton: !!this.elements.sendButton
        });
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
        if (window.ChatService) {
            window.ChatService.disconnect();
        }
        
        this.isInitialized = false;
        this.container = null;
        this.elements = {};
        this.messages = [];
        
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