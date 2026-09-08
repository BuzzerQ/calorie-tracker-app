import { GoogleGenAI, Type } from '@google/genai';

// ==========================================
// 1. CONFIGURATION (Ganti dengan API Key kamu)
// ==========================================
const SUPABASE_URL = 'https://XXXXXXXXXXXXXX.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsIn...'; 
const GEMINI_API_KEY = 'AIzaSy...'; 

// Inisialisasi SDK Supabase & Gemini
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ==========================================
// 2. GEMINI AI PARSER (Dual Input: Teks & Foto)
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

export async function analyzeFoodInput(inputData) {
  const contents = [];

  if (inputData.text) {
    contents.push(`Hitung kalori dan makronutrisi makanan berikut: "${inputData.text}"`);
  }

  if (inputData.imageBase64) {
    contents.push({
      inlineData: {
        data: inputData.imageBase64,
        mimeType: inputData.mimeType || 'image/jpeg'
      }
    });
    if (!inputData.text) {
      contents.push("Analisis foto makanan ini, estimasi porsi dan hitung nilai kalorinya.");
    }
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: foodSchema,
      systemInstruction: "Kamu adalah ahli nutrisi. Estimasi nilai kalori dan makronutrisi makanan secara realistis. Selalu kembalikan respon sesuai format JSON schema."
    }
  });

  return JSON.parse(response.text);
}

// Test koneksi saat pertama dimuat
console.log("Supabase & Gemini Module Ready!");