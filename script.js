document.addEventListener("DOMContentLoaded", function () {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebarToggle");
  const menuItems = document.querySelectorAll("#menuList .menu-item");

  if (!sidebar || !toggle) return;

  // restore collapsed state only on desktop (guard against storage being blocked by tracking prevention)
  const sidebarStorageKey = "sidebarCollapsed";
  try {
    if (window.innerWidth > 768 && localStorage.getItem(sidebarStorageKey) === "true") {
      sidebar.classList.add("collapsed");
    }
  } catch (e) {
    // ignore storage access errors
  }

  // Handle window resize to clean up classes
  let resizeTimer;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      const isMobile = window.innerWidth <= 768;
      if (!isMobile) {
        // On desktop, remove mobile-specific 'show' class
        sidebar.classList.remove("show");
      } else {
        // On mobile, remove desktop-specific 'collapsed' class if sidebar is not intentionally shown
        if (!sidebar.classList.contains("show")) {
          sidebar.classList.remove("collapsed");
        }
      }
    }, 250);
  });

  toggle.addEventListener("click", function (e) {
    e.stopPropagation();
    // Check if mobile view (viewport width <= 768px)
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
      // On mobile, toggle the 'show' class for overlay behavior
      sidebar.classList.toggle("show");
    } else {
      // On desktop, toggle the 'collapsed' class for narrow sidebar
      sidebar.classList.toggle("collapsed");
      try {
        localStorage.setItem(
          sidebarStorageKey,
          sidebar.classList.contains("collapsed")
        );
      } catch (e) {
        // ignore storage access errors
      }
    }
  });

  // Close sidebar when clicking outside on mobile
  document.addEventListener("click", function (event) {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;
    
    // Check if sidebar is shown
    if (!sidebar.classList.contains("show")) return;
    
    // Check if click is on sidebar
    if (sidebar.contains(event.target)) {
      // Check if click is in the close button area (top-left 80x80px)
      const rect = sidebar.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      const clickY = event.clientY - rect.top;
      
      if (clickX >= 0 && clickX <= 80 && clickY >= 0 && clickY <= 80) {
        // Click on close button area
        sidebar.classList.remove("show");
        return;
      }
      // Click inside sidebar but not on close button - do nothing
      return;
    }
    
    // Click outside sidebar and toggle button - close sidebar
    if (!toggle.contains(event.target)) {
      sidebar.classList.remove("show");
    }
  });

  menuItems.forEach(function (item) {
    item.addEventListener("click", function () {
      document
        .querySelectorAll("#menuList .menu-item.active")
        .forEach(function (el) {
          el.classList.remove("active");
        });
      item.classList.add("active");
      
      // Close sidebar on mobile when menu item is clicked
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        sidebar.classList.remove("show");
      }
      
      const url = item.dataset.url;
      if (url) {
        window.location.href = url;
      }
    });
  });

  // Activate menu item based on current URL
  function activateMenuByUrl() {
    const currentPath = window.location.pathname;
    const currentFile = currentPath.split('/').pop() || 'index.html';
    
    let matchedItem = null;
    
    // First, try to match by data-url attribute
    menuItems.forEach(function(item) {
      const itemUrl = item.dataset.url;
      if (!itemUrl) return;
      
      // Normalize paths for comparison
      const normalizedItemUrl = itemUrl.toLowerCase().replace(/\\/g, '/');
      const normalizedCurrentPath = currentPath.toLowerCase().replace(/\\/g, '/');
      
      // Check if current path ends with the item's URL or matches exactly
      if (normalizedCurrentPath.endsWith(normalizedItemUrl) || 
          normalizedCurrentPath.includes(normalizedItemUrl)) {
        matchedItem = item;
      }
    });
    
    // If no direct match, try matching by filename and label
    if (!matchedItem) {
      if (currentFile === 'index.html' || currentPath.endsWith('/') || currentFile === '') {
        matchedItem = Array.from(menuItems).find(item => 
          item.querySelector('.label')?.textContent.trim().toLowerCase() === 'home'
        );
      } else if (currentFile.toLowerCase() === 'rules.html') {
        matchedItem = Array.from(menuItems).find(item => 
          item.querySelector('.label')?.textContent.trim().toLowerCase() === 'rules'
        );
      } else if (currentFile.toLowerCase() === 'documents.html') {
        matchedItem = Array.from(menuItems).find(item => 
          item.querySelector('.label')?.textContent.trim().toLowerCase() === 'documents'
        );
      }
    }
    
    // Clear all active states first
    document.querySelectorAll("#menuList .menu-item.active").forEach(function (el) {
      el.classList.remove("active");
    });
    
    // Activate the matched item or default to first
    if (matchedItem) {
      matchedItem.classList.add("active");
    } else {
      const first = document.querySelector("#menuList .menu-item");
      if (first) first.classList.add("active");
    }
  }
  
  activateMenuByUrl();

  // Fetch and render posts list
  const blogListContainer = document.querySelector('.blog-list-items');
  const loadMoreButton = document.getElementById('loadMoreButton');
  const paginationInfo = document.getElementById('paginationInfo');
  const tagFilterContainer = document.querySelector('.tag-filter-tabs');
  
  if (blogListContainer) {
    let allPosts = [];
    let filteredPosts = [];
    let currentPage = 0;
    let selectedTag = 'all';
    let categories = {}; // Store category id -> name mapping
    const postsPerPage = 20;

    // Try loading posts.json from local first, but when running as file://
    // prefer CDN. If the primary source fails, fall back to the alternative.
    const cdnBase = 'https://raymee675.github.io/Raymee-s-Secret-Base';
    const cdnPostsPath = `${cdnBase}/data/BlogData/posts.json`;
    const cdnCategoryPath = `${cdnBase}/data/Category.json`;

    // If opened via file://, prefer CDN to avoid local path issues in some setups
    let primaryUrl = cdnPostsPath;
    let categoryUrl = cdnCategoryPath;

    function fetchJson(url) {
      return fetch(url, { cache: 'no-store' }).then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
        return res.json();
      });
    }

    // Load categories first, then posts
    fetchJson(categoryUrl)
      .then((categoryData) => {
        // Build category mapping
        if (categoryData && categoryData.category && Array.isArray(categoryData.category)) {
          categoryData.category.forEach((cat) => {
            categories[cat.id] = cat.name;
          });
        }
        
        // Now load posts
        return fetchJson(primaryUrl);
      })
      .then((meta) => {
        // Filter only published posts
        allPosts = ((meta && meta.posts) || []).filter((post) => post.published === true);
        if (allPosts.length === 0) {
          blogListContainer.innerHTML = '<div class="muted">投稿が見つかりません。</div>';
          return;
        }
        // sort by id desc (newest first)
        allPosts.sort((a, b) => (b.id || 0) - (a.id || 0));

        // Build tag filter tabs from available tags
        buildTagTabs();
        
        // Apply initial filter and render
        applyTagFilter('all');
      })
      .catch((err) => {
        const msg = document.createElement('div');
        msg.className = 'muted';
        msg.style.whiteSpace = 'pre-wrap';
        msg.textContent = '投稿一覧を読み込めませんでした。\n参照したURL:\n' + primaryUrl + '\n\n詳細: ' + (err && err.message ? err.message : String(err));
        blogListContainer.innerHTML = '';
        blogListContainer.appendChild(msg);
        console.error(err);
      });

    function buildTagTabs() {
      if (!tagFilterContainer) return;
      
      // Add click event to the "すべて" button
      const allButton = tagFilterContainer.querySelector('[data-tag="all"]');
      if (allButton) {
        allButton.addEventListener('click', () => applyTagFilter('all'));
      }
      
      // Collect all unique tags from posts
      const allTags = new Set();
      allPosts.forEach((post) => {
        if (post.tags && Array.isArray(post.tags)) {
          post.tags.forEach((tag) => allTags.add(tag));
        }
      });
      
      // Sort tags numerically
      const sortedTags = Array.from(allTags).sort((a, b) => a - b);
      
      // Create tag buttons with category names
      sortedTags.forEach((tag) => {
        const button = document.createElement('button');
        button.className = 'tag-tab';
        button.dataset.tag = tag;
        // Use category name from categories mapping, fallback to "タグ X"
        button.textContent = categories[tag] || `タグ ${tag}`;
        button.addEventListener('click', () => applyTagFilter(tag));
        tagFilterContainer.appendChild(button);
      });
    }
    
    function applyTagFilter(tag) {
      selectedTag = tag;
      
      // Update active tab styling
      document.querySelectorAll('.tag-tab').forEach((btn) => {
        btn.classList.remove('active');
        if (btn.dataset.tag == tag) {
          btn.classList.add('active');
        }
      });
      
      // Filter posts
      if (tag === 'all') {
        filteredPosts = allPosts;
      } else {
        const tagNum = parseInt(tag, 10);
        filteredPosts = allPosts.filter((post) => {
          return post.tags && Array.isArray(post.tags) && post.tags.includes(tagNum);
        });
      }
      
      // Reset to first page and render
      currentPage = 0;
      renderPage(0);
    }

    function renderPage(pageNum) {
      const startIdx = pageNum * postsPerPage;
      const endIdx = startIdx + postsPerPage;
      const postsToShow = filteredPosts.slice(startIdx, endIdx);
      
        const html = postsToShow
        .map((p) => {
          const rawTitle = p.title || `Post ${p.id}`;
          const title = rawTitle.replace(/ - レイミーの秘密基地$/, '');
          const summary = p.summary || '';
          const href = `https://raymee675.github.io/Raymee-s-Secret-Base/${p.path}`;

          function formatDate(d) {
            if (!d) return '';
            try {
              const dt = new Date(d);
              if (isNaN(dt)) return d;
              const year = dt.getFullYear();
              const month = String(dt.getMonth() + 1).padStart(2, '0');
              const day = String(dt.getDate()).padStart(2, '0');
              return `${year}/${month}/${day}`;
            } catch (e) {
              return d;
            }
          }

          return `
            <article class="blog-item">
              <div class="blog-item-layout">
                <div class="blog-item-left">
                  <div class="blog-item-title">
                    <h3><a href="${href}">${escapeHtml(title)}</a></h3>
                  </div>
                  <div class="blog-item-date">
                    ${escapeHtml(formatDate(p.date))}
                  </div>
                </div>
                <div class="blog-item-separator"></div>
                <div class="blog-item-right">
                  <div class="blog-item-summary">
                    ${escapeHtml(summary)}
                  </div>
                </div>
              </div>
            </article>
          `;
        })
        .join('\n');
      
      if (pageNum === 0) {
        // First page: clear and display
        blogListContainer.innerHTML = html;
      } else {
        // Subsequent pages: append
        blogListContainer.innerHTML += html;
      }
      
      // Update button and pagination info
      currentPage = pageNum;
      const totalShown = Math.min((pageNum + 1) * postsPerPage, filteredPosts.length);
      paginationInfo.textContent = `表示中: ${totalShown} / ${filteredPosts.length}`;
      
      // Show/hide load more button
      if (endIdx < filteredPosts.length) {
        loadMoreButton.style.display = 'block';
      } else {
        loadMoreButton.style.display = 'none';
      }
    }

    // Load more button click handler
    if (loadMoreButton) {
      loadMoreButton.addEventListener('click', function () {
        renderPage(currentPage + 1);
      });
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/\'/g, '&#39;');
  }

  // Related posts functionality for parent.html pages
  const relatedPostsContainer = document.querySelector('.related-posts-items');
  
  if (relatedPostsContainer) {
    // Extract tags from meta tag
    const metaTag = document.querySelector('meta[name="tags"]');
    const tagsContent = metaTag ? metaTag.getAttribute('content') : '';
    
    // Parse tags from "id/id/id" format
    const currentTags = tagsContent
      .split('/')
      .map(t => parseInt(t.trim(), 10))
      .filter(t => !isNaN(t));
    
    // Extract current page path to exclude current post
    const currentPath = window.location.pathname;
    
    // Get current page date if available (from og:url or try to extract from path)
    let currentDate = null;
    const ogUrlMeta = document.querySelector('meta[property="og:url"]');
    if (ogUrlMeta) {
      // Try to find date in the current document - may need adjustment based on actual structure
      // For now we'll use current date as fallback
      currentDate = new Date();
    }
    
    const cdnBase = 'https://raymee675.github.io/Raymee-s-Secret-Base';
    const cdnPostsPath = `${cdnBase}/data/BlogData/posts.json`;
    const maxRelatedPosts = 5; // Number of related posts to show
    
    function fetchJson(url) {
      return fetch(url, { cache: 'no-store' }).then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
        return res.json();
      });
    }
    
    function findRelatedPosts(allPosts, currentTags, currentPath) {
      if (!allPosts || allPosts.length === 0) return [];
      
      // Filter published posts only and exclude current post
      let candidatePosts = allPosts.filter((post) => {
        if (post.published !== true) return false;
        // Exclude current post by checking if path matches
        if (currentPath.includes(post.path)) return false;
        return true;
      });
      
      // If no tags, return recent posts
      if (currentTags.length === 0) {
        return candidatePosts
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .slice(0, maxRelatedPosts);
      }
      
      // Score posts by tag overlap and date proximity
      const scoredPosts = candidatePosts.map((post) => {
        let score = 0;
        const postTags = post.tags || [];
        
        // Calculate tag overlap (union of categories)
        const commonTags = currentTags.filter(tag => postTags.includes(tag));
        score += commonTags.length * 10; // Weight tag matches heavily
        
        // Add date proximity bonus if available
        if (currentDate && post.date) {
          const postDate = new Date(post.date);
          const daysDiff = Math.abs((currentDate - postDate) / (1000 * 60 * 60 * 24));
          // Closer dates get higher scores (max 5 bonus points)
          const dateScore = Math.max(0, 5 - daysDiff / 30);
          score += dateScore;
        }
        
        return { post, score };
      });
      
      // Sort by score descending, then by date descending
      scoredPosts.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return new Date(b.post.date) - new Date(a.post.date);
      });
      
      // Return top N posts
      return scoredPosts.slice(0, maxRelatedPosts).map(sp => sp.post);
    }
    
    function formatDate(d) {
      if (!d) return '';
      try {
        const dt = new Date(d);
        if (isNaN(dt)) return d;
        const year = dt.getFullYear();
        const month = String(dt.getMonth() + 1).padStart(2, '0');
        const day = String(dt.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
      } catch (e) {
        return d;
      }
    }
    
    function renderRelatedPosts(posts) {
      if (!posts || posts.length === 0) {
        relatedPostsContainer.innerHTML = '<div class="muted">関連記事が見つかりません。</div>';
        return;
      }
      
      const html = posts
        .map((p) => {
          const rawTitle = p.title || `Post ${p.id}`;
          const title = rawTitle.replace(/ - レイミーの秘密基地$/, '');
          const summary = p.summary || '';
          const href = `https://raymee675.github.io/Raymee-s-Secret-Base/${p.path}`;
          
          return `
            <article class="blog-item">
              <div class="blog-item-layout">
                <div class="blog-item-left">
                  <div class="blog-item-title">
                    <h3><a href="${href}">${escapeHtml(title)}</a></h3>
                  </div>
                  <div class="blog-item-date">
                    ${escapeHtml(formatDate(p.date))}
                  </div>
                </div>
                <div class="blog-item-separator"></div>
                <div class="blog-item-right">
                  <div class="blog-item-summary">
                    ${escapeHtml(summary)}
                  </div>
                </div>
              </div>
            </article>
          `;
        })
        .join('\n');
      
      relatedPostsContainer.innerHTML = html;
    }
    
    // Load and display related posts
    fetchJson(cdnPostsPath)
      .then((meta) => {
        const allPosts = (meta && meta.posts) || [];
        const relatedPosts = findRelatedPosts(allPosts, currentTags, currentPath);
        renderRelatedPosts(relatedPosts);
      })
      .catch((err) => {
        const msg = document.createElement('div');
        msg.className = 'muted';
        msg.textContent = '関連記事を読み込めませんでした。';
        relatedPostsContainer.innerHTML = '';
        relatedPostsContainer.appendChild(msg);
        console.error(err);
      });
  }
});
