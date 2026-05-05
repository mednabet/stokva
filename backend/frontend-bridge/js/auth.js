/* ============================================================
 * STOKVA — Module Auth (frontend)
 * by NETPROCESS
 * ============================================================
 * Gère la page de login, le redirect si non authentifié,
 * et le logout. À inclure sur toutes les pages.
 * ============================================================ */

(function (global) {
    'use strict';

    if (!global.STOKVA) {
        console.error('[Auth] api-client.js doit être chargé avant auth.js');
        return;
    }

    const API_BASE = global.STOKVA_API_BASE || window.location.origin;
    STOKVA.init(API_BASE);

    const Auth = {
        /**
         * Vérifie l'authentification au chargement d'une page.
         * Redirige vers loginUrl si non connecté.
         */
        async guard(loginUrl) {
            loginUrl = loginUrl || 'login.html';
            if (!STOKVA.isAuthenticated()) {
                window.location.href = loginUrl;
                return false;
            }
            try {
                await STOKVA.me();
                STOKVA.connectWS();
                return true;
            } catch (err) {
                if (err.status === 401) {
                    await STOKVA.logout();
                    window.location.href = loginUrl;
                    return false;
                }
                throw err;
            }
        },

        /**
         * Branche un formulaire de login.
         * Le formulaire doit avoir des inputs name="username" et name="password".
         */
        bindLoginForm(formSelector, redirectUrl) {
            redirectUrl = redirectUrl || 'index.html';
            const form = document.querySelector(formSelector);
            if (!form) return;

            form.addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const username = form.querySelector('[name=username]').value.trim();
                const password = form.querySelector('[name=password]').value;
                const errEl = form.querySelector('.error-message');
                if (errEl) errEl.textContent = '';

                try {
                    const user = await STOKVA.login(username, password);
                    console.log('[Auth] Connecté :', user.username, '(' + user.role + ')');
                    window.location.href = redirectUrl;
                } catch (err) {
                    if (errEl) {
                        errEl.textContent = err.message || 'Erreur de connexion';
                    } else {
                        alert(err.message || 'Erreur de connexion');
                    }
                }
            });
        },

        async logout(redirectUrl) {
            await STOKVA.logout();
            window.location.href = redirectUrl || 'login.html';
        },

        currentUser() {
            return STOKVA.currentUser();
        },

        hasRole(...roles) {
            const u = STOKVA.currentUser();
            return u && roles.includes(u.role);
        },

        /**
         * Affiche / masque des éléments selon le rôle.
         * Utilisez data-role="admin,responsable" sur vos éléments HTML.
         */
        applyRBAC() {
            const user = STOKVA.currentUser();
            if (!user) return;
            document.querySelectorAll('[data-role]').forEach((el) => {
                const allowed = el.dataset.role.split(',').map((s) => s.trim());
                if (!allowed.includes(user.role)) {
                    el.style.display = 'none';
                }
            });
        },
    };

    global.Auth = Auth;
})(window);
