export default async function handler(req, res) {
    // Hanya izinkan method POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Ambil API key dari Environment Variables Vercel
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'GEMINI_API_KEY belum di-set di Vercel' });
    }

    try {
        const { prompt, systemInstruction, responseSchema } = req.body;

        // Endpoint REST API Gemini
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        // Payload dasar
        const payload = {
            contents: [{ parts: [{ text: prompt }] }],
        };

        // Tambahkan instruksi sistem jika ada
        if (systemInstruction) {
            payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }

        // Jika ada schema JSON (untuk knowledge graph)
        if (responseSchema) {
            payload.generationConfig = {
                responseMimeType: "application/json",
                responseSchema: responseSchema
            };
        }

        // Panggil Google Gemini
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.text();
            console.error("Gemini API Error:", errData);
            return res.status(response.status).json({ error: "Terjadi kesalahan dari API Gemini" });
        }

        const data = await response.json();
        
        // Ekstrak teks balasan
        const textResponse = data.candidates[0].content.parts[0].text;

        res.status(200).json({ text: textResponse });

    } catch (error) {
        console.error("Serverless Function Error:", error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
