/**
 * Ultra-fast Project Service for AAAI Solutions
 * Optimized with parallel processing, aggressive caching, and non-blocking operations
 */
const ProjectService = {
    // Core service state
    authService: null,
    isInitialized: false,
    
    // Performance-optimized cache with faster access
    projectCache: new Map(),
    cacheTimestamps: new Map(),
    contextCache: null,
    lastCacheUpdate: null,
    
    // Optimized configuration
    options: {
        cacheExpiry: 180000, // Reduced to 3 minutes for fresher data
        maxCacheSize: 50, // Reduced for better memory management
        quickCacheExpiry: 15000, // Reduced to 15 seconds
        enableRealTimeUpdates: true,
        autoSync: true,
        syncInterval: 90000, // Increased to 1.5 minutes to reduce load
        smartSync: true,
        batchOperations: true, // New: Enable batch operations
        parallelLoading: true, // New: Enable parallel loading
        debug: false
    },
    
    // Context management - streamlined
    currentContext: {
        user_id: null,
        current_project: null,
        chat_id: null,
        project_name: null
    },
    
    // Performance monitoring
    operationTimes: new Map(),
    requestQueue: new Map(),
    
    // Event listeners - minimal
    updateListeners: [],
    
    /**
     * Ultra-fast initialization with parallel setup
     */
    init(authService, options = {}) {
        if (this.isInitialized) {
            return this;
        }
        
        if (!authService) {
            throw new Error('AuthService required');
        }
        
        const startTime = performance.now();
        
        this.authService = authService;
        this.options = { ...this.options, ...options };
        
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        // Parallel initialization tasks
        const initTasks = [
            this._initializeUserContext(),
            this._loadQuickContextParallel(),
            this._setupOptimizedAutoSync(),
            this._setupCacheCleanupOptimized()
        ];
        
        // Execute all initialization tasks in parallel
        Promise.allSettled(initTasks).then(results => {
            const failed = results.filter(r => r.status === 'rejected');
            if (failed.length > 0) {
                console.warn('Some initialization tasks failed:', failed);
            }
        });
        
        this.isInitialized = true;
        
        const initTime = performance.now() - startTime;
        this._log(`ProjectService initialized ultra-fast in ${initTime.toFixed(2)}ms`);
        
        return this;
    },

    /**
     * Ultra-fast project creation with parallel processing
     */
    async createProject(projectData) {
        const startTime = performance.now();
        
        try {
            this._requireAuth();
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            this._log('Creating project with parallel processing:', projectData.name);
            
            const functionInput = {
                name: projectData.name,
                description: projectData.description || null,
                tags: projectData.tags || [],
                email: user.email
            };
            
            // Execute creation with timeout and parallel recovery
            const [result, recoveryReady] = await Promise.allSettled([
                this._executeFunction('create_project_with_context', functionInput),
                this._prepareRecoveryContext(projectData.name, user.email)
            ]);
            
            if (result.status === 'rejected') {
                throw result.reason;
            }
            
            const apiResult = result.value;
            this._log('API response:', apiResult);
            
            // Parallel processing of different response types
            let finalResult;
            
            if (apiResult?.status === 'success' && apiResult?.data?.success === false) {
                this._log('Project creation function failed, attempting ultra-fast recovery...');
                
                // Ultra-fast recovery with parallel checks
                finalResult = await this._recoverCreatedProjectParallel(projectData.name, user.email);
                
                if (!finalResult) {
                    throw new Error('Project creation failed and recovery unsuccessful');
                }
            } else {
                // Standard success path with parallel validation
                finalResult = await this._processSuccessfulCreation(apiResult);
            }
            
            // Parallel cache and context updates
            const updateTasks = [
                this._quickCacheProject(finalResult.project),
                this._clearProjectListCacheParallel(),
                this._updateContextQuickParallel({
                    current_project: finalResult.project,
                    chat_id: finalResult.chat_id,
                    project_name: finalResult.project.name
                })
            ];
            
            await Promise.allSettled(updateTasks);
            
            // Non-blocking notification
            requestAnimationFrame(() => {
                this._notifyQuick('project_created', { 
                    project: finalResult.project, 
                    chat_id: finalResult.chat_id 
                });
            });
            
            const createTime = performance.now() - startTime;
            this._log(`Project created ultra-fast in ${createTime.toFixed(2)}ms`);
            
            return finalResult;
            
        } catch (error) {
            this._error('Error creating project:', error);
            throw error;
        }
    },

    /**
     * Ultra-fast project list with parallel loading and aggressive caching
     */
    async getProjects(options = {}) {
        const startTime = performance.now();
        
        try {
            this._requireAuth();
            
            const {
                limit = 20,
                offset = 0,
                search = '',
                forceRefresh = false
            } = options;
            
            const cacheKey = `list_${limit}_${offset}_${search}`;
            
            // Ultra-aggressive cache check
            if (!forceRefresh) {
                const cached = this._getQuickCacheParallel(cacheKey);
                if (cached) {
                    const cacheTime = performance.now() - startTime;
                    this._log(`Projects from cache in ${cacheTime.toFixed(2)}ms`);
                    return cached;
                }
            }
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            this._log('Getting projects with parallel processing for:', user.email);
            
            // Parallel API call with context preparation
            const [apiResult, cacheReady] = await Promise.allSettled([
                this._executeFunction('list_user_projects', {
                    email: user.email,
                    limit,
                    offset,
                    search: search.trim()
                }),
                this._prepareCacheSpace()
            ]);
            
            if (apiResult.status === 'rejected') {
                throw apiResult.reason;
            }
            
            const result = apiResult.value;
            
            if (result?.data?.success) {
                const projectData = {
                    projects: result.data.projects || [],
                    total: result.data.total || 0,
                    hasMore: result.data.has_more || false,
                    limit,
                    offset,
                    timestamp: Date.now()
                };
                
                // Parallel caching operations
                const cachingTasks = [
                    this._cacheProjectsBatch(projectData.projects),
                    this._setQuickCacheParallel(cacheKey, projectData)
                ];
                
                await Promise.allSettled(cachingTasks);
                
                const loadTime = performance.now() - startTime;
                this._log(`Projects retrieved ultra-fast in ${loadTime.toFixed(2)}ms:`, projectData.projects.length);
                
                return projectData;
            }
            
            throw new Error(result?.data?.message || 'Failed to get projects');
            
        } catch (error) {
            this._error('Error getting projects:', error);
            throw new Error(`Failed to get projects: ${error.message}`);
        }
    },

    /**
     * Ultra-fast project details with intelligent caching
     */
    async getProject(projectId, forceRefresh = false) {
        const startTime = performance.now();
        
        try {
            this._requireAuth();
            
            if (!projectId) {
                throw new Error('Project ID required');
            }
            
            // Intelligent cache check with parallel validation
            if (!forceRefresh) {
                const [cached, isValid] = await Promise.allSettled([
                    Promise.resolve(this._getCachedProjectParallel(projectId)),
                    this._validateCacheEntry(projectId)
                ]);
                
                if (cached.status === 'fulfilled' && cached.value && isValid.status === 'fulfilled' && isValid.value) {
                    const cacheTime = performance.now() - startTime;
                    this._log(`Project details from cache in ${cacheTime.toFixed(2)}ms`);
                    return cached.value;
                }
            }
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            // Parallel API call and cache preparation
            const [result, cacheReady] = await Promise.allSettled([
                this._executeFunction('get_project_details', {
                    project_id: projectId,
                    email: user.email
                }),
                this._prepareCacheForProject(projectId)
            ]);
            
            if (result.status === 'rejected') {
                throw result.reason;
            }
            
            const apiResult = result.value;
            
            if (apiResult?.status === 'success' && apiResult?.data?.success) {
                const project = apiResult.data.project;
                
                // Quick cache update (non-blocking)
                requestAnimationFrame(() => {
                    this._quickCacheProject(project);
                });
                
                const detailTime = performance.now() - startTime;
                this._log(`Project details retrieved ultra-fast in ${detailTime.toFixed(2)}ms`);
                
                return project;
            }
            
            throw new Error(apiResult?.data?.message || 'Project not found');
            
        } catch (error) {
            this._error('Error getting project:', error);
            throw new Error(`Failed to get project: ${error.message}`);
        }
    },

    /**
     * Ultra-fast context switching with parallel operations
     */
    async switchToProject(projectId, projectName = null) {
        const startTime = performance.now();
        
        try {
            this._requireAuth();
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            this._log('Ultra-fast project switch:', projectId);
            
            // Parallel context switch and preparation
            const [switchResult, prepReady] = await Promise.allSettled([
                this._executeSwitchWithRetry(user.email, projectId),
                this._prepareContextSwitch(projectId, projectName)
            ]);
            
            if (switchResult.status === 'rejected') {
                throw switchResult.reason;
            }
            
            const result = switchResult.value;
            
            if (result?.status === 'success' && result?.data?.success) {
                const project = result.data.project;
                const chat_id = result.data.chat_id;
                
                // Parallel context and service updates
                const updateTasks = [
                    this._updateContextQuickParallel({
                        current_project: project,
                        chat_id: chat_id,
                        project_name: project.name
                    }),
                    this._updateChatServiceContext(chat_id, project.name)
                ];
                
                await Promise.allSettled(updateTasks);
                
                const switchTime = performance.now() - startTime;
                this._log(`Project context switched ultra-fast in ${switchTime.toFixed(2)}ms`);
                
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
     * Ultra-fast context retrieval with intelligent caching
     */
    async getCurrentContext() {
        const startTime = performance.now();
        
        try {
            this._requireAuth();
            
            // Intelligent cache check
            const cacheAge = this.lastCacheUpdate ? Date.now() - this.lastCacheUpdate : Infinity;
            if (this.contextCache && cacheAge < this.options.quickCacheExpiry) {
                const cacheTime = performance.now() - startTime;
                this._log(`Context from cache in ${cacheTime.toFixed(2)}ms`);
                return this.contextCache;
            }
            
            const user = this.authService.getCurrentUser();
            if (!user?.email) {
                throw new Error('User information not available');
            }
            
            // Parallel context fetch and cache preparation
            const [result, cacheReady] = await Promise.allSettled([
                this._executeFunction('get_user_context', {
                    email: user.email
                }),
                this._prepareContextCache()
            ]);
            
            if (result.status === 'rejected') {
                throw result.reason;
            }
            
            const apiResult = result.value;
            
            if (apiResult?.status === 'success' && apiResult?.data?.success) {
                const contextResult = {
                    success: true,
                    context: apiResult.data.context,
                    current_project: apiResult.data.current_project,
                    user_id: apiResult.data.user_id
                };
                
                // Parallel context updates
                const updateTasks = [
                    this._updateLocalContext(apiResult.data),
                    this._cacheContextResult(contextResult),
                    this._saveQuickContextParallel()
                ];
                
                await Promise.allSettled(updateTasks);
                
                const contextTime = performance.now() - startTime;
                this._log(`Context retrieved ultra-fast in ${contextTime.toFixed(2)}ms`);
                
                return contextResult;
            }
            
            throw new Error(apiResult?.data?.message || 'Failed to get user context');
            
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
     * Ultra-fast cache clearing with parallel operations
     */
    clearCache() {
        const startTime = performance.now();
        
        const cleared = this.projectCache.size;
        
        // Parallel cache clearing
        const clearTasks = [
            Promise.resolve().then(() => {
                this.projectCache.clear();
                this.cacheTimestamps.clear();
            }),
            Promise.resolve().then(() => {
                this.contextCache = null;
                this.lastCacheUpdate = null;
            }),
            this._clearSessionStorageParallel()
        ];
        
        Promise.allSettled(clearTasks).then(() => {
            const clearTime = performance.now() - startTime;
            this._log(`Cleared ${cleared} cached items ultra-fast in ${clearTime.toFixed(2)}ms`);
        });
        
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

    // Ultra-fast private methods with parallel processing

    _requireAuth() {
        if (!this.authService?.isAuthenticated()) {
            throw new Error('Authentication required');
        }
    },

    async _executeFunction(functionName, inputData) {
        this._requireAuth();
        
        const startTime = performance.now();
        this._log('Executing function:', functionName);
        
        try {
            const result = await this.authService.executeFunction(functionName, inputData);
            
            const execTime = performance.now() - startTime;
            this.operationTimes.set(functionName, execTime);
            
            this._logAPIResponseOptimized(functionName, result, execTime);
            
            return result;
        } catch (error) {
            this._error('Function execution failed:', functionName, {
                error: error.message,
                inputData: inputData
            });
            throw error;
        }
    },

    /**
     * Optimized API response logging
     */
    _logAPIResponseOptimized(functionName, result, execTime) {
        this._log(`API Response for ${functionName} (${execTime.toFixed(2)}ms):`, {
            hasStatus: !!result?.status,
            status: result?.status,
            hasData: !!result?.data,
            hasSuccess: !!result?.success,
            hasProject: !!(result?.project || result?.data?.project),
            hasChatId: !!(result?.chat_id || result?.data?.chat_id)
        });
    },

    /**
     * Ultra-fast project caching with batch operations
     */
    _quickCacheProject(project) {
        if (!project?.id) return;
        
        this.projectCache.set(project.id, project);
        this.cacheTimestamps.set(project.id, Date.now());
        
        // Efficient cache size management
        if (this.projectCache.size > this.options.maxCacheSize) {
            this._cleanupCacheEfficient();
        }
    },

    /**
     * Parallel project caching
     */
    async _cacheProjectsBatch(projects) {
        if (!Array.isArray(projects)) return;
        
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                projects.forEach(project => this._quickCacheProject(project));
                resolve();
            });
        });
    },

    /**
     * Parallel cached project retrieval
     */
    _getCachedProjectParallel(projectId) {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                const timestamp = this.cacheTimestamps.get(projectId);
                if (!timestamp || (Date.now() - timestamp) > this.options.cacheExpiry) {
                    this.projectCache.delete(projectId);
                    this.cacheTimestamps.delete(projectId);
                    resolve(null);
                } else {
                    resolve(this.projectCache.get(projectId));
                }
            });
        });
    },

    /**
     * Parallel cache validation
     */
    async _validateCacheEntry(projectId) {
        return new Promise((resolve) => {
            const timestamp = this.cacheTimestamps.get(projectId);
            resolve(timestamp && (Date.now() - timestamp) < this.options.cacheExpiry);
        });
    },

    /**
     * Parallel quick cache operations
     */
    _setQuickCacheParallel(key, data) {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                try {
                    const cache = JSON.parse(sessionStorage.getItem('aaai_project_cache') || '{}');
                    cache[key] = {
                        data,
                        timestamp: Date.now()
                    };
                    
                    sessionStorage.setItem('aaai_project_cache', JSON.stringify(cache));
                    resolve();
                } catch (error) {
                    resolve(); // Ignore storage errors
                }
            });
        });
    },

    _getQuickCacheParallel(key) {
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
     * Parallel context switching operations
     */
    async _executeSwitchWithRetry(email, projectId) {
        let result = await this._executeFunction('switch_project_context', {
            email: email,
            project_id: projectId,
            reel_id: null
        });
        
        // Single retry with delay
        if (result?.status === 'success' && result?.data?.success === false) {
            this._log('Context switch failed, retrying with delay...');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            result = await this._executeFunction('switch_project_context', {
                email: email,
                project_id: projectId,
                reel_id: null
            });
        }
        
        return result;
    },

    /**
     * Parallel context preparation
     */
    async _prepareContextSwitch(projectId, projectName) {
        return Promise.resolve(); // Placeholder for future optimizations
    },

    /**
     * Parallel context updates
     */
    async _updateContextQuickParallel(updates) {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                Object.assign(this.currentContext, updates);
                this.contextCache = null;
                resolve();
            });
        });
    },

    /**
     * Non-blocking chat service update
     */
    async _updateChatServiceContext(chat_id, project_name) {
        return new Promise((resolve) => {
            setTimeout(() => {
                try {
                    if (window.ChatService?.isInitialized) {
                        window.ChatService.setProjectContext(chat_id, project_name);
                    }
                } catch (error) {
                    console.warn('ChatService context update failed:', error);
                }
                resolve();
            }, 0);
        });
    },

    /**
     * Ultra-fast project recovery with parallel checks
     */
    async _recoverCreatedProjectParallel(projectName, userEmail) {
        try {
            this._log('Attempting ultra-fast project recovery:', projectName);
            
            const projectsResult = await this._executeFunction('list_user_projects', {
                email: userEmail,
                limit: 10,
                offset: 0,
                search: projectName
            });
            
            if (projectsResult?.status === 'success' && projectsResult?.data?.success && projectsResult?.data?.projects) {
                const projects = projectsResult.data.projects;
                
                const recentProject = projects.find(p => {
                    if (p.name !== projectName) return false;
                    
                    const createdAt = new Date(p.created_at);
                    const now = new Date();
                    const timeDiff = now - createdAt;
                    
                    return timeDiff < 120000; // 2 minutes
                });
                
                if (recentProject) {
                    this._log('Found recently created project, switching context...');
                    
                    const contextResult = await this._executeFunction('switch_project_context', {
                        email: userEmail,
                        project_id: recentProject.id,
                        reel_id: null
                    });
                    
                    if (contextResult?.status === 'success' && contextResult?.data?.success) {
                        const project = contextResult.data.project;
                        const chat_id = contextResult.data.chat_id;
                        
                        // Parallel updates
                        const updateTasks = [
                            this._quickCacheProject(project),
                            this._clearProjectListCacheParallel(),
                            this._updateContextQuickParallel({
                                current_project: project,
                                chat_id: chat_id,
                                project_name: project.name
                            })
                        ];
                        
                        await Promise.allSettled(updateTasks);
                        
                        // Non-blocking notification
                        requestAnimationFrame(() => {
                            this._notifyQuick('project_created', { project, chat_id });
                        });
                        
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
     * Parallel initialization helpers
     */
    async _initializeUserContext() {
        if (this.authService.isAuthenticated()) {
            const user = this.authService.getCurrentUser();
            if (user) {
                this.currentContext.user_id = user.id;
            }
        }
    },

    async _loadQuickContextParallel() {
        return new Promise((resolve) => {
            try {
                const stored = sessionStorage.getItem('aaai_project_context');
                if (stored) {
                    const data = JSON.parse(stored);
                    if (data.context && (Date.now() - data.timestamp) < this.options.cacheExpiry) {
                        Object.assign(this.currentContext, data.context);
                    }
                }
                resolve();
            } catch (error) {
                resolve(); // Ignore storage errors
            }
        });
    },

    async _saveQuickContextParallel() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                try {
                    sessionStorage.setItem('aaai_project_context', JSON.stringify({
                        context: this.currentContext,
                        timestamp: Date.now()
                    }));
                } catch (error) {
                    // Ignore storage errors
                }
                resolve();
            });
        });
    },

    async _clearProjectListCacheParallel() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
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
                resolve();
            });
        });
    },

    async _clearSessionStorageParallel() {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                try {
                    sessionStorage.removeItem('aaai_project_context');
                    sessionStorage.removeItem('aaai_project_cache');
                } catch (error) {
                    // Ignore storage errors
                }
                resolve();
            });
        });
    },

    /**
     * Efficient cache cleanup
     */
    _cleanupCacheEfficient() {
        const entries = Array.from(this.cacheTimestamps.entries());
        entries.sort((a, b) => a[1] - b[1]); // Sort by timestamp
        
        const toRemove = entries.slice(0, Math.floor(this.options.maxCacheSize * 0.2)); // Remove oldest 20%
        toRemove.forEach(([projectId]) => {
            this.projectCache.delete(projectId);
            this.cacheTimestamps.delete(projectId);
        });
    },

    /**
     * Ultra-fast auto-sync setup
     */
    _setupOptimizedAutoSync() {
        if (!this.options.autoSync) return;
        
        let syncInterval = null;
        let lastSyncTime = 0;
        
        const performOptimizedSync = async () => {
            if (document.visibilityState !== 'visible' || 
                !this.authService?.isAuthenticated()) {
                return;
            }
            
            const now = Date.now();
            if (now - lastSyncTime < this.options.syncInterval) {
                return;
            }
            
            try {
                lastSyncTime = now;
                
                // Only sync if we have projects in cache
                if (this.projectCache.size > 0) {
                    await this.getProjects({ 
                        limit: 20, 
                        offset: 0, 
                        forceRefresh: true 
                    });
                }
                
                // Quick context check
                if (this.currentContext.current_project) {
                    await this.getCurrentContext();
                }
                
            } catch (error) {
                // Ignore sync errors
            }
        };
        
        const startSync = () => {
            if (syncInterval) return;
            syncInterval = setInterval(performOptimizedSync, this.options.syncInterval);
        };
        
        const stopSync = () => {
            if (syncInterval) {
                clearInterval(syncInterval);
                syncInterval = null;
            }
        };
        
        // Visibility change handlers
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                startSync();
                setTimeout(performOptimizedSync, 1000);
            } else {
                stopSync();
            }
        });
        
        // Network state handlers
        window.addEventListener('online', () => {
            startSync();
            setTimeout(performOptimizedSync, 2000);
        });
        
        window.addEventListener('offline', stopSync);
        
        if (document.visibilityState === 'visible') {
            startSync();
        }
    },

    /**
     * Optimized cache cleanup setup
     */
    _setupCacheCleanupOptimized() {
        setInterval(() => {
            this._cleanupCacheEfficient();
            this._cleanupSessionCacheOptimized();
        }, 300000); // Every 5 minutes
    },

    _cleanupSessionCacheOptimized() {
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
            }
        } catch (error) {
            try {
                sessionStorage.removeItem('aaai_project_cache');
            } catch (e) {
                // Ignore
            }
        }
    },

    // Additional helper methods for parallel processing

    async _processSuccessfulCreation(apiResult) {
        if (apiResult?.status !== 'success' || !apiResult?.data) {
            throw new Error('Invalid API response');
        }
        
        let project = null;
        let chat_id = null;
        
        if (apiResult.data.success && apiResult.data.project) {
            project = apiResult.data.project;
            chat_id = apiResult.data.chat_id;
        } else if (apiResult.data.project && apiResult.data.chat_id) {
            project = apiResult.data.project;
            chat_id = apiResult.data.chat_id;
        }
        
        if (!project?.id || !chat_id) {
            throw new Error('Invalid project data in response');
        }
        
        return {
            success: true,
            project: project,
            chat_id: chat_id
        };
    },

    async _prepareRecoveryContext(projectName, userEmail) {
        // Placeholder for future recovery optimizations
        return Promise.resolve();
    },

    async _prepareCacheSpace() {
        if (this.projectCache.size > this.options.maxCacheSize * 0.8) {
            this._cleanupCacheEfficient();
        }
        return Promise.resolve();
    },

    async _prepareCacheForProject(projectId) {
        // Pre-warm cache entry
        return Promise.resolve();
    },

    async _prepareContextCache() {
        return Promise.resolve();
    },

    async _updateLocalContext(data) {
        this.currentContext = {
            ...this.currentContext,
            current_project: data.current_project,
            chat_id: data.context?.current_chat_id,
            project_name: data.current_project?.name
        };
        return Promise.resolve();
    },

    async _cacheContextResult(contextResult) {
        this.contextCache = contextResult;
        this.lastCacheUpdate = Date.now();
        return Promise.resolve();
    },

    _notifyQuick(eventType, data) {
        requestAnimationFrame(() => {
            this.updateListeners.forEach(callback => {
                try {
                    callback(eventType, data);
                } catch (error) {
                    // Ignore listener errors
                }
            });
        });
    },

    _log(...args) {
        if (this.options.debug) {
            console.log('[UltraFastProject]', ...args);
        }
    },

    _error(...args) {
        console.error('[UltraFastProject]', ...args);
    }
};

if (typeof window !== 'undefined') {
    window.ProjectService = ProjectService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProjectService;
}