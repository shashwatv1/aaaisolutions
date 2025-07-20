/**
 * Production Chat Integration with Reel Support for AAAI Solutions
 * Robust, reliable chat interface with proper reel management and message formatting
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
        
        // Update WebSocket with project context initially
        if (this.webSocketManager) {
            this.webSocketManager.setProjectContext(projectId, projectName);
        }
        
        // Load reels for this project
        await this.loadProjectReels();
        
        // If no reel is selected and we have reels, select the first one
        if (!this.currentReelId && this.reels.length > 0) {
            await this.switchToReel(this.reels[0].id, this.reels[0].reel_name);
        } else if (this.currentReelId) {
            // Update WebSocket with complete context if reel is already selected
            if (this.webSocketManager) {
                this.webSocketManager.setCompleteContext(
                    this.currentProjectId,
                    this.currentProjectName,
                    this.currentReelId,
                    this.currentReelName
                );
            }
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
            console.log('Loading reels for project:', this.currentProjectId);
            
            const result = await window.AuthService.executeFunction('list_project_reels', {
                chat_id: this.currentProjectId,
                email: window.AuthService.getCurrentUser().email
            });
            
            console.log('Project reels API response:', result);
            
            if (result?.status === 'success' && result?.data?.success) {
                this.reels = result.data.reels || [];
                console.log('✅ Loaded reels:', this.reels.length);
            } else {
                console.error('Failed to load reels:', result);
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
        
        // Verify authentication
        if (!window.AuthService?.isAuthenticated()) {
            console.error('Authentication required for reel switch');
            return false;
        }
        
        console.log('Switching to reel:', { reelId, reelName, projectId: this.currentProjectId });
        
        // Show loading state
        this.showReelSwitchLoading(true);
        
        try {
            // Call API to switch reel context
            const result = await window.AuthService.executeFunction('switch_reel_context', {
                chat_id: this.currentProjectId,
                reel_id: reelId,
                email: window.AuthService.getCurrentUser().email
            });
            
            console.log('Switch reel API response:', result);
            
            if (result?.status === 'success' && result?.data?.success) {
                // Update current reel info
                this.currentReelId = reelId;
                this.currentReelName = reelName;
                
                console.log('✅ Reel context switched successfully, updating WebSocket and loading history...');
                
                // Update WebSocket with complete context including reel
                if (this.webSocketManager) {
                    this.webSocketManager.setCompleteContext(
                        this.currentProjectId, 
                        this.currentProjectName,
                        this.currentReelId,
                        this.currentReelName
                    );
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
                
                return true;
                
            } else {
                const errorMessage = result?.data?.message || result?.message || 'Unknown error';
                console.error('Failed to switch reel context:', result);
                this.showReelError(`Failed to switch to reel: ${errorMessage}`);
                return false;
            }
            
        } catch (error) {
            console.error('Error switching reel:', error);
            
            // Handle different types of errors without causing navigation
            let errorMessage = 'Error switching to reel';
            if (error.message.includes('authentication') || error.message.includes('token')) {
                errorMessage = 'Authentication error. Please refresh the page.';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                errorMessage = 'Network error. Please check your connection.';
            } else {
                errorMessage = `Error switching to reel: ${error.message}`;
            }
            
            this.showReelError(errorMessage);
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
            throw new Error('Invalid parameters for reel creation');
        }
        
        // Verify authentication before proceeding
        if (!window.AuthService?.isAuthenticated()) {
            console.error('Authentication required for reel creation');
            throw new Error('Authentication required');
        }
        
        try {
            console.log('Creating new reel:', { 
                reelName: reelName.trim(), 
                reelDescription: reelDescription.trim(), 
                projectId: this.currentProjectId 
            });
            
            const result = await window.AuthService.executeFunction('create_reel', {
                chat_id: this.currentProjectId,
                reel_name: reelName.trim(),
                reel_description: reelDescription.trim(),
                email: window.AuthService.getCurrentUser().email
            });
            
            console.log('Create reel API response:', result);
            
            if (result?.status === 'success' && result?.data?.success) {
                const newReel = result.data.reel;
                const reelId = result.data.reel_id;
                
                if (!newReel || !reelId) {
                    console.error('Invalid reel data in response:', result.data);
                    throw new Error('Invalid reel data received from server');
                }
                
                // Add new reel to list
                this.reels.push(newReel);
                
                console.log('✅ Reel created, switching to new reel:', { reelId, reelName });
                
                // Switch to new reel (this will update WebSocket context)
                const switchSuccess = await this.switchToReel(reelId, reelName);
                
                if (!switchSuccess) {
                    console.warn('Reel created but failed to switch to it');
                    // Still consider it a success since reel was created
                    this.updateReelSelector();
                }
                
                console.log('✅ Reel created successfully:', newReel);
                return true;
                
            } else {
                const errorMessage = result?.data?.message || result?.message || 'Unknown error occurred';
                console.error('Reel creation failed:', result);
                throw new Error(`Failed to create reel: ${errorMessage}`);
            }
            
        } catch (error) {
            console.error('Failed to create reel:', error);
            
            // Don't let errors cause navigation - just throw them for handling
            if (error.message.includes('authentication') || error.message.includes('token')) {
                throw new Error('Authentication error. Please refresh the page and try again.');
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
                throw new Error('Network error. Please check your connection and try again.');
            } else {
                throw new Error(error.message || 'Failed to create reel. Please try again.');
            }
        }
    }
    
    /**
     * Preprocess message content for database storage
     * Ensures formatting is preserved when saving to Supabase
     */
    preprocessMessageForStorage(messageText, messageType = 'user') {
        if (!messageText) return '';
        
        // For user messages, store as-is (usually plain text)
        if (messageType === 'user') {
            return messageText.trim();
        }
        
        // For bot messages, ensure we preserve line breaks and special characters
        // that might get lost in transmission
        let processed = messageText;
        
        // Normalize line breaks for consistent storage
        processed = processed.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        
        // Preserve bullet point characters that might get corrupted
        processed = processed.replace(/[•]/g, '•'); // Ensure consistent bullet character
        
        return processed;
    }
    
    /**
     * Send a message with reel context and formatting preservation
     */
    async sendMessage(text) {
        if (!text?.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        if (!this.currentReelId) {
            throw new Error('No active reel selected');
        }
        
        const messageText = text.trim();
        console.log('📤 Sending message with database persistence:', {
            text: messageText.substring(0, 50) + '...',
            reelId: this.currentReelId,
            projectId: this.currentProjectId
        });
        
        // Generate a temporary message ID for UI tracking
        const tempMessageId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Add user message to UI immediately
        this.addMessageToUI({
            type: 'user',
            text: messageText,
            timestamp: Date.now(),
            id: tempMessageId,
            reel_id: this.currentReelId,
            isTemporary: true  // Mark as temporary until confirmed saved
        });
        
        // Clear input
        if (this.elements.messageInput) {
            this.elements.messageInput.value = '';
            this.resizeInput();
        }
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            // Preprocess message for storage
            const processedContent = this.preprocessMessageForStorage(messageText, 'user');
            
            // Save the user message to database via API
            const saveResult = await window.AuthService.executeFunction('send_chat_message', {
                chat_id: this.currentProjectId,
                content: processedContent,
                reel_id: this.currentReelId,
                context_data: {
                    source: 'chat_integration',
                    reel_name: this.currentReelName,
                    project_name: this.currentProjectName,
                    formatted_content: true // Flag to indicate content may have formatting
                }
            });
            
            if (saveResult?.status === 'success' && saveResult?.data?.success) {
                console.log('✅ User message saved to database:', saveResult.data.message_id);
                
                // Update the temporary message with the real database ID
                const tempMessageElement = document.querySelector(`[data-message-id="${tempMessageId}"]`);
                if (tempMessageElement) {
                    tempMessageElement.setAttribute('data-message-id', saveResult.data.message_id);
                    tempMessageElement.classList.remove('temporary-message');
                }
                
                // Send via WebSocket for processing
                const messageId = await this.webSocketManager.sendMessage(messageText, {
                    reel_id: this.currentReelId,
                    reel_name: this.currentReelName,
                    saved_message_id: saveResult.data.message_id,
                    preserve_formatting: true // Flag for backend to preserve formatting
                });
                
                console.log('✅ Message sent via WebSocket for processing:', messageId);
                return messageId;
                
            } else {
                console.error('Failed to save user message to database:', saveResult);
                throw new Error('Failed to save message to database');
            }
            
        } catch (error) {
            this.hideTypingIndicator();
            
            // Remove the temporary message if save failed
            const tempMessageElement = document.querySelector(`[data-message-id="${tempMessageId}"]`);
            if (tempMessageElement) {
                tempMessageElement.remove();
            }
            
            this.addMessageToUI({
                type: 'error',
                text: 'Failed to send message: ' + error.message,
                timestamp: Date.now()
            });
            
            console.error('❌ Failed to send message with database persistence:', error);
            throw error;
        }
    }
    
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
            // Use the get_reel_messages function to get messages from database
            const result = await window.AuthService.executeFunction('get_reel_messages', {
                chat_id: this.currentProjectId,
                reel_id: this.currentReelId,
                limit: 50,
                offset: 0
            });
            
            console.log('Reel messages API response:', result);
            
            if (result?.status === 'success' && result?.data?.success) {
                // Clear existing messages first
                this.clearMessages();
                
                if (result?.data?.messages?.length > 0) {
                    console.log(`Loading ${result.data.messages.length} messages for reel from database`);
                    
                    // Sort messages by timestamp to ensure correct order
                    const sortedMessages = result.data.messages.sort((a, b) => {
                        return new Date(a.timestamp) - new Date(b.timestamp);
                    });
                    
                    // Add history messages from database
                    sortedMessages.forEach(msg => {
                        this.addMessageToUI({
                            type: msg.sender === 'user' ? 'user' : (msg.sender === 'bot' ? 'bot' : 'system'),
                            text: msg.content,
                            timestamp: new Date(msg.timestamp).getTime(),
                            id: msg.id,
                            reel_id: msg.reel_id,
                            isHistorical: true  // Mark as historical message
                        });
                    });
                    
                    // Scroll to bottom
                    this.scrollToBottom();
                    
                    console.log(`✅ Loaded ${sortedMessages.length} messages from database for reel ${this.currentReelName}`);
                } else {
                    console.log('No messages found for this reel in database');
                    // Show empty reel message
                    this.showEmptyReelMessage();
                }
            } else {
                console.error('Failed to get reel messages from database:', result);
                this.showReelError('Failed to load chat history from database.');
            }
        } catch (error) {
            console.error('Failed to load reel history from database:', error);
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
     * Validate and sanitize message content
     */
    validateAndSanitizeMessage(text) {
        if (!text || typeof text !== 'string') {
            return '';
        }
        
        // Remove potentially harmful scripts while preserving formatting
        text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        text = text.replace(/javascript:/gi, '');
        text = text.replace(/on\w+\s*=/gi, '');
        
        // Normalize whitespace but preserve intentional formatting
        text = text.replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' '); // Replace non-breaking spaces
        text = text.replace(/\t/g, '    '); // Convert tabs to spaces
        
        return text.trim();
    }

    /**
     * Detect message content type for appropriate formatting
     */
    detectMessageType(text) {
        if (!text) return 'plain';
        
        const hasBulletPoints = /^[•\-\*]\s/gm.test(text);
        const hasNumberedList = /^\d+\.\s/gm.test(text);
        const hasMultipleParagraphs = text.includes('\n\n');
        const hasHeaders = /^[A-Za-z0-9\s]+:$/gm.test(text);
        
        if (hasNumberedList && hasBulletPoints) return 'mixed-list';
        if (hasNumberedList) return 'numbered-list';
        if (hasBulletPoints) return 'bullet-list';
        if (hasHeaders && hasMultipleParagraphs) return 'structured';
        if (hasMultipleParagraphs) return 'multi-paragraph';
        
        return 'plain';
    }

    /**
     * Apply formatting based on detected message type
     */
    applyFormattingByType(text, messageType) {
        const sanitizedText = this.validateAndSanitizeMessage(text);
        const detectedType = this.detectMessageType(sanitizedText);
        
        switch (detectedType) {
            case 'mixed-list':
            case 'structured':
                return this.processComplexFormatting(sanitizedText);
                
            case 'numbered-list':
                return this.formatNumberedList(sanitizedText);
                
            case 'bullet-list':
                return this.formatBulletList(sanitizedText);
                
            case 'multi-paragraph':
                return this.formatParagraphs(sanitizedText);
                
            default:
                return this.formatSimpleText(sanitizedText);
        }
    }

    /**
     * Enhanced text processor for complex message formatting
     */
    processComplexFormatting(text) {
        if (!text) return '';
        
        // First escape HTML
        let processed = this.escapeHtml(text);
        
        // Handle multiple line breaks and spacing
        processed = processed.replace(/\n\s*\n/g, '\n\n'); // Normalize double line breaks
        
        // Process sections separated by double line breaks
        const sections = processed.split('\n\n');
        const processedSections = sections.map(section => {
            // Split section by single line breaks
            const lines = section.split('\n');
            const processedLines = [];
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                // Check for bullet point patterns
                if (line.match(/^[•\-\*]\s/)) {
                    processedLines.push(`<div class="bullet-point">${line}</div>`);
                }
                // Check for numbered list patterns
                else if (line.match(/^\d+\.\s/)) {
                    processedLines.push(`<div class="numbered-point">${line}</div>`);
                }
                // Check for header-like patterns (text followed by colon)
                else if (line.match(/^[A-Za-z0-9\s]+:$/) && lines[i + 1] && !lines[i + 1].match(/^[•\-\*\d]/)) {
                    processedLines.push(`<div class="message-header">${line}</div>`);
                }
                // Regular text
                else {
                    processedLines.push(line);
                }
            }
            
            return processedLines.join('<br>');
        });
        
        // Join sections with paragraph breaks
        return processedSections.join('</p><p>').replace(/^/, '<p>').replace(/$/, '</p>');
    }

    /**
     * Format numbered lists specifically
     */
    formatNumberedList(text) {
        let escaped = this.escapeHtml(text);
        escaped = escaped.replace(/^(\d+)\.\s(.+)$/gm, '<div class="numbered-point">$1. $2</div>');
        escaped = escaped.replace(/\n(?!\<div)/g, '<br>');
        return escaped;
    }

    /**
     * Format bullet lists specifically
     */
    formatBulletList(text) {
        let escaped = this.escapeHtml(text);
        escaped = escaped.replace(/^[•\-\*]\s(.+)$/gm, '<div class="bullet-point">• $1</div>');
        escaped = escaped.replace(/\n(?!\<div)/g, '<br>');
        return escaped;
    }

    /**
     * Format multi-paragraph text
     */
    formatParagraphs(text) {
        let escaped = this.escapeHtml(text);
        const paragraphs = escaped.split('\n\n').filter(p => p.trim());
        return paragraphs.map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    }

    /**
     * Format simple text with basic line breaks
     */
    formatSimpleText(text) {
        let escaped = this.escapeHtml(text);
        return escaped.replace(/\n/g, '<br>');
    }

    /**
     * Main formatting function - updated to use type detection
     */
    formatMessageText(text) {
        if (!text) return '';
        
        try {
            return this.applyFormattingByType(text, 'auto');
        } catch (error) {
            console.error('Error formatting message text:', error);
            // Fallback to simple escaping
            return this.escapeHtml(text).replace(/\n/g, '<br>');
        }
    }
    
    /**
     * Escape HTML to prevent XSS - updated for better security
     */
    escapeHtml(text) {
        if (!text) return '';
        
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
    
    /**
     * Enhanced handleChatResponse with formatting preservation
     */
    handleChatResponse(data) {
        this.hideTypingIndicator();
        
        console.log('📥 Handling chat response:', {
            messageId: data.messageId,
            hasText: !!data.text,
            hasSavedBotMessageId: !!data.saved_bot_message_id,
            reelId: this.currentReelId
        });
        
        // Ensure we have response text
        if (!data.text) {
            console.warn('Chat response missing text content');
            data.text = 'Response received but no content available.';
        }

        // Preprocess bot response for consistent formatting
        const processedText = this.preprocessMessageForStorage(data.text, 'bot');
        
        // Add the bot message to UI with formatting
        this.addMessageToUI({
            type: 'bot',
            text: processedText,
            timestamp: data.timestamp || Date.now(),
            id: data.saved_bot_message_id || data.messageId,
            components: data.components || [],
            reel_id: this.currentReelId,
            metadata: {
                originalMessageId: data.messageId,
                savedBotMessageId: data.saved_bot_message_id,
                parentMessageId: data.context?.parent_message_id,
                processingTime: data.processing_time,
                isFromDatabase: !!data.saved_bot_message_id,
                hasFormatting: true
            }
        });
        
        console.log('✅ Bot response added to UI with formatting preservation');
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
    
    /**
     * Updated createMessageElement with proper formatting support
     */
    createMessageElement(message) {
        const messageEl = document.createElement('div');
        messageEl.className = `message message-${message.type}`;
        
        if (message.id) {
            messageEl.setAttribute('data-message-id', message.id);
        }
        
        if (message.reel_id) {
            messageEl.setAttribute('data-reel-id', message.reel_id);
        }
        
        // Add temporary class for unsaved messages
        if (message.isTemporary) {
            messageEl.classList.add('temporary-message');
        }
        
        // Add historical class for database-loaded messages
        if (message.isHistorical) {
            messageEl.classList.add('historical-message');
        }
        
        // Message content with proper formatting
        const contentEl = document.createElement('div');
        contentEl.className = 'message-content';
        
        // Process and format the message text
        const formattedText = this.formatMessageText(message.text);
        contentEl.innerHTML = formattedText;
        
        messageEl.appendChild(contentEl);
        
        // Timestamp
        if (message.timestamp) {
            const timestampEl = document.createElement('div');
            timestampEl.className = 'message-timestamp';
            timestampEl.textContent = this.formatTimestamp(message.timestamp);
            messageEl.appendChild(timestampEl);
        }
        
        // Add database persistence indicator for debugging (can be removed in production)
        if (message.metadata?.isFromDatabase) {
            const dbIndicator = document.createElement('div');
            dbIndicator.className = 'db-indicator';
            dbIndicator.textContent = '💾 DB';
            dbIndicator.style.cssText = 'font-size: 0.7rem; color: rgba(255,255,255,0.5); margin-top: 4px;';
            messageEl.appendChild(dbIndicator);
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