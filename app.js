import { GoogleGenAI, Type } from '@google/genai';

// ==========================================
// 1. CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://haextoclppbqphsnvvap.supabase.co/'; // Ganti dengan Project URL milikmu
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhhZXh0b2NscHBicXBoc252dmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MjI1MDUsImV4cCI6MjEwNDM5ODUwNX0.IBG7TrdoznZlu0qEBdzN2ZFHrG85Sp0Usu_SLc6xvhw';      // Ganti dengan anon key milikmu
const GEMINI_API_KEY = 'AQ.Ab8RN6JKPjegHOw3AyAY6wlo1v9fdC9lljQo2dCqj-mVzmqV2g';                         // Ganti dengan Gemini API key milikmu

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

const DAILY_CALORIE_TARGET = 2000; // Default Target Harian
const TODAY_DATE = new Date().toISOString().split('T')[0]; // Format YYYY-MM-DD

// Helper: Convert File Gambar ke Base64
const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = (error) => reject(error);
});

// ==========================================
// 2. GEMINI AI ANALYSIS FUNCTION
// ==========================================
const foodSchema = {
    type: Type.OBJECT,
    properties: {
        food_name: { type: Type.STRING },
        serving_qty: { type: Type.NUMBER },
        serving_unit: { type: Type.STRING },
        calories: { type: Type.INTEGER },
        protein_g: { type: Type.NUMBER },
        carbs_g: { type: Type.NUMBER },
        fat_g: { type: Type.NUMBER },
    },
    required: ["food_name", "serving_qty", "serving_unit", "calories", "protein_g", "carbs_g", "fat_g"],
};

async function analyzeFoodInput(text, file) {
    const contents = [];

    if (text) {
        contents.push(`Hitung kalori dan makronutrisi dari makanan ini: "${text}"`);
    }

    if (file) {
        const base64Data = await fileToBase64(file);
        contents.push({
            inlineData: {
                data: base64Data,
                mimeType: file.type || 'image/jpeg'
            }
        });
        if (!text) {
            contents.push("Analisis makanan pada foto ini, estimasi porsi dan hitung total kalorinya.");
        }
    }

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: contents,
        config: {
            responseMimeType: 'application/json',
            responseSchema: foodSchema,
            systemInstruction: "Kamu adalah pakar nutrisi. Estimasi nilai kalori dan makronutrisi makanan secara realistis. Selalu kembalikan respon dalam bentuk JSON sesuai schema."
        }
    });

    return JSON.parse(response.text);
}

// ==========================================
// 3. DASHBOARD RENDER & DATA FETCHING
// ==========================================
async function loadDashboardData() {
    // Fetch Log Makanan Hari Ini dari Supabase
    const { data: logs, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('logged_date', TODAY_DATE)
        .order('created_at', { ascending: false });

    if (error) {
        console.error("Gagal mengambil data log:", error);
        return;
    }

    // Hitung Total Kalori Masuk
    const totalConsumed = logs.reduce((sum, item) => sum + item.calories, 0);
    const remaining = DAILY_CALORIE_TARGET - totalConsumed;
    const progressPercent = Math.min((totalConsumed / DAILY_CALORIE_TARGET) * 100, 100);

    // Update DOM Summary
    document.getElementById('consumedCal').innerText = totalConsumed;
    document.getElementById('remainingCal').innerText = remaining;
    document.getElementById('progressBar').style.width = `${progressPercent}%`;

    // Ubah warna sisa kalori jika minus/over
    const remainingEl = document.getElementById('remainingCal');
    if (remaining < 0) {
        remainingEl.className = "text-4xl font-extrabold text-red-500 mt-1";
    } else {
        remainingEl.className = "text-4xl font-extrabold text-emerald-400 mt-1";
    }

    // Render Daftar Makanan Hari Ini
    const container = document.getElementById('logsContainer');
    if (logs.length === 0) {
        container.innerHTML = `<p class="text-xs text-gray-500 text-center py-2">Belum ada makanan di-log hari ini.</p>`;
    } else {
        // Cari bagian render logsContainer di app.js, ganti innerHTML-nya menjadi:
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

// Fungsi Hapus Log Makanan
window.deleteLog = async function (id) {
    const { error } = await supabase.from('daily_logs').delete().eq('id', id);
    if (!error) loadDashboardData();
};

// ==========================================
// 4. EVENT LISTENERS (Form Submission)
// ==========================================

// Handle nama file terdeteksi saat foto dipilih
document.getElementById('foodImage').addEventListener('change', (e) => {
    const file = e.target.files[0];
    document.getElementById('fileName').innerText = file ? file.name : '';
});

// Submit Log Makanan
document.getElementById('foodForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const textInput = document.getElementById('foodText').value.trim();
    const fileInput = document.getElementById('foodImage').files[0];

    if (!textInput && !fileInput) {
        alert("Masukkan deskripsi makanan atau unggah foto terlebih dahulu!");
        return;
    }

    const loadingEl = document.getElementById('loadingStatus');
    const btnSubmit = document.getElementById('btnLogFood');

    try {
        loadingEl.classList.remove('hidden');
        btnSubmit.disabled = true;

        // 1. Panggil Gemini AI
        const result = await analyzeFoodInput(textInput, fileInput);

        // 2. Simpan ke Supabase
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

        // Reset Form
        document.getElementById('foodForm').reset();
        document.getElementById('fileName').innerText = '';

        // Refresh Tampilan Dashboard
        await loadDashboardData();

    } catch (err) {
        console.error("Gagal memproses makanan:", err);
        alert("Gagal menganalisis makanan. Coba lagi!");
    } finally {
        loadingEl.classList.add('hidden');
        btnSubmit.disabled = false;
    }
});

// Submit Body Metrics (BB & Ukuran Tubuh)
document.getElementById('metricsForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const weight = parseFloat(document.getElementById('weightInput').value);
    const waist = parseFloat(document.getElementById('waistInput').value) || null;
    const chest = parseFloat(document.getElementById('chestInput').value) || null;
    const biceps = parseFloat(document.getElementById('bicepsInput').value) || null;
    const thigh = parseFloat(document.getElementById('thighInput').value) || null;

    const { error } = await supabase.from('body_metrics').upsert([{
        weight_kg: weight,
        waist_cm: waist,
        chest_cm: chest,
        biceps_cm: biceps,
        thigh_cm: thigh,
        logged_date: TODAY_DATE
    }], { onConflict: 'logged_date' });

    if (error) {
        console.error("Gagal menyimpan metrics:", error);
        alert("Gagal menyimpan berat badan.");
    } else {
        alert("Progres fisik berhasil disimpan!");
    }
});

// Initialize Dashboard On Load
loadDashboardData();