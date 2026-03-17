const DB_KEY = 'enrollment_app_data';

const defaultData = {
    settings: {
        schoolName: 'โรงเรียนคำยางพิทยา',
        adminPin: 'admin123',
        financePin: '123456',
        receiverName: 'เจ้าหน้าที่การเงิน',
        googleSheetUrl: 'https://script.google.com/macros/s/AKfycbzutKMZwHFwwUusRwZsb5rjgS4K8ILViEwmPdHX0iaVgr3DL9xhaed1QcjbECE-O5xj8Q/exec',
        uniforms: [
            { id: 'u1', type: 'shirt', size: 'S', price: 150 },
            { id: 'u2', type: 'shirt', size: 'M', price: 160 },
            { id: 'u3', type: 'shirt', size: 'L', price: 170 },
            { id: 'u4', type: 'shirt', size: 'XL', price: 180 },
            { id: 'u5', type: 'pants', size: 'S', price: 200 },
            { id: 'u6', type: 'pants', size: 'M', price: 210 },
            { id: 'u7', type: 'pants', size: 'L', price: 220 },
            { id: 'u8', type: 'pants', size: 'XL', price: 230 },
        ],
        items: [
            { id: 'i0', name: 'บัตรนักเรียน', price: 10, icon: 'ph-id-card', mandatory: true },
            { id: 'i1', name: 'กระเป๋า', price: 350, icon: 'ph-backpack' },
            { id: 'i2', name: 'เข็มกลัด', price: 50, icon: 'ph-medal' },
            { id: 'i3', name: 'สมุด (โหล)', price: 120, icon: 'ph-book' },
        ]
    },
    students: []
    // student model: { id, refCode, firstName, lastName, grade, shirtId, pantsId, items: [{id, qty}], paymentStatus: 'pending'|'paid', createdAt }
};

const app = {
    data: {},
    state: {
        p2StudentId: null,
        p3StudentId: null,
        p4StudentId: null,
        p4Tab: 'pending',
        auth: { admin: false, finance: false }
    },
    currentView: 'dashboard',

    // --- Security Helpers ---
    escapeHtml(str) {
        if (str == null) return '';
        const div = document.createElement('div');
        div.textContent = String(str);
        return div.innerHTML;
    },

    // Constant-time PIN comparison to prevent timing attacks
    constantTimeEqual(a, b) {
        if (!a || !b) return false;
        if (a.length !== b.length) return false;
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    },

    init() {
        this.loadData();
        const cachedAuth = sessionStorage.getItem('enrollment_app_auth');
        if (cachedAuth) {
            try {
                this.state.auth = JSON.parse(cachedAuth);
            } catch (e) {
                console.warn('Failed to parse cached auth, clearing session');
                sessionStorage.removeItem('enrollment_app_auth');
            }
        }
        this.renderHeader();
        this.createPinModal();
        this.navigate(this.currentView, true);

        // Auto-fetch data from Google Sheets on startup
        if (this.data.settings.googleSheetUrl) {
            this._pullFromGAS(true); // silent = true on init

            // Auto-refresh every 30 seconds when Google Sheets is configured
            this._startAutoRefresh(30000); // 30 seconds
        }

        // Setup print listener to cleanup
        window.addEventListener('afterprint', () => {
            const printContainer = document.getElementById('printContainer');
            if (printContainer) printContainer.innerHTML = '';
        });
    },

    // Auto-refresh interval for real-time sync
    _startAutoRefresh(intervalMs = 30000) {
        // Clear any existing interval
        if (this._autoRefreshInterval) {
            clearInterval(this._autoRefreshInterval);
        }

        // Set up new interval
        this._autoRefreshInterval = setInterval(() => {
            if (this.data.settings.googleSheetUrl) {
                console.log('[Auto-refresh] Syncing with Google Sheets...');
                this._pullFromGAS(true); // silent = true for background refresh
            }
        }, intervalMs);

        console.log('[Auto-refresh] Enabled - syncing every', intervalMs / 1000, 'seconds');
    },

    loadData() {
        const stored = localStorage.getItem(DB_KEY);
        if (stored) {
            try {
                this.data = JSON.parse(stored);
                // Ensure settings exist
                if (!this.data.settings) this.data.settings = defaultData.settings;
            } catch (e) {
                console.error('Failed to load data from localStorage:', e);
                this.data = JSON.parse(JSON.stringify(defaultData));
            }
        } else {
            this.data = JSON.parse(JSON.stringify(defaultData));
            this.saveData();
        }
    },

    saveData() {
        this.data.lastUpdated = Date.now();
        localStorage.setItem(DB_KEY, JSON.stringify(this.data));
        // Background push to Google Sheets (fire-and-forget)
        this._pushToGAS();
    },

    navigate(viewId, isInit = false) {
        // Require PIN for settings and point4 (checkout/payment)
        if (viewId === 'settings' && !this.state.auth.admin && !isInit) {
            this.promptPin('admin', () => {
                this._doNavigate(viewId, isInit);
            });
            return;
        }
        if (viewId === 'point4' && !this.state.auth.finance && !isInit) {
            this.promptPin('finance', () => {
                this._doNavigate(viewId, isInit);
            });
            return;
        }
        if (viewId === 'summary' && !this.state.auth.admin && !isInit) {
            this.promptPin('admin', () => {
                this._doNavigate(viewId, isInit);
            });
            return;
        }
        this._doNavigate(viewId, isInit);
    },

    _doNavigate(viewId, isInit) {
        this.currentView = viewId;

        document.querySelectorAll('.app-view').forEach(view => {
            view.classList.remove('active-view');
            view.classList.add('hidden');
        });

        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) {
            targetView.classList.remove('hidden');
            if (isInit) {
                targetView.classList.add('active-view');
            } else {
                setTimeout(() => targetView.classList.add('active-view'), 10);
            }
        }

        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.dataset.target === viewId) {
                btn.classList.add('active');
                if (!isInit) {
                    btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            } else {
                btn.classList.remove('active');
            }
        });

        // Reset states when navigating
        this.state.p2StudentId = null;
        this.state.p3StudentId = null;
        this.state.p4StudentId = null;

        this.renderView(viewId);
    },

    toggleMobileMenu() {
        const sidebar = document.getElementById('mobileSidebar');
        const overlay = document.getElementById('mobileSidebarOverlay');
        if (sidebar && overlay) {
            const isHidden = overlay.classList.contains('hidden');
            if (isHidden) {
                overlay.classList.remove('hidden');
                setTimeout(() => sidebar.classList.remove('translate-x-full'), 10);
            } else {
                sidebar.classList.add('translate-x-full');
                setTimeout(() => overlay.classList.add('hidden'), 300);
            }
        }
    },

    createPinModal() {
        // Remove existing if any
        const existing = document.getElementById('pinModal');
        if (existing) existing.remove();

        const modalHtml = `
            <div id="pinModal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-floating transform scale-95 transition-transform" id="pinModalContent">
                    <div class="text-center mb-6">
                        <div class="w-16 h-16 bg-orange-100 text-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <i class="ph-fill ph-lock-key text-3xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800">กรุณาใส่รหัสผ่าน</h3>
                        <p id="pinModalSubtitle" class="text-xs text-orange-500 font-bold tracking-wide mt-2">รหัสผ่าน</p>
                    </div>
                    
                    <input type="password" id="pinInput" class="w-full text-center text-3xl tracking-[0.5em] font-mono border-2 border-gray-100 rounded-2xl py-4 focus:border-primary focus:ring-0 outline-none transition-colors mb-8 bg-gray-50/50 text-gray-800 font-bold">
                    
                    <div class="flex gap-3">
                        <button onclick="app.closePinModal()" class="flex-1 py-4 text-gray-500 font-bold bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-base">ยกเลิก</button>
                        <button id="pinSubmitBtn" class="flex-1 py-4 text-white font-bold bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-full transition-all shadow-lg text-base active:scale-[0.98]">ยืนยัน</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Setup Enter key
        document.getElementById('pinInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') document.getElementById('pinSubmitBtn').click();
        });
    },

    promptPin(type, onSuccess) {
        const modal = document.getElementById('pinModal');
        const content = document.getElementById('pinModalContent');
        const input = document.getElementById('pinInput');
        const submitBtn = document.getElementById('pinSubmitBtn');
        const subtitle = document.getElementById('pinModalSubtitle');

        subtitle.innerText = type === 'admin' ? 'สำหรับผู้ดูแลระบบ' : 'สำหรับเจ้าหน้าที่การเงิน';

        input.value = '';
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        setTimeout(() => {
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
            input.focus();
        }, 10);

        const checkPin = () => {
            const val = input.value;
            let success = false;

            // Admin PIN overrides everything
            if (this.constantTimeEqual(val, this.data.settings.adminPin)) {
                this.state.auth.admin = true;
                this.state.auth.finance = true;
                success = true;
            }
            // Finance PIN only grants finance
            else if (type === 'finance' && this.data.settings.financePin && this.constantTimeEqual(val, this.data.settings.financePin)) {
                this.state.auth.finance = true;
                success = true;
            }

            if (success) {
                sessionStorage.setItem('enrollment_app_auth', JSON.stringify(this.state.auth));
                this.closePinModal();
                if (onSuccess) onSuccess();
            } else {
                input.classList.add('border-red-500', 'text-red-500');
                setTimeout(() => {
                    input.classList.remove('border-red-500', 'text-red-500');
                    input.value = '';
                    input.focus();
                }, 800);
            }
        };

        // Remove previous event listener to prevent multiple calls
        submitBtn.onclick = null;
        submitBtn.addEventListener('click', checkPin);

        // Also handle Enter key press on the input field
        input.removeEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitBtn.click();
        }); // Remove existing listener if any
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') submitBtn.click();
        });
    },

    closePinModal() {
        const modal = document.getElementById('pinModal');
        const content = document.getElementById('pinModalContent');
        content.classList.remove('scale-100');
        content.classList.add('scale-95');
        setTimeout(() => {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }, 150);
    },

    renderHeader() {
        document.getElementById('headerSchoolName').innerText = this.data.settings.schoolName || 'ระบบมอบตัว';
        const logoImg = document.getElementById('headerSchoolLogo');
        if (logoImg) {
            logoImg.src = this.data.settings.schoolLogo || 'https://upload.wikimedia.org/wikipedia/th/thumb/3/36/Phra_Kiao.svg/1200px-Phra_Kiao.svg.png';
        }
    },

    renderView(viewId) {
        switch (viewId) {
            case 'dashboard': this.renderDashboard(); break;
            case 'point1': this.renderPoint1(); break;
            case 'point2': this.renderPoint2(); break;
            case 'point3': this.renderPoint3(); break;
            case 'point4': this.renderPoint4(); break;
            case 'settings': this.renderSettings(); break;
            case 'summary': this.renderSummary(); break;
        }
    },

    renderAllViews() {
        if (document.getElementById('dashboardContent')) this.renderDashboard();
        if (document.getElementById('point1Content')) this.renderPoint1();
        if (document.getElementById('point2Content')) this.renderPoint2();
        if (document.getElementById('point3Content')) this.renderPoint3();
        if (document.getElementById('point4Content')) this.renderPoint4();
        if (document.getElementById('summaryContent')) this.renderSummary();
    },

    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');

        const colors = {
            success: 'bg-green-100 border-green-500 text-green-800',
            error: 'bg-red-100 border-red-500 text-red-800',
            info: 'bg-blue-100 border-blue-500 text-blue-800'
        };

        const icons = {
            success: 'ph-check-circle',
            error: 'ph-x-circle',
            info: 'ph-info'
        };

        toast.className = `toast-enter flex items-center gap-3 p-4 rounded-xl border-l-4 shadow-lg ${colors[type]}`;
        toast.innerHTML = `
            <i class="ph ${icons[type]} text-2xl"></i>
            <span class="font-medium text-sm">${message}</span>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.replace('toast-enter', 'toast-exit');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    generateId() {
        return Math.random().toString(36).substring(2, 9);
    },

    getStudentName(student) {
        return `${student.title || ''} ${this.escapeHtml(student.firstName)} ${this.escapeHtml(student.lastName)}`.trim();
    },

    calculateStudentTotal(student) {
        let total = 0;
        const details = [];

        // Get mandatory items from settings
        const mandatoryItems = this.data.settings.items.filter(i => i.mandatory === true);

        // Ensure mandatory items are in student's items array with qty: 1
        if (!student.items) student.items = [];
        mandatoryItems.forEach(mandItem => {
            const existingItem = student.items.find(i => i.id === mandItem.id);
            if (!existingItem) {
                student.items.push({ id: mandItem.id, qty: 1 });
            }
        });

        // Uniforms (Shirts)
        if (student.shirts && student.shirts.length > 0) {
            student.shirts.forEach(sh => {
                const shirtDef = this.data.settings.uniforms.find(u => u.id === sh.id);
                if (shirtDef) {
                    const subtotal = shirtDef.price * sh.qty;
                    total += subtotal;
                    details.push({ id: sh.id, name: `เสื้อพละ (ไซส์ ${shirtDef.size})`, price: shirtDef.price, qty: sh.qty, subtotal: subtotal, mandatory: false });
                }
            });
        }

        // Uniforms (Pants)
        if (student.pants && student.pants.length > 0) {
            student.pants.forEach(pa => {
                const pantsDef = this.data.settings.uniforms.find(u => u.id === pa.id);
                if (pantsDef) {
                    const subtotal = pantsDef.price * pa.qty;
                    total += subtotal;
                    details.push({ id: pa.id, name: `กางเกงพละ (ไซส์ ${pantsDef.size})`, price: pantsDef.price, qty: pa.qty, subtotal: subtotal, mandatory: false });
                }
            });
        }

        // Items
        student.items.forEach(i => {
            const itemDef = this.data.settings.items.find(def => def.id === i.id);
            if (itemDef) {
                const subtotal = itemDef.price * i.qty;
                total += subtotal;
                details.push({ id: itemDef.id, name: itemDef.name, price: itemDef.price, qty: i.qty, subtotal: subtotal, mandatory: itemDef.mandatory === true });
            }
        });

        return { total, details };
    },

    // --- Google Sheets Central DB ---
    async _pushToGAS() {
        const url = this.data.settings.googleSheetUrl;
        if (!url) return; // No URL configured, skip silently

        try {
            const payload = {
                action: 'saveData',
                data: this.data
            };

            // Use regular fetch to get response (may fail CORS but that's okay)
            fetch(url, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json' }
            }).then(response => {
                console.log('[GAS] Push successful');
            }).catch(err => {
                // Silent fail for background push
                console.log('[GAS] Push sent (background mode)');
            });
        } catch (error) {
            console.warn('Background push to GAS failed:', error);
        }
    },

    async _pullFromGAS(silent = false) {
        const url = this.data.settings.googleSheetUrl;
        if (!url) {
            if (!silent) this.showToast('กรุณาตั้งค่า URL ของ Web App ก่อน', 'error');
            return;
        }

        const btn = document.getElementById('syncBtn');
        const icon = document.getElementById('syncIcon');
        if (btn) btn.disabled = true;
        if (icon) icon.classList.add('animate-spin');

        try {
            const fetchUrl = url + '?action=getData&t=' + Date.now();
            const response = await fetch(fetchUrl);
            const result = await response.json();

            if (result.status === 'success' && result.data) {
                const remoteData = JSON.parse(result.data);
                
                // Conflict resolution: only overwrite if remote data is newer
                if (remoteData.lastUpdated && this.data.lastUpdated && remoteData.lastUpdated <= this.data.lastUpdated) {
                    if (!silent) console.log('[Sync] Local data is newer or same as remote, skipping pull');
                    return; 
                }

                // Preserve local googleSheetUrl (don't overwrite with remote)
                const localUrl = this.data.settings.googleSheetUrl;
                this.data = remoteData;
                this.data.settings.googleSheetUrl = localUrl;
                localStorage.setItem(DB_KEY, JSON.stringify(this.data));
                this.renderHeader();
                this.renderView(this.currentView);
                if (!silent) this.showToast('โหลดข้อมูลล่าสุดจากเซิร์ฟเวอร์เรียบร้อย ✅');
            } else if (result.status === 'empty') {
                // No data on server yet, push current data
                if (!silent) this.showToast('ยังไม่มีข้อมูลบนเซิร์ฟเวอร์ กำลังส่งข้อมูลขึ้นไป...', 'info');
                this._pushToGAS();
            } else {
                if (!silent) this.showToast('ไม่สามารถโหลดข้อมูลได้: ' + (result.message || 'Unknown error'), 'error');
            }
        } catch (error) {
            console.error('Pull from GAS Error:', error);
            if (!silent) this.showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ ใช้ข้อมูล offline แทน', 'error');
        } finally {
            if (btn) btn.disabled = false;
            if (icon) icon.classList.remove('animate-spin');
        }
    },

    async syncToGoogleSheets() {
        await this._pullFromGAS(false);
    },

    // --- Settings Logic ---

    saveSettings() {
        const schoolName = document.getElementById('settingSchoolName').value;
        const adminPin = document.getElementById('settingAdminPin').value;
        const financePin = document.getElementById('settingFinancePin').value;
        const receiverName = document.getElementById('settingReceiverName').value;
        const sheetNode = document.getElementById('settingGoogleSheetUrl');
        const googleSheetUrl = sheetNode ? sheetNode.value : '';
        const logoInput = document.getElementById('settingSchoolLogo');

        const proceedSave = (logoDataUrl) => {
            if (schoolName) {
                this.data.settings.schoolName = schoolName;
                // Only update PINs if user entered a new value
                if (adminPin) this.data.settings.adminPin = adminPin;
                if (financePin) this.data.settings.financePin = financePin;
                this.data.settings.receiverName = receiverName || 'เจ้าหน้าที่การเงิน';
                this.data.settings.googleSheetUrl = googleSheetUrl;
                if (logoDataUrl) {
                    this.data.settings.schoolLogo = logoDataUrl;
                }
                this.saveData();
                this.renderHeader();
                this.showToast('บันทึกการตั้งค่าเรียบร้อย ✅');

                // Start auto-refresh if URL was just added
                if (googleSheetUrl) {
                    this._startAutoRefresh(30000);
                }

                if (logoDataUrl) {
                    this.renderSettings(); // re-render to show updated image preview
                }
            }
        };

        if (logoInput && logoInput.files && logoInput.files[0]) {
            const reader = new FileReader();
            reader.onload = async (e) => {
                // Compress logo to avoid cell limits (max 400px width, 0.7 quality)
                try {
                    const compressedLogo = await this.compressImage(e.target.result, 400, 0.7);
                    // Instant logo preview
                    const logoImg = document.getElementById('headerSchoolLogo');
                    if (logoImg) logoImg.src = compressedLogo;
                    proceedSave(compressedLogo);
                } catch (err) {
                    console.warn('Compression failed, using original', err);
                    proceedSave(e.target.result);
                }
            };
            reader.readAsDataURL(logoInput.files[0]);
        } else {
            proceedSave(null);
        }
    },

    // Helper to compress image to avoid Google Sheets cell limits
    compressImage(dataUrl, maxWidth, quality) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = dataUrl;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', quality));
            };
            img.onerror = reject;
        });
    },

    addItem(type) {
        if (type === 'uniform_shirt') {
            this.data.settings.uniforms.push({ id: this.generateId(), type: 'shirt', size: 'ใหม่', price: 0 });
        } else if (type === 'uniform_pants') {
            this.data.settings.uniforms.push({ id: this.generateId(), type: 'pants', size: 'ใหม่', price: 0 });
        } else if (type === 'item') {
            this.data.settings.items.push({ id: this.generateId(), name: 'รายการใหม่', price: 0, icon: 'ph-package' });
        }
        this.saveData();
        this.renderSettings();
    },

    updateItem(id, field, value, type) {
        let list = type === 'item' ? this.data.settings.items : this.data.settings.uniforms;
        let item = list.find(i => i.id === id);
        if (item) {
            item[field] = field === 'price' ? Number(value) : value;
            this.saveData();
        }
    },

    removeItem(id, type) {
        if (confirm('คุณต้องการลบรายการนี้ใช่หรือไม่?')) {
            if (type === 'item') {
                this.data.settings.items = this.data.settings.items.filter(i => i.id !== id);
            } else {
                this.data.settings.uniforms = this.data.settings.uniforms.filter(i => i.id !== id);
            }
            this.saveData();
            this.renderSettings();
            this.showToast('ลบรายการเรียบร้อย', 'info');
        }
    },

    // --- Student Logic ---
    addStudent(event) {
        event.preventDefault();
        const title = document.getElementById('regTitle').value;
        const firstName = document.getElementById('regFirstName').value.trim();
        const lastName = document.getElementById('regLastName').value.trim();
        const grade = document.getElementById('regGrade').value;

        if (!firstName || !lastName || !grade) {
            this.showToast('กรุณากรอกข้อมูลให้ครบถ้วน', 'error');
            return;
        }

        const refCode = `REG-${String(this.data.students.length + 1).padStart(4, '0')}`;

        // Auto-add mandatory items to new student
        const mandatoryItems = this.data.settings.items.filter(i => i.mandatory === true);
        const initialItems = mandatoryItems.map(i => ({ id: i.id, qty: 1 }));

        const newStudent = {
            id: this.generateId(),
            refCode: refCode,
            title: title,
            firstName: firstName,
            lastName: lastName,
            grade: grade,
            shirts: [],
            pants: [],
            items: initialItems,
            currentStep: 1,
            paymentStatus: 'pending',
            createdAt: new Date().toISOString()
        };

        this.data.students.unshift(newStudent);
        this.saveData();

        // Reset form
        document.getElementById('regTitle').value = 'นาย';
        document.getElementById('regFirstName').value = '';
        document.getElementById('regLastName').value = '';
        document.getElementById('regFirstName').focus();

        this.showToast('ลงทะเบียนนักเรียนสำเร็จ');
        this.renderPoint1();
    },

    // --- Edit Student Logic ---
    openEditStudentModal(id) {
        const student = this.data.students.find(s => s.id === id);
        if (!student) return;

        document.getElementById('editStudentId').value = student.id;
        document.getElementById('editTitle').value = student.title || 'ด.ช.';
        document.getElementById('editFirstName').value = student.firstName;
        document.getElementById('editLastName').value = student.lastName;
        document.getElementById('editGrade').value = student.grade;

        document.getElementById('editStudentModal').classList.remove('hidden');
    },

    closeEditStudentModal() {
        document.getElementById('editStudentModal').classList.add('hidden');
    },

    saveStudentEdit(e) {
        e.preventDefault();
        const id = document.getElementById('editStudentId').value;
        const student = this.data.students.find(s => s.id === id);
        if (!student) return;

        student.title = document.getElementById('editTitle').value;
        student.firstName = document.getElementById('editFirstName').value.trim();
        student.lastName = document.getElementById('editLastName').value.trim();
        student.grade = document.getElementById('editGrade').value;

        this.saveData();
        this.closeEditStudentModal();
        this.showToast('อัพเดตข้อมูลนักเรียนเรียบร้อยแล้ว', 'success');
        this.renderAllViews();
    },

    deleteStudent(id) {
        if (confirm('คุณต้องการลบข้อมูลนักเรียนคนนี้ใช่หรือไม่?')) {
            this.data.students = this.data.students.filter(s => s.id !== id);
            this.saveData();
            // Re-render all views that might show lists
            this.renderAllViews();
            this.showToast('ลบข้อมูลสำเร็จ', 'info');
        }
    },

    // --- Point 2 Logic ---
    selectStudentP2(id) {
        this.state.p2StudentId = this.state.p2StudentId === id ? null : id; // Toggle
        this.renderPoint2();
    },

    updateUniformQtyP2_New(studentId, sizeId, type, action) {
        const student = this.data.students.find(s => s.id === studentId);
        if (!student) return;

        const arrayProp = type === 'shirt' ? 'shirts' : 'pants';
        if (!student[arrayProp]) student[arrayProp] = [];

        const existingIdx = student[arrayProp].findIndex(u => u.id === sizeId);
        let currentQty = existingIdx >= 0 ? student[arrayProp][existingIdx].qty : 0;

        let newQty = currentQty + action;
        if (newQty < 0) newQty = 0;

        if (newQty > 0) {
            if (existingIdx >= 0) {
                student[arrayProp][existingIdx].qty = newQty;
            } else {
                student[arrayProp].push({ id: sizeId, qty: newQty });
            }
        } else {
            if (existingIdx >= 0) {
                student[arrayProp].splice(existingIdx, 1);
            }
        }

        student.p2Confirmed = false; // Reset confirmation when changed
        this.saveData();
        this.renderPoint2();
    },

    confirmP2(id) {
        const student = this.data.students.find(s => s.id === id);
        if (!student) return;
        student.p2Confirmed = true;
        this.saveData();
        this.showToast('ยืนยันรายการจุดที่ 2 แล้ว', 'success');
        this.renderAllViews(); // Update navigation boundaries (P4)
    },

    // --- Point 3 Logic ---
    updateSingleItemP3(studentId, itemId, action) {
        const student = this.data.students.find(s => s.id === studentId);
        if (!student) return;

        if (!student.items) student.items = [];
        const existingIdx = student.items.findIndex(i => i.id === itemId);
        let currentQty = existingIdx >= 0 ? student.items[existingIdx].qty : 0;

        let newQty = currentQty + action;

        // Check if this is a mandatory item - prevent going below 1
        const itemDef = this.data.settings.items.find(i => i.id === itemId);
        const isMandatory = itemDef && itemDef.mandatory === true;

        if (isMandatory && newQty < 1) {
            newQty = 1; // Keep at minimum 1 for mandatory items
        }
        if (newQty < 0) newQty = 0;

        if (newQty > 0) {
            if (existingIdx >= 0) {
                student.items[existingIdx].qty = newQty;
            } else {
                student.items.push({ id: itemId, qty: newQty });
            }
        } else {
            if (existingIdx >= 0) {
                student.items.splice(existingIdx, 1);
            }
        }
        student.p3Confirmed = false; // Reset confirmation when changed
        this.saveData();
        this.renderPoint3();
        if (document.getElementById('point4Content')) this.renderPoint4();
    },

    confirmP3(id) {
        const student = this.data.students.find(s => s.id === id);
        if (!student) return;
        student.p3Confirmed = true;
        this.saveData();
        this.showToast('ยืนยันรายการจุดที่ 3 แล้ว', 'success');
        this.renderAllViews(); // Update P4 visibility
    },

    // --- Point 4 Logic ---
    selectStudentP4(id) {
        this.state.p4StudentId = this.state.p4StudentId === id ? null : id; // Toggle
        this.renderPoint4();
    },

    switchTabP4(tab) {
        this.state.p4Tab = tab;
        this.renderPoint4();
    },

    viewReceipt(studentId) {
        const student = this.data.students.find(s => s.id === studentId);
        if (!student) return;
        const calc = this.calculateStudentTotal(student);
        this._executePaymentPrint(student, calc, true); // true = view only, don't update status
    },

    downloadPdfReceipt(studentId) {
        const student = this.data.students.find(s => s.id === studentId);
        if (!student) return;

        const calc = this.calculateStudentTotal(student);
        const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        // Create receipt HTML
        const receiptHtml = `
            <div style="padding: 40px; font-family: 'Noto Sans Thai', sans-serif; max-width: 800px; margin: 0 auto;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="font-size: 24px; margin-bottom: 10px;">${this.data.settings.schoolName}</h1>
                    <h2 style="font-size: 18px; color: #666;">ใบเสร็จรับเงิน</h2>
                </div>
                
                <div style="display: flex; justify-content: space-between; border-bottom: 2px dashed #ddd; padding-bottom: 20px; margin-bottom: 20px;">
                    <div>
                        <div style="margin-bottom: 5px;"><strong>รหัสอ้างอิง:</strong> ${this.escapeHtml(student.refCode)}</div>
                        <div><strong>ชื่อ-สกุล:</strong> ${this.getStudentName(student)}</div>
                        <div style="margin-top: 5px;"><strong>ระดับชั้น:</strong> ${student.grade}</div>
                    </div>
                    <div style="text-align: right;">
                        <div><strong>วันที่:</strong> ${dateStr}</div>
                    </div>
                </div>

                <table style="width: 100%; text-align: left; margin-bottom: 30px;">
                    <thead>
                        <tr style="border-bottom: 2px solid #000;">
                            <th style="padding: 10px 0;">รายการ</th>
                            <th style="padding: 10px; text-align: center;">จำนวน</th>
                            <th style="padding: 10px; text-align: right;">ราคา/หน่วย</th>
                            <th style="padding: 10px; text-align: right;">จำนวนเงิน</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${calc.details.map(d => `
                            <tr style="border-bottom: 1px dashed #ddd;">
                                <td style="padding: 10px 10px 10px 0;">${d.name}</td>
                                <td style="padding: 10px; text-align: center;">${d.qty}</td>
                                <td style="padding: 10px; text-align: right;">฿${d.price.toLocaleString()}</td>
                                <td style="padding: 10px; text-align: right;">฿${d.subtotal.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="border-top: 2px solid #000; font-weight: bold;">
                            <td colspan="3" style="padding: 15px 10px 15px 0; text-align: right; color: #666;">ยอดชำระสุทธิ</td>
                            <td style="padding: 15px; text-align: right; font-size: 20px;">฿${calc.total.toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>

                <div style="display: flex; justify-content: space-between; padding-top: 30px; margin-top: 30px; border-top: 2px solid #ddd;">
                    <div style="text-align: center; width: 45%;">
                        <div style="color: #999; margin-bottom: 30px;">ลงชื่อ <span style="display: inline-block; width: 100px; border-bottom: 1px solid #000;"></span> ผู้ชำระเงิน</div>
                        <div style="font-weight: bold;">(${this.getStudentName(student)})</div>
                    </div>
                    <div style="text-align: center; width: 45%;">
                        <div style="color: #999; margin-bottom: 30px;">ลงชื่อ <span style="display: inline-block; width: 100px; border-bottom: 1px solid #000;"></span> ผู้รับเงิน</div>
                        <div style="font-weight: bold;">(${this.data.settings.receiverName || 'เจ้าหน้าที่การเงิน'})</div>
                    </div>
                </div>
            </div>
        `;

        // Generate PDF
        const element = document.createElement('div');
        element.innerHTML = receiptHtml;

        const opt = {
            margin: 10,
            filename: `ใบเสร็จ_${student.refCode}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(opt).from(element).save();
    },

    processPayment(id) {
        const student = this.data.students.find(s => s.id === id);
        if (!student) return;

        // Verify if total > 0
        const calc = this.calculateStudentTotal(student);
        if (calc.total === 0 && !confirm('ยอดชำระเป็น 0 บาท ต้องการดำเนินการต่อหรือไม่?')) {
            return;
        }

        // Execute payment directly - PIN already checked when entering point4
        this._executePaymentPrint(student, calc);
    },

    _executePaymentPrint(student, calc, isViewOnly = false) {
        const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const receiptHtml = (isCopy) => `
            <div class="receipt-container bg-white" style="width: 100%; height: 50vh; display: flex; flex-direction: column; padding: 20px 30px; box-sizing: border-box; border-bottom: ${isCopy ? 'none' : '1px dashed #ccc'};">
                <div class="text-center mb-3">
                    <h1 class="text-xl font-bold text-gray-900 leading-tight">${this.data.settings.schoolName}</h1>
                    <h2 class="text-sm font-bold text-gray-600">ใบเสร็จรับเงิน ${isCopy ? '(สำเนา)' : '(ต้นฉบับ)'}</h2>
                </div>
                
                <div class="flex justify-between mb-3 pb-2 border-b-2 border-gray-900 border-dashed text-xs">
                    <div>
                        <div class="mb-0.5"><strong class="text-gray-500">รหัสอ้างอิง:</strong> ${this.escapeHtml(student.refCode)}</div>
                        <div><strong class="text-gray-500">ชื่อ-สกุล:</strong> ${this.getStudentName(student)}</div>
                    </div>
                    <div class="text-right">
                        <div class="mb-0.5"><strong class="text-gray-500">ระดับชั้น:</strong> <span class="bg-gray-100 px-1 py-0.5 rounded-sm font-bold text-[10px]">${student.grade}</span></div>
                        <div><strong class="text-gray-500">วันที่:</strong> ${dateStr}</div>
                    </div>
                </div>

                <table class="w-full text-left mb-2 text-xs flex-1">
                    <thead>
                        <tr class="border-b-2 border-gray-900 text-gray-900">
                            <th class="py-1.5 font-bold">รายการ</th>
                            <th class="py-1.5 text-center w-16 font-bold">จำนวน</th>
                            <th class="py-1.5 text-right w-20 font-bold">หน่วยละ</th>
                            <th class="py-1.5 text-right w-24 font-bold">จำนวนเงิน</th>
                        </tr>
                    </thead>
                    <tbody class="text-gray-700">
                        ${calc.details.map(d => `
                            <tr class="border-b border-gray-100 border-dashed">
                                <td class="py-1.5 pr-2 font-medium truncate max-w-[150px]">${d.name}</td>
                                <td class="py-1.5 text-center">${d.qty}</td>
                                <td class="py-1.5 text-right text-gray-500">${d.price.toLocaleString()}</td>
                                <td class="py-1.5 text-right font-bold">${d.subtotal.toLocaleString()}</td>
                            </tr>
                        `).join('')}
                        ${calc.details.length === 0 ? '<tr><td colspan="4" class="py-2 text-center text-gray-400">ไม่มีรายการชำระเงิน</td></tr>' : ''}
                    </tbody>
                    <tfoot>
                        <tr class="border-t-2 border-gray-900 font-bold text-sm">
                            <td colspan="3" class="py-2.5 text-right pr-3 text-gray-600 uppercase tracking-widest text-xs">ยอดชำระสุทธิ (Net Total)</td>
                            <td class="py-2.5 text-right text-green-700 text-base">฿${calc.total.toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>

                <div class="mt-auto flex justify-between pt-3 text-[10px] text-gray-600">
                    <div class="text-center w-32 border-t border-gray-400 pt-1">
                        <div>ผู้ชำระเงิน</div>
                        <div class="font-bold">(${this.getStudentName(student)})</div>
                    </div>
                    <div class="text-center w-32 border-t border-gray-400 pt-1">
                        <div>ผู้รับเงิน</div>
                        <div class="font-bold">(${this.data.settings.receiverName || 'เจ้าหน้าที่การเงิน'})</div>
                    </div>
                </div>
            </div>
        `;

        const r1 = receiptHtml(false);
        const r2 = receiptHtml(true);

        const printContent = '<div style="display: flex; flex-direction: column; width: 100%; height: 100%; padding: 0 12%; box-sizing: border-box; background: white;">' + r1 + r2 + '</div>';

        // Mark as paid (only if not viewing)
        if (!isViewOnly) {
            student.paymentStatus = 'paid';
            student.paidAt = new Date().toISOString();
            this.saveData();
            this.renderPoint4(); // Update UI
        }

        // Open Real Popup For Printing
        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(`
                <html>
                    <head>
                        <title>ใบเสร็จรับเงิน - ${this.escapeHtml(student.refCode)}</title>
                        <script src="https://cdn.tailwindcss.com"></script>
                        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@300;400;500;600;700&display=swap" rel="stylesheet">
                        <style>
                            body { font-family: 'Noto Sans Thai', sans-serif; background-color: #fff; margin: 0; padding: 0; }
                            @media print {
                                @page { margin: 0; size: A4 portrait; }
                                body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                            }
                        </style>
                    </head>
                    <body onload="setTimeout(function(){ window.print(); window.onafterprint = function(){ window.close(); } }, 500)">
                        ${printContent}
                    </body>
                </html>
            `);
            printWindow.document.close();
        } else {
            alert('กรุณาอนุญาต Pop-ups เพื่อพิมพ์ใบเสร็จ');
        }

        if (!isViewOnly) {
            this.showToast('ดำเนินการชำระเงินเสร็จสิ้น');
        }
    },

    // --- View Implementations ---
    renderDashboard() {
        const students = this.data.students;
        const paidStudents = students.filter(s => s.paymentStatus === 'paid');

        // Aggregations
        let totalRevenue = 0;
        let shirtTotalRevenue = 0, pantsTotalRevenue = 0, itemTotalRevenue = 0;
        const gradeGenderCount = {}; // { 'ม.1': { male: 0, female: 0 }, ... }
        const shirtRevenue = {};
        const pantsRevenue = {};
        const itemRevenue = {};

        students.forEach(s => {
            if (!gradeGenderCount[s.grade]) gradeGenderCount[s.grade] = { male: 0, female: 0 };
            const isFemale = s.title && (s.title === 'นางสาว' || s.title === 'ด.ญ.' || s.title === 'นาง');
            if (isFemale) gradeGenderCount[s.grade].female++;
            else gradeGenderCount[s.grade].male++;
        });

        paidStudents.forEach(s => {
            const calc = this.calculateStudentTotal(s);
            totalRevenue += calc.total;

            if (s.shirts) {
                s.shirts.forEach(sh => {
                    const u = this.data.settings.uniforms.find(x => x.id === sh.id);
                    if (u) {
                        shirtRevenue[sh.id] = shirtRevenue[sh.id] || { qty: 0, revenue: 0 };
                        shirtRevenue[sh.id].qty += sh.qty;
                        shirtRevenue[sh.id].revenue += sh.qty * u.price;
                        shirtTotalRevenue += sh.qty * u.price;
                    }
                });
            }
            if (s.pants) {
                s.pants.forEach(pa => {
                    const u = this.data.settings.uniforms.find(x => x.id === pa.id);
                    if (u) {
                        pantsRevenue[pa.id] = pantsRevenue[pa.id] || { qty: 0, revenue: 0 };
                        pantsRevenue[pa.id].qty += pa.qty;
                        pantsRevenue[pa.id].revenue += pa.qty * u.price;
                        pantsTotalRevenue += pa.qty * u.price;
                    }
                });
            }

            if (s.items) {
                s.items.forEach(i => {
                    const iDef = this.data.settings.items.find(x => x.id === i.id);
                    if (iDef) {
                        itemRevenue[i.id] = itemRevenue[i.id] || { qty: 0, revenue: 0 };
                        itemRevenue[i.id].qty += i.qty;
                        itemRevenue[i.id].revenue += i.qty * iDef.price;
                        itemTotalRevenue += i.qty * iDef.price;
                    }
                });
            }
        });

        // Helpers for rendering names
        const getUniformName = (id) => {
            const u = this.data.settings.uniforms.find(x => x.id === id);
            return u ? `ไซส์ ${u.size} ` : 'ไม่ทราบ';
        };
        const getItemName = (id) => {
            const i = this.data.settings.items.find(x => x.id === id);
            return i ? i.name : 'ไม่ทราบ';
        };

        // Grade Breakdown UI (with gender)
        const gradesHtml = Object.keys(gradeGenderCount).length === 0
            ? '<div class="text-sm text-gray-400">ยังไม่มีข้อมูล</div>'
            : Object.entries(gradeGenderCount).sort((a, b) => a[0].localeCompare(b[0])).map(([grade, gender]) => {
                let colorClass = 'bg-gray-100 text-gray-800';
                let badgeMale = 'bg-blue-200/60 text-blue-800';
                let badgeFemale = 'bg-pink-200/60 text-pink-800';
                if (grade === 'ม.1') { colorClass = 'bg-[#1e40af] text-white'; badgeMale = 'bg-white/20 text-white'; badgeFemale = 'bg-white/20 text-white'; }
                else if (grade === 'ม.4') { colorClass = 'bg-[#86198f] text-white'; badgeMale = 'bg-white/20 text-white'; badgeFemale = 'bg-white/20 text-white'; }
                const total = gender.male + gender.female;
                return `
                    <div class="${colorClass} flex justify-between items-center py-2.5 px-4 rounded-xl mb-2 shadow-sm">
                        <span class="font-bold text-sm">${grade}</span>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] ${badgeMale} px-2 py-0.5 rounded-full font-medium">ช ${gender.male}</span>
                            <span class="text-[11px] ${badgeFemale} px-2 py-0.5 rounded-full font-medium">ญ ${gender.female}</span>
                            <span class="font-bold text-base ml-1">${total}</span>
                        </div>
                    </div>
                `;
            }).join('');

        // Shirts Breakdown UI
        const shirtsHtml = Object.entries(shirtRevenue).length === 0
            ? '<div class="text-sm text-gray-400 text-center py-2">ยังไม่มีข้อมูลการสั่งซื้อ</div>'
            : Object.entries(shirtRevenue).sort((a, b) => b[1].revenue - a[1].revenue).map(([id, data]) => `
    <div class="flex justify-between items-center text-sm py-2 border-b border-gray-50 last:border-0" >
                    <span class="text-gray-600">${getUniformName(id)} <span class="text-gray-400 text-xs ml-1">(x${data.qty})</span></span>
                    <span class="font-bold text-gray-800 text-emerald-600">฿${data.revenue.toLocaleString()}</span>
                </div >
    `).join('');

        // Pants Breakdown UI
        const pantsHtml = Object.entries(pantsRevenue).length === 0
            ? '<div class="text-sm text-gray-400 text-center py-2">ยังไม่มีข้อมูลการสั่งซื้อ</div>'
            : Object.entries(pantsRevenue).sort((a, b) => b[1].revenue - a[1].revenue).map(([id, data]) => `
    <div class="flex justify-between items-center text-sm py-2 border-b border-gray-50 last:border-0" >
                    <span class="text-gray-600">${getUniformName(id)} <span class="text-gray-400 text-xs ml-1">(x${data.qty})</span></span>
                    <span class="font-bold text-gray-800 text-emerald-600">฿${data.revenue.toLocaleString()}</span>
                </div >
    `).join('');

        // Items Breakdown UI
        const itemsListHtml = Object.entries(itemRevenue).length === 0
            ? '<div class="text-sm text-gray-400 text-center py-2">ยังไม่มีข้อมูลการสั่งซื้อ</div>'
            : Object.entries(itemRevenue).sort((a, b) => b[1].revenue - a[1].revenue).map(([id, data]) => `
    <div class="flex justify-between items-center text-sm py-2 border-b border-gray-50 last:border-0" >
                    <span class="text-gray-600 truncate mr-2" title="${getItemName(id)}">${getItemName(id)} <span class="text-gray-400 text-xs ml-1">(x${data.qty})</span></span>
                    <span class="font-bold text-gray-800 text-emerald-600 whitespace-nowrap">฿${data.revenue.toLocaleString()}</span>
                </div >
    `).join('');

        document.getElementById('dashboardContent').innerHTML = `
            <div class="flex justify-between items-center mb-5">
                <h2 class="text-xl font-bold text-gray-800">ภาพรวมระบบ</h2>
                <button id="syncBtn" onclick="app.syncToGoogleSheets()" class="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-full font-bold text-xs transition-colors shadow-sm">
                    <i id="syncIcon" class="ph-bold ph-arrows-clockwise text-base"></i> โหลดข้อมูลล่าสุด
                </button>
            </div>
            
            <!--Top Summary Cards-->
            <div class="grid grid-cols-2 gap-4 mb-5">
                <div class="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-5 text-white shadow-soft fade-in relative overflow-hidden">
                    <div class="absolute -right-4 -top-4 opacity-20 transform rotate-12"><i class="ph-fill ph-users text-8xl"></i></div>
                    <div class="text-white/80 text-xs font-semibold tracking-wide uppercase mb-1">นักเรียนทั้งหมด</div>
                    <div class="text-4xl font-extrabold tracking-tight">${students.length} <span class="text-sm font-medium text-white/80">คน</span></div>
                    <div class="mt-3 text-[10px] bg-white/20 inline-block px-3 py-1 rounded-full backdrop-blur-md font-medium">
                        ชำระแล้ว ${paidStudents.length} คน
                    </div>
                </div>

                <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-3xl p-5 text-white shadow-soft fade-in relative overflow-hidden" style="animation-delay: 0.1s">
                    <div class="absolute -right-4 -top-4 opacity-20 transform -rotate-12"><i class="ph-fill ph-wallet text-8xl"></i></div>
                    <div class="text-white/80 text-xs font-semibold tracking-wide uppercase mb-1">ยอดรายรับรวม</div>
                    <div class="text-3xl font-extrabold tracking-tight truncate">฿${totalRevenue.toLocaleString()}</div>
                     <div class="mt-3 text-[10px] bg-white/20 inline-block px-3 py-1 rounded-full backdrop-blur-md font-medium">
                        รอชำระ ${students.length - paidStudents.length} คน
                    </div>
                </div>
            </div>

            <!-- Revenue Subtotals by Category -->
            <div class="grid grid-cols-3 gap-3 mb-5">
                <div class="bg-white rounded-2xl p-4 shadow-soft text-center border border-gray-100">
                    <i class="ph-fill ph-t-shirt text-xl text-yellow-500 mb-1"></i>
                    <div class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">ค่าเสื้อพละ</div>
                    <div class="text-lg font-extrabold text-gray-800">฿${shirtTotalRevenue.toLocaleString()}</div>
                </div>
                <div class="bg-white rounded-2xl p-4 shadow-soft text-center border border-gray-100">
                    <i class="ph-fill ph-pants text-xl text-indigo-400 mb-1"></i>
                    <div class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">ค่ากางเกงพละ</div>
                    <div class="text-lg font-extrabold text-gray-800">฿${pantsTotalRevenue.toLocaleString()}</div>
                </div>
                <div class="bg-white rounded-2xl p-4 shadow-soft text-center border border-gray-100">
                    <i class="ph-fill ph-handbag text-xl text-orange-400 mb-1"></i>
                    <div class="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">ยอดอุปกรณ์</div>
                    <div class="text-lg font-extrabold text-gray-800">฿${itemTotalRevenue.toLocaleString()}</div>
                </div>
            </div>

            <!--Grade Breakdown-->
            <div class="bg-white p-5 rounded-[2rem] shadow-soft mb-4 fade-in" style="animation-delay: 0.2s">
                <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm"><i class="ph-fill ph-chart-pie-slice text-orange-500"></i> จำนวนตามระดับชั้น</h3>
                <div>
                    ${gradesHtml}
                </div>
            </div>

            <!--Uniform Breakdown-->
            <div class="grid grid-cols-2 gap-4 mb-4">
                <div class="bg-white p-5 rounded-[2rem] shadow-soft fade-in" style="animation-delay: 0.3s">
                    <h3 class="font-bold text-gray-800 mb-1 flex items-center justify-between gap-2 text-sm">
                        <span class="flex items-center gap-1"><i class="ph-bold ph-t-shirt text-accent"></i> เสื้อพละ</span>
                        <span class="text-emerald-600 font-bold text-xs">฿${shirtTotalRevenue.toLocaleString()}</span>
                    </h3>
                    ${shirtsHtml}
                </div>
                <div class="bg-white p-5 rounded-[2rem] shadow-soft fade-in" style="animation-delay: 0.4s">
                    <h3 class="font-bold text-gray-800 mb-1 flex items-center justify-between gap-2 text-sm">
                        <span class="flex items-center gap-1"><i class="ph-bold ph-pants text-secondary"></i> กางเกงพละ</span>
                        <span class="text-emerald-600 font-bold text-xs">฿${pantsTotalRevenue.toLocaleString()}</span>
                    </h3>
                    ${pantsHtml}
                </div>
            </div>

            <!--Other Items Breakdown-->
    <div class="bg-white p-5 rounded-[2rem] shadow-soft mb-4 fade-in" style="animation-delay: 0.5s">
        <h3 class="font-bold text-gray-800 mb-3 flex items-center justify-between gap-2 text-sm">
            <span class="flex gap-1 items-center"><i class="ph-fill ph-handbag text-[#FF4500]"></i> ยอดสั่งซื้อรายการอื่นๆ</span>
            <span class="text-emerald-600 font-bold text-xs">฿${itemTotalRevenue.toLocaleString()}</span>
        </h3>
        <div>
            ${itemsListHtml}
        </div>
    </div>
`;
    },

    getGradeColorBox(grade) {
        if (grade === 'ม.1') return 'bg-blue-100 text-blue-600 border-none';
        if (grade === 'ม.4') return 'bg-orange-100 text-orange-600 border-none';
        return 'bg-gray-100 text-gray-600 border-none';
    },

    renderPoint1() {
        const pendingStudents = this.data.students.filter(s => s.paymentStatus === 'pending');

        const listHtml = pendingStudents.length === 0
            ? '<div class="text-center text-gray-400 py-8 text-sm"><i class="ph-fill ph-users text-5xl mb-3 opacity-50"></i><br>ยังไม่มีรายชื่อนักเรียน</div>'
            : pendingStudents.map(s => `
                <div class="bg-white p-4 rounded-2xl shadow-soft flex justify-between items-center mb-3 fade-in transition-all active:scale-[0.98]">
                    <div class="flex items-center gap-4">
                        <div class="font-bold w-12 h-12 flex items-center justify-center rounded-full text-sm ${this.getGradeColorBox(s.grade)}">${s.grade}</div>
                        <div>
                            <div class="font-bold text-gray-800 text-base flex items-center gap-1">
                                ${this.escapeHtml(s.title || '')} ${this.escapeHtml(s.firstName)} ${this.escapeHtml(s.lastName)}
                                <button onclick="app.openEditStudentModal('${s.id}')" class="text-gray-300 hover:text-orange-500 transition-colors ml-1"><i class="ph-bold ph-pencil-simple text-sm"></i></button>
                            </div>
                            <div class="text-xs text-gray-400 font-mono mt-0.5 tracking-wide">${this.escapeHtml(s.refCode)}</div>
                        </div>
                    </div>
                    <button onclick="app.deleteStudent('${s.id}')" class="text-gray-300 hover:text-red-500 hover:bg-red-50 w-10 h-10 flex items-center justify-center rounded-full transition-colors"><i class="ph-bold ph-trash"></i></button>
                </div>
            `).join('');

        document.getElementById('point1Content').innerHTML = `
    <!--Registration Form-->
            <div class="bg-white p-6 rounded-[2rem] shadow-soft mb-8 relative overflow-hidden">
                <div class="absolute top-0 right-0 w-32 h-32 bg-orange-100 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                <h3 class="font-bold text-gray-800 mb-5 flex items-center gap-2 relative z-10 text-lg"><i class="ph-fill ph-user-plus text-orange-500"></i> เพิ่มรายชื่อนักเรียน</h3>
                
                <form onsubmit="app.addStudent(event)" class="space-y-4 relative z-10">
                    <div class="flex flex-col md:flex-row gap-3">
                        <div class="w-full md:w-32 shrink-0">
                            <label class="block text-xs font-semibold text-gray-500 mb-1.5">คำนำหน้า</label>
                            <select id="regTitle" required class="bg-gray-50 border border-transparent rounded-xl px-3 py-3 w-full focus:bg-white focus:ring-2 focus:ring-orange-100 focus:border-orange-300 outline-none transition-all text-sm font-medium">
                                <option value="ด.ช.">ด.ช.</option>
                                <option value="ด.ญ.">ด.ญ.</option>
                                <option value="นาย">นาย</option>
                                <option value="นางสาว">นางสาว</option>
                            </select>
                        </div>
                        <div class="flex-1">
                            <label class="block text-xs font-semibold text-gray-500 mb-1.5">ชื่อ</label>
                            <input type="text" id="regFirstName" required class="bg-gray-50 border border-transparent rounded-xl px-4 py-3 w-full focus:bg-white focus:ring-2 focus:ring-orange-100 focus:border-orange-300 outline-none transition-all text-sm font-medium">
                        </div>
                        <div class="flex-1">
                            <label class="block text-xs font-semibold text-gray-500 mb-1.5">นามสกุล</label>
                            <input type="text" id="regLastName" required class="bg-gray-50 border border-transparent rounded-xl px-4 py-3 w-full focus:bg-white focus:ring-2 focus:ring-orange-100 focus:border-orange-300 outline-none transition-all text-sm font-medium">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-xs font-semibold text-gray-500 mb-1.5">ระดับชั้น</label>
                        <select id="regGrade" required class="bg-gray-50 border border-transparent rounded-xl px-4 py-3 w-full focus:bg-white focus:ring-2 focus:ring-orange-100 focus:border-orange-300 outline-none transition-all text-sm font-medium">
                            <option value="ม.1">มัธยมศึกษาปีที่ 1 (ม.1)</option>
                            <option value="ม.4">มัธยมศึกษาปีที่ 4 (ม.4)</option>
                            <option value="อื่นๆ">อื่นๆ</option>
                        </select>
                    </div>
                    
                    <button type="submit" class="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-xl px-4 py-3.5 mt-4 hover:from-orange-600 hover:to-amber-600 transition-all active:scale-[0.98] shadow-md text-base flex items-center justify-center gap-2">
                        <i class="ph-bold ph-plus-circle"></i> ลงทะเบียน
                    </button>
                </form>
            </div>

            <!--Pending List-->
    <div>
        <h3 class="font-bold text-gray-800 mb-4 flex items-center justify-between">
            <span class="flex items-center gap-2 text-lg"><i class="ph-fill ph-users text-orange-500"></i> รอชำระเงิน</span>
            <span class="bg-orange-100 text-orange-600 text-xs font-bold px-3 py-1 rounded-full">${pendingStudents.length} คน</span>
        </h3>
        <div class="space-y-1">
            ${listHtml}
        </div>
    </div>
`;
    },

    renderPoint2() {
        const uniforms = this.data.settings.uniforms;
        const shirts = uniforms.filter(u => u.type === 'shirt');
        const pants = uniforms.filter(u => u.type === 'pants');

        // Split students
        const pendingStudents = this.data.students.filter(s => s.paymentStatus === 'pending');
        const p2Pending = pendingStudents.filter(s => !s.p2Confirmed);
        const p2Confirmed = pendingStudents.filter(s => s.p2Confirmed);

        const renderSizeGroup = (type, sizes, s) => sizes.map(u => {
            const arrayProp = type === 'shirt' ? (s.shirts || []) : (s.pants || []);
            const existing = arrayProp.find(i => i.id === u.id);
            const qty = existing ? existing.qty : 0;

            return `
                <div class="flex items-center gap-1 bg-gray-50 rounded-xl px-1.5 py-1 border border-gray-100 shrink-0 shadow-inner ${qty > 0 ? 'ring-1 ring-orange-200 bg-orange-50/30' : ''}">
                    <span class="text-xs font-bold text-gray-700 px-1 w-6 text-center">${u.size}</span>
                    <div class="flex items-center gap-1 bg-white rounded-lg shadow-sm px-1 py-0.5 border border-gray-100/50">
                        <button onclick="app.updateUniformQtyP2_New('${s.id}', '${u.id}', '${type}', -1)" class="w-5 h-5 flex items-center justify-center rounded-md text-gray-400 hover:text-orange-500 hover:bg-orange-50 transition-colors"><i class="ph-bold ph-minus text-[10px]"></i></button>
                        <span class="w-3 text-center text-xs font-bold text-gray-800">${qty}</span>
                        <button onclick="app.updateUniformQtyP2_New('${s.id}', '${u.id}', '${type}', 1)" class="w-5 h-5 flex items-center justify-center rounded-md text-orange-500 hover:bg-orange-50 transition-colors drop-shadow-xs"><i class="ph-bold ph-plus text-[10px]"></i></button>
                    </div>
                </div>
            `;
        }).join('');

        const renderCard = (s, isConfirmed) => {
            const shirtsCount = s.shirts ? s.shirts.reduce((sum, i) => sum + i.qty, 0) : 0;
            const pantsCount = s.pants ? s.pants.reduce((sum, i) => sum + i.qty, 0) : 0;
            const totalUniforms = shirtsCount + pantsCount;
            const calc = this.calculateStudentTotal(s);

            let statusBadge = '<span class="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-md">ยังไม่เลือก</span>';
            if (isConfirmed) {
                statusBadge = `<span class="bg-primary text-white text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-bold shadow-sm"><i class="ph ph-check-circle"></i> ยืนยันแล้ว (${totalUniforms})</span>`;
            } else if (totalUniforms > 0) {
                statusBadge = `<span class="bg-orange-100 text-orange-600 border border-orange-200 text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 font-medium"><i class="ph ph-clock"></i> รอการยืนยัน (${totalUniforms})</span>`;
            }

            if (isConfirmed) {
                // Simplified card for confirmed list
                return `
                    <div class="bg-white rounded-xl shadow-sm border border-primary ring-1 ring-primary/20 mb-2 p-3 flex items-center justify-between" id="p2_card_${s.id}">
                        <div class="flex items-center gap-2 overflow-hidden">
                            <div class="font-bold w-8 h-8 flex items-center justify-center rounded-full text-[10px] ${this.getGradeColorBox(s.grade)} shrink-0">${s.grade}</div>
                            <div class="truncate">
                                <div class="font-bold text-gray-800 text-xs truncate">${this.escapeHtml(s.firstName)} ${this.escapeHtml(s.lastName)}</div>
                                <div class="text-[9px] text-gray-400 font-mono">${this.escapeHtml(s.refCode)} · ฿${calc.total.toLocaleString()}</div>
                            </div>
                        </div>
                        <button onclick="app.updateUniformQtyP2_New('${s.id}', '', 'shirt', 0) /* trigger edit mode */" class="bg-gray-100 text-gray-500 font-bold text-[10px] px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors shrink-0 ml-2"><i class="ph-bold ph-pencil-simple"></i> แก้ไข</button>
                    </div>
                `;
            }

            // Full card for pending list
            return `
                <div class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 hover:border-orange-100 hover:shadow-md mb-3 px-4 py-3 flex flex-col xl:flex-row xl:items-start gap-4 transition-all" id="p2_card_${s.id}">
                    <div class="flex items-center gap-3 xl:w-56 shrink-0 relative pt-1">
                        <div class="font-bold w-12 h-12 flex items-center justify-center rounded-full text-xs ${this.getGradeColorBox(s.grade)} shrink-0">${s.grade}</div>
                        <div class="overflow-hidden flex-1">
                            <div class="font-bold text-gray-800 text-sm truncate w-full flex items-center gap-1">
                                ${this.escapeHtml(s.firstName)} ${this.escapeHtml(s.lastName)}
                                <button onclick="app.openEditStudentModal('${s.id}')" class="text-gray-300 hover:text-orange-500 transition-colors ml-1"><i class="ph-bold ph-pencil-simple text-sm"></i></button>
                            </div>
                            <div class="text-[10px] text-gray-400 font-mono mt-0.5 flex flex-wrap items-center gap-1">
                                ${this.escapeHtml(s.refCode)} ${statusBadge}
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex-1 flex flex-col gap-3 pb-1 xl:pb-0">
                        <div class="flex items-start gap-2 shrink-0">
                            <div class="bg-green-50 w-7 h-7 flex items-center justify-center rounded-lg text-green-600 shadow-sm shrink-0"><i class="ph-fill ph-t-shirt text-sm"></i></div>
                            <div class="flex gap-2 flex-wrap">
                                ${renderSizeGroup('shirt', shirts, s)}
                            </div>
                        </div>
                        
                        <div class="flex items-start gap-2 shrink-0">
                            <div class="bg-green-50 w-7 h-7 flex items-center justify-center rounded-lg text-green-600 shadow-sm shrink-0"><i class="ph-fill ph-pants text-sm"></i></div>
                            <div class="flex gap-2 flex-wrap">
                                ${renderSizeGroup('pants', pants, s)}
                            </div>
                        </div>
                    </div>
                    
                    <div class="xl:w-28 shrink-0 flex flex-col items-end gap-2 border-t xl:border-t-0 border-gray-100 pt-3 xl:pt-1 mt-1 xl:mt-0">
                        <div class="text-xs text-gray-500 font-bold whitespace-nowrap mb-1">รวม: <span class="text-emerald-600 text-[15px]">฿${calc.total.toLocaleString()}</span></div>
                        <button onclick="app.confirmP2('${s.id}')" class="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md hover:from-orange-600 hover:to-amber-600 transition-all active:scale-95"><i class="ph-bold ph-check-circle"></i> ยืนยัน</button>
                    </div>
                </div>
            `;
        };

        const pendingHtml = p2Pending.length === 0
            ? '<div class="text-center text-gray-400 py-10 text-sm"><i class="ph-fill ph-check-circle text-5xl mb-3 text-emerald-400 opacity-50"></i><br>ไม่มีรายการรอเลือกชุดพละ</div>'
            : p2Pending.map(s => renderCard(s, false)).join('');

        const confirmedHtml = p2Confirmed.length === 0
            ? '<div class="text-center text-gray-400 py-6 text-[10px]">ยังไม่มีรายการยืนยันแล้ว</div>'
            : p2Confirmed.map(s => renderCard(s, true)).join('');

        document.getElementById('point2Content').innerHTML = `
            <div class="flex flex-col lg:flex-row gap-6 items-start">
                <div class="flex-1 w-full max-w-full">
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center justify-between">
                        <span class="flex items-center gap-2 pr-2 text-base"><i class="ph-fill ph-user-circle text-orange-500"></i> รอเลือกไซส์</span>
                        <span class="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">${p2Pending.length}</span>
                    </h3>
                    <div class="space-y-1">
                        ${pendingHtml}
                    </div>
                </div>
                
                <div class="w-full lg:w-80 shrink-0 bg-gray-50 rounded-2xl p-4 border border-gray-100 order-first lg:order-last sticky top-24">
                    <h3 class="font-bold text-gray-800 mb-3 flex items-center justify-between">
                        <span class="flex items-center gap-2 text-sm"><i class="ph-fill ph-check-circle text-primary"></i> ยืนยันแล้ว</span>
                        <span class="bg-green-100 text-primary text-xs font-bold px-2 py-0.5 rounded-full">${p2Confirmed.length}</span>
                    </h3>
                    <div class="space-y-1 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                        ${confirmedHtml}
                    </div>
                </div>
            </div>
        `;
    },

    renderPoint3() {
        const items = this.data.settings.items;

        // Split students
        const pendingStudents = this.data.students.filter(s => s.paymentStatus === 'pending');
        const p3Pending = pendingStudents.filter(s => !s.p3Confirmed);
        const p3Confirmed = pendingStudents.filter(s => s.p3Confirmed);

        const renderCard = (s, isConfirmed) => {
            const itemsCount = s.items.reduce((sum, i) => sum + i.qty, 0);
            const calc = this.calculateStudentTotal(s);

            let statusBadge = '<span class="bg-gray-100 text-gray-400 font-mono text-[10px] px-2 py-0.5 rounded-full">ยังไม่เลือก</span>';
            if (isConfirmed) {
                statusBadge = `<span class="bg-primary text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold shadow-sm"><i class="ph-bold ph-check"></i> ยืนยันแล้ว (${itemsCount})</span>`;
            } else if (itemsCount > 0) {
                statusBadge = `<span class="bg-orange-100 text-orange-600 border border-orange-200 text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold"><i class="ph-bold ph-clock"></i> รอตรวจสอบ (${itemsCount})</span>`;
            }

            if (isConfirmed) {
                // Simplified card for confirmed list
                return `
                    <div class="bg-white rounded-xl shadow-sm border border-primary ring-1 ring-primary/20 mb-2 p-3 flex items-center justify-between" id="p3_card_${s.id}">
                        <div class="flex items-center gap-2 overflow-hidden">
                            <div class="font-bold w-8 h-8 flex items-center justify-center rounded-full text-[10px] ${this.getGradeColorBox(s.grade)} shrink-0">${s.grade}</div>
                            <div class="truncate">
                                <div class="font-bold text-gray-800 text-xs truncate">${this.escapeHtml(s.firstName)} ${this.escapeHtml(s.lastName)}</div>
                                <div class="text-[9px] text-gray-400 font-mono">${this.escapeHtml(s.refCode)} · ฿${calc.total.toLocaleString()}</div>
                            </div>
                        </div>
                        <button onclick="app.updateSingleItemP3('${s.id}', '', 0) /* trigger edit mode */" class="bg-gray-100 text-gray-500 font-bold text-[10px] px-3 py-1.5 rounded-lg hover:bg-gray-200 transition-colors shrink-0 ml-2"><i class="ph-bold ph-pencil-simple"></i> แก้ไข</button>
                    </div>
                `;
            }

            const renderItemsInline = items.map(item => {
                const existing = s.items.find(i => i.id === item.id);
                const qty = existing ? existing.qty : 0;
                const isMandatory = item.mandatory === true;
                const isAtMin = isMandatory && qty <= 1;

                return `
                    <div class="flex items-center gap-2 bg-gray-50 rounded-2xl p-1.5 border border-gray-100 shrink-0 shadow-inner hover:bg-orange-50 transition-colors ${qty > 0 ? 'ring-1 ring-orange-200 bg-orange-50/50' : ''} ${isMandatory ? 'bg-red-50/50 border-red-100' : ''}">
                        <span class="text-xs font-bold text-gray-700 pl-2 pr-1 truncate max-w-[120px] flex items-center gap-1" title="${item.name}">
                            ${item.name}
                            ${isMandatory ? '<span class="text-[8px] bg-red-100 text-red-500 px-1 rounded font-bold">บังคับ</span>' : ''}
                        </span>
                        <div class="flex items-center gap-1 bg-white rounded-xl shadow-sm px-1 py-0.5 border border-gray-100/50">
                            <button onclick="app.updateSingleItemP3('${s.id}', '${item.id}', -1)" class="w-6 h-6 flex items-center justify-center rounded-full transition-colors ${isAtMin ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'}" ${isAtMin ? 'disabled' : ''}><i class="ph-bold ph-minus text-xs"></i></button>
                            <span class="w-4 text-center text-xs font-bold text-gray-800">${qty}</span>
                            <button onclick="app.updateSingleItemP3('${s.id}', '${item.id}', 1)" class="w-6 h-6 flex items-center justify-center rounded-full text-orange-500 hover:bg-orange-50 transition-colors drop-shadow-sm"><i class="ph-bold ph-plus text-xs"></i></button>
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 hover:border-orange-100 hover:shadow-md mb-3 px-4 py-3 flex flex-col xl:flex-row xl:items-start gap-4 transition-all" id="p3_card_${s.id}">
                    <div class="flex items-center gap-3 xl:w-56 shrink-0 relative pt-1">
                        <div class="font-bold w-12 h-12 flex items-center justify-center rounded-full text-xs ${this.getGradeColorBox(s.grade)} shrink-0">${s.grade}</div>
                        <div class="overflow-hidden flex-1">
                            <div class="font-bold text-gray-800 text-sm truncate w-full flex items-center gap-1">
                                ${this.escapeHtml(s.firstName)} ${this.escapeHtml(s.lastName)}
                                <button onclick="app.openEditStudentModal('${s.id}')" class="text-gray-300 hover:text-orange-500 transition-colors ml-1"><i class="ph-bold ph-pencil-simple text-sm"></i></button>
                            </div>
                            <div class="text-[10px] text-gray-400 font-mono mt-0.5 flex flex-wrap items-center gap-1">
                                ${this.escapeHtml(s.refCode)} ${statusBadge}
                            </div>
                        </div>
                    </div>
                    
                    <div class="flex-1 flex gap-2 flex-wrap pb-1 xl:pb-0">
                        ${renderItemsInline}
                    </div>
                    
                    <div class="xl:w-28 shrink-0 flex flex-col items-end gap-2 border-t xl:border-t-0 border-gray-100 pt-3 xl:pt-1 mt-1 xl:mt-0">
                        <div class="text-xs text-gray-500 font-bold whitespace-nowrap mb-1">รวม: <span class="text-emerald-600 text-[15px]">฿${calc.total.toLocaleString()}</span></div>
                        <button onclick="app.confirmP3('${s.id}')" class="bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-md hover:from-orange-600 hover:to-amber-600 transition-all active:scale-95"><i class="ph-bold ph-check-circle"></i> ยืนยัน</button>
                    </div>
                </div>
            `;
        };

        const pendingHtml = p3Pending.length === 0
            ? '<div class="text-center text-gray-400 py-10 text-sm"><i class="ph-fill ph-check-circle text-5xl mb-3 text-emerald-400 opacity-50"></i><br>ไม่มีรายการรอตรวจสอบอุปกรณ์</div>'
            : p3Pending.map(s => renderCard(s, false)).join('');

        const confirmedHtml = p3Confirmed.length === 0
            ? '<div class="text-center text-gray-400 py-6 text-[10px]">ยังไม่มีรายการยืนยันแล้ว</div>'
            : p3Confirmed.map(s => renderCard(s, true)).join('');

        document.getElementById('point3Content').innerHTML = `
            <div class="flex flex-col lg:flex-row gap-6 items-start">
                <div class="flex-1 w-full max-w-full">
                    <h3 class="font-bold text-gray-800 mb-4 flex items-center justify-between">
                        <span class="flex items-center gap-2 pr-2 text-base"><i class="ph-fill ph-handbag text-orange-500"></i> รอสั่งซื้ออุปกรณ์</span>
                        <span class="bg-orange-100 text-orange-600 text-xs font-bold px-2 py-0.5 rounded-full">${p3Pending.length}</span>
                    </h3>
                    <div class="space-y-1">
                        ${pendingHtml}
                    </div>
                </div>
                
                <div class="w-full lg:w-80 shrink-0 bg-gray-50 rounded-2xl p-4 border border-gray-100 order-first lg:order-last sticky top-24">
                    <h3 class="font-bold text-gray-800 mb-3 flex items-center justify-between">
                        <span class="flex items-center gap-2 text-sm"><i class="ph-fill ph-check-circle text-primary"></i> ยืนยันแล้ว</span>
                        <span class="bg-green-100 text-primary text-xs font-bold px-2 py-0.5 rounded-full">${p3Confirmed.length}</span>
                    </h3>
                    <div class="space-y-1 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
                        ${confirmedHtml}
                    </div>
                </div>
            </div>
        `;
    },

    showChangeFinancePinModal() {
        const modalHtml = `
            <div id="changePinModal" class="fixed inset-0 bg-black/50 z-50 hidden items-center justify-center p-4 backdrop-blur-sm">
                <div class="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-floating">
                    <div class="text-center mb-6">
                        <div class="w-16 h-16 bg-secondary/10 text-secondary rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <i class="ph-fill ph-key text-3xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-800">เปลี่ยนรหัสผ่าน</h3>
                        <p class="text-xs text-secondary font-bold tracking-wide mt-2">เจ้าหน้าที่การเงิน</p>
                    </div>
                    
                    <div class="space-y-4 mb-6">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-2">รหัสผ่านใหม่</label>
                            <input type="password" id="newFinancePin" maxlength="6" inputmode="numeric" class="w-full text-center text-2xl tracking-[0.5em] font-mono border-2 border-gray-100 rounded-2xl py-3 focus:border-secondary focus:ring-0 outline-none transition-colors bg-gray-50/50 text-gray-800 font-bold" placeholder="••••••">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-2">ยืนยันรหัสผ่าน</label>
                            <input type="password" id="confirmFinancePin" maxlength="6" inputmode="numeric" class="w-full text-center text-2xl tracking-[0.5em] font-mono border-2 border-gray-100 rounded-2xl py-3 focus:border-secondary focus:ring-0 outline-none transition-colors bg-gray-50/50 text-gray-800 font-bold" placeholder="••••••">
                        </div>
                    </div>
                    
                    <div class="flex gap-3">
                        <button onclick="document.getElementById('changePinModal').remove()" class="flex-1 py-3 text-gray-500 font-bold bg-gray-100 hover:bg-gray-200 rounded-full transition-colors text-base">ยกเลิก</button>
                        <button onclick="app.changeFinancePin()" class="flex-1 py-3 text-white font-bold bg-secondary hover:bg-gray-800 rounded-full transition-all shadow-lg text-base">บันทึก</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = document.getElementById('changePinModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.getElementById('newFinancePin').focus();
    },

    changeFinancePin() {
        const newPin = document.getElementById('newFinancePin').value;
        const confirmPin = document.getElementById('confirmFinancePin').value;

        if (!newPin || newPin.length < 4) {
            this.showToast('รหัสผ่านต้องมีอย่างน้อย 4 หลัก', 'error');
            return;
        }

        if (newPin !== confirmPin) {
            this.showToast('รหัสผ่านไม่ตรงกัน', 'error');
            return;
        }

        this.data.settings.financePin = newPin;
        this.saveData();
        document.getElementById('changePinModal').remove();
        this.showToast('เปลี่ยนรหัสผ่านสำเร็จ');
    },

    renderPoint4() {
        const pendingStudents = this.data.students.filter(s => s.paymentStatus === 'pending' && s.p2Confirmed && s.p3Confirmed);
        const paidStudents = this.data.students.filter(s => s.paymentStatus === 'paid');

        if (this.state.p4Tab === undefined) {
            this.state.p4Tab = 'pending';
        }
        const currentTab = this.state.p4Tab;

        // Right side: Lists (Pending/Paid)
        const renderListItems = (list, isPaid) => {
            if (list.length === 0) return `<div class="text-center text-gray-400 py-10 text-xs mt-4">ไม่มีรายชื่อนักเรียน</div>`;
            return list.map(s => {
                const isActive = this.state.p4StudentId === s.id;
                const calc = this.calculateStudentTotal(s);
                return `
                    <div class="p-4 bg-white rounded-2xl mb-2 cursor-pointer transition-all border ${isActive ? 'border-primary ring-1 ring-primary shadow-md' : 'border-gray-100 hover:border-gray-300'}" onclick="app.selectStudentP4('${s.id}')">
                        <div class="flex justify-between items-center">
                            <div>
                                <div class="font-bold text-gray-800 text-sm whitespace-nowrap overflow-hidden text-ellipsis flex items-center gap-1">
                                    ${this.escapeHtml(s.firstName)} ${this.escapeHtml(s.lastName)}
                                    ${!isPaid ? `<button onclick="event.stopPropagation(); app.openEditStudentModal('${s.id}')" class="text-gray-300 hover:text-orange-500 transition-colors ml-1"><i class="ph-bold ph-pencil-simple text-xs"></i></button>` : ''}
                                </div>
                                <div class="text-[10px] text-gray-400 font-mono mt-0.5">${this.escapeHtml(s.refCode)} - ${this.escapeHtml(s.grade)}</div>
                            </div>
                            <div class="text-right">
                                <div class="font-bold ${isPaid ? 'text-primary' : 'text-gray-800'} text-xs">฿${calc.total.toLocaleString()}</div>
                                ${isPaid ? `<div class="text-[10px] text-primary mt-0.5"><i class="ph-fill ph-check-circle"></i> ชำระแล้ว</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        };

        const listContent = currentTab === 'pending' ? renderListItems(pendingStudents, false) : renderListItems(paidStudents, true);

        // Left side: Student Details & Action
        let detailHtml = '<div class="h-full flex flex-col items-center justify-center text-gray-400 min-h-[400px]"><i class="ph-fill ph-receipt text-6xl mb-4 text-gray-200"></i><p>เลือกรายชื่อนักเรียนจากรายการด้านขวาเพื่อทำรายการ</p></div>';

        if (this.state.p4StudentId) {
            const student = this.data.students.find(s => s.id === this.state.p4StudentId);
            if (student) {
                const calc = this.calculateStudentTotal(student);
                const isPaid = student.paymentStatus === 'paid';

                const summaryHtml = calc.details.length === 0 ? '<div class="text-gray-400 text-sm py-4 text-center font-medium">ไม่มีรายการสั่งซื้อ</div>' : calc.details.map(d => {
                    if (isPaid) {
                        return `
                        <div class="flex justify-between items-center text-sm py-2.5 border-b border-gray-100 last:border-0 text-gray-700">
                            <div class="flex-1 font-medium">${d.name} <span class="bg-gray-100 text-gray-500 font-bold px-1.5 py-0.5 rounded-md text-[10px] ml-2">x${d.qty}</span></div>
                            <div class="font-bold text-gray-900">฿${d.subtotal.toLocaleString()}</div>
                        </div>`;
                    } else {
                        // Editable mode for Unpaid
                        const isMandatory = d.mandatory === true;
                        let incrementBtn = '';
                        let decrementBtn = '';

                        // Uniform items (uId format) vs regular items (iId format)
                        if (d.id.startsWith('u')) {
                            // Can't easily map exact uniform sizes in P4 summary without splitting model, 
                            // fallback to static text for uniforms in P4 for now, or just allow basic removal if not mandatory
                            return `
                            <div class="flex justify-between items-center text-sm py-2.5 border-b border-gray-100 last:border-0 text-gray-700">
                                <div class="flex-1 font-medium">${d.name} <span class="bg-gray-100 text-gray-500 font-bold px-1.5 py-0.5 rounded-md text-[10px] ml-2">x${d.qty}</span></div>
                                <div class="font-bold text-gray-900">฿${d.subtotal.toLocaleString()}</div>
                            </div>`;
                        } else {
                            // Regular item
                            const isAtMin = isMandatory && d.qty <= 1;
                            return `
                            <div class="flex justify-between items-center text-sm py-2.5 border-b border-gray-100 last:border-0 text-gray-700">
                                <div class="flex-1 font-medium flex items-center gap-2">
                                    ${d.name} 
                                    ${isMandatory ? '<span class="text-[9px] bg-red-50 text-red-500 px-1 rounded border border-red-100 font-bold">บังคับ</span>' : ''}
                                </div>
                                <div class="flex items-center gap-3">
                                    <div class="flex items-center gap-1 bg-white rounded-xl shadow-sm px-1 py-0.5 border border-gray-200">
                                        <button onclick="app.updateSingleItemP3('${student.id}', '${d.id}', -1)" class="w-7 h-7 flex items-center justify-center rounded-full transition-colors ${isAtMin ? 'text-gray-200 cursor-not-allowed' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'}" ${isAtMin ? 'disabled' : ''}><i class="ph-bold ph-minus text-xs"></i></button>
                                        <span class="w-6 text-center text-sm font-bold text-gray-800">${d.qty}</span>
                                        <button onclick="app.updateSingleItemP3('${student.id}', '${d.id}', 1)" class="w-7 h-7 flex items-center justify-center rounded-full text-orange-500 hover:bg-orange-50 transition-colors drop-shadow-sm"><i class="ph-bold ph-plus text-xs"></i></button>
                                    </div>
                                    <div class="font-bold text-gray-900 w-16 text-right">฿${d.subtotal.toLocaleString()}</div>
                                </div>
                            </div>`;
                        }
                    }
                }).join('');

                detailHtml = `
                    <div class="bg-white rounded-[2rem] shadow-soft p-6 md:p-8">
                        <div class="flex items-center gap-5 justify-between mb-8 pb-6 border-b border-gray-100">
                            <div class="flex items-center gap-4">
                                <div class="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center text-2xl font-bold">
                                    <i class="ph-fill ph-user"></i>
                                </div>
                                <div>
                                    <h3 class="text-xl font-bold text-gray-900">${this.escapeHtml(student.title || '')} ${this.escapeHtml(student.firstName)} ${this.escapeHtml(student.lastName)}</h3>
                                    <p class="text-sm text-gray-500 font-mono mt-1">${this.escapeHtml(student.refCode)} | ${this.escapeHtml(student.grade)}</p>
                                </div>
                            </div>
                            <div class="text-right">
                                ${isPaid
                        ? `<span class="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"><i class="ph-fill ph-check-circle"></i> ชำระแล้ว</span>`
                        : `<span class="bg-orange-100 text-orange-600 text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1"><i class="ph-fill ph-clock"></i> รอชำระ</span>`
                    }
                            </div>
                        </div>

                        <h4 class="text-xs font-bold text-gray-400 mb-4 uppercase tracking-widest">สรุปรายการสั่งซื้อ</h4>
                        <div class="bg-gray-50 p-5 rounded-2xl border border-gray-100 mb-8 min-h-[150px]">
                            ${summaryHtml}
                        </div>
                        
                        <div class="flex justify-between items-center mb-8 bg-primary/5 p-6 rounded-2xl border border-primary/10">
                            <div class="text-sm font-bold text-primary uppercase tracking-wider">ยอดชำระสุทธิ</div>
                            <div class="text-4xl font-extrabold text-primary">฿${calc.total.toLocaleString()}</div>
                        </div>
                        
                        <!-- Action Buttons -->
                        ${isPaid ? `
                            <div class="grid grid-cols-2 gap-4">
                                <button onclick="app.viewReceipt('${student.id}')" class="flex justify-center items-center gap-2 py-4 bg-gray-100 text-gray-700 text-sm font-bold rounded-xl hover:bg-gray-200 transition-all">
                                    <i class="ph-bold ph-eye text-lg"></i> ดูใบเสร็จซ้ำ
                                </button>
                                <button onclick="app.downloadPdfReceipt('${student.id}')" class="flex justify-center items-center gap-2 py-4 bg-red-50 text-red-600 text-sm font-bold rounded-xl hover:bg-red-100 transition-all">
                                    <i class="ph-bold ph-file-pdf text-lg"></i> โหลด PDF
                                </button>
                            </div>
                        ` : `
                            <button onclick="app.processPayment('${student.id}')" class="w-full flex justify-center items-center gap-2 py-4 bg-secondary text-white text-lg font-bold rounded-full hover:bg-opacity-90 transition-all shadow-lg active:scale-[0.98]">
                                <i class="ph-bold ph-printer text-2xl"></i> ชำระเงิน & พิมพ์ใบเสร็จ
                            </button>
                        `}
                    </div>
                `;
            }
        }

        document.getElementById('point4Content').innerHTML = `
            <div class="md:grid md:grid-cols-3 gap-6">
                
                <!-- Left: Detail Area (Action) -->
                <div class="md:col-span-2 order-2 md:order-1 mt-6 md:mt-0">
                    ${detailHtml}
                </div>

                <!-- Right: Lists area (Sidebar) -->
                <div class="md:col-span-1 order-1 md:order-2 bg-gray-50 rounded-3xl p-4 border border-gray-100 h-fit max-h-[800px] overflow-hidden flex flex-col">
                    <!-- Header with PIN change button -->
                    <div class="flex justify-between items-center mb-4">
                        <div class="text-sm font-bold text-gray-500 uppercase tracking-wider">รายชื่อนักเรียน</div>
                        ${this.state.auth.finance ? `<button onclick="app.showChangeFinancePinModal()" class="text-xs text-gray-400 hover:text-primary flex items-center gap-1 transition-colors"><i class="ph-bold ph-key"></i> เปลี่ยนรหัส</button>` : ''}
                    </div>
                    
                    <!-- Tabs -->
                    <div class="flex bg-white p-1 rounded-xl mb-4 shadow-sm">
                        <button onclick="app.switchTabP4('pending')" class="flex-1 py-2 rounded-lg font-bold text-xs transition-all ${currentTab === 'pending' ? 'bg-secondary text-white shadow' : 'text-gray-500 hover:text-gray-800'}">
                            รอชำระ (${pendingStudents.length})
                        </button>
                        <button onclick="app.switchTabP4('paid')" class="flex-1 py-2 rounded-lg font-bold text-xs transition-all ${currentTab === 'paid' ? 'bg-primary text-white shadow' : 'text-gray-500 hover:text-gray-800'}">
                            ชำระแล้ว (${paidStudents.length})
                        </button>
                    </div>
                    
                    <!-- Search inside list (optional future enhancement) -->
                    <!-- List -->
                    <div class="overflow-y-auto flex-1 hide-scrollbar pr-1 pb-4">
                        ${listContent}
                    </div>
                </div>

            </div>
        `;
    },

    renderSettings() {
        const s = this.data.settings;

        const shirtsHtml = s.uniforms.filter(u => u.type === 'shirt').map(u => `
    <div class="flex items-center gap-2 mb-2" >
        <input type="text" value="${u.size}" onchange="app.updateItem('${u.id}', 'size', this.value, 'uniform')" class="border border-gray-200 rounded-lg px-3 py-2 w-24 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none">
            <div class="flex-1 relative">
                <span class="absolute left-3 top-2 text-gray-500 text-sm">฿</span>
                <input type="number" value="${u.price}" onchange="app.updateItem('${u.id}', 'price', this.value, 'uniform')" class="border border-gray-200 rounded-lg pl-8 pr-3 py-2 w-full text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none">
            </div>
            <button onclick="app.removeItem('${u.id}', 'uniform')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg"><i class="ph ph-trash"></i></button>
        </div>
`).join('');

        const pantsHtml = s.uniforms.filter(u => u.type === 'pants').map(u => `
    <div class="flex items-center gap-2 mb-2" >
        <input type="text" value="${u.size}" onchange="app.updateItem('${u.id}', 'size', this.value, 'uniform')" class="border border-gray-200 rounded-lg px-3 py-2 w-24 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none">
            <div class="flex-1 relative">
                <span class="absolute left-3 top-2 text-gray-500 text-sm">฿</span>
                <input type="number" value="${u.price}" onchange="app.updateItem('${u.id}', 'price', this.value, 'uniform')" class="border border-gray-200 rounded-lg pl-8 pr-3 py-2 w-full text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none">
            </div>
            <button onclick="app.removeItem('${u.id}', 'uniform')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg"><i class="ph ph-trash"></i></button>
        </div>
`).join('');

        const itemsHtml = s.items.map(i => `
    <div class="flex items-center gap-2 mb-2" >
        <input type="checkbox" ${i.mandatory ? 'checked' : ''} onchange="app.updateItem('${i.id}', 'mandatory', this.checked, 'item')" class="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary" title="บังคับซื้อ">
        <input type="text" value="${i.name}" onchange="app.updateItem('${i.id}', 'name', this.value, 'item')" class="border border-gray-200 rounded-lg px-3 py-2 flex-1 text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none">
            <div class="w-32 relative">
                <span class="absolute left-3 top-2 text-gray-500 text-sm">฿</span>
                <input type="number" value="${i.price}" onchange="app.updateItem('${i.id}', 'price', this.value, 'item')" class="border border-gray-200 rounded-lg pl-8 pr-3 py-2 w-full text-sm focus:ring-2 focus:ring-primary focus:border-primary outline-none">
            </div>
            <button onclick="app.removeItem('${i.id}', 'item')" class="p-2 text-red-500 hover:bg-red-50 rounded-lg"><i class="ph ph-trash"></i></button>
        </div>
`).join('');

        document.getElementById('settingsContent').innerHTML = `
    <!--School Info & Secuirty-->
            <div class="bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 relative overflow-hidden mb-8">
                <div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent pointer-events-none"></div>
                <h3 class="font-bold text-gray-800 mb-5 flex items-center gap-2 relative z-10 text-lg"><i class="ph-fill ph-gear text-orange-500"></i> ตั้งค่าทั่วไป</h3>
                <div class="space-y-5 relative z-10">
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">ชื่อโรงเรียน</label>
                        <input type="text" id="settingSchoolName" value="${s.schoolName}" class="bg-gray-50 border border-transparent rounded-2xl px-4 py-3.5 w-full focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-sm">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">โลโก้โรงเรียน (รูปภาพ)</label>
                        <input type="file" id="settingSchoolLogo" accept="image/*" class="bg-gray-50 border border-transparent rounded-2xl px-4 py-3 w-full focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-sm">
                        ${s.schoolLogo ? `<div class="mt-3"><img src="${s.schoolLogo}" class="h-16 rounded shadow-sm border border-gray-100 object-contain"></div>` : ''}
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">รหัสผู้ดูแลระบบ (Admin)</label>
                            <input type="password" id="settingAdminPin" placeholder="ตั้งค่าใหม่" maxlength="6" inputmode="numeric" class="bg-gray-50 border border-transparent rounded-2xl px-4 py-3.5 w-full focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono tracking-widest text-center font-bold text-lg text-primary">
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">รหัสเจ้าหน้าที่การเงิน</label>
                            <input type="password" id="settingFinancePin" placeholder="ตั้งค่าใหม่" maxlength="6" inputmode="numeric" class="bg-gray-50 border border-transparent rounded-2xl px-4 py-3.5 w-full focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-mono tracking-widest text-center font-bold text-lg text-secondary">
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">ชื่อผู้รับเงิน (สำหรับใบเสร็จ)</label>
                        <input type="text" id="settingReceiverName" value="${s.receiverName || 'เจ้าหน้าที่การเงิน'}" class="bg-gray-50 border border-transparent rounded-2xl px-4 py-3.5 w-full focus:bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-sm">
                    </div>
                </div>
            </div>

            <!--Uniform Sizes-->
            <div class="bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 mb-8">
                <div class="flex justify-between items-center mb-5">
                    <h3 class="font-bold text-gray-800 flex items-center gap-2 text-base"><i class="ph-fill ph-t-shirt text-accent"></i> ไซส์เสื้อพละ</h3>
                    <button onclick="app.addItem('uniform_shirt')" class="text-xs font-bold bg-accent/20 text-yellow-700 px-3 py-1.5 rounded-full hover:bg-accent/30 transition-colors flex items-center gap-1"><i class="ph-bold ph-plus"></i> เพิ่มไซส์</button>
                </div>
                <div class="flex text-xs font-bold text-gray-400 mb-3 px-2 uppercase tracking-wider">
                    <div class="w-24">ขนาด</div>
                    <div class="flex-1">ราคา</div>
                </div>
                ${shirtsHtml}

                <div class="border-t border-gray-100 my-6"></div>

                <div class="flex justify-between items-center mb-5">
                    <h3 class="font-bold text-gray-800 flex items-center gap-2 text-base"><i class="ph-fill ph-pants text-secondary"></i> ไซส์กางเกงพละ</h3>
                    <button onclick="app.addItem('uniform_pants')" class="text-xs font-bold bg-secondary/10 text-secondary px-3 py-1.5 rounded-full hover:bg-secondary/20 transition-colors flex items-center gap-1"><i class="ph-bold ph-plus"></i> เพิ่มไซส์</button>
                </div>
                 <div class="flex text-xs font-bold text-gray-400 mb-3 px-2 uppercase tracking-wider">
                    <div class="w-24">ขนาด</div>
                    <div class="flex-1">ราคา</div>
                </div>
                ${pantsHtml}
            </div>

            <!--Flexible Items-->
    <div class="bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 mb-8">
        <div class="flex justify-between items-center mb-5">
            <h3 class="font-bold text-gray-800 flex items-center gap-2 text-base"><i class="ph-fill ph-handbag text-gray-800"></i> รายการสั่งซื้ออื่นๆ</h3>
            <button onclick="app.addItem('item')" class="text-xs font-bold bg-gray-100 text-gray-600 px-3 py-1.5 rounded-full hover:bg-gray-200 transition-colors flex items-center gap-1"><i class="ph-bold ph-plus"></i> เพิ่มรายการ</button>
        </div>
        <div class="flex text-xs font-bold text-gray-400 mb-3 px-2 uppercase tracking-wider">
            <div class="w-6"></div>
            <div class="flex-1">ชื่อรายการ</div>
            <div class="w-32">ราคา</div>
        </div>
        ${itemsHtml}
    </div>

    <!--Google Sheets Integration-->
    <div class="bg-white p-6 rounded-[2rem] shadow-soft border border-gray-100 mb-8">
        <div class="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent pointer-events-none rounded-[2rem]"></div>
        <h3 class="font-bold text-gray-800 mb-1 flex items-center gap-2 relative z-10 text-base"><i class="ph-fill ph-google-logo text-blue-500"></i> เชื่อมต่อ Google Sheets</h3>
        <p class="text-xs text-gray-400 mb-4 relative z-10">ใส่ URL เพื่อให้ข้อมูลใช้ร่วมกันได้หลายเครื่อง (เรียลไทม์)</p>
        <div class="space-y-4 relative z-10">
            <div>
                <label class="block text-xs font-bold text-gray-500 mb-2 uppercase tracking-wider">Google Apps Script Web App URL</label>
                <input type="url" id="settingGoogleSheetUrl" value="${s.googleSheetUrl || ''}" placeholder="https://script.google.com/macros/s/.../exec" class="bg-gray-50 border border-transparent rounded-2xl px-4 py-3.5 w-full focus:bg-white focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition-all font-mono text-xs">
                <p class="text-[10px] text-gray-400 mt-2"><i class="ph ph-info"></i> วาง URL ที่ได้จากการ Deploy Google Apps Script (ลงท้ายด้วย /exec)</p>
            </div>
            ${s.googleSheetUrl ? '<div class="flex items-center gap-2 text-xs"><span class="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span><span class="text-emerald-600 font-medium">เชื่อมต่อแล้ว — ข้อมูลจะถูกซิงค์อัตโนมัติ</span></div>' : '<div class="flex items-center gap-2 text-xs"><span class="w-2 h-2 bg-gray-300 rounded-full"></span><span class="text-gray-400 font-medium">ยังไม่ได้เชื่อมต่อ — ใช้ข้อมูลในเครื่องนี้เท่านั้น</span></div>'}
        </div>
    </div>

    <div class="pb-12 pt-4">
        <button onclick="app.saveSettings()" class="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold rounded-[1.5rem] px-4 py-4 hover:from-orange-600 hover:to-amber-600 transition-all active:scale-[0.98] shadow-floating flex items-center justify-center gap-2 text-base">
            <i class="ph-bold ph-floppy-disk text-xl"></i> บันทึกข้อมูล
        </button>
    </div>
`;
    },

    renderSummary() {
        const students = this.data.students;
        const uniforms = this.data.settings.uniforms;
        const items = this.data.settings.items;
        const shirts = uniforms.filter(u => u.type === 'shirt');
        const pants = uniforms.filter(u => u.type === 'pants');

        if (students.length === 0) {
            document.getElementById('summaryContent').innerHTML = `<div class="text-center text-gray-400 py-16"><i class="ph-fill ph-users text-6xl opacity-40 mb-4"></i><p>ยังไม่มีรายชื่อนักเรียน</p></div>`;
            return;
        }

        // Super-header row (grouped)
        const shirtGroupTh = shirts.length > 0 ? `<th colspan="${shirts.length}" class="sticky top-0 z-30 px-2 py-1.5 text-center text-[10px] font-bold text-blue-700 bg-blue-50 border-b border-blue-100 uppercase tracking-wider whitespace-nowrap">เสื้อพละ</th>` : '';
        const pantsGroupTh = pants.length > 0 ? `<th colspan="${pants.length}" class="sticky top-0 z-30 px-2 py-1.5 text-center text-[10px] font-bold text-indigo-700 bg-indigo-50 border-b border-indigo-100 uppercase tracking-wider whitespace-nowrap">กางเกงพละ</th>` : '';
        const itemsGroupTh = items.length > 0 ? `<th colspan="${items.length}" class="sticky top-0 z-30 px-2 py-1.5 text-center text-[10px] font-bold text-orange-700 bg-orange-50 border-b border-orange-100 uppercase tracking-wider whitespace-nowrap">อุปกรณ์</th>` : '';

        // Sub-header row
        const shirtCols = shirts.map(u => `<th class="sticky top-[27px] z-20 px-2 py-1.5 text-center text-[10px] font-bold text-blue-600 bg-blue-50/90 backdrop-blur-sm whitespace-nowrap shadow-sm">${u.size}</th>`).join('');
        const pantsCols = pants.map(u => `<th class="sticky top-[27px] z-20 px-2 py-1.5 text-center text-[10px] font-bold text-indigo-600 bg-indigo-50/90 backdrop-blur-sm whitespace-nowrap shadow-sm">${u.size}</th>`).join('');
        const itemCols = items.map(i => {
            return `<th class="sticky top-[27px] z-20 px-2 py-1.5 text-center text-[10px] font-bold text-orange-600 bg-orange-50/90 backdrop-blur-sm whitespace-nowrap shadow-sm" title="${i.name}">${i.name}</th>`;
        }).join('');

        const rows = students.map((s, idx) => {
            const shirtCells = shirts.map(u => {
                const found = (s.shirts || []).find(x => x.id === u.id);
                const qty = found ? found.qty : 0;
                return `<td class="px-2 py-2 text-center text-xs ${qty > 0 ? 'font-bold text-blue-700' : 'text-gray-200'}">${qty > 0 ? qty : '·'}</td>`;
            }).join('');

            const pantsCells = pants.map(u => {
                const found = (s.pants || []).find(x => x.id === u.id);
                const qty = found ? found.qty : 0;
                return `<td class="px-2 py-2 text-center text-xs ${qty > 0 ? 'font-bold text-indigo-700' : 'text-gray-200'}">${qty > 0 ? qty : '·'}</td>`;
            }).join('');

            const itemCells = items.map(i => {
                const found = (s.items || []).find(x => x.id === i.id);
                const qty = found ? found.qty : 0;
                return `<td class="px-2 py-2 text-center text-xs ${qty > 0 ? 'font-bold text-orange-600' : 'text-gray-200'}">${qty > 0 ? qty : '·'}</td>`;
            }).join('');

            const calc = this.calculateStudentTotal(s);
            const isPaid = s.paymentStatus === 'paid';
            const isDelivered = s.itemsDelivered === true;
            const remarkText = s.remark || '';

            const rowBg = idx % 2 === 0 ? '' : 'bg-gray-50/40';

            return `
                <tr class="border-b border-gray-100 hover:bg-orange-100 transition-colors text-xs ${rowBg}">
                    <td class="pl-4 pr-2 py-2 text-gray-400 text-center font-mono sticky left-0 bg-white group-hover:bg-orange-100 ${rowBg}">${idx + 1}</td>
                    <td class="px-2 py-2 sticky left-8 bg-white group-hover:bg-orange-100 ${rowBg} shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] min-w-[130px] max-w-[180px]">
                        <div class="font-semibold text-gray-800 leading-tight truncate">${this.escapeHtml(s.title || '')} ${this.escapeHtml(s.firstName)} ${this.escapeHtml(s.lastName)}</div>
                        <div class="text-[9px] text-gray-400 font-mono">${this.escapeHtml(s.grade)} · ${this.escapeHtml(s.refCode)}</div>
                    </td>
                    ${shirtCells}
                    ${pantsCells}
                    ${itemCells}
                    <td class="px-2 py-2 text-right font-bold whitespace-nowrap ${isPaid ? 'text-emerald-600' : 'text-gray-700'}">฿${calc.total.toLocaleString()}</td>
                    <td class="px-2 py-2 text-center">
                        ${isPaid
                    ? `<span class="bg-emerald-100 text-emerald-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">ชำระแล้ว</span>`
                    : `<span class="bg-orange-100 text-orange-600 text-[9px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">รอชำระ</span>`}
                    </td>
                    <td class="px-2 py-2 text-center">
                        <button onclick="app.toggleDelivery('${s.id}')" class="px-2 py-1 rounded-md transition-colors text-[10px] font-bold ${isDelivered ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}">
                            ${isDelivered ? 'มอบแล้ว ✅' : 'รอมอบ'}
                        </button>
                    </td>
                    <td class="px-2 py-2 min-w-[120px]">
                        <input type="text" value="${remarkText}" onchange="app.saveRemark('${s.id}', this.value)" placeholder="หมายเหตุ..." class="w-full text-[10px] px-2 py-1 bg-white border border-gray-200 rounded-md focus:outline-none focus:border-orange-500 text-gray-700 placeholder-gray-300">
                    </td>
                </tr>
            `;
        }).join('');

        document.getElementById('summaryContent').innerHTML = `
            <div class="bg-white rounded-[2rem] shadow-soft border border-gray-100 overflow-hidden">
                <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
                    <div>
                        <h3 class="font-bold text-gray-800 flex items-center gap-2 text-sm"><i class="ph-fill ph-table text-primary"></i> รายชื่อนักเรียนทุกคน (${students.length} คน)</h3>
                        <p class="text-[10px] text-gray-400 mt-0.5">เลื่อนซ้าย-ขวาเพื่อดูข้อมูลทั้งหมด — คอลัมน์ชื่อ-นามสกุลอยู่นิ่ง</p>
                    </div>
                    <div class="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
                        <span>· ไม่ได้สั่ง</span>
                    </div>
                </div>
                <div class="overflow-x-auto overflow-y-auto max-h-[70vh] w-full custom-scrollbar">
                    <table class="text-left border-collapse w-full min-w-max" style="font-size:11px;">
                        <thead class="sticky top-0 z-40">
                            <!-- Group Header Row -->
                            <tr>
                                <th class="sticky left-0 top-0 bg-gray-50 px-2 py-1.5 z-50 w-8 border-b border-gray-100" rowspan="2"></th>
                                <th class="sticky left-8 top-0 bg-gray-50 px-2 py-1.5 text-[10px] text-gray-500 font-bold z-50 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] border-b border-gray-100" rowspan="2">ชื่อ - นามสกุล</th>
                                ${shirtGroupTh}
                                ${pantsGroupTh}
                                ${itemsGroupTh}
                                <th class="sticky top-0 z-30 px-2 py-1.5 text-right text-[10px] font-bold text-gray-500 bg-gray-50 whitespace-nowrap border-b border-gray-100" rowspan="2">ยอด</th>
                                <th class="sticky top-0 z-30 px-2 py-1.5 text-center text-[10px] font-bold text-gray-500 bg-gray-50 whitespace-nowrap border-b border-gray-100" rowspan="2">ชำระเงิน</th>
                                <th class="sticky top-0 z-30 px-2 py-1.5 text-center text-[10px] font-bold text-gray-500 bg-gray-50 whitespace-nowrap border-b border-gray-100" rowspan="2">มอบของ</th>
                                <th class="sticky top-0 z-30 px-2 py-1.5 text-left text-[10px] font-bold text-gray-500 bg-gray-50 whitespace-nowrap border-b border-gray-100" rowspan="2">หมายเหตุ</th>
                            </tr>
                            <!-- Sub Header Row (sizes/items) -->
                            <tr>
                                ${shirtCols}
                                ${pantsCols}
                                ${itemCols}
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    },

    _getSummaryTableHtml(students, title) {
        if (!students || students.length === 0) return '';

        const uniforms = this.data.settings.uniforms;
        const items = this.data.settings.items;
        const shirts = uniforms.filter(u => u.type === 'shirt');
        const pants = uniforms.filter(u => u.type === 'pants');

        // Super-header row (grouped)
        const shirtGroupTh = shirts.length > 0 ? `<th colspan="${shirts.length}" style="padding: 4px; text-align: center; font-size: 10px; font-weight: bold; border: 1px solid #ddd; background-color: #f0f7ff;">เสื้อพละ</th>` : '';
        const pantsGroupTh = pants.length > 0 ? `<th colspan="${pants.length}" style="padding: 4px; text-align: center; font-size: 10px; font-weight: bold; border: 1px solid #ddd; background-color: #eef2ff;">กางเกงพละ</th>` : '';
        const itemsGroupTh = items.length > 0 ? `<th colspan="${items.length}" style="padding: 4px; text-align: center; font-size: 10px; font-weight: bold; border: 1px solid #ddd; background-color: #fff7ed;">อุปกรณ์</th>` : '';

        // Sub-header row
        const shirtCols = shirts.map(u => `<th style="padding: 4px; text-align: center; font-size: 9px; border: 1px solid #ddd; background-color: #f8fafc;">${u.size}</th>`).join('');
        const pantsCols = pants.map(u => `<th style="padding: 4px; text-align: center; font-size: 9px; border: 1px solid #ddd; background-color: #f8fafc;">${u.size}</th>`).join('');
        const itemCols = items.map(i => `<th style="padding: 4px; text-align: center; font-size: 9px; border: 1px solid #ddd; background-color: #f8fafc;">${i.name}</th>`).join('');

        const rows = students.map((s, idx) => {
            const shirtCells = shirts.map(u => {
                const qty = (s.shirts || []).find(x => x.id === u.id)?.qty || 0;
                return `<td style="padding: 4px; text-align: center; font-size: 10px; border: 1px solid #ddd;">${qty > 0 ? qty : ''}</td>`;
            }).join('');

            const pantsCells = pants.map(u => {
                const qty = (s.pants || []).find(x => x.id === u.id)?.qty || 0;
                return `<td style="padding: 4px; text-align: center; font-size: 10px; border: 1px solid #ddd;">${qty > 0 ? qty : ''}</td>`;
            }).join('');

            const itemCells = items.map(i => {
                const qty = (s.items || []).find(x => x.id === i.id)?.qty || 0;
                return `<td style="padding: 4px; text-align: center; font-size: 10px; border: 1px solid #ddd;">${qty > 0 ? qty : ''}</td>`;
            }).join('');

            const calc = this.calculateStudentTotal(s);
            const isPaid = s.paymentStatus === 'paid';
            const isDelivered = s.itemsDelivered === true;
            const remarkText = s.remark || '';

            return `
                <tr>
                    <td style="padding: 4px; text-align: center; font-size: 9px; border: 1px solid #ddd;">${idx + 1}</td>
                    <td style="padding: 4px; font-size: 10px; border: 1px solid #ddd; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                        <strong>${this.escapeHtml(s.title || '')} ${this.escapeHtml(s.firstName)} ${this.escapeHtml(s.lastName)}</strong>
                        <div style="font-size: 8px; color: #666;">${this.escapeHtml(s.grade)} · ${this.escapeHtml(s.refCode)}</div>
                    </td>
                    ${shirtCells}
                    ${pantsCells}
                    ${itemCells}
                    <td style="padding: 4px; text-align: right; font-size: 10px; font-weight: bold; border: 1px solid #ddd;">${calc.total.toLocaleString()}</td>
                    <td style="padding: 4px; text-align: center; font-size: 9px; border: 1px solid #ddd;">${isPaid ? 'ชำระแล้ว' : 'รอชำระ'}</td>
                    <td style="padding: 4px; text-align: center; font-size: 9px; border: 1px solid #ddd;">${isDelivered ? '✅' : '-'}</td>
                    <td style="padding: 4px; font-size: 9px; border: 1px solid #ddd; max-width: 100px;">${this.escapeHtml(remarkText)}</td>
                </tr>
            `;
        }).join('');

        return `
            <div style="page-break-after: always; margin-bottom: 20px;">
                <h3 style="font-size: 14px; margin-bottom: 5px; text-align: left;">ชั้น ${title} (จำนวน ${students.length} คน)</h3>
                <table style="width: 100%; border-collapse: collapse; font-family: 'Noto Sans Thai', sans-serif;">
                    <thead style="display: table-header-group;">
                        <tr>
                            <th rowspan="2" style="padding: 4px; font-size: 10px; border: 1px solid #ddd; background-color: #f1f5f9; width: 20px;">ลำดับ</th>
                            <th rowspan="2" style="padding: 4px; font-size: 10px; border: 1px solid #ddd; background-color: #f1f5f9; text-align: left;">ชื่อ - นามสกุล</th>
                            ${shirtGroupTh}
                            ${pantsGroupTh}
                            ${itemsGroupTh}
                            <th rowspan="2" style="padding: 4px; font-size: 10px; border: 1px solid #ddd; background-color: #f1f5f9;">ยอดรวม</th>
                            <th rowspan="2" style="padding: 4px; font-size: 10px; border: 1px solid #ddd; background-color: #f1f5f9;">ชำระเงิน</th>
                            <th rowspan="2" style="padding: 4px; font-size: 10px; border: 1px solid #ddd; background-color: #f1f5f9;">มอบของ</th>
                            <th rowspan="2" style="padding: 4px; font-size: 10px; border: 1px solid #ddd; background-color: #f1f5f9;">หมายเหตุ</th>
                        </tr>
                        <tr>
                            ${shirtCols}
                            ${pantsCols}
                            ${itemCols}
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        `;
    },

    exportSummaryPdf() {
        if (!this.data.students || this.data.students.length === 0) {
            this.showToast('ไม่มีข้อมูลให้ดาวน์โหลด', 'error');
            return;
        }

        if (typeof html2pdf === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
            script.onload = () => this._doExportSummaryPdf();
            document.head.appendChild(script);
            this.showToast('กำลังเตรียมไฟล์ PDF...', 'info');
        } else {
            this._doExportSummaryPdf();
        }
    },

    _doExportSummaryPdf() {
        const dateStr = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
        const schoolName = this.data.settings.schoolName || 'โรงเรียน';

        // Split students by grade
        const m1Students = this.data.students.filter(s => s.grade === 'ม.1');
        const m4Students = this.data.students.filter(s => s.grade === 'ม.4');
        const otherStudents = this.data.students.filter(s => s.grade !== 'ม.1' && s.grade !== 'ม.4');

        let tablesHtml = '';
        if (m1Students.length > 0) tablesHtml += this._getSummaryTableHtml(m1Students, 'ม.1');
        if (m4Students.length > 0) tablesHtml += this._getSummaryTableHtml(m4Students, 'ม.4');
        if (otherStudents.length > 0) tablesHtml += this._getSummaryTableHtml(otherStudents, 'อื่นๆ');

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'padding: 10px; font-family: "Noto Sans Thai", sans-serif; background: white;';
        wrapper.innerHTML = `
            <div style="text-align:center; margin-bottom:15px;">
                <h2 style="font-size:18px; margin:0; font-weight: bold;">${schoolName}</h2>
                <p style="font-size:12px; color:#666; margin:5px 0 0 0;">รายงานสรุปข้อมูลนักเรียน — ข้อมูล ณ วันที่ ${dateStr}</p>
            </div>
            ${tablesHtml}
        `;

        const opt = {
            margin: [10, 5, 10, 5],
            filename: `สรุปข้อมูลการมอบตัว_${dateStr}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
            pagebreak: { mode: ['css', 'legacy'] }
        };

        html2pdf().set(opt).from(wrapper).save().then(() => {
            this.showToast('ดาวน์โหลด PDF เรียบร้อยแล้ว ✅');
        });
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    showChangeFinancePinModal() {
        const currentPin = prompt('กรุณาใส่รหัสปัจจุบัน:');
        if (!currentPin) return;

        // Verify current finance PIN
        if (currentPin !== this.data.settings.financePin && currentPin !== this.data.settings.adminPin) {
            this.showToast('รหัสปัจจุบันไม่ถูกต้อง', 'error');
            return;
        }

        const newPin = prompt('กรุณาใส่รหัสใหม่:');
        if (!newPin || newPin.length < 4) {
            this.showToast('รหัสต้องมีอย่างน้อย 4 ตัวอักษร', 'error');
            return;
        }

        const confirmPin = prompt('ยืนยันรหัสใหม่อีกครั้ง:');
        if (newPin !== confirmPin) {
            this.showToast('รหัสใหม่ไม่ตรงกัน กรุณาลองใหม่', 'error');
            return;
        }

        this.data.settings.financePin = newPin;
        this.saveData();
        this.showToast('เปลี่ยนรหัสการเงินเรียบร้อยแล้ว ✅');
    },

    toggleDelivery(id) {
        const student = this.data.students.find(s => s.id === id);
        if (!student) return;
        student.itemsDelivered = !student.itemsDelivered;
        this.saveData();
        this.renderSummary();
    },

    saveRemark(id, value) {
        const student = this.data.students.find(s => s.id === id);
        if (!student) return;
        student.remark = value;
        this.saveData();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    app.init();
});

