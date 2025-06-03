/**
 * Production Chat Integration with Reel Support for AAAI Solutions
 * Robust, reliable chat interface with proper reel management
 */
class ProductionChatIntegration {
    constructor() {
        this.isInitialized = false;
        this.container = null;
        this.elements = {};
        this.messages = [];
        this.currentProjectId = null;
        this.currentProjectName = null;
        this.currentReelId = null;
        this.currentReelName = null;
        this.webSocketManager = null;
        this.reels = [];
        
        // UI state
        this.isTypingIndicatorVisible = false;
        this.maxMessages = 100;
        
        // Event handlers (bound to maintain context)
        this.handleWebSocketEvent = this.handleWebSocketEvent.bind(this);
        this.handleSendMessage = this.handleSendMessage.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleInput = this.handleInput.bind(this);
    }
    
    /**
     * Initialize the chat integration
     */
    async initialize(containerId, options = {}) {
        if (this.isInitialized) {
            return this;
        }
        
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container element '${containerId}' not found`);
        }
        
        // Find UI elements
        this.findUIElements();
        
        // Initialize WebSocket manager
        this.webSocketManager = window.ProductionWebSocketManager;
        if (!this.webSocketManager) {
            throw new Error('ProductionWebSocketManager not available');
        }
        
        // Initialize WebSocket if not already done
        if (!window.AuthService) {
            throw new Error('AuthService not available');
        }
        
        this.webSocketManager.initialize(window.AuthService);
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Connect WebSocket
        await this.webSocketManager.connect();
        
        this.isInitialized = true;
        return this;
    }
    
    /**
     * Set project context and load reels
     */
    async setProjectContext(projectId, projectName) {
        this.currentProjectId = projectId;
        this.currentProjectName = projectName;
        
        if (this.webSocketManager) {
            this.webSocketManager.setProjectContext(projectId, projectName);
        }
        
        // Load reels for this project
        await this.loadProjectReels();
        
        // If no reel is selected and we have reels, select the first one
        if (!this.currentReelId && this.reels.length > 0) {
            await this.switchToReel(this.reels[0].id, this.reels[0].reel_name);
        }
        
        // Update UI
        this.updateReelSelector();
    }
    
    /**
     * Load reels for current project
     */
    async loadProjectReels() {
        if (!this.currentProjectId || !window.AuthService?.isAuthenticated()) {
            return;
        }
        
        try {
            const result = await window.AuthService.executeFunction('list_project_reels', {
                chat_id: this.currentProjectId
            });
            
            if (result?.status === 'success' && result?.data?.success) {
                this.reels = result.data.reels || [];
                console.log('Loaded reels:', this.reels);
            } else {
                this.reels = [];
            }
        } catch (error) {
            console.error('Failed to load project reels:', error);
            this.reels = [];
        }
    }
    
    showReelSwitchLoading(show) {
        const reelList = document.getElementById('reelList');
        if (!reelList) return;
        
        if (show) {
            const loadingHTML = `
                <div class="loading-reels">
                    <div class="loading-spinner"></div>
                    <span>Switching reel...</span>
                </div>
            `;
            reelList.innerHTML = loadingHTML;
        }
        // If hide, updateReelSelector will be called to restore the list
    }
    showReelError(message) {
        if (this.elements.chatBody) {
            this.addMessageToUI({
                type: 'error',
                text: message,
                timestamp: Date.now()
            });
        }
    }
    hideWelcomeMessage() {
        const welcomeMessage = document.getElementById('welcomeMessage');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
    }
    showEmptyReelMessage() {
        if (this.elements.chatBody) {
            this.addMessageToUI({
                type: 'system',
                text: `This reel "${this.currentReelName}" is empty. Start a conversation!`,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Switch to a specific reel
     */
    async switchToReel(reelId, reelName) {
        if (!this.currentProjectId || !reelId) {
            console.error('Missing project ID or reel ID for switch');
            return false;
        }
        
        console.log('Switching to reel:', { reelId, reelName, projectId: this.currentProjectId });
        
        // Show loading state
        this.showReelSwitchLoading(true);
        
        try {
            // Call API to switch reel context
            const result = await window.AuthService.executeFunction('switch_reel_context', {
                chat_id: this.currentProjectId,
                reel_id: reelId
            });
            
            console.log('Switch reel API response:', result);
            
            if (result?.status === 'success' && result?.data?.success) {
                // Update current reel info
                this.currentReelId = reelId;
                this.currentReelName = reelName;
                
                console.log('Reel context switched successfully, loading history...');
                
                // Update WebSocket context
                if (this.webSocketManager) {
                    this.webSocketManager.setProjectContext(this.currentProjectId, this.currentProjectName);
                }
                
                // Load messages for this reel
                await this.loadReelHistory();
                
                // Update UI
                this.updateReelSelector();
                
                // Hide welcome message if visible
                this.hideWelcomeMessage();
                
                document.dispatchEvent(new CustomEvent('reel_switched', {
                    detail: { reelId: reelId, reelName: reelName }
                }));
            } else {
                console.error('Failed to switch reel context:', result);
                this.showReelError('Failed to switch to reel. Please try again.');
                return false;
            }
        } catch (error) {
            console.error('Error switching reel:', error);
            this.showReelError('Error switching to reel: ' + error.message);
            return false;
        } finally {
            this.showReelSwitchLoading(false);
        }
    }
    
    /**
     * Create a new reel
     */
    async createReel(reelName, reelDescription = '') {
        if (!this.currentProjectId || !reelName?.trim()) {
            console.error('Invalid parameters for reel creation');
            return false;
        }
        
        try {
            console.log('Creating new reel:', { reelName, reelDescription, projectId: this.currentProjectId });
            
            const result = await window.AuthService.executeFunction('create_reel', {
                chat_id: this.currentProjectId,
                reel_name: reelName.trim(),
                reel_description: reelDescription.trim()
            });
            
            if (result?.status === 'success' && result?.data?.success) {
                const newReel = result.data.reel;
                const reelId = result.data.reel_id;
                
                // Add new reel to list
                this.reels.push(newReel);
                
                // Switch to new reel
                await this.switchToReel(reelId, reelName);
                
                console.log('✅ Reel created successfully:', newReel);
                return true;
            } else {
                console.error('Reel creation failed:', result);
                return false;
            }
        } catch (error) {
            console.error('Failed to create reel:', error);
            return false;
        }
    }

    /**
     * Send a message with reel context
     */
    async sendMessage(text) {
        if (!text?.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        if (!this.currentReelId) {
            throw new Error('No active reel selected');
        }
        
        // Add user message to UI
        this.addMessageToUI({
            type: 'user',
            text: text.trim(),
            timestamp: Date.now(),
            reel_id: this.currentReelId
        });
        
        // Clear input
        if (this.elements.messageInput) {
            this.elements.messageInput.value = '';
            this.resizeInput();
        }
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            // Send via WebSocket with reel context
            const messageId = await this.webSocketManager.sendMessage(text.trim(), {
                reel_id: this.currentReelId,
                reel_name: this.currentReelName
            });
            return messageId;
        } catch (error) {
            this.hideTypingIndicator();
            this.addMessageToUI({
                type: 'error',
                text: 'Failed to send message: ' + error.message,
                timestamp: Date.now()
            });
            throw error;
        }
    }
    
    /**
     * Load chat history for current reel
     */
/**
     * Load chat history for current reel with better error handling
     */
    async loadReelHistory() {
        if (!this.currentProjectId || !this.currentReelId || !window.AuthService?.isAuthenticated()) {
            console.warn('Cannot load reel history - missing requirements');
            return;
        }
        
        console.log('Loading reel history for:', { 
            projectId: this.currentProjectId, 
            reelId: this.currentReelId 
        });
        
        try {
            const result = await window.AuthService.executeFunction('get_reel_messages', {
                chat_id: this.currentProjectId,
                reel_id: this.currentReelId,
                limit: 30,
                offset: 0
            });
            
            console.log('Reel messages API response:', result);
            
            if (result?.status === 'success') {
                // Clear existing messages first
                this.clearMessages();
                
                if (result?.data?.messages?.length > 0) {
                    console.log(`Loading ${result.data.messages.length} messages for reel`);
                    
                    // Add history messages (reverse to show oldest first)
                    result.data.messages.reverse().forEach(msg => {
                        this.addMessageToUI({
                            type: msg.sender === 'user' ? 'user' : 'bot',
                            text: msg.content,
                            timestamp: new Date(msg.timestamp).getTime(),
                            id: msg.id,
                            reel_id: msg.reel_id
                        });
                    });
                    
                    // Scroll to bottom
                    this.scrollToBottom();
                } else {
                    console.log('No messages found for this reel');
                    // Show empty reel message
                    this.showEmptyReelMessage();
                }
            } else {
                console.error('Failed to get reel messages:', result);
                this.showReelError('Failed to load chat history.');
            }
        } catch (error) {
            console.error('Failed to load reel history:', error);
            this.showReelError('Error loading chat history: ' + error.message);
        }
    }
    /**
     * Update reel selector UI
     */
    updateReelSelector() {
        const reelList = document.getElementById('reelList');
        const reelTitle = document.getElementById('currentReelTitle');
        
        if (reelList) {
            // Clear existing content
            reelList.innerHTML = '';
            
            if (this.reels.length === 0) {
                // Show empty state
                reelList.innerHTML = `
                    <div class="empty-reel-list">
                        <ion-icon name="chatbubbles-outline"></ion-icon>
                        <span>No reels available</span>
                    </div>
                `;
            } else {
                // Create reel buttons
                this.reels.forEach(reel => {
                    const reelButton = document.createElement('button');
                    reelButton.className = 'reel-item';
                    reelButton.setAttribute('data-reel-id', reel.id);
                    
                    if (reel.id === this.currentReelId) {
                        reelButton.classList.add('active');
                    }
                    
                    // Format creation date
                    const createdDate = new Date(reel.created_at);
                    const timeAgo = this.formatTimeAgo(createdDate);
                    
                    reelButton.innerHTML = `
                        <div class="reel-item-content">
                            <div class="reel-item-name" title="${this.escapeHtml(reel.reel_name)}">${this.escapeHtml(reel.reel_name)}</div>
                            <div class="reel-item-info">
                                <div class="reel-item-messages">
                                    <ion-icon name="chatbubble-outline"></ion-icon>
                                    <span>${reel.message_count || 0}</span>
                                </div>
                                <span>•</span>
                                <span>${timeAgo}</span>
                            </div>
                        </div>
                        ${reel.id === this.currentReelId ? '<div class="reel-item-indicator"></div>' : ''}
                    `;
                    
                    // Add click handler
                    reelButton.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        
                        // Prevent multiple clicks
                        if (reelButton.disabled) return;
                        
                        // Disable button temporarily
                        reelButton.disabled = true;
                        reelButton.style.opacity = '0.7';
                        
                        try {
                            console.log('Reel button clicked:', { reelId: reel.id, reelName: reel.reel_name });
                            await this.switchToReel(reel.id, reel.reel_name);
                        } catch (error) {
                            console.error('Error in reel button click handler:', error);
                        } finally {
                            // Re-enable button
                            setTimeout(() => {
                                reelButton.disabled = false;
                                reelButton.style.opacity = '1';
                            }, 1000);
                        }
                    });
                    
                    reelList.appendChild(reelButton);
                });
            }
        }
        
        // Update current reel title
        if (reelTitle) {
            reelTitle.textContent = this.currentReelName || 'No reel selected';
        }
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));
        
        if (diffInMinutes < 1) return 'Just now';
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h ago`;
        
        const diffInDays = Math.floor(diffInHours / 24);
        if (diffInDays < 7) return `${diffInDays}d ago`;
        
        if (diffInDays < 30) {
            const weeks = Math.floor(diffInDays / 7);
            return `${weeks}w ago`;
        }
        
        const diffInMonths = Math.floor(diffInDays / 30);
        if (diffInMonths < 12) return `${diffInMonths}mo ago`;
        
        const years = Math.floor(diffInMonths / 12);
        return `${years}y ago`;
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    /**
     * Clear all messages
     */
    clearMessages() {
        this.messages = [];
        
        if (this.elements.chatBody) {
            // Remove all message elements but keep welcome message hidden
            const messages = this.elements.chatBody.querySelectorAll('.message, .typing-indicator');
            messages.forEach(msg => msg.remove());
            
            // Also remove any system messages
            const systemMessages = this.elements.chatBody.querySelectorAll('.message-system, .message-error');
            systemMessages.forEach(msg => msg.remove());
        }
        
        console.log('Chat messages cleared');
    }
    
    /**
     * Disconnect and cleanup
     */
    disconnect() {
        this.removeEventListeners();
        
        if (this.webSocketManager) {
            this.webSocketManager.disconnect();
        }
        
        this.isInitialized = false;
        this.container = null;
        this.elements = {};
        this.messages = [];
        this.reels = [];
        this.currentReelId = null;
        this.currentReelName = null;
    }
    
    // Private methods (keeping existing implementation but adding reel support)
    
    findUIElements() {
        const selectors = {
            chatBody: ['.chat-body', '#chatBody'],
            messageInput: ['.chat-input', '#messageInput'],
            sendButton: ['.chat-send-btn', '#sendMessageBtn']
        };
        
        for (const [elementName, selectorList] of Object.entries(selectors)) {
            for (const selector of selectorList) {
                const element = this.container.querySelector(selector);
                if (element) {
                    this.elements[elementName] = element;
                    break;
                }
            }
        }
        
        // Validate critical elements
        if (!this.elements.chatBody) {
            throw new Error('Chat body element not found');
        }
        
        if (!this.elements.messageInput) {
            throw new Error('Message input element not found');
        }
        
        if (!this.elements.sendButton) {
            throw new Error('Send button element not found');
        }
    }
    
    setupEventListeners() {
        // WebSocket events
        document.addEventListener('websocket_event', this.handleWebSocketEvent);
        
        // UI events
        if (this.elements.sendButton) {
            this.elements.sendButton.addEventListener('click', this.handleSendMessage);
        }
        
        if (this.elements.messageInput) {
            this.elements.messageInput.addEventListener('keydown', this.handleKeyDown);
            this.elements.messageInput.addEventListener('input', this.handleInput);
        }
        
        // New reel button
        const newReelBtn = document.getElementById('newReelBtn');
        if (newReelBtn) {
            newReelBtn.addEventListener('click', () => {
                this.showNewReelModal();
            });
        }
    }
    
    removeEventListeners() {
        document.removeEventListener('websocket_event', this.handleWebSocketEvent);
        
        if (this.elements.sendButton) {
            this.elements.sendButton.removeEventListener('click', this.handleSendMessage);
        }
        
        if (this.elements.messageInput) {
            this.elements.messageInput.removeEventListener('keydown', this.handleKeyDown);
            this.elements.messageInput.removeEventListener('input', this.handleInput);
        }
    }
    
    handleWebSocketEvent(event) {
        const { type, data } = event.detail;
        
        switch (type) {
            case 'chat_response':
                this.handleChatResponse(data);
                break;
            case 'chat_error':
                this.handleChatError(data);
                break;
            case 'state_change':
                this.handleStateChange(data);
                break;
        }
    }
    
    handleChatResponse(data) {
        this.hideTypingIndicator();
        
        this.addMessageToUI({
            type: 'bot',
            text: data.text,
            timestamp: data.timestamp,
            id: data.messageId,
            components: data.components,
            reel_id: this.currentReelId
        });
    }
    
    handleChatError(data) {
        this.hideTypingIndicator();
        
        this.addMessageToUI({
            type: 'error',
            text: data.error || 'An error occurred',
            timestamp: data.timestamp,
            id: data.messageId
        });
    }
    
    handleStateChange(data) {
        this.updateConnectionStatus(data.state);
    }
    
    handleSendMessage() {
        if (!this.elements.messageInput) return;
        
        const text = this.elements.messageInput.value.trim();
        if (text) {
            this.sendMessage(text).catch(error => {
                console.error('Failed to send message:', error);
            });
        }
    }
    
    handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSendMessage();
        }
    }
    
    handleInput() {
        this.resizeInput();
    }
    
    addMessageToUI(message) {
        if (!this.elements.chatBody || !message.text) return;
        
        const messageElement = this.createMessageElement(message);
        this.elements.chatBody.appendChild(messageElement);
        
        // Hide welcome message
        const welcomeMessage = this.elements.chatBody.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.style.display = 'none';
        }
        
        // Manage message limit
        this.enforceMessageLimit();
        
        // Auto scroll
        this.scrollToBottom();
        
        // Store message
        this.messages.push(message);
    }
    
    createMessageElement(message) {
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${message.type}`;
        
        if (message.id) {
            messageEl.setAttribute('data-message-id', message.id);
        }
        
        if (message.reel_id) {
            messageEl.setAttribute('data-reel-id', message.reel_id);
        }
        
        // Message content
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        contentEl.textContent = message.text;
        messageEl.appendChild(contentEl);
        
        // Timestamp
        if (message.timestamp) {
            const timestampEl = document.createElement('div');
            timestampEl.className = 'message-timestamp';
            timestampEl.textContent = this.formatTimestamp(message.timestamp);
            messageEl.appendChild(timestampEl);
        }
        
        return messageEl;
    }
    
    showTypingIndicator() {
        if (this.isTypingIndicatorVisible || !this.elements.chatBody) return;
        
        const typingEl = document.createElement('div');
        typingEl.className = 'typing-indicator';
        typingEl.innerHTML = `
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
            <div class="typing-dot"></div>
        `;
        
        this.elements.chatBody.appendChild(typingEl);
        this.elements.typingIndicator = typingEl;
        this.isTypingIndicatorVisible = true;
        
        this.scrollToBottom();
    }
    
    hideTypingIndicator() {
        if (this.elements.typingIndicator) {
            this.elements.typingIndicator.remove();
            this.elements.typingIndicator = null;
            this.isTypingIndicatorVisible = false;
        }
    }
    
    updateConnectionStatus(state) {
        const connectionDot = document.getElementById('connectionDot');
        const connectionText = document.getElementById('connectionText');
        
        if (connectionDot) {
            connectionDot.className = 'connection-dot';
            if (state === 'connected') {
                connectionDot.classList.add('connected');
            } else if (state === 'connecting') {
                connectionDot.classList.add('connecting');
            }
        }
        
        if (connectionText) {
            const statusText = {
                'connected': 'Connected',
                'connecting': 'Connecting...',
                'disconnected': 'Disconnected'
            };
            connectionText.textContent = statusText[state] || 'Unknown';
        }
    }
    
    resizeInput() {
        if (this.elements.messageInput && this.elements.messageInput.tagName === 'TEXTAREA') {
            this.elements.messageInput.style.height = 'auto';
            this.elements.messageInput.style.height = Math.min(this.elements.messageInput.scrollHeight, 120) + 'px';
        }
    }
    
    scrollToBottom() {
        if (this.elements.chatBody) {
            this.elements.chatBody.scrollTop = this.elements.chatBody.scrollHeight;
        }
    }
    
    enforceMessageLimit() {
        if (this.messages.length <= this.maxMessages) return;
        
        const messagesToRemove = this.messages.length - this.maxMessages;
        const messageElements = this.elements.chatBody.querySelectorAll('.message');
        
        for (let i = 0; i < messagesToRemove && i < messageElements.length; i++) {
            messageElements[i].remove();
        }
        
        this.messages.splice(0, messagesToRemove);
    }
    
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
    
    showNewReelModal() {
        if (typeof window.showNewReelModal === 'function') {
            window.showNewReelModal();
        } else {
            console.error('New reel modal function not available');
        }
    }
}

// Global instance
window.ProductionChatIntegration = new ProductionChatIntegration();