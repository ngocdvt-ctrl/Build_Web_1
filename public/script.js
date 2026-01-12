// public/script.js
// Vai trò: xử lý UI + điều hướng cho trang public (index.html)
// + Session-aware header (ログイン ↔ マイページ + hover ログアウト)
// Không chứa logic đăng nhập/đăng ký (thực thi auth ở backend + cookie)

document.addEventListener("DOMContentLoaded", () => {
  // ==============================
  // Public buttons (nếu có trên trang)
  // ==============================
  const registerBtn = document.querySelector(".btn-register");
  const loginBtn = document.querySelector(".btn-login");

  // Register → sang trang đăng ký
  registerBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "register.html";
  });

  // Login → sang trang đăng nhập
  loginBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    window.location.href = "login.html";
  });

  // ==============================
  // Header auth state (index)
  // ==============================
  initHeaderAuth();
});

// ==============================
// Header auth state (index page)
// - /api/me 200 => logged in => show マイページ + enable hover logout
// - else => show ログイン
// ==============================
async function initHeaderAuth() {
  const slot = document.getElementById("header-auth-slot");
  if (!slot) return; // page không có header auth

  const menu = document.getElementById("auth-menu");
  const mainBtn = document.getElementById("auth-main-btn");

  // Nếu HTML bị thiếu 1 phần, vẫn show slot để không "mất nút"
  if (!menu || !mainBtn) {
    slot.style.visibility = "visible";
    return;
  }

  try {
    const res = await fetch("/api/me", {
      method: "GET",
      credentials: "include",
      cache: "no-store", // tránh cache (nhất là khi vừa logout/login)
    });

    if (res.ok) {
      mainBtn.textContent = "マイページ";
      mainBtn.href = "dashboard.html";
      menu.classList.add("is-logged-in");
    } else {
      mainBtn.textContent = "ログイン";
      mainBtn.href = "login.html";
      menu.classList.remove("is-logged-in");
    }
  } catch (e) {
    // Network fallback -> treat as logged out
    mainBtn.textContent = "ログイン";
    mainBtn.href = "login.html";
    menu.classList.remove("is-logged-in");
  } finally {
    // prevent flicker
    slot.style.visibility = "visible";
  }
}

// ==============================
// Logout from index dropdown
// (called by onclick in index.html)
// ==============================
async function logoutFromIndex() {
  try {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch (e) {
    console.error("Logout failed:", e);
  } finally {
    // replace để tránh back quay lại trạng thái cũ
    location.replace("index.html");
  }
}
