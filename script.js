document.addEventListener("DOMContentLoaded", function () {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebarToggle");
  const menuItems = document.querySelectorAll("#menuList .menu-item");

  if (!sidebar || !toggle) return;

  // restore collapsed state (guard against storage being blocked by tracking prevention)
  const sidebarStorageKey = "sidebarCollapsed";
  try {
    if (localStorage.getItem(sidebarStorageKey) === "true") {
      sidebar.classList.add("collapsed");
    }
  } catch (e) {
    // ignore storage access errors
  }

  toggle.addEventListener("click", function () {
    sidebar.classList.toggle("collapsed");
    try {
      localStorage.setItem(
        sidebarStorageKey,
        sidebar.classList.contains("collapsed")
      );
    } catch (e) {
      // ignore storage access errors
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
          const href = p.path || (`data/BlogData/${p.id}/index.html`);

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
});
