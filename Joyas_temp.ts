import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-goog-api-key",
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

const GEMINI_MODEL = "gemini-3.1-flash-image";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const NO_TEXT_RULE = `
STRICT RULES (no exceptions):
- Do NOT add any text, letters, initials, words, inscriptions, logos, brand marks, serial numbers, or watermarks ANYWHERE on the jewelry — not on the surface, not on the edge, not engraved, not stamped, not printed.
- Do NOT add hallmark stamps, maker's marks, or any alphanumeric characters of any kind.
- The piece must be completely free of any lettering or writing.
- White studio background. Photorealistic commercial jewelry photography quality.`;

async function generateView(prompt: string, imagePart: any | null, apiKey: string): Promise<string | null> {
  const parts: any[] = [];
  if (imagePart) parts.push(imagePart);
  parts.push({ text: prompt });

  try {
    const res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"], temperature: 0.4 },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Gemini error:", JSON.stringify(data).substring(0, 500));
      return null;
    }

    const imgPart = data?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
    return imgPart ? imgPart.inlineData.data : null;
  } catch (e) {
    console.error("Gemini exception:", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || Deno.env.get("URL") || "";
    const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_KEY") || "";
    const apiKey = Deno.env.get("GEMINI_API_KEY") || "";

    if (!SUPABASE_URL || !SUPABASE_KEY || !apiKey) {
      throw new Error("Configuration missing in Supabase.");
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_KEY);
    const body = await req.json();
    const { email, nombre, categoria_producto, material, sugerencias, imagen_subida_url, gema_principal, is_redesign } = body;

    let user = null;
    if (body.test === true) {
      console.log("TEST MODE BYPASS ACTIVE");
      user = { email: email || "flozros@gmail.com", user_metadata: { credits: 100 } };
    } else {
      const authHeader = req.headers.get("Authorization");
      const userToken = authHeader?.replace("Bearer ", "");
      if (!userToken) throw new Error("No session token");
      const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(userToken);
      if (authError || !authUser) throw new Error("Unauthorized access.");
      user = authUser;
    }

    const credits = user.user_metadata?.credits ?? 0;
    if (credits <= 0) return new Response(JSON.stringify({ error: "Sin créditos" }), { status: 402, headers: corsHeaders });

    const cat = CATEGORIES[categoria_producto] || categoria_producto || "jewelry";
    const mat = MATERIALS[material] || material || "gold";
    
    let imagePart = null;
    if (imagen_subida_url) {
      try {
        const imgRes = await fetch(imagen_subida_url);
        if (imgRes.ok) {
          const buf = await imgRes.arrayBuffer();
          imagePart = { inlineData: { mimeType: "image/jpeg", data: encode(new Uint8Array(buf)) } };
        }
      } catch (e) { console.error("Reference image load fail:", e); }
    }

    let baseContext = `Fine jewelry render of a ${cat} in ${mat}. ${gema_principal ? `Gem: ${gema_principal}.` : ""} ${sugerencias || ""}. ${NO_TEXT_RULE}`;
    if (is_redesign && imagePart) {
        baseContext = `Modify the ${cat} in the attached image using these instructions: ${sugerencias}. Keep the ${mat} material. ${NO_TEXT_RULE}`;
    }

    console.log("Generating views...");
    const [frontB64, backB64, sideB64] = await Promise.all([
      generateView(`${baseContext}\nFront View.`, imagePart, apiKey),
      generateView(`${baseContext}\nBack View.`, imagePart, apiKey),
      generateView(`${baseContext}\nSide View.`, imagePart, apiKey),
    ]);

    if (!frontB64) throw new Error("Gemini failed to generate design.");

    async function saveImage(b64: string | null, label: string) {
      if (!b64) return null;
      const fname = `diseno_${Date.now()}_${label}.png`;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      await supabaseAdmin.storage.from("disenos").upload(fname, bytes, { contentType: "image/png" });
      return supabaseAdmin.storage.from("disenos").getPublicUrl(fname).data.publicUrl;
    }

    const [imagenFrontal, imagenTrasera, imagenLateral] = await Promise.all([
      saveImage(frontB64, "front"),
      saveImage(backB64, "back"),
      saveImage(sideB64, "side"),
    ]);

    // Insert into database with strictly filtered payload
    const insertPayload: any = {};
    
    if (body.nombre !== undefined) insertPayload.nombre = body.nombre;
    if (body.telefono !== undefined) insertPayload.telefono = body.telefono;
    if (body.email !== undefined) insertPayload.email = body.email;
    if (body.categoria_producto !== undefined) insertPayload.categoria_producto = body.categoria_producto;
    if (body.material !== undefined) insertPayload.material = body.material;
    if (body.perfil_usuario !== undefined) insertPayload.perfil_usuario = body.perfil_usuario;
    if (body.gema_principal !== undefined) insertPayload.gema_principal = body.gema_principal;
    if (body.estilo !== undefined) insertPayload.estilo = body.estilo;
    
    if (body.presupuesto !== undefined) {
      insertPayload.presupuesto = body.presupuesto ? String(body.presupuesto) : null;
    }
    if (body.peso_estimado !== undefined) {
      insertPayload.peso_estimado = body.peso_estimado ? String(body.peso_estimado) : null;
    }
    
    if (body.talla_medida !== undefined) insertPayload.talla_medida = body.talla_medida;
    if (body.sugerencias !== undefined) insertPayload.sugerencias = body.sugerencias;
    
    // Handle both input image fields and map to the DB's imagen_subida_url
    if (body.imagen_subida_url !== undefined) {
      insertPayload.imagen_subida_url = body.imagen_subida_url;
    } else if (body.imagen_referencia_url !== undefined) {
      insertPayload.imagen_subida_url = body.imagen_referencia_url;
    }
    
    insertPayload.imagen_generada_url = imagenFrontal;
    insertPayload.prompt_usado = baseContext;
    insertPayload.marca_temporal = new Date().toISOString();

    console.log("DB Insert Payload:", JSON.stringify(insertPayload));

    const { data: insertedData, error: dbError } = await supabaseAdmin
      .from("solicitudes_disenos_romet")
      .insert(insertPayload)
      .select()
      .single();

    if (dbError) {
      console.error("DB Insert Error details:", JSON.stringify(dbError));
      throw new Error(`Database insert failed: ${dbError.message} (${dbError.code})`);
    }
    
    console.log("DB Insert Success, inserted ID:", insertedData?.id);

    // Trigger email — direct HTTP call to bypass JWT verification issue with invoke()
    if (insertedData && email && !is_redesign) {
      try {
        const emailPayload = {
          type: (insertPayload.imagen_subida_url) ? "Sube tu Diseño" : "Diseño Guiado",
          to: email,
          customerName: nombre || "Cliente",
          customerPhone: body.telefono || "",
          orderId: insertedData.id,
          categoria: CATEGORY_LABELS[categoria_producto] || categoria_producto || "",
          material: MATERIAL_LABELS[material] || material || "",
          sugerencias: sugerencias || "",
          imagenSubidaUrl: insertPayload.imagen_subida_url || null,
          imagenFrontal: imagenFrontal || null,
          imagenTrasera: imagenTrasera || null,
          imagenLateral: imagenLateral || null,
        };
        
        console.log("Triggering send-email with payload...");
        const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SUPABASE_KEY}`,
          },
          body: JSON.stringify(emailPayload),
        });
        const emailBody = await emailRes.text();
        console.log("Email HTTP result:", emailRes.status, emailBody.substring(0, 200));
      } catch(e) {
        console.error("Email HTTP exception:", e);
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      imagenUrl: imagenFrontal, 
      imagenFrontal, imagenTrasera, imagenLateral 
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err: any) {
    console.error("v56 ERROR:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
        status: 500, headers: corsHeaders 
    });
  }
});
