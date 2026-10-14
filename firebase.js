// Config is injected at deploy time (GitHub Secrets -> firebase-config.js)
// and never committed. Locally, copy firebase-config.example.js to
// firebase-config.js. Empty fallback = cloud sync stays disabled, app works offline.
const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
    apiKey: '',
    authDomain: '',
    databaseURL: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: ''
};

let firebaseInitialized = false;
let authed = false;
let currentUser = null;
let dbRef = null;
let pendingInitialRestore = false;
let authListenerActive = false;

function getDeviceId() {
    let id = localStorage.getItem('rb_device_id');
    if (!id) {
        id = 'dev_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
        localStorage.setItem('rb_device_id', id);
    }
    return id;
}

function setCloudStatus(msg, cls) {
    const els = [document.getElementById('cloud-status'), document.getElementById('cloud-status-page')];
    els.forEach(el => {
        if (el) {
            el.textContent = msg;
            el.className = 'cloud-status' + (cls ? ' ' + cls : '');
        }
    });
    const signinBtn = document.getElementById('btn-cloud-signin');
    const signoutBtn = document.getElementById('btn-cloud-signout');
    if (signinBtn) signinBtn.style.display = authed ? 'none' : 'block';
    if (signoutBtn) signoutBtn.style.display = authed ? 'block' : 'none';
}

// Catches malformed injected config (e.g. a secret pasted as "key: 'value'"
// instead of just the value) so the status says what's actually wrong.
function configLooksValid(cfg) {
    const fields = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    return fields.every(k => {
        const v = cfg[k];
        return typeof v === 'string' && v.length > 0 && v.indexOf('\n') === -1 && v.indexOf("'") === -1;
    });
}

function initFirebase() {
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.databaseURL) {
        setCloudStatus('Cloud sync not configured', 'error');
        return false;
    }
    if (!configLooksValid(FIREBASE_CONFIG)) {
        setCloudStatus('Cloud config invalid — check the deployed firebase-config.js / GitHub Secrets', 'error');
        console.warn('Firebase config values look malformed:', FIREBASE_CONFIG);
        return false;
    }
    try {
        firebase.initializeApp(FIREBASE_CONFIG);
        firebaseInitialized = true;
        return true;
    } catch (e) {
        if (e.code !== 'app/duplicate-app') {
            setCloudStatus('Cloud config error', 'error');
            console.warn('Firebase init failed:', e);
            return false;
        }
        firebaseInitialized = true;
        return true;
    }
}

function attachAuthListener() {
    if (!firebaseInitialized || authListenerActive) return;
    authListenerActive = true;

    firebase.auth().onAuthStateChanged((user) => {
        currentUser = user;
        authed = !!user;
        if (authed) {
            setCloudStatus('☁️ Cloud synced as: ' + user.email, 'online');
            dbRef = firebase.app().database().ref('restrobooks/' + user.uid);
            restoreFromCloud();
        } else {
            setCloudStatus('Not signed in — data stays on this device only', '');
            dbRef = null;
        }
    });

    // One-time cleanup: remove any password saved by older versions.
    try { localStorage.removeItem('rb_cloud_pass'); } catch (e) {}
    // Firebase Auth persists the session itself (IndexedDB); no password storage needed.
}

function uploadNow() {
    if (!authed || !dbRef) return;
    try {
        const payload = { ...DB };
        payload.updatedAt = Date.now();
        dbRef.set(payload)
            .then(() => setCloudStatus('☁️ Cloud synced as: ' + (currentUser ? currentUser.email : ''), 'online'))
            .catch((err) => {
                console.warn('Cloud upload failed:', err);
                setCloudStatus('Sync error — offline?', 'error');
            });
    } catch (e) {
        console.warn('Cloud upload failed:', e);
        setCloudStatus('Sync error', 'error');
    }
}

function restoreFromCloud() {
    if (!authed || !dbRef) return;
    pendingInitialRestore = true;
    // Don't leave the user staring at "Signing in..." on a slow connection:
    // after 12s show on-device data state, then catch up silently when it arrives.
    let slow = false;
    const slowTimer = setTimeout(() => {
        slow = true;
        setCloudStatus('Still connecting to cloud — showing your on-device data…', '');
        if (typeof showToast === 'function') showToast('Slow connection — showing on-device data, cloud will catch up', 'error', 4500);
    }, 12000);
    const done = () => { clearTimeout(slowTimer); pendingInitialRestore = false; };
    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const elapsed = () => (((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t1) / 1000).toFixed(1);
    dbRef.once('value').then((snap) => {
        done();
        const remote = snap.val();
        if (!remote) {
            uploadNow();
            return;
        }
        const localMtime = window.__rb_lastLocalWrite || 0;
        if (remote.updatedAt && remote.updatedAt >= localMtime) {
            try {
                delete remote.updatedAt;
                const remoteSettings = remote.settings || {};
                delete remote.settings;
                DB = { ...DB, ...remote, settings: { ...(DB.settings || {}), ...remoteSettings } };
                saveDataLocalOnly();
                if (typeof applyBranding === 'function') applyBranding();
                if (typeof loadSettings === 'function') loadSettings();
                renderCurrentPage(document.querySelector('.nav-btn.active')?.dataset.page || 'dashboard');
                try {
                    const kb = Math.max(1, Math.round(JSON.stringify(remote).length / 1024));
                    const info = elapsed() + 's • ' + kb + ' KB';
                    try { localStorage.setItem('rb_last_sync', info); } catch (e) {}
                    setCloudStatus('☁️ Cloud synced as: ' + (currentUser ? currentUser.email : '') + ' (' + info + ')', 'online');
                } catch (e) { /* keep default status */ }
                if (typeof showToast === 'function') {
                    showToast(slow ? '✅ Cloud caught up — latest data is now on this device' : '✅ ☁️ Cloud data loaded — your latest saved data is now on this device', 'success', 4500);
                }
            } catch (err) {
                console.warn('Restore failed', err);
            }
        } else {
            uploadNow();
        }
    }).catch((err) => {
        done();
        if (err && err.code === 'PERMISSION_DENIED') {
            setCloudStatus('Access denied — check Firebase rules', 'error');
        } else {
            setCloudStatus('Cloud unreachable — using on-device data. Pull to retry by signing in again.', 'error');
            console.warn('Cloud restore failed:', err);
        }
    });
}

function migrateLegacyData(userId) {
    const legacyRef = firebase.app().database().ref('restrobooks/' + getDeviceId());
    legacyRef.once('value').then((snap) => {
        const legacy = snap.val();
        if (legacy && legacy.updatedAt) {
            const targetRef = firebase.app().database().ref('restrobooks/' + userId);
            targetRef.set(legacy);
            console.log('Legacy data migrated to new secure location');
        }
    }).catch(() => {});
}

let signUpBusy = false;
// Rejects if the auth request stalls, so the button never stays stuck forever.
function authWithTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject({
            code: 'auth/network-timeout',
            message: 'Request timed out after ' + Math.round(ms / 1000) + 's — check your connection and tap again'
        }), ms))
    ]);
}
window.cloudSignUp = function () {
    if (signUpBusy) return;
    const email = document.getElementById('signup-email').value.trim();
    const pass = document.getElementById('signup-password').value;
    if (!email || !pass) {
        setCloudStatus('Enter email and password to sign up', 'error');
        return;
    }
    if (pass.length < 6) {
        setCloudStatus('Password must be at least 6 characters', 'error');
        return;
    }
    if (!firebaseInitialized) initFirebase();
    signUpBusy = true;
    const btn = document.getElementById('btn-cloud-signup');
    const origBtn = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account…';
    }
    setCloudStatus('Creating account...', '');
    const release = () => {
        signUpBusy = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origBtn;
        }
    };
    authWithTimeout(firebase.auth().createUserWithEmailAndPassword(email, pass), 30000)
        .then((cred) => {
            try {
                // Email only for convenience — never store the password.
                localStorage.setItem('rb_cloud_email', email);
                localStorage.removeItem('rb_cloud_pass');
            } catch (e) {}
            document.getElementById('signup-password').value = '';
            const cloudPass = document.getElementById('cloud-password');
            if (cloudPass) cloudPass.value = '';
            setCloudStatus('☁️ Cloud synced as: ' + cred.user.email, 'online');
            // Push this device's existing data to the brand-new account,
            // so previous entries appear under the new login.
            uploadNow();
            if (typeof showToast === 'function') showToast('✅ Account created — your existing data is now saved to your new account', 'success', 4500);
        })
        .catch((err) => {
            let msg = err.message;
            if (err.code === 'auth/email-already-in-use') msg = 'Account already exists — sign in above instead';
            else if (err.code === 'auth/weak-password') msg = 'Password too weak — use at least 6 characters';
            else if (err.code === 'auth/invalid-email') msg = 'That email address looks invalid';
            else if (err.code === 'auth/operation-not-allowed') msg = 'Sign-up is disabled — enable Email/Password in Firebase Console → Authentication → Sign-in method';
            setCloudStatus('Sign-up failed: ' + msg, 'error');
            if (typeof showToast === 'function') showToast('Sign-up failed: ' + msg, 'error', 4500);
        })
        .finally(release);
};

let signInBusy = false;
window.cloudSignIn = function () {
    if (signInBusy) return;
    const email = document.getElementById('cloud-email').value.trim();
    const pass = document.getElementById('cloud-password').value;
    if (!email || !pass) {
        setCloudStatus('Enter email and password', 'error');
        return;
    }
    if (!firebaseInitialized) initFirebase();
    signInBusy = true;
    const btn = document.getElementById('btn-cloud-signin');
    const origBtn = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing in…';
    }
    setCloudStatus('Signing in...', '');
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    // If auth itself stalls (very slow network), say so instead of hanging silently.
    const authTimer = setTimeout(() => {
        if (signInBusy && !authed && typeof showToast === 'function') {
            showToast('Still trying to sign in — check your connection…', 'error', 4000);
        }
    }, 20000);
    const release = () => {
        clearTimeout(authTimer);
        signInBusy = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = origBtn;
        }
    };
    authWithTimeout(firebase.auth().signInWithEmailAndPassword(email, pass), 30000)
        .then((cred) => {
            try {
                // Email only (for convenience). Never store the password —
                // Firebase Auth persists the session securely itself.
                localStorage.setItem('rb_cloud_email', email);
                localStorage.removeItem('rb_cloud_pass');
            } catch (e) {}
            document.getElementById('cloud-password').value = '';
            const authSec = (((typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) - t0) / 1000).toFixed(1);
            setCloudStatus('☁️ Cloud synced as: ' + cred.user.email + ' (signed in ' + authSec + 's, loading data…)', 'online');
            if (typeof showToast === 'function') showToast('✅ Signed in in ' + authSec + 's — loading cloud data…', 'success', 4000);
            try {
                // One-time legacy migration; skip on later sign-ins to keep them fast.
                if (!localStorage.getItem('rb_migrated')) {
                    migrateLegacyData(cred.user.uid);
                    localStorage.setItem('rb_migrated', '1');
                }
            } catch (e) {
                migrateLegacyData(cred.user.uid);
            }
        })
        .catch((err) => {
            setCloudStatus('Sign-in failed: ' + err.message, 'error');
            if (typeof showToast === 'function') showToast('Sign-in failed: ' + err.message, 'error', 4500);
        })
        .finally(release);
};

window.cloudSignOut = function () {
    if (firebaseInitialized) {
        firebase.auth().signOut().catch(() => {});
    }
    localStorage.removeItem('rb_cloud_email');
    localStorage.removeItem('rb_cloud_pass');
    authed = false;
    currentUser = null;
    dbRef = null;
    setCloudStatus('Not signed in — data stays on this device only', '');
};

function updateCloudUI() {
    try {
        const email = localStorage.getItem('rb_cloud_email');
        const emailEl = document.getElementById('cloud-email');
        if (email && emailEl && !emailEl.value) emailEl.value = email;
        // Never refill the password field.
        const passEl = document.getElementById('cloud-password');
        if (passEl && passEl.value && !authed) passEl.value = '';
    } catch (e) {}
    setCloudStatus(authed && currentUser ? ('☁️ Cloud synced as: ' + currentUser.email) : 'Not signed in — data stays on this device only', authed ? 'online' : '');
}

window.__cloud = {
    init: initFirebase,
    upload: uploadNow,
    hasCloud: () => firebaseInitialized && authed,
    updateUI: updateCloudUI
};

document.addEventListener('DOMContentLoaded', () => {
    if (FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL) {
        if (initFirebase()) {
            attachAuthListener();
            setTimeout(updateCloudUI, 100);
        }
    }
});