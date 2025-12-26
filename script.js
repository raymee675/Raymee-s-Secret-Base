document.addEventListener("DOMContentLoaded", function () {
  const sidebar = document.getElementById("sidebar");
  const toggle = document.getElementById("sidebarToggle");
  const menuItems = document.querySelectorAll("#menuList .menu-item");
  const contentArea = document.getElementById("contentArea");

  if (!sidebar || !toggle || !contentArea) return;

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
      const content =
        item.dataset.content || "Selected: " + item.textContent.trim();
      contentArea.innerHTML =
        '<div class="card"><div class="card-header"><div class="card-title">' +
        item.textContent.trim() +
        '</div></div><div class="card-sub">' +
        content +
        "</div></div>";
    });
  });

  // Activate first menu item by default
  const first = document.querySelector("#menuList .menu-item");
  if (first) first.click();
});
