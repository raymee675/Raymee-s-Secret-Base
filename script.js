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

    // Try loading posts.json from local first, but when running as file://
    // prefer CDN. If the primary source fails, fall back to the alternative.
    const cdnBase = 'https://cdn.jsdelivr.net/gh/raymee675/Raymee-s-Secret-Base@latest';
    const cdnPostsPath = `${cdnBase}/data/BlogData/posts.json`;

    // If opened via file://, prefer CDN to avoid local path issues in some setups
    let primaryUrl = cdnPostsPath;

    function fetchJson(url) {
      return fetch(url, { cache: 'no-store' }).then((res) => {
        if (!res.ok) throw new Error(`fetch failed: ${url} (${res.status})`);
        return res.json();
      });
    }

    fetchJson(primaryUrl)
      .catch((err) => {
        throw err;
      })
      .then((meta) => {
        allPosts = (meta && meta.posts) || [];
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
        const msg = document.createElement('div');
        msg.className = 'muted';
        msg.style.whiteSpace = 'pre-wrap';
        msg.textContent = '投稿一覧を読み込めませんでした。\n参照したURL:\n' + primaryUrl + (fallbackUrl && fallbackUrl !== primaryUrl ? '\n' + fallbackUrl : '') + '\n\n詳細: ' + (err && err.message ? err.message : String(err));
        blogListContainer.innerHTML = '';
        blogListContainer.appendChild(msg);
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
            <article class="blog-item" style="padding:16px;border-bottom:1px solid #eee;margin-bottom:12px;background:rgba(255,255,255,0.02);border-radius:8px;">
              <div style="margin-bottom:8px;">
                <div class="blog-item-title">
                  <h3 style="margin:0;font-size:1.05em;"><a href="${href}">${escapeHtml(title)}</a></h3>
                </div>
              </div>
              <div class="blog-item-separator" style="border-top:1px solid #555;margin:8px 0;"></div>
              <div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:8px;">
                <div class="blog-item-summary" style="flex:1;color:var(--muted-color,#999);">
                  ${escapeHtml(summary)}
                </div>
              </div>
              <div class="blog-item-date small muted" style="color:var(--muted-color,#999);font-size:0.9em;">
                ${escapeHtml(formatDate(p.date))}
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
