import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

// ═══════════════════════════════════════════════════════════════
// ROMET JOYERÍA — Edge Function v60
// FIX: send-email ahora tiene verify_jwt:false → correos funcionan
// MEJORA: prompting de alta calidad para Gemini 2.0 flash image gen
// ═══════════════════════════════════════════════════════════════

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-goog-api-key",
};

const CATEGORIES: Record<string, string> = {
  anillo:     "ring",
  colgante:   "pendant necklace",
  pendientes: "earrings (show as a pair)",
  pulsera:    "bracelet",
  gemelos:    "cufflinks (a pair)",
  medallas:   "medallion pendant",
};

const CATEGORY_LABELS: Record<string, string> = {
  anillo: "Anillo", colgante: "Colgante", pendientes: "Pendientes",
  pulsera: "Pulsera", gemelos: "Gemelos", medallas: "Medalla",
};

const MATERIALS: Record<string, string> = {
  oro_amarillo: "18-karat yellow gold, warm honey tone, high-mirror polish, luxurious luster",
  oro_blanco:   "18-karat white gold, rhodium-plated, bright silver-white, icy cool sheen",
  oro_rosa:     "18-karat rose gold, blush pink-copper hue, satin-polished surface",
  platino:      "950 platinum, naturally cool grey-white, heavy substantial look, matte-satin finish",
  plata:        "sterling silver 925, bright white, mirror-polished, high shine",
};

const MATERIAL_LABELS: Record<string, string> = {
  oro_amarillo: "Oro Amarillo 18k", oro_blanco: "Oro Blanco 18k",
  oro_rosa: "Oro Rosa 18k", platino: "Platino 950", plata: "Plata 925",
};

const GEMSTONES: Record<string, string> = {
  diamante:  "diamond, brilliant-cut, D-color, VS1 clarity, exceptional fire and sparkle",
  rubi:      "ruby, vivid pigeon-blood red, oval cut, rich saturated color",
  esmeralda: "emerald, deep forest green, emerald-cut, natural inclusions",
  zafiro:    "sapphire, royal blue, cushion-cut, velvety hue",
  perla:     "Akoya pearl, perfectly round, white with rose overtone, high luster",
  sin_gema:  "",
};

// Modelo con capacidad nativa de generación de imagen
const GEMINI_MODEL = "gemini-2.0-flash-preview-image-generation";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// ─── Prompt base de alta calidad ─────────────────────────────────
function buildBasePrompt(params: {
  cat: string;
  mat: string;
  gem: string;
  style: string;
  budget: string;
  notes: string;
  profile: string;
}): string {
  const { cat, mat, gem, style, budget, notes, profile } = params;

  const gemLine    = gem    ? `Set with a ${gem}.`              : "No gemstone — clean metal design.";
  const styleLine  = style  ? `Design style: ${style}.`         : "";
  const profileLine= profile? `Target profile: ${profile}.`     : "";
  const budgetLine = budget ? `Budget range: ${budget} EUR.`    : "";
  const notesLine  = notes  ? `Special instructions: ${notes}.` : "";

  return `You are a professional fine jewelry CGI artist.
Create a PHOTOREALISTIC high-end jewelry product render of a ${cat} made in ${mat}.
${gemLine}
${styleLine}
${profileLine}
${budgetLine}
${notesLine}

TECHNICAL RENDERING REQUIREMENTS:
- Pure white seamless studio background, no shadows except subtle drop shadow under the piece
- Professional jewelry photography lighting: softbox from top-left, fill light from right, backlight rim
- Macro-level detail: visible metal grain, gemstone facets refracting light, prong details, surface texture
- Aspect ratio 1:1 square image
- The piece must look like it could appear in a Tiffany, Cartier or Van Cleef & Arpels catalog
- Ultra sharp focus on the entire piece

STRICT RULES — NO EXCEPTIONS:
- Do NOT add any text, letters, initials, brand marks, logos, hallmarks, serial numbers, inscriptions, engravings, or alphanumeric characters of ANY kind on the jewelry or background
- Do NOT add watermarks, copyright notices, or any overlay text
- The piece must be completely free of lettering or writing`;
}

async function generateView(
  basePrompt: string,
  viewAngle: string,
  imagePart: any | null,
  apiKey: string
): Promise<string | null> {
  const viewInstruction = ({
    "front": "Camera angle: perfectly centered FRONT VIEW, piece facing directly toward viewer, upright position.",
    "back":  "Camera angle: BACK VIEW, piece rotated 180 degrees, showing reverse side details.",
    "side":  "Camera angle: SIDE PROFILE VIEW, piece rotated 90 degrees to show full profile and depth.",
  } as Record<string, string>)[viewAngle] || "";

  const fullPrompt = `${basePrompt}\n\n${viewInstruction}`;
  const parts: any[] = [];
  if (imagePart) parts.push(imagePart);
  parts.push({ text: fullPrompt });

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 0.3,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Gemini error:", JSON.stringify(data).substring(0, 600));
      return null;
    }

    const imgPart = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    if (imgPart) {
      console.log(`View '${viewAngle}' generated OK.`);
      return imgPart.inlineData.data;
    }
    console.warn(`View '${viewAngle}' returned no image.`);
    return null;
  } catch (e) {
    console.error(`Gemini exception (${viewAngle}):`, e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const apiKey = Deno.env.get("GEMINI_API_KEY") || "";

    if (!SUPABASE_URL || !SUPABASE_KEY || !apiKey) {
      throw new Error("Missing env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY");
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);

    // ── Auth ─────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    const userToken = authHeader?.replace("Bearer ", "");
    if (!userToken) throw new Error("No session token provided");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(userToken);
    if (authError || !user) throw new Error("Unauthorized");

    const credits = user.user_metadata?.credits ?? 0;
    if (credits <= 0) {
      return new Response(JSON.stringify({ error: "Sin créditos" }), { status: 402, headers: corsHeaders });
    }

    // ── Parse body ───────────────────────────────────────────────
    const body = await req.json();
    const {
      email, nombre, telefono,
      categoria_producto, material, gema_principal, estilo, perfil_usuario,
      presupuesto, sugerencias, imagen_subida_url, is_redesign, cambios_solicitados,
    } = body;

    const cat = CATEGORIES[categoria_producto] || categoria_producto || "jewelry piece";
    const mat = MATERIALS[material] || material || "18-karat gold";
    const gem = GEMSTONES[gema_principal] || (gema_principal && gema_principal !== "sin_gema" ? gema_principal : "") || "";

    // ── Load reference image ─────────────────────────────────────
    let imagePart: any = null;
    const refImageUrl = imagen_subida_url || body.imagen_referencia_url;
    if (refImageUrl) {
      try {
        const imgRes = await fetch(refImageUrl);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          imagePart = { inlineData: { mimeType: contentType, data: encode(new Uint8Array(buf)) } };
          console.log("Reference image loaded, size:", buf.byteLength);
        }
      } catch (e) { console.error("Reference image load fail:", e); }
    }

    // ── Build prompt ─────────────────────────────────────────────
    let basePrompt: string;
    if (is_redesign && (imagePart || sugerencias)) {
      const changeInstructions = cambios_solicitados || sugerencias || "improve the design";
      basePrompt = `You are a professional fine jewelry CGI artist.
${imagePart ? "Using the attached reference image as the base design," : ""} Apply these modifications to the ${cat}: ${changeInstructions}.
Keep the same ${mat} material${gem ? ` and ${gem}` : ""}.
Maintain photorealistic render quality, pure white studio background, professional jewelry photography lighting.
STRICT RULES: No text, letters, marks, logos, hallmarks, or inscriptions of any kind on the jewelry or background.`;
    } else {
      basePrompt = buildBasePrompt({
        cat, mat, gem,
        style: estilo || "",
        budget: presupuesto || "",
        notes: sugerencias || "",
        profile: perfil_usuario || "",
      });
    }

    console.log("Generating 3 views. Model:", GEMINI_MODEL);

    // ── Generate 3 views in parallel ─────────────────────────────
    const [frontB64, backB64, sideB64] = await Promise.all([
      generateView(basePrompt, "front", imagePart, apiKey),
      generateView(basePrompt, "back",  imagePart, apiKey),
      generateView(basePrompt, "side",  imagePart, apiKey),
    ]);

    if (!frontB64) {
      throw new Error("Gemini failed to generate the front view. Check GEMINI_API_KEY and model availability.");
    }

    // ── Save to Supabase Storage ─────────────────────────────────
    async function saveImage(b64: string | null, label: string): Promise<string | null> {
      if (!b64) return null;
      try {
        const fname = `diseno_${Date.now()}_${label}.png`;
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        const { error: uploadError } = await supabaseAdmin.storage
          .from("disenos")
          .upload(fname, bytes, { contentType: "image/png", upsert: false });
        if (uploadError) { console.error(`Storage error (${label}):`, uploadError.message); return null; }
        return supabaseAdmin.storage.from("disenos").getPublicUrl(fname).data.publicUrl;
      } catch(e) { console.error(`Save exception (${label}):`, e); return null; }
    }

    const [imagenFrontal, imagenTrasera, imagenLateral] = await Promise.all([
      saveImage(frontB64, "front"),
      saveImage(backB64,  "back"),
      saveImage(sideB64,  "side"),
    ]);

    // ── Insert DB ────────────────────────────────────────────────
    const insertPayload: any = {
      imagen_generada_url: imagenFrontal,
      prompt_usado: basePrompt,
      marca_temporal: new Date().toISOString(),
    };
    ["nombre","telefono","email","categoria_producto","material","perfil_usuario","gema_principal","estilo","sugerencias","talla_medida"]
      .forEach(f => { if (body[f] !== undefined) insertPayload[f] = body[f]; });
    if (body.presupuesto !== undefined) insertPayload.presupuesto = body.presupuesto ? String(body.presupuesto) : null;
    if (body.peso_estimado !== undefined) insertPayload.peso_estimado = body.peso_estimado ? String(body.peso_estimado) : null;
    if (refImageUrl) insertPayload.imagen_subida_url = refImageUrl;

    const { data: insertedData, error: dbError } = await supabaseAdmin
      .from("solicitudes_disenos_romet")
      .insert(insertPayload)
      .select()
      .single();

    if (dbError) {
      console.error("DB Insert Error:", JSON.stringify(dbError));
    } else {
      console.log("DB Insert OK, ID:", insertedData?.id);
    }

    // ── Send emails ──────────────────────────────────────────────
    // send-email has verify_jwt:false so service_role key works as Bearer
    if (insertedData && email && !is_redesign) {
      try {
        const emailPayload = {
          type: refImageUrl ? "Sube tu Diseño" : "Diseño Guiado",
          to: email,
          customerName: nombre || "Cliente",
          customerPhone: telefono || "",
          orderId: insertedData.id,
          categoria: CATEGORY_LABELS[categoria_producto] || categoria_producto || "",
          material: MATERIAL_LABELS[material] || material || "",
          sugerencias: sugerencias || "",
          imagenSubidaUrl: refImageUrl || null,
          imagenFrontal: imagenFrontal || null,
          imagenTrasera: imagenTrasera || null,
          imagenLateral: imagenLateral || null,
        };
        console.log("Calling send-email...");
        const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify(emailPayload),
        });
        const emailBody = await emailRes.text();
        console.log("send-email result:", emailRes.status, emailBody.substring(0, 300));
      } catch (e) {
        console.error("Email exception:", e);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      imagenUrl: imagenFrontal,
      imagenFrontal,
      imagenTrasera,
      imagenLateral,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("v60 ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
