import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES: Record<string, string> = {
  anillo:     "ring (circular band worn on the finger)",
  colgante:   "pendant (hanging from a necklace chain)",
  pendientes: "earrings (a pair)",
  pulsera:    "bracelet (for the wrist)",
  gemelos:    "cufflinks (shirt cuff fasteners)",
  medallas:   "medallion (flat circular disc on a necklace chain)",
};

const CATEGORY_LABELS: Record<string, string> = {
  anillo: "Anillo", colgante: "Colgante", pendientes: "Pendientes",
  pulsera: "Pulsera", gemelos: "Gemelos", medallas: "Medalla",
};

const MATERIALS: Record<string, string> = {
  oro_amarillo: "18k yellow gold, warm mirror-polished",
  oro_blanco:   "18k white gold, rhodium-plated",
  oro_rosa:     "18k rose gold, pink-copper polished",
  platino:      "platinum 950, naturally white",
  plata:        "sterling silver 925, bright white polished",
};

const MATERIAL_LABELS: Record<string, string> = {
  oro_amarillo: "Oro Amarillo 18k", oro_blanco: "Oro Blanco 18k",
  oro_rosa: "Oro Rosa 18k", platino: "Platino 950", plata: "Plata 925",
};

// gemini-2.5-flash-image: supports multimodal input (image+text) AND image output
// Switching to GA model gemini-3.1-flash-image (available since May 2026)
// This model supports native IMAGE output and maintains better consistency across parallel requests.
const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_URL = (key: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`;

// Rule appended to EVERY prompt to prevent Gemini adding text/logos/watermarks
const NO_TEXT_RULE = `
STRICT RULES (no exceptions):
- Do NOT add any text, letters, initials, words, inscriptions, logos, brand marks, serial numbers, or watermarks ANYWHERE on the jewelry — not on the surface, not on the edge, not engraved, not stamped, not printed.
- Do NOT add hallmark stamps, maker's marks, or any alphanumeric characters of any kind.
- The piece must be completely free of any lettering or writing.
- The only decoration permitted is what is explicitly described in this prompt.
- White studio background. Photorealistic commercial jewelry photography quality.`;

async function generateView(
  prompt: string,
  imagePart: unknown | null,
  apiKey: string
): Promise<string | null> {
  const parts: unknown[] = [];
  if (imagePart) parts.push(imagePart);
  parts.push({ text: prompt });

  try {
    const res = await fetch(GEMINI_URL(apiKey), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Gemini error:", JSON.stringify(data).substring(0, 500));
      return null;
    }

    const responseParts = data?.candidates?.[0]?.content?.parts ?? [];
    const imgPart = responseParts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));

    if (!imgPart) {
      console.error("No image. finishReason:", data?.candidates?.[0]?.finishReason);
      console.error("Response:", JSON.stringify(data).substring(0, 600));
      return null;
    }

    return imgPart.inlineData.data; // base64
  } catch (e) {
    console.error("Gemini exception:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(Deno.env.get("URL")!, Deno.env.get("SERVICE_KEY")!);
  const userToken = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!userToken) return new Response(JSON.stringify({ error: "No token" }), { status: 401, headers: corsHeaders });

  const { data: { user } } = await supabaseAdmin.auth.getUser(userToken);
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

  // Security Restriction: Only allowed user for now
  if (user.email !== 'flozros@gmail.com') {
    return new Response(JSON.stringify({ error: "Acceso restringido (Modo Beta)" }), { status: 403, headers: corsHeaders });
  }

  const credits = user.user_metadata?.credits ?? 0;
  if (credits <= 0) return new Response(JSON.stringify({ error: "No credits" }), { status: 402, headers: corsHeaders });

  const body = await req.json();
  const { nombre, email, categoria_producto, material, sugerencias, imagen_subida_url, gema_principal } = body;

  const supabase = createClient(Deno.env.get("URL")!, Deno.env.get("SERVICE_KEY")!);
  const apiKey = Deno.env.get("GEMINI_API_KEY")!;

  // isRedesign = true when the user is requesting changes to a previously generated design
  const isRedesign = sugerencias?.includes("Cambios solicitados:") || body.is_redesign === true;
  const userNotes = isRedesign
    ? (sugerencias?.split("Cambios solicitados:")?.[1]?.trim() || sugerencias || "")
    : (sugerencias || "").trim();

  const cat = CATEGORIES[categoria_producto] || categoria_producto || "medallion";
  const mat = MATERIALS[material] || material || "18k yellow gold";

  // ── Fetch the image (reference photo OR previous render for redesign) ──────
  // For original designs:  imagen_subida_url = client's reference photo
  // For redesigns:         imagen_subida_url = previously generated front render
  // In both cases we pass it to Gemini as inlineData so the AI can SEE it.
  let imagePart: unknown | null = null;
  if (imagen_subida_url) {
    try {
      const imgRes = await fetch(imagen_subida_url);
      if (imgRes.ok) {
        const buf = await imgRes.arrayBuffer();
        const b64 = encode(new Uint8Array(buf));
        const mime = imgRes.headers.get("content-type")?.split(";")?.[0] || "image/jpeg";
        imagePart = { inlineData: { mimeType: mime, data: b64 } };
        console.log(
          isRedesign ? "Previous render loaded for redesign." : "Reference image loaded.",
          "Size:", buf.byteLength, "mime:", mime
        );
      } else {
        console.error("Could not fetch image, HTTP:", imgRes.status);
      }
    } catch (e) {
      console.error("Exception fetching image:", e);
    }
  }

  // ── Build prompt based on mode ─────────────────────────────────────────────
  let baseContext: string;

  if (isRedesign && imagePart) {
    // ─ Redesign WITH visual context (the previous render is attached) ─
    baseContext = `You are a master jewelry designer and 3D render artist.

The attached image shows the PREVIOUSLY GENERATED design of a ${cat} made of ${mat}.
This is your starting point. Apply ONLY the following changes to it, keeping EVERYTHING ELSE as identical to the original as possible:

"${userNotes}"

Do not add new decorations, change the material, or alter aspects not mentioned in the requested changes.
${NO_TEXT_RULE}`;

  } else if (isRedesign) {
    // ─ Redesign WITHOUT image (fallback: describe changes verbally) ─
    baseContext = `You are a master jewelry designer.
Apply ONLY these specific changes to the existing ${cat} design made in ${mat}, keeping everything else identical:
"${userNotes}"
${NO_TEXT_RULE}`;

  } else if (imagePart) {
    // ─ Original design with reference photo to engrave ─
    baseContext = `You are a master jewelry engraver and 3D photorealistic render artist.

TASK: Produce a photorealistic render of a ${cat} made of ${mat}.

The attached photograph is the REFERENCE SUBJECT that must be engraved as a bas-relief on the face of the jewelry piece.
You MUST study every detail of the attached photo (facial features, proportions, hair, jawline, eyes, nose, mouth — the specific unique likeness of this individual) and reproduce it faithfully as a precision metal bas-relief carving, exactly as seen on high-quality commemorative medals or coins.
Do NOT simplify, generalize, cartoon-ify, or invent any features. Capture the EXACT likeness of the person in the photo.
${userNotes ? `Additional client instruction: "${userNotes}"` : ""}
The rest of the jewelry surface must be clean, polished ${mat} with no other decoration.
${NO_TEXT_RULE}`;

  } else {
    // ─ Original design from scratch (no reference image) ─
    baseContext = `You are a master fine jewelry designer and 3D render artist.

TASK: Create a photorealistic studio render of a handcrafted ${cat} made of ${mat}.
${gema_principal ? `Main gemstone: ${gema_principal}.` : "No gemstone — pure metal design."}
${userNotes ? `Design brief: "${userNotes}"` : "Style: elegant, classic, timeless. Clean and minimal."}

${NO_TEXT_RULE}`;
  }

  console.log("Mode:", isRedesign ? "REDESIGN" : "ORIGINAL", "| hasImage:", !!imagePart);
  console.log("Prompt (first 300):", baseContext.substring(0, 300));

  // ── Generate 3 views in parallel ──────────────────────────────────────────
  const [frontB64, backB64, sideB64] = await Promise.all([
    generateView(`${baseContext}\n\nRENDER: FRONT VIEW — show the jewelry piece from directly in front, perfectly centered on a white background.`, imagePart, apiKey),
    generateView(`${baseContext}\n\nRENDER: BACK VIEW — show the exact same jewelry piece from the back/reverse side, on a white background.`, imagePart, apiKey),
    generateView(`${baseContext}\n\nRENDER: SIDE PROFILE VIEW — show the jewelry piece from the side (90° angle), revealing its depth and thickness, on a white background.`, imagePart, apiKey),
  ]);

  // ── Save to storage ────────────────────────────────────────────────────────
  async function saveImage(b64: string | null, label: string): Promise<string | null> {
    if (!b64) return null;
    try {
      const fname = `diseno_${Date.now()}_${label}.png`;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const { error } = await supabase.storage.from("disenos").upload(fname, bytes, { contentType: "image/png" });
      if (error) { console.error(`Storage error (${label}):`, error); return null; }
      return supabase.storage.from("disenos").getPublicUrl(fname).data.publicUrl;
    } catch (e) { console.error(`Save exception (${label}):`, e); return null; }
  }

  const [imagenFrontal, imagenTrasera, imagenLateral] = await Promise.all([
    saveImage(frontB64, "front"),
    saveImage(backB64, "back"),
    saveImage(sideB64, "side"),
  ]);

  const imagenUrl = imagenFrontal;
  console.log("Views — front:", !!imagenFrontal, "back:", !!imagenTrasera, "side:", !!imagenLateral);

  // ── Save to DB ─────────────────────────────────────────────────────────────
  const { data: insertedData, error: dbError } = await supabase
    .from("solicitudes_disenos_romet")
    .insert({ ...body, imagen_generada_url: imagenUrl, prompt_usado: baseContext })
    .select().single();

  if (dbError) console.error("DB insert error:", dbError);

  // ── Send email (only on first generation, not on redesigns) ───────────────
  if (insertedData && email && !isRedesign) {
    try {
      const { error: emailError } = await supabaseAdmin.functions.invoke("send-email", {
        body: {
          type: imagen_subida_url ? "Sube tu Diseño" : "Diseño Guiado",
          to: email,
          customerName: nombre || "Cliente",
          customerPhone: body.telefono || "",
          orderId: insertedData.id,
          categoria: CATEGORY_LABELS[categoria_producto] || categoria_producto || "",
          material: MATERIAL_LABELS[material] || material || "",
          sugerencias: userNotes || "",
          imagenSubidaUrl: imagen_subida_url || null,
          imagenFrontal: imagenFrontal || null,
          imagenTrasera: imagenTrasera || null,
          imagenLateral: imagenLateral || null,
        },
      });
      if (emailError) console.error("send-email error:", emailError);
      else console.log("Emails dispatched to:", email, "+ owner");
    } catch (e) {
      console.error("Email invoke exception:", e);
    }
  }

  return new Response(
    JSON.stringify({ success: true, imagenUrl, imagenFrontal, imagenTrasera, imagenLateral, dbError }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
});
