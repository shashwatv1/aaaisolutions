'use strict';



/**
 * navbar toggle
 */

const header = document.querySelector("[data-header]");
const navToggleBtn = document.querySelector("[data-nav-toggle-btn]");

navToggleBtn.addEventListener("click", function () {
  header.classList.toggle("nav-active");
  this.classList.toggle("active");
});

/**
 * toggle the navbar when click any navbar link
 */

const navbarLinks = document.querySelectorAll("[data-nav-link]");

for (let i = 0; i < navbarLinks.length; i++) {
  navbarLinks[i].addEventListener("click", function () {
    header.classList.toggle("nav-active");
    navToggleBtn.classList.toggle("active");
  });
}





/**
 * back to top & header
 */

const backTopBtn = document.querySelector("[data-back-to-top]");

window.addEventListener("scroll", function () {
  if (window.scrollY >= 100) {
    header.classList.add("active");
    backTopBtn.classList.add("active");
  } else {
    header.classList.remove("active");
    backTopBtn.classList.remove("active");
  }
});

/**
 * Enhanced page initialization for new users
 */
async function initializeProjectPageEnhanced() {
    try {
        console.log('📂 Enhanced project page init...');
        
        const authService = window.AAAI_APP?.services?.AuthService;
        const projectService = window.AAAI_APP?.services?.ProjectService;
        
        if (!authService?.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        // Load context with new user handling
        if (projectService) {
            try {
                if (projectService.isInitialized || typeof projectService.getCurrentContext === 'function') {
                    const context = await projectService.getCurrentContext();
                    
                    if (context && context.success) {
                        if (context.isNewUser) {
                            console.log('👋 Welcome! New user detected - no existing projects');
                            // Show welcome message or empty state
                            showWelcomeMessage();
                        } else {
                            console.log('✅ Project context loaded:', context);
                        }
                    } else {
                        console.log('ℹ️ No context available (new user)');
                        showWelcomeMessage();
                    }
                } else {
                    console.warn('⚠️ ProjectService not properly initialized');
                }
            } catch (error) {
                console.log('ℹ️ Context load failed (likely new user):', error.message);
                showWelcomeMessage();
            }
        }
        
        console.log('✅ Enhanced project page initialized');
        
    } catch (error) {
        console.error('❌ Enhanced project page init failed:', error);
    }
}

/**
 * Helper function for new users
 */
function showWelcomeMessage() {
    // Show empty state or welcome message for new users
    const projectsGrid = document.getElementById('projectsGrid');
    if (projectsGrid) {
        projectsGrid.innerHTML = `
            <div class="welcome-state">
                <h3>👋 Welcome to AAAI Solutions!</h3>
                <p>You don't have any projects yet. Create your first project to get started.</p>
                <button class="btn btn-primary" onclick="showNewProjectModal()">
                    Create Your First Project
                </button>
            </div>
        `;
    }
}