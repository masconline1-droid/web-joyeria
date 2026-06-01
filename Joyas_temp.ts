import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// ═══════════════════════════════════════════════════════════
// ROMET JOYERÍA — Edge Function v62
// Glosario joyería + 3 modos de prompt + emails directos Resend
// Modelo: gemini-3.1-flash-image (confirmado funcional)
// ═══════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ═══ GLOSARIO DE JOYERÍA ═══════════════════════════════════
const GLOSARIO: Record<string, string> = {
  "submarino": "SUBMARINO (cufflink closure): a chain-and-bar fitting consisting of a flat T-shaped bar connected by a small chain (5 links) to the decorative face. The bar passes through the buttonhole and lies flat.",
  "media caña": "MEDIA CAÑA (half-round edge): a rounded convex profile along the edge or border, like half a tube. Smooth, polished, domed rim — NOT flat, NOT sharp.",
  "monograma": "MONOGRAMA (monogram): two or more letters elegantly intertwined in an ornate Victorian style, overlapping to form a single decorative emblem. The letters weave through each other.",
  "entorchado": "ENTORCHADO (twisted wire): metal wire twisted in a rope-like spiral pattern, like a cord. Used for bands and borders.",
  "horquilla": "HORQUILLA (rigid cufflink fitting): a rigid hinged fitting with a spring mechanism attached to the back of the cufflink face. No chain.",
  "torzal": "TORZAL / NUDO (knot): a metal element formed into a woven knot shape, like a Turk's-head knot.",
  "cuajo": "CUAJO: a round, richly engraved decorative element with detailed relief work, typical of traditional Spanish goldsmithing.",
  "chapa": "CHAPA (plate): a flat thin sheet of metal forming the base or face of the piece.",
  "cordón": "CORDÓN (cord chain): a rope-style chain, twisted to look like a cord.",
  "filo": "FILO (edge/border): the outer rim or edge of the piece.",
  "eslabón": "ESLABÓN (link): individual loop of a chain. '5 eslabones' = a chain of 5 links.",
  "eslabones": "ESLABONES (links): individual loops of a chain.",
};

function detectarTerminos(...textos: (string | null | undefined)[]): string {
  const textoCompleto = textos.filter(Boolean).join(" ").toLowerCase();
  const definiciones: string[] = [];
  for (const [termino, definicion] of Object.entries(GLOSARIO)) {
    if (textoCompleto.includes(termino)) {
      definiciones.push(definicion);
    }
  }
  if (definiciones.length === 0) return "";
  return `\n\nJEWELRY TERMINOLOGY (the client used these professional terms — follow these definitions exactly):\n${definiciones.map(d => "- " + d).join("\n")}`;
}

// ═══ MAPS ═══════════════════════════════════════════════════
const CATEGORY_MAP: Record<string, string> = {
  anillo:     "ring (circular band worn on finger)",
  colgante:   "pendant (hanging from a chain, worn on chest)",
  pendientes: "earrings (worn on earlobes, always render as a PAIR)",
  pulsera:    "bracelet (worn around wrist)",
  gemelos:    "cufflinks (formal men's shirt accessory, always render as a PAIR)",
  medallas:   "medallion pendant (flat disc-shaped, religious or commemorative)",
};

const CATEGORY_LABELS: Record<string, string> = {
  anillo: "Anillo", colgante: "Colgante", pendientes: "Pendientes",
  pulsera: "Pulsera", gemelos: "Gemelos", medallas: "Medalla",
};

const MATERIAL_MAP: Record<string, string> = {
  oro_amarillo: "18k yellow gold — warm golden color, mirror-polished",
  oro_blanco:   "18k white gold rhodium plated — cool silver-white, mirror-polished",
  oro_rosa:     "18k rose gold — warm pinkish-gold, mirror-polished",
  platino:      "platinum 950 — naturally white, dense, prestigious",
  plata:        "sterling silver 925 — bright silver, polished",
};

const MATERIAL_LABELS: Record<string, string> = {
  oro_amarillo: "Oro Amarillo 18k", oro_blanco: "Oro Blanco 18k",
  oro_rosa: "Oro Rosa 18k", platino: "Platino 950", plata: "Plata 925",
};

const STYLE_MAP: Record<string, string> = {
  moderno:    "modern minimalist — smooth surfaces, clean geometric lines, no ornamentation, simple and elegant",
  clasico:    "classic — traditional proportions, subtle engravings or fine details, timeless elegance",
  naturaleza: "nature-inspired — organic forms, subtle leaf or floral motifs, flowing lines",
};

const PROFILE_MAP: Record<string, string> = {
  senora:    "adult woman",
  caballero: "adult man",
  cadete:    "teenager",
  nino:      "child (very small scale)",
};

// MODELO CONFIRMADO FUNCIONAL
const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // ── Env vars (fallbacks para ambas convenciones de nombres) ──
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("URL") || "";
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_KEY") || "";
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
    const PROPIETARIO_EMAIL = Deno.env.get("PROPIETARIO_EMAIL") || "rometjoyeria@gmail.com";

    if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
      throw new Error("Missing required environment variables (SUPABASE_URL/URL, SUPABASE_SERVICE_ROLE_KEY/SERVICE_KEY, GEMINI_API_KEY)");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── Auth check ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    const userToken = authHeader?.replace("Bearer ", "");
    if (!userToken) throw new Error("No session token provided");
    const { data: { user }, error: authError } = await supabase.auth.getUser(userToken);
    if (authError || !user) throw new Error("Unauthorized");

    const credits = user.user_metadata?.credits ?? 0;
    if (credits <= 0) {
      return new Response(JSON.stringify({ error: "Sin créditos" }), { status: 402, headers: corsHeaders });
    }

    // ── Parse body ───────────────────────────────────────────────
    const body = await req.json();
    const {
      nombre, telefono, email, categoria_producto, material,
      perfil_usuario, gema_principal, estilo, presupuesto,
      peso_estimado, talla_medida, sugerencias,
      imagen_subida_url,
      imagen_referencia_url,
      cambios_solicitados,
    } = body;

    const marca_temporal = new Date().toISOString();

    // ── Build descriptions ───────────────────────────────────────
    const categoriaDesc = CATEGORY_MAP[categoria_producto] || categoria_producto || "jewelry piece";
    const materialDesc  = MATERIAL_MAP[material]           || material           || "precious metal";
    const estiloDesc    = STYLE_MAP[estilo]                || estilo             || "classic";
    const perfilDesc    = PROFILE_MAP[perfil_usuario]      || perfil_usuario      || "adult";
    const tieneGema     = gema_principal && gema_principal !== "sin_gema";
    const glosarioInyectado = detectarTerminos(sugerencias, cambios_solicitados);

    const especificaciones = `JEWELRY SPECIFICATIONS (must always be respected):
- Type: ${categoriaDesc}
- Metal: ${materialDesc}
- Gemstone: ${tieneGema ? gema_principal + " — realistic facets and light refraction" : "no gemstone — clean metal only"}
- Style: ${estiloDesc}
- Target wearer: ${perfilDesc}
${sugerencias ? "- Design notes: " + sugerencias : ""}`;

    const reglasEstilo = `CRITICAL STYLE RULES — follow strictly:
- The piece MUST look like a real, commercially available jewelry store product
- SIMPLE and CLEAN — no excessive decoration, no fantasy elements
- Realistic, wearable proportions
- DO NOT add faces, animals, crowns, wings, dragons, snakes, skulls or fantasy motifs unless explicitly requested
- DO NOT invent decorative elements that were not asked for
- Understated and elegant, never baroque or churrigueresque`;

    const reglasVistas = `THREE-VIEW COMPOSITE IMAGE — CRITICALLY IMPORTANT:
- Generate ONE wide horizontal image divided into THREE equal vertical panels side by side
- LEFT panel: FRONT view (piece facing viewer directly, upright)
- CENTER panel: BACK view (piece rotated 180°, showing reverse side)
- RIGHT panel: SIDE/PROFILE view (piece rotated 90°, showing depth and thickness)
- ⚠️ ALL THREE PANELS MUST SHOW THE EXACT SAME SINGLE PIECE — only the camera angle differs
- The piece MUST be IDENTICAL in all three panels: same shape, same size, same gemstones, same proportions, same decorative details
- This is ONE object photographed from three angles — NOT three different objects
- Do NOT add, remove or change any element between panels
- Do NOT mix in other jewelry pieces or accessories
- Small labels at the bottom of each panel: FRONT | BACK | SIDE`;

    const reglasRender = `RENDERING QUALITY:
- Pure white seamless studio background
- Professional jewelry photography lighting (softbox top-left + fill right + rim backlight)
- Mirror-polished metal with realistic reflections and highlights
- ${tieneGema ? "Gemstone with realistic transparency and light caustics" : "Clean polished metal surface"}
- Ultra-sharp macro photography quality
- No watermarks, no text overlays (EXCEPT the three panel labels FRONT/BACK/SIDE at the bottom)`;

    const esRetoque     = !!imagen_referencia_url;
    const esImagenSubida = !!imagen_subida_url;
    const imagenParaGemini = imagen_referencia_url || imagen_subida_url || null;

    // ── Build prompt (3 modos) ───────────────────────────────────
    let prompt: string;

    if (esRetoque) {
      // MODO 2/4: Retoque de imagen existente
      prompt = `You are a professional fine jewelry designer performing a PRECISE RETOUCH on an existing design.

The attached image shows the CURRENT design. Modify ONLY what is specified in the requested changes below, keeping EVERYTHING ELSE exactly identical. This is a retouch — NOT a redesign. Do not reinvent the piece, do not change the letter, shape, or any element that the requested change does not explicitly mention.

${especificaciones}

⚠️ REQUESTED CHANGES — apply ONLY these specific modifications, keep all other features identical to the attached image:
"${cambios_solicitados || sugerencias}"
${glosarioInyectado}

${reglasEstilo}

${reglasVistas}

${reglasRender}

CRITICAL: The result must be immediately recognizable as the SAME piece from the attached image, with ONLY the requested change applied. Preserve original form, proportions, letters, motifs and all unchanged details.`;

    } else if (esImagenSubida) {
      // MODO 3: El cliente sube una foto de referencia
      prompt = `You are a professional fine jewelry designer. The attached image is a reference uploaded by the client (a design they like, a sketch, or a photo of a figure/object they want reproduced as jewelry).

Study the reference carefully and reproduce its key elements faithfully as a professional jewelry piece. If the reference shows a specific face, religious figure, letter, monogram or distinctive motif — reproduce THAT specific subject faithfully, do not replace it with a generic one.

${especificaciones}
${glosarioInyectado}

${reglasEstilo}

${reglasVistas}

${reglasRender}`;

    } else {
      // MODO 1: Diseño desde cero
      prompt = `You are a professional fine jewelry designer. Generate a photorealistic jewelry piece based on the specifications below.

${especificaciones}
${glosarioInyectado}

${reglasEstilo}

${reglasVistas}

${reglasRender}`;
    }

    // ── Load reference image if provided ────────────────────────
    let imagenBase64: string | null = null;
    let imagenMimeType = "image/jpeg";

    if (imagenParaGemini) {
      try {
        const imgRes = await fetch(imagenParaGemini);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          imagenBase64 = encode(new Uint8Array(buf));
          imagenMimeType = imgRes.headers.get("content-type")?.split(";")[0] || "image/jpeg";
          console.log("Reference image loaded, bytes:", buf.byteLength);
        }
      } catch (e) {
        console.warn("Could not load reference image:", e);
      }
    }

    // ── Call Gemini ──────────────────────────────────────────────
    const parts: any[] = [];
    if (imagenBase64) {
      parts.push({ inlineData: { mimeType: imagenMimeType, data: imagenBase64 } });
    }
    parts.push({ text: prompt });

    const modo = esRetoque ? "retoque" : esImagenSubida ? "imagen_subida" : "desde_cero";
    console.log(`v62 — mode: ${modo}, model: ${GEMINI_MODEL}, hasRefImage: ${!!imagenBase64}`);

    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      console.error("Gemini error:", JSON.stringify(geminiData).substring(0, 600));
      throw new Error(`Gemini API error: ${geminiData?.error?.message || geminiRes.status}`);
    }

    const imagePart = geminiData.candidates?.[0]?.content?.parts?.find(
      (p: any) => p.inlineData?.mimeType?.startsWith("image/")
    );

    if (!imagePart) {
      console.error("Gemini returned no image. Parts:", JSON.stringify(
        geminiData.candidates?.[0]?.content?.parts?.map((p: any) => Object.keys(p))
      ));
      throw new Error("Gemini did not return an image. Check API key and model availability.");
    }

    // ── Save image to Supabase Storage ───────────────────────────
    const fileName = `diseno_${Date.now()}_${modo}.png`;
    const imageBytes = Uint8Array.from(atob(imagePart.inlineData.data), c => c.charCodeAt(0));
    const { error: storageError } = await supabase.storage
      .from("disenos")
      .upload(fileName, imageBytes, { contentType: "image/png", upsert: false });

    if (storageError) {
      console.error("Storage error:", storageError.message);
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    const { data: urlData } = supabase.storage.from("disenos").getPublicUrl(fileName);
    const imagenUrl = urlData.publicUrl;
    console.log("Image saved:", imagenUrl);

    // ── Insert into DB ───────────────────────────────────────────
    const insertPayload: any = {
      imagen_generada_url: imagenUrl,
      prompt_usado: prompt,
      marca_temporal,
    };
    const dbFields = ["nombre","telefono","email","categoria_producto","material",
      "perfil_usuario","gema_principal","estilo","sugerencias","talla_medida"];
    dbFields.forEach(f => { if (body[f] !== undefined) insertPayload[f] = body[f]; });
    if (body.presupuesto !== undefined) insertPayload.presupuesto = body.presupuesto ? String(body.presupuesto) : null;
    if (body.peso_estimado !== undefined) insertPayload.peso_estimado = body.peso_estimado ? String(body.peso_estimado) : null;
    if (imagenParaGemini) insertPayload.imagen_subida_url = imagenParaGemini;

    const { data: insertedData, error: dbError } = await supabase
      .from("solicitudes_disenos_romet")
      .insert(insertPayload)
      .select()
      .single();

    if (dbError) {
      console.error("DB Insert error:", JSON.stringify(dbError));
    } else {
      console.log("DB Insert OK, ID:", insertedData?.id);
    }

    // ── Send emails via Resend (solo en generaciones nuevas, no retoques) ──
    if (email && RESEND_API_KEY && !esRetoque) {
      const emailImageHtml = `
        <div style="text-align:center; margin:20px 0;">
          <img src="${imagenUrl}" style="max-width:100%; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.1);" alt="Diseño generado" />
          <p style="font-size:11px; color:#999; margin-top:6px; font-family:sans-serif;">Vista compuesta: Frontal · Trasera · Lateral</p>
        </div>`;

      const resendHeaders = {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      };

      // Email al propietario
      try {
        const ownerRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: resendHeaders,
          body: JSON.stringify({
            from: "Romet Joyería <no-reply@rometjoyeria.com>",
            to: [PROPIETARIO_EMAIL],
            subject: `⚡ Nueva solicitud: ${CATEGORY_LABELS[categoria_producto] || categoria_producto || "Joya"} — ${nombre || "Cliente"}`,
            html: `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;">
              <h2 style="color:#b8860b;">Nueva solicitud de diseño</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Nombre</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${nombre || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Teléfono</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${telefono || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Email</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${email || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Categoría</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${CATEGORY_LABELS[categoria_producto] || categoria_producto || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Material</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${MATERIAL_LABELS[material] || material || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Gema</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${gema_principal || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Estilo</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${estilo || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Perfil</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${perfil_usuario || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Presupuesto</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${presupuesto ? presupuesto + "€" : ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Talla</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${talla_medida || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Sugerencias</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${sugerencias || ""}</td></tr>
                <tr><td style="padding:8px;"><strong>Fecha</strong></td><td style="padding:8px;">${marca_temporal}</td></tr>
              </table>
              ${emailImageHtml}
            </div>`,
          }),
        });
        console.log("Owner email status:", ownerRes.status);
      } catch(e) { console.error("Owner email error:", e); }

      // Email al cliente
      try {
        const clientRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: resendHeaders,
          body: JSON.stringify({
            from: "Romet Joyería <no-reply@rometjoyeria.com>",
            to: [email],
            subject: "Tu diseño de joya personalizado — Romet Joyería",
            html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
              <h2 style="color:#b8860b;">Hola ${nombre || ""}, aquí tienes tu diseño</h2>
              <p>Hemos generado tu joya personalizada. Nos pondremos en contacto contigo muy pronto para hacerla realidad.</p>
              ${emailImageHtml}
              <table style="width:100%;border-collapse:collapse;margin-top:24px;">
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Categoría</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${CATEGORY_LABELS[categoria_producto] || categoria_producto || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Material</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${MATERIAL_LABELS[material] || material || ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Gema</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">${gema_principal || ""}</td></tr>
                <tr><td style="padding:8px;"><strong>Sugerencias</strong></td><td style="padding:8px;">${sugerencias || ""}</td></tr>
              </table>
              <p style="margin-top:24px;color:#888;">Con cariño, el equipo de Romet Joyería</p>
            </div>`,
          }),
        });
        console.log("Client email status:", clientRes.status);
      } catch(e) { console.error("Client email error:", e); }
    }

    return new Response(
      JSON.stringify({ success: true, imagenUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("v62 ERROR:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
