// ═══════════════════════════════════════════════════════════
// ROMET JOYERIA - Supabase Configuration (Shared Module) - v3.1.2
// ═══════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://ktysptwemewbyanagdwu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt0eXNwdHdlbWV3YnlhbmFnZHd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NDgwNTcsImV4cCI6MjA5MTIyNDA1N30.TMngS67DASOUD1s6VH8MZa_XDEwMEIG1VSowkc8yx0E';

let _supabaseClient = null;

function getSupabase() {
	if (!_supabaseClient) {
		const supabaseLib = window.supabase;
		if (!supabaseLib) {
			throw new Error('Supabase SDK no cargado aún');
		}
		const { createClient } = supabaseLib;
		_supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
	}
	return _supabaseClient;
}

async function ensureSupabaseReady() {
	return new Promise((resolve) => {
		function check() {
			if (typeof window.supabase !== 'undefined') {
				if (!_supabaseClient) {
					const { createClient } = window.supabase;
					_supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
				}
				resolve();
			} else {
				setTimeout(check, 100);
			}
		}
		check();
	});
}

async function initWhenReady(callback) {
	try {
		await ensureSupabaseReady();
		
		// Security Guard: Bloqueo de acceso global
		const session = await getSession();
		const authorizedEmail = 'flozros@gmail.com';
		const isLoginPage = window.location.pathname.includes('login.html');
		
		if (!isLoginPage && (!session || (session.user.email !== authorizedEmail && session.user.user_metadata?.approved !== true))) {
			console.log('Acceso restringido. Redirigiendo a pantalla de bloqueo...');
			document.body.innerHTML = `
				<div style="height:100vh; width:100vw; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#000; color:#fff; font-family:'Cormorant Garamond', serif; text-align:center; padding:20px;">
					<img src="./logo-romet.png" style="height:80px; margin-bottom:30px; filter:brightness(0) invert(1);">
					<h1 style="font-size:2rem; letter-spacing:0.2em; text-transform:uppercase; margin-bottom:15px;">Sitio en Mantenimiento</h1>
					<p style="font-family:sans-serif; color:#888; max-width:400px; line-height:1.6; font-size:0.9rem;">
						Estamos realizando mejoras de seguridad en Romet Joyería.
						El acceso al catálogo y al diseñador estará disponible próximamente.
					</p>
					<a href="./login.html" style="margin-top:30px; color:#fff; text-transform:uppercase; font-size:0.7rem; letter-spacing:0.1em; text-decoration:none; border:1px solid #333; padding:10px 20px;">Acceso Administrador</a>
				</div>
			`;
			document.body.style.overflow = 'hidden';
			return; // Detener ejecución
		}

		if (callback) callback();
	} catch (e) {
		console.error('Error inicializando Supabase:', e);
	}
}

async function getSession() {
	await ensureSupabaseReady();
	const sb = getSupabase();
	const { data: { session } } = await sb.auth.getSession();
	return session;
}

async function getUser() {
	const session = await getSession();
	return session?.user || null;
}

async function requireAuth(redirectTo = './login.html') {
	const session = await getSession();
	if (!session) {
		window.location.href = redirectTo;
		return null;
	}
	return session;
}

async function signOut() {
	const sb = getSupabase();
	await sb.auth.signOut();
	window.location.href = './index.html';
}

async function getCredits() {
	const sb = getSupabase();
	const { data: { user } } = await sb.auth.getUser();
	if (!user) return 0;
	
	let credits = user.user_metadata?.credits;
	if (credits === undefined) {
		credits = 10;
		await sb.auth.updateUser({ data: { credits: 10 } });
	}
	return credits;
}

async function consumeCredit() {
	const session = await getSession();
	if (!session) return false;
	let credits = await getCredits();
	if (credits <= 0) return false;
	
	credits -= 1;
	const sb = getSupabase();
	await sb.auth.updateUser({ data: { credits: credits } });
	
	const displays = document.querySelectorAll('#credit-count-display, #credit-count-header');
	displays.forEach(d => d.textContent = credits);
	
	return true;
}

async function initHeaderAuth() {
	try {
		// Inyectar estilos responsivos premium para el header de Romet
		if (!document.getElementById('romet-header-responsive-styles')) {
			const style = document.createElement('style');
			style.id = 'romet-header-responsive-styles';
			style.textContent = `
				@media (max-width: 640px) {
					header {
						padding: 10px 12px !important;
						gap: 6px !important;
					}
					header a[href*="rometjoyeria.com"] {
						gap: 8px !important;
					}
					header a img {
						height: 28px !important;
						margin-right: 4px !important;
					}
					header nav {
						width: 100% !important;
						justify-content: space-between !important;
						gap: 6px !important;
					}
					#header-auth-container {
						gap: 10px !important;
					}
					#header-credits-badge {
						padding: 4px 8px !important;
						gap: 4px !important;
						font-size: 0.78rem !important;
					}
					#header-credits-badge .credits-label {
						display: none !important;
					}
					#header-credits-badge .credits-plus {
						display: none !important;
					}
					#user-menu-btn {
						font-size: 0.7rem !important;
						max-width: 70px !important;
						overflow: hidden !important;
						text-overflow: ellipsis !important;
						white-space: nowrap !important;
						gap: 3px !important;
					}
					header nav > a {
						font-size: 0.7rem !important;
						letter-spacing: 0.06em !important;
					}
					header nav .border-l {
						padding-left: 6px !important;
						margin-left: 0px !important;
						gap: 3px !important;
					}
					header nav .border-l a {
						font-size: 0.7rem !important;
					}
				}
				@media (max-width: 375px) {
					#user-menu-btn {
						max-width: 50px !important;
					}
					header nav > a {
						font-size: 0.65rem !important;
					}
				}
			`;
			document.head.appendChild(style);
		}

		const session = await getSession();
		const authLink = document.getElementById('header-auth-link');
		if (!authLink) return;

		if (session) {
			const name = session.user.user_metadata?.first_name
				|| session.user.user_metadata?.full_name
				|| session.user.email.split('@')[0];
			
			const credits = await getCredits();

			const container = document.createElement('div');
			container.id = 'header-auth-container';
			container.style.cssText = 'position:relative; display:flex; align-items:center; gap:24px;';
			container.innerHTML = `
				<div id="header-credits-badge" onclick="alert('La compra de créditos estará disponible muy pronto')" style="background:linear-gradient(135deg, hsl(45 95% 95%) 0%, hsl(45 90% 88%) 100%); border:1px solid hsl(45 70% 60%); color:hsl(45 100% 15%); padding:6px 14px; border-radius:100px; display:flex; align-items:center; gap:10px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size:0.9rem; font-weight:800; box-shadow:0 4px 12px rgba(212,175,55,0.15); cursor:pointer; transition:all 0.3s cubic-bezier(0.4, 0, 0.2, 1); user-select:none;" onmouseover="this.style.transform='translateY(-1px) scale(1.02)'; this.style.boxShadow='0 6px 15px rgba(212,175,55,0.25)'" onmouseout="this.style.transform='none'; this.style.boxShadow='0 4px 12px rgba(212,175,55,0.15)'" title="Tus créditos - Haz clic para añadir más">
					<div style="display:flex; align-items:center; gap:6px;">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>
						<span id="credit-count-header" style="font-feature-settings: 'tnum' 1; min-width: 1.5ch; text-align: center;">${credits}</span>
					</div>
					<span class="credits-label" style="font-size:0.65rem; text-transform:uppercase; letter-spacing:0.08em; opacity:0.9; font-weight:700; border-left:1px solid rgba(0,0,0,0.1); padding-left:10px; margin-left:2px;">Créditos</span>
					<div class="credits-plus" style="background:white; color:hsl(45 100% 20%); width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:14px; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">+</div>
				</div>

				<div style="position:relative;">
					<button id="user-menu-btn" class="text-sm md:text-base tracking-[0.15em] uppercase text-foreground hover:text-muted-foreground transition-colors font-medium flex items-center gap-2" style="background:none; border:none; cursor:pointer;">
						${name} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
					</button>
					<div id="user-dropdown" style="display:none; position:absolute; right:0; top:100%; margin-top:12px; width:220px; background:white; border:1px solid hsl(0 0% 90%); box-shadow:0 15px 35px rgba(0,0,0,0.12); z-index:100; text-align:left; border-radius:8px; overflow:hidden;">
						<div style="padding:18px; border-bottom:1px solid hsl(0 0% 92%); background:hsl(0 0% 99%);">
							 <div style="font-size:0.65rem; color:hsl(0 0% 50%); padding-bottom:8px; letter-spacing:0.12em; text-transform:uppercase; font-family: ui-sans-serif, system-ui, sans-serif; font-weight:700;">Estado de Cuenta</div>
							 <div style="display:flex; align-items:center; justify-content:space-between;">
								 <span style="font-size:0.9rem; color:hsl(0 0% 30%); font-family:ui-sans-serif, system-ui, sans-serif;">Créditos</span>
								 <span id="credit-count-display" style="font-size:1.3rem; font-weight:700; color:hsl(0 0% 10%);">${credits}</span>
							 </div>
						</div>
						<a href="javascript:void(0)" onclick="alert('La compra de créditos estará disponible muy pronto')" style="display:block; padding:14px 18px; color:hsl(0 0% 20%); text-decoration:none; font-size:0.75rem; font-family: ui-sans-serif, system-ui, sans-serif; letter-spacing:0.08em; text-transform:uppercase; border-bottom:1px solid hsl(0 0% 95%); transition:background 0.2s;" onmouseover="this.style.background='hsl(0 0% 97%)'" onmouseout="this.style.background='transparent'">
							 <span style="display:flex; align-items:center; gap:10px;">
							 	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
							 	Recargar Créditos
							 </span>
						</a>
						<a href="#" id="logout-btn" style="display:block; padding:14px 18px; color:#c53030; text-decoration:none; font-size:0.75rem; font-family: ui-sans-serif, system-ui, sans-serif; letter-spacing:0.08em; text-transform:uppercase; transition:background 0.2s;" onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='transparent'">
							 <span style="display:flex; align-items:center; gap:10px;">
							 	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>
							 	Cerrar Sesión
							 </span>
						</a>
					</div>
				</div>
			`;
			
			const nav = authLink.parentElement;
			nav.replaceChild(container, authLink);
			
			// Si existía un saludo antiguo 'Hola, Francisco', lo eliminamos
			const existingGreeting = nav.querySelector('.user-greeting');
			if (existingGreeting) existingGreeting.remove();
			
			const btn = container.querySelector('#user-menu-btn');
			const dropdown = container.querySelector('#user-dropdown');
			const logoutBtn = container.querySelector('#logout-btn');
			
			btn.onclick = (e) => {
				e.preventDefault();
				dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
			};
			
			document.addEventListener('click', (e) => {
				if(!container.contains(e.target)) dropdown.style.display = 'none';
			});
			
			logoutBtn.onclick = async (e) => {
				e.preventDefault();
				await signOut();
			};
		}
	} catch(e) {
		console.warn('initHeaderAuth error:', e);
	}
}

// ═══════════════════════════════════════
// Llamada directa a Edge Function sin SDK
// ═══════════════════════════════════════
async function callEdgeFunction(functionName, payload) {
	const session = await getSession();
	// Si el usuario está conectado, usamos su token personal (JWT) hiperseguro.
	// Si no, recaemos en anon_key (lo cual debería fallar en el servidor por seguridad).
	const authHeader = session ? `Bearer ${session.access_token}` : `Bearer ${SUPABASE_ANON_KEY}`;

	const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'apikey': SUPABASE_ANON_KEY,
			'Authorization': authHeader,
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Edge function error (${response.status}): ${errorText}`);
	}

	return response.json();
}

async function saveDesignOrder(designData) {
	await ensureSupabaseReady();
	const sb = getSupabase();

	const record = {
		nombre: designData.customer_name || null,
		telefono: designData.customer_phone || null,
		email: designData.customer_email || null,
		categoria_producto: designData.category || null,
		material: designData.material || null,
		perfil_usuario: designData.profile || null,
		gema_principal: designData.gemstone || null,
		estilo: designData.style || null,
		presupuesto: designData.budget ? String(designData.budget) : null,
		peso_estimado: designData.weight ? String(designData.weight) : null,
		talla_medida: designData.size || null,
		sugerencias: designData.notes || null,
		imagen_generada_url: designData.image_url || null,
		marca_temporal: new Date().toISOString(),
	};

	const { data, error } = await sb
		.from('solicitudes_disenos_romet')
		.insert(record)
		.select()
		.single();

	if (error) throw error;
	return data;
}

async function uploadImage(file, bucket = 'disenos') {
	await ensureSupabaseReady();
	const sb = getSupabase();
	const ext = file.name.split('.').pop();
	const fileName = `upload_${Date.now()}.${ext}`;

	const { data, error } = await sb.storage
		.from(bucket)
		.upload(fileName, file, {
			cacheControl: '3600',
			upsert: false,
		});

	if (error) throw error;

	const { data: urlData } = sb.storage
		.from(bucket)
		.getPublicUrl(data.path);

	return urlData.publicUrl;
}

// ═══════════════════════════════════════
// Inicialización con reintento automático
// ═══════════════════════════════════════
async function initWhenReady(callback) {
	try {
		await ensureSupabaseReady();
		if (callback) callback();
	} catch (e) {
		console.error('Error inicializando Supabase:', e);
		if (callback) callback();
	}
}

window.showOutOfCreditsModal = function() {
	const overlay = document.createElement('div');
	overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:10000; backdrop-filter:blur(4px); animation:fadeIn 0.3s;';
	
	const modal = document.createElement('div');
	modal.style.cssText = 'background:hsl(0 0% 98%); padding:40px; border-radius:16px; max-width:400px; text-align:center; box-shadow:0 25px 50px rgba(0,0,0,0.15); border:1px solid hsl(0 0% 85%); position:relative;';
	
	modal.innerHTML = `
		<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e53e3e" stroke-width="2" style="margin:0 auto 16px;">
			<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>
		</svg>
		<h2 style="font-family:'Cormorant Garamond', serif; font-size:2rem; font-weight:600; margin-bottom:12px; color:hsl(0 0% 15%); text-transform:uppercase; letter-spacing:0.1em;">Sin Créditos</h2>
		<p style="font-family: ui-sans-serif, system-ui, sans-serif; color:hsl(0 0% 40%); margin-bottom:24px; font-size:0.95rem; line-height:1.5;">
			Has agotado todas tus generaciones de diseño. Adquiere más créditos para seguir creando magia joyera.
		</p>
		<button onclick="alert('La pasarela de pago estará disponible muy pronto.'); this.closest('div').parentElement.remove()" style="background:hsl(0 0% 0%); color:white; border:none; padding:14px 24px; width:100%; text-transform:uppercase; font-family:ui-sans-serif, system-ui, sans-serif; letter-spacing:0.15em; font-size:0.85rem; font-weight:500; cursor:pointer; margin-bottom:12px; transition:all 0.3s;" onmouseover="this.style.background='hsl(0 0% 20%)'" onmouseout="this.style.background='hsl(0 0% 0%)'">
			Comprar Créditos
		</button>
		<button onclick="this.closest('div').parentElement.remove()" style="background:transparent; color:hsl(0 0% 40%); border:1px solid hsl(0 0% 80%); padding:12px 24px; width:100%; text-transform:uppercase; font-family:ui-sans-serif, system-ui, sans-serif; letter-spacing:0.15em; font-size:0.85rem; font-weight:500; cursor:pointer; transition:all 0.3s;" onmouseover="this.style.background='hsl(0 0% 95%)'; this.style.color='hsl(0 0% 15%)'" onmouseout="this.style.background='transparent'; this.style.color='hsl(0 0% 40%)'">
			Cancelar
		</button>
	`;
	
	overlay.appendChild(modal);
	document.body.appendChild(overlay);
};

window.addEventListener('load', () => initWhenReady(null));
