let DB = {
    income: [],
    expenses: [],
    inventory: [],
    staff: [],
    shifts: [],
    settings: {
        name: 'My Restaurant',
        currency: 'KSh',
        taxRate: 0,
        lowStockThreshold: 5
    }
};

function loadData() {
    const saved = localStorage.getItem('restrobooks');
    if (saved) {
        const parsed = JSON.parse(saved);
        DB = { ...DB, ...parsed };
        if (parsed.settings && parsed.settings.currency === '$') {
            DB.settings.currency = 'KSh';
            saveData();
        }
    }
    loadSettings();
}

function saveData() {
    localStorage.setItem('restrobooks', JSON.stringify(DB));
    window.__rb_lastLocalWrite = Date.now();
    if (window.__cloud && window.__cloud.hasCloud()) {
        window.__cloud.upload();
    }
}

function saveDataLocalOnly() {
    localStorage.setItem('restrobooks', JSON.stringify(DB));
    window.__rb_lastLocalWrite = Date.now();
}

function loadSettings() {
    document.getElementById('settings-name').value = DB.settings.name;
    document.getElementById('settings-currency').value = DB.settings.currency;
    const sel = document.getElementById('settings-currency-select');
    if (sel) {
        const options = Array.from(sel.options).map(o => o.value);
        sel.value = options.includes(DB.settings.currency) ? DB.settings.currency : '';
    }
    document.getElementById('settings-tax').value = DB.settings.taxRate;
    document.getElementById('settings-lowstock').value = DB.settings.lowStockThreshold;
}

function saveSettings() {
    DB.settings.name = document.getElementById('settings-name').value;
    DB.settings.currency = document.getElementById('settings-currency').value;
    DB.settings.taxRate = parseFloat(document.getElementById('settings-tax').value) || 0;
    DB.settings.lowStockThreshold = parseInt(document.getElementById('settings-lowstock').value) || 5;
    saveData();
    hideModal('settings-modal');
    showToast('Settings saved!');
    renderDashboard();
}

function clearAllData() {
    if (confirm('Are you sure? This will delete ALL data permanently!')) {
        localStorage.removeItem('restrobooks');
        location.reload();
    }
}

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

function fmt(amount) {
    return DB.settings.currency + parseFloat(amount).toFixed(2);
}

function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function today() {
    return new Date().toISOString().split('T')[0];
}

function isToday(dateStr) {
    return dateStr === today();
}

function isThisWeek(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end;
}

function isThisMonth(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function isLastMonth(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === last.getMonth() && d.getFullYear() === last.getFullYear();
}

function getDateRange() {
    const from = document.getElementById('report-from').value;
    const to = document.getElementById('report-to').value;
    return { from: from || '2000-01-01', to: to || '2099-12-31' };
}

function inRange(dateStr, from, to) {
    return dateStr >= from && dateStr <= to;
}

// Navigation
document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        navigateTo(page);
    });
});

function navigateTo(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    document.querySelector(`[data-page="${page}"]`).classList.add('active');
    const titles = { dashboard: 'Dashboard', income: 'Income', expenses: 'Expenses', inventory: 'Inventory', payroll: 'Payroll', reports: 'Reports' };
    document.getElementById('page-title').textContent = titles[page] || page;

    if (page === 'payroll') {
        updateShiftStaffDropdown();
    }
    if (page === 'reports') {
        initReportDates();
    }
    renderCurrentPage(page);
}

function renderCurrentPage(page) {
    switch(page) {
        case 'dashboard': renderDashboard(); break;
        case 'income': renderIncome(); break;
        case 'expenses': renderExpenses(); break;
        case 'inventory': renderInventory(); break;
        case 'payroll': renderPayroll(); break;
        case 'reports': renderReport(); break;
    }
}

// Modals
function showModal(id) {
    document.getElementById(id).classList.add('active');
    if (id === 'income-modal') document.getElementById('income-date').value = today();
    if (id === 'expense-modal') document.getElementById('expense-date').value = today();
    if (id === 'shift-modal') {
        updateShiftStaffDropdown();
        document.getElementById('shift-date').value = today();
    }
}

function hideModal(id) {
    document.getElementById(id).classList.remove('active');
}

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
});

// Toast
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== DASHBOARD =====
function renderDashboard() {
    const todayIncome = DB.income.filter(i => isToday(i.date)).reduce((s, i) => s + i.amount, 0);
    const todayExpenses = DB.expenses.filter(e => isToday(e.date)).reduce((s, e) => s + e.amount, 0);
    const todayProfit = todayIncome - todayExpenses;
    const lowStock = DB.inventory.filter(i => i.qty <= (DB.settings.lowStockThreshold || 5));

    document.getElementById('today-income').textContent = fmt(todayIncome);
    document.getElementById('today-expenses').textContent = fmt(todayExpenses);
    document.getElementById('today-profit').textContent = fmt(todayProfit);
    document.getElementById('low-stock-count').textContent = lowStock.length;

    document.getElementById('today-profit').style.color = todayProfit >= 0 ? 'var(--green)' : 'var(--red)';

    renderWeeklyChart();

    const allTransactions = [
        ...DB.income.map(i => ({ ...i, type: 'income' })),
        ...DB.expenses.map(e => ({ ...e, type: 'expense' }))
    ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);

    const container = document.getElementById('recent-transactions');
    if (allTransactions.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-receipt"></i><p>No transactions yet</p></div>';
        return;
    }

    container.innerHTML = allTransactions.map(t => `
        <div class="transaction-item">
            <div class="transaction-left">
                <div class="transaction-icon ${t.type}">
                    <i class="fas fa-${t.type === 'income' ? 'arrow-down' : 'arrow-up'}"></i>
                </div>
                <div class="transaction-details">
                    <span class="transaction-desc">${t.desc || t.category}</span>
                    <span class="transaction-meta">${t.category} &bull; ${formatDate(t.date)}</span>
                </div>
            </div>
            <div class="transaction-right">
                <span class="transaction-amount ${t.type === 'income' ? 'positive' : 'negative'}">
                    ${t.type === 'income' ? '+' : '-'}${fmt(t.amount)}
                </span>
            </div>
        </div>
    `).join('');
}

function renderWeeklyChart() {
    const canvas = document.getElementById('weekly-chart');
    const ctx = canvas.getContext('2d');
    const w = canvas.width = canvas.parentElement.clientWidth - 32;
    const h = 200;
    canvas.height = h;

    ctx.clearRect(0, 0, w, h);

    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const inc = DB.income.filter(x => x.date === dateStr).reduce((s, x) => s + x.amount, 0);
        const exp = DB.expenses.filter(x => x.date === dateStr).reduce((s, x) => s + x.amount, 0);
        days.push({
            label: d.toLocaleDateString('en-US', { weekday: 'short' }),
            income: inc,
            expense: exp
        });
    }

    const maxVal = Math.max(...days.map(d => Math.max(d.income, d.expense)), 1);
    const barWidth = (w - 40) / 7 * 0.35;
    const chartH = h - 40;

    ctx.fillStyle = '#8892a4';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';

    days.forEach((d, i) => {
        const x = 30 + i * ((w - 40) / 7);
        const incH = (d.income / maxVal) * chartH;
        const expH = (d.expense / maxVal) * chartH;

        ctx.fillStyle = '#2ecc71';
        ctx.fillRect(x, h - 20 - incH, barWidth, incH);

        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(x + barWidth + 2, h - 20 - expH, barWidth, expH);

        ctx.fillStyle = '#8892a4';
        ctx.fillText(d.label, x + barWidth, h - 5);
    });
}

// ===== INCOME =====
function addIncome(e) {
    e.preventDefault();
    const item = {
        id: genId(),
        amount: parseFloat(document.getElementById('income-amount').value),
        category: document.getElementById('income-category').value,
        desc: document.getElementById('income-desc').value,
        date: document.getElementById('income-date').value
    };
    DB.income.push(item);
    saveData();
    document.getElementById('income-form').reset();
    hideModal('income-modal');
    showToast('Income added!');
    renderIncome();
}

function deleteIncome(id) {
    DB.income = DB.income.filter(i => i.id !== id);
    saveData();
    renderIncome();
    showToast('Income deleted');
}

function renderIncome() {
    const dateFilter = document.getElementById('income-date-filter').value;
    const catFilter = document.getElementById('income-category-filter').value;

    let filtered = DB.income;
    if (dateFilter) filtered = filtered.filter(i => i.date === dateFilter);
    if (catFilter !== 'all') filtered = filtered.filter(i => i.category === catFilter);
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    const total = filtered.reduce((s, i) => s + i.amount, 0);
    document.getElementById('total-income-filtered').textContent = fmt(total);
    document.getElementById('income-count-filtered').textContent = filtered.length;

    const container = document.getElementById('income-list');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-arrow-down"></i><p>No income records</p></div>';
        return;
    }

    container.innerHTML = filtered.map(i => `
        <div class="transaction-item">
            <div class="transaction-left">
                <div class="transaction-icon income">
                    <i class="fas fa-arrow-down"></i>
                </div>
                <div class="transaction-details">
                    <span class="transaction-desc">${i.desc || i.category}</span>
                    <span class="transaction-meta">${i.category} &bull; ${formatDate(i.date)}</span>
                </div>
            </div>
            <div class="transaction-right">
                <span class="transaction-amount positive">+${fmt(i.amount)}</span>
                <button class="transaction-delete" onclick="deleteIncome('${i.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

// ===== EXPENSES =====
function addExpense(e) {
    e.preventDefault();
    const item = {
        id: genId(),
        amount: parseFloat(document.getElementById('expense-amount').value),
        category: document.getElementById('expense-category').value,
        desc: document.getElementById('expense-desc').value,
        date: document.getElementById('expense-date').value,
        payment: document.getElementById('expense-payment').value
    };
    DB.expenses.push(item);
    saveData();
    document.getElementById('expense-form').reset();
    hideModal('expense-modal');
    showToast('Expense added!');
    renderExpenses();
}

function deleteExpense(id) {
    DB.expenses = DB.expenses.filter(e => e.id !== id);
    saveData();
    renderExpenses();
    showToast('Expense deleted');
}

function renderExpenses() {
    const dateFilter = document.getElementById('expense-date-filter').value;
    const catFilter = document.getElementById('expense-category-filter').value;

    let filtered = DB.expenses;
    if (dateFilter) filtered = filtered.filter(e => e.date === dateFilter);
    if (catFilter !== 'all') filtered = filtered.filter(e => e.category === catFilter);
    filtered.sort((a, b) => b.date.localeCompare(a.date));

    const total = filtered.reduce((s, e) => s + e.amount, 0);
    document.getElementById('total-expenses-filtered').textContent = fmt(total);
    document.getElementById('expense-count-filtered').textContent = filtered.length;

    const container = document.getElementById('expense-list');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-arrow-up"></i><p>No expense records</p></div>';
        return;
    }

    container.innerHTML = filtered.map(e => `
        <div class="transaction-item">
            <div class="transaction-left">
                <div class="transaction-icon expense">
                    <i class="fas fa-arrow-up"></i>
                </div>
                <div class="transaction-details">
                    <span class="transaction-desc">${e.desc || e.category}</span>
                    <span class="transaction-meta">${e.category} &bull; ${e.payment} &bull; ${formatDate(e.date)}</span>
                </div>
            </div>
            <div class="transaction-right">
                <span class="transaction-amount negative">-${fmt(e.amount)}</span>
                <button class="transaction-delete" onclick="deleteExpense('${e.id}')">Delete</button>
            </div>
        </div>
    `).join('');
}

// ===== INVENTORY =====
function addInventoryItem(e) {
    e.preventDefault();
    const item = {
        id: genId(),
        name: document.getElementById('inv-name').value,
        category: document.getElementById('inv-category').value,
        qty: parseFloat(document.getElementById('inv-qty').value),
        unit: document.getElementById('inv-unit').value,
        cost: parseFloat(document.getElementById('inv-cost').value),
        minQty: parseFloat(document.getElementById('inv-min').value)
    };
    DB.inventory.push(item);
    saveData();
    document.getElementById('inventory-form').reset();
    hideModal('inventory-modal');
    showToast('Item added!');
    renderInventory();
}

function updateQty(id, delta) {
    const item = DB.inventory.find(i => i.id === id);
    if (item) {
        item.qty = Math.max(0, item.qty + delta);
        saveData();
        renderInventory();
    }
}

function deleteInventoryItem(id) {
    DB.inventory = DB.inventory.filter(i => i.id !== id);
    saveData();
    renderInventory();
    showToast('Item removed');
}

function renderInventory() {
    const search = document.getElementById('inventory-search').value.toLowerCase();
    const catFilter = document.getElementById('inventory-category-filter').value;

    let filtered = DB.inventory;
    if (search) filtered = filtered.filter(i => i.name.toLowerCase().includes(search));
    if (catFilter !== 'all') filtered = filtered.filter(i => i.category === catFilter);

    const container = document.getElementById('inventory-list');
    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-boxes-stacked"></i><p>No inventory items</p></div>';
        return;
    }

    container.innerHTML = filtered.map(i => {
        const isLow = i.qty <= i.minQty;
        return `
            <div class="inventory-item ${isLow ? 'low-stock' : 'in-stock'}">
                <div class="inventory-info">
                    <span class="inventory-name">${i.name}</span>
                    <span class="inventory-meta">${i.category} &bull; ${fmt(i.cost)}/${i.unit}</span>
                    <span class="stock-badge ${isLow ? 'stock-low' : 'stock-ok'}">${isLow ? 'LOW STOCK' : 'In Stock'}</span>
                </div>
                <div class="inventory-qty">
                    <button class="qty-btn" onclick="updateQty('${i.id}', -1)">-</button>
                    <span class="qty-value">${i.qty}</span>
                    <button class="qty-btn" onclick="updateQty('${i.id}', 1)">+</button>
                    <button class="transaction-delete" onclick="deleteInventoryItem('${i.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    }).join('');
}

// ===== PAYROLL =====
function addStaff(e) {
    e.preventDefault();
    const member = {
        id: genId(),
        name: document.getElementById('staff-name').value,
        position: document.getElementById('staff-position').value,
        rate: parseFloat(document.getElementById('staff-rate').value),
        payType: document.getElementById('staff-paytype').value,
        phone: document.getElementById('staff-phone').value
    };
    DB.staff.push(member);
    saveData();
    document.getElementById('staff-form').reset();
    hideModal('staff-modal');
    showToast('Staff member added!');
    renderPayroll();
}

function deleteStaff(id) {
    if (confirm('Remove this staff member and all their shifts?')) {
        DB.staff = DB.staff.filter(s => s.id !== id);
        DB.shifts = DB.shifts.filter(s => s.staffId !== id);
        saveData();
        renderPayroll();
        showToast('Staff removed');
    }
}

function updateShiftStaffDropdown() {
    const select = document.getElementById('shift-staff');
    select.innerHTML = DB.staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    const filterSelect = document.getElementById('payroll-staff-filter');
    filterSelect.innerHTML = '<option value="all">All Staff</option>' +
        DB.staff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

function addShift(e) {
    e.preventDefault();
    const startTime = document.getElementById('shift-start').value;
    const endTime = document.getElementById('shift-end').value;
    const breakMin = parseInt(document.getElementById('shift-break').value) || 0;

    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    let totalMin = (eh * 60 + em) - (sh * 60 + sm) - breakMin;
    if (totalMin < 0) totalMin += 24 * 60;

    const hours = totalMin / 60;

    const shift = {
        id: genId(),
        staffId: document.getElementById('shift-staff').value,
        date: document.getElementById('shift-date').value,
        start: startTime,
        end: endTime,
        break: breakMin,
        hours: hours
    };
    DB.shifts.push(shift);
    saveData();
    document.getElementById('shift-form').reset();
    hideModal('shift-modal');
    showToast('Shift logged!');
    renderPayroll();
}

function deleteShift(id) {
    DB.shifts = DB.shifts.filter(s => s.id !== id);
    saveData();
    renderPayroll();
}

function renderPayroll() {
    const staffFilter = document.getElementById('payroll-staff-filter').value;
    const periodFilter = document.getElementById('payroll-period-filter').value;

    let filteredShifts = DB.shifts;
    if (staffFilter !== 'all') {
        filteredShifts = filteredShifts.filter(s => s.staffId === staffFilter);
    }

    if (periodFilter === 'this-week') {
        filteredShifts = filteredShifts.filter(s => isThisWeek(s.date));
    } else if (periodFilter === 'this-month') {
        filteredShifts = filteredShifts.filter(s => isThisMonth(s.date));
    } else if (periodFilter === 'last-month') {
        filteredShifts = filteredShifts.filter(s => isLastMonth(s.date));
    }

    let totalPayroll = 0;
    let totalHours = 0;

    const staffWithPay = DB.staff.map(m => {
        const memberShifts = filteredShifts.filter(s => s.staffId === m.id);
        const hours = memberShifts.reduce((s, sh) => s + sh.hours, 0);
        const pay = m.payType === 'salary' ? m.rate : hours * m.rate;
        totalPayroll += pay;
        totalHours += hours;
        return { ...m, hours, pay };
    });

    document.getElementById('total-payroll').textContent = fmt(totalPayroll);
    document.getElementById('total-hours').textContent = totalHours.toFixed(1) + 'h';

    const staffContainer = document.getElementById('staff-list');
    if (DB.staff.length === 0) {
        staffContainer.innerHTML = '<div class="empty-state"><i class="fas fa-users"></i><p>No staff members</p></div>';
    } else {
        staffContainer.innerHTML = DB.staff.map(m => {
            const initials = m.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            return `
                <div class="staff-item">
                    <div class="staff-left">
                        <div class="staff-avatar">${initials}</div>
                        <div class="staff-details">
                            <span class="staff-name">${m.name}</span>
                            <span class="staff-position">${m.position} &bull; ${m.payType === 'salary' ? fmt(m.rate) + '/mo' : fmt(m.rate) + '/hr'}</span>
                        </div>
                    </div>
                    <button class="transaction-delete" onclick="deleteStaff('${m.id}')"><i class="fas fa-trash"></i></button>
                </div>
            `;
        }).join('');

        staffContainer.innerHTML += `
            <button class="btn-secondary" onclick="showModal('shift-modal')">
                <i class="fas fa-clock"></i> Log Shift
            </button>
        `;
    }

    const shiftContainer = document.getElementById('shift-list');
    const sortedShifts = [...filteredShifts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

    if (sortedShifts.length === 0) {
        shiftContainer.innerHTML = '<div class="empty-state"><i class="fas fa-clock"></i><p>No shifts logged</p></div>';
    } else {
        shiftContainer.innerHTML = sortedShifts.map(s => {
            const staff = DB.staff.find(m => m.id === s.staffId);
            const name = staff ? staff.name : 'Unknown';
            const rate = staff ? staff.rate : 0;
            const pay = staff && staff.payType === 'salary' ? rate : s.hours * rate;
            return `
                <div class="transaction-item">
                    <div class="transaction-left">
                        <div class="transaction-icon shift">
                            <i class="fas fa-clock"></i>
                        </div>
                        <div class="transaction-details">
                            <span class="transaction-desc">${name}</span>
                            <span class="transaction-meta">${formatDate(s.date)} &bull; ${s.start} - ${s.end} &bull; ${s.hours.toFixed(1)}h</span>
                        </div>
                    </div>
                    <div class="transaction-right">
                        <span class="transaction-amount">${fmt(pay)}</span>
                        <button class="transaction-delete" onclick="deleteShift('${s.id}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    }
}

// ===== REPORTS =====
function initReportDates() {
    if (!document.getElementById('report-from').value) {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        document.getElementById('report-from').value = firstDay.toISOString().split('T')[0];
        document.getElementById('report-to').value = today();
    }
}

function renderReport() {
    const type = document.getElementById('report-type').value;
    const { from, to } = getDateRange();

    const incInRange = DB.income.filter(i => inRange(i.date, from, to));
    const expInRange = DB.expenses.filter(e => inRange(e.date, from, to));

    const totalInc = incInRange.reduce((s, i) => s + i.amount, 0);
    const totalExp = expInRange.reduce((s, e) => s + e.amount, 0);
    const profit = totalInc - totalExp;

    const container = document.getElementById('report-content');

    switch (type) {
        case 'daily-summary':
            renderDailySummary(container, from, to);
            break;
        case 'profit-loss':
            renderProfitLoss(container, totalInc, totalExp, profit, incInRange, expInRange);
            break;
        case 'monthly':
            renderMonthlySummary(container, from, to);
            break;
        case 'expense-breakdown':
            renderExpenseBreakdown(container, expInRange);
            break;
        case 'income-breakdown':
            renderIncomeBreakdown(container, incInRange);
            break;
        case 'tax-summary':
            renderTaxSummary(container, totalInc, totalExp, profit);
            break;
        case 'staff-costs':
            renderStaffCosts(container, from, to);
            break;
    }
}

function renderDailySummary(container, from, to) {
    const days = {};
    DB.income.filter(i => inRange(i.date, from, to)).forEach(i => {
        if (!days[i.date]) days[i.date] = { income: 0, expense: 0, type: 'income', count: 0 };
        days[i.date].income += i.amount;
        days[i.date].count++;
    });
    DB.expenses.filter(e => inRange(e.date, from, to)).forEach(e => {
        if (!days[e.date]) days[e.date] = { income: 0, expense: 0, count: 0 };
        days[e.date].expense += e.amount;
        days[e.date].count++;
    });

    let html = '';
    const sorted = Object.keys(days).sort((a, b) => b.localeCompare(a));
    if (sorted.length === 0) {
        html = '<div class="empty-state"><p>No data in selected range</p></div>';
    } else {
        for (const date of sorted) {
            const d = days[date];
            const profit = d.income - d.expense;
            const margin = d.income > 0 ? ((profit / d.income) * 100).toFixed(1) : 0;
            html += `<div class="report-section-title">${formatDate(date)}</div>`;
            html += `<div class="report-row"><span>Income</span><span class="report-value positive">${fmt(d.income)}</span></div>`;
            html += `<div class="report-row"><span>Expenses</span><span class="report-value negative">${fmt(d.expense)}</span></div>`;
            html += `<div class="report-row total"><span>Profit / Loss</span><span class="report-value ${profit >= 0 ? 'positive' : 'negative'}">${fmt(profit)} (${margin}% margin)</span></div>`;
        }
    }
    container.innerHTML = html;
}

function renderProfitLoss(container, totalInc, totalExp, profit, inc, exp) {    const incomeByCategory = {};
    inc.forEach(i => { incomeByCategory[i.category] = (incomeByCategory[i.category] || 0) + i.amount; });
    const expenseByCategory = {};
    exp.forEach(e => { expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount; });

    let html = '<div class="report-section-title">Revenue</div>';
    for (const [cat, amt] of Object.entries(incomeByCategory)) {
        html += `<div class="report-row"><span>${cat}</span><span class="report-value positive">${fmt(amt)}</span></div>`;
    }
    html += `<div class="report-row total"><span>Total Revenue</span><span class="report-value positive">${fmt(totalInc)}</span></div>`;

    html += '<div class="report-section-title">Expenses</div>';
    for (const [cat, amt] of Object.entries(expenseByCategory)) {
        html += `<div class="report-row"><span>${cat}</span><span class="report-value negative">${fmt(amt)}</span></div>`;
    }
    html += `<div class="report-row total"><span>Total Expenses</span><span class="report-value negative">${fmt(totalExp)}</span></div>`;

    html += `<div class="report-row total"><span>Net Profit</span><span class="report-value ${profit >= 0 ? 'positive' : 'negative'}">${fmt(profit)}</span></div>`;
    container.innerHTML = html;
}

function renderMonthlySummary(container, from, to) {
    const months = {};
    DB.income.filter(i => inRange(i.date, from, to)).forEach(i => {
        const m = i.date.substring(0, 7);
        if (!months[m]) months[m] = { income: 0, expense: 0 };
        months[m].income += i.amount;
    });
    DB.expenses.filter(e => inRange(e.date, from, to)).forEach(e => {
        const m = e.date.substring(0, 7);
        if (!months[m]) months[m] = { income: 0, expense: 0 };
        months[m].expense += e.amount;
    });

    let html = '';
    const sorted = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0]));
    if (sorted.length === 0) {
        html = '<div class="empty-state"><p>No data in selected range</p></div>';
    } else {
        for (const [month, data] of sorted) {
            const monthName = new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const profit = data.income - data.expense;
            html += `<div class="report-section-title">${monthName}</div>`;
            html += `<div class="report-row"><span>Income</span><span class="report-value positive">${fmt(data.income)}</span></div>`;
            html += `<div class="report-row"><span>Expenses</span><span class="report-value negative">${fmt(data.expense)}</span></div>`;
            html += `<div class="report-row total"><span>Profit</span><span class="report-value ${profit >= 0 ? 'positive' : 'negative'}">${fmt(profit)}</span></div>`;
        }
    }
    container.innerHTML = html;
}

function renderExpenseBreakdown(container, exp) {
    const byCategory = {};
    exp.forEach(e => { byCategory[e.category] = (byCategory[e.category] || 0) + e.amount; });
    const total = exp.reduce((s, e) => s + e.amount, 0);

    let html = '';
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
        html = '<div class="empty-state"><p>No expenses in range</p></div>';
    } else {
        for (const [cat, amt] of sorted) {
            const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : 0;
            html += `<div class="report-row"><span>${cat}</span><span class="report-value">${fmt(amt)} (${pct}%)</span></div>`;
        }
        html += `<div class="report-row total"><span>Total</span><span class="report-value">${fmt(total)}</span></div>`;
    }
    container.innerHTML = html;
}

function renderIncomeBreakdown(container, inc) {
    const byCategory = {};
    inc.forEach(i => { byCategory[i.category] = (byCategory[i.category] || 0) + i.amount; });
    const total = inc.reduce((s, i) => s + i.amount, 0);

    let html = '';
    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0) {
        html = '<div class="empty-state"><p>No income in range</p></div>';
    } else {
        for (const [cat, amt] of sorted) {
            const pct = total > 0 ? ((amt / total) * 100).toFixed(1) : 0;
            html += `<div class="report-row"><span>${cat}</span><span class="report-value positive">${fmt(amt)} (${pct}%)</span></div>`;
        }
        html += `<div class="report-row total"><span>Total</span><span class="report-value positive">${fmt(total)}</span></div>`;
    }
    container.innerHTML = html;
}

function renderTaxSummary(container, totalInc, totalExp, profit) {
    const taxRate = DB.settings.taxRate || 0;
    const taxOnIncome = totalInc * (taxRate / 100);
    const taxOnProfit = profit * (taxRate / 100);

    let html = `
        <div class="report-section-title">Tax Summary</div>
        <div class="report-row"><span>Tax Rate</span><span class="report-value">${taxRate}%</span></div>
        <div class="report-row"><span>Total Revenue</span><span class="report-value">${fmt(totalInc)}</span></div>
        <div class="report-row"><span>Total Expenses</span><span class="report-value">${fmt(totalExp)}</span></div>
        <div class="report-row"><span>Net Profit</span><span class="report-value ${profit >= 0 ? 'positive' : 'negative'}">${fmt(profit)}</span></div>
        <div class="report-section-title">Estimated Tax</div>
        <div class="report-row"><span>Tax on Revenue (${taxRate}%)</span><span class="report-value">${fmt(taxOnIncome)}</span></div>
        <div class="report-row"><span>Tax on Profit (${taxRate}%)</span><span class="report-value">${fmt(taxOnProfit)}</span></div>
        <div class="report-row total"><span>Profit After Tax (on profit)</span><span class="report-value">${fmt(profit - taxOnProfit)}</span></div>
    `;
    container.innerHTML = html;
}

function renderStaffCosts(container, from, to) {
    const filteredShifts = DB.shifts.filter(s => inRange(s.date, from, to));

    let html = '';
    let totalCost = 0;

    if (DB.staff.length === 0) {
        html = '<div class="empty-state"><p>No staff members</p></div>';
    } else {
        for (const member of DB.staff) {
            const shifts = filteredShifts.filter(s => s.staffId === member.id);
            const hours = shifts.reduce((s, sh) => s + sh.hours, 0);
            const cost = member.payType === 'salary' ? member.rate : hours * member.rate;
            totalCost += cost;
            html += `<div class="report-row"><span>${member.name} (${member.position})</span><span class="report-value">${hours.toFixed(1)}h - ${fmt(cost)}</span></div>`;
        }
        html += `<div class="report-row total"><span>Total Staff Costs</span><span class="report-value">${fmt(totalCost)}</span></div>`;
    }
    container.innerHTML = html;
}

// ===== EXPORT =====
function csvEscape(str) {
    const s = String(str == null ? '' : str);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportCSV(rows, filename) {
    const header = Object.keys(rows[0] || {}).join(',');
    const body = rows.map(r => Object.values(r).map(csvEscape).join(',')).join('\n');
    downloadFile(header + '\n' + body, filename, 'text/csv;charset=utf-8');
    showToast('CSV exported!');
}

document.getElementById('btn-export').addEventListener('click', () => {
    // Long-press-like nav: show an options menu via a simple confirm-based picker
    const choice = prompt(
        'Export options:\n\n1 = JSON backup (all data)\n2 = Income CSV\n3 = Expenses CSV\n4 = Inventory CSV\n5 = Payroll CSV\n6 = Report (P&L) CSV',
        '1'
    );
    if (!choice) return;

    switch (choice) {
        case '1': {
            const data = JSON.stringify(DB, null, 2);
            downloadFile(data, `restrobooks-${today()}.json`, 'application/json');
            showToast('JSON backup exported!');
            break;
        }
        case '2': {
            const rows = DB.income.map(i => ({ Date: i.date, Category: i.category, Description: i.desc, Amount: i.amount }));
            exportCSV(rows, `income-${today()}.csv`);
            break;
        }
        case '3': {
            const rows = DB.expenses.map(e => ({ Date: e.date, Category: e.category, Description: e.desc, Payment: e.payment, Amount: e.amount }));
            exportCSV(rows, `expenses-${today()}.csv`);
            break;
        }
        case '4': {
            const rows = DB.inventory.map(it => ({ Item: it.name, Category: it.category, Quantity: it.qty, Unit: it.unit, 'Cost/Unit': it.cost, 'Min Qty': it.minQty }));
            exportCSV(rows, `inventory-${today()}.csv`);
            break;
        }
        case '5': {
            const rows = DB.shifts.map(s => {
                const staff = DB.staff.find(m => m.id === s.staffId);
                return { Date: s.date, Staff: staff ? staff.name : 'Unknown', Position: staff ? staff.position : '', Start: s.start, End: s.end, Break: s.break, Hours: s.hours.toFixed(2) };
            });
            exportCSV(rows, `payroll-${today()}.csv`);
            break;
        }
        case '6': {
            const { from, to } = { from: '2000-01-01', to: '2099-12-31' };
            const inc = DB.income.filter(i => inRange(i.date, from, to));
            const exp = DB.expenses.filter(e => inRange(e.date, from, to));
            const totalInc = inc.reduce((s, i) => s + i.amount, 0);
            const totalExp = exp.reduce((s, e) => s + e.amount, 0);
            const rows = [
                { 'Section': 'Total Revenue', 'Amount': totalInc },
                { 'Section': 'Total Expenses', 'Amount': totalExp },
                { 'Section': 'Net Profit', 'Amount': totalInc - totalExp }
            ];
            exportCSV(rows, `profit-loss-${today()}.csv`);
            break;
        }
        default:
            showToast('Invalid option');
    }
});

// Settings
document.getElementById('btn-settings').addEventListener('click', () => {
    showModal('settings-modal');
});

// Init
loadData();
renderDashboard();
