// ==========================================
// 1. CONFIGURATION & HYBRID ENVIRONMENT
// ==========================================

// Supabase Credentials (Aman di-client side karena dilindungi RLS)
const SUPABASE_URL = typeof CONFIG !== 'undefined' ? CONFIG.SUPABASE_URL : 'https://haextoclppbqphsnvvap.supabase.co'; // Ganti dengan URL Supabase milikmu jika di Vercel
const SUPABASE_ANON_KEY = typeof CONFIG !== 'undefined' ? CONFIG.SUPABASE_ANON_KEY : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZXh0b2NscHBicXBoc252dmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MjI1MDUsImV4cCI6MjEwNDM5ODUwNX0.IBG7TrdoznZlu0qEBdzN2ZFHrG85Sp0Usu_SLc6xvhw';     // Ganti dengan Anon Key Supabase milikmu jika di Vercel

// Tanggal Hari Ini (Format YYYY-MM-DD)
const TODAY_DATE = new Date().toISOString().split('T')[0];

// Global Instances untuk Chart.js
let weightChartInstance = null;
let calorieChartInstance = null;

// Inisialisasi Supabase Client
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY && typeof window.supabase !== 'undefined') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.warn("Supabase client belum siap atau konfigurasi belum ditemukan.");
}

// Helper: Convert File Gambar ke Base64
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
});

// Helper: Toggle Modal Setting Profile
window.toggleProfileModal = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.toggle('hidden');
};

// ==========================================
// 2. BMR, TDEE, & BMI CALCULATOR
// ==========================================

// Rumus Mifflin-St Jeor untuk BMR & TDEE
function calculateTDEE(weightKg, heightCm, ageYears, gender, activityMultiplier) {
    if (!weightKg || !heightCm || !ageYears) return 2000; // Default fallback 2000 kcal

    let bmr = (10 * weightKg) + (6.25 * heightCm) - (5 * ageYears);
    bmr = gender === 'female' ? bmr - 161 : bmr + 5;

    return Math.round(bmr * parseFloat(activityMultiplier || 1.2));
}

// Hitung Indeks Massa Tubuh (BMI)
function calculateBMI(weightKg, heightCm) {
    if (!weightKg || !heightCm) return null;
    const heightMeters = heightCm / 100;
    const bmi = (weightKg / (heightMeters * heightMeters)).toFixed(1);

    let status = '';
    let colorClass = '';

    if (bmi < 18.5) { status = 'Kurus'; colorClass = 'bg-amber-500/20 text-amber-400'; }
    else if (bmi < 25) { status = 'Normal'; colorClass = 'bg-emerald-500/20 text-emerald-400'; }
    else if (bmi < 30) { status = 'Gemuk'; colorClass = 'bg-orange-500/20 text-orange-400'; }
    else { status = 'Obesitas'; colorClass = 'bg-rose-500/20 text-rose-400'; }

    return { bmi, status, colorClass };
}

// Ambil/Simpan Profil Pengguna dari LocalStorage
function getUserProfile() {
    const saved = localStorage.getItem('user_profile');
    return saved ? JSON.parse(saved) : { age: 25, gender: 'male', height: 170, activity: '1.2' };
}

// ==========================================
// 3. GEMINI AI PARSER (Hybrid: Live Server vs Vercel)
// ==========================================
async function analyzeFoodInput(text, file) {
    // Cek apakah ada config.js (Mode Live Server/Lokal) atau Vercel Production
    const isLocal = typeof CONFIG !== 'undefined' && CONFIG.GEMINI_API_KEY;

    const endpoint = isLocal
        ? `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`
        : '/api/analyze';

    const contentsParts = [];

    if (text) contentsParts.push({ text: `Hitung kalori dan makronutrisi dari makanan berikut: "${text}"` });
    if (file) {
        const base64Data = await fileToBase64(file);
        contentsParts.push({ inline_data: { mime_type: file.type || 'image/jpeg', data: base64Data } });
        if (!text) contentsParts.push({ text: "Analisis foto makanan ini, estimasi porsi dan hitung total kalorinya." });
    }

    const payload = {
        contents: [{ parts: contentsParts }],
        systemInstruction: {
            parts: [{
                text: "Kamu adalah ahli nutrisi. Estimasi nilai kalori dan makronutrisi makanan secara realistis. Selalu kembalikan respon HANYA berupa JSON valid dengan format persis seperti ini: {\"food_name\": string, \"serving_qty\": number, \"serving_unit\": string, \"calories\": number, \"protein_g\": number, \"carbs_g\": number, \"fat_g\": number}"
            }]
        },
        generationConfig: { responseMimeType: "application/json" }
    };

    let response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || errorData.error || response.statusText);
    }

    const resultData = await response.json();
    const jsonText = resultData.candidates[0].content.parts[0].text;
    return JSON.parse(jsonText);
}

// ==========================================
// 4. CHART RENDERERS (Chart.js)
// ==========================================
function renderCharts(metricsHistory, calorieHistory) {
    if (typeof Chart === 'undefined') return;

    // 1. Line Chart Berat Badan
    const weightCanvas = document.getElementById('weightChart');
    if (weightCanvas) {
        const weightCtx = weightCanvas.getContext('2d');
        if (weightChartInstance) weightChartInstance.destroy();

        const weightLabels = (metricsHistory || []).map(m => m.logged_date).reverse();
        const weightData = (metricsHistory || []).map(m => m.weight_kg).reverse();

        weightChartInstance = new Chart(weightCtx, {
            type: 'line',
            data: {
                labels: weightLabels,
                datasets: [{
                    label: 'Berat (kg)',
                    data: weightData,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { display: false } },
                    y: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { color: '#374151' } }
                }
            }
        });
    }

    // 2. Bar Chart Kalori Harian
    const calorieCanvas = document.getElementById('calorieChart');
    if (calorieCanvas) {
        const calorieCtx = calorieCanvas.getContext('2d');
        if (calorieChartInstance) calorieChartInstance.destroy();

        const calLabels = Object.keys(calorieHistory || {}).reverse();
        const calData = Object.values(calorieHistory || {}).reverse();

        calorieChartInstance = new Chart(calorieCtx, {
            type: 'bar',
            data: {
                labels: calLabels,
                datasets: [{
                    label: 'Kalori (kcal)',
                    data: calData,
                    backgroundColor: '#3b82f6',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { display: false } },
                    y: { ticks: { color: '#9ca3af', font: { size: 9 } }, grid: { color: '#374151' } }
                }
            }
        });
    }
}

// ==========================================
// 5. DASHBOARD RENDER & DATA FETCHING
// ==========================================
async function loadDashboardData() {
    if (!supabase) return;

    const profile = getUserProfile();

    // Fetch Log Makanan Hari Ini
    const { data: logs } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('logged_date', TODAY_DATE)
        .order('created_at', { ascending: false });

    // Fetch Metrics untuk Grafik & Status Terakhir
    const { data: metricsHistory } = await supabase
        .from('body_metrics')
        .select('*')
        .order('logged_date', { ascending: false })
        .limit(7);

    // Fetch Riwayat Kalori Semua Hari
    const { data: allLogs } = await supabase
        .from('daily_logs')
        .select('logged_date, calories')
        .order('logged_date', { ascending: false })
        .limit(50);

    // Hitung Totals Hari Ini
    const totalConsumed = (logs || []).reduce((sum, item) => sum + item.calories, 0);
    const totalProtein = (logs || []).reduce((sum, item) => sum + (item.protein_g || 0), 0);
    const totalCarbs = (logs || []).reduce((sum, item) => sum + (item.carbs_g || 0), 0);
    const totalFat = (logs || []).reduce((sum, item) => sum + (item.fat_g || 0), 0);

    // Target TDEE Dinamis dari Berat Badan Terakhir
    const latestWeight = (metricsHistory && metricsHistory.length > 0) ? metricsHistory[0].weight_kg : 70;
    const targetTDEE = calculateTDEE(latestWeight, profile.height, profile.age, profile.gender, profile.activity);

    const remaining = targetTDEE - totalConsumed;
    const progressPercent = Math.min((totalConsumed / targetTDEE) * 100, 100);

    // Update UI Ringkasan Kalori
    const targetCalEl = document.getElementById('targetCal');
    if (targetCalEl) targetCalEl.innerText = targetTDEE;

    const consumedCalEl = document.getElementById('consumedCal');
    if (consumedCalEl) consumedCalEl.innerText = totalConsumed;

    const remainingCalEl = document.getElementById('remainingCal');
    if (remainingCalEl) remainingCalEl.innerText = remaining;

    const progressBarEl = document.getElementById('progressBar');
    if (progressBarEl) progressBarEl.style.width = `${progressPercent}%`;

    const protEl = document.getElementById('totalProtein');
    if (protEl) protEl.innerText = `${totalProtein}g`;

    const carbEl = document.getElementById('totalCarbs');
    if (carbEl) carbEl.innerText = `${totalCarbs}g`;

    const fatEl = document.getElementById('totalFat');
    if (fatEl) fatEl.innerText = `${totalFat}g`;

    // Update Status BMI Badge
    const bmiInfo = calculateBMI(latestWeight, profile.height);
    const bmiBadge = document.getElementById('bmiBadge');
    if (bmiBadge && bmiInfo) {
        bmiBadge.innerText = `BMI: ${bmiInfo.bmi} (${bmiInfo.status})`;
        bmiBadge.className = `text-[10px] font-bold px-2.5 py-1 rounded-full ${bmiInfo.colorClass}`;
    }

    // Rekap Data Kalori per Tanggal untuk Grafik
    const calorieHistory = {};
    (allLogs || []).forEach(log => {
        calorieHistory[log.logged_date] = (calorieHistory[log.logged_date] || 0) + log.calories;
    });

    // Render Grafik
    renderCharts(metricsHistory || [], calorieHistory);

    // Render Daftar Makanan
    const container = document.getElementById('logsContainer');
    if (container) {
        if (!logs || logs.length === 0) {
            container.innerHTML = `<p class="text-xs font-light text-gray-500 text-center py-2">Belum ada makanan di-log hari ini.</p>`;
        } else {
            container.innerHTML = logs.map(item => `
        <div class="flex justify-between items-center bg-gray-900 p-3 rounded-xl border border-gray-700/70">
          <div>
            <div class="font-medium text-gray-200 text-xs">${item.food_name}</div>
            <div class="text-[10px] font-light text-gray-400">P: ${item.protein_g}g | K: ${item.carbs_g}g | L: ${item.fat_g}g</div>
          </div>
          <div class="flex items-center gap-3">
            <span class="font-bold text-emerald-400 text-xs">${item.calories} kcal</span>
            <button onclick="deleteLog('${item.id}')" class="text-xs text-red-400 hover:text-red-300 transition">✕</button>
          </div>
        </div>
      `).join('');
        }
    }
}

// Fungsi Hapus Item Makanan
window.deleteLog = async function (id) {
    if (!supabase) return;
    const { error } = await supabase.from('daily_logs').delete().eq('id', id);
    if (!error) loadDashboardData();
};

// ==========================================
// 6. EVENT LISTENERS
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    // Indikator Nama File Terpilih
    const imageInput = document.getElementById('foodImage');
    if (imageInput) {
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            const fileNameEl = document.getElementById('fileName');
            if (fileNameEl) fileNameEl.innerText = file ? file.name : '';
        });
    }

    // Form Log Makanan AI
    const foodForm = document.getElementById('foodForm');
    if (foodForm) {
        foodForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const textInput = document.getElementById('foodText').value.trim();
            const fileInput = document.getElementById('foodImage').files[0];

            if (!textInput && !fileInput) return alert("Masukkan deskripsi atau upload foto makanan!");

            const loadingEl = document.getElementById('loadingStatus');
            const btnSubmit = document.getElementById('btnLogFood');

            try {
                if (loadingEl) loadingEl.classList.remove('hidden');
                if (btnSubmit) btnSubmit.disabled = true;

                const result = await analyzeFoodInput(textInput, fileInput);

                if (supabase) {
                    const { error } = await supabase.from('daily_logs').insert([{
                        food_name: result.food_name,
                        serving_qty: result.serving_qty,
                        serving_unit: result.serving_unit,
                        calories: result.calories,
                        protein_g: result.protein_g,
                        carbs_g: result.carbs_g,
                        fat_g: result.fat_g,
                        logged_date: TODAY_DATE
                    }]);

                    if (error) throw error;
                }

                foodForm.reset();
                const fileNameEl = document.getElementById('fileName');
                if (fileNameEl) fileNameEl.innerText = '';

                await loadDashboardData();

            } catch (err) {
                alert(`Gagal menganalisis makanan: ${err.message}`);
            } finally {
                if (loadingEl) loadingEl.classList.add('hidden');
                if (btnSubmit) btnSubmit.disabled = false;
            }
        });
    }

    // Form Simpan Berat Badan & Ukuran Tubuh
    const metricsForm = document.getElementById('metricsForm');
    if (metricsForm) {
        metricsForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const weight = parseFloat(document.getElementById('weightInput').value);
            const waist = parseFloat(document.getElementById('waistInput').value) || null;
            const chest = parseFloat(document.getElementById('chestInput').value) || null;
            const biceps = parseFloat(document.getElementById('bicepsInput').value) || null;
            const thigh = parseFloat(document.getElementById('thighInput').value) || null;

            if (supabase) {
                // MENGGUNAKAN .upsert() DENGAN onConflict: 'logged_date'
                const { error } = await supabase.from('body_metrics').upsert([{
                    weight_kg: weight,
                    waist_cm: waist,
                    chest_cm: chest,
                    biceps_cm: biceps,
                    thigh_cm: thigh,
                    logged_date: TODAY_DATE
                }], { onConflict: 'logged_date' });

                if (error) alert("Gagal menyimpan berat badan: " + error.message);
                else {
                    metricsForm.reset();
                    await loadDashboardData();
                }
            }
        });
    }

    // Form Pengaturan Profil & TDEE
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const profile = {
                age: parseInt(document.getElementById('ageInput').value),
                gender: document.getElementById('genderInput').value,
                height: parseFloat(document.getElementById('heightInput').value),
                activity: document.getElementById('activityInput').value
            };

            localStorage.setItem('user_profile', JSON.stringify(profile));
            toggleProfileModal();
            loadDashboardData();
        });
    }

    // Load Saved Profile into Inputs
    const savedProfile = getUserProfile();
    const ageInp = document.getElementById('ageInput');
    if (ageInp) ageInp.value = savedProfile.age;

    const genInp = document.getElementById('genderInput');
    if (genInp) genInp.value = savedProfile.gender;

    const hgtInp = document.getElementById('heightInput');
    if (hgtInp) hgtInp.value = savedProfile.height;

    const actInp = document.getElementById('activityInput');
    if (actInp) actInp.value = savedProfile.activity;

    // Render Dashboard
    loadDashboardData();
});