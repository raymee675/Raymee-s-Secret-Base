document.addEventListener("DOMContentLoaded", function () {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebarToggle");
  const menuItems = document.querySelectorAll("#menuList .menu-item");

  if (!sidebar || !toggle) return;

  // restore collapsed state
  if (localStorage.getItem("sidebarCollapsed") === "true")
    sidebar.classList.add("collapsed");

  toggle.addEventListener("click", function () {
    sidebar.classList.toggle("collapsed");
    localStorage.setItem(
      "sidebarCollapsed",
      sidebar.classList.contains("collapsed")
    );
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

  // Activate first menu item by default (without clicking)
  const first = document.querySelector("#menuList .menu-item");
  if (first) first.classList.add("active");

  // Fetch and render posts list
  const blogListContainer = document.querySelector('.blog-list-items');
  const loadMoreButton = document.getElementById('loadMoreButton');
  const paginationInfo = document.getElementById('paginationInfo');
  
  if (blogListContainer) {
    let allPosts = [];
    let currentPage = 0;
    const postsPerPage = 20;

    fetch('data/BlogData/posts.json')
      .then((res) => {
        if (!res.ok) throw new Error('posts.json not found');
        return res.json();
      })
      .then((meta) => {
        allPosts = meta.posts || [];
        if (allPosts.length === 0) {
          blogListContainer.innerHTML = '<div class="muted">投稿が見つかりません。</div>';
          return;
        }
        // sort by id desc (newest first)
        allPosts.sort((a, b) => (b.id || 0) - (a.id || 0));
        
        // Initial render of first page
        renderPage(0);
      })
      .catch((err) => {
        blogListContainer.innerHTML = '<div class="muted">投稿一覧を読み込めませんでした。</div>';
        console.error(err);
      });

    function renderPage(pageNum) {
      const startIdx = pageNum * postsPerPage;
      const endIdx = startIdx + postsPerPage;
      const postsToShow = allPosts.slice(startIdx, endIdx);
      
      const html = postsToShow
        .map((p) => {
          const title = p.title || `Post ${p.id}`;
          const summary = p.summary || '';
          const href = p.path || (`data/BlogData/${p.id}/index.html`);
          const tags = Array.isArray(p.tags) ? p.tags.join(' ') : '';
          return `
            <article class="blog-item">
              <h3 class="blog-item-title"><a href="${href}">${escapeHtml(title)}</a></h3>
              <div class="blog-item-meta small muted">ID: ${p.id} ${tags ? ' | tags: ' + escapeHtml(tags) : ''}</div>
              <p class="blog-item-summary">${escapeHtml(summary)}</p>
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
      const totalShown = Math.min((pageNum + 1) * postsPerPage, allPosts.length);
      paginationInfo.textContent = `表示中: ${totalShown} / ${allPosts.length}`;
      
      // Show/hide load more button
      if (endIdx < allPosts.length) {
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
