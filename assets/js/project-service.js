/**
 * High-Performance Project Service for AAAI Solutions
 * Optimized for fast loading and minimal API calls
 */
const ProjectService = {
    // Core service state
    authService: null,
    isInitialized: false,
    
    // Performance-optimized cache
    projectCache: new Map(),
    cacheTimestamps: new Map(),
    contextCache: null,
    lastCacheUpdate: null,
    
    // Configuration - optimized with efficient real-time updates
    options: {
        cacheExpiry: 300000, // 5 minutes 
        maxCacheSize: 100, // Reduced
        quickCacheExpiry: 30000, // 30 seconds for frequent operations
        enableRealTimeUpdates: true, // Efficient real-time updates
        autoSync: true, // Smart auto-sync enabled
        syncInterval: 60000, // 1 minute (increased from 30s)
        smartSync: true, // Only sync when page is visible
        debug: false
    },
    
    // Context management - simplified
    currentContext: {
        user_id: null,
        current_project: null,
        chat_id: null,
        project_name: null
    },
    
    // Event listeners - minimal
    updateListeners: [],
    
    /**
     * Fast initialization with minimal checks
     */
    init(authService, options = {}) {
        if (this.isInitialized) {
            return this;
        }
        
        if (!authService) {
            throw new Error('AuthService required');
        }
        
        this.authService = authService;
        this.options = { ...this.options, ...options };
        
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        // Get user context only if authenticated
        if (authService.isAuthenticated()) {
            const user = authService.getCurrentUser();
            if (user) {
                this.currentContext.user_id = user.id;
            }
        }
        
        this._loadQuickContext();
        this._setupEfficientAutoSync(); // Smart auto-sync
        this._setupCacheCleanup();
        this.isInitialized = true;
        
        this._log('ProjectService initialized quickly');
        return this;
    },

    /**
     * Fast project creation with post-creation recovery
     */
    async createProject(projectData) {
        try {
            this._requireAuth();
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            this._log('Creating project:', projectData.name);
            
            const functionInput = {
                name: projectData.name,
                description: projectData.description || null,
                tags: projectData.tags || [],
                email: user.email
            };
            
            const result = await this._executeFunction('create_project_with_context', functionInput);
            
            this._log('API response:', result);
            
            // Handle the case where project was created but function failed
            if (result?.status === 'success' && result?.data?.success === false) {
                this._log('Project creation function failed, attempting recovery...');
                
                // Wait a moment for the project to be fully committed to database
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Try to find the project that was just created
                const recoveredProject = await this._recoverCreatedProject(projectData.name, user.email);
                
                if (recoveredProject) {
                    this._log('Successfully recovered created project:', recoveredProject);
                    return recoveredProject;
                }
                
                throw new Error('Project creation failed and recovery unsuccessful');
            }
            
            // Standard success path
            if (result?.status !== 'success' || !result?.data) {
                throw new Error('Invalid API response');
            }
            
            // Parse successful response
            let project = null;
            let chat_id = null;
            
            if (result.data.success && result.data.project) {
                project = result.data.project;
                chat_id = result.data.chat_id;
            } else if (result.data.project && result.data.chat_id) {
                project = result.data.project;
                chat_id = result.data.chat_id;
            }
            
            if (!project?.id || !chat_id) {
                throw new Error('Invalid project data in response');
            }
            
            // Quick cache update
            this._quickCacheProject(project);
            this._clearProjectListCache();
            
            // Update context immediately
            this._updateContextQuick({
                current_project: project,
                chat_id: chat_id,
                project_name: project.name
            });
            
            this._notifyQuick('project_created', { project, chat_id });
            
            this._log('Project created successfully:', project.id);
            
            return {
                success: true,
                project: project,
                chat_id: chat_id
            };
            
        } catch (error) {
            this._error('Error creating project:', error);
            throw error;
        }
    },

    /**
     * Fast project list with aggressive caching
     */
    async getProjects(options = {}) {
        try {
            this._requireAuth();
            
            const {
                limit = 20,
                offset = 0,
                search = '',
                forceRefresh = false
            } = options;
            
            const cacheKey = `list_${limit}_${offset}_${search}`;
            
            // Check cache first (aggressive caching)
            if (!forceRefresh) {
                const cached = this._getQuickCache(cacheKey);
                if (cached) {
                    this._log('Projects from cache');
                    return cached;
                }
            }
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            this._log('Getting projects for:', user.email);
            
            const result = await this._executeFunction('list_user_projects', {
                email: user.email,
                limit,
                offset,
                search: search.trim()
            });
            
            if (result?.data?.success) {
                const projectData = {
                    projects: result.data.projects || [],
                    total: result.data.total || 0,
                    hasMore: result.data.has_more || false,
                    limit,
                    offset
                };
                
                // Cache projects individually and list result
                projectData.projects.forEach(project => this._quickCacheProject(project));
                this._setQuickCache(cacheKey, projectData);
                
                this._log('Projects retrieved:', projectData.projects.length);
                return projectData;
            }
            
            throw new Error(result?.data?.message || 'Failed to get projects');
            
        } catch (error) {
            this._error('Error getting projects:', error);
            throw new Error(`Failed to get projects: ${error.message}`);
        }
    },

    /**
     * Fast project details with caching
     */
    async getProject(projectId, forceRefresh = false) {
        try {
            this._requireAuth();
            
            if (!projectId) {
                throw new Error('Project ID required');
            }
            
            // Check cache first
            if (!forceRefresh) {
                const cached = this._getCachedProject(projectId);
                if (cached) {
                    return cached;
                }
            }
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            const result = await this._executeFunction('get_project_details', {
                project_id: projectId,
                email: user.email
            });
            
            if (result?.status === 'success' && result?.data?.success) {
                const project = result.data.project;
                this._quickCacheProject(project);
                return project;
            }
            
            throw new Error(result?.data?.message || 'Project not found');
            
        } catch (error) {
            this._error('Error getting project:', error);
            throw new Error(`Failed to get project: ${error.message}`);
        }
    },

    /**
     * Fast context switching with retry logic
     */
    async switchToProject(projectId, projectName = null) {
        try {
            this._requireAuth();
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            this._log('Quick project switch:', projectId);
            
            let result = await this._executeFunction('switch_project_context', {
                email: user.email,
                project_id: projectId,
                reel_id: null
            });
            
            // Retry once if failed
            if (result?.status === 'success' && result?.data?.success === false) {
                this._log('Context switch failed, retrying...');
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                result = await this._executeFunction('switch_project_context', {
                    email: user.email,
                    project_id: projectId,
                    reel_id: null
                });
            }
            
            if (result?.status === 'success' && result?.data?.success) {
                const project = result.data.project;
                const chat_id = result.data.chat_id;
                
                // Update context immediately
                this._updateContextQuick({
                    current_project: project,
                    chat_id: chat_id,
                    project_name: project.name
                });
                
                // Update ChatService if available (non-blocking)
                if (window.ChatService?.isInitialized) {
                    try {
                        window.ChatService.setProjectContext(chat_id, project.name);
                    } catch (error) {
                        console.warn('ChatService context update failed:', error);
                    }
                }
                
                this._log('Project context switched:', project.id);
                
                return {
                    success: true,
                    project: project,
                    chat_id: chat_id,
                    context: result.data.context
                };
            }
            
            throw new Error('Failed to switch project context');
            
        } catch (error) {
            this._error('Error switching project:', error);
            throw error;
        }
    },

    /**
     * Fast context retrieval with caching
     */
    async getCurrentContext() {
        try {
            this._requireAuth();
            
            // Use cached context if recent
            if (this.contextCache && this.lastCacheUpdate && 
                (Date.now() - this.lastCacheUpdate) < this.options.quickCacheExpiry) {
                return this.contextCache;
            }
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            const result = await this._executeFunction('get_user_context', {
                email: user.email
            });
            
            if (result?.status === 'success' && result?.data?.success) {
                const contextResult = {
                    success: true,
                    context: result.data.context,
                    current_project: result.data.current_project,
                    user_id: result.data.user_id
                };
                
                // Update local context
                this.currentContext = {
                    ...this.currentContext,
                    current_project: result.data.current_project,
                    chat_id: result.data.context?.current_chat_id,
                    project_name: result.data.current_project?.name
                };
                
                // Cache the result
                this.contextCache = contextResult;
                this.lastCacheUpdate = Date.now();
                this._saveQuickContext();
                
                return contextResult;
            }
            
            throw new Error(result?.data?.message || 'Failed to get user context');
            
        } catch (error) {
            this._error('Error getting context:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Get current context (synchronous)
     */
    getContext() {
        return { ...this.currentContext };
    },

    /**
     * Clear cache efficiently
     */
    clearCache() {
        const cleared = this.projectCache.size;
        this.projectCache.clear();
        this.cacheTimestamps.clear();
        this.contextCache = null;
        this.lastCacheUpdate = null;
        
        try {
            sessionStorage.removeItem('aaai_project_context');
            sessionStorage.removeItem('aaai_project_cache');
        } catch (error) {
            // Ignore storage errors
        }
        
        this._log(`Cleared ${cleared} cached items`);
        return cleared;
    },

    onUpdate(callback) {
        if (typeof callback === 'function') {
            this.updateListeners.push(callback);
        }
    },

    removeListener(type, callback) {
        if (type === 'update') {
            const index = this.updateListeners.indexOf(callback);
            if (index > -1) this.updateListeners.splice(index, 1);
        }
    },

    // Private methods - optimized for speed

    _requireAuth() {
        if (!this.authService?.isAuthenticated()) {
            throw new Error('Authentication required');
        }
    },

    async _executeFunction(functionName, inputData) {
        this._requireAuth();
        
        this._log('Executing function:', functionName, 'with input:', inputData);
        
        try {
            const result = await this.authService.executeFunction(functionName, inputData);
            
            // Log detailed response structure
            this._logAPIResponse(functionName, result);
            
            return result;
        } catch (error) {
            this._error('Function execution failed:', functionName, {
                error: error.message,
                stack: error.stack,
                inputData: inputData
            });
            throw error;
        }
    },

    /**
     * Enhanced error logging with response details
     */
    _logAPIResponse(functionName, result) {
        this._log(`API Response for ${functionName}:`, {
            hasStatus: !!result?.status,
            status: result?.status,
            hasData: !!result?.data,
            dataType: typeof result?.data,
            hasSuccess: !!result?.success,
            hasProject: !!(result?.project || result?.data?.project),
            hasChatId: !!(result?.chat_id || result?.data?.chat_id),
            keys: result ? Object.keys(result) : [],
            dataKeys: result?.data ? Object.keys(result.data) : []
        });
    },

    _quickCacheProject(project) {
        if (!project?.id) return;
        
        this.projectCache.set(project.id, project);
        this.cacheTimestamps.set(project.id, Date.now());
        
        // Simple cleanup if too many items
        if (this.projectCache.size > this.options.maxCacheSize) {
            const oldestKey = Array.from(this.cacheTimestamps.entries())
                .sort((a, b) => a[1] - b[1])[0][0];
            this.projectCache.delete(oldestKey);
            this.cacheTimestamps.delete(oldestKey);
        }
    },

    _getCachedProject(projectId) {
        const timestamp = this.cacheTimestamps.get(projectId);
        if (!timestamp || (Date.now() - timestamp) > this.options.cacheExpiry) {
            this.projectCache.delete(projectId);
            this.cacheTimestamps.delete(projectId);
            return null;
        }
        return this.projectCache.get(projectId);
    },

    _setQuickCache(key, data) {
        try {
            const cache = JSON.parse(sessionStorage.getItem('aaai_project_cache') || '{}');
            cache[key] = {
                data,
                timestamp: Date.now()
            };
            
            // Keep only recent entries
            const now = Date.now();
            Object.keys(cache).forEach(k => {
                if (now - cache[k].timestamp > this.options.cacheExpiry) {
                    delete cache[k];
                }
            });
            
            sessionStorage.setItem('aaai_project_cache', JSON.stringify(cache));
        } catch (error) {
            // Ignore storage errors
        }
    },

    _getQuickCache(key) {
        try {
            const cache = JSON.parse(sessionStorage.getItem('aaai_project_cache') || '{}');
            const item = cache[key];
            
            if (item && (Date.now() - item.timestamp) < this.options.cacheExpiry) {
                return item.data;
            }
        } catch (error) {
            // Ignore storage errors
        }
        return null;
    },

    /**
     * Clean up expired cache entries
     */
    _cleanupCache() {
        const now = Date.now();
        let cleanedCount = 0;
        
        // Clean up project cache
        for (const [projectId, timestamp] of this.cacheTimestamps.entries()) {
            if (now - timestamp > this.options.cacheExpiry) {
                this.projectCache.delete(projectId);
                this.cacheTimestamps.delete(projectId);
                cleanedCount++;
            }
        }
        
        // Clean up context cache if expired
        if (this.lastCacheUpdate && (now - this.lastCacheUpdate) > this.options.cacheExpiry) {
            this.contextCache = null;
            this.lastCacheUpdate = null;
        }
        
        if (cleanedCount > 0) {
            this._log(`Cleaned up ${cleanedCount} expired cache entries`);
        }
    },

    /**
     * Clean up expired search cache from session storage
     */
    _cleanupSearchCache() {
        try {
            const cache = JSON.parse(sessionStorage.getItem('aaai_project_cache') || '{}');
            const now = Date.now();
            let cleanedCount = 0;
            
            Object.keys(cache).forEach(key => {
                if (cache[key].timestamp && (now - cache[key].timestamp) > this.options.cacheExpiry) {
                    delete cache[key];
                    cleanedCount++;
                }
            });
            
            if (cleanedCount > 0) {
                sessionStorage.setItem('aaai_project_cache', JSON.stringify(cache));
                this._log(`Cleaned up ${cleanedCount} expired search cache entries`);
            }
        } catch (error) {
            // Ignore storage errors but clear the cache if corrupted
            try {
                sessionStorage.removeItem('aaai_project_cache');
                this._log('Cleared corrupted search cache');
            } catch (e) {
                // Ignore if we can't even clear it
            }
        }
    },
    
    _clearProjectListCache() {
        try {
            const cache = JSON.parse(sessionStorage.getItem('aaai_project_cache') || '{}');
            Object.keys(cache).forEach(key => {
                if (key.startsWith('list_')) {
                    delete cache[key];
                }
            });
            sessionStorage.setItem('aaai_project_cache', JSON.stringify(cache));
        } catch (error) {
            // Ignore storage errors
        }
    },

    _updateContextQuick(updates) {
        Object.assign(this.currentContext, updates);
        this.contextCache = null; // Invalidate context cache
        this._saveQuickContext();
    },

    _saveQuickContext() {
        try {
            sessionStorage.setItem('aaai_project_context', JSON.stringify({
                context: this.currentContext,
                timestamp: Date.now()
            }));
        } catch (error) {
            // Ignore storage errors
        }
    },

    _loadQuickContext() {
        try {
            const stored = sessionStorage.getItem('aaai_project_context');
            if (stored) {
                const data = JSON.parse(stored);
                if (data.context && (Date.now() - data.timestamp) < this.options.cacheExpiry) {
                    Object.assign(this.currentContext, data.context);
                }
            }
        } catch (error) {
            // Ignore storage errors
        }
    },

    _notifyQuick(eventType, data) {
        // Non-blocking notifications
        setTimeout(() => {
            this.updateListeners.forEach(callback => {
                try {
                    callback(eventType, data);
                } catch (error) {
                    // Ignore listener errors
                }
            });
        }, 0);
    },

    /**
     * Recover a project that was created but function failed
     */
    async _recoverCreatedProject(projectName, userEmail) {
        try {
            this._log('Attempting to recover project:', projectName);
            
            // Get recent projects to find the one we just created
            const projectsResult = await this._executeFunction('list_user_projects', {
                email: userEmail,
                limit: 10,
                offset: 0,
                search: projectName
            });
            
            if (projectsResult?.status === 'success' && projectsResult?.data?.success && projectsResult?.data?.projects) {
                const projects = projectsResult.data.projects;
                
                // Find project with exact name match that was created recently (within last 2 minutes)
                const recentProject = projects.find(p => {
                    if (p.name !== projectName) return false;
                    
                    const createdAt = new Date(p.created_at);
                    const now = new Date();
                    const timeDiff = now - createdAt;
                    
                    // Project created within last 2 minutes
                    return timeDiff < 120000;
                });
                
                if (recentProject) {
                    this._log('Found recently created project:', recentProject.id);
                    
                    // Now get the context for this project to get chat_id
                    const contextResult = await this._executeFunction('switch_project_context', {
                        email: userEmail,
                        project_id: recentProject.id,
                        reel_id: null
                    });
                    
                    if (contextResult?.status === 'success' && contextResult?.data?.success) {
                        const project = contextResult.data.project;
                        const chat_id = contextResult.data.chat_id;
                        
                        // Cache and update context
                        this._quickCacheProject(project);
                        this._clearProjectListCache();
                        
                        this._updateContextQuick({
                            current_project: project,
                            chat_id: chat_id,
                            project_name: project.name
                        });
                        
                        this._notifyQuick('project_created', { project, chat_id });
                        
                        return {
                            success: true,
                            project: project,
                            chat_id: chat_id
                        };
                    }
                }
            }
            
            return null;
            
        } catch (error) {
            this._log('Project recovery failed:', error);
            return null;
        }
    },

    /**
     * Efficient auto-sync that respects page visibility and network conditions
     */
    _setupEfficientAutoSync() {
        if (!this.options.autoSync) return;
        
        let syncInterval = null;
        let lastSyncTime = 0;
        
        const performSmartSync = async () => {
            // Only sync if page is visible and user is authenticated
            if (document.visibilityState !== 'visible' || 
                !this.authService?.isAuthenticated()) {
                return;
            }
            
            // Throttle sync requests
            const now = Date.now();
            if (now - lastSyncTime < this.options.syncInterval) {
                return;
            }
            
            try {
                lastSyncTime = now;
                
                // Smart sync: only fetch if we have existing projects
                if (this.projectCache.size > 0) {
                    await this.getProjects({ 
                        limit: 20, 
                        offset: 0, 
                        forceRefresh: true 
                    });
                    this._log('Smart background sync completed');
                }
                
                // Check for context updates
                if (this.currentContext.current_project) {
                    await this.getCurrentContext();
                    this._log('Context sync completed');
                }
                
            } catch (error) {
                this._log('Background sync error (non-critical):', error);
            }
        };
        
        // Start efficient sync interval
        const startSync = () => {
            if (syncInterval) return;
            
            syncInterval = setInterval(performSmartSync, this.options.syncInterval);
            this._log('Efficient auto-sync started');
        };
        
        const stopSync = () => {
            if (syncInterval) {
                clearInterval(syncInterval);
                syncInterval = null;
                this._log('Auto-sync paused');
            }
        };
        
        // Listen for page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                startSync();
                // Immediate sync when page becomes visible
                setTimeout(performSmartSync, 1000);
            } else {
                stopSync();
            }
        });
        
        // Listen for online/offline events
        window.addEventListener('online', () => {
            this._log('Network restored, resuming sync');
            startSync();
            setTimeout(performSmartSync, 2000);
        });
        
        window.addEventListener('offline', () => {
            this._log('Network lost, pausing sync');
            stopSync();
        });
        
        // Start initial sync if page is visible
        if (document.visibilityState === 'visible') {
            startSync();
        }
    },

    /**
     * Setup efficient cache cleanup
     */
    _setupCacheCleanup() {
        setInterval(() => {
            this._cleanupCache();
            this._cleanupSearchCache();
        }, 300000); // Every 5 minutes
    },

    _log(...args) {
        if (this.options.debug) {
            console.log('[FastProject]', ...args);
        }
    },

    _error(...args) {
        console.error('[FastProject]', ...args);
    }
};

if (typeof window !== 'undefined') {
    window.ProjectService = ProjectService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectService;
}