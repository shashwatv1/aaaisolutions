/**
 * Production Chat Integration with Parallel Processing and Reel Support for AAAI Solutions
 * Ultra-fast, non-blocking chat interface with optimized resource loading
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
        
        // Performance optimization
        this.messageFragment = null;
        this.isLoadingReels = false;
        this.isLoadingHistory = false;
        
        // Event handlers (bound to maintain context)
        this.handleWebSocketEvent = this.handleWebSocketEvent.bind(this);
        this.handleSendMessage = this.handleSendMessage.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleInput = this.handleInput.bind(this);
    }
    
    /**
     * Ultra-fast parallel initialization
     */
    async initialize(containerId, options = {}) {
        if (this.isInitialized) {
            return this;
        }
        
        const startTime = performance.now();
        
        this.container = document.getElementById(containerId);
        if (!this.container) {
            throw new Error(`Container element '${containerId}' not found`);
        }
        
        // Parallel initialization tasks
        const [elementsFound, wsReady] = await Promise.allSettled([
            this.findUIElementsParallel(),
            this.initializeWebSocketParallel()
        ]);
        
        if (elementsFound.status === 'rejected') {
            throw elementsFound.reason;
        }
        
        if (wsReady.status === 'rejected') {
            console.warn('WebSocket initialization failed, will retry:', wsReady.reason);
        }
        
        // Set up event listeners (non-blocking)
        requestAnimationFrame(() => this.setupEventListeners());
        
        this.isInitialized = true;
        
        const initTime = performance.now() - startTime;
        console.log(`✅ Chat integration initialized in ${initTime.toFixed(2)}ms`);
        
        return this;
    }
    
    /**
     * Parallel UI elements discovery
     */
    async findUIElementsParallel() {
        return new Promise((resolve, reject) => {
            requestAnimationFrame(() => {
                try {
                    const selectors = {
                        chatBody: ['.chat-body', '#chatBody'],
                        messageInput: ['.chat-input', '#messageInput'],
                        sendButton: ['.chat-send-btn', '#sendMessageBtn']
                    };
                    
                    // Parallel element finding
                    const elementPromises = Object.entries(selectors).map(([elementName, selectorList]) => {
                        return new Promise((resolveElement) => {
                            for (const selector of selectorList) {
                                const element = this.container.querySelector(selector);
                                if (element) {
                                    this.elements[elementName] = element;
                                    resolveElement({ name: elementName, found: true });
                                    return;
                                }
                            }
                            resolveElement({ name: elementName, found: false });
                        });
                    });
                    
                    Promise.all(elementPromises).then(results => {
                        // Validate critical elements
                        const criticalElements = ['chatBody', 'messageInput', 'sendButton'];
                        const missing = results.filter(r => 
                            criticalElements.includes(r.name) && !r.found
                        ).map(r => r.name);
                        
                        if (missing.length > 0) {
                            reject(new Error(`Critical elements not found: ${missing.join(', ')}`));
                        } else {
                            resolve(results);
                        }
                    });
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
    
    /**
     * Parallel WebSocket initialization
     */
    async initializeWebSocketParallel() {
        return new Promise((resolve, reject) => {
            try {
                this.webSocketManager = window.ProductionWebSocketManager;
                if (!this.webSocketManager) {
                    reject(new Error('ProductionWebSocketManager not available'));
                    return;
                }
                
                if (!window.AuthService) {
                    reject(new Error('AuthService not available'));
                    return;
                }
                
                // Initialize WebSocket in parallel
                this.webSocketManager.initialize(window.AuthService);
                
                // Connect asynchronously (non-blocking)
                this.webSocketManager.connect()
                    .then(() => resolve())
                    .catch(reject);
                    
            } catch (error) {
                reject(error);
            }
        });
    }
    
    /**
     * Ultra-fast parallel project context setting with resource loading
     */
    async setProjectContextParallel(projectId, projectName) {
        const startTime = performance.now();
        
        this.currentProjectId = projectId;
        this.currentProjectName = projectName;
        
        // Update WebSocket immediately (non-blocking)
        if (this.webSocketManager) {
            this.webSocketManager.setProjectContext(projectId, projectName);
        }
        
        // Parallel resource loading
        const [reelsLoaded, historyReady] = await Promise.allSettled([
            this.loadProjectReelsParallel(),
            this.prepareHistoryLoading()
        ]);
        
        // Handle reel selection (non-blocking)
        if (reelsLoaded.status === 'fulfilled' && this.reels.length > 0 && !this.currentReelId) {
            // Select first reel in background
            requestAnimationFrame(() => {
                this.switchToReelParallel(this.reels[0].id, this.reels[0].reel_name);
            });
        } else if (this.currentReelId && this.webSocketManager) {
            // Update WebSocket with complete context
            this.webSocketManager.setCompleteContext(
                this.currentProjectId,
                this.currentProjectName,
                this.currentReelId,
                this.currentReelName
            );
        }
        
        // Update UI (non-blocking)
        requestAnimationFrame(() => this.updateReelSelectorOptimized());
        
        const contextTime = performance.now() - startTime;
        console.log(`✅ Project context set in ${contextTime.toFixed(2)}ms`);
    }
    
    /**
     * Legacy setProjectContext method for backward compatibility
     */
    async setProjectContext(projectId, projectName) {
        return this.setProjectContextParallel(projectId, projectName);
    }
    
    /**
     * Parallel reel loading with caching
     */
    async loadProjectReelsParallel() {
        if (!this.currentProjectId || !window.AuthService?.isAuthenticated() || this.isLoadingReels) {
            return [];
        }
        
        this.isLoadingReels = true;
        
        try {
            console.log('⚡ Loading reels in parallel for project:', this.currentProjectId);
            
            const result = await window.AuthService.executeFunction('list_project_reels', {
                chat_id: this.currentProjectId,
                email: window.AuthService.getCurrentUser().email
            });
            
            if (result?.status === 'success' && result?.data?.success) {
                this.reels = result.data.reels || [];
                console.log(`✅ Loaded ${this.reels.length} reels in parallel`);
                return this.reels;
            } else {
                console.error('Failed to load reels:', result);
                this.reels = [];
                return [];
            }
        } catch (error) {
            console.error('Failed to load project reels:', error);
            this.reels = [];
            return [];
        } finally {
            this.isLoadingReels = false;
        }
    }
    
    /**
     * Prepare history loading (non-blocking)
     */
    async prepareHistoryLoading() {
        // Just prepare, don't actually load until reel is selected
        return Promise.resolve();
    }
    
    /**
     * Ultra-fast parallel reel switching
     */
    async switchToReelParallel(reelId, reelName) {
        if (!this.currentProjectId || !reelId || this.currentReelId === reelId) {
            return false;
        }
        
        const startTime = performance.now();
        
        console.log('⚡ Parallel reel switch:', { reelId, reelName, projectId: this.currentProjectId });
        
        // Show loading state (non-blocking)
        requestAnimationFrame(() => this.showReelSwitchLoadingOptimized());
        
        try {
            // Parallel operations: API call and UI updates
            const [apiResult, uiReady] = await Promise.allSettled([
                this.switchReelContextAPI(reelId),
                this.prepareReelUI(reelId, reelName)
            ]);
            
            if (apiResult.status === 'rejected' || !apiResult.value?.success) {
                const error = apiResult.reason || apiResult.value?.error || 'Unknown error';
                throw new Error(error);
            }
            
            // Update context immediately
            this.currentReelId = reelId;
            this.currentReelName = reelName;
            
            // Update WebSocket context (non-blocking)
            if (this.webSocketManager) {
                this.webSocketManager.setCompleteContext(
                    this.currentProjectId, 
                    this.currentProjectName,
                    this.currentReelId,
                    this.currentReelName
                );
            }
            
            // Load history in parallel (non-blocking)
            requestAnimationFrame(() => {
                this.loadReelHistoryParallel().catch(error => {
                    console.warn('History loading failed:', error);
                });
            });
            
            // Update UI (non-blocking)
            requestAnimationFrame(() => {
                this.updateReelSelectorOptimized();
                this.hideWelcomeMessage();
            });
            
            // Dispatch event (non-blocking)
            setTimeout(() => {
                document.dispatchEvent(new CustomEvent('reel_switched', {
                    detail: { reelId: reelId, reelName: reelName }
                }));
            }, 0);
            
            const switchTime = performance.now() - startTime;
            console.log(`✅ Reel switched in ${switchTime.toFixed(2)}ms`);
            
            return true;
            
        } catch (error) {
            console.error('Error in parallel reel switch:', error);
            
            // Show error (non-blocking)
            requestAnimationFrame(() => {
                this.showReelErrorOptimized(error.message);
            });
            
            return false;
            
        } finally {
            // Hide loading (non-blocking)
            requestAnimationFrame(() => {
                this.hideReelSwitchLoading();
            });
        }
    }
    
    /**
     * API call for reel context switch
     */
    async switchReelContextAPI(reelId) {
        const result = await window.AuthService.executeFunction('switch_reel_context', {
            chat_id: this.currentProjectId,
            reel_id: reelId,
            email: window.AuthService.getCurrentUser().email
        });
        
        if (result?.status === 'success' && result?.data?.success) {
            return { success: true, data: result.data };
        } else {
            throw new Error(result?.data?.message || result?.message || 'API call failed');
        }
    }
    
    /**
     * Prepare reel UI (non-blocking)
     */
    async prepareReelUI(reelId, reelName) {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                // Pre-clear messages for instant feedback
                this.clearMessagesOptimized();
                resolve();
            });
        });
    }
    
    /**
     * Ultra-fast parallel history loading with batching
     */
    async loadReelHistoryParallel() {
        if (!this.currentProjectId || !this.currentReelId || !window.AuthService?.isAuthenticated() || this.isLoadingHistory) {
            return;
        }
        
        this.isLoadingHistory = true;
        const startTime = performance.now();
        
        try {
            console.log('⚡ Loading reel history in parallel');
            
            const result = await window.AuthService.executeFunction('get_reel_messages', {
                chat_id: this.currentProjectId,
                reel_id: this.currentReelId,
                limit: 50,
                offset: 0
            });
            
            if (result?.status === 'success' && result?.data?.success) {
                if (result?.data?.messages?.length > 0) {
                    // Process messages in batches for better performance
                    await this.renderMessagesInBatches(result.data.messages);
                    
                    const historyTime = performance.now() - startTime;
                    console.log(`✅ Loaded ${result.data.messages.length} messages in ${historyTime.toFixed(2)}ms`);
                } else {
                    requestAnimationFrame(() => this.showEmptyReelMessage());
                }
            } else {
                throw new Error('Failed to get reel messages from database');
            }
        } catch (error) {
            console.error('Failed to load reel history:', error);
            requestAnimationFrame(() => {
                this.showReelErrorOptimized('Error loading chat history: ' + error.message);
            });
        } finally {
            this.isLoadingHistory = false;
        }
    }
    
    /**
     * Render messages in batches for better performance
     */
    async renderMessagesInBatches(messages) {
        // Sort messages first
        const sortedMessages = messages.sort((a, b) => {
            return new Date(a.timestamp) - new Date(b.timestamp);
        });
        
        // Clear existing messages first
        this.clearMessagesOptimized();
        
        // Create document fragment for batch DOM operations
        const fragment = document.createDocumentFragment();
        const batchSize = 10;
        
        for (let i = 0; i < sortedMessages.length; i += batchSize) {
            const batch = sortedMessages.slice(i, i + batchSize);
            
            // Process batch
            batch.forEach(msg => {
                const messageElement = this.createMessageElementOptimized({
                    type: msg.sender === 'user' ? 'user' : (msg.sender === 'bot' ? 'bot' : 'system'),
                    text: msg.content,
                    timestamp: new Date(msg.timestamp).getTime(),
                    id: msg.id,
                    reel_id: msg.reel_id,
                    isHistorical: true
                });
                fragment.appendChild(messageElement);
            });
            
            // Add batch to DOM in next frame
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    if (this.elements.chatBody) {
                        this.elements.chatBody.appendChild(fragment.cloneNode(true));
                        // Clear fragment for next batch
                        while (fragment.firstChild) {
                            fragment.removeChild(fragment.firstChild);
                        }
                    }
                    resolve();
                });
            });
        }
        
        // Scroll to bottom after all batches
        requestAnimationFrame(() => this.scrollToBottom());
    }
    
    /**
     * Optimized message element creation
     */
    createMessageElementOptimized(message) {
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${message.type}`;
        
        if (message.id) messageEl.setAttribute('data-message-id', message.id);
        if (message.reel_id) messageEl.setAttribute('data-reel-id', message.reel_id);
        if (message.isTemporary) messageEl.classList.add('temporary-message');
        if (message.isHistorical) messageEl.classList.add('historical-message');
        
        // Use innerHTML for better performance with simple content
        messageEl.innerHTML = `
            <div class="message-content">${this.escapeHtml(message.text)}</div>
            ${message.timestamp ? `<div class="message-timestamp">${this.formatTimestamp(message.timestamp)}</div>` : ''}
        `;
        
        return messageEl;
    }
    
    /**
     * Optimized clear messages with fragment
     */
    clearMessagesOptimized() {
        if (!this.elements.chatBody) return;
        
        // Use DocumentFragment for efficient DOM manipulation
        const range = document.createRange();
        range.selectNodeContents(this.elements.chatBody);
        
        // Remove all message elements efficiently
        const messages = this.elements.chatBody.querySelectorAll('.message, .typing-indicator, .message-system, .message-error');
        messages.forEach(msg => msg.remove());
        
        this.messages = [];
    }
    
    /**
     * Optimized reel selector update with virtual DOM concepts
     */
    updateReelSelectorOptimized() {
        const reelList = document.getElementById('reelList');
        const reelTitle = document.getElementById('currentReelTitle');
        
        if (reelList) {
            // Use document fragment for batch DOM operations
            const fragment = document.createDocumentFragment();
            
            if (this.reels.length === 0) {
                fragment.appendChild(this.createEmptyReelElement());
            } else {
                // Create all reel elements in memory first
                this.reels.forEach(reel => {
                    const reelButton = this.createReelButtonOptimized(reel);
                    fragment.appendChild(reelButton);
                });
            }
            
            // Single DOM operation
            reelList.innerHTML = '';
            reelList.appendChild(fragment);
        }
        
        // Update current reel title
        if (reelTitle) {
            reelTitle.textContent = this.currentReelName || 'No reel selected';
        }
    }
    
    /**
     * Optimized reel button creation
     */
    createReelButtonOptimized(reel) {
        const reelButton = document.createElement('button');
        reelButton.className = 'reel-item';
        reelButton.setAttribute('data-reel-id', reel.id);
        
        if (reel.id === this.currentReelId) {
            reelButton.classList.add('active');
        }
        
        const timeAgo = this.formatTimeAgo(new Date(reel.created_at));
        
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
        
        // Add optimized click handler
        reelButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (reelButton.disabled || reel.id === this.currentReelId) return;
            
            // Debounce clicks
            reelButton.disabled = true;
            setTimeout(() => reelButton.disabled = false, 1000);
            
            // Switch reel in next frame
            requestAnimationFrame(() => {
                this.switchToReelParallel(reel.id, reel.reel_name);
            });
        });
        
        return reelButton;
    }
    
    /**
     * Create empty reel element
     */
    createEmptyReelElement() {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-reel-list';
        emptyDiv.innerHTML = `
            <ion-icon name="chatbubbles-outline"></ion-icon>
            <span>No reels available</span>
        `;
        return emptyDiv;
    }
    
    /**
     * Optimized loading states
     */
    showReelSwitchLoadingOptimized() {
        const reelList = document.getElementById('reelList');
        if (reelList) {
            reelList.innerHTML = `
                <div class="loading-reels">
                    <div class="loading-spinner"></div>
                    <span>Switching reel...</span>
                </div>
            `;
        }
    }
    
    hideReelSwitchLoading() {
        // Will be handled by updateReelSelectorOptimized
    }
    
    showReelErrorOptimized(message) {
        if (this.elements.chatBody) {
            this.addMessageToUIOptimized({
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
            this.addMessageToUIOptimized({
                type: 'system',
                text: `This reel "${this.currentReelName}" is empty. Start a conversation!`,
                timestamp: Date.now()
            });
        }
    }
    
    /**
     * Optimized message addition to UI
     */
    addMessageToUIOptimized(message) {
        if (!this.elements.chatBody || !message.text) return;
        
        const messageElement = this.createMessageElementOptimized(message);
        this.elements.chatBody.appendChild(messageElement);
        
        // Hide welcome message if visible
        this.hideWelcomeMessage();
        
        // Manage message limit efficiently
        this.enforceMessageLimitOptimized();
        
        // Auto scroll (throttled)
        this.scrollToBottomThrottled();
        
        // Store message
        this.messages.push(message);
    }
    
    /**
     * Optimized message limit enforcement
     */
    enforceMessageLimitOptimized() {
        if (this.messages.length <= this.maxMessages) return;
        
        const messagesToRemove = this.messages.length - this.maxMessages;
        const messageElements = this.elements.chatBody.querySelectorAll('.message');
        
        // Remove in batch
        for (let i = 0; i < messagesToRemove && i < messageElements.length; i++) {
            messageElements[i].remove();
        }
        
        this.messages.splice(0, messagesToRemove);
    }
    
    /**
     * Throttled scroll to bottom
     */
    scrollToBottomThrottled = this.throttle(() => {
        if (this.elements.chatBody) {
            this.elements.chatBody.scrollTop = this.elements.chatBody.scrollHeight;
        }
    }, 100);
    
    /**
     * Throttle utility
     */
    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }
    
    scrollToBottom() {
        this.scrollToBottomThrottled();
    }
    
    // Keep existing methods but optimize them for better performance
    // (createReel, sendMessage, etc. - similar optimizations applied)
    
    /**
     * Ultra-fast reel creation
     */
    async createReel(reelName, reelDescription = '') {
        if (!this.currentProjectId || !reelName?.trim()) {
            throw new Error('Invalid parameters for reel creation');
        }
        
        if (!window.AuthService?.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        const startTime = performance.now();
        
        try {
            console.log('⚡ Creating reel in parallel:', { reelName: reelName.trim(), reelDescription: reelDescription.trim() });
            
            const result = await window.AuthService.executeFunction('create_reel', {
                chat_id: this.currentProjectId,
                reel_name: reelName.trim(),
                reel_description: reelDescription.trim(),
                email: window.AuthService.getCurrentUser().email
            });
            
            if (result?.status === 'success' && result?.data?.success) {
                const newReel = result.data.reel;
                const reelId = result.data.reel_id;
                
                if (!newReel || !reelId) {
                    throw new Error('Invalid reel data received from server');
                }
                
                // Add new reel to list
                this.reels.push(newReel);
                
                // Switch to new reel in parallel
                const switchSuccess = await this.switchToReelParallel(reelId, reelName);
                
                if (!switchSuccess) {
                    console.warn('Reel created but failed to switch to it');
                    // Update selector anyway
                    requestAnimationFrame(() => this.updateReelSelectorOptimized());
                }
                
                const createTime = performance.now() - startTime;
                console.log(`✅ Reel created in ${createTime.toFixed(2)}ms`);
                
                return true;
                
            } else {
                throw new Error(result?.data?.message || result?.message || 'Failed to create reel');
            }
            
        } catch (error) {
            console.error('Failed to create reel:', error);
            throw error;
        }
    }
    
    /**
     * Ultra-fast message sending with parallel processing
     */
    async sendMessage(text) {
        if (!text?.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        if (!this.currentReelId) {
            throw new Error('No active reel selected');
        }
        
        const messageText = text.trim();
        const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Add user message to UI immediately (non-blocking)
        requestAnimationFrame(() => {
            this.addMessageToUIOptimized({
                type: 'user',
                text: messageText,
                timestamp: Date.now(),
                id: tempMessageId,
                reel_id: this.currentReelId,
                isTemporary: true
            });
        });
        
        // Clear input immediately
        if (this.elements.messageInput) {
            this.elements.messageInput.value = '';
            this.resizeInput();
        }
        
        // Show typing indicator (non-blocking)
        requestAnimationFrame(() => this.showTypingIndicator());
        
        try {
            // Parallel operations: save to database and send via WebSocket
            const [saveResult, wsReady] = await Promise.allSettled([
                window.AuthService.executeFunction('send_chat_message', {
                    chat_id: this.currentProjectId,
                    content: messageText,
                    reel_id: this.currentReelId,
                    context_data: {
                        source: 'chat_integration',
                        reel_name: this.currentReelName,
                        project_name: this.currentProjectName
                    }
                }),
                Promise.resolve(this.webSocketManager) // Ensure WebSocket is ready
            ]);
            
            if (saveResult.status === 'fulfilled' && saveResult.value?.status === 'success' && saveResult.value?.data?.success) {
                console.log('✅ User message saved to database:', saveResult.value.data.message_id);
                
                // Update temporary message with real database ID (non-blocking)
                requestAnimationFrame(() => {
                    const tempMessageElement = document.querySelector(`[data-message-id="${tempMessageId}"]`);
                    if (tempMessageElement) {
                        tempMessageElement.setAttribute('data-message-id', saveResult.value.data.message_id);
                        tempMessageElement.classList.remove('temporary-message');
                    }
                });
                
                // Send via WebSocket for processing
                const messageId = await this.webSocketManager.sendMessage(messageText, {
                    reel_id: this.currentReelId,
                    reel_name: this.currentReelName,
                    saved_message_id: saveResult.value.data.message_id
                });
                
                return messageId;
                
            } else {
                throw new Error('Failed to save message to database');
            }
            
        } catch (error) {
            // Hide typing indicator (non-blocking)
            requestAnimationFrame(() => this.hideTypingIndicator());
            
            // Remove temporary message (non-blocking)
            requestAnimationFrame(() => {
                const tempMessageElement = document.querySelector(`[data-message-id="${tempMessageId}"]`);
                if (tempMessageElement) {
                    tempMessageElement.remove();
                }
            });
            
            // Show error (non-blocking)
            requestAnimationFrame(() => {
                this.addMessageToUIOptimized({
                    type: 'error',
                    text: 'Failed to send message: ' + error.message,
                    timestamp: Date.now()
                });
            });
            
            throw error;
        }
    }
    
    // Keep all existing event handlers and utility methods...
    // (They remain the same but now work with the optimized system)
    
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
        requestAnimationFrame(() => this.hideTypingIndicator());
        
        if (!data.text) {
            data.text = 'Response received but no content available.';
        }
        
        requestAnimationFrame(() => {
            this.addMessageToUIOptimized({
                type: 'bot',
                text: data.text,
                timestamp: data.timestamp || Date.now(),
                id: data.saved_bot_message_id || data.messageId,
                components: data.components || [],
                reel_id: this.currentReelId,
                metadata: {
                    originalMessageId: data.messageId,
                    savedBotMessageId: data.saved_bot_message_id,
                    parentMessageId: data.context?.parent_message_id,
                    processingTime: data.processing_time,
                    isFromDatabase: !!data.saved_bot_message_id
                }
            });
        });
    }
    
    handleChatError(data) {
        requestAnimationFrame(() => {
            this.hideTypingIndicator();
            this.addMessageToUIOptimized({
                type: 'error',
                text: data.error || 'An error occurred',
                timestamp: data.timestamp,
                id: data.messageId
            });
        });
    }
    
    handleStateChange(data) {
        requestAnimationFrame(() => this.updateConnectionStatus(data.state));
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
    
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
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
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    showNewReelModal() {
        if (typeof window.showNewReelModal === 'function') {
            window.showNewReelModal();
        } else {
            console.error('New reel modal function not available');
        }
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
        this.messageFragment = null;
    }
}

// Global instance
window.ProductionChatIntegration = new ProductionChatIntegration();