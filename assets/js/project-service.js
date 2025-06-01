/**
 * Enhanced Project Service for AAAI Solutions
 * WITH CONSISTENT AUTHENTICATION INTEGRATION
 * Ensures proper authentication checks before all operations
 */
const ProjectService = {
    // Core service state
    authService: null,
    isInitialized: false,
    
    // Configuration
    options: {
        cacheExpiry: 300000, // 5 minutes
        maxCacheSize: 1000,
        enableRealTimeUpdates: true,
        autoSync: true,
        syncInterval: 30000, // 30 seconds
        debug: false
    },
    
    // Cache management
    projectCache: new Map(),
    cacheTimestamps: new Map(),
    searchCache: new Map(),
    
    // Context management
    currentContext: {
        user_id: null,
        current_project: null,
        chat_id: null,
        project_name: null
    },
    
    // Event listeners
    updateListeners: [],
    contextListeners: [],
    
    // Performance tracking
    stats: {
        cacheHits: 0,
        cacheMisses: 0,
        apiCalls: 0,
        lastSync: null,
        errors: 0
    },
    
    /**
     * Initialize the unified project service with consistent authentication
     */
    init(authService, options = {}) {
        if (!authService) {
            throw new Error('AuthService is required for ProjectService initialization');
        }
        
        if (this.isInitialized) {
            console.log('📦 ProjectService already initialized');
            return this;
        }
        
        this.authService = authService;
        this.options = { ...this.options, ...options };
        
        // Set debug mode from global config
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        // Get user context only if authentication is complete
        if (this._isAuthenticationComplete()) {
            const user = authService.getCurrentUser();
            if (user) {
                this.currentContext.user_id = user.id;
            }
        }
        
        // Initialize subsystems
        this._setupAutoSync();
        this._setupCacheCleanup();
        this._loadStoredContext();
        
        this.isInitialized = true;
        
        this._log('ProjectService initialized successfully', {
            userId: this.currentContext.user_id,
            cacheEnabled: true,
            autoSync: this.options.autoSync,
            authenticationComplete: this._isAuthenticationComplete()
        });
        
        return this;
    },

    /**
     * Create a new project with JWT authentication
     */
    async createProject(projectData) {
        try {
            await this._requireAuth();
            this._validateProjectData(projectData);
            
            const user = this.authService.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('User information not available');
            }
            
            this._log('Creating project with authenticated user:', user.email);
            
            const result = await this.authService.executeFunction('create_project_with_context', {
                name: projectData.name,
                description: projectData.description || null,
                tags: projectData.tags || [],
                email: user.email
            });
            
            if (result.status === 'success' && result.data.success) {
                const project = result.data.project;
                const chat_id = result.data.chat_id;
                
                // Cache the new project
                this._cacheProject(project);
                this._clearListCache();
                
                // Update context
                await this._updateContext({
                    current_project: project,
                    chat_id: chat_id,
                    project_name: project.name
                });
                
                // Notify listeners
                this._notifyUpdateListeners('project_created', { project, chat_id });
                
                this.stats.apiCalls++;
                
                this._log('Project created successfully', {
                    projectId: project.id,
                    chatId: chat_id,
                    name: project.name
                });
                
                return {
                    success: true,
                    project: project,
                    chat_id: chat_id
                };
            } else {
                throw new Error(result.data?.message || 'Failed to create project');
            }
            
        } catch (error) {
            this.stats.errors++;
            this._error('Error creating project:', error);
            throw new Error(`Failed to create project: ${error.message}`);
        }
    },

    
    /**
     * Get all projects with JWT authentication
     */
    async getProjects(options = {}) {
        try {
            await this._requireAuth();
            
            const {
                limit = 20,
                offset = 0,
                search = '',
                tagFilter = [],
                forceRefresh = false
            } = options;
            
            const cacheKey = this._generateCacheKey('list', { limit, offset, search, tagFilter });
            
            // Check cache first
            if (!forceRefresh) {
                const cached = this._getCachedData(cacheKey);
                if (cached) {
                    this.stats.cacheHits++;
                    this._log('Projects retrieved from cache');
                    return cached;
                }
            }
            
            this.stats.cacheMisses++;
            
            const user = this.authService.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('User information not available');
            }
            
            this._log('Getting projects for authenticated user:', user.email);
            
            const result = await this.authService.executeFunction('list_user_projects', {
                email: user.email,
                limit: limit,
                offset: offset,
                search: search.trim(),
                tag_filter: tagFilter
            });
            
            if (result?.data?.success) {
                const projectData = {
                    projects: result.data.projects,
                    total: result.data.total,
                    hasMore: result.data.has_more,
                    limit: limit,
                    offset: offset
                };
                
                // Cache individual projects and list result
                result.data.projects.forEach(project => this._cacheProject(project));
                this._setCachedData(cacheKey, projectData);
                
                this.stats.apiCalls++;
                this.stats.lastSync = Date.now();
                
                this._log('Projects retrieved from API', {
                    count: result.data.projects.length,
                    total: result.data.total
                });
                
                return projectData;
            } else {
                throw new Error(result.data?.message || 'Failed to get projects');
            }
            
        } catch (error) {
            this.stats.errors++;
            this._error('Error getting projects:', error);
            throw new Error(`Failed to get projects: ${error.message}`);
        }
    },

    /**
     * Get specific project by ID with consistent authentication
     */
    async getProject(projectId, forceRefresh = false) {
        try {
            await this._ensureAuthReady();
            
            if (!projectId) {
                throw new Error('Project ID is required');
            }
            
            // Check cache first
            if (!forceRefresh) {
                const cached = this._getCachedProject(projectId);
                if (cached) {
                    this.stats.cacheHits++;
                    return cached;
                }
            }
            
            // Wait for authentication to be ready
            await this._waitForAuthReady();
            
            this.stats.cacheMisses++;
            
            const user = this.authService.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('User information not available');
            }
            
            const result = await this.authService.executeFunction('get_project_details', {
                project_id: projectId,
                email: user.email
            });
            
            if (result.status === 'success' && result.data.success) {
                const project = result.data.project;
                this._cacheProject(project);
                this.stats.apiCalls++;
                
                this._log('Project details retrieved', {
                    projectId: project.id,
                    name: project.name
                });
                
                return project;
            } else {
                throw new Error(result.data?.message || 'Project not found');
            }
            
        } catch (error) {
            this.stats.errors++;
            this._error('Error getting project:', error);
            throw new Error(`Failed to get project: ${error.message}`);
        }
    },
    
    /**
     * Switch to project context with consistent authentication
     */
    async switchToProject(projectId, projectName = null) {
        try {
            await this._ensureAuthReady();
            
            // Wait for authentication to be ready
            await this._waitForAuthReady();
            
            const user = this.authService.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('User information not available');
            }
            
            this._log('Switching to project context', { projectId, projectName, userEmail: user.email });
            
            const result = await this.authService.executeFunction('switch_project_context', {
                email: user.email,
                project_id: projectId,
                reel_id: null // Reset reel when switching projects
            });
            
            if (result.status === 'success' && result.data.success) {
                const project = result.data.project;
                const chat_id = result.data.chat_id;
                
                // Update local context
                await this._updateContext({
                    current_project: project,
                    chat_id: chat_id,
                    project_name: project.name
                });
                
                // Update ChatService context if available
                if (window.ChatService && window.ChatService.isInitialized) {
                    window.ChatService.setProjectContext(chat_id, project.name);
                    
                    // Save context and reconnect if methods exist
                    if (typeof window.ChatService.saveContext === 'function') {
                        await window.ChatService.saveContext();
                    }
                    
                    if (window.ChatService.isConnected && typeof window.ChatService.forceReconnect === 'function') {
                        await window.ChatService.forceReconnect();
                    }
                }
                
                this._log('Switched to project context', {
                    projectId: project.id,
                    chatId: chat_id,
                    name: project.name
                });
                
                return {
                    success: true,
                    project: project,
                    chat_id: chat_id,
                    context: result.data.context
                };
            } else {
                throw new Error(result.data?.message || 'Failed to switch project context');
            }
            
        } catch (error) {
            this._error('Error switching project context:', error);
            throw new Error(`Failed to switch to project: ${error.message}`);
        }
    },
    
    /**
     * Get current user context with consistent authentication
     */
    async getCurrentContext() {
        try {
            await this._ensureAuthReady();
            
            // Wait for authentication to be ready
            await this._waitForAuthReady();
            
            const user = this.authService.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('User information not available');
            }
            
            const result = await this.authService.executeFunction('get_user_context', {
                email: user.email
            });
            
            if (result.status === 'success' && result.data.success) {
                // Update local context
                this.currentContext = {
                    ...this.currentContext,
                    current_project: result.data.current_project,
                    chat_id: result.data.context?.current_chat_id,
                    project_name: result.data.current_project?.name
                };
                
                this._saveContextToStorage();
                
                return {
                    success: true,
                    context: result.data.context,
                    current_project: result.data.current_project,
                    user_id: result.data.user_id
                };
            } else {
                throw new Error(result.data?.message || 'Failed to get user context');
            }
            
        } catch (error) {
            this._error('Error getting user context:', error);
            return { success: false, error: error.message };
        }
    },
    
    /**
     * Update a project with consistent authentication
     */
    async updateProject(projectId, updateData) {
        try {
            await this._ensureAuthReady();
            this._validateProjectData(updateData, false);
            
            // Wait for authentication to be ready
            await this._waitForAuthReady();
            
            const user = this.authService.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('User information not available');
            }
            
            const result = await this.authService.executeFunction('update_project', {
                project_id: projectId,
                name: updateData.name,
                description: updateData.description,
                tags: updateData.tags,
                email: user.email
            });
            
            if (result.status === 'success' && result.data.success) {
                const project = result.data.project;
                
                this._cacheProject(project);
                this._clearListCache();
                
                // Update context if this is the current project
                if (this.currentContext.current_project?.id === projectId) {
                    await this._updateContext({
                        current_project: project,
                        project_name: project.name
                    });
                }
                
                this._notifyUpdateListeners('project_updated', project);
                this.stats.apiCalls++;
                
                this._log('Project updated successfully', {
                    projectId: project.id,
                    name: project.name
                });
                
                return project;
            } else {
                throw new Error(result.data?.message || 'Failed to update project');
            }
            
        } catch (error) {
            this.stats.errors++;
            this._error('Error updating project:', error);
            throw new Error(`Failed to update project: ${error.message}`);
        }
    },
    
    /**
     * Delete a project with consistent authentication
     */
    async deleteProject(projectId) {
        try {
            await this._ensureAuthReady();
            
            // Wait for authentication to be ready
            await this._waitForAuthReady();
            
            const user = this.authService.getCurrentUser();
            if (!user || !user.email) {
                throw new Error('User information not available');
            }
            
            const result = await this.authService.executeFunction('delete_project', {
                project_id: projectId,
                email: user.email
            });
            
            if (result.status === 'success' && result.data.success) {
                this._removeCachedProject(projectId);
                this._clearListCache();
                
                // Clear context if this was the current project
                if (this.currentContext.current_project?.id === projectId) {
                    await this._updateContext({
                        current_project: null,
                        chat_id: null,
                        project_name: null
                    });
                }
                
                this._notifyUpdateListeners('project_deleted', { id: projectId });
                this.stats.apiCalls++;
                
                this._log('Project deleted successfully', { projectId });
                
                return true;
            } else {
                throw new Error(result.data?.message || 'Failed to delete project');
            }
            
        } catch (error) {
            this.stats.errors++;
            this._error('Error deleting project:', error);
            throw new Error(`Failed to delete project: ${error.message}`);
        }
    },
    
    /**
     * Get current context (synchronous)
     */
    getContext() {
        return { ...this.currentContext };
    },
    
    /**
     * Event listeners
     */
    onUpdate(callback) {
        if (typeof callback === 'function') {
            this.updateListeners.push(callback);
        }
    },
    
    onContextChange(callback) {
        if (typeof callback === 'function') {
            this.contextListeners.push(callback);
        }
    },
    
    removeListener(type, callback) {
        if (type === 'update') {
            const index = this.updateListeners.indexOf(callback);
            if (index > -1) this.updateListeners.splice(index, 1);
        } else if (type === 'context') {
            const index = this.contextListeners.indexOf(callback);
            if (index > -1) this.contextListeners.splice(index, 1);
        }
    },
    
    /**
     * Clear all cached data
     */
    clearCache() {
        const clearedItems = this.projectCache.size + this.searchCache.size;
        
        this.projectCache.clear();
        this.cacheTimestamps.clear();
        this.searchCache.clear();
        
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = 0;
        
        this._log(`Cleared ${clearedItems} items from project cache`);
        return clearedItems;
    },
    
    /**
     * Get service statistics
     */
    getStats() {
        return {
            ...this.stats,
            cacheSize: this.projectCache.size,
            searchCacheSize: this.searchCache.size,
            hitRate: this.stats.cacheHits + this.stats.cacheMisses > 0 
                ? Math.round((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100) 
                : 0,
            context: this.currentContext,
            authenticationComplete: this._isAuthenticationComplete(),
            authenticationSource: this.authService?.authenticationSource || 'unknown'
        };
    },
    
    // Private methods
    
    /**
     * ENHANCED: Require complete authentication with proper validation
     */
    async _requireAuth() {
        if (!this.authService) {
            throw new Error('AuthService not available');
        }
        
        if (!this.authService.isAuthenticated()) {
            throw new Error('User not authenticated');
        }
        
        // Ensure we have a valid user access token
        try {
            const token = await this.authService._ensureValidAccessToken();
            if (!token) {
                throw new Error('No valid access token available');
            }
        } catch (error) {
            throw new Error(`Authentication validation failed: ${error.message}`);
        }
        
        return true;
    },
    
    /**
     * ENHANCED: Ensure authentication is ready
     */
    async _ensureAuthReady() {
        if (!this.authService) {
            throw new Error('AuthService not available');
        }
        
        // Check if already authenticated
        if (this.authService.isAuthenticated()) {
            return true;
        }
        
        // Try to restore session
        if (this.authService.hasPersistentSession()) {
            try {
                const refreshed = await this.authService.refreshTokenIfNeeded();
                if (refreshed && this.authService.isAuthenticated()) {
                    return true;
                }
            } catch (error) {
                this._log('Failed to restore session:', error);
            }
        }
        
        throw new Error('Authentication not ready');
    },
    
    /**
     * ENHANCED: Wait for authentication to be ready with timeout
     */
    async _waitForAuthReady(maxWaitTime = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < maxWaitTime) {
            try {
                await this._ensureAuthReady();
                return true;
            } catch (error) {
                // Wait a bit before retrying
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        throw new Error('Authentication readiness timeout');
    },
    
    /**
     * ENHANCED: Check if authentication is complete
     */
    _isAuthenticationComplete() {
        return this.authService && 
               this.authService.isAuthenticated() && 
               this.authService.getToken();
    },
    
    _validateProjectData(data, isCreate = true) {
        if (isCreate && (!data.name || data.name.trim().length === 0)) {
            throw new Error('Project name is required');
        }
        
        if (data.name && data.name.length > 100) {
            throw new Error('Project name is too long (max 100 characters)');
        }
        
        if (data.description && data.description.length > 500) {
            throw new Error('Project description is too long (max 500 characters)');
        }
        
        if (data.tags && (!Array.isArray(data.tags) || data.tags.length > 10)) {
            throw new Error('Tags must be an array with maximum 10 items');
        }
    },
    
    async _updateContext(updates) {
        Object.assign(this.currentContext, updates);
        this._saveContextToStorage();
        this._notifyContextListeners('context_updated', this.currentContext);
    },
    
    _saveContextToStorage() {
        try {
            sessionStorage.setItem('aaai_project_context', JSON.stringify({
                context: this.currentContext,
                timestamp: Date.now()
            }));
        } catch (error) {
            this._error('Failed to save context to storage:', error);
        }
    },
    
    _loadStoredContext() {
        try {
            const stored = sessionStorage.getItem('aaai_project_context');
            if (stored) {
                const data = JSON.parse(stored);
                if (data.context && (Date.now() - data.timestamp) < 3600000) { // 1 hour
                    Object.assign(this.currentContext, data.context);
                }
            }
        } catch (error) {
            this._error('Failed to load stored context:', error);
        }
    },
    
    _generateCacheKey(type, params = {}) {
        const keyParts = [type];
        Object.keys(params).sort().forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                keyParts.push(`${key}:${JSON.stringify(params[key])}`);
            }
        });
        return keyParts.join('|');
    },
    
    _cacheProject(project) {
        if (!project || !project.id) return;
        this.projectCache.set(project.id, project);
        this.cacheTimestamps.set(project.id, Date.now());
        
        if (this.projectCache.size > this.options.maxCacheSize) {
            this._cleanupCache();
        }
    },
    
    _getCachedProject(projectId) {
        if (!this.projectCache.has(projectId)) return null;
        
        const timestamp = this.cacheTimestamps.get(projectId);
        if (!timestamp || (Date.now() - timestamp) > this.options.cacheExpiry) {
            this.projectCache.delete(projectId);
            this.cacheTimestamps.delete(projectId);
            return null;
        }
        
        return this.projectCache.get(projectId);
    },
    
    _removeCachedProject(projectId) {
        this.projectCache.delete(projectId);
        this.cacheTimestamps.delete(projectId);
    },
    
    _setCachedData(key, data) {
        this.searchCache.set(key, {
            data: data,
            timestamp: Date.now()
        });
        
        if (this.searchCache.size > this.options.maxCacheSize) {
            this._cleanupSearchCache();
        }
    },
    
    _getCachedData(key) {
        const cached = this.searchCache.get(key);
        if (!cached) return null;
        
        if ((Date.now() - cached.timestamp) > this.options.cacheExpiry) {
            this.searchCache.delete(key);
            return null;
        }
        
        return cached.data;
    },
    
    _clearListCache() {
        for (const [key] of this.searchCache.entries()) {
            if (key.startsWith('list|')) {
                this.searchCache.delete(key);
            }
        }
    },
    
    _cleanupCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, timestamp] of this.cacheTimestamps.entries()) {
            if ((now - timestamp) > this.options.cacheExpiry) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => {
            this.projectCache.delete(key);
            this.cacheTimestamps.delete(key);
        });
    },
    
    _cleanupSearchCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, cached] of this.searchCache.entries()) {
            if ((now - cached.timestamp) > this.options.cacheExpiry) {
                expiredKeys.push(key);
            }
        }
        
        expiredKeys.forEach(key => {
            this.searchCache.delete(key);
        });
        
        if (this.searchCache.size > this.options.maxCacheSize) {
            const entries = Array.from(this.searchCache.entries())
                .sort((a, b) => a[1].timestamp - b[1].timestamp)
                .slice(0, Math.floor(this.options.maxCacheSize * 0.1));
            
            entries.forEach(([key]) => {
                this.searchCache.delete(key);
            });
        }
    },
    
    _setupAutoSync() {
        if (!this.options.autoSync) return;
        
        setInterval(async () => {
            if (this._isAuthenticationComplete() && 
                document.visibilityState === 'visible') {
                
                try {
                    await this.getProjects({ limit: 10, offset: 0, forceRefresh: true });
                    this._log('Background project sync completed');
                } catch (error) {
                    this._log('Background sync error:', error);
                }
            }
        }, this.options.syncInterval);
    },
    
    _setupCacheCleanup() {
        setInterval(() => {
            this._cleanupCache();
            this._cleanupSearchCache();
        }, 300000); // Every 5 minutes
    },
    
    _notifyUpdateListeners(eventType, data) {
        this.updateListeners.forEach(callback => {
            try {
                callback(eventType, data);
            } catch (error) {
                this._error('Error in update listener:', error);
            }
        });
    },
    
    _notifyContextListeners(eventType, data) {
        this.contextListeners.forEach(callback => {
            try {
                callback(eventType, data);
            } catch (error) {
                this._error('Error in context listener:', error);
            }
        });
    },
    
    _log(...args) {
        if (this.options.debug) {
            console.log('[ProjectService]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[ProjectService]', ...args);
    }
};

// Export for global access
if (typeof window !== 'undefined') {
    window.ProjectService = ProjectService;
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectService;
}