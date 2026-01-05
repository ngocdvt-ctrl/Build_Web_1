// public/script.js
// Vai trò: xử lý UI + điều hướng cho trang public (index.html)
// KHÔNG chứa logic auth

document.addEventListener("DOMContentLoaded", () => {
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
});
