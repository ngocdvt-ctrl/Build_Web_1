/**
 * フロントエンドのメインロジック
 * 会員登録機能の処理
 */
document.addEventListener('DOMContentLoaded', () => {
    // HTML要素の取得
    const registerBtn = document.querySelector('.btn-register') as HTMLButtonElement;
    const idInput = document.getElementById('username') as HTMLInputElement;
    const passInput = document.getElementById('password') as HTMLInputElement;

    // 登録ボタンのクリックイベント
    registerBtn?.addEventListener('click', async () => {
        const username = idInput.value;
        const password = passInput.value;

        // 入力値のバリデーション
        if (!username || !password) {
            alert('IDとパスワードを入力してください。');
            return;
        }

        try {
            // バックエンドAPI (api/server.ts) へデータを送信
            const response = await fetch('/api/server', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            // レスポンスの解析
            const result = await response.json();

            if (response.ok) {
                // 登録成功時の処理
                alert(result.message);
                
                // 入力フィールドをクリア
                idInput.value = '';
                passInput.value = '';
            } else {
                // サーバー側でエラーが発生した場合 (ID重複など)
                alert('エラー: ' + result.error);
            }
        } catch (error) {
            // ネットワークエラーなどの処理
            console.error('Fetch error:', error);
            alert('サーバーに接続できませんでした。ネットワーク設定を確認してください。');
        }
    });
    // Thêm xử lý cho nút Login
const loginBtn = document.querySelector('.btn-login') as HTMLButtonElement;

loginBtn?.addEventListener('click', async () => {
    const username = idInput.value;
    const password = passInput.value;

    const response = await fetch('/api/server', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', username, password }) // Gửi action: 'login'
    });

    const result = await response.json();
    if (response.ok) {
        alert(result.message); // "ログインに成功しました！"
        // Sau này bạn có thể chuyển hướng trang tại đây: window.location.href = "/dashboard.html";
    } else {
        alert("エラー: " + result.error);
    }
});
});