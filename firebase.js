const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyAR8xe38iJHmTIq3dXmsSJBpO62_KF_eO8',
    authDomain: 'restrobooks-7129c.firebaseapp.com',
    databaseURL: 'https://restrobooks-7129c-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'restrobooks-7129c',
    storageBucket: 'restrobooks-7129c.firebasestorage.app',
    messagingSenderId: '1091090566420',
    appId: '1:1091090566420:web:99a6f0e4a80adc60610601'
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

function initFirebase() {
    if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.databaseURL) {
        setCloudStatus('Cloud sync not configured', 'error');
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

    const savedEmail = localStorage.getItem('rb_cloud_email');
    const savedPass = localStorage.getItem('rb_cloud_pass');
    if (savedEmail && savedPass) {
        firebase.auth().signInWithEmailAndPassword(savedEmail, savedPass)
            .catch((err) => {
                setCloudStatus('Sign-in failed: ' + err.message, 'error');
            });
    }
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
    dbRef.once('value').then((snap) => {
        pendingInitialRestore = false;
        const remote = snap.val();
        if (!remote) {
            uploadNow();
            return;
        }
        const localMtime = window.__rb_lastLocalWrite || 0;
        if (remote.updatedAt && remote.updatedAt >= localMtime) {
            try {
                delete remote.updatedAt;
                DB = { ...DB, ...remote };
                saveDataLocalOnly();
                renderCurrentPage(document.querySelector('.nav-btn.active')?.dataset.page || 'dashboard');
                if (typeof showToast === 'function') showToast('☁️ Cloud data loaded');
            } catch (err) {
                console.warn('Restore failed', err);
            }
        } else {
            uploadNow();
        }
    }).catch((err) => {
        pendingInitialRestore = false;
        if (err && err.code === 'PERMISSION_DENIED') {
            setCloudStatus('Access denied — check Firebase rules', 'error');
        } else {
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

window.cloudSignIn = function () {
    const email = document.getElementById('cloud-email').value.trim();
    const pass = document.getElementById('cloud-password').value;
    if (!email || !pass) {
        setCloudStatus('Enter email and password', 'error');
        return;
    }
    if (!firebaseInitialized) initFirebase();
    setCloudStatus('Signing in...', '');
    firebase.auth().signInWithEmailAndPassword(email, pass)
        .then((cred) => {
            localStorage.setItem('rb_cloud_email', email);
            localStorage.setItem('rb_cloud_pass', pass);
            setCloudStatus('☁️ Cloud synced as: ' + cred.user.email, 'online');
            migrateLegacyData(cred.user.uid);
        })
        .catch((err) => {
            setCloudStatus('Sign-in failed: ' + err.message, 'error');
        });
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
    const email = localStorage.getItem('rb_cloud_email');
    if (email) {
        document.getElementById('cloud-email').value = email;
        document.getElementById('cloud-password').value = localStorage.getItem('rb_cloud_pass') || '';
    }
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