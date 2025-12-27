// @ts-nocheck
document.addEventListener('DOMContentLoaded', () => {
    const registerBtn = document.querySelector('.btn-register');
    const loginBtn = document.querySelector('.btn-login');
    const idInput = document.getElementById('username');
    const passInput = document.getElementById('password');

    registerBtn?.addEventListener('click', async () => {
        const username = idInput.value;
        const password = passInput.value;
        const response = await fetch('/api/server', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'register', username, password }),
        });
        const result = await response.json();
        alert(response.ok ? result.message : 'Error: ' + result.error);
    });

    loginBtn?.addEventListener('click', async () => {
        const username = idInput.value;
        const password = passInput.value;
        const response = await fetch('/api/server', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'login', username, password })
        });
        if (response.ok) {
            window.location.href = 'member.html';
        } else {
            const result = await response.json();
            alert('Lỗi: ' + result.error);
        }
    });
});